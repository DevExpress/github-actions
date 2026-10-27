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

interface NpmAuditVia {
  source: number;
  name: string;
  title: string;
  url: string;
  severity: string;
  range: string;
}

interface NpmAuditEntry {
  via: (NpmAuditVia | string)[];
  fixAvailable: unknown;
}

export function parseNpmAuditOutput(stdout: string): ParsedAuditOutput {
  const root = tryParseJson(stdout.trim());
  if (!root) {
    return { vulnerabilities: [], error: stdout.trim() || 'Invalid npm audit output format' };
  }
  if (root['error']) {
    return { vulnerabilities: [], error: JSON.stringify(root['error']) };
  }

  const entries = (root['vulnerabilities'] ?? {}) as Record<string, NpmAuditEntry>;
  const result: AuditVulnerability[] = [];
  for (const entry of Object.values(entries)) {
    for (const via of entry.via) {
      if (typeof via === 'string') continue;
      result.push({
        id: String(via.source),
        name: via.name,
        severity: via.severity,
        severityLevel: parseSeverityLevel(via.severity),
        title: via.title,
        url: via.url,
        vulnerableRange: via.range,
        fixAvailable: !!entry.fixAvailable,
      });
    }
  }
  return { vulnerabilities: result };
}

// npm workspace members live under the lock file dir, so isSubdirectory covers them
export async function detectNpmWorkspaces(
  rootPath: string,
  fs: FileSystem,
): Promise<WorkspaceInfo[]> {
  const dirs = await findLockFiles(rootPath, 'package-lock.json', fs);
  return dirs.map((dir) => ({
    packageManager: 'npm',
    lockFileDir: dir,
    memberPatterns: [],
    memberDirs: new Set([path.resolve(dir)]),
  }));
}
