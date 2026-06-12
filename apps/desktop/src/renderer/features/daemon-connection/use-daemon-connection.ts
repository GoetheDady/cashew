import { useCallback, useEffect, useState } from 'react';
import type { DaemonStatus } from '@cashew/shared';
import { requestDaemonReconnect } from './daemon-reconnect';

/**
 * Daemon 连接状态 hook。
 *
 * 负责：
 * - 初始化时获取当前状态
 * - 订阅状态变更
 * - 派生 UI 就绪标记
 */
export function useDaemonConnection(): {
  status: DaemonStatus;
  isConnected: boolean;
  isLoading: boolean;
  hasError: boolean;
  errorMessage: string | null;
  reconnect: () => Promise<void>;
} {
  const [status, setStatus] = useState<DaemonStatus>({ state: 'disconnected' });

  useEffect(() => {
    // 获取初始状态
    window.cashew.getDaemonStatus().then(setStatus);

    // 订阅状态变更
    const unsubscribe = window.cashew.subscribeDaemonStatus(setStatus);
    return unsubscribe;
  }, []);

  const reconnect = useCallback(async () => {
    await requestDaemonReconnect(window.cashew, () => window.location.reload());
  }, []);

  return {
    status,
    isConnected: status.state === 'connected',
    isLoading: status.state === 'connecting',
    hasError: status.state === 'error',
    errorMessage: status.state === 'error' ? status.message : null,
    reconnect,
  };
}
