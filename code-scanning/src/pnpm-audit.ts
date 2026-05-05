import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'path';

import { FileSystem, NodeFileSystem } from './file-system';

const execFileAsync = promisify(execFile);

export const PNPM_AUDIT_REPORT_FILENAME = 'pnpm-audit-report.json';

// #region Types

export enum AuditSeverity {
  Info = 0,
  Low = 1,
  Moderate = 2,
  High = 3,
  Critical = 4,
}

export interface AuditVulnerability {
  id: string;
  name: string;
  severity: string;
  severityLevel: AuditSeverity;
  title: string;
  url?: string;
  vulnerableRange?: string;
  patchedVersions?: string;
  fixAvailable: boolean;
}

export interface PackageAuditResult {
  directory: string;
  relativeDirectory: string;
  vulnerabilities: AuditVulnerability[];
  error?: string;
  isWorkspaceMember: boolean;
}

export interface PnpmAuditReport {
  succeeded: boolean;
  rootPath: string;
  packages: PackageAuditResult[];
  totalVulnerabilities: number;
  bySeverity: Record<string, number>;
  packagesWithVulnerabilities: number;
  strayPackages: string[];
}

// #endregion

// #region pnpm audit parsing

interface PnpmAuditAdvisory {
  module_name?: string;
  severity?: string;
  title?: string;
  url?: string;
  vulnerable_versions?: string;
  patched_versions?: string;
}

function parseSeverityLevel(severity?: string): AuditSeverity {
  switch ((severity ?? '').toLowerCase()) {
    case 'critical':
      return AuditSeverity.Critical;
    case 'high':
      return AuditSeverity.High;
    case 'moderate':
      return AuditSeverity.Moderate;
    case 'low':
      return AuditSeverity.Low;
    case 'info':
      return AuditSeverity.Info;
    default:
      return AuditSeverity.Info;
  }
}

function tryParseJson(text: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function collectJsonPayloads(stdout: string, stderr: string): Record<string, unknown>[] {
  const payloads: Record<string, unknown>[] = [];
  for (const text of [stdout, stderr]) {
    if (!text) continue;
    const whole = tryParseJson(text);
    if (whole) payloads.push(whole);
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const linePayload = tryParseJson(trimmed);
      if (linePayload) payloads.push(linePayload);
    }
  }
  return payloads;
}

export function parseAuditOutput(
  stdout: string,
  stderr: string,
): { vulnerabilities: AuditVulnerability[]; error?: string } {
  const trimmedStdout = stdout.trim();
  const trimmedStderr = stderr.trim();

  if (!trimmedStdout && !trimmedStderr) {
    return { vulnerabilities: [], error: 'Audit output is empty' };
  }

  const payloads = collectJsonPayloads(trimmedStdout, trimmedStderr);

  for (let i = payloads.length - 1; i >= 0; i--) {
    const root = payloads[i];
    const metadata = root['metadata'];
    if (
      !metadata
      || typeof metadata !== 'object'
      || !('dependencies' in (metadata as Record<string, unknown>))
    ) {
      continue;
    }

    const advisories = root['advisories'];
    if (!advisories || typeof advisories !== 'object' || Array.isArray(advisories)) {
      return { vulnerabilities: [] };
    }

    return {
      vulnerabilities: extractFromAdvisories(advisories as Record<string, Record<string, unknown>>),
    };
  }

  for (let i = payloads.length - 1; i >= 0; i--) {
    const root = payloads[i];
    if (typeof root['error'] === 'string') {
      return { vulnerabilities: [], error: root['error'] };
    }
    if (root['error'] && typeof root['error'] === 'object') {
      return { vulnerabilities: [], error: JSON.stringify(root['error']) };
    }
  }

  const fallbackError = [trimmedStdout, trimmedStderr].filter(Boolean).join('\n');
  return { vulnerabilities: [], error: fallbackError || 'Invalid pnpm audit output format' };
}

function extractFromAdvisories(
  advisories: Record<string, Record<string, unknown>>,
): AuditVulnerability[] {
  const result: AuditVulnerability[] = [];
  for (const [id, advisory] of Object.entries(advisories)) {
    if (!advisory || typeof advisory !== 'object') continue;
    const a = advisory as unknown as PnpmAuditAdvisory;
    const severity = a.severity ?? 'info';
    const patchedVersions = a.patched_versions ?? '';
    result.push({
      id,
      name: a.module_name ?? id,
      severity,
      severityLevel: parseSeverityLevel(severity),
      title: a.title ?? a.module_name ?? id,
      url: a.url,
      vulnerableRange: a.vulnerable_versions,
      patchedVersions: patchedVersions || undefined,
      fixAvailable: !!(patchedVersions && patchedVersions !== '<0.0.0'),
    });
  }
  return result;
}

// #endregion

// #region pnpm workspace detection

interface WorkspaceInfo {
  lockFileDir: string;
  memberPatterns: string[];
  memberDirs: Set<string>;
}

async function findPnpmLockFiles(rootPath: string, fs: FileSystem): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const full = path.join(dir, entry);
      if (await fs.isDirectory(full)) {
        await walk(full);
      } else if (entry === 'pnpm-lock.yaml') {
        results.push(dir);
      }
    }
  }

  await walk(rootPath);
  return results;
}

async function parsePnpmWorkspaceYaml(
  workspaceYamlPath: string,
  fs: FileSystem,
): Promise<string[]> {
  if (!(await fs.exists(workspaceYamlPath))) return [];
  const content = await fs.readFile!(workspaceYamlPath);
  const patterns: string[] = [];
  let inPackages = false;
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^packages\s*:/.test(trimmed)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      if (/^[a-zA-Z]/.test(trimmed) && !trimmed.startsWith('-')) {
        break;
      }
      const match = trimmed.match(/^-\s+['"]?([^'"]+)['"]?\s*$/);
      if (match) {
        patterns.push(match[1]);
      }
    }
  }
  return patterns;
}

async function resolveWorkspaceMembers(
  lockFileDir: string,
  patterns: string[],
  fs: FileSystem,
): Promise<Set<string>> {
  const members = new Set<string>();
  members.add(path.resolve(lockFileDir));

  for (const pattern of patterns) {
    if (pattern.startsWith('!')) continue;
    const globBase = pattern.replace(/\/\*\*?$/, '').replace(/\*$/, '');
    const searchDir = path.resolve(lockFileDir, globBase);
    if (!(await fs.exists(searchDir))) continue;

    try {
      if (await fs.isDirectory(searchDir)) {
        if (pattern.endsWith('/*') || pattern.endsWith('/**')) {
          const entries = await fs.readdir(searchDir);
          for (const entry of entries) {
            const full = path.resolve(searchDir, entry);
            if (
              (await fs.isDirectory(full))
              && (await fs.exists(path.join(full, 'package.json')))
            ) {
              members.add(full);
            }
          }
        } else if (await fs.exists(path.join(searchDir, 'package.json'))) {
          members.add(searchDir);
        }
      }
    } catch {
      /* skip */
    }
  }
  return members;
}

async function detectWorkspaces(rootPath: string, fs: FileSystem): Promise<WorkspaceInfo[]> {
  const lockFileDirs = await findPnpmLockFiles(rootPath, fs);
  const workspaces: WorkspaceInfo[] = [];

  for (const dir of lockFileDirs) {
    const workspaceYaml = path.join(dir, 'pnpm-workspace.yaml');
    const memberPatterns = await parsePnpmWorkspaceYaml(workspaceYaml, fs);
    const memberDirs = await resolveWorkspaceMembers(dir, memberPatterns, fs);
    workspaces.push({ lockFileDir: dir, memberPatterns, memberDirs });
  }

  return workspaces;
}

// #endregion

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
): { workspaceAuditRoots: Map<string, string[]>; strayPackageDirs: string[] } {
  const workspaceAuditRoots = new Map<string, string[]>();
  const strayPackageDirs: string[] = [];

  for (const ws of workspaces) {
    workspaceAuditRoots.set(ws.lockFileDir, []);
  }

  for (const pkgDir of packageDirs) {
    const resolved = path.resolve(pkgDir);
    let found = false;
    for (const ws of workspaces) {
      if (ws.memberDirs.has(resolved) || isSubdirectory(ws.lockFileDir, resolved)) {
        workspaceAuditRoots.get(ws.lockFileDir)!.push(pkgDir);
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
  return !!rel && !rel.startsWith('..') && !rel.startsWith('/');
}

// #endregion

// #region Running pnpm audit

function getPnpmCommand(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

async function runPnpmAudit(
  cwd: string,
): Promise<{ stdout: string; stderr: string; error?: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(getPnpmCommand(), ['audit', '--json'], {
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
        return { stdout: '', stderr: '', error: 'pnpm is not installed or not found in PATH' };
      }
      return { stdout: execErr.stdout ?? '', stderr: execErr.stderr ?? '' };
    }
    return { stdout: '', stderr: '', error: err instanceof Error ? err.message : String(err) };
  }
}

// #endregion

// #region Main

export async function pnpmAudit({
  targetPath,
  artifactsPath,
  fileSystem,
}: {
  targetPath: string;
  artifactsPath: string;
  fileSystem?: FileSystem;
}): Promise<PnpmAuditReport> {
  const fs = fileSystem || new NodeFileSystem();
  const resolvedRoot = path.resolve(targetPath);

  if (!(await fs.exists(resolvedRoot))) {
    throw new Error(`Path does not exist: ${resolvedRoot}`);
  }
  if (!(await fs.isDirectory(resolvedRoot))) {
    throw new Error(`Path is not a directory: ${resolvedRoot}`);
  }

  console.log(`Scanning ${resolvedRoot} for pnpm packages...\n`);

  const workspaces = await detectWorkspaces(resolvedRoot, fs);
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
  for (const [auditRoot, memberDirs] of workspaceAuditRoots) {
    counter++;
    const relDir = path.relative(resolvedRoot, auditRoot) || '.';
    console.log(
      `(${counter}/${totalAuditRuns}) ${relDir} (workspace root, ${memberDirs.length} packages)`,
    );

    const { stdout, stderr, error } = await runPnpmAudit(auditRoot);

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

    const { stdout, stderr, error } = await runPnpmAudit(strayDir);

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

  // Build result
  const totalVulnerabilities = packages.reduce((sum, p) => sum + p.vulnerabilities.length, 0);
  const bySeverity: Record<string, number> = {};
  for (const pkg of packages) {
    for (const v of pkg.vulnerabilities) {
      bySeverity[v.severity] = (bySeverity[v.severity] ?? 0) + 1;
    }
  }
  const packagesWithVulnerabilities = packages.filter((p) => p.vulnerabilities.length > 0).length;
  const strayPackages = strayPackageDirs.map((d) => path.relative(resolvedRoot, d) || '.');

  const report: PnpmAuditReport = {
    succeeded: totalVulnerabilities === 0,
    rootPath: resolvedRoot,
    packages,
    totalVulnerabilities,
    bySeverity,
    packagesWithVulnerabilities,
    strayPackages,
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
