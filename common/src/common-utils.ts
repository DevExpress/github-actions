import { setOutput } from '@actions/core';
import { getExecOutput } from '@actions/exec'
import { stringifyForShell } from './serialization-utils';

export async function execCommand(command: string): Promise<string> {
  const { stdout, stderr, exitCode } = await getExecOutput(command)

  if (exitCode !== 0) {
    throw new Error(`Command "${command}" has been failed with error: ${stderr}`)
  }

  return stdout.trim()
}

export function setOutputs(values: Record<string, unknown>): void {

  setOutput('json', JSON.stringify(values));

  for (const [key, value] of Object.entries(values)) {
    setOutput(key, stringifyForShell(value));
  }
}
