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

// #region pnpm audit parsing

interface PnpmAuditAdvisory {
  module_name?: string;
  severity?: string;
  title?: string;
  url?: string;
  vulnerable_versions?: string;
  patched_versions?: string;
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

export function parsePnpmAuditOutput(
  stdout: string,
  stderr: string,
): ParsedAuditOutput {
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

export async function detectPnpmWorkspaces(
  rootPath: string,
  fs: FileSystem,
): Promise<WorkspaceInfo[]> {
  const workspaces: WorkspaceInfo[] = [];

  for (const dir of await findLockFiles(rootPath, 'pnpm-lock.yaml', fs)) {
    const workspaceYaml = path.join(dir, 'pnpm-workspace.yaml');
    const memberPatterns = await parsePnpmWorkspaceYaml(workspaceYaml, fs);
    const memberDirs = await resolveWorkspaceMembers(dir, memberPatterns, fs);
    workspaces.push({ packageManager: 'pnpm', lockFileDir: dir, memberPatterns, memberDirs });
  }

  return workspaces;
}

// #endregion
