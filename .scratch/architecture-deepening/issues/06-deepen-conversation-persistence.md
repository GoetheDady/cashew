Status: ready-for-agent

# 深化 Conversation persistence module

## What to build

建立一个 deep Conversation persistence module，让 SQLite 成为内部 adapter。该 module 统一拥有 Conversation、消息、标题状态、更新时间和 turn 持久化规则。

按 TDD 执行：先添加一个仅通过公开 persistence interface 完成并重新读取 Conversation 的失败测试，再迁移一条行为路径。

## Acceptance criteria

- [ ] 完成 turn 后，可通过公开 interface 重新读取用户消息与 Cashew 回复
- [ ] 首次完成 turn 后，Conversation 标题状态和更新时间正确更新
- [ ] Conversation 删除后，其消息无法再通过公开 interface 读取
- [ ] 生产调用和行为测试不需要直接执行 SQL
- [ ] SQLite 知识集中在 persistence implementation 内

## Blocked by

None - can start immediately
