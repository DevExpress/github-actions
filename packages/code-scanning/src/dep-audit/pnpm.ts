import { FileSystem } from '../file-system';
import type { AuditVulnerability } from '../shared-types';
import {
  findLockFiles,
  parseSeverityLevel,
  tryParseJson,
  type ParsedAuditOutput,
  type WorkspaceInfo,
} from './common';

// #region pnpm audit parsing

interface PnpmAuditAdvisory {
  module_name?: string;
  severity?: string;
  title?: string;
  url?: string;
  vulnerable_versions?: string;
  patched_versions?: string;
}

export function parsePnpmAuditOutput(
  stdout: string,
  stderr: string,
): ParsedAuditOutput {
  const json = tryParseJson(stdout);
  if (json?.['advisories']) {
    return {
      vulnerabilities: extractFromAdvisories(json['advisories'] as Record<string, Record<string, unknown>>),
    };
  }
  const error = json?.['error']
    ? JSON.stringify(json['error'])
    : stderr.trim() || stdout.trim() || 'Audit output is empty';
  return { vulnerabilities: [], error };
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

export async function detectPnpmWorkspaces(
  rootPath: string,
  fs: FileSystem,
): Promise<WorkspaceInfo[]> {
  const dirs = await findLockFiles(rootPath, 'pnpm-lock.yaml', fs);
  return dirs.map((dir) => ({ packageManager: 'pnpm', lockFileDir: dir }));
}

// #endregion
