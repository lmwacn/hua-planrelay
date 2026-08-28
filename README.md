# Hua PlanRelay

**简体中文（默认）** · [中文固定链接](README.zh-CN.md) · [English](README.en.md)

> **Sol 思考，Luna 协调，Codex 执行。**

Hua PlanRelay 是一个本地编程协作桥：让轻量、适合高频工作的 Luna 留在 Codex 侧负责上下文整理、任务协调和本地执行；在账号支持时，把真正需要深度推理的规划与审查交给浏览器中的 Sol。两边通过受限、只读的 MCP 工作区视图和结构化记录交接，而不是互相复制整段对话或直接共享执行权限。

核心理念参考了 [Codex with ChatGPT](https://github.com/XiaoDuoYa/codex-with-chatgpt)，Hua PlanRelay 是独立实现，并采用更明确的“当前能力 / 目标形态”边界。

> **项目状态：**`0.2.x` 已实现安全的本地只读桥、证据绑定审查、任务状态机、迭代上限，以及“经用户明确授权后由 Luna/Codex 协助操作浏览器中的 Sol”的 Skill 流程。浏览器能力由运行 Hua PlanRelay Skill 的 Codex 环境提供，不是网关绕过登录或账户权限。

## 它解决什么问题

复杂编码任务通常混合了两类工作：

- **高频执行工作：**读取状态、整理上下文、编辑文件、运行测试和处理 Git；
- **少量高价值思考：**拆解复杂需求、选择方案、识别风险和独立审查结果。

如果所有步骤都持续使用最高能力模型，简单的搬运和执行也会占用宝贵用量。Hua PlanRelay 希望按任务形状分工：

| 角色 | 更适合做什么 | 不应该做什么 |
| --- | --- | --- |
| **Luna / Codex** | 高频协调、读取工具结果、本地修改、测试、迭代 | 仅为“更聪明”而包办所有深度规划 |
| **浏览器中的 Sol** | 复杂规划、架构权衡、失败模式分析、独立 Review | 直接获得 Shell、写文件或 Git 推送权限 |
| **PlanRelay** | 提供受限上下文和计划/审查交接 | 替任何一方执行命令或绕过产品限制 |

### 它可能怎样减少用量

把规划和 Review 从长时间运行的高能力 Codex 会话中拆出，交给你账号中可用的 ChatGPT 网页模型，**可能**减少 Codex 侧高能力模型用于思考阶段的消耗；让 Luna 承担高频协调，也更符合它面向成本敏感、高吞吐任务的定位。

这不是“免费额度转换器”，也不保证总用量一定下降。ChatGPT 网页、Work、Codex 和不同模型是否共享额度、分别计量或使用 credits，取决于套餐、工作区设置和当时的产品规则。请以自己账号显示的 Usage 为准。模型定位可参考 OpenAI 的 [GPT-5.6 模型指南](https://developers.openai.com/api/docs/guides/latest-model)。

## 工作原理

```text
             ┌──────────────────────────────┐
             │ 浏览器中的 ChatGPT / Sol     │
             │ 深度规划 · 架构判断 · Review │
             └──────────────┬───────────────┘
                            │ 只读 MCP：按需读取有限上下文
                            │ 结构化记录：Plan / Review
                            ▼
             ┌──────────────────────────────┐
             │        Hua PlanRelay         │
             │ 路径守卫 · 敏感文件过滤 · 分页 │
             └──────────────┬───────────────┘
                            │ 本地交接
                            ▼
             ┌──────────────────────────────┐
             │ Luna / Codex                 │
             │ 编辑 · Shell · 测试 · Git    │
             └──────────────┬───────────────┘
                            ▼
                       本地工作区
```

- **数据面：**只读访问一个绑定的工作区；不存在写文件、Shell、提交或推送工具。
- **控制面：**计划、执行摘要和审查结果写入仓库外的追加式状态记录。
- **审查闭环：**Sol 可以读取真实 diff 和测试摘要，再决定通过、要求修改或阻塞。
- **浏览器边界：**默认仍可手动交接；若 Codex 环境提供浏览器控制且用户针对当前请求明确授权，Skill 可协助发送一次规划或审查提示。登录、验证码、二次验证、模型可用性和其他敏感操作始终交给用户。

## 当前已经能做什么

| 已实现（`0.2.x`） | 仍需部署方完成 |
| --- | --- |
| 11 个工作区、Git、任务、状态、计划和审查 MCP 工具 | 公开插件所需的稳定 HTTPS、OAuth 和运营体系 |
| stdio、仅限 loopback 的 HTTP，以及 Secure MCP Tunnel 配置辅助 | 在 OpenAI Platform 创建 tunnel、配置权限并保持客户端运行 |
| 路径穿越、符号链接、敏感文件和大小限制 | 按部署环境完成账号、工作区与数据治理 |
| 浏览器辅助 Skill、追加式状态、最多 1–20 次迭代 | 用户完成登录、验证码、2FA 和模型选择可用性确认 |
| Git diff/status/test 摘要绑定；工作区变化后拒绝旧 Review | 如需公开分发，另行部署多租户认证服务 |

开始使用前请阅读[架构](docs/architecture.md)、[协议](docs/protocol.md)和[威胁模型](docs/threat-model.md)。

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

## 最短体验流程

`0.2.x` 同时支持手动交接和经授权的浏览器辅助交接：

1. 为本地项目创建任务：

   ```bash
   pnpm dev task create \
     --workspace /absolute/path/to/project \
     --goal "实现登录限流并补充测试" \
     --json
   ```

2. 运行 `hua-planrelay setup --workspace /absolute/path/to/project --json` 获取本地 MCP 配置；需要网页访问本机时，再带 `--tunnel-id <id>` 获取 Secure MCP Tunnel 参数。
3. 手动在浏览器中发送规划提示，或明确授权已启用 Hua PlanRelay Skill 的 Codex 协助操作浏览器；Skill 会核验 Sol 是否实际可用，不会代填登录、验证码或密钥。
4. Luna / Codex 读取计划，在本地编辑、运行测试并记录结构化执行摘要。
5. 手动或经授权请求审查。Sol 必须回传 `test_summary` 中的证据对象；网关会同时核验当前 Git 状态，工作区已变化则拒绝旧 Review。
6. 用 `hua-planrelay status --workspace ... --task ... --json` 读取下一步；通过、阻塞或达到迭代上限时停止。

## 连接 ChatGPT/Codex

个人开发连接可使用 ChatGPT Developer Mode 或受支持的 Codex 插件流程，将 MCP 地址指向网关提供的端点。界面和账号可用性由 OpenAI 决定且可能变化，请以最新的 [OpenAI Plugins 快速入门](https://developers.openai.com/plugins/quickstart) 和[连接与测试插件](https://developers.openai.com/plugins/deploy/connect-chatgpt)为准。

远程访问建议：

- 私人开发优先使用 OpenAI 的 [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)；
- 共享/公开服务使用稳定 HTTPS 域名和认证；
- 不要把临时 quick tunnel 当作生产身份；
- 没有认证、工作区绑定和 TLS 时，不要暴露本地网关。

项目中的插件元数据只是开发便利，不代表官方 OpenAI 插件，也不保证能进入 OpenAI 目录。发布前请阅读[发布文档](docs/publishing.md)。

## 初始工具契约

数据工具严格保持只读：`workspace_info`、`list_files`、`read_file_range`、`search_text`、`git_status`、`git_diff`、`test_summary`、`current_task`、`workflow_status`。`publish_plan` 和 `publish_review` 只能在应用状态目录追加经过校验的记录，不能接受 Shell 命令或任意文件路径；Review 还必须匹配执行时的证据摘要和当前工作区状态。

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
- [简体中文固定链接](README.zh-CN.md)
- [架构](docs/architecture.md)
- [协议](docs/protocol.md)
- [威胁模型](docs/threat-model.md)
- [隐私](docs/privacy.md)
- [安装](docs/installation.md)
- [隧道与部署](docs/tunnels.md)
- [测试与发布门禁](docs/testing.md)
- [公开发布](docs/publishing.md)
