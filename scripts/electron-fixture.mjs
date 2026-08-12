import { spawn } from 'node:child_process';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import electronPath from 'electron';
import { build } from 'esbuild';

const root = new URL('..', import.meta.url);
const fixtureSource = new URL('../test/electron/', import.meta.url);
const temporary = await mkdtemp(join(tmpdir(), 'electron-ipc-socket-fixture-'));

function runElectron() {
    return new Promise((resolve, reject) => {
        const child = spawn(electronPath, [temporary], {
            cwd: root,
            env: {
                ...process.env,
                ELECTRON_IPC_SOCKET_FIXTURE_DIR: temporary,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
            child.kill('SIGTERM');
            reject(
                new Error(`Electron fixture timed out\n${stdout}\n${stderr}`),
            );
        }, 30_000);
        child.stdout.on('data', (chunk) => {
            stdout += chunk;
            process.stdout.write(chunk);
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk;
            process.stderr.write(chunk);
        });
        child.on('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0) {
                resolve();
            } else {
                reject(
                    new Error(
                        `Electron fixture exited with code ${code}\n${stdout}\n${stderr}`,
                    ),
                );
            }
        });
    });
}

try {
    await Promise.all([
        build({
            bundle: true,
            entryPoints: [new URL('preload.cts', fixtureSource).pathname],
            external: ['electron'],
            format: 'cjs',
            outfile: join(temporary, 'preload.cjs'),
            platform: 'node',
            target: 'node22',
        }),
        build({
            bundle: true,
            entryPoints: [new URL('renderer.ts', fixtureSource).pathname],
            format: 'iife',
            outfile: join(temporary, 'renderer.js'),
            platform: 'browser',
            target: 'chrome140',
        }),
        build({
            bundle: true,
            entryPoints: [new URL('main.mjs', fixtureSource).pathname],
            external: ['electron'],
            format: 'esm',
            outfile: join(temporary, 'main.mjs'),
            platform: 'node',
            target: 'node22',
        }),
        cp(new URL('index.html', fixtureSource), join(temporary, 'index.html')),
        writeFile(
            join(temporary, 'package.json'),
            JSON.stringify({ main: 'main.mjs', private: true, type: 'module' }),
        ),
    ]);
    await runElectron();
} finally {
    await rm(temporary, { force: true, recursive: true });
}
