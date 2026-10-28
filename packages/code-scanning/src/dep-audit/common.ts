import * as path from 'path';

import { FileSystem } from '../file-system';
import { AuditSeverity, type AuditVulnerability } from '../shared-types';

export type PackageManager = 'pnpm' | 'npm' | 'bun';

export interface WorkspaceInfo {
  packageManager: PackageManager;
  lockFileDir: string;
}

export interface ParsedAuditOutput {
  vulnerabilities: AuditVulnerability[];
  error?: string;
}

export function parseSeverityLevel(severity?: string): AuditSeverity {
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

export function tryParseJson(text: string): Record<string, unknown> | undefined {
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

export async function findLockFiles(
  rootPath: string,
  lockFileName: string,
  fs: FileSystem,
): Promise<string[]> {
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
      } else if (entry === lockFileName) {
        results.push(dir);
      }
    }
  }

  await walk(rootPath);
  return results;
}
