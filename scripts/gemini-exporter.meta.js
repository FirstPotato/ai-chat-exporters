// ==UserScript==
// @name         Gemini Universal Batch Exporter
// @name:zh-CN   Gemini 通用导出器
// @namespace    https://github.com/FirstPotato/ai-chat-exporters
// @version      2.1.2
// @description  Export Gemini chats as Markdown and raw JSON with chat selection, optional images, and an export report.
// @description:zh-CN  导出 Gemini 会话为 Markdown 和原始 JSON，支持选择会话、筛选、可选图片下载及导出报告。
// @author       dikelps, Antigravity
// @license      MIT
// @homepageURL  https://github.com/FirstPotato/ai-chat-exporters
// @supportURL   https://github.com/FirstPotato/ai-chat-exporters/issues
// @downloadURL  https://raw.githubusercontent.com/FirstPotato/ai-chat-exporters/main/scripts/gemini-exporter.user.js
// @updateURL    https://raw.githubusercontent.com/FirstPotato/ai-chat-exporters/main/scripts/gemini-exporter.meta.js
// @match        https://gemini.google.com/*
// @match        https://gemini.google.com/app
// @match        https://gemini.google.com/app/*
// @match        https://gemini.google.com/u/*/app
// @match        https://gemini.google.com/u/*/app/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @run-at       document-idle
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      googleusercontent.com
// @sandbox      JavaScript
// @noframes
// ==/UserScript==
