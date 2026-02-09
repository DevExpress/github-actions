import * as path from 'path';
import * as yaml from 'yaml';
import { FileSystem, NodeFileSystem } from './file-system';

export const NODE_VERSIONS_REPORT_FILENAME = 'node-versions-report.json';

export interface NodeVersionSource {
  file: string;
  location: string; // More specific location within the file (e.g., "engines.node", "setup-node step")
  version: string; // The version specifier as found
  normalizedVersion?: string; // Parsed/normalized version
}

export interface NodeVersionIssue {
  type: 'missing' | 'outdated' | 'unsafe' | 'inconsistent';
  severity: 'error' | 'warning';
  message: string;
  file?: string;
  suggestedVersion?: string;
}

export interface NodeVersionReport {
  succeeded: boolean;
  detectedVersions: NodeVersionSource[];
  issues: NodeVersionIssue[];
}

// Version requirements
const MINIMUM_SAFE_MAJOR = 22;
const REQUIRED_MINIMAL_VERSIONS = {
  22: '22.21.1',
  23: '23.11.1',
  24: '24.11.1',
  25: '25.2.1',
} as const;

// Files to check for Node version specifications
const NODE_VERSION_FILES = ['.nvmrc', '.node-version', '.tool-versions'] as const;

interface PackageJson {
  engines?: {
    node?: string;
  };
  volta?: {
    node?: string;
  };
}

interface GithubWorkflow {
  jobs?: {
    [key: string]: {
      steps?: Array<{
        uses?: string;
        with?: {
          'node-version'?: string | number;
        };
      }>;
    };
  };
}

export async function validateNodeVersions({
  targetPath,
  artifactsPath,
  fileSystem,
}: {
  targetPath: string;
  artifactsPath: string;
  fileSystem?: FileSystem;
}): Promise<NodeVersionReport> {
  const fs = fileSystem || new NodeFileSystem();

  console.log(`Checking Node.js versions in: ${targetPath}\n`);

  const detectedVersions = await detectNodeVersions(targetPath, fs);
  const issues = analyzeVersions(detectedVersions, targetPath);

  const report: NodeVersionReport = {
    succeeded: issues.filter((i) => i.severity === 'error').length === 0,
    detectedVersions,
    issues,
  };

  printReport(report);
  const outputFilePath = path.join(artifactsPath, NODE_VERSIONS_REPORT_FILENAME);
  await saveReport(report, { outputFilePath, fs });

  return report;
}

async function detectNodeVersions(
  targetPath: string,
  fs: FileSystem,
): Promise<NodeVersionSource[]> {
  const versions: NodeVersionSource[] = [];

  // Check package.json
  versions.push(...(await checkPackageJson(targetPath, fs)));

  // Check Node version files (.nvmrc, .node-version, etc.)
  versions.push(...(await checkNodeVersionFiles(targetPath, fs)));

  // Check GitHub Actions workflows
  versions.push(...(await checkGithubWorkflows(targetPath, fs)));

  // Check Dockerfiles
  versions.push(...(await checkDockerfiles(targetPath, fs)));

  return versions;
}

async function checkPackageJson(targetPath: string, fs: FileSystem): Promise<NodeVersionSource[]> {
  const versions: NodeVersionSource[] = [];
  const packageJsonPath = path.join(targetPath, 'package.json');

  try {
    if (!fs.readFile) {
      return versions;
    }
    const content = await fs.readFile(packageJsonPath);
    const pkg: PackageJson = JSON.parse(content);

    if (pkg.engines?.node) {
      versions.push({
        file: 'package.json',
        location: 'engines.node',
        version: pkg.engines.node,
        normalizedVersion: normalizeVersion(pkg.engines.node),
      });
    }

    if (pkg.volta?.node) {
      versions.push({
        file: 'package.json',
        location: 'volta.node',
        version: pkg.volta.node,
        normalizedVersion: normalizeVersion(pkg.volta.node),
      });
    }
  } catch (error) {
    // package.json might not exist or be invalid
  }

  return versions;
}

async function checkNodeVersionFiles(
  targetPath: string,
  fs: FileSystem,
): Promise<NodeVersionSource[]> {
  const versions: NodeVersionSource[] = [];

  for (const fileName of NODE_VERSION_FILES) {
    const filePath = path.join(targetPath, fileName);
    try {
      if (!fs.readFile) {
        continue;
      }
      const content = (await fs.readFile(filePath)).trim();

      if (fileName === '.tool-versions') {
        // .tool-versions format: "nodejs 22.21.1"
        const lines = content.split('\n');
        for (const line of lines) {
          const match = line.match(/^nodejs?\s+(.+)$/i);
          if (match) {
            versions.push({
              file: fileName,
              location: 'nodejs entry',
              version: match[1].trim(),
              normalizedVersion: normalizeVersion(match[1].trim()),
            });
          }
        }
      } else {
        // .nvmrc and .node-version just contain the version
        versions.push({
          file: fileName,
          location: 'file content',
          version: content,
          normalizedVersion: normalizeVersion(content),
        });
      }
    } catch (error) {
      // File doesn't exist, skip
    }
  }

  return versions;
}

async function checkGithubWorkflows(
  targetPath: string,
  fs: FileSystem,
): Promise<NodeVersionSource[]> {
  const versions: NodeVersionSource[] = [];
  const workflowsDir = path.join(targetPath, '.github', 'workflows');

  try {
    const files = await fs.readdir(workflowsDir);

    for (const file of files) {
      if (!file.endsWith('.yml') && !file.endsWith('.yaml')) {
        continue;
      }

      const filePath = path.join(workflowsDir, file);
      try {
        if (!fs.readFile) {
          continue;
        }
        const content = await fs.readFile(filePath);
        const workflow: GithubWorkflow = yaml.parse(content);

        if (workflow.jobs) {
          for (const [jobName, job] of Object.entries(workflow.jobs)) {
            if (job.steps) {
              for (const [stepIndex, step] of job.steps.entries()) {
                if (step.uses?.includes('actions/setup-node')) {
                  const nodeVersion = step.with?.['node-version'];
                  if (nodeVersion) {
                    const versionStr = String(nodeVersion);
                    versions.push({
                      file: `.github/workflows/${file}`,
                      location: `jobs.${jobName}.steps[${stepIndex}].with.node-version`,
                      version: versionStr,
                      normalizedVersion: normalizeVersion(versionStr),
                    });
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        // Skip invalid workflow files
      }
    }
  } catch (error) {
    // .github/workflows directory doesn't exist
  }

  return versions;
}

async function checkDockerfiles(targetPath: string, fs: FileSystem): Promise<NodeVersionSource[]> {
  const versions: NodeVersionSource[] = [];

  // Check common Dockerfile locations
  const dockerfiles = ['Dockerfile', 'Dockerfile.dev', 'docker/Dockerfile'];

  for (const dockerfilePath of dockerfiles) {
    const fullPath = path.join(targetPath, dockerfilePath);
    try {
      if (!fs.readFile) {
        continue;
      }
      const content = await fs.readFile(fullPath);
      const lines = content.split('\n');

      for (const [index, line] of lines.entries()) {
        // Match FROM node:version or FROM node:version-alpine, etc.
        const match = line.match(/FROM\s+node:(\d+(?:\.\d+(?:\.\d+)?)?)/i);
        if (match) {
          versions.push({
            file: dockerfilePath,
            location: `line ${index + 1}`,
            version: match[1],
            normalizedVersion: normalizeVersion(match[1]),
          });
        }
      }
    } catch (error) {
      // Dockerfile doesn't exist, skip
    }
  }

  return versions;
}

function normalizeVersion(version: string): string {
  const normalized = version.trim().replace(/^v/i, '');

  const match = normalized.match(/(\d+(?:\.\d+(?:\.\d+)?)?)/);
  if (match) {
    return match[1];
  }

  return normalized;
}

function parseVersion(version: string): { major: number; minor: number; patch: number } | null {
  const parts = version.split('.');
  if (parts.length === 0) {
    return null;
  }

  const major = parseInt(parts[0], 10);
  const minor = parts.length > 1 ? parseInt(parts[1], 10) : 0;
  const patch = parts.length > 2 ? parseInt(parts[2], 10) : 0;

  if (isNaN(major)) {
    return null;
  }

  return { major, minor: isNaN(minor) ? 0 : minor, patch: isNaN(patch) ? 0 : patch };
}

function compareVersions(v1: string, v2: string): number {
  const version1 = parseVersion(v1);
  const version2 = parseVersion(v2);

  if (!version1 || !version2) {
    return 0;
  }

  if (version1.major !== version2.major) {
    return version1.major - version2.major;
  }
  if (version1.minor !== version2.minor) {
    return version1.minor - version2.minor;
  }
  return version1.patch - version2.patch;
}

function analyzeVersions(
  detectedVersions: NodeVersionSource[],
  targetPath: string,
): NodeVersionIssue[] {
  const issues: NodeVersionIssue[] = [];

  // Check if we found any versions at all
  if (detectedVersions.length === 0) {
    issues.push({
      type: 'missing',
      severity: 'error',
      message: 'No Node.js version specifications found in the repository.',
    });

    // Suggest where to add version specifications
    issues.push({
      type: 'missing',
      severity: 'warning',
      message: 'Consider adding Node.js version to package.json (engines.node field).',
      file: 'package.json',
      suggestedVersion: REQUIRED_MINIMAL_VERSIONS[MINIMUM_SAFE_MAJOR],
    });

    return issues;
  }

  // Check for missing specifications in key files
  const hasPackageJsonEngines = detectedVersions.some(
    (v) => v.file === 'package.json' && v.location === 'engines.node',
  );
  const hasNvmrc = detectedVersions.some((v) => v.file === '.nvmrc');

  if (!hasPackageJsonEngines) {
    issues.push({
      type: 'missing',
      severity: 'warning',
      message: 'package.json is missing engines.node field.',
      file: 'package.json',
      suggestedVersion: REQUIRED_MINIMAL_VERSIONS[MINIMUM_SAFE_MAJOR],
    });
  }

  if (!hasNvmrc) {
    issues.push({
      type: 'missing',
      severity: 'warning',
      message: 'Consider adding .nvmrc file for development consistency.',
      suggestedVersion: REQUIRED_MINIMAL_VERSIONS[MINIMUM_SAFE_MAJOR],
    });
  }

  // Analyze each detected version
  const uniqueNormalizedVersions = new Set<string>();

  for (const source of detectedVersions) {
    if (!source.normalizedVersion) {
      continue;
    }

    uniqueNormalizedVersions.add(source.normalizedVersion);

    const parsed = parseVersion(source.normalizedVersion);
    if (!parsed) {
      issues.push({
        type: 'missing',
        severity: 'error',
        message: `Unable to parse version: ${source.version}`,
        file: source.file,
      });
      continue;
    }

    // Check if version is below minimum safe major
    if (parsed.major < MINIMUM_SAFE_MAJOR) {
      issues.push({
        type: 'unsafe',
        severity: 'error',
        message: `Node.js ${parsed.major} is unsafe. Minimum safe version is ${MINIMUM_SAFE_MAJOR}.`,
        file: source.file,
        suggestedVersion: REQUIRED_MINIMAL_VERSIONS[MINIMUM_SAFE_MAJOR],
      });
      continue;
    }

    // Check if version meets required minimum for its major version
    const requiredMinimalVersion =
      REQUIRED_MINIMAL_VERSIONS[parsed.major as keyof typeof REQUIRED_MINIMAL_VERSIONS];
    if (
      requiredMinimalVersion
      && compareVersions(source.normalizedVersion, requiredMinimalVersion) < 0
    ) {
      issues.push({
        type: 'outdated',
        severity: 'error',
        message: `Node.js ${source.normalizedVersion} is below required minimum ${requiredMinimalVersion} for version ${parsed.major}.x`,
        file: source.file,
        suggestedVersion: requiredMinimalVersion,
      });
    }
  }

  // Check for inconsistencies (multiple different versions)
  if (uniqueNormalizedVersions.size > 1) {
    const versionsList = Array.from(uniqueNormalizedVersions).join(', ');
    issues.push({
      type: 'inconsistent',
      severity: 'warning',
      message: `Multiple different Node.js versions detected: ${versionsList}. All version specifications should be consistent.`,
    });
  }

  return issues;
}

function printReport(report: NodeVersionReport) {
  console.log('📊 Node.js Version Check Report\n');
  console.log('='.repeat(60));

  if (report.detectedVersions.length === 0) {
    console.log('\n⚠️  No Node.js version specifications found!\n');
  } else {
    console.log('\n📍 Detected Versions:\n');
    for (const source of report.detectedVersions) {
      console.log(`  • ${source.file} (${source.location}): ${source.version}`);
      if (source.normalizedVersion && source.normalizedVersion !== source.version) {
        console.log(`    → Normalized: ${source.normalizedVersion}`);
      }
    }
  }

  if (report.issues.length > 0) {
    console.log('\n⚠️  Issues Found:\n');
    for (const issue of report.issues) {
      const icon = issue.severity === 'error' ? '❌' : '⚠️ ';
      console.log(`  ${icon} [${issue.type.toUpperCase()}] ${issue.message}`);
      if (issue.file) {
        console.log(`     File: ${issue.file}`);
      }
      if (issue.suggestedVersion) {
        console.log(`     Suggested: ${issue.suggestedVersion}`);
      }
      console.log();
    }
  }

  console.log('='.repeat(60));

  if (report.succeeded) {
    console.log('\n✅ All checks passed!\n');
  } else {
    console.log('\n❌ Issues detected that need attention.\n');
  }
}

async function saveReport(
  report: NodeVersionReport,
  { outputFilePath, fs }: { fs: FileSystem; outputFilePath: string },
) {
  const jsonContent = JSON.stringify(report, null, 2);

  if (fs.writeFile) {
    const outputDir = path.dirname(outputFilePath);
    if (fs.mkdir) {
      await fs.mkdir(outputDir, { recursive: true });
    }

    await fs.writeFile(outputFilePath, jsonContent);
    console.log(`✅ Report saved to: ${outputFilePath}`);
  } else {
    throw new Error('FileSystem does not support writeFile operation');
  }
}
