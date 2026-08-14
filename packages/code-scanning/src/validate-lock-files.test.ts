import { discoverLockFiles } from './validate-lock-files';
import { FileSystemMock } from './file-system';

// Helper to create a directory entry
function dir(...children: string[]): { isDir: true; children: string[] } {
  return { isDir: true, children };
}

describe('discoverLockFiles', () => {
  it.each([
    ['npm', 'package-lock.json'],
    ['yarn', 'yarn.lock'],
    ['pnpm', 'pnpm-lock.yaml'],
    ['bun', 'bun.lockb'],
  ])('should find package.json with %s lock file', async (manager, lockFile) => {
    const fs = new FileSystemMock({
      '/root': dir('package.json', lockFile),
    });

    const results = await discoverLockFiles('/root', fs);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      packageJsonPath: 'package.json',
      lockFilePaths: [lockFile],
      workspacePackage: false,
    });
  });

  it('should detect missing lock file', async () => {
    const fs = new FileSystemMock({
      '/root': dir('package.json', 'index.js'),
    });

    const results = await discoverLockFiles('/root', fs);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      packageJsonPath: 'package.json',
      lockFilePaths: [],
      workspacePackage: false,
    });
  });

  it('should handle multiple lock files', async () => {
    const fs = new FileSystemMock({
      '/root': dir('package.json', 'package-lock.json', 'yarn.lock'),
    });

    const results = await discoverLockFiles('/root', fs);

    expect(results).toHaveLength(1);
    expect(results[0].lockFilePaths).toEqual(['package-lock.json', 'yarn.lock']);
  });

  it('should recursively scan subdirectories', async () => {
    const fs = new FileSystemMock({
      '/root': dir('package.json', 'yarn.lock', 'packages'),
      '/root/packages': dir('app1', 'app2'),
      '/root/packages/app1': dir('package.json', 'package-lock.json'),
      '/root/packages/app2': dir('package.json'),
    });

    const results = await discoverLockFiles('/root', fs);

    expect(results).toHaveLength(3);
    expect(
      results.find((r) => r.packageJsonPath === 'package.json')?.lockFilePaths.length,
    ).toBeGreaterThan(0);
    expect(
      results.find((r) => r.packageJsonPath === 'packages/app1/package.json')?.lockFilePaths.length,
    ).toBeGreaterThan(0);
    expect(
      results.find((r) => r.packageJsonPath === 'packages/app2/package.json')?.lockFilePaths.length,
    ).toBe(0);
  });

  it('should skip node_modules directory', async () => {
    const fs = new FileSystemMock({
      '/root': dir('package.json', 'yarn.lock', 'node_modules'),
      '/root/node_modules': dir('some-package'),
      '/root/node_modules/some-package': dir('package.json'),
    });

    const results = await discoverLockFiles('/root', fs);

    expect(results).toHaveLength(1);
    expect(results[0].packageJsonPath).toBe('package.json');
  });

  it('should skip common build directories', async () => {
    const fs = new FileSystemMock({
      '/root': dir('package.json', 'yarn.lock', 'dist', 'build', 'out'),
      '/root/dist': dir('package.json'),
      '/root/build': dir('package.json'),
      '/root/out': dir('package.json'),
    });

    const results = await discoverLockFiles('/root', fs);

    expect(results).toHaveLength(1);
    expect(results[0].packageJsonPath).toBe('package.json');
  });

  it('should handle directory without package.json', async () => {
    const fs = new FileSystemMock({
      '/root': dir('index.js', 'README.md'),
    });

    const results = await discoverLockFiles('/root', fs);

    expect(results).toHaveLength(0);
  });

  it('should handle nested monorepo structure', async () => {
    const fs = new FileSystemMock({
      '/root': dir('package.json', 'pnpm-lock.yaml', 'apps', 'libs'),
      '/root/apps': dir('web', 'mobile'),
      '/root/apps/web': dir('package.json'),
      '/root/apps/mobile': dir('package.json'),
      '/root/libs': dir('shared'),
      '/root/libs/shared': dir('package.json'),
    });

    const results = await discoverLockFiles('/root', fs);

    expect(results).toHaveLength(4);
    expect(results.slice(1).every((r) => r.lockFilePaths.length === 0)).toBe(true);
  });
});
