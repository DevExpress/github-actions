import type { AuditVulnerability } from '../shared-types';
import {
  parseSeverityLevel,
  tryParseJson,
  type ParsedAuditOutput,
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
    // bun colors its errors even when the output is not a terminal
    const error = (stdout.trim() || stderr.trim()).replace(/\x1b\[[0-9;]*m/g, '');
    return { vulnerabilities: [], error: error || 'Invalid bun audit output format' };
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
