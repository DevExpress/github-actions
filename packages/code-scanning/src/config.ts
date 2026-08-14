import JSON5 from 'json5';

export interface RepoCheckConfig {
  ignoredAdvisories?: string[];
}

export function parseRepoCheckConfig(input?: string): RepoCheckConfig {
  if (!input || !input.trim()) return {};
  return JSON5.parse(input) as RepoCheckConfig;
}
