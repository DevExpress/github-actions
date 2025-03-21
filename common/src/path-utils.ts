import * as core from '@actions/core'
import { MinimatchOptions, minimatch } from "minimatch";

const NEGATION = '!';
const matchOptions: MinimatchOptions = {
    dot: true,
}

function match(path: string, pattern: string): boolean {
    return minimatch(path.replace(/\\/g, '/'), pattern, matchOptions);
}

export function filterPaths(
    paths: string[],
    patterns: string[],
): string[] {
    core.debug('patterns: ' + JSON.stringify(patterns, undefined, 2));
    const filteredPaths = filterPathsImpl(paths, patterns);
    core.info(`${filteredPaths.length} filtered paths: ${JSON.stringify(filteredPaths, undefined, 2)}`);
    return filteredPaths;
}

function filterPathsImpl(
    paths: string[],
    patterns: string[],
): string[] {
    const normalizedPatterns = normalizePatterns(patterns);
    return normalizedPatterns === undefined
        ? paths
        : paths.filter(path => testPath(path, normalizedPatterns));
}

export function normalizePatterns(patterns?: (string | undefined)[]): string[] | undefined {
    if(!patterns) return undefined;

    const notEmptyPatterns = patterns.filter(p => p != undefined && p.length > 0);
    return (notEmptyPatterns.length > 0 ? notEmptyPatterns : undefined) as ReturnType<typeof normalizePatterns>;
}

export function testPath(path: string, patterns: string[]): boolean {
    return patterns.reduce((prevResult, pattern) => {
        return pattern.startsWith(NEGATION)
            ? prevResult && !match(path, pattern.substring(1))
            : prevResult || match(path, pattern);
    }, false);
}
