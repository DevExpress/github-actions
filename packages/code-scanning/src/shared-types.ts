
//#region lock-files
export interface LockFileValidationEntry {
  packageJsonPath: string;
  lockFilePaths: string[];
  workspacePackage?: boolean;
}
export interface ValidationReport {
  succeeded: boolean;
  totalPackages: number;
  invalidPackages: number;
  validPackageFiles: LockFileValidationEntry[];
  invalidPackageFiles: string[];
}
export const LOCK_FILES_REPORT_FILENAME = 'lock-files-report.json';
//#endregion

//#region node-versions
export interface NodeVersionSource {
  file: string;
  location: string;
  version: string;
  normalizedVersion?: string;
}

export interface NodeVersionIssue {
  type: 'missing' | 'outdated' | 'unsafe' | 'inconsistent';
  severity: 'error' | 'warning';
  message: string;
  file?: string;
  suggestedVersion?: string;
}

export interface NodeVersionReport {
  succeeded: boolean;
  detectedVersions: NodeVersionSource[];
  issues: NodeVersionIssue[];
}
export const NODE_VERSIONS_REPORT_FILENAME = 'node-versions-report.json';
//#endregion

//#region pnpm-audit
export enum AuditSeverity {
  Info = 0,
  Low = 1,
  Moderate = 2,
  High = 3,
  Critical = 4,
}

export interface AuditVulnerability {
  id: string;
  name: string;
  severity: string;
  severityLevel: AuditSeverity;
  title: string;
  url?: string;
  vulnerableRange?: string;
  patchedVersions?: string;
  fixAvailable: boolean;
}

export interface PackageAuditResult {
  directory: string;
  relativeDirectory: string;
  vulnerabilities: AuditVulnerability[];
  error?: string;
  isWorkspaceMember: boolean;
}

export interface PnpmAuditReport {
  succeeded: boolean;
  rootPath: string;
  packages: PackageAuditResult[];
  totalVulnerabilities: number;
  bySeverity: Record<string, number>;
  packagesWithVulnerabilities: number;
  strayPackages: string[];
  ignoredAdvisories?: string[];
  ignoredVulnerabilities?: AuditVulnerability[];
}
export const PNPM_AUDIT_REPORT_FILENAME = 'pnpm-audit-report.json';
//#endregion