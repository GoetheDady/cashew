import type { DaemonStatus } from '@cashew/shared';
import { RotateCw } from 'lucide-react';
import logoLockup from '../../assets/cashew-logo-lockup.png';
import { Button } from '../../components/ui/button';

type DaemonConnectionScreenProps = {
  status: DaemonStatus;
  onReconnect: () => void;
};

export function DaemonConnectionScreen({
  status,
  onReconnect,
}: DaemonConnectionScreenProps) {
  const hasError = status.state === 'error';

  return (
    <main className="window-frame-toolbar flex h-screen w-screen items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgba(242,233,221,0.8),transparent_32%),linear-gradient(180deg,#fffdf9_0%,#fbf8f2_100%)] px-6 text-foreground">
      <section className="grid w-full max-w-md justify-items-center rounded-2xl border border-border/80 bg-card/90 px-10 py-12 text-center shadow-[0_24px_70px_rgba(94,58,27,0.12)] backdrop-blur-xl">
        <img
          className="h-14 w-44 object-contain mix-blend-multiply"
          src={logoLockup}
          alt="Cashew"
        />
        <div
          className={`mt-8 grid h-12 w-12 place-items-center rounded-full ${
            hasError ? 'bg-red-50 text-destructive' : 'bg-muted text-primary'
          }`}
        >
          <RotateCw className={hasError ? undefined : 'animate-spin'} size={22} />
        </div>
        <h1 className="mb-0 mt-5 text-xl font-bold">
          {hasError ? '无法连接' : '正在连接 Cashew'}
        </h1>
        <p className="mb-0 mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {hasError
            ? status.message
            : '正在启动本地服务并准备聊天界面...'}
        </p>
        {hasError ? (
          <Button className="mt-7" onClick={onReconnect} type="button">
            <RotateCw size={17} />
            <span>重新连接</span>
          </Button>
        ) : null}
      </section>
    </main>
  );
}
