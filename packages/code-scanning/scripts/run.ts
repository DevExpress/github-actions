import * as path from 'path';

import { validateLockFiles } from '../src/validate-lock-files';
import { validateNodeVersions } from '../src/validate-node-versions';
import { pnpmAudit } from '../src/pnpm-audit';

const command = process.argv[2];
const targetPath = path.resolve(process.argv[3] || '.');
const artifactsPath = path.resolve(process.argv[4] || './artifacts');

const tasks: Record<string, () => Promise<unknown>> = {
  validateLockFiles: () => validateLockFiles({ targetPath, artifactsPath }),
  validateNodeVersions: () => validateNodeVersions({ targetPath, artifactsPath }),
  pnpmAudit: () => pnpmAudit({ targetPath, artifactsPath }),
};

async function main() {
  console.log(`Target: ${targetPath}`);
  console.log(`Artifacts: ${artifactsPath}\n`);

  if (command === 'all') {
    for (const [name, fn] of Object.entries(tasks)) {
      console.log(`\n--- ${name} ---\n`);
      await fn();
    }
  } else if (tasks[command]) {
    await tasks[command]();
  } else {
    console.error(`Unknown command: ${command}`);
    console.error(
      'Usage: tsx scripts/run.ts <validateLockFiles|validateNodeVersions|pnpmAudit|all> [targetPath] [artifactsPath]',
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
