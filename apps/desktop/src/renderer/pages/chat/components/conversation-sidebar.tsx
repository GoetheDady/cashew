import { Search, Settings, Sparkles, SquarePen, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DBSession } from '@cashew/shared';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import logoLockup from '../../../assets/cashew-logo-lockup.png';
import { formatDay, formatTime } from '../lib/chat-formatters';

type ConversationSidebarProps = {
  sessions: DBSession[];
  activeSessionId: string | null;
  searchTerm: string;
  isLoading: boolean;
  onSearchTermChange: (searchTerm: string) => void;
  onCreateSession: () => void;
  onDeleteSession: (sessionId: string) => void;
};

export function ConversationSidebar({
  sessions,
  activeSessionId,
  searchTerm,
  isLoading,
  onSearchTermChange,
  onCreateSession,
  onDeleteSession,
}: ConversationSidebarProps) {
  const filteredSessions = sessions.filter((session) =>
    session.title.toLowerCase().includes(searchTerm.trim().toLowerCase()),
  );

  const groupedSessions = filteredSessions.reduce<Record<string, DBSession[]>>(
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
      className="flex min-h-0 min-w-0 flex-col border-r border-border bg-[linear-gradient(180deg,rgba(255,253,249,0.62),transparent_30%),rgba(250,246,239,0.92)] px-[1.125rem] pb-4 pt-5"
      aria-label="Conversations"
    >
      <div className="flex h-12 items-center gap-3">
        <img
          className="h-11 w-32 object-contain object-left mix-blend-multiply"
          src={logoLockup}
          alt="Cashew"
        />
      </div>

      <Button
        className="mt-[1.125rem] h-[2.625rem] shadow-[0_8px_20px_rgba(94,58,27,0.14)]"
        onClick={onCreateSession}
        type="button"
      >
        <SquarePen size={18} />
        <span>New chat</span>
      </Button>

      <Button
        asChild
        className="mt-2 h-[2.625rem] justify-start border-border bg-card/80"
        variant="secondary"
      >
        <Link to="/console">
          <Settings size={17} />
          <span>Console</span>
        </Link>
      </Button>

      <label className="mt-3 flex h-10 items-center gap-2.5 rounded-lg border border-border bg-card/80 px-3 text-[#9a9086] focus-within:border-primary/30 focus-within:bg-card">
        <Search size={18} />
        <span className="sr-only">Search conversations</span>
        <input
          className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-foreground outline-none placeholder:text-[#9a9086]"
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
          placeholder="Search conversations..."
        />
      </label>

      <div className="mt-[1.375rem] flex items-center justify-between text-[11px] font-bold tracking-[0.02em] text-muted-foreground">
        <span>Conversations</span>
        <span className="grid h-5 min-w-6 place-items-center rounded-full border border-border bg-card/70 text-[10px]">
          {filteredSessions.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-3 pr-1 [scrollbar-gutter:stable]">
        {isLoading && sessions.length === 0 ? (
          <div className="grid gap-2" aria-label="Loading conversations">
            {[0, 1, 2].map((item) => (
              <span key={item} className="h-11 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="grid place-items-center gap-2.5 rounded-lg border border-dashed border-[#d8cabb] px-[1.125rem] py-8 text-center text-muted-foreground">
            <Sparkles size={22} />
            <p className="m-0 font-bold text-foreground">No conversations found</p>
            <Button size="sm" onClick={onCreateSession} type="button">
              Start one
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
                      <Link to={`/chat/${session.id}`}>
                        <span className="truncate text-[13px] font-semibold text-foreground">
                          {session.title}
                        </span>
                        <span className="truncate text-[11px] font-medium text-muted-foreground">
                          {formatTime(session.updated_at)}
                        </span>
                      </Link>
                    </Button>
                    <Button
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteSession(session.id);
                      }}
                      className="absolute right-2 top-2.5 h-6 w-6 opacity-0 hover:bg-red-500/10 hover:text-destructive group-hover:opacity-100 group-focus-within:opacity-100"
                      variant="ghost"
                      size="icon"
                      type="button"
                      aria-label={`Delete ${session.title}`}
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

      <div className="mt-1.5 flex w-full items-center gap-2.5 rounded-lg border border-border bg-card/75 px-3.5 py-2.5 text-xs font-semibold text-muted-foreground">
        <span
          className="h-2 w-2 shrink-0 rounded-full bg-[#4aa675] shadow-[0_0_0_4px_rgba(74,166,117,0.14)]"
          aria-hidden="true"
        />
        <span>Local agent ready</span>
      </div>
    </aside>
  );
}
