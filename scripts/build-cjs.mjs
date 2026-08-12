import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const sourceDirectory = new URL('../src/', import.meta.url);
const esmDirectory = new URL('../dist/esm/', import.meta.url);
const cjsDirectory = new URL('../dist/cjs/', import.meta.url);
const sourceFiles = (await readdir(sourceDirectory))
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
    .map((file) => fileURLToPath(new URL(file, sourceDirectory)));

await mkdir(cjsDirectory, { recursive: true });
await build({
    bundle: false,
    entryPoints: sourceFiles,
    format: 'cjs',
    outbase: fileURLToPath(sourceDirectory),
    outdir: fileURLToPath(cjsDirectory),
    platform: 'neutral',
    sourcemap: true,
    target: 'es2022',
    tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url)),
});

for (const file of await readdir(esmDirectory)) {
    if (file.endsWith('.d.ts') || file.endsWith('.d.ts.map')) {
        await copyFile(
            new URL(file, esmDirectory),
            new URL(file, cjsDirectory),
        );
    }
}

await writeFile(
    new URL('package.json', cjsDirectory),
    `${JSON.stringify({ type: 'commonjs' }, undefined, 4)}\n`,
);
