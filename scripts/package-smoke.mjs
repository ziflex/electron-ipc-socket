import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

function run(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            ...options,
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
            stdout += chunk;
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk;
        });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) {
                resolve(stdout);
            } else {
                reject(
                    new Error(
                        `${command} ${args.join(' ')} failed (${code})\n${stderr}`,
                    ),
                );
            }
        });
    });
}

const root = new URL('..', import.meta.url);
const rootPath = fileURLToPath(root);
const temporary = await mkdtemp(join(tmpdir(), 'electron-ipc-socket-pack-'));
const npmEnvironment = {
    ...process.env,
    npm_config_cache: join(temporary, 'npm-cache'),
};

try {
    const packOutput = await run(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['pack', '--json', '--pack-destination', temporary],
        { cwd: root, env: npmEnvironment },
    );
    const [packed] = JSON.parse(packOutput);
    assert.ok(packed?.filename);
    const paths = new Set(packed.files.map((file) => file.path));
    for (const format of ['esm', 'cjs']) {
        for (const entry of ['index', 'main', 'preload', 'renderer']) {
            assert.ok(
                paths.has(`dist/${format}/${entry}.js`),
                `tarball is missing dist/${format}/${entry}.js`,
            );
            assert.ok(
                paths.has(`dist/${format}/${entry}.d.ts`),
                `tarball is missing dist/${format}/${entry}.d.ts`,
            );
        }
    }
    for (const required of [
        'dist/cjs/package.json',
        'README.md',
        'CHANGELOG.md',
        'LICENSE',
        'package.json',
    ]) {
        assert.ok(paths.has(required), `tarball is missing ${required}`);
    }
    assert.equal(
        [...paths].some((path) =>
            /^(src|test|scripts|docs|\.github)\//.test(path),
        ),
        false,
        'tarball contains development sources',
    );

    await writeFile(
        join(temporary, 'package.json'),
        JSON.stringify({ private: true, type: 'module' }),
    );
    await run(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        [
            'install',
            '--ignore-scripts',
            '--legacy-peer-deps',
            join(temporary, packed.filename),
        ],
        { cwd: temporary, env: npmEnvironment },
    );

    await writeFile(
        join(temporary, 'consumer.mjs'),
        [
            "import assert from 'node:assert/strict';",
            "import { createRequire } from 'node:module';",
            "import * as esm from 'electron-ipc-socket';",
            "import * as renderer from 'electron-ipc-socket/renderer';",
            'const require = createRequire(import.meta.url);',
            "const cjs = require('electron-ipc-socket');",
            "const cjsRenderer = require('electron-ipc-socket/renderer');",
            "assert.equal(typeof esm.RemoteError, 'function');",
            "assert.equal(typeof esm.defineContractValidation, 'function');",
            "assert.equal(typeof renderer.createRendererSession, 'function');",
            "assert.equal(typeof cjsRenderer.createRendererSession, 'function');",
            "assert.ok(new cjs.RpcError('ERR_TEST', 'test') instanceof esm.RpcError);",
            "assert.ok(new cjs.ValidationError('event', 'test', []) instanceof esm.ValidationError);",
            "assert.ok(new cjs.ValidationError('event', 'test', []) instanceof esm.RpcError);",
            "assert.ok(new esm.RemoteError('Error', 'test') instanceof cjs.RemoteError);",
            'assert.ok(new esm.TimeoutError(1) instanceof cjs.TimeoutError);',
            'assert.ok(new esm.TimeoutError(1) instanceof cjs.IpcError);',
            "for (const path of ['electron-ipc-socket', 'electron-ipc-socket/main', 'electron-ipc-socket/preload', 'electron-ipc-socket/renderer']) {",
            '    assert.match(import.meta.resolve(path), /dist\\/esm\\/.+\\.js$/);',
            '    assert.match(require.resolve(path), /dist\\/cjs\\/.+\\.js$/);',
            '}',
        ].join('\n'),
    );

    await writeFile(
        join(temporary, 'consumer.mts'),
        [
            "import type { Procedure, StandardSchemaV1 } from 'electron-ipc-socket';",
            "import type { RendererSession } from 'electron-ipc-socket/renderer';",
            'type Contract = { main: { requests: { ping: Procedure<void, string> }; events: {} }; renderer: { requests: {}; events: {} } };',
            'declare const session: RendererSession<Contract>;',
            'declare const schema: StandardSchemaV1<unknown, string>;',
            "const result: Promise<string> = session.invoke('ping');",
            'void result;',
            'void schema;',
        ].join('\n'),
    );
    await writeFile(
        join(temporary, 'consumer.cts'),
        [
            "import type { Procedure, StandardSchemaV1 } from 'electron-ipc-socket';",
            "import type { RendererSession } from 'electron-ipc-socket/renderer';",
            'type Contract = { main: { requests: { ping: Procedure<void, string> }; events: {} }; renderer: { requests: {}; events: {} } };',
            'declare const session: RendererSession<Contract>;',
            'declare const schema: StandardSchemaV1<unknown, string>;',
            "const result: Promise<string> = session.invoke('ping');",
            'void result;',
            'void schema;',
        ].join('\n'),
    );
    await writeFile(
        join(temporary, 'tsconfig.json'),
        JSON.stringify({
            compilerOptions: {
                module: 'NodeNext',
                moduleResolution: 'NodeNext',
                noEmit: true,
                strict: true,
                target: 'ES2022',
            },
            files: ['consumer.mts', 'consumer.cts'],
        }),
    );

    const commandEnvironment = {
        ...npmEnvironment,
        PATH: `${join(rootPath, 'node_modules', '.bin')}${delimiter}${process.env.PATH ?? ''}`,
    };
    await run(process.execPath, [join(temporary, 'consumer.mjs')], {
        cwd: temporary,
        env: commandEnvironment,
    });
    await build({
        bundle: true,
        entryPoints: [join(temporary, 'consumer.mjs')],
        format: 'esm',
        outfile: join(temporary, 'consumer-bundled.mjs'),
        platform: 'node',
        target: 'node22',
    });
    await run(process.execPath, [join(temporary, 'consumer-bundled.mjs')], {
        cwd: temporary,
        env: commandEnvironment,
    });
    await run(
        process.platform === 'win32' ? 'tsc.cmd' : 'tsc',
        ['-p', join(temporary, 'tsconfig.json')],
        { cwd: temporary, env: commandEnvironment },
    );

    const manifest = JSON.parse(
        await readFile(
            join(temporary, 'node_modules/electron-ipc-socket/package.json'),
        ),
    );
    assert.equal(manifest.version, '4.0.0');
    assert.equal(manifest.type, 'module');
    assert.equal(manifest.main, './dist/cjs/index.js');
    assert.equal(manifest.module, './dist/esm/index.js');
    assert.equal(manifest.dependencies, undefined);
} finally {
    await rm(temporary, { force: true, recursive: true });
}
