Status: ready-for-agent

# 让 turn lifecycle 独立于 SSE adapter

## What to build

建立一个 deep turn lifecycle module，统一协调 Agent 执行、事件流、Conversation 持久化、标题生成与取消。SSE 只作为 transport adapter 转换输入和输出。

按 TDD 执行：先通过 turn lifecycle 公开 interface 添加“启动并完成一个 turn”的失败测试，再逐步迁移 SSE 中的 workflow。

## Acceptance criteria

- [ ] turn 可通过 transport-independent interface 启动并产生流式事件
- [ ] 完成的 turn 会持久化到对应 Conversation
- [ ] 使用返回给调用方的真实 turn ID 可以取消对应 turn
- [ ] SSE adapter 不拥有持久化、标题或 Agent lifecycle 规则
- [ ] 取消与完成行为通过公开 turn interface 测试

## Blocked by

- 05-concentrate-daemon-configuration-ownership.md
- 06-deepen-conversation-persistence.md
