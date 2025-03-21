import { stringifyForShell } from "./serialization-utils";

describe('action utils', () => {

  describe(stringifyForShell.name, () => {
    test.each([
      { value: 123, expected: '123' },
      { value: 'abc', expected: 'abc' },
    ])('scalar cases [%#]', ({ value, expected }) => {
      expect(stringifyForShell(value)).toEqual(expected);
    });
  });

  describe(stringifyForShell.name, () => {
    test.each([
      { value: [123, 456], expected: '123 456' },
      { value: ['abc', 'def'], expected: '\'abc\' \'def\'' },
    ])('array values [%#]', ({ value, expected }) => {
      expect(stringifyForShell(value)).toEqual(expected);
    });
  });

});
