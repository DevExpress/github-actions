function stringifyArrayItem(item: unknown): string {
  switch (typeof item) {
    case 'number':
      return item.toString();

    case 'string':
      return `'${item}'`;

    default:
      return JSON.stringify(item);
  }
}

export function stringifyForShell(value: unknown): string {

  switch (typeof value) {

    case 'string':
      return value;

    case 'object':
      if (Array.isArray(value)) {
        return value.map(stringifyArrayItem).join(' ');
      }

      if (value === null) {
        return '';
      }

      return value.toString();

    default:
      return JSON.stringify(value);
  }
}