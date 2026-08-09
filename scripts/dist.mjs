import fs from 'node:fs/promises';
import path from 'node:path';

import ncc from '@vercel/ncc';

const cwd = process.cwd();
const workspaceRoot = path.resolve(import.meta.dirname, '..');
const outDir = path.join(workspaceRoot, '.github', 'actions', path.basename(cwd));

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function build() {
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  const entry = path.join(cwd, 'lib', 'main.js');

  if (await exists(entry)) {
    // JS action: bundle with ncc, preserve the dist/index.js layout so
    // action.yml's `runs.main: dist/index.js` needs no edits.
    const { code } = await ncc(entry, { minify: false });
    await fs.mkdir(path.join(outDir, 'dist'), { recursive: true });
    await fs.writeFile(path.join(outDir, 'dist', 'index.js'), code);
    await fs.copyFile(path.join(cwd, 'action.yml'), path.join(outDir, 'action.yml'));
  } else {
    // Composite action: no bundle, copy everything except dev-only files.
    const skip = new Set(['package.json', 'node_modules', 'src', 'lib', 'tsconfig.json']);
    for (const entryName of await fs.readdir(cwd)) {
      if (skip.has(entryName)) continue;
      await fs.cp(path.join(cwd, entryName), path.join(outDir, entryName), { recursive: true });
    }
  }
}

build();
