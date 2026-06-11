import type { DaemonStatus } from '@cashew/shared';

export interface DaemonStatusSender {
  isDestroyed(): boolean;
  send(channel: string, subscriptionId: string, status: DaemonStatus): void;
  once(event: 'destroyed', listener: () => void): this;
}

type SubscribeToDaemonStatus = (listener: (status: DaemonStatus) => void) => () => void;

interface SenderSubscriptions {
  subscriptions: Map<string, () => void>;
  hasDestroyListener: boolean;
}

export class DaemonStatusSubscriptionRegistry {
  private readonly senders = new WeakMap<DaemonStatusSender, SenderSubscriptions>();

  constructor(
    private readonly subscribeToDaemonStatus: SubscribeToDaemonStatus,
    private readonly channel = 'cashew:daemon-status-changed',
  ) {}

  subscribe(sender: DaemonStatusSender, subscriptionId: string): void {
    let entry = this.senders.get(sender);

    if (!entry) {
      entry = { subscriptions: new Map(), hasDestroyListener: false };
      this.senders.set(sender, entry);
    }

    if (entry.subscriptions.has(subscriptionId)) {
      return;
    }

    const unsubscribe = this.subscribeToDaemonStatus((status) => {
      if (!sender.isDestroyed()) {
        sender.send(this.channel, subscriptionId, status);
      }
    });

    entry.subscriptions.set(subscriptionId, unsubscribe);

    if (!entry.hasDestroyListener) {
      entry.hasDestroyListener = true;
      sender.once('destroyed', () => {
        this.unsubscribeAll(sender);
      });
    }
  }

  unsubscribe(sender: DaemonStatusSender, subscriptionId: string): void {
    const entry = this.senders.get(sender);
    if (!entry) return;

    const unsubscribe = entry.subscriptions.get(subscriptionId);
    if (!unsubscribe) return;

    unsubscribe();
    entry.subscriptions.delete(subscriptionId);
  }

  unsubscribeAll(sender: DaemonStatusSender): void {
    const entry = this.senders.get(sender);
    if (!entry) return;

    for (const unsubscribe of entry.subscriptions.values()) {
      unsubscribe();
    }

    entry.subscriptions.clear();
    this.senders.delete(sender);
  }
}
