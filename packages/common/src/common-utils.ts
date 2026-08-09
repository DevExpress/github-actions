import { getExecOutput } from '@actions/exec'

export async function execCommand(command: string): Promise<string> {
  const { stdout, stderr, exitCode } = await getExecOutput(command)

  if (exitCode !== 0) {
    throw new Error(`Command "${command}" has been failed with error: ${stderr}`)
  }

  return stdout.trim()
}
