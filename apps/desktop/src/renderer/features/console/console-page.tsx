import { ArrowLeft, KeyRound, MonitorCog, ServerCog, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/button';

const consoleSections = [
  {
    title: '模型',
    description: '模型和思考级别设置将在这里统一管理。',
    icon: SlidersHorizontal,
  },
  {
    title: '服务商',
    description: '在这里选择模型服务商并配置接口地址。',
    icon: ServerCog,
  },
  {
    title: '凭证',
    description: '在这里配置 API 密钥和查看认证状态。',
    icon: KeyRound,
  },
  {
    title: '运行状态',
    description: '在这里查看本地服务状态、日志和运行诊断信息。',
    icon: MonitorCog,
  },
];

export function ConsolePage() {
  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-[linear-gradient(180deg,#fffdf9_0%,#fbf8f2_100%)] text-foreground">
      <header className="window-frame-toolbar flex min-h-[4.375rem] items-center justify-between border-b border-border/70 px-8">
        <div>
          <p className="mb-1 mt-0 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Cashew
          </p>
          <h1 className="m-0 text-xl font-bold">控制台</h1>
        </div>
        <Button asChild variant="secondary">
          <Link to="/chat">
            <ArrowLeft size={17} />
            <span>返回聊天</span>
          </Link>
        </Button>
      </header>

      <section className="min-h-0 flex-1 overflow-y-auto px-[clamp(2rem,6vw,5.5rem)] py-10">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-2xl border border-border bg-card/90 p-8 shadow-[0_18px_42px_rgba(94,58,27,0.08)]">
            <p className="mb-3 mt-0 text-sm font-bold text-primary">设置中心</p>
            <h2 className="m-0 max-w-2xl text-[2rem] font-bold leading-tight">
              集中管理配置、运行状态和诊断信息。
            </h2>
            <p className="mb-0 mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              这里目前是控制台的基础页面。后续设置将逐步集中到对应区域，聊天体验保持不变。
            </p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            {consoleSections.map((section) => {
              const Icon = section.icon;
              return (
                <article
                  className="rounded-xl border border-border bg-card/75 p-5 shadow-[0_10px_28px_rgba(94,58,27,0.05)]"
                  key={section.title}
                >
                  <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-muted text-primary">
                    <Icon size={19} />
                  </div>
                  <h3 className="m-0 text-base font-bold">{section.title}</h3>
                  <p className="mb-0 mt-2 text-sm leading-relaxed text-muted-foreground">
                    {section.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
