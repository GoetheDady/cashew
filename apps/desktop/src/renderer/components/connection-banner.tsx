import { Warning, XCircle } from '@phosphor-icons/react';
import { useDaemonConnection } from '../use-daemon-connection';

/**
 * Daemon 连接状态横幅。
 *
 * 正常状态下不渲染任何 UI。
 * 异常时显示对应的提示条。
 */
export function ConnectionBanner() {
  const { status, isLoading, hasError, errorMessage } = useDaemonConnection();

  if (status.state === 'connected' || status.state === 'disconnected') {
    return null;
  }

  if (isLoading) {
    return (
      <div className="connection-banner connection-banner--loading" role="status">
        <span className="connection-banner__spinner" aria-hidden="true" />
        <span>正在连接到 Cashew 服务...</span>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="connection-banner connection-banner--error" role="alert">
        <XCircle size={18} />
        <span>{errorMessage || '无法连接到 Cashew 服务'}</span>
      </div>
    );
  }

  return null;
}
