
import * as core from '@actions/core'
import { context, getOctokit } from '@actions/github'
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

export async function getChangedFiles(token: string): Promise<string[]> {
    return getChangedFilesImpl(token).then((files) => {
        core.info(`${files.length} changed files: ${JSON.stringify(files, undefined, 2)}`)
        return files;
    });
}

async function getChangedFilesImpl(token: string): Promise<string[]> {
    try {
        const octokit = getOctokit(token);

        if (context.payload.pull_request == null) {
            core.setFailed('Getting changed files only works on pull request events.');
            return [];
        }

        const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
            owner: context.repo.owner,
            repo: context.repo.repo,
            pull_number: context.payload.pull_request.number,
        });

        return files.map(file => file.filename);
    } catch (error) {
        core.setFailed(`Getting changed files failed with error: ${error}`);
        return [];
    }
}