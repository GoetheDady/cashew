import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { DaemonStatus } from '@cashew/shared';
import {
  DaemonStatusSubscriptionRegistry,
  type DaemonStatusSender,
} from './daemon-status-subscriptions';

class FakeSender extends EventEmitter implements DaemonStatusSender {
  sent: Array<[string, string, DaemonStatus]> = [];
  destroyed = false;

  isDestroyed(): boolean {
    return this.destroyed;
  }

  send(channel: string, subscriptionId: string, status: DaemonStatus): void {
    this.sent.push([channel, subscriptionId, status]);
  }
}

describe('DaemonStatusSubscriptionRegistry', () => {
  it('keeps one destroyed listener per sender even with many subscriptions', () => {
    const unsubscribeFns: Array<() => void> = [];
    const registry = new DaemonStatusSubscriptionRegistry(() => {
      const unsubscribe = vi.fn();
      unsubscribeFns.push(unsubscribe);
      return unsubscribe;
    });
    const sender = new FakeSender();

    for (let i = 0; i < 20; i += 1) {
      registry.subscribe(sender, `sub-${i}`);
    }

    expect(sender.listenerCount('destroyed')).toBe(1);
    expect(unsubscribeFns).toHaveLength(20);
  });

  it('unsubscribes individual subscriptions from the main process registry', () => {
    const unsubscribe = vi.fn();
    const registry = new DaemonStatusSubscriptionRegistry(() => unsubscribe);
    const sender = new FakeSender();

    registry.subscribe(sender, 'sub-1');
    registry.unsubscribe(sender, 'sub-1');

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('cleans up all subscriptions when the sender is destroyed', () => {
    const unsubscribeFns: Array<() => void> = [];
    const registry = new DaemonStatusSubscriptionRegistry(() => {
      const unsubscribe = vi.fn();
      unsubscribeFns.push(unsubscribe);
      return unsubscribe;
    });
    const sender = new FakeSender();

    registry.subscribe(sender, 'sub-1');
    registry.subscribe(sender, 'sub-2');
    sender.emit('destroyed');

    expect(unsubscribeFns[0]).toHaveBeenCalledTimes(1);
    expect(unsubscribeFns[1]).toHaveBeenCalledTimes(1);
  });
});
