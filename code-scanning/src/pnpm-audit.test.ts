import { filterIgnoredAdvisories } from './pnpm-audit';
import { AuditSeverity, type AuditVulnerability, type PackageAuditResult } from './shared-types';

function vuln(id: string, name = id): AuditVulnerability {
  return {
    id,
    name,
    severity: 'high',
    severityLevel: AuditSeverity.High,
    title: `${name} vulnerability`,
    fixAvailable: false,
  };
}

function pkg(dir: string, vulns: AuditVulnerability[]): PackageAuditResult {
  return {
    directory: `/root/${dir}`,
    relativeDirectory: dir,
    vulnerabilities: vulns,
    isWorkspaceMember: true,
  };
}

describe('filterIgnoredAdvisories', () => {
  it('should return packages unchanged when no advisories to ignore', () => {
    const packages = [pkg('a', [vuln('1'), vuln('2')])];
    const result = filterIgnoredAdvisories(packages);

    expect(result.processedPackages).toBe(packages);
    expect(result.ignoredVulnerabilities).toEqual([]);
  });

  it('should return packages unchanged when ignored list is empty', () => {
    const packages = [pkg('a', [vuln('1')])];
    const result = filterIgnoredAdvisories(packages, []);

    expect(result.processedPackages).toBe(packages);
    expect(result.ignoredVulnerabilities).toEqual([]);
  });

  it('should filter matching advisories from packages', () => {
    const v1 = vuln('1');
    const v2 = vuln('2');
    const packages = [pkg('a', [v1, v2])];
    const result = filterIgnoredAdvisories(packages, ['1']);

    expect(result.processedPackages).toHaveLength(1);
    expect(result.processedPackages[0].vulnerabilities).toEqual([v2]);
    expect(result.ignoredVulnerabilities).toEqual([v1]);
  });

  it('should not mutate original packages', () => {
    const v1 = vuln('1');
    const v2 = vuln('2');
    const original = [pkg('a', [v1, v2])];
    filterIgnoredAdvisories(original, ['1']);

    expect(original[0].vulnerabilities).toEqual([v1, v2]);
  });

  it('should collect ignored vulnerabilities across multiple packages', () => {
    const packages = [
      pkg('a', [vuln('1', 'foo'), vuln('2')]),
      pkg('b', [vuln('1', 'bar'), vuln('3')]),
    ];
    const result = filterIgnoredAdvisories(packages, ['1']);

    expect(result.processedPackages[0].vulnerabilities).toEqual([vuln('2')]);
    expect(result.processedPackages[1].vulnerabilities).toEqual([vuln('3')]);
    expect(result.ignoredVulnerabilities).toHaveLength(2);
    expect(result.ignoredVulnerabilities.map((v) => v.name)).toEqual(['foo', 'bar']);
  });

  it('should handle advisory IDs that match nothing', () => {
    const v1 = vuln('1');
    const packages = [pkg('a', [v1])];
    const result = filterIgnoredAdvisories(packages, ['999']);

    expect(result.processedPackages[0].vulnerabilities).toEqual([v1]);
    expect(result.ignoredVulnerabilities).toEqual([]);
  });

  it('should preserve packages without matching vulnerabilities by reference', () => {
    const packages = [pkg('a', [vuln('1')]), pkg('b', [vuln('2')])];
    const result = filterIgnoredAdvisories(packages, ['1']);

    expect(result.processedPackages[1]).toBe(packages[1]);
  });
});
