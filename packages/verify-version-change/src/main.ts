import * as core from '@actions/core'

import path from 'path'
import semver from 'semver'

import { execCommand, getPrRevisionRange } from 'common';

async function run(): Promise<void> {
    try {
        const packageJsonPath = path.join(core.getInput('path'), 'package.json')

        const { head, base } = await getPrRevisionRange();

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
