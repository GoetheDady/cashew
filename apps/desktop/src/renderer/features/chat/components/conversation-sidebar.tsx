import type { DaemonStatus, Conversation } from '@cashew/shared';
import { RotateCw, Search, Settings, Sparkles, SquarePen, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import logoLockup from '../../../assets/cashew-logo-lockup.png';
import { cn } from '../../../lib/utils';
import { formatDay, formatTime } from '../lib/chat-formatters';

type ConversationSidebarProps = {
  sessions: Conversation[];
  activeSessionId: string | null;
  searchTerm: string;
  isLoading: boolean;
  daemonStatus: DaemonStatus;
  onSearchTermChange: (searchTerm: string) => void;
  onCreateSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  onReconnect: () => void;
};

export function ConversationSidebar({
  sessions,
  activeSessionId,
  searchTerm,
  isLoading,
  daemonStatus,
  onSearchTermChange,
  onCreateSession,
  onDeleteSession,
  onReconnect,
}: ConversationSidebarProps) {
  const isConnected = daemonStatus.state === 'connected';
  const isConnecting = daemonStatus.state === 'connecting';
  const filteredSessions = sessions.filter((session) =>
    session.title.toLowerCase().includes(searchTerm.trim().toLowerCase()),
  );

  const groupedSessions = filteredSessions.reduce<Record<string, Conversation[]>>(
    (groups, session) => {
      const group = formatDay(session.updated_at);
      return {
        ...groups,
        [group]: [...(groups[group] || []), session],
      };
    },
    {},
  );

  return (
    <aside
      className="conversation-sidebar flex min-h-0 min-w-0 flex-col border-r border-white/55 bg-[linear-gradient(180deg,rgba(255,253,249,0.58),rgba(250,246,239,0.66))] px-[1.125rem] pb-4 pt-5 shadow-[inset_-1px_0_rgba(139,90,43,0.04)] backdrop-blur-xl"
      aria-label="对话"
    >
      <div className="window-frame-logo-row flex h-12 items-center gap-3">
        <img
          className="h-11 w-32 object-contain object-left mix-blend-multiply"
          src={logoLockup}
          alt="Cashew"
        />
      </div>

      <Button
        className="mt-[1.125rem] h-[2.625rem] shadow-[0_8px_20px_rgba(94,58,27,0.14)]"
        disabled={!isConnected}
        onClick={onCreateSession}
        type="button"
      >
        <SquarePen size={18} />
        <span>新对话</span>
      </Button>

      <Button
        asChild
        className="mt-2 h-[2.625rem] justify-start border-border bg-card/80"
        variant="secondary"
      >
        <Link to="/console">
          <Settings size={17} />
          <span>控制台</span>
        </Link>
      </Button>

      <label className="mt-3 flex h-10 items-center gap-2.5 rounded-lg border border-border bg-card/80 px-3 text-[#9a9086] focus-within:border-primary/30 focus-within:bg-card">
        <Search size={18} />
        <span className="sr-only">搜索对话</span>
        <input
          className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-foreground outline-none placeholder:text-[#9a9086]"
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
          placeholder="搜索对话..."
        />
      </label>

      <div className="mt-[1.375rem] flex items-center justify-between text-[11px] font-bold tracking-[0.02em] text-muted-foreground">
        <span>对话</span>
        <span className="grid h-5 min-w-6 place-items-center rounded-full border border-border bg-card/70 text-[10px]">
          {filteredSessions.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-3 pr-1 [scrollbar-gutter:stable]">
        {isLoading && sessions.length === 0 ? (
          <div className="grid gap-2" aria-label="正在加载对话">
            {[0, 1, 2].map((item) => (
              <span key={item} className="h-11 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="grid place-items-center gap-2.5 rounded-lg border border-dashed border-[#d8cabb] px-[1.125rem] py-8 text-center text-muted-foreground">
            <Sparkles size={22} />
            <p className="m-0 font-bold text-foreground">没有找到对话</p>
            <Button size="sm" onClick={onCreateSession} type="button">
              开始新对话
            </Button>
          </div>
        ) : (
          Object.entries(groupedSessions).map(([group, groupSessions]) => (
            <section key={group} className="mb-5">
              <h2 className="mb-1.5 mt-0 text-[11px] font-bold text-muted-foreground">
                {group}
              </h2>
              <div className="grid gap-1">
                {groupSessions.map((session) => (
                  <article
                    key={session.id}
                    className={cn(
                      'group relative grid rounded-lg transition-colors duration-150',
                      activeSessionId !== session.id && 'hover:bg-accent/50',
                      activeSessionId === session.id && 'bg-accent',
                    )}
                  >
                    <Button
                      asChild
                      className="grid min-h-[2.875rem] grid-cols-[minmax(0,1fr)_auto] gap-2.5 bg-transparent px-3 py-2 pr-[2.125rem] text-left hover:bg-transparent"
                      variant="ghost"
                    >
                      <Link
                        aria-disabled={!isConnected}
                        onClick={(event) => {
                          if (!isConnected) event.preventDefault();
                        }}
                        tabIndex={isConnected ? undefined : -1}
                        to={`/chat/${session.id}`}
                      >
                        <span className="truncate text-[13px] font-semibold text-foreground">
                          {session.title}
                        </span>
                        <span className="truncate text-[11px] font-medium text-muted-foreground">
                          {formatTime(session.updated_at)}
                        </span>
                      </Link>
                    </Button>
                    <Button
                      disabled={!isConnected}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteSession(session.id);
                      }}
                      className="absolute right-2 top-2.5 h-6 w-6 opacity-0 hover:bg-red-500/10 hover:text-destructive group-hover:opacity-100 group-focus-within:opacity-100"
                      variant="ghost"
                      size="icon"
                      type="button"
                      aria-label={`删除${session.title}`}
                    >
                      <X size={14} />
                    </Button>
                  </article>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {isConnected ? (
        <div className="mt-1.5 flex w-full items-center gap-2.5 rounded-lg border border-border bg-card/75 px-3.5 py-2.5 text-xs font-semibold text-muted-foreground">
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-[#4aa675] shadow-[0_0_0_4px_rgba(74,166,117,0.14)]"
            aria-hidden="true"
          />
          <span>本地服务已就绪</span>
        </div>
      ) : (
        <div className="mt-1.5 grid gap-2 rounded-lg border border-red-200/80 bg-red-50/80 p-2.5 text-xs font-semibold text-red-800">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 shrink-0 rounded-full bg-red-500 ${
                isConnecting ? 'animate-pulse' : ''
              }`}
              aria-hidden="true"
            />
            <span>{isConnecting ? '正在重新连接...' : '本地服务已断开'}</span>
          </div>
          <Button
            className="h-8 w-full"
            disabled={isConnecting}
            onClick={onReconnect}
            size="sm"
            type="button"
          >
            <RotateCw className={isConnecting ? 'animate-spin' : undefined} size={15} />
            <span>{isConnecting ? '正在连接...' : '重新连接'}</span>
          </Button>
        </div>
      )}
    </aside>
  );
}
