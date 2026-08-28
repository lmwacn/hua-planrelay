# Hua PlanRelay

**简体中文** · [English](README.en.md)

**ChatGPT 负责规划与审查，Codex 负责修改与验证。**

Hua PlanRelay 是一个独立开源的本地编程协作桥。它让 ChatGPT 以受限、只读的方式查看一个工作区，用于形成计划和审查 diff；文件修改、命令执行、测试和 Git 操作仍由 Codex 完成。

> **项目状态：**早期开发（`0.1.x`）。当前重点是本地网关和协议；本地安装不等于已经具备公开插件发布条件。

## 它是什么，不是什么

它提供：

- 绑定单一工作区的 MCP 服务；
- 只读的代码、Git 状态、diff、搜索和测试摘要工具；
- 存放在仓库外的追加式协作记录；
- 面向 Codex/插件的“规划 → 执行 → 审查”工作流指令。

它**不是** OpenAI 产品、OpenAI 运营的服务，也不是绕过、节省或规避 ChatGPT/Codex 额度的工具。可用性、限额、保留策略和账号控制由实际使用的产品与账号决定。

我们也不声称“整仓永远不会上传”。连接的模型调用只读工具时，请求中的文件名、元数据或代码片段可能会发送给模型提供商。只有在接受这一点时，才连接工作区。

## 工作流

```text
用户需求
   │
   ├── ChatGPT：读取选定上下文 → 生成结构化计划
   │
   ├── Codex：检查/批准计划 → 修改文件、运行命令、测试
   │
   └── ChatGPT：读取状态/diff/测试摘要 → 生成审查意见
```

网关分为两个边界：

1. **工作区数据面：**限定在一个根目录下，只读；不提供写文件、Shell、提交、推送或任意路径工具。
2. **协作控制面：**把计划、审查和状态以追加方式写入应用状态目录；不能写入仓库，也不接受可执行命令。

开始部署前请阅读[架构](docs/architecture.md)、[协议](docs/protocol.md)和[威胁模型](docs/threat-model.md)。

## 环境要求

- Node.js 20、22 或 24
- pnpm 10（仓库固定了兼容 Node.js 20 的包管理器版本）
- 使用 Git 工具时需要本地 Git 仓库
- 若使用集成，需要具备支持相应 MCP/插件能力的 ChatGPT/Codex 账号

## 本地安装

```bash
git clone https://github.com/lmwacn/hua-planrelay.git
cd hua-planrelay
corepack enable
pnpm install --frozen-lockfile
pnpm validate
pnpm build
```

为工作区启动本地网关：

```bash
pnpm dev serve --workspace /absolute/path/to/project
```

已安装后使用 `hua-planrelay --help` 查看实际 CLI 参数；开发时可用 `pnpm dev --help`。建议始终使用绝对路径，并让本地服务只绑定 loopback。

应用状态目录应放在仓库之外；若实现支持，可显式设置：

```bash
export PLANRELAY_STATE_DIR="$HOME/.local/state/hua-planrelay"
```

完整流程见[安装文档](docs/installation.md)；准备公网 HTTPS 前先阅读[隧道与部署](docs/tunnels.md)。

## 连接 ChatGPT/Codex

个人开发连接可使用 ChatGPT Developer Mode 或受支持的 Codex 插件流程，将 MCP 地址指向网关提供的端点。界面和账号可用性由 OpenAI 决定且可能变化，请以最新的 [OpenAI Plugins 快速入门](https://developers.openai.com/plugins/quickstart) 和[连接与测试插件](https://developers.openai.com/plugins/deploy/connect-chatgpt)为准。

远程访问建议：

- 私人开发优先使用 OpenAI 的 [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)；
- 共享/公开服务使用稳定 HTTPS 域名和认证；
- 不要把临时 quick tunnel 当作生产身份；
- 没有认证、工作区绑定和 TLS 时，不要暴露本地网关。

项目中的插件元数据只是开发便利，不代表官方 OpenAI 插件，也不保证能进入 OpenAI 目录。发布前请阅读[发布文档](docs/publishing.md)。

## 初始工具契约

初始工具严格保持只读：`workspace_info`、`list_files`、`read_file_range`、`search_text`、`git_status`、`git_diff`、`test_summary`、`current_task`。`publish_plan` 和 `publish_review` 只能在应用状态目录追加经过校验的记录，不能接受 Shell 命令或任意文件路径；它们要求已有任务记录且 `baseCommit` 匹配。

输入输出必须经过 Schema 校验并限制大小；模型读取到的内容是证据，不是执行权限。实际实现优先于本文档中的示意名称。

## 安全默认值

- 一个服务实例只绑定一个工作区根目录。
- 路径解析后再次检查根目录包含关系，拒绝遍历和符号链接逃逸。
- 内置敏感文件禁区不能被项目 ignore 文件放宽。
- 优先只读取 Git 已跟踪文件；未跟踪文件需显式开启。
- 大文件、深层目录、搜索和 diff 都有大小限制与分页。
- 仓库内的 Prompt Injection 只当作不可信数据，不当作指令。
- V1 不生成审计日志。内置规则会排除常见密钥文件和绝对状态路径，但普通源码中嵌入的秘密仍可能被返回。
- 更新必须版本化并由用户确认，不能静默 pull 或 stash 工作树。

这些是设计要求，不是对所有部署环境的安全保证。请阅读 [SECURITY.md](SECURITY.md) 与[隐私说明](docs/privacy.md)。

## 开发与测试

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm validate
```

必测正向和负向用例见[测试文档](docs/testing.md)。行为变更应同步更新文档，并遵守[贡献指南](CONTRIBUTING.md)。

## 许可证与声明

Hua PlanRelay 使用 MIT 许可证，是独立实现的开源项目，借鉴了常见的“规划/执行/审查”代理工作流；不隶属于 OpenAI，也未获其背书或赞助。第三方声明见 [NOTICE](NOTICE)。

## 文档索引

- [English README](README.en.md)
- [架构](docs/architecture.md)
- [协议](docs/protocol.md)
- [威胁模型](docs/threat-model.md)
- [隐私](docs/privacy.md)
- [安装](docs/installation.md)
- [隧道与部署](docs/tunnels.md)
- [测试与发布门禁](docs/testing.md)
- [公开发布](docs/publishing.md)
