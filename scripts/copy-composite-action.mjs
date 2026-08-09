import fs from 'node:fs/promises';
import path from 'node:path';

const cwd = process.cwd();
const workspaceRoot = path.resolve(import.meta.dirname, '..');
const outDir = path.join(workspaceRoot, path.basename(cwd));

const skip = new Set(['package.json', 'node_modules']);

async function copy() {
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  for (const entryName of await fs.readdir(cwd)) {
    if (skip.has(entryName)) continue;
    await fs.cp(path.join(cwd, entryName), path.join(outDir, entryName), { recursive: true });
  }
}

copy();
