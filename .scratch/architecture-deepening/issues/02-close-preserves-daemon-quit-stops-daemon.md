Status: ready-for-agent

# Close 保留 Daemon，Quit 才关闭 Daemon

## What to build

让 Desktop lifecycle 准确表达产品语言：关闭最后一个窗口属于 Close，Daemon 继续运行；只有明确的 Quit 才优雅关闭 Desktop 与 Daemon。

按 TDD 执行：先添加一个通过 Desktop lifecycle 公开 interface 验证 Close 与 Quit 差异的失败测试，再实现最小行为。

## Acceptance criteria

- [ ] 关闭最后一个 Desktop 窗口不会向 Daemon 发送关闭请求
- [ ] 明确执行 Quit 会向已连接的 Daemon 发送优雅关闭请求
- [ ] Windows、Linux 与 macOS 的 Close 行为均符合相同领域规则
- [ ] Close 与 Quit 的差异通过公开 lifecycle interface 测试

## Blocked by

None - can start immediately
