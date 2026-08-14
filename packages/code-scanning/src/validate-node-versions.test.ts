import { validateNodeVersions } from './validate-node-versions';
import { FileSystemMock } from './file-system';

describe('validateNodeVersions', () => {
  it('should detect version from package.json engines', async () => {
    const fs = new FileSystemMock({
      '/repo': { isDir: true, children: ['package.json'] },
      '/repo/package.json': {
        isDir: false,
        content: JSON.stringify({ engines: { node: '>=22.21.1' } }),
      },
      artifacts: { isDir: true, children: ['node-version-check.json'] },
      'artifacts/node-version-check.json': { isDir: false, content: '{}' },
    });

    const report = await validateNodeVersions({
      targetPath: '/repo',
      artifactsPath: 'artifacts',
      fileSystem: fs,
    });

    expect(report.succeeded).toBe(true);
    expect(report.detectedVersions).toContainEqual(
      expect.objectContaining({
        file: 'package.json',
        location: 'engines.node',
        version: '>=22.21.1',
        normalizedVersion: '22.21.1',
      }),
    );
  });

  it('should detect version from .nvmrc', async () => {
    const fs = new FileSystemMock({
      '/repo': { isDir: true, children: ['.nvmrc'] },
      '/repo/.nvmrc': { isDir: false, content: 'v22.21.1' },
      artifacts: { isDir: true, children: ['node-version-check.json'] },
      'artifacts/node-version-check.json': { isDir: false, content: '{}' },
    });

    const report = await validateNodeVersions({
      targetPath: '/repo',
      artifactsPath: 'artifacts',
      fileSystem: fs,
    });

    expect(report.succeeded).toBe(true);
    expect(report.detectedVersions).toContainEqual(
      expect.objectContaining({
        file: '.nvmrc',
        version: 'v22.21.1',
        normalizedVersion: '22.21.1',
      }),
    );
  });

  it('should report error for unsafe versions', async () => {
    const fs = new FileSystemMock({
      '/repo': { isDir: true, children: ['package.json'] },
      '/repo/package.json': {
        isDir: false,
        content: JSON.stringify({ engines: { node: '18.0.0' } }),
      },
      artifacts: { isDir: true, children: ['node-version-check.json'] },
      'artifacts/node-version-check.json': { isDir: false, content: '{}' },
    });

    const report = await validateNodeVersions({
      targetPath: '/repo',
      artifactsPath: 'artifacts',
      fileSystem: fs,
    });

    expect(report.succeeded).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        type: 'unsafe',
        severity: 'error',
        file: 'package.json',
      }),
    );
  });

  it('should detect version inconsistencies', async () => {
    const fs = new FileSystemMock({
      '/repo': { isDir: true, children: ['package.json', '.nvmrc'] },
      '/repo/package.json': {
        isDir: false,
        content: JSON.stringify({ engines: { node: '22.21.1' } }),
      },
      '/repo/.nvmrc': { isDir: false, content: '23.11.1' },
      artifacts: { isDir: true, children: ['node-version-check.json'] },
      'artifacts/node-version-check.json': { isDir: false, content: '{}' },
    });

    const report = await validateNodeVersions({
      targetPath: '/repo',
      artifactsPath: 'artifacts',
      fileSystem: fs,
    });

    expect(report.succeeded).toBe(true);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        type: 'inconsistent',
        severity: 'warning',
      }),
    );
  });

  it('should report error when no version files exist', async () => {
    const fs = new FileSystemMock({
      '/repo': { isDir: true, children: [] },
      artifacts: { isDir: true, children: ['node-version-check.json'] },
      'artifacts/node-version-check.json': { isDir: false, content: '{}' },
    });

    const report = await validateNodeVersions({
      targetPath: '/repo',
      artifactsPath: 'artifacts',
      fileSystem: fs,
    });

    expect(report.succeeded).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        type: 'missing',
        severity: 'error',
        message: 'No Node.js version specifications found in the repository.',
      }),
    );
  });

  it('should report warning for missing package.json engines.node', async () => {
    const fs = new FileSystemMock({
      '/repo': { isDir: true, children: ['.nvmrc'] },
      '/repo/.nvmrc': { isDir: false, content: '22.21.1' },
      artifacts: { isDir: true, children: ['node-version-check.json'] },
      'artifacts/node-version-check.json': { isDir: false, content: '{}' },
    });

    const report = await validateNodeVersions({
      targetPath: '/repo',
      artifactsPath: 'artifacts',
      fileSystem: fs,
    });

    expect(report.succeeded).toBe(true);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        type: 'missing',
        severity: 'warning',
        file: 'package.json',
      }),
    );
  });

  it('should report error for outdated versions', async () => {
    const fs = new FileSystemMock({
      '/repo': { isDir: true, children: ['package.json'] },
      '/repo/package.json': {
        isDir: false,
        content: JSON.stringify({ engines: { node: '22.0.0' } }),
      },
      artifacts: { isDir: true, children: ['node-version-check.json'] },
      'artifacts/node-version-check.json': { isDir: false, content: '{}' },
    });

    const report = await validateNodeVersions({
      targetPath: '/repo',
      artifactsPath: 'artifacts',
      fileSystem: fs,
    });

    expect(report.succeeded).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        type: 'outdated',
        severity: 'error',
      }),
    );
  });
});
