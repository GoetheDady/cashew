Status: ready-for-agent

# Reconnect 尊重独立运行的 Daemon

## What to build

让 Desktop 在重新连接时区分自己拉起的 Daemon 与已经独立运行的 Daemon。重新连接应恢复可用连接，不应遗留孤立进程或启动重复 Daemon。

按 TDD 执行：先添加一个从“Desktop 连接到已有 Daemon”开始的失败行为测试，再实现 ownership-aware reconnect。

## Acceptance criteria

- [ ] Desktop 连接到已有 Daemon 后执行 reconnect，不会启动第二个 Daemon
- [ ] Desktop 自己拉起的失效 Daemon 可以被清理并重新拉起
- [ ] reconnect 后 service discovery 指向唯一健康 Daemon
- [ ] 行为通过 lifecycle 公开 interface 测试，不断言内部调用顺序

## Blocked by

- 02-close-preserves-daemon-quit-stops-daemon.md
