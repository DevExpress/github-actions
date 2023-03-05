import * as core from '@actions/core'
import { context } from '@actions/github'
import { getExecOutput } from '@actions/exec'

import path from 'path'
import semver from 'semver'

const execCommand = async (command: string): Promise<string> => {
    const { stdout, stderr, exitCode } = await getExecOutput(command)

    if (exitCode !== 0) {
        throw new Error(`Command "${command}" has been failed with error: ${stderr}`)
    }

    return stdout.trim()
}

async function run(): Promise<void> {
    try {
        const packageJsonPath = path.join(core.getInput('path'), 'package.json')

        const eventName = context.eventName

        let base: string | undefined
        let head: string | undefined

        switch (eventName) {
            case 'pull_request':
                const baseBranch = context.payload.pull_request?.base?.ref
                await execCommand(`git fetch origin`)

                base = await execCommand(`git rev-parse origin/${baseBranch}`)
                head = context.payload.pull_request?.head?.sha
                break
            case 'push':
                base = context.payload.before
                head = context.payload.after

                if (base === '0000000000000000000000000000000000000000') {
                    base = 'HEAD^'
                }
                break
            default:
                throw new Error(`This action only supports pull requests and pushes, ${context.eventName} events are not supported.`)
        }

        core.info(`Base commit: ${base}`)
        core.info(`Head commit: ${head}`)

        // https://git-scm.com/docs/git-diff#Documentation/git-diff.txt---word-diffltmodegt
        const diff = await execCommand(`git diff --word-diff ${base} ${head} ${packageJsonPath}`)

        const versionRegExp = new RegExp(/"version": \[-"(.*)",-]{\+"(.*)",\+}/)
        const regExpResult = diff.match(versionRegExp)

        if (regExpResult != null) {
            const [ _, oldVersion, newVersion ] = regExpResult

            if (semver.valid(oldVersion) == null) {
                throw new Error(`The old version "${oldVersion}" is invalid.`)
            }

            if (semver.valid(newVersion) == null) {
                throw new Error(`The new version "${newVersion}" is invalid.`)
            }

            core.setOutput('changed', 'true')
            core.setOutput('version', newVersion)
        } else {
            core.setOutput('changed', 'false')
            core.setOutput('version', 'undefined')
        }
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message)
        }
    }
}

run()
