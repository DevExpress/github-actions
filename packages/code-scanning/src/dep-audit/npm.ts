import type { AuditVulnerability } from '../shared-types';
import {
  parseSeverityLevel,
  tryParseJson,
  type ParsedAuditOutput,
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
