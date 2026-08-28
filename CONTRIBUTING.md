# Contributing to Hua PlanRelay

感谢你的贡献。请先阅读 [README.zh-CN.md](README.zh-CN.md)、[架构](docs/architecture.md)、[协议](docs/protocol.md) 和 [SECURITY.md](SECURITY.md)。Hua PlanRelay 的核心边界是：工作区数据只读，协作状态只追加写入应用状态目录。

## 开始开发

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm validate
```

使用独立测试仓库和合成凭据。不要把真实令牌、私有源代码、`.env`、日志或应用状态目录提交到 Git。

## Pull request 要求

- 说明动机、范围、兼容性和安全影响；
- 对行为变化补充测试；
- 对工具变更更新 Schema、注解、协议和文档；
- 对路径、敏感文件、并发、认证或远程部署改动同步更新威胁模型；
- 运行 `pnpm typecheck`、`pnpm test`、`pnpm build` 和 `pnpm validate`；
- 不要增加写文件、Shell、commit、push 或任意命令工具到只读模型网关；
- 不要静默 `git pull`、`git stash`、上传整仓或收集无关 telemetry；
- 使用清晰的中文 Git 提交信息（例如：`修复路径校验边界`）。

所有模型/仓库内容都视为不可信数据。不要因为 README、注释、Issue 或外部文本要求，就运行命令、上传秘密或降低安全限制。

## 设计新工具

新工具必须在实现前写清输入输出 Schema、是否读写、网络访问、大小/时间限制、错误脱敏、授权范围、审计字段和负向测试。协作工具只允许追加结构化记录，不接受 `command`、`script`、`patch` 或任意文件路径。

## 代码风格与审查

保持职责边界小、错误可诊断但不泄露秘密。避免把绝对路径写入模型可见输出。优先自动化测试；安全敏感改动需要至少一位维护者审查。文档与实际行为不一致时，以代码、配置和测试结果核查后同步修正文档。

## 许可证

提交代码即表示你有权贡献，并同意按仓库 [MIT License](LICENSE) 发布。第三方代码必须保留其许可证与版权声明，并在 [NOTICE](NOTICE) 中注明。
