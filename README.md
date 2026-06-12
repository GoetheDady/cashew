# Cashew

Cashew 是一个 local-first 个人 Agent Desktop 应用。Desktop 提供 Chat Surface 与 Conversation History，独立运行的 Daemon 负责 Agent runtime、LLM 调用和 SQLite 持久化。

## 技术栈

| 模块 | 技术 |
| --- | --- |
| Desktop | Electron 42、React 19、Tailwind CSS 4 |
| Daemon | Node.js、Hono、SQLite |
| Agent | `@earendil-works/pi-agent-core`、`@earendil-works/pi-ai` |
| Transport | localhost HTTP + SSE |
| 测试 | Vitest |

## 架构

```text
Desktop Chat Surface
  → preload Desktop-to-Daemon adapter
    → HTTP + SSE
      → Daemon
        → Agent runtime
        → SQLite Conversation persistence
```

- `apps/desktop`：Electron Desktop。通过 preload 暴露的 `window.cashew` interface 使用 Daemon。
- `apps/daemon`：独立 Node.js Daemon。拥有 Agent runtime、配置和所有持久化 Conversation 数据。
- `packages/shared`：Desktop 与 Daemon 之间共享的类型。

关闭 Desktop 窗口不会停止 Daemon。明确执行 Quit 才会同时优雅关闭 Desktop 与 Daemon。

## 开发

```bash
pnpm install
pnpm dev
pnpm test
pnpm typecheck
pnpm build
```

开发环境可通过 `DEEPSEEK_API_KEY` 或 `.env.local` 提供 API key。产品领域语言见 `CONTEXT.md`，进程架构决策见 `docs/adr/0001-sidecar-daemon-architecture.md`。
