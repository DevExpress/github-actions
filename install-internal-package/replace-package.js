const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const { rmSync, mkdirSync, lstatSync, unlinkSync } = require('node:fs');
const { dirname, join } = require('node:path');

const [packageName, packageFile] = process.argv.slice(2);

assert(packageName && packageFile, 'Usage: node replace-package.js <package-name> <package-file>');

let pkgDir;
try {
  pkgDir = dirname(require.resolve(`${packageName}/package.json`, { paths: [process.cwd()] }));
} catch {
  console.error(`Package "${packageName}" is not installed. It must be installed before it can be replaced.`);
  process.exit(1);
}

const linkPath = join(process.cwd(), 'node_modules', packageName);
try {
  if (lstatSync(linkPath).isSymbolicLink()) {
    rmSync(pkgDir, { recursive: true, force: true });
    unlinkSync(linkPath);
    pkgDir = linkPath;
  }
} catch {}

rmSync(pkgDir, { recursive: true, force: true });
mkdirSync(pkgDir, { recursive: true });
execFileSync('tar', ['xzf', packageFile, '-C', pkgDir, '--strip-components=1']);
