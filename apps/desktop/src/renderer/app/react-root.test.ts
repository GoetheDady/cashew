import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({
    render: vi.fn(),
  })),
}));

describe('getOrCreateRoot', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete (globalThis as { [key: symbol]: unknown })[Symbol.for('cashew.reactRootByContainer')];
  });

  it('reuses the React root for repeated renders into the same container', async () => {
    const { createRoot } = await import('react-dom/client');
    const { getOrCreateRoot } = await import('./react-root');
    const container = {} as Element;

    const firstRoot = getOrCreateRoot(container);
    const secondRoot = getOrCreateRoot(container);

    expect(secondRoot).toBe(firstRoot);
    expect(createRoot).toHaveBeenCalledTimes(1);
    expect(createRoot).toHaveBeenCalledWith(container);
  });

  it('keeps the root cache when the entry module is reloaded during development', async () => {
    const { createRoot } = await import('react-dom/client');
    const container = {} as Element;
    const firstModule = await import('./react-root');

    const firstRoot = firstModule.getOrCreateRoot(container);
    vi.resetModules();
    const reloadedModule = await import('./react-root');
    const secondRoot = reloadedModule.getOrCreateRoot(container);

    expect(secondRoot).toBe(firstRoot);
    expect(createRoot).toHaveBeenCalledTimes(1);
  });
});
