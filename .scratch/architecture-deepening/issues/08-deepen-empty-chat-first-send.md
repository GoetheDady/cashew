Status: ready-for-agent

# 深化 Empty Chat 首次发送流程

## What to build

让 Empty Chat 的首次发送成为一个完整、可测试的 Chat Surface 行为：创建 Conversation、使其成为 active Conversation、导航并恰好发送一次消息。

按 TDD 执行：先添加一个从 Empty Chat 提交首条消息的失败行为测试，再实现最小端到端路径。

## Acceptance criteria

- [ ] Empty Chat 提交首条有效消息会创建一个 Conversation
- [ ] 新 Conversation 成为 active Conversation，并显示在 Conversation History
- [ ] 首条消息恰好发送一次
- [ ] 创建或发送失败时，不会留下重复发送或错误 active Conversation
- [ ] 删除仅测试局部分支的浅 first-send helper，行为由完整流程测试覆盖

## Blocked by

- 07-turn-lifecycle-independent-from-sse.md
