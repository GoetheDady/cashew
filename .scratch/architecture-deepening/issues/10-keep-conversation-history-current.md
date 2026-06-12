Status: ready-for-agent

# 保持 Conversation History 实时排序

## What to build

让 Conversation History 在 turn 完成、标题生成和 Conversation 删除后立即反映 Daemon 的持久化状态，包括正确标题、更新时间与排序，无需重新加载 Desktop。

按 TDD 执行：先添加“完成 active Conversation 的 turn 后列表顺序立即更新”的失败行为测试，再实现最小同步路径。

## Acceptance criteria

- [ ] turn 完成后，对应 Conversation 在 Conversation History 中按最新更新时间排序
- [ ] 自动生成标题后，Conversation History 立即显示新标题
- [ ] 删除 active Conversation 后，Chat Surface 返回 Empty Chat
- [ ] Conversation History 不持有 active Conversation 的消息 timeline
- [ ] 行为通过 Conversation History 公开 interface 测试

## Blocked by

- 06-deepen-conversation-persistence.md
- 09-concentrate-active-conversation-ownership.md
