import { describe, expect, it, vi } from 'vitest';
import { requestDaemonReconnect } from './daemon-reconnect';

describe('requestDaemonReconnect', () => {
  it('reloads the window when the running preload does not expose reconnectDaemon yet', async () => {
    const reload = vi.fn();

    await requestDaemonReconnect({}, reload);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('uses the preload reconnect API when it is available', async () => {
    const reconnectDaemon = vi.fn(() => Promise.resolve());
    const reload = vi.fn();

    await requestDaemonReconnect({ reconnectDaemon }, reload);

    expect(reconnectDaemon).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });
});
