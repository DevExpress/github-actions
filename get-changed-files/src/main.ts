import * as fs from 'fs';
import * as core from '@actions/core';

import {
    inputs,
    getChangedFiles,
    ensureDir,
    setOutputs,
    testPath,
} from 'common';


async function run(): Promise<void> {
    try {
        const pathPatterns = core.getInput(inputs.PATHS).split(';');
        const token = core.getInput(inputs.GH_TOKEN, { required: true });

        console.log('patterns: ' + JSON.stringify(pathPatterns, undefined, 2));

        const changedFiles = await getChangedFiles(token);
        const filteredFiles = pathPatterns.length > 0
            ? changedFiles.filter(({ path }) => testPath(path, pathPatterns))
            : changedFiles;

        setOutputs({
            json: JSON.stringify({
                files: filteredFiles,
                count: filteredFiles.length,
            }),
            files: filteredFiles.map(e => e.path),
            count: filteredFiles.length,
        });
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message)
        }
    }
}

run()
