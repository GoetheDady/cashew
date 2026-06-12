import { CircleAlert, RotateCw, X } from 'lucide-react';
import { Button } from '../../components/ui/button';

type DaemonErrorDialogProps = {
  message: string;
  isReconnecting: boolean;
  onClose: () => void;
  onReconnect: () => void;
};

export function DaemonErrorDialog({
  message,
  isReconnecting,
  onClose,
  onReconnect,
}: DaemonErrorDialogProps) {
  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-[#211914]/25 px-6 backdrop-blur-sm"
      role="presentation"
    >
      <section
        aria-labelledby="daemon-error-title"
        aria-modal="true"
        className="relative w-full max-w-md rounded-2xl border border-red-200/80 bg-card p-6 shadow-[0_28px_80px_rgba(33,25,20,0.24)]"
        role="dialog"
      >
        <Button
          aria-label="关闭"
          className="absolute right-4 top-4"
          onClick={onClose}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X size={17} />
        </Button>
        <div className="grid h-11 w-11 place-items-center rounded-full bg-red-50 text-destructive">
          <CircleAlert size={22} />
        </div>
        <h2 className="mb-0 mt-4 text-lg font-bold" id="daemon-error-title">
          Cashew 本地服务已断开
        </h2>
        <p className="mb-0 mt-2 break-words text-sm leading-relaxed text-muted-foreground">
          {message}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={onClose} type="button" variant="secondary">
            关闭
          </Button>
          <Button disabled={isReconnecting} onClick={onReconnect} type="button">
            <RotateCw className={isReconnecting ? 'animate-spin' : undefined} size={17} />
            <span>{isReconnecting ? '正在重新连接...' : '重新连接'}</span>
          </Button>
        </div>
      </section>
    </div>
  );
}
