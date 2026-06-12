Status: ready-for-agent

# 集中 active Conversation 所有权

## What to build

建立一个 deep active Conversation module，统一拥有 Chat Surface 的 transient state、Conversation 激活、持久化消息与流式消息 timeline、stale event 防护和当前 turn 状态。

按 TDD 执行：先添加“切换 Conversation 后忽略旧 stream event”的失败行为测试，再逐步吸收页面协调逻辑。

## Acceptance criteria

- [ ] 切换 active Conversation 后，旧 Conversation 的加载结果不会污染 Chat Surface
- [ ] 切换 active Conversation 后，旧 turn 的 stream event 不会进入新 Conversation
- [ ] 持久化消息与当前流式消息形成一个正确、有序的 timeline
- [ ] Chat Surface 不需要协调多个 active Conversation 状态所有者
- [ ] Empty Chat 与已有 Conversation 使用同一公开 interface

## Blocked by

- 08-deepen-empty-chat-first-send.md
