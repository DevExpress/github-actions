const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const { rmSync, mkdirSync, lstatSync, realpathSync } = require('node:fs');
const { join } = require('node:path');
const { createRequire } = require('node:module');

const [packageName, packageFile] = process.argv.slice(2);

assert(packageName && packageFile, 'Usage: node replace-package.js <package-name> <package-file>');

const cwdRequire = createRequire(process.cwd() + '/');

let entryPath;
for (const searchDir of cwdRequire.resolve.paths(packageName) || []) {
  const candidate = join(searchDir, packageName);
  if (lstatSync(candidate, { throwIfNoEntry: false })) {
    entryPath = candidate;
    break;
  }
}

assert(entryPath, `Package "${packageName}" is not installed. It must be installed before it can be replaced.`);

const targetPath = (() => {
  if (!lstatSync(entryPath).isSymbolicLink()) {
    return entryPath;
  }

  // If it's a symlink (pnpm), replace the target content to preserve the resolution chain.
  // pnpm places dependencies as siblings of the target, so the symlink must stay intact.
  const resolved = realpathSync(entryPath);
  assert(resolved.startsWith(process.cwd() + '/'), `Symlink target "${resolved}" resolves outside the project`);
  return resolved;

})();

rmSync(targetPath, { recursive: true, force: true });
mkdirSync(targetPath, { recursive: true });

const listing = execFileSync('tar', ['-tzf', packageFile]).toString();
const unsafeEntry = listing.split('\n').find(e => e.includes('..') || e.startsWith('/'));
assert(!unsafeEntry, `Archive contains unsafe path: ${unsafeEntry}`);

execFileSync('tar', ['-xzf', packageFile, '-C', targetPath, '--strip-components=1']);
