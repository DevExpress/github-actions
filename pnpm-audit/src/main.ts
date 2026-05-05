import * as core from '@actions/core';
import * as path from 'node:path';

import { pnpmAudit } from 'code-scanning';

const ROOT_PAT = 'target';
const ARTIFACTS_PATH = 'artifacts';

async function run(): Promise<void> {
  try {
    const rootPath = core.getInput(ROOT_PAT, { required: true });
    const artifactsPath = core.getInput(ARTIFACTS_PATH, { required: true });

    const basePath = process.env.INIT_CWD || process.cwd();
    const targetPath = path.resolve(basePath, rootPath);
    const resolvedArtifactsPath = path.resolve(basePath, artifactsPath);

    await pnpmAudit({ targetPath, artifactsPath: resolvedArtifactsPath });
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}

run();
