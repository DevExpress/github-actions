import * as fs from 'fs';
import * as core from '@actions/core';

import { inputs, filterPaths, getChangedFiles, ensureDir } from 'common';


async function run(): Promise<void> {
    try {
        const pathPatterns = core.getInput(inputs.PATHS).split(';');
        const token = core.getInput(inputs.GH_TOKEN, { required: true });
        const output = core.getInput(inputs.OUTPUT, { required: true });

        console.log('patterns: ' + JSON.stringify(pathPatterns, undefined, 2));

        const changedFiles = await getChangedFiles(token);
        const filteredFiles = filterPaths(changedFiles, pathPatterns);

        ensureDir(output);
        fs.writeFileSync(output, JSON.stringify(filteredFiles.map(filename => ({ filename })), undefined, 2));

        core.setOutput('files', JSON.stringify(filteredFiles));
        core.setOutput('json', JSON.stringify({
            files: filteredFiles,
            count: filteredFiles.length,
        }));
        core.setOutput('count', filteredFiles.length.toString().trim());
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message)
        }
    }
}

run()
