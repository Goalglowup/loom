import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const execFileAsync = promisify(execFile);

/**
 * Creates a .tgz archive of the given directory in a temp file,
 * reads it into a Buffer, then removes the temp file.
 */
export async function tarDirectory(dirPath: string): Promise<Buffer> {
  const tmpFile = join(tmpdir(), `arachne-docs-${Date.now()}.tgz`);
  try {
    await execFileAsync('tar', ['-czf', tmpFile, '-C', dirPath, '.']);
    return readFileSync(tmpFile);
  } finally {
    try { rmSync(tmpFile); } catch { /* ignore cleanup errors */ }
  }
}
