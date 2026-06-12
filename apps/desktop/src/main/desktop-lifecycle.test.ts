import { describe, expect, it, vi } from 'vitest';
import { registerDesktopLifecycle, type DesktopLifecycleApp } from './desktop-lifecycle';

function createApp(): DesktopLifecycleApp & {
  emit(
    event: 'ready' | 'before-quit' | 'window-all-closed' | 'activate',
    lifecycleEvent?: { preventDefault(): void },
  ): Promise<void>;
} {
  const listeners = new Map<string, (event?: { preventDefault(): void }) => void | Promise<void>>();

  return {
    exit: vi.fn(),
    on: vi.fn((event, listener) => {
      listeners.set(event, listener);
    }),
    async emit(event, lifecycleEvent) {
      await listeners.get(event)?.(lifecycleEvent);
    },
  };
}

describe('Desktop lifecycle', () => {
  it('keeps the Daemon running when the last Desktop window closes', async () => {
    const app = createApp();
    const stopDaemon = vi.fn();

    registerDesktopLifecycle(app, {
      createWindow: vi.fn(),
      hasOpenWindows: () => false,
      startDaemon: vi.fn(),
      stopDaemon,
    });

    await app.emit('window-all-closed');

    expect(stopDaemon).not.toHaveBeenCalled();
  });

  it('stops the Daemon when the user explicitly Quits', async () => {
    const app = createApp();
    const stopDaemon = vi.fn();
    const event = { preventDefault: vi.fn() };

    registerDesktopLifecycle(app, {
      createWindow: vi.fn(),
      hasOpenWindows: () => false,
      startDaemon: vi.fn(),
      stopDaemon,
    });

    await app.emit('before-quit', event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(stopDaemon).toHaveBeenCalledTimes(1);
    expect(app.exit).toHaveBeenCalledWith(0);
  });
});
