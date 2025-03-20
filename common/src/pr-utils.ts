
import * as core from '@actions/core';
import { context, getOctokit } from '@actions/github';
import { components } from '@octokit/openapi-types';
import { execCommand } from './common-utils';

export async function getPrRevisionRange(): Promise<{
    head: string;
    base: string;
}> {
    return getPrRevisionRangeImpl().then((r) => {
        core.info(`Base commit: ${r.base}`);
        core.info(`Head commit: ${r.head}`);
        return r;
    });
}

async function getPrRevisionRangeImpl(): Promise<{
    head: string;
    base: string;
}> {
    switch (context.eventName) {
        case 'pull_request':
        const baseBranch = context.payload.pull_request?.base?.ref;
        await execCommand(`git fetch origin`);
        
        return {
            base: await execCommand(`git rev-parse origin/${baseBranch}`),
            head: context.payload.pull_request?.head?.sha,
        };
        
        case 'push':
        
        return {
            base: normalizeCommit(context.payload.before),
            head: context.payload.after,
        };
        default:
        throw new Error(`This action only supports pull requests and pushes, ${context.eventName} events are not supported.`);
    }
}
function normalizeCommit(commit: string) {
    return commit === '0000000000000000000000000000000000000000' ? 'HEAD^' : commit;
}

interface ChangedFile {
    path: string;
    status: components['schemas']['diff-entry']['status'];
}

export async function getChangedFiles(token: string): Promise<ChangedFile[]> {
    return getChangedFilesImpl(token).then((files) => {
        core.info(`${files.length} changed files: ${JSON.stringify(files, undefined, 2)}`)
        return files;
    });
}

async function getChangedFilesImpl(token: string): Promise<ChangedFile[]> {
    try {
        const octokit = getOctokit(token);

        if (context.payload.pull_request == null) {
            core.setFailed('Getting changed files only works on pull request events.');
            return [];
        }

        const entries = await octokit.paginate(octokit.rest.pulls.listFiles, {
            owner: context.repo.owner,
            repo: context.repo.repo,
            pull_number: context.payload.pull_request.number,
        });

        return entries.map(({ filename, status }) => ({ path: filename, status }));
    } catch (error) {
        core.setFailed(`Getting changed files failed with error: ${error}`);
        return [];
    }
}