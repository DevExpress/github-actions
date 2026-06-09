import { filterPaths, splitPaths } from "./path-utils";

describe('path utils', () => {

    describe('filterPaths', () => {
        test.each([
            {
                paths: [],
                patterns: [],
                expected: []
            },
            {
                paths: ['a.ts', 'a.js', 'b.md'],
                patterns: ['b*.*'],
                expected: ['b.md']
            },
            {
                paths: ['a.ts', 'b.md'],
                patterns: ['**'],
                expected: ['a.ts', 'b.md']
            },
            {
                paths: ['a.ts', 'a.js', 'x/a.ts', 'x/a.js', 'x/y/a.ts', 'x/z/a.js'],
                patterns: ['*.ts'],
                expected: ['a.ts']
            },
            {
                paths: ['a.ts', 'a.js', 'x/a.ts', 'x/a.js', 'x/y/a.ts', 'x/z/a.js'],
                patterns: ['**/*.ts'],
                expected: ['a.ts', 'x/a.ts', 'x/y/a.ts']
            },
            {
                paths: ['a.ts', 'a.js', 'x/a.ts', 'x/a.js', 'x/y/a.ts', 'x/z/a.js'],
                patterns: ['**/y/*.*'],
                expected: ['x/y/a.ts']
            },
        ])('basic cases [%#]', ({ paths, patterns, expected }) => {
            expect(filterPaths(paths, patterns)).toEqual(expected);
        });
    });

    describe('filterPaths', () => {
        test.each([
            // #region cases with negation
            {
                paths: ['a.ts', 'a.js', 'b.md'],
                patterns: ['**', '!*.md'],
                expected: ['a.ts', 'a.js']
            },
            {
                paths: ['a.ts', 'a.js', 'b.md'],
                patterns: ['**', '!b*'],
                expected: ['a.ts', 'a.js']
            },
            {
                paths: ['a.ts', 'a.js', 'x/a.ts', 'x/a.js', 'x/y/a.ts', 'x/z/a.js'],
                patterns: ['**', '!*.js'],
                expected: ['a.ts', 'x/a.ts', 'x/a.js', 'x/y/a.ts', 'x/z/a.js']
            },
            {
                paths: ['a.ts', 'a.js', 'x/a.ts', 'x/a.js', 'x/y/a.ts', 'x/z/a.js'],
                patterns: ['**', '!**/*.js'],
                expected: ['a.ts', 'x/a.ts', 'x/y/a.ts']
            },
            {
                paths: ['a.ts', 'a.js', 'x/a.ts', 'x/a.js', 'x/y/a.ts', 'x/z/a.js'],
                patterns: ['**', '!**/{y,z}/*.*'],
                expected: ['a.ts', 'a.js', 'x/a.ts', 'x/a.js',]
            },
            // #endregion
        ])('negation cases [%#]', ({ paths, patterns, expected }) => {
            expect(filterPaths(paths, patterns)).toEqual(expected);
        });
    });

    describe('filterPaths', () => {
        test.each([
            { // starting with dot
                paths: ['.a/b.ts'],
                patterns: ['**'],
                expected: ['.a/b.ts']
            },
            {   // backslash
                paths: ['a\\b\\c.ts'],
                patterns: ['**/b/*.*'],
                expected: ['a\\b\\c.ts']
            },
        ])('specific cases [%#]', ({ paths, patterns, expected }) => {
            expect(filterPaths(paths, patterns)).toEqual(expected);
        });
    });

    describe('splitPaths', () => {
        test.each([
            {
                paths: '',
                expected: []
            },
            {
                paths: 'a.cdx.json',
                expected: ['a.cdx.json']
            },
            {
                paths: 'a.cdx.json,b.cdx.json',
                expected: ['a.cdx.json', 'b.cdx.json']
            },
            {
                paths: 'a.cdx.json;b.cdx.json',
                expected: ['a.cdx.json', 'b.cdx.json']
            },
            {
                paths: 'a.cdx.json\r\nb.cdx.json\n c.cdx.json ',
                expected: ['a.cdx.json', 'b.cdx.json', 'c.cdx.json']
            },
        ])('basic cases [%#]', ({ paths, expected }) => {
            expect(splitPaths(paths)).toEqual(expected);
        });
    });
});
