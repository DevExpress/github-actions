import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'path';

import { FileSystem, NodeFileSystem } from '../file-system';
import {
  PNPM_AUDIT_REPORT_FILENAME,
  type AuditVulnerability,
  type PackageAuditResult,
  type PnpmAuditReport,
} from '../shared-types';
import type { PackageManager, WorkspaceInfo } from './common';
import { detectNpmWorkspaces, parseNpmAuditOutput } from './npm';
import { detectPnpmWorkspaces, parseAuditOutput } from './pnpm';

const execFileAsync = promisify(execFile);

// #region package.json discovery

async function findAllPackageJsonDirs(rootPath: string, fs: FileSystem): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === 'node_modules') continue;
      const full = path.join(dir, entry);
      if (await fs.isDirectory(full)) {
        await walk(full);
      } else if (entry === 'package.json') {
        results.push(dir);
      }
    }
  }

  await walk(rootPath);
  return [...new Set(results)].sort();
}

function classifyPackages(
  packageDirs: string[],
  workspaces: WorkspaceInfo[],
): { workspaceAuditRoots: Map<WorkspaceInfo, string[]>; strayPackageDirs: string[] } {
  const workspaceAuditRoots = new Map<WorkspaceInfo, string[]>();
  const strayPackageDirs: string[] = [];

  for (const ws of workspaces) {
    workspaceAuditRoots.set(ws, []);
  }

  for (const pkgDir of packageDirs) {
    const resolved = path.resolve(pkgDir);
    let found = false;
    for (const ws of workspaces) {
      if (ws.memberDirs.has(resolved) || isSubdirectory(ws.lockFileDir, resolved)) {
        workspaceAuditRoots.get(ws)!.push(pkgDir);
        found = true;
        break;
      }
    }
    if (!found) {
      strayPackageDirs.push(pkgDir);
    }
  }

  return { workspaceAuditRoots, strayPackageDirs };
}

function isSubdirectory(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

// #endregion

// #region Running audit

async function runAudit(
  packageManager: PackageManager,
  cwd: string,
): Promise<{ stdout: string; stderr: string; error?: string }> {
  const command = process.platform === 'win32' ? `${packageManager}.cmd` : packageManager;
  try {
    const { stdout, stderr } = await execFileAsync(command, ['audit', '--json'], {
      cwd,
      maxBuffer: 50 * 1024 * 1024,
    });
    return { stdout, stderr };
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'stdout' in err) {
      const execErr = err as { stdout: string; stderr: string; code?: number };
      const stderrLower = (execErr.stderr ?? '').toLowerCase();
      if (
        stderrLower.includes('command not found')
        || stderrLower.includes('enoent')
        || stderrLower.includes('cannot find')
      ) {
        return { stdout: '', stderr: '', error: `${packageManager} is not installed or not found in PATH` };
      }
      return { stdout: execErr.stdout ?? '', stderr: execErr.stderr ?? '' };
    }
    return { stdout: '', stderr: '', error: err instanceof Error ? err.message : String(err) };
  }
}

// #endregion

// #region Main

export function filterIgnoredAdvisories(
  packages: PackageAuditResult[],
  ignoredAdvisories?: string[],
): { processedPackages: PackageAuditResult[]; ignoredVulnerabilities: AuditVulnerability[] } {
  const ignoredSet = new Set(ignoredAdvisories ?? []);
  if (ignoredSet.size === 0) {
    return { processedPackages: packages, ignoredVulnerabilities: [] };
  }

  const isIgnored = (v: AuditVulnerability): boolean => {
    if (ignoredSet.has(v.id)) return true;
    if (v.url) {
      const ghsaMatch = v.url.match(/\/(GHSA-[\w-]+)$/);
      if (ghsaMatch && ignoredSet.has(ghsaMatch[1])) return true;
    }
    return false;
  };

  const ignoredVulnerabilities: AuditVulnerability[] = [];
  const processedPackages = packages.map((pkg) => {
    const ignored = pkg.vulnerabilities.filter(isIgnored);
    if (ignored.length === 0) return pkg;
    ignoredVulnerabilities.push(...ignored);
    return { ...pkg, vulnerabilities: pkg.vulnerabilities.filter((v) => !isIgnored(v)) };
  });

  return { processedPackages, ignoredVulnerabilities };
}

export async function pnpmAudit({
  targetPath,
  artifactsPath,
  fileSystem,
  ignoredAdvisories,
}: {
  targetPath: string;
  artifactsPath: string;
  fileSystem?: FileSystem;
  ignoredAdvisories?: string[];
}): Promise<PnpmAuditReport> {
  const fs = fileSystem || new NodeFileSystem();
  const resolvedRoot = path.resolve(targetPath);

  if (!(await fs.exists(resolvedRoot))) {
    throw new Error(`Path does not exist: ${resolvedRoot}`);
  }
  if (!(await fs.isDirectory(resolvedRoot))) {
    throw new Error(`Path is not a directory: ${resolvedRoot}`);
  }

  console.log(`Scanning ${resolvedRoot} for pnpm/npm packages...\n`);

  const workspaces = [
    ...(await detectPnpmWorkspaces(resolvedRoot, fs)),
    ...(await detectNpmWorkspaces(resolvedRoot, fs)),
  ];
  const allPackageDirs = await findAllPackageJsonDirs(resolvedRoot, fs);

  if (allPackageDirs.length === 0) {
    console.log('No package.json files found. Nothing to audit.');
    const report: PnpmAuditReport = {
      succeeded: true,
      rootPath: resolvedRoot,
      packages: [],
      totalVulnerabilities: 0,
      bySeverity: {},
      packagesWithVulnerabilities: 0,
      strayPackages: [],
    };
    await saveReport(report, artifactsPath, fs);
    return report;
  }

  const { workspaceAuditRoots, strayPackageDirs } = classifyPackages(allPackageDirs, workspaces);

  const packages: PackageAuditResult[] = [];
  let counter = 0;
  const totalAuditRuns = workspaceAuditRoots.size + strayPackageDirs.length;

  // Audit workspace roots
  for (const [ws, memberDirs] of workspaceAuditRoots) {
    counter++;
    const auditRoot = ws.lockFileDir;
    const relDir = path.relative(resolvedRoot, auditRoot) || '.';
    console.log(
      `(${counter}/${totalAuditRuns}) ${relDir} (${ws.packageManager} workspace root, ${memberDirs.length} packages)`,
    );

    const { stdout, stderr, error } = await runAudit(ws.packageManager, auditRoot);

    if (error) {
      console.log(`  ✖ ${error}`);
      packages.push({
        directory: auditRoot,
        relativeDirectory: relDir,
        vulnerabilities: [],
        error,
        isWorkspaceMember: true,
      });
    } else {
      const parsed = ws.packageManager === 'npm'
        ? parseNpmAuditOutput(stdout)
        : parseAuditOutput(stdout, stderr);
      if (parsed.error) {
        console.log(`  ⚠ ${parsed.error}`);
      }
      if (parsed.vulnerabilities.length > 0) {
        for (const v of parsed.vulnerabilities) {
          const fixInfo = v.fixAvailable ? ' (fix available)' : '';
          console.log(`  ${v.severity.toUpperCase()} ${v.name}: ${v.title}${fixInfo}`);
        }
      } else {
        console.log('  No vulnerabilities found.');
      }
      packages.push({
        directory: auditRoot,
        relativeDirectory: relDir,
        vulnerabilities: parsed.vulnerabilities,
        error: parsed.error,
        isWorkspaceMember: true,
      });
    }
  }

  // Audit stray packages
  for (const strayDir of strayPackageDirs) {
    counter++;
    const relDir = path.relative(resolvedRoot, strayDir) || '.';
    console.log(`(${counter}/${totalAuditRuns}) ${relDir} (stray package)`);

    const hasLockFile = await fs.exists(path.join(strayDir, 'pnpm-lock.yaml'));
    if (!hasLockFile) {
      console.log('  No pnpm-lock.yaml found. Skipping audit.');
      packages.push({
        directory: strayDir,
        relativeDirectory: relDir,
        vulnerabilities: [],
        error: 'No pnpm-lock.yaml found',
        isWorkspaceMember: false,
      });
      continue;
    }

    const { stdout, stderr, error } = await runAudit('pnpm', strayDir);

    if (error) {
      console.log(`  ✖ ${error}`);
      packages.push({
        directory: strayDir,
        relativeDirectory: relDir,
        vulnerabilities: [],
        error,
        isWorkspaceMember: false,
      });
    } else {
      const parsed = parseAuditOutput(stdout, stderr);
      if (parsed.error) {
        console.log(`  ⚠ ${parsed.error}`);
      }
      if (parsed.vulnerabilities.length > 0) {
        for (const v of parsed.vulnerabilities) {
          const fixInfo = v.fixAvailable ? ' (fix available)' : '';
          console.log(`  ${v.severity.toUpperCase()} ${v.name}: ${v.title}${fixInfo}`);
        }
      } else {
        console.log('  No vulnerabilities found.');
      }
      packages.push({
        directory: strayDir,
        relativeDirectory: relDir,
        vulnerabilities: parsed.vulnerabilities,
        error: parsed.error,
        isWorkspaceMember: false,
      });
    }
  }

  const { processedPackages, ignoredVulnerabilities } = filterIgnoredAdvisories(
    packages,
    ignoredAdvisories,
  );

  // Build result
  const totalVulnerabilities = processedPackages.reduce((sum, p) => sum + p.vulnerabilities.length, 0);
  const bySeverity: Record<string, number> = {};
  for (const pkg of processedPackages) {
    for (const v of pkg.vulnerabilities) {
      bySeverity[v.severity] = (bySeverity[v.severity] ?? 0) + 1;
    }
  }
  const packagesWithVulnerabilities = processedPackages.filter((p) => p.vulnerabilities.length > 0).length;
  const strayPackages = strayPackageDirs.map((d) => path.relative(resolvedRoot, d) || '.');

  const report: PnpmAuditReport = {
    succeeded: totalVulnerabilities === 0,
    rootPath: resolvedRoot,
    packages: processedPackages,
    totalVulnerabilities,
    bySeverity,
    packagesWithVulnerabilities,
    strayPackages,
    ignoredAdvisories: ignoredAdvisories?.length ? ignoredAdvisories : undefined,
    ignoredVulnerabilities: ignoredVulnerabilities.length > 0 ? ignoredVulnerabilities : undefined,
  };

  // Summary output
  if (totalVulnerabilities === 0) {
    console.log('\nTotal: 0 vulnerabilities found. Everything is clear.');
  } else {
    const sevSummary = Object.entries(bySeverity)
      .sort(([, a], [, b]) => b - a)
      .map(([sev, count]) => `${count} ${sev}`)
      .join(', ');
    console.log(
      `\n✖ Found ${totalVulnerabilities} vulnerabilities (${sevSummary}) in ${packagesWithVulnerabilities} packages.`,
    );
  }

  if (strayPackages.length > 0) {
    console.log(
      `⚠ ${strayPackages.length} stray package(s) found outside any pnpm workspace: ${strayPackages.join(', ')}`,
    );
  }

  await saveReport(report, artifactsPath, fs);

  return report;
}

async function saveReport(
  report: PnpmAuditReport,
  artifactsPath: string,
  fs: FileSystem,
): Promise<void> {
  const outputFilePath = path.resolve(artifactsPath, PNPM_AUDIT_REPORT_FILENAME);
  const jsonContent = JSON.stringify(report, null, 2);

  if (fs.writeFile) {
    const outputDir = path.dirname(outputFilePath);
    if (fs.mkdir) {
      await fs.mkdir(outputDir, { recursive: true });
    }
    await fs.writeFile(outputFilePath, jsonContent);
    console.log(`\n✅ Audit report saved to: ${outputFilePath}`);
  } else {
    throw new Error('FileSystem does not support writeFile operation');
  }
}

// #endregion
