import { describe, expect, it } from 'vitest';
import { parseNpmAuditOutput } from './npm';
import { AuditSeverity } from '../shared-types';

describe('parseNpmAuditOutput', () => {
  it('should extract advisories from npm audit report', () => {
    const stdout = JSON.stringify({
      auditReportVersion: 2,
      vulnerabilities: {
        lodash: {
          via: [{
            source: 1094,
            name: 'lodash',
            title: 'Prototype Pollution',
            url: 'https://github.com/advisories/GHSA-p6mc-m468-83gw',
            severity: 'high',
            range: '<4.17.19',
          }],
          fixAvailable: true,
        },
        parent: { via: ['lodash'], fixAvailable: false },
      },
    });

    expect(parseNpmAuditOutput(stdout)).toEqual({
      vulnerabilities: [{
        id: '1094',
        name: 'lodash',
        severity: 'high',
        severityLevel: AuditSeverity.High,
        title: 'Prototype Pollution',
        url: 'https://github.com/advisories/GHSA-p6mc-m468-83gw',
        vulnerableRange: '<4.17.19',
        fixAvailable: true,
      }],
    });
  });

  it('should return error from npm audit report', () => {
    const result = parseNpmAuditOutput(JSON.stringify({ error: { code: 'ENOLOCK' } }));

    expect(result.vulnerabilities).toEqual([]);
    expect(result.error).toContain('ENOLOCK');
  });
});
