/**
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */

/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  clearMocks: true,
  testEnvironment: "node",
  testMatch: [
    "**/*.test.ts"
  ],
  transform: {
    "^.+.ts$": ["ts-jest", {}],
  },
};
