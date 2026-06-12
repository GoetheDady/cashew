Status: ready-for-agent

# 打包产物始终携带 Node runtime

## What to build

兑现 Sidecar Daemon ADR：Desktop 安装包携带运行 Daemon 所需的 Node runtime，用户机器不需要预装系统 Node。

按 TDD 执行：先添加一个检查打包产物启动能力的失败验证，再补齐打包配置和启动行为。

## Acceptance criteria

- [ ] 打包产物包含目标平台可执行的 Node runtime
- [ ] 系统 Node 不可用时，打包后的 Desktop 仍能启动并连接 Daemon
- [ ] 缺少内置 Node runtime 时启动明确失败，而不是静默依赖系统 Node
- [ ] 至少一个自动化验证覆盖打包产物中的 Daemon 启动路径

## Blocked by

- 02-close-preserves-daemon-quit-stops-daemon.md
