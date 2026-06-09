import * as core from '@actions/core';
import { getExecOutput } from '@actions/exec';

import { createHash } from 'crypto';
import { createWriteStream, chmodSync, mkdirSync, readFileSync } from 'fs';
import { get } from 'https';
import { tmpdir } from 'os';
import { join } from 'path';

import { splitPaths } from 'common';

type CycloneDxCliAsset = {
    file: string;
    bin: string;
    sha256: string;
};

const CYCLONEDX_CLI_VERSION = '0.32.0';
const inputs = {
    INPUT_FILE: 'input-file',
    INPUT_FILES: 'input-files',
    INPUT_FORMAT: 'input-format',
} as const;

const CYCLONEDX_CLI_ASSETS: Record<string, CycloneDxCliAsset> = {
    Linux: {
        file: 'cyclonedx-linux-x64',
        bin: 'cyclonedx',
        sha256: '454879e6a4a405c8a13bff49b8982adcb0596f3019b26b0811c66e4d7f0783e1',
    },
    Windows: {
        file: 'cyclonedx-win-x64.exe',
        bin: 'cyclonedx.exe',
        sha256: 'b1c00dbb40e628ec8c1252771871341ac4d4aaf032f832d83bd22cb2b1d258ae',
    },
    macOS: {
        file: 'cyclonedx-osx-arm64',
        bin: 'cyclonedx',
        sha256: '83be8a9599f1dce1252208bd4d0bb15308eca0546814fb72b48b7246d35e832e',
    },
};

async function run(): Promise<void> {
    try {
        const inputFormat = core.getInput(inputs.INPUT_FORMAT) || 'json';
        const inputFile = core.getInput(inputs.INPUT_FILE, { required: false });
        const inputFiles = core.getInput(inputs.INPUT_FILES, { required: false });
        const files = [
            ...splitPaths(inputFile),
            ...splitPaths(inputFiles),
        ];

        if (files.length === 0) {
            throw new Error('Set input-file or input-files.');
        }

        const cyclonedxPath = await installCycloneDxCli(CYCLONEDX_CLI_VERSION);

        for (const file of files) {
            await validateSbom(cyclonedxPath, inputFormat, file);
        }
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        } else {
            core.setFailed(String(error));
        }
    }
}

async function installCycloneDxCli(version: string): Promise<string> {
    const runnerOs = process.env.RUNNER_OS || 'Linux';
    const asset = CYCLONEDX_CLI_ASSETS[runnerOs] || CYCLONEDX_CLI_ASSETS.macOS;
    const toolDir = join(process.env.RUNNER_TEMP || tmpdir(), 'cyclonedx-cli');
    const toolPath = join(toolDir, asset.bin);
    const downloadUrl = `https://github.com/CycloneDX/cyclonedx-cli/releases/download/v${version}/${asset.file}`;

    mkdirSync(toolDir, { recursive: true });
    await downloadFile(downloadUrl, toolPath);
    verifySha256(toolPath, asset.sha256);

    try {
        chmodSync(toolPath, 0o755);
    } catch {
        core.debug(`Unable to chmod ${toolPath}.`);
    }

    return toolPath;
}

async function validateSbom(cyclonedxPath: string, inputFormat: string, inputFile: string): Promise<void> {
    const { exitCode, stdout, stderr } = await getExecOutput(cyclonedxPath, [
        'validate',
        '--fail-on-errors',
        '--input-format',
        inputFormat,
        '--input-file',
        inputFile,
    ], {
        ignoreReturnCode: true,
    });

    if (exitCode !== 0) {
        throw new Error(`CycloneDX validation failed for "${inputFile}": ${stderr || stdout}`);
    }
}

async function downloadFile(url: string, destination: string, redirectCount = 0): Promise<void> {
    if (redirectCount > 5) {
        throw new Error(`Too many redirects while downloading ${url}.`);
    }

    return new Promise((resolve, reject) => {
        get(url, response => {
            const statusCode = response.statusCode || 0;
            const location = response.headers.location;

            if ([301, 302, 303, 307, 308].includes(statusCode) && location) {
                response.resume();
                downloadFile(new URL(location, url).toString(), destination, redirectCount + 1).then(resolve, reject);
                return;
            }

            if (statusCode !== 200) {
                response.resume();
                reject(new Error(`Download failed with HTTP ${statusCode}: ${url}`));
                return;
            }

            const file = createWriteStream(destination);

            response.pipe(file);
            file.on('finish', () => file.close(error => error ? reject(error) : resolve()));
            file.on('error', reject);
        }).on('error', reject);
    });
}

function verifySha256(path: string, expectedSha256: string): void {
    const actualSha256 = createHash('sha256').update(readFileSync(path)).digest('hex');

    if (actualSha256 !== expectedSha256) {
        throw new Error(`Invalid CycloneDX CLI checksum. Expected ${expectedSha256}, got ${actualSha256}.`);
    }
}

run();
