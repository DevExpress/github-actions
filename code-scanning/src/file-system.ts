import { promises as fs } from 'fs';

export interface FileSystem {
  readdir(path: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
  isDirectory(path: string): Promise<boolean>;
  readFile?(path: string): Promise<string>;
  writeFile?(path: string, content: string): Promise<void>;
  mkdir?(path: string, options?: { recursive?: boolean }): Promise<void>;
}

export class NodeFileSystem implements FileSystem {
  async readdir(dirPath: string): Promise<string[]> {
    return await fs.readdir(dirPath);
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async isDirectory(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  async readFile(filePath: string): Promise<string> {
    return await fs.readFile(filePath, 'utf-8');
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    await fs.mkdir(dirPath, options);
  }
}

export class FileSystemMock implements FileSystem {
  private files: Map<string, { isDir: boolean; children?: string[]; content?: string }>;

  constructor(
    structure: Record<string, { isDir: boolean; children?: string[]; content?: string }>,
  ) {
    this.files = new Map(Object.entries(structure));
  }

  async readdir(path: string): Promise<string[]> {
    const entry = this.files.get(path);
    if (!entry || !entry.isDir) {
      throw new Error(`Directory not found: ${path}`);
    }
    return entry.children || [];
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async isDirectory(path: string): Promise<boolean> {
    const entry = this.files.get(path);
    return entry?.isDir ?? false;
  }

  async readFile(path: string): Promise<string> {
    const entry = this.files.get(path);
    if (!entry || entry.isDir) {
      throw new Error(`File not found: ${path}`);
    }
    return entry.content || '';
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, { isDir: false, content });
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    if (!this.files.has(path)) {
      this.files.set(path, { isDir: true, children: [] });
    }
  }
}
