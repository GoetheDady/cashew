import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startDaemonHost } from './host.js';

describe('Daemon host lifecycle', () => {
  it('starts, publishes service discovery, and stops through one public interface', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'cashew-host-test-'));
    const portFilePath = join(dataDir, 'daemon.port');

    try {
      const host = await startDaemonHost({
        dataDir,
        preferredPort: 0,
        allowPortFallback: false,
        registerSignals: false,
      });

      expect(existsSync(portFilePath)).toBe(true);
      expect(await fetch(`http://localhost:${host.port}/health`).then((response) => response.status))
        .toBe(200);

      await host.stop();
      expect(existsSync(portFilePath)).toBe(false);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
