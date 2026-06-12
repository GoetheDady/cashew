Status: ready-for-agent

# 深化 Desktop-to-Daemon adapter

## What to build

建立一个 deep Desktop-to-Daemon adapter，让 Desktop domain modules 通过 Conversation、turn、配置和 lifecycle 语言调用 Daemon。adapter 内部拥有端口发现、HTTP、SSE、运行时响应校验与错误翻译。

按 TDD 执行：先为一个完整 Conversation 读取路径添加通过 adapter 公开 interface 的失败测试，再逐步吸收 transport 知识。

## Acceptance criteria

- [ ] Chat Surface 和 Conversation History 不直接知道 Daemon 端口或 HTTP 路径
- [ ] 配置、Conversation 与 turn 行为通过同一个 Desktop adapter 使用
- [ ] Daemon 响应在进入 Desktop domain modules 前经过运行时校验
- [ ] transport 错误被转换为稳定、领域可理解的错误
- [ ] shared interface 使用 Conversation 语言，不泄漏数据库字段命名

## Blocked by

- 05-concentrate-daemon-configuration-ownership.md
- 07-turn-lifecycle-independent-from-sse.md
- 09-concentrate-active-conversation-ownership.md
