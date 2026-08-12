import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { app, BrowserWindow, protocol } from 'electron';

import { AbortError, RpcError, ValidationError } from 'electron-ipc-socket';
import { createMainSession } from 'electron-ipc-socket/main';

import { validation } from './contract.ts';

const fixtureDirectory = process.env.ELECTRON_IPC_SOCKET_FIXTURE_DIR;
assert.ok(fixtureDirectory, 'fixture directory is required');
const pagePath = join(fixtureDirectory, 'index.html');
const rendererPath = join(fixtureDirectory, 'renderer.js');
const pageUrl = 'fixture://app/index.html';
const preloadPath = join(fixtureDirectory, 'preload.cjs');

protocol.registerSchemesAsPrivileged([
    {
        privileges: {
            secure: true,
            standard: true,
            supportFetchAPI: true,
        },
        scheme: 'fixture',
    },
]);

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, reject, resolve };
}

function withTimeout(promise, label, milliseconds = 10_000) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timer = setTimeout(
                () => reject(new Error(`${label} timed out`)),
                milliseconds,
            );
        }),
    ]).finally(() => clearTimeout(timer));
}

try {
    await withTimeout(app.whenReady(), 'Electron app readiness', 5_000);
} catch (error) {
    process.stderr.write(
        `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    app.exit(1);
    throw error;
}

protocol.handle('fixture', async (request) => {
    const url = new URL(request.url);
    const asset =
        url.host === 'app' && url.pathname === '/index.html'
            ? { path: pagePath, type: 'text/html; charset=utf-8' }
            : url.host === 'app' && url.pathname === '/renderer.js'
              ? { path: rendererPath, type: 'text/javascript; charset=utf-8' }
              : undefined;
    if (!asset) {
        return new Response('Not found', { status: 404 });
    }

    return new Response(new Uint8Array(await readFile(asset.path)), {
        headers: { 'content-type': asset.type },
    });
});

const window = new BrowserWindow({
    height: 320,
    show: false,
    webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: preloadPath,
        sandbox: true,
    },
    width: 480,
});
window.webContents.on('console-message', (_event, details) => {
    process.stderr.write(`[renderer] ${details.message}\n`);
});
window.webContents.on('preload-error', (_event, preload, error) => {
    process.stderr.write(
        `[preload ${preload}] ${error.stack ?? error.message}\n`,
    );
});
window.webContents.on('render-process-gone', (_event, details) => {
    process.stderr.write(`[renderer gone] ${JSON.stringify(details)}\n`);
});

let expectedRun = 1;
let ready = deferred();
let report = deferred();
let authorized = 0;
let unauthorized = 0;
const cancellationRuns = new Set();
const errors = [];
const states = [];
const rendererEventCounts = new Map();

const session = createMainSession({
    authorize(context) {
        const allowed =
            context.url === pageUrl && context.origin === 'fixture://app';
        if (allowed) {
            authorized++;
        } else {
            unauthorized++;
        }
        return allowed;
    },
    channel: 'fixture',
    defaultTimeout: 2_000,
    validation,
    webContents: window.webContents,
});

const require = createRequire(join(process.cwd(), 'package.json'));
const commonJsRoot = require('electron-ipc-socket');
const commonJsMain = require('electron-ipc-socket/main');
assert.ok(
    new commonJsRoot.RpcError('ERR_CJS', 'commonjs') instanceof RpcError,
    'public error identity must survive mixed module loading',
);
assert.throws(
    () =>
        commonJsMain.createMainSession({
            authorize: () => true,
            channel: 'fixture',
            validation,
            webContents: window.webContents,
        }),
    /already exists/,
    'mixed module loading must share main-session channel ownership',
);

session.onError((error) => errors.push(error));
session.onStateChange((state) => states.push(state.connected));
session.handle('fixture:add', ({ left, right }) => left + right);
session.handle('fixture:fail', () => {
    throw new RpcError('ERR_FIXTURE', 'fixture failure');
});
session.handle('fixture:cancel', ({ run }, context) => {
    return new Promise((resolve) => {
        context.signal.addEventListener(
            'abort',
            () => {
                cancellationRuns.add(run);
                resolve();
            },
            { once: true },
        );
    });
});
session.handle('fixture:cancel-seen', ({ run }) => cancellationRuns.has(run));
session.handle('fixture:validate', ({ value }) => value);
session.handle('fixture:ready', ({ run }) => {
    assert.equal(run, expectedRun);
    let unsubscribe = () => undefined;
    unsubscribe = session.on('fixture:renderer-event', (payload) => {
        if (payload.run === run) {
            rendererEventCounts.set(
                run,
                (rendererEventCounts.get(run) ?? 0) + 1,
            );
            unsubscribe();
        }
    });
    ready.resolve();
});
session.handle('fixture:report', (value) => {
    assert.equal(value.run, expectedRun);
    report.resolve(value);
});

async function runMainChecks(run) {
    await withTimeout(ready.promise, `renderer ready ${run}`);
    assert.equal(session.isConnected, true);
    assert.equal(
        await session.invoke('fixture:uppercase', `run-${run}`),
        `RUN-${run}`,
    );

    session.send('fixture:main-event', { run });
    session.send('fixture:main-event', { run });
    session.send('fixture:invalid-event', { run: 'invalid' });

    await assert.rejects(
        session.invoke('fixture:invalid-result'),
        (error) =>
            error instanceof ValidationError &&
            error.code === 'ERR_IPC_VALIDATION' &&
            error.target === 'result',
    );

    const controller = new AbortController();
    const invocation = session.invoke(
        'fixture:cancel-renderer',
        { run },
        { signal: controller.signal },
    );
    setTimeout(() => controller.abort(), 10);
    await assert.rejects(invocation, AbortError);

    const rendererReport = await withTimeout(
        report.promise,
        `renderer report ${run}`,
    );
    assert.equal(rendererReport.ok, true, JSON.stringify(rendererReport));
    assert.equal(rendererReport.addResult, run + 40);
    assert.equal(rendererReport.cancellationObserved, true);
    assert.equal(rendererReport.errorCode, 'ERR_FIXTURE');
    assert.equal(rendererReport.eventCount, 1);
    assert.equal(rendererReport.invalidEventCount, 0);
    assert.equal(rendererReport.invalidRequestCode, 'ERR_IPC_VALIDATION');
    assert.equal(rendererReport.validatedValue, 'validated');
    assert.ok(rendererReport.validationErrorCount >= 1);
    assert.equal(rendererEventCounts.get(run), 1);
}

let exitCode = 0;
try {
    await window.loadURL(pageUrl);
    await runMainChecks(1);

    expectedRun = 2;
    ready = deferred();
    report = deferred();
    const disconnected = new Promise((resolve) => {
        const unsubscribe = session.onStateChange((state) => {
            if (!state.connected) {
                unsubscribe();
                resolve();
            }
        });
    });
    window.webContents.reload();
    await withTimeout(disconnected, 'reload disconnect');
    await withTimeout(session.ready, 'reload reconnect');
    await runMainChecks(2);

    const foreignWindow = new BrowserWindow({
        show: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: preloadPath,
            sandbox: true,
        },
    });
    await foreignWindow.loadURL(
        "data:text/html,<meta http-equiv='Content-Security-Policy' content=\"default-src 'none'\">",
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    foreignWindow.destroy();
    assert.ok(
        errors.some((error) => /invalid frame/.test(error.message)),
        'foreign WebContents handshake was not rejected',
    );

    const finalDisconnect = new Promise((resolve) => {
        const unsubscribe = session.onStateChange((state) => {
            if (!state.connected) {
                unsubscribe();
                resolve();
            }
        });
    });
    await window.loadURL(
        "data:text/html,<meta http-equiv='Content-Security-Policy' content=\"default-src 'none'\">",
    );
    await withTimeout(finalDisconnect, 'unauthorized navigation disconnect');
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(session.isConnected, false);
    assert.ok(unauthorized >= 1, 'unauthorized navigation was not rejected');
    assert.ok(authorized >= 2, 'authorized reload did not reconnect');
    assert.deepEqual(states.slice(0, 5), [false, true, false, true, false]);

    process.stdout.write(
        `${JSON.stringify({ authorized, states, unauthorized, version: process.versions.electron })}\n`,
    );
} catch (error) {
    exitCode = 1;
    process.stderr.write(
        `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
} finally {
    session.dispose();
    if (!window.isDestroyed()) {
        window.destroy();
    }
    app.exit(exitCode);
}
