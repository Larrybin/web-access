<div align="right">
  <details>
    <summary>🌐 Language</summary>
    <div>
      <div align="center">
        <a href="https://openaitx.github.io/view.html?user=eze-is&project=web-access&lang=en">English</a>
        | <a href="https://openaitx.github.io/view.html?user=eze-is&project=web-access&lang=zh-CN">简体中文</a>
        | <a href="https://openaitx.github.io/view.html?user=eze-is&project=web-access&lang=zh-TW">繁體中文</a>
        | <a href="https://openaitx.github.io/view.html?user=eze-is&project=web-access&lang=ja">日本語</a>
        | <a href="https://openaitx.github.io/view.html?user=eze-is&project=web-access&lang=ko">한국어</a>
        | <a href="https://openaitx.github.io/view.html?user=eze-is&project=web-access&lang=fr">Français</a>
        | <a href="https://openaitx.github.io/view.html?user=eze-is&project=web-access&lang=de">Deutsch</a>
        | <a href="https://openaitx.github.io/view.html?user=eze-is&project=web-access&lang=es">Español</a>
        | <a href="https://openaitx.github.io/view.html?user=eze-is&project=web-access&lang=pt">Português</a>
        | <a href="https://openaitx.github.io/view.html?user=eze-is&project=web-access&lang=ru">Русский</a>
      </div>
    </div>
  </details>
</div>

<img width="879" height="376" alt="image" src="https://github.com/user-attachments/assets/a87fd816-a0b5-4264-b01c-9466eae90723" />

<p align="center">
  <b>给 AI Agent 装上完整联网能力的 Skill。</b><br/>
  <a href="https://web-access.eze.is">🌐 官网</a> · <a href="https://mp.weixin.qq.com/s/rps5YVB6TchT9npAaIWKCw">📖 设计详解</a> · <a href="#安装">⚡ 快速安装</a>
</p>

AI Agent 原本的联网能力（WebSearch、WebFetch）缺少调度策略和浏览器自动化能力。这个 Agent Skill 补上的是：**联网策略 + CDP 浏览器操作 + 站点经验积累**。兼容所有支持 SKILL.md 的 Agent（Claude Code、Cursor、Gemini CLI、Codex CLI 等）。

> 推荐必读：[Web Access：一个 Skill，拉满 Agent 联网和浏览器能力](https://mp.weixin.qq.com/s/rps5YVB6TchT9npAaIWKCw) ，完整介绍了 Web-Access Skill 的开发细节与 Agent Skill 设计哲学，帮助你也能写出类似通用、高上限的 Skill

---

## v2.5.0 能力

| 能力 | 说明 |
|------|------|
| 联网工具自动选择 | WebSearch / WebFetch / curl / Jina / CDP，按场景自主判断，可任意组合 |
| CDP Proxy 浏览器操作 | 直连用户日常 Chrome，天然携带登录态，支持动态页面、交互操作、视频截帧 |
| 三种点击方式 | `/click`（JS click）、`/clickAt`（CDP 真实鼠标事件）、`/setFiles`（文件上传） |
| 本地 Chrome 书签/历史检索 | `find-url.mjs` 查询公网搜不到的目标（内部系统）或用户访问过的页面，支持关键词/时间窗/访问频度排序 |
| 并行分治 | 多目标时分发子 Agent 并行执行，共享一个 Proxy，tab 级隔离 |
| 站点经验积累 | 按域名存储操作经验（URL 模式、平台特征、已知陷阱），跨 session 复用 |
| 媒体提取 | 从 DOM 直取图片/视频 URL，或对视频任意时间点截帧分析 |

**v2.5.0 更新：**
- **本地 Chrome 资源检索** — 新增 `scripts/find-url.mjs`，从本地 Chrome 书签/历史按关键词/时间窗/访问频度定位 URL。典型场景：用户提到组织内部系统（"我们的 XX 平台"等公网搜不到的目标）、回查之前访问过但不记得地址的页面、查看最近高频访问网站等（场景感谢 @MVPGFC 在 #60 提出）

<details><summary>v2.4.3 更新</summary>

- **修复 CLAUDE_SKILL_DIR 路径问题** — bash 代码块改用 `${CLAUDE_SKILL_DIR}` 字符串替换语法，修复 Windows Git Bash 路径转换错误和变量未设置问题（#47 #46）
- **站点经验列表合并到前置检查** — 启动检查通过后自动输出已有站点经验列表，移除不可靠的 `!` 内联注入
</details>

<details><summary>v2.4.1 更新</summary>

- **跨平台支持** — 脚本从 bash 迁移到 Node.js，Windows / Linux / macOS 均可使用
- **DOM 边界穿透** — 新增技术事实：eval 递归遍历可穿透 Shadow DOM、iframe 等选择器不可跨越的边界
</details>

<details><summary>v2.4 更新</summary>

- **站点内 URL 可靠性** — 新增事实说明：站点生成的链接自带完整上下文，手动构造的 URL 可能缺失隐式必要参数
- **平台错误提示不可信** — 新增技术事实：平台返回的"内容不存在"等提示可能是访问方式问题而非内容本身问题
- **小红书站点经验增强** — xsec_token 机制、创作者平台状态校验、暂存草稿流程
</details>

<details><summary>v2.3 更新</summary>

- **浏览哲学重构** — 更清晰的「像人一样思考」框架，强调目标驱动而非步骤驱动
- **Jina 积极推荐** — 明确鼓励在合适场景主动使用 Jina 节省 token
- **子 Agent prompt 指引优化** — 明确加载写法，增加避免动词暗示执行方式的说明
</details>

## 安装

**方式一：npx skills 一键安装（推荐）**

```bash
npx skills add eze-is/web-access
```

> [skills CLI](https://github.com/vercel-labs/skills) 是开源的 Agent Skill 包管理器，自动检测你的 Agent 环境并安装到正确位置。

**方式二：让 Agent 自动安装**

```
帮我安装这个 skill：https://github.com/eze-is/web-access
```

**方式三：Plugin 安装（Claude Code）**

```bash
claude plugin marketplace add https://github.com/eze-is/web-access
claude plugin install web-access@web-access --scope user
```

**方式四：手动**

```bash
git clone https://github.com/eze-is/web-access /path/to/web-access
# 例如本地开发 checkout：
# git clone https://github.com/eze-is/web-access /Users/bin/Desktop/project/web-access
```

说明：

- Agent 运行时会通过 `CLAUDE_SKILL_DIR` 定位当前 skill 目录，因此不要求固定安装到 `~/.claude/skills/web-access`
- 如果你使用 Claude 的技能目录约定，再把仓库放到对应 skills 目录即可；如果你是本地开发或自定义加载，保持当前 checkout 路径也没问题

## 前置配置（CDP 模式）

CDP 模式需要 **Node.js 22+** 和 Chrome 开启远程调试：

1. Chrome 地址栏打开 `chrome://inspect/#remote-debugging`
2. 勾选 **Allow remote debugging for this browser instance**（可能需要重启浏览器）

环境检查（Agent 运行时会自动完成前置检查，无需手动执行）：

```bash
node "${CLAUDE_SKILL_DIR}/scripts/check-deps.mjs"
# $CLAUDE_SKILL_DIR 是 skill 加载时自动设置的环境变量
# 手动运行请替换为实际路径，例如：
# node "/Users/bin/Desktop/project/web-access/scripts/check-deps.mjs"
```

## CDP Proxy API

Proxy 通过 WebSocket 直连 Chrome（兼容 `chrome://inspect` 方式，无需命令行参数启动），提供 HTTP API：

```bash
# 启动（Agent 会自动管理 Proxy 生命周期，无需手动启动）
node "${CLAUDE_SKILL_DIR}/scripts/cdp-proxy.mjs" &
# 手动运行请替换为实际路径，例如：
# node "/Users/bin/Desktop/project/web-access/scripts/cdp-proxy.mjs" &

# 页面操作
curl -s "http://localhost:3456/new?url=https://example.com"     # 新建 tab
curl -s -X POST "http://localhost:3456/eval?target=ID" -d 'document.title'  # 执行 JS
curl -s -X POST "http://localhost:3456/click?target=ID" -d 'button.submit'  # JS 点击
curl -s -X POST "http://localhost:3456/clickAt?target=ID" -d '.upload-btn'  # 真实鼠标点击
curl -s -X POST "http://localhost:3456/setFiles?target=ID" \
  -d '{"selector":"input[type=file]","files":["/path/to/file.png"]}'        # 文件上传
curl -s "http://localhost:3456/screenshot?target=ID&file=/tmp/shot.png"     # 截图
curl -s "http://localhost:3456/scroll?target=ID&direction=bottom"           # 滚动
curl -s "http://localhost:3456/close?target=ID"                             # 关闭 tab
```

## ⚠️ 使用前提醒

通过浏览器自动化操作社交平台（如小红书）存在账号被平台限流或封禁的风险。**强烈建议使用小号进行操作。**

## 使用

安装后直接让 Agent 执行联网任务，skill 自动接管：

- "帮我搜索 xxx 最新进展"
- "读一下这个页面：[URL]"
- "去小红书搜索 xxx 的账号"
- "帮我在创作者平台发一篇图文"
- "同时调研这 5 个产品的官网，给我对比摘要"

## 外链执行器（V1）

仓库内提供了一个最小 CLI，用于把单条攻略页编译成 runbook，并在目标站推进到下一个检查点：

```bash
# 启动一次新任务
node "./scripts/backlink-executor.mjs" start \
  --guide-url "https://pdfreprinting.net/wailian/2026-03/22811425142228521/" \
  --target-link "https://www.dfilters.com/" \
  --content-file "/path/to/content-inputs.json" \
  --choose-path "profile_link"

# 从已有 runbook 恢复
node "./scripts/backlink-executor.mjs" resume \
  --runbook "$HOME/.gstack/projects/eze-is-web-access/runbooks/<runbook-id>.json" \
  --result-state "awaiting_review"
```

`content-inputs.json` 最小格式：

```json
{
  "site_name": "DFilters",
  "site_summary": "A filter discovery site",
  "anchor_text": "dfilters"
}
```

生成型 runbook 默认保存在：

```bash
~/.gstack/projects/eze-is-web-access/runbooks/
```

可选参数：

- `--choose-path`：在 `choose_path` 检查点直接指定路径，当前支持 `profile_link` / `thread_post`
- `--result-state`：在 `pre_submit_check` 检查点直接写入结果，当前支持 `public` / `awaiting_review` / `blocked`

如果在交互式终端中运行，且未提供上述参数，CLI 会在检查点直接提示你选择；非交互环境下则保持暂停并落盘，等待后续 `resume`。

当前版本只做：
- 单攻略、单站点、单次执行
- `choose_path` / `pre_submit_check` 两个检查点落盘
- 轻量恢复，不从头重跑
- 成功完成后默认关闭自己创建的主 tab

`profile_link` 当前已收敛为 3 个内部能力边界：
- `create_or_update`：进入资料编辑路径并写入目标链接/简介
- `verify_public`：在公开资料页回读真实外链，确认链接确实可见
- `idempotent_short_circuit`：如果公开页已经存在目标链接，则直接进入检查点，不再重复编辑

当前已验证样本链路：
- `community.cbr.com`：`profile_link` / `thread_post`
- `myminifactory.com`：`profile_link`
- `wakelet.com`：`profile_link`
- `daily.dev`：`profile_link`

当前已知限制：
- `daily.dev` 的 `settings/profile` 仍可能返回只有标题、没有可见 DOM 的空壳页；当前执行器通过“复用已登录 tab + 已有公开链接短路”规避，但对首次冷启动编辑仍不稳定。

当前版本不做：
- Chrome 插件壳
- 模型 API 接入
- 多站点调度框架

## 飞书执行底表

当前仓库的人工执行编排，已经收敛为“两张表”的最小结构：

### 1. `外链`

这张表是账号主表，一行代表一个邮箱账号 / 一个指纹环境。建议长期保留的列如下：

- `IP所在区域`
- `指纹的名称`
- `邮箱账号`
- `邮箱密码`
- `安全邮箱`
- `2FA 验证`
- `默认外链账户密码`
- `browser_env`
- `mail_provider`
- `服务网站`
- `待推URL`
- `账号状态`
- `备注`

约束：

- 一行只服务一个网站
- `browser_env` 当前统一使用 `hubstudio`
- `mail_provider` 当前支持 `gmail` / `outlook`
- `googlemail` 会归一化为 `gmail`，`hotmail` / `live` 会归一化为 `outlook`
- `服务网站` 是该邮箱当前负责推广的网站主域名
- `待推URL` 是该网站当前要投放的目标链接

### 2. `外链提交记录`

这张表是宽表，一行仍然对应一个邮箱账号，但横向展开多个外链站点：

- `邮箱账号`
- `服务网站`
- `外链推广站点1` / `状态1`
- `外链推广站点2` / `状态2`
- ...

约束：

- 一行只对应一个邮箱
- 该邮箱只对应一个 `服务网站`
- 同一行里的所有 `外链推广站点N`，都表示这个网站要去投放的目标站点
- 每个站点后必须紧跟自己的 `状态N`，避免状态和站点错位

推荐状态值：

- `pending`：还没开始
- `running`：执行中
- `done`：已完成并确认公开可见
- `blocked`：当前卡住，需要人工处理
- `skip`：当前决定跳过

当前公开 API 没有稳定的“单元格备注”写入口，因此细节说明先统一放在普通 `备注` 列中，而不是依赖右键菜单里的悬浮备注。

`mail_provider` 的实现约束：

- 适配器注册时必须提供 `openInbox` 和 `sendMail`
- `createMailAccountDescriptor` 会把 `provider_kind`、邮箱地址和登录邮箱统一转成小写并裁剪空白
- 账号描述中的字段名采用下划线风格：`provider_kind`、`login_email`、`display_name`

## 测试

使用 Node 原生测试：

```bash
node --test test/runbook.test.mjs test/executor.test.mjs
```

## 设计哲学

> Skill = 哲学 + 技术事实，不是操作手册。讲清 tradeoff 让 AI 自己选，不替它推理。

详见 [SKILL.md](./SKILL.md) 中的浏览哲学部分。

## License

MIT · 作者：[一泽 Eze](https://github.com/eze-is) · [官网](https://web-access.eze.is)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=eze-is/web-access&type=Date)](https://star-history.com/#eze-is/web-access&Date)

<img width="1280" height="306" alt="image" src="https://github.com/user-attachments/assets/2afa25c2-3730-413e-b40f-94e52567249d" />
