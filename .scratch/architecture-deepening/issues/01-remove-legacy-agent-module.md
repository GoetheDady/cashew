Status: ready-for-agent

# 删除旧 Agent module，恢复测试可信度

## What to build

删除 Sidecar Daemon 架构启用后不再参与生产行为的旧 Agent module、依赖与过时架构说明，让仓库只保留当前 Daemon implementation。

按 TDD 执行：先用根级验证证明当前测试命令因旧 module 失败，再删除旧 implementation 并更新文档，直到根级验证通过。

## Acceptance criteria

- [ ] 根测试命令不再执行已废弃 Agent implementation 的测试，并全部通过
- [ ] workspace 中不存在未被生产代码使用的旧 Agent package
- [ ] 架构文档只描述 Desktop、Daemon 与当前共享 interface
- [ ] 类型检查和构建不引用已删除 module

## Blocked by

None - can start immediately
