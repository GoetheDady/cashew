# Cashew

Cashew 是一个基于 [Pi](https://github.com/nicepkg/pi) 和 Electron 构建的个人 Agent 桌面应用。

Pi 提供底层 LLM 通信和基础对话能力，Cashew 在此之上构建记忆系统、任务系统等 Agent 能力模块，目标是打造一个完全按自己想法设计的个人 Agent。

## 技术栈

| 层级 | 技术 |
|------|------|
| 包管理 | pnpm workspace (monorepo) |
| 运行时 | Electron 42 |
| 构建工具 | electron-vite 5 (Vite 5.4 + SWC) |
| 前端 | React 19 + Tailwind CSS 4 |
| 语言 | TypeScript (strict) |
| LLM | `@earendil-works/pi-agent-core` + `@earendil-works/pi-ai` → DeepSeek |
| 数据存储 | electron-store (JSON 文件持久化) |
| 测试 | Vitest 2.1 |
| 代码规范 | ESLint 8 + @typescript-eslint |

## 项目结构

```text
cashew/
├── apps/
│   └── desktop/                  # Electron 桌面应用（主入口）
│       └── src/
│           ├── main/             # Electron 主进程
│           │   └── main.ts       #   创建窗口、初始化 AgentRuntime、监听 IPC
│           ├── preload/          # Preload 脚本（安全桥接层）
│           │   └── preload.ts    #   通过 contextBridge 暴露 window.cashew API
│           └── renderer/         # 渲染进程（React UI）
│               ├── renderer.tsx  #   React 入口（左右布局：会话列表 + 聊天区域）
│               ├── chat-session.ts #   useChatSession hook，管理聊天状态
│               ├── session-manager.ts # useSessionManager hook，管理会话历史
│               ├── index.css     #   Tailwind 样式
│               └── index.html    #   HTML 入口
├── packages/
│   ├── agent/                    # Agent 运行时（核心逻辑层）
│   │   └── src/
│   │       ├── index.ts          #   包入口，导出 AgentRuntime、ChatDatabase
│   │       ├── runtime.ts        #   AgentRuntime + AgentSession 实现
│   │       ├── database.ts       #   ChatDatabase 数据持久化（基于 electron-store）
│   │       └── settings.ts       #   API Key 加载、模型配置
│   └── shared/                   # 共享类型定义
│       └── src/
│           └── index.ts          #   IPC 协议类型（ChatCommand、ChatEvent、DBCommand、DBEvent）
├── docs/
│   └── agents/                   # Agent skill 配置文档
├── .claude/
│   └── skills/                   # Claude Code agent skills
├── package.json                  # 根 workspace 配置
├── pnpm-workspace.yaml           # workspace 声明（apps/* + packages/*）
├── CLAUDE.md                     # Claude Code 引导文件
└── README.md
```

## 目录说明

### `apps/desktop`

Electron 桌面应用，是用户直接交互的入口。分为三层：

- **main** — Electron 主进程。负责创建 BrowserWindow、实例化 AgentRuntime 单例、监听来自渲染进程的 IPC 命令（聊天和数据库）并转发给 Agent。
- **preload** — 安全桥接层。通过 `contextBridge` 将 `sendChatCommand`、`subscribeChatEvents`、`sendDBCommand`、`subscribeDBEvents` 暴露到 `window.cashew`，实现渲染进程与主进程的类型安全通信。
- **renderer** — React 前端。采用左右布局：左侧会话列表（`useSessionManager` hook 管理），右侧聊天区域（`useChatSession` hook 管理）。支持创建、切换、删除会话，所有数据持久化到本地。

### `packages/agent`

Agent 运行时，是 Cashew 的核心逻辑层。

- `AgentRuntime` — 应用级单例，管理所有窗口的 Agent 会话和数据库操作。
- `AgentSession` — 每个窗口一个实例，封装 `@earendil-works/pi-agent-core` 的 Agent，将 pi 的事件流转换为 Cashew 的 IPC 协议。
- `ChatDatabase` — 会话和消息的持久化存储，基于 `electron-store`，数据保存为 JSON 文件（`~/Library/Application Support/cashew/cashew-data.json`）。
- `settings` — 处理 DeepSeek API Key 的加载（支持环境变量和多级 .env 文件）。

### `packages/shared`

跨包共享的 TypeScript 类型定义：

- `ChatCommand` — 发送给 Agent 的命令（discriminated union：`start_turn | cancel_turn`）
- `ChatEvent` — Agent 返回的事件（discriminated union：`turn_started | assistant_delta | turn_completed | turn_failed | turn_cancelled`）
- `DBCommand` — 数据库操作命令（`create_session | get_all_sessions | get_session | delete_session | get_messages | update_session_title`）
- `DBEvent` — 数据库操作事件（`session_created | sessions_loaded | session_deleted | messages_loaded | session_title_updated | db_error`）
- `ChatMessage` / `DBMessage` / `Session` — 消息和会话的数据结构
- IPC channel 常量

## 数据流

```text
用户输入消息
  → renderer 调用 window.cashew.sendChatCommand (IPC)
    → main process: AgentRuntime.handleCommand
      → AgentSession.startTurn
        → pi-agent-core Agent → DeepSeek API
          → 流式 text_delta 事件
            → IPC ChatEvent 回传 renderer
              → reducer 更新 UI（实时显示）

会话管理数据流
  → renderer 调用 window.cashew.sendDBCommand (IPC)
    → main process: AgentRuntime.handleDBCommand
      → ChatDatabase 操作（创建/删除/查询会话）
        → 存储到 electron-store (JSON 文件)
          → IPC DBEvent 回传 renderer
            → useSessionManager 更新会话列表
```

## 开发

### 环境准备

```bash
pnpm install
```

在 `apps/desktop/.env.local` 中配置 API Key：

```text
DEEPSEEK_API_KEY=your_key_here
```

API Key 加载优先级：`环境变量 > apps/desktop/.env.local > apps/desktop/.env > .env.local > .env`

### 常用命令

```bash
pnpm dev          # 启动开发服务器（支持热更新）
pnpm build        # 生产构建
pnpm package      # 构建 + 打包（unpacked）
pnpm make         # 构建 + 生成安装包
pnpm lint         # ESLint 检查
pnpm typecheck    # TypeScript 类型检查
pnpm test         # 运行测试
```

## 规划方向

### 第一阶段：会话和消息持久化（进行中）
- ✅ 会话列表左侧面板
- ✅ 会话创建、切换、删除
- ⏳ 消息持久化到数据库
- ⏳ 自动生成会话标题（从首条消息）
- ⏳ 会话搜索功能

### 第二阶段：记忆系统
- 对话历史记忆（短期）
- 知识库存储（长期）
- 相似度搜索（语义化）

### 第三阶段：任务系统
- 任务创建、管理、执行
- 任务的挂起、恢复、完成状态
- 任务关联会话和消息

### 后续规划
- 工具调用能力（执行脚本、访问文件、调用 API）
- 多模型支持（不仅 DeepSeek）
- 导出功能（对话历史、总结报告）
