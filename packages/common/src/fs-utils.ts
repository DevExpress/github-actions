import { mkdirSync } from 'fs';
import { dirname as getDirName } from 'path';

export function ensureDir(path: string): void {
    mkdirSync(getDirName(path), { recursive: true });
}