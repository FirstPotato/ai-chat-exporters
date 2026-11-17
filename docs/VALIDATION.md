# 本地验证记录

日期：2026-11-17。运行环境：Node.js 24.18.0，Windows。

- 两个 `.user.js` 均通过 Node 语法检查；`.meta.js` 与脚本头部一致。
- ChatGPT 元数据结束后的内容与指定 `gptnew.txt` 相同。比较时仅统一 CRLF/LF 和文件末尾空白；已通过 SHA-256 对比。
- Gemini 的 12 组模拟回归检查通过：列表布局/校验、分页去重、重复游标、侧边栏降级、账号固定、批量部分失败、全部失败、搜索/日期筛选、选择导出、取消选择、JSON 保留、图片识别与下载处理。
- Gitleaks 对项目目录扫描通过，未发现秘密。
- 输入来源、脚本 SHA-256 和检查项目记录于 [PROVENANCE.json](PROVENANCE.json)。生成后的 `.local/check-results.json` 为本地运行产物，不纳入 Git。

测试使用合成数据以及模拟 DOM、API、图片回调和 JSZip；不代表真实 Gemini / ChatGPT 账号已端到端验证。真实浏览器布局、跨域下载权限、CDN 获取和 ZIP 压缩尚未验证。GitHub 上传按用户要求留待稍后。

## 安装后核对

1. 停用旧版导出脚本，安装项目内的 `.user.js`，刷新页面。
2. 用一篇已知对话核对文本、顺序和数量。
3. Gemini 选择两篇对话导出，确认 ZIP 有相应 JSON、Markdown 和 `export-report.json`。
4. 如需图片，开启可选图片下载并检查报告，不以出现 ZIP 文件作为完整成功的依据。
