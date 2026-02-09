import * as path from 'path';
import * as yaml from 'yaml';
import * as micromatch from 'micromatch';

import { FileSystem, NodeFileSystem } from './file-system';

export const LOCK_FILES_REPORT_FILENAME = 'lock-files-report.json';

interface LockFileValidationEntry {
  packageJsonPath: string;
  lockFilePaths: string[];
  workspacePackage?: boolean;
}

export interface ValidationReport {
  succeeded: boolean;
  totalPackages: number;
  invalidPackages: number;
  validPackageFiles: LockFileValidationEntry[];
  invalidPackageFiles: string[];
}

const LOCK_FILES = [
  'package-lock.json', // npm
  'yarn.lock', // yarn
  'pnpm-lock.yaml', // pnpm
  'bun.lockb', // bun
] as const;

interface WorkspaceInfo {
  rootPath: string;
  patterns: string[];
}

export async function validateLockFiles({
  targetPath,
  artifactsPath,
}: {
  targetPath: string;
  artifactsPath: string;
}) {
  const fileSystem = new NodeFileSystem();

  console.log(`Checking lock files in: ${targetPath}\n`);

  const entries = await discoverLockFiles(targetPath, fileSystem);

  const invalidPackageFiles = entries
    .filter((entry) => entry.lockFilePaths.length === 0)
    .map((entry) => entry.packageJsonPath);

  const report: ValidationReport = {
    succeeded: invalidPackageFiles.length === 0,
    totalPackages: entries.length,
    invalidPackages: invalidPackageFiles.length,
    validPackageFiles: entries.filter((entry) => entry.lockFilePaths.length > 0),
    invalidPackageFiles,
  };

  printValidationResult(report);
  const outputFilePath = path.resolve(artifactsPath, LOCK_FILES_REPORT_FILENAME);
  await saveValidationResult(report, { outputFilePath, fs: fileSystem });
}

async function saveValidationResult(
  report: ValidationReport,
  { outputFilePath, fs }: { fs: FileSystem; outputFilePath: string },
) {
  const jsonContent = JSON.stringify(report, null, 2);

  if (fs.writeFile) {
    // Ensure output directory exists
    const outputDir = path.dirname(outputFilePath);
    if (fs.mkdir) {
      await fs.mkdir(outputDir, { recursive: true });
    }

    await fs.writeFile(outputFilePath, jsonContent);
    console.log(`\n✅ Validation report saved to: ${outputFilePath}`);
  } else {
    throw new Error('FileSystem does not support writeFile operation');
  }
}

function printValidationResult(report: ValidationReport) {
  for (const entry of report.invalidPackageFiles) {
    console.log(`🟥 ${entry} - lock file missing`);
  }

  for (const entry of report.validPackageFiles) {
    const workspaceMarker = entry.workspacePackage ? ' (🧩 workspace)' : '';

    console.log(
      `🟦 ${entry.packageJsonPath} - ${entry.lockFilePaths.join(', ')}${workspaceMarker}`,
    );
  }

  if (report.invalidPackages > 0) {
    console.log(`\n🟥 ${report.invalidPackages} package(s) are missing lock files`);
  }
}

export async function discoverLockFiles(
  rootPath: string,
  fs: FileSystem,
): Promise<LockFileValidationEntry[]> {
  const results: LockFileValidationEntry[] = [];
  const workspaces: WorkspaceInfo[] = [];

  // Parse workspace configuration from pnpm-workspace.yaml or package.json
  async function getWorkspacePatterns(
    dirPath: string,
    entries: string[],
  ): Promise<string[] | null> {
    if (!fs.readFile) return null;

    try {
      // Check for pnpm-workspace.yaml
      if (entries.includes('pnpm-workspace.yaml')) {
        const content = await fs.readFile(path.join(dirPath, 'pnpm-workspace.yaml'));
        const parsed = yaml.parse(content);
        if (parsed?.packages) return parsed.packages;
      }

      // Check for package.json with workspaces field
      if (entries.includes('package.json')) {
        const content = await fs.readFile(path.join(dirPath, 'package.json'));
        const pkg = JSON.parse(content);
        const workspaces = Array.isArray(pkg.workspaces)
          ? pkg.workspaces
          : pkg.workspaces?.packages;
        if (workspaces) return workspaces;
      }
    } catch {
      // Ignore parsing errors
    }

    return null;
  }

  // Check if a package path matches workspace patterns
  function isPathInWorkspace(packagePath: string, workspace: WorkspaceInfo): boolean {
    const relativePath = path.relative(workspace.rootPath, packagePath);
    if (!relativePath || relativePath === '.') return false;

    const packageDir = path.dirname(relativePath);
    return micromatch.isMatch(packageDir, workspace.patterns, { dot: true, matchBase: false });
  }

  // Find lock files in current or parent directories up to rootPath
  async function findLockFilesInParents(
    dirPath: string,
  ): Promise<{ names: string[]; paths: string[] }> {
    let currentPath = dirPath;

    while (currentPath.startsWith(rootPath)) {
      const entries = await fs.readdir(currentPath);
      const locks = entries.filter((entry) => LOCK_FILES.includes(entry as any));

      if (locks.length > 0) {
        return {
          names: locks,
          paths: locks.map((name) => path.join(currentPath, name)),
        };
      }

      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) break;
      currentPath = parentPath;
    }

    return { names: [], paths: [] };
  }

  async function scanDirectory(dirPath: string): Promise<void> {
    const entries = await fs.readdir(dirPath);

    const hasPackageJson = entries.includes('package.json');
    const foundLockFiles = entries.filter((entry) => LOCK_FILES.includes(entry as any));
    const foundLockFilePaths = foundLockFiles.map((name) => path.join(dirPath, name));

    // Check if this directory is a workspace root
    if (hasPackageJson && foundLockFiles.length > 0) {
      const patterns = await getWorkspacePatterns(dirPath, entries);
      if (patterns) {
        workspaces.push({ rootPath: dirPath, patterns });
      }
    }

    // Record validation result if package.json exists
    if (hasPackageJson) {
      const packagePath = path.join(dirPath, 'package.json');
      const isWorkspaceMember = workspaces.some((ws) => isPathInWorkspace(packagePath, ws));
      let lockFilePaths = foundLockFilePaths;

      // For workspace members without local lock files, search parent directories
      if (isWorkspaceMember && lockFilePaths.length === 0) {
        const parentLocks = await findLockFilesInParents(dirPath);
        lockFilePaths = parentLocks.paths;
      }

      results.push({
        packageJsonPath: path.relative(rootPath, packagePath),
        lockFilePaths: lockFilePaths.map((p) => path.relative(rootPath, p)),
        workspacePackage: isWorkspaceMember,
      });
    }

    // Recursively scan subdirectories
    for (const entry of entries) {
      if (shouldSkipDirectory(entry)) continue;

      const entryPath = path.join(dirPath, entry);
      if (await fs.isDirectory(entryPath)) {
        await scanDirectory(entryPath);
      }
    }
  }

  await scanDirectory(rootPath);
  return results;
}

function shouldSkipDirectory(dirName: string): boolean {
  const skipDirs = ['node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.turbo'];
  return skipDirs.includes(dirName);
}
