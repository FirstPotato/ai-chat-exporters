# 稍后上传 GitHub

计划目标：`FirstPotato/ai-chat-exporters`，分支 `main`。本文件和脚本中的目标链接只代表准备好的发布配置，不代表远端已创建。

仓库是否公开仍需在发布时确定。公开仓库可提供油猴安装与自动更新链接；私有仓库仅作源码备份，不能按 README 的公开 raw 链接分发更新。

恢复 GitHub CLI 登录后，在项目目录执行：

```powershell
gh auth login --hostname github.com --git-protocol https --web
gh api user --jq .login
```

确认登录账号和仓库名，再检查远端是否已存在。新建公开仓库时可使用：

```powershell
gh repo create FirstPotato/ai-chat-exporters --public --source . --remote origin --push
```

如选择私有仓库，改用 `--private`。如果目标仓库已存在，应先检查其内容再配置 remote，不能强制覆盖。

发布后检查仓库文件、四个 `.user.js` / `.meta.js` raw 地址，并在油猴中实际安装验证。以后修改脚本先提升脚本的 `@version`，运行：

```powershell
npm run metadata
npm run check
npm test
```

逐项暂存本次改动并提交，再推送 `main`。不要提交真实会话、登录凭据、HAR 或导出包。
