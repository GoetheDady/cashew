import { CircleX } from 'lucide-react';
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
      <div
        className="flex items-center gap-2 border-b border-border bg-slate-50 px-5 py-2 text-[13px] text-muted-foreground"
        role="status"
      >
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-primary"
          aria-hidden="true"
        />
        <span>正在连接到 Cashew 服务...</span>
      </div>
    );
  }

  if (hasError) {
    return (
      <div
        className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-5 py-2 text-[13px] text-red-800"
        role="alert"
      >
        <CircleX size={18} />
        <span>{errorMessage || '无法连接到 Cashew 服务'}</span>
      </div>
    );
  }

  return null;
}
