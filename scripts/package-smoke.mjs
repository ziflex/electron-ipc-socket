import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { spawn } from 'node:child_process';

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
    for (const required of [
        'dist/index.js',
        'dist/index.d.ts',
        'dist/main.js',
        'dist/preload.js',
        'dist/renderer.js',
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

    const consumer = join(temporary, 'consumer.mjs');
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
        consumer,
        [
            "import assert from 'node:assert/strict';",
            "import * as root from 'electron-ipc-socket';",
            "assert.equal(typeof root.RemoteError, 'function');",
            "for (const path of ['electron-ipc-socket/main', 'electron-ipc-socket/preload', 'electron-ipc-socket/renderer']) {",
            '    assert.match(import.meta.resolve(path), /dist\\/(main|preload|renderer)\\.js$/);',
            '}',
        ].join('\n'),
    );
    await run(process.execPath, [consumer], {
        cwd: temporary,
        env: {
            ...npmEnvironment,
            PATH: `${join(temporary, 'node_modules', '.bin')}${delimiter}${process.env.PATH ?? ''}`,
        },
    });

    const manifest = JSON.parse(
        await readFile(
            join(temporary, 'node_modules/electron-ipc-socket/package.json'),
        ),
    );
    assert.equal(manifest.version, '4.0.0');
    assert.equal(manifest.type, 'module');
} finally {
    await rm(temporary, { force: true, recursive: true });
}
