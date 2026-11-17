# 来源与第三方声明

## ChatGPT

- 上游：[OwlCt/ChatGPT-Export](https://github.com/OwlCt/ChatGPT-Export)
- 本次输入：用户指定的 `gptnew.txt`，版本 1.3.6，作者字段 OwlCt。
- 上游许可证署名：Copyright (c) 2026 huhu。
- 许可证完整文本：[licenses/ChatGPT-Export.LICENSE](licenses/ChatGPT-Export.LICENSE)。
- 本仓库 1.3.6.1 只改变元数据；功能代码与该输入文件一致。1.3.6.2 增加选中行样式与就地更新选择状态。

## Gemini

- 原始核心：[dikelps/gemini-conversation-exporter](https://github.com/dikelps/gemini-conversation-exporter)，用户输入版本 0.1.8。
- 批量版输入：用户提供的 Gemini Universal Batch Exporter 2.0.0，作者字段 dikelps, Antigravity。
- 上游许可证署名：Copyright (c) 2026 dikelps。
- 许可证完整文本：[licenses/Gemini-Conversation-Exporter.LICENSE](licenses/Gemini-Conversation-Exporter.LICENSE)。
- 本仓库修复批量版并增加可移植的选择、JSON 与图片导出功能；功能思路参考上述 ChatGPT 版本。

## 协议资料

列表字段位置与图片字段形状参考独立实现 [Kept Gemini adapter](https://github.com/egroup-labs/kept/blob/main/extension/platforms/gemini.js)。它是非官方实现，不构成 Google 的接口兼容保证。

## 运行时依赖

两个脚本通过 `@require` 使用 [JSZip 3.10.1](https://github.com/Stuk/jszip)，上游采用 MIT 或 GPLv3 双许可证。本仓库不内嵌 JSZip 源码；CDN 地址保留在用户脚本元数据内。

原作者信息和许可证保留。ChatGPT/Gemini 名称属于相应服务；本项目并非官方产品。
