import { copyFileSync, chmodSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const outputDir = path.resolve('build/node/bin');
const executable = process.platform === 'win32' ? 'node.exe' : 'node';
const outputPath = path.join(outputDir, executable);

rmSync(path.resolve('build/node'), { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });
copyFileSync(process.execPath, outputPath);

if (process.platform !== 'win32') {
  chmodSync(outputPath, 0o755);
}

console.log(`[package] staged Node runtime at ${outputPath}`);
