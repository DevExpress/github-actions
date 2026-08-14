import fs from 'node:fs/promises';
import path from 'node:path';

const cwd = process.cwd();
const workspaceRoot = path.resolve(import.meta.dirname, '..');
const outFile = path.join(workspaceRoot, `${path.basename(cwd)}.yml`);

await fs.copyFile(path.join(cwd, 'workflow.yml'), outFile);
