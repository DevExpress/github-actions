import * as core from '@actions/core'
import * as picomatch from 'picomatch';

const NEGATION = '!';
const matchOptions: picomatch.PicomatchOptions = {
    dot: true,
    posix: true,
}

function match(path: string, pattern: string): boolean {
    return picomatch.isMatch(path.replace(/\\/g, '/'), pattern, matchOptions);
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
    return paths.filter(path => {
        return patterns.reduce((prevResult, pattern) => {
            return pattern.startsWith(NEGATION)
                ? prevResult && !match(path, pattern.substring(1))
                : prevResult || match(path, pattern);
        }, false);
    });
}

export function splitPaths(paths: string): string[] {
    return paths
        .split(/[\r\n,;]+/)
        .map(path => path.trim())
        .filter(path => path.length > 0);
}
