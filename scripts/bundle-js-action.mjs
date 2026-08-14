import fs from 'node:fs/promises';
import path from 'node:path';

import ncc from '@vercel/ncc';

const cwd = process.cwd();
const workspaceRoot = path.resolve(import.meta.dirname, '..');
const outDir = path.join(workspaceRoot, path.basename(cwd));

async function build() {
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  // Preserve the dist/index.js layout so action.yml's `runs.main: dist/index.js`
  // needs no edits.
  const { code } = await ncc(path.join(cwd, 'lib', 'main.js'), { minify: false });
  await fs.mkdir(path.join(outDir, 'dist'), { recursive: true });
  await fs.writeFile(path.join(outDir, 'dist', 'index.js'), code);
  await fs.copyFile(path.join(cwd, 'action.yml'), path.join(outDir, 'action.yml'));
}

build();
