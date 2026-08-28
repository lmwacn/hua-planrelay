# Changelog

本文件记录用户可见的变化。格式参考 Keep a Changelog；版本遵循 SemVer 约定。`0.x` 期间仍可能有不兼容变化。

## [Unreleased]

暂无。

## [0.1.1] - 2026-08-29

### 修复

- 固定兼容 Node.js 20/22/24 的 pnpm 10，修复 Node.js 20 CI 在依赖缓存阶段失败的问题；
- 将 Marketplace 安装引用更新到 `v0.1.1`。

## [0.1.0] - 2026-08-29

### 初始版本

- 创建 Hua PlanRelay 的 TypeScript/pnpm 项目骨架；
- 定义“ChatGPT 规划/审查、Codex 执行”的产品边界；
- 实现路径、符号链接、敏感文件、读取大小、搜索输出与 Git diff 边界；
- 实现 10 个 MCP 工具、stdio/loopback HTTP 传输和完整 CLI；
- 实现仓库外的加盐工作区标识及追加式、幂等协作记录；
- 提供 Codex 插件、Skill、双语 README、架构、协议、威胁模型、隐私和发布文档；
- 增加 Node 20/22/24 CI、秘密扫描、依赖审计、26 项测试、SBOM、许可证清单与 SHA-256 校验。

### 已知限制

- V1 的搜索仅支持字面量，不接受正则表达式；
- V1 本地 HTTP 仅绑定 loopback，不包含公网部署所需的 OAuth；
- 审查记录尚未与 diff/test evidence digest 做密码学绑定。
