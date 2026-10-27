import { describe, expect, it } from 'vitest';
import { parseBunAuditOutput } from './bun';
import { AuditSeverity } from '../shared-types';

describe('parseBunAuditOutput', () => {
  it('should extract advisories from bun audit report', () => {
    const stdout = JSON.stringify({
      lodash: [{
        id: 1106920,
        url: 'https://github.com/advisories/GHSA-p6mc-m468-83gw',
        title: 'Prototype Pollution in lodash',
        severity: 'high',
        vulnerable_versions: '>=3.7.0 <4.17.19',
      }],
    });

    expect(parseBunAuditOutput(stdout, '')).toEqual({
      vulnerabilities: [{
        id: '1106920',
        name: 'lodash',
        severity: 'high',
        severityLevel: AuditSeverity.High,
        title: 'Prototype Pollution in lodash',
        url: 'https://github.com/advisories/GHSA-p6mc-m468-83gw',
        vulnerableRange: '>=3.7.0 <4.17.19',
        fixAvailable: false,
      }],
    });
  });

  it('should return error when bun audit prints no JSON', () => {
    const result = parseBunAuditOutput('', 'error: Lockfile not found');

    expect(result.vulnerabilities).toEqual([]);
    expect(result.error).toContain('Lockfile not found');
  });
});
