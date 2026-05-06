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
export const LOCK_FILES_REPORT_FILENAME = 'lock-files-report.json';
