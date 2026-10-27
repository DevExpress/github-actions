import * as path from 'path';

import { FileSystem } from '../file-system';
import type { AuditVulnerability } from '../shared-types';
import {
  findLockFiles,
  parseSeverityLevel,
  tryParseJson,
  type ParsedAuditOutput,
  type WorkspaceInfo,
} from './common';

interface BunAuditAdvisory {
  id: number;
  url: string;
  title: string;
  severity: string;
  vulnerable_versions: string;
}

// bun prints advisories grouped by package name: { "<name>": [advisory, ...] }
export function parseBunAuditOutput(stdout: string, stderr: string): ParsedAuditOutput {
  const root = tryParseJson(stdout.trim());
  if (!root) {
    return {
      vulnerabilities: [],
      error: stdout.trim() || stderr.trim() || 'Invalid bun audit output format',
    };
  }

  const result: AuditVulnerability[] = [];
  for (const [name, advisories] of Object.entries(root as Record<string, BunAuditAdvisory[]>)) {
    for (const a of advisories) {
      result.push({
        id: String(a.id),
        name,
        severity: a.severity,
        severityLevel: parseSeverityLevel(a.severity),
        title: a.title,
        url: a.url,
        vulnerableRange: a.vulnerable_versions,
        fixAvailable: false,
      });
    }
  }
  return { vulnerabilities: result };
}

// bun workspace members live under the lock file dir, so isSubdirectory covers them
export async function detectBunWorkspaces(
  rootPath: string,
  fs: FileSystem,
): Promise<WorkspaceInfo[]> {
  const dirs = await findLockFiles(rootPath, 'bun.lock', fs);
  return dirs.map((dir) => ({
    packageManager: 'bun',
    lockFileDir: dir,
    memberPatterns: [],
    memberDirs: new Set([path.resolve(dir)]),
  }));
}
