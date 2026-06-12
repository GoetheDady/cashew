Status: ready-for-agent

# 集中 Daemon 配置所有权

## What to build

建立一个 deep Daemon configuration module，统一拥有配置路径、development fallback、默认值、合并、校验、读取与保存规则。配置读写和 turn 执行必须观察同一份有效配置。

按 TDD 执行：先添加“自定义配置路径同时影响配置读取与 turn”的失败行为测试，再逐步集中规则。

## Acceptance criteria

- [ ] 使用自定义配置路径创建 Daemon 后，配置读写与 turn 使用同一份配置
- [ ] 配置读取和部分更新使用一致的 fallback、默认与校验规则
- [ ] 不存在绕过 configuration module 直接选择默认配置路径的生产调用
- [ ] 测试通过 configuration module 或 Daemon 公开 interface 验证行为

## Blocked by

None - can start immediately
