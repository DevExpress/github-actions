import * as fs from 'fs';
import * as core from '@actions/core';

import {
    inputs,
    getChangedFiles,
    ensureDir,
    setOutputs,
    testPath,
    normalizePatterns,
} from 'common';


async function run(): Promise<void> {
    try {
        const patterns = normalizePatterns(core.getInput(inputs.PATHS).split(';'));
        const token = core.getInput(inputs.GH_TOKEN, { required: true });
        const output = core.getInput(inputs.OUTPUT, { required: true });

        console.log('patterns: ' + JSON.stringify(patterns, undefined, 2));

        const changedFiles = await getChangedFiles(token);
        const filteredFiles = patterns === undefined
            ? changedFiles
            : changedFiles.filter(({ path }) => testPath(path, patterns));

        ensureDir(output);
        fs.writeFileSync(output, JSON.stringify(filteredFiles.map(({ path }) => ({ filename: path })), undefined, 2));

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
