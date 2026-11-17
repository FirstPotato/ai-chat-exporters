# AI Chat Exporters

FirstPotato 的两个油猴脚本：ChatGPT 导出器与 Gemini 导出器。通过 Tampermonkey 安装，不是独立的 Chrome 扩展。

## 本地安装

1. 在浏览器中打开 Tampermonkey 管理面板，新建用户脚本。
2. 将 `scripts/chatgpt-exporter.user.js` 或 `scripts/gemini-exporter.user.js` 的**完整内容**粘贴到编辑器并保存。
3. 停用之前安装的同类导出器，刷新 ChatGPT / Gemini 页面。
4. 先导出一篇已知会话核对内容，再导出多篇。

顶部 `// ==UserScript==` 和 `// @...` 是油猴读取的元数据，必须保留。

## GitHub 安装与更新

公开仓库的安装链接如下。安装更新后刷新对应网站页面；旧版同类脚本请保持停用。

- [安装 ChatGPT 导出器](https://raw.githubusercontent.com/FirstPotato/ai-chat-exporters/main/scripts/chatgpt-exporter.user.js)
- [安装 Gemini 导出器](https://raw.githubusercontent.com/FirstPotato/ai-chat-exporters/main/scripts/gemini-exporter.user.js)

脚本的 `@downloadURL` 指向 `.user.js`，`@updateURL` 指向只包含元数据的 `.meta.js`。发布更新时提高 `@version`，运行 `npm run metadata`，提交并推送四个脚本文件。私有仓库不能直接按上述公开链接分发更新。

## 界面

两个脚本默认只显示右下角紧凑的“导出”按钮，点击展开菜单；点击外部或按 Escape 收起。菜单和弹窗采用白色面板、绿色主按钮与选中高亮。ChatGPT 的项目、团队和全量导出位于“更多导出选项…”。

## 功能

| 项目 | ChatGPT 1.3.6.3 | Gemini 2.1.3 |
|---|---|---|
| 基础 | 用户指定的 `gptnew.txt`（上游 1.3.6）+ 选择界面改进 | 原 Gemini 导出器核心 + 本地修复与扩展 |
| 范围 | 个人、项目、团队空间 | 当前登录 Google 账号可发现的会话 |
| 选择 | 选中行高亮、选择会话、搜索、日期/状态筛选 | 选择会话、标题/ID 搜索、日期筛选 |
| 格式 | ZIP 内 JSON + Markdown | 当前会话 `.md`；批量/选中 ZIP 内原始 JSON + Markdown |
| 资源 | 沿用上游图片/附件下载逻辑 | 默认关闭的图片下载尝试；文件附件未适配 |
| 报告 | 沿用上游失败提示 | ZIP 内 `export-report.json`，记录列表扫描、每篇结果、图片结果 |
| 离线阅读器 | 此版本文件未实现 | 未实现；可用 Markdown 阅读器打开 |

### Gemini 使用说明

- **当前会话**：导出当前问答文本为 Markdown。
- **全部会话 ZIP**：扫描接口返回的全部可发现会话并导出 ZIP。只需部分内容时请用“选择会话”。
- **停止**：导出运行时在入口旁显示，点击会中止请求、等待与 ZIP 生成，并丢弃本次尚未下载的内容。同步处理期间需等浏览器响应点击；已下载文件不受影响。ChatGPT 当前仍没有停止按钮，可刷新页面中止未完成的任务。
- **选择会话**：扫描后按标题/ID 和日期筛选；“全选匹配”选择全部匹配项。切换筛选条件不会清空已选内容，状态栏显示总选择数。
- **设置 → 尝试下载图片**：识别历史数据中的 Google 图片 CDN 资源，通过油猴下载到 ZIP 的 `images/`。每篇最多 100 张，每张最多 30 MB；失败写入报告，不会伪报完整成功。
- 日期使用会话列表返回的时间；未确认它一定代表创建时间或更新时间。启用日期筛选时排除未知时间。
- Markdown 校验失败时，已获取的原始历史 JSON 仍保留，报告状态为 `json-only`。

## 边界与验证

两个脚本都依赖网站内部接口。接口、账号差异和浏览器权限可能导致失败。Gemini 的列表扫描结束只表示识别到了接口末页，不能独立证明账号历史全部覆盖。侧边栏补充、分页异常或单篇/图片失败会标记为部分导出。

Gemini 未适配文件附件、项目/团队空间或完整分支恢复。已识别的图片集中列在 Markdown 末尾，可能含其他候选回答的图片。原始 JSON 保留接口返回的数据，便于后续检查。

本地检查覆盖 JavaScript 语法、元数据，以及 Gemini 的模拟 DOM/API/图片/ZIP 流程。没有完成真实账号的端到端导出验证，也没有验证真实 CDN 权限和压缩下载。见 [验证说明](docs/VALIDATION.md)。

## 开发

需要 Node.js 20+；本地检查无需安装依赖。

```powershell
npm run metadata
npm run check
npm test
```

请把真实导出包保存在项目外；`.local/`、`exports/`、ZIP、HAR、环境变量和常见凭据文件均已忽略。仓库只管理脚本、说明和合成测试数据。

来源、许可证与修改范围见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 和 [CHANGELOG.md](CHANGELOG.md)。
