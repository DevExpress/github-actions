import * as core from '@actions/core';
import * as path from 'node:path';

import { parseRepoCheckConfig, pnpmAudit } from 'code-scanning';

const ROOT_PAT = 'target';
const ARTIFACTS_PATH = 'artifacts';
const CONFIG = 'config';

async function run(): Promise<void> {
  try {
    const rootPath = core.getInput(ROOT_PAT, { required: true });
    const artifactsPath = core.getInput(ARTIFACTS_PATH, { required: true });
    const configInput = core.getInput(CONFIG);

    const config = parseRepoCheckConfig(configInput);

    const basePath = process.env.GITHUB_WORKSPACE || process.cwd();
    const targetPath = path.resolve(basePath, rootPath);
    const resolvedArtifactsPath = path.resolve(basePath, artifactsPath);

    core.info(`Target path: ${targetPath}`);
    core.info(`Artifacts path: ${resolvedArtifactsPath}`);

    const report = await pnpmAudit({
      targetPath,
      artifactsPath: resolvedArtifactsPath,
      ignoredAdvisories: config.ignoredAdvisories,
    });

    if (!report.succeeded) {
      core.warning(
        `Found ${report.totalVulnerabilities} vulnerabilities in ${report.packagesWithVulnerabilities} packages`,
      );
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed(String(error));
    }
  }
}

run();
