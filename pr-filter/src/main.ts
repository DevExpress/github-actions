import * as core from '@actions/core'

import { inputs, outputs, filterPaths, getChangedFiles } from 'common';

async function run(): Promise<void> {
    try {
        const pathPatterns = core.getInput(inputs.PATHS).split(';');
        const token = core.getInput(inputs.GH_TOKEN, { required: true });

        const changedFiles = (await getChangedFiles(token)).map(e => e.path);
        const filteredFiles = filterPaths(changedFiles, pathPatterns);

        core.setOutput(outputs.RESULT, filteredFiles.length > 0);
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message)
        }
    }
}

run()
