Status: ready-for-agent

# 集中 Daemon host lifecycle

## What to build

建立一个 deep Daemon host lifecycle module，统一拥有启动、端口选择、service discovery、健康状态、关闭 route、信号处理与清理。调用方只需启动或停止 Daemon host。

按 TDD 执行：先添加一个通过公开 host interface 启动、发现并关闭 Daemon 的失败测试，再吸收现有 assembly primitives。

## Acceptance criteria

- [ ] 通过一个公开 interface 可启动 Daemon、发现实际端口并优雅关闭
- [ ] 首选端口被占用时，service discovery 写入实际可用端口
- [ ] 关闭或收到终止信号后，service discovery 状态被清理
- [ ] 生产入口和测试不需要重复组装 lifecycle primitives
- [ ] host lifecycle 行为通过公开 interface 测试

## Blocked by

- 02-close-preserves-daemon-quit-stops-daemon.md
- 03-reconnect-respects-independent-daemon.md
- 04-package-bundled-node-runtime.md
