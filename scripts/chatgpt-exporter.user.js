// ==UserScript==
// @name         ChatGPT Universal Exporter (Markdown Support)
// @name:zh-CN   ChatGPT 通用导出器（Markdown 支持）
// @name:zh-TW   ChatGPT 通用匯出器（Markdown 支援）
// @namespace    https://github.com/FirstPotato/ai-chat-exporters
// @version      1.3.6.4
// @description  Export ChatGPT conversations from personal, project, and team workspaces to local ZIP archives with JSON, Markdown, and assets.
// @description:zh-CN  将 ChatGPT 个人、项目和团队空间对话导出为本地 ZIP，包含 JSON、Markdown 和资源文件。
// @description:zh-TW  將 ChatGPT 個人、專案和團隊工作區對話匯出為本機 ZIP，包含 JSON、Markdown 和資源檔案。
// @author       OwlCt
// @license      MIT
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js#sha256=acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e
// @grant        none
// @homepageURL  https://github.com/FirstPotato/ai-chat-exporters
// @supportURL   https://github.com/FirstPotato/ai-chat-exporters/issues
// @source       https://github.com/OwlCt/ChatGPT-Export
// @downloadURL  https://raw.githubusercontent.com/FirstPotato/ai-chat-exporters/main/scripts/chatgpt-exporter.user.js
// @updateURL    https://raw.githubusercontent.com/FirstPotato/ai-chat-exporters/main/scripts/chatgpt-exporter.meta.js
// ==/UserScript==

/* ============================================================
    v1.3.6 变更 (Greasy Fork 提交元数据)
    ------------------------------------------------------------
    • 补充 Greasy Fork 可识别的多语言 @name / @description
    • 去掉手写 @downloadURL / @updateURL，交给 Greasy Fork 自动生成
    ========================================================== */

(function () {
    'use strict';

    // --- 配置与全局变量 ---
    const BASE_DELAY = 600;
    const JITTER = 400;
    const PAGE_LIMIT = 100;
    const PROJECT_SIDEBAR_PREVIEW = 5;
    const PROJECT_SIDEBAR_LIMIT = 50;
    let accessToken = null;
    let capturedWorkspaceIds = new Set(); // 使用Set存储网络拦截到的ID，确保唯一性

    const SCRIPT_FALLBACK_LOCALE = 'en-US';
    const SCRIPT_LOCALES = {
        'en-US': {
            'button.export': 'Export Conversations',
            'button.exportAll': 'Export all',
            'button.exportAllZip': 'Export all (ZIP)',
            'button.selectConversationsExport': 'Select chats',
            'button.cancel': 'Cancel',
            'button.back': 'Back',
            'button.clear': 'Clear',
            'button.selectAll': 'Select all',
            'button.clearDates': 'Clear dates',
            'button.exportSelected': 'Export selected ({count})',
            'button.loadMore': 'Load more ({count} remaining)',
            'button.done': 'Done',
            'button.error': 'Error',
            'fallback.conversation': 'Conversation',
            'fallback.untitledConversation': 'Untitled Conversation',
            'fallback.unknown': 'Unknown',
            'fallback.untitledProject': 'Untitled Project',
            'fallback.file': 'File',
            'mode.personal': 'Personal space',
            'mode.project': 'Project space',
            'mode.team': 'Team space',
            'dialog.selectSpaceTitle': 'Choose export space',
            'dialog.personalTitle': 'Personal space',
            'dialog.personalCopy': 'Export conversations from your personal account.',
            'dialog.projectTitle': 'Project space',
            'dialog.projectCopy': 'Export project-space conversations, grouped by project.',
            'dialog.teamTitle': 'Team space',
            'dialog.teamCopy': 'Export team-space conversations. The Workspace ID is detected automatically.',
            'dialog.exportTeamTitle': 'Export team space',
            'dialog.multipleWorkspace': 'Multiple workspaces detected. Choose one:',
            'dialog.workspaceDetected': 'Workspace ID detected automatically:',
            'dialog.workspaceMissing': 'Could not detect a Workspace ID.',
            'dialog.workspaceMissingHint': 'Refresh the page, open a team conversation, or enter one manually below.',
            'dialog.manualWorkspaceLabel': 'Team Workspace ID:',
            'dialog.workspacePlaceholder': 'Paste your Workspace ID (ws-...)',
            'dialog.selectConversationsTitle': 'Choose conversations to export',
            'dialog.space': 'Space: {mode}{workspace}',
            'dialog.searchPlaceholder': 'Search title/project/ID',
            'dialog.projectScopeLocked': 'Project space only includes project conversations',
            'filter.scopeAll': 'All scopes',
            'filter.scopeProject': 'Projects only',
            'filter.scopeRoot': 'Root only',
            'filter.statusAll': 'All statuses',
            'filter.statusActive': 'Active only',
            'filter.statusArchived': 'Archived only',
            'filter.timeUpdate': 'By updated time',
            'filter.timeCreate': 'By created time',
            'filter.dateTo': 'to',
            'status.loadingList': 'Loading list...',
            'status.listSummary': '{total} total, {filtered} filtered, showing {visible}, selected {selected}',
            'status.noMatches': 'No matching conversations.',
            'status.loadFailed': 'Load failed: {message}',
            'status.fetchingOrphanConversations': 'Fetching root conversations...',
            'status.rootProgress': 'Root ({current}/{total})',
            'status.fetchingProjectList': 'Fetching project list...',
            'status.project': 'Project: {title}',
            'status.projectProgress': '{title}... ({current}/{total})',
            'status.generatingZip': 'Generating ZIP...',
            'status.rootPage': 'Root conversations ({state} p{page})',
            'status.active': 'Active',
            'status.archived': 'Archived',
            'picker.timeCreated': 'Created',
            'picker.timeUpdated': 'Updated',
            'picker.unknownTime': 'Unknown',
            'picker.projectTag': 'Project: {title}',
            'picker.archivedTag': 'Archived',
            'alert.accessTokenUnavailable': 'Could not get Access Token. Refresh the page or open any conversation and try again.',
            'alert.exportCompletedWithFailures': 'Export complete, but {count} conversations failed and were skipped:\n\n{list}',
            'alert.exportSuccess': 'Export complete.',
            'alert.exportFailed': 'Export failed: {message}. See the console for details (F12 -> Console).',
            'alert.noProjectConversations': 'No project-space conversations found.',
            'alert.projectExportFailed': 'Project-space export failed: {message}',
            'alert.invalidWorkspaceId': 'Choose or enter a valid Team Workspace ID.',
            'confirm.scheduledExport': 'Chrome extension requested exporting {mode} conversations (source: {source}). Start now?',
            'error.deviceIdUnavailable': 'Could not get oai-device-id. Make sure you are signed in and refresh the page.',
            'error.projectSpaceListFailed': 'Failed to fetch project-space list ({status})',
            'error.projectConversationListFailed': 'Failed to list project conversations ({status})',
            'error.rootConversationListFailed': 'Failed to list root conversations ({status})',
            'error.conversationListFailed': 'Failed to list conversations ({status})',
            'error.projectSpaceConversationListFailed': 'Failed to list project-space conversations ({status})',
            'error.conversationDetailFailed': 'Failed to fetch conversation {id} ({status})',
            'error.fileDownloadUrlFailed': 'Failed to get file download URL ({status})',
            'error.imageDownloadFailed': 'Image download failed ({status})',
            'error.fileDownloadFailed': 'File download failed ({status})',
            'error.noDownloadUrl': 'No available download URL'
        },
        'zh-CN': {
            'button.export': '导出对话',
            'button.exportAll': '导出全部',
            'button.exportAllZip': '导出全部 (ZIP)',
            'button.selectConversationsExport': '选择对话导出',
            'button.cancel': '取消',
            'button.back': '返回',
            'button.clear': '清空',
            'button.selectAll': '全选',
            'button.clearDates': '清空日期',
            'button.exportSelected': '导出选中 ({count})',
            'button.loadMore': '加载更多（剩余 {count} 条）',
            'button.done': '完成',
            'button.error': '错误',
            'fallback.conversation': '对话',
            'fallback.untitledConversation': '未命名对话',
            'fallback.unknown': '未知',
            'fallback.untitledProject': '未命名项目',
            'fallback.file': '文件',
            'mode.personal': '个人空间',
            'mode.project': '项目空间',
            'mode.team': '团队空间',
            'dialog.selectSpaceTitle': '选择要导出的空间',
            'dialog.personalTitle': '个人空间',
            'dialog.personalCopy': '导出您个人账户下的对话。',
            'dialog.projectTitle': '项目空间',
            'dialog.projectCopy': '导出项目空间下的对话，将按项目自动分组。',
            'dialog.teamTitle': '团队空间',
            'dialog.teamCopy': '导出团队空间下的对话，将自动检测 ID。',
            'dialog.exportTeamTitle': '导出团队空间',
            'dialog.multipleWorkspace': '检测到多个 Workspace，请选择一个：',
            'dialog.workspaceDetected': '已自动检测到 Workspace ID：',
            'dialog.workspaceMissing': '未能自动检测到 Workspace ID。',
            'dialog.workspaceMissingHint': '请尝试刷新页面或打开一个团队对话，或在下方手动输入。',
            'dialog.manualWorkspaceLabel': '手动输入 Team Workspace ID：',
            'dialog.workspacePlaceholder': '粘贴您的 Workspace ID (ws-...)',
            'dialog.selectConversationsTitle': '选择要导出的对话',
            'dialog.space': '空间：{mode}{workspace}',
            'dialog.searchPlaceholder': '搜索标题/项目名/ID',
            'dialog.projectScopeLocked': '项目空间仅包含项目对话',
            'filter.scopeAll': '全部范围',
            'filter.scopeProject': '仅项目',
            'filter.scopeRoot': '仅项目外',
            'filter.statusAll': '全部状态',
            'filter.statusActive': '仅未归档',
            'filter.statusArchived': '仅已归档',
            'filter.timeUpdate': '按更新时间',
            'filter.timeCreate': '按创建时间',
            'filter.dateTo': '至',
            'status.loadingList': '正在加载列表...',
            'status.listSummary': '共 {total} 条，当前筛选 {filtered} 条，显示 {visible} 条，已选 {selected} 条',
            'status.noMatches': '没有匹配的对话。',
            'status.loadFailed': '加载失败: {message}',
            'status.fetchingOrphanConversations': '获取项目外对话...',
            'status.rootProgress': '根目录 ({current}/{total})',
            'status.fetchingProjectList': '获取项目列表...',
            'status.project': '项目: {title}',
            'status.projectProgress': '{title}... ({current}/{total})',
            'status.generatingZip': '生成 ZIP 文件...',
            'status.rootPage': '项目外对话 ({state} p{page})',
            'status.active': 'Active',
            'status.archived': 'Archived',
            'picker.timeCreated': '创建',
            'picker.timeUpdated': '更新',
            'picker.unknownTime': '未知',
            'picker.projectTag': '项目: {title}',
            'picker.archivedTag': '已归档',
            'alert.accessTokenUnavailable': '无法获取 Access Token。请刷新页面或打开任意一个对话后再试。',
            'alert.exportCompletedWithFailures': '导出完成，但有 {count} 个对话失败（已跳过）：\n\n{list}',
            'alert.exportSuccess': '导出完成！',
            'alert.exportFailed': '导出失败: {message}。详情请查看控制台（F12 -> Console）。',
            'alert.noProjectConversations': '未找到项目空间对话。',
            'alert.projectExportFailed': '导出项目空间失败: {message}',
            'alert.invalidWorkspaceId': '请选择或输入一个有效的 Team Workspace ID！',
            'confirm.scheduledExport': 'Chrome 扩展请求导出 {mode} 对话（来源: {source}）。是否开始？',
            'error.deviceIdUnavailable': '无法获取 oai-device-id，请确保已登录并刷新页面。',
            'error.projectSpaceListFailed': '获取项目空间列表失败 ({status})',
            'error.projectConversationListFailed': '列举项目对话列表失败 ({status})',
            'error.rootConversationListFailed': '列举项目外对话列表失败 ({status})',
            'error.conversationListFailed': '列举对话列表失败 ({status})',
            'error.projectSpaceConversationListFailed': '列举项目空间对话列表失败 ({status})',
            'error.conversationDetailFailed': '获取对话详情失败 conv {id} ({status})',
            'error.fileDownloadUrlFailed': '文件下载链接获取失败 ({status})',
            'error.imageDownloadFailed': '图片下载失败 ({status})',
            'error.fileDownloadFailed': '文件下载失败 ({status})',
            'error.noDownloadUrl': '没有可用下载链接'
        }
    };

    function makeTraditionalChineseScriptLocale(source) {
        const replacements = [
            ['导出', '匯出'], ['导入', '匯入'], ['选择', '選擇'], ['对话', '對話'], ['设置', '設定'],
            ['关闭', '關閉'], ['打开', '開啟'], ['边栏', '邊欄'], ['项目', '項目'], ['团队', '團隊'],
            ['空间', '空間'], ['个人', '個人'], ['检测', '偵測'], ['多个', '多個'], ['请输入', '請輸入'],
            ['输入', '輸入'], ['粘贴', '貼上'], ['标题', '標題'], ['范围', '範圍'], ['状态', '狀態'],
            ['归档', '封存'], ['创建', '建立'], ['更新', '更新'], ['清空', '清除'], ['加载', '載入'],
            ['列表', '清單'], ['筛选', '篩選'], ['显示', '顯示'], ['选中', '選取'], ['匹配', '符合'],
            ['时间', '時間'], ['未知', '未知'], ['全部', '全部'], ['取消', '取消'], ['返回', '返回'],
            ['完成', '完成'], ['错误', '錯誤'], ['未命名', '未命名'], ['文件', '檔案'], ['获取', '取得'],
            ['根目录', '根目錄'], ['生成', '產生'], ['失败', '失敗'], ['跳过', '略過'], ['无法', '無法'],
            ['刷新', '重新整理'], ['页面', '頁面'], ['任意', '任一'], ['成功', '成功'], ['图片', '圖片'],
            ['下载', '下載'], ['链接', '連結'], ['没有', '沒有'], ['可用', '可用'], ['详情', '詳細資訊'],
            ['控制台', '主控台'], ['发生', '發生'], ['严重', '嚴重'], ['自动', '自動'], ['列举', '列出'],
            ['有效', '有效'], ['请求', '要求'], ['来源', '來源'], ['开始', '開始'], ['确保', '確保'],
            ['登录', '登入'], ['侧边栏', '側邊欄'], ['预览', '預覽'], ['会话', '對話'], ['浏览器', '瀏覽器'],
            ['当前', '目前'], ['剩余', '剩餘'], ['仅', '僅'], ['按', '依'], ['个', '個'], ['条', '則'],
            ['请', '請'], ['这个', '這個'], ['一个', '一個']
        ];
        const converted = {};
        Object.entries(source).forEach(([key, value]) => {
            let text = value;
            replacements.forEach(([from, to]) => {
                text = text.split(from).join(to);
            });
            converted[key] = text;
        });
        return converted;
    }

    SCRIPT_LOCALES['zh-TW'] = makeTraditionalChineseScriptLocale(SCRIPT_LOCALES['zh-CN']);

    function normalizeScriptLocale(code) {
        return String(code || '').trim().replace(/_/g, '-');
    }

    function detectScriptLocale(languages = null) {
        const provided = Array.isArray(languages)
            ? languages
            : languages
                ? [languages]
                : null;
        const nav = window.navigator || (typeof navigator !== 'undefined' ? navigator : null);
        const candidates = provided || [
            ...(Array.isArray(nav?.languages) ? nav.languages : []),
            nav?.language,
            document.documentElement?.lang
        ].filter(Boolean);
        const normalized = candidates.map(normalizeScriptLocale).filter(Boolean);

        for (const code of normalized) {
            if (SCRIPT_LOCALES[code]) return code;
        }
        for (const code of normalized) {
            const lower = code.toLowerCase();
            if (['zh-tw', 'zh-hk', 'zh-mo', 'zh-hant'].some(locale => lower === locale || lower.startsWith(`${locale}-`))) return 'zh-TW';
            if (lower === 'zh' || lower.startsWith('zh-')) return 'zh-CN';
            if (lower === 'en' || lower.startsWith('en-')) return 'en-US';
        }
        return SCRIPT_FALLBACK_LOCALE;
    }

    const SCRIPT_LOCALE_CODE = detectScriptLocale();

    function getScriptTranslation(key, vars = {}, localeCode = SCRIPT_LOCALE_CODE) {
        const locale = SCRIPT_LOCALES[localeCode] || SCRIPT_LOCALES[SCRIPT_FALLBACK_LOCALE];
        const fallback = SCRIPT_LOCALES[SCRIPT_FALLBACK_LOCALE];
        const template = locale[key] ?? fallback[key] ?? key;
        return String(template).replace(/\{(\w+)\}/g, (_, name) => (
            Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : `{${name}}`
        ));
    }

    const t = getScriptTranslation;

    // --- 核心：网络拦截与信息捕获 ---
    (function interceptNetwork() {
        const rawFetch = window.fetch;
        window.fetch = async function (resource, options) {
            tryCaptureToken(options?.headers);
            if (options?.headers?.['ChatGPT-Account-Id']) {
                const id = options.headers['ChatGPT-Account-Id'];
                if (id && !capturedWorkspaceIds.has(id)) {
                    console.log('🎯 [Fetch] 捕获到 Workspace ID:', id);
                    capturedWorkspaceIds.add(id);
                }
            }
            return rawFetch.apply(this, arguments);
        };

        const rawOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function () {
            this.addEventListener('readystatechange', () => {
                if (this.readyState === 4) {
                    try {
                        tryCaptureToken(this.getRequestHeader('Authorization'));
                        const id = this.getRequestHeader('ChatGPT-Account-Id');
                        if (id && !capturedWorkspaceIds.has(id)) {
                            console.log('🎯 [XHR] 捕获到 Workspace ID:', id);
                            capturedWorkspaceIds.add(id);
                        }
                    } catch (_) {}
                }
            });
            return rawOpen.apply(this, arguments);
        };
    })();

    function tryCaptureToken(header) {
        if (!header) return;
        const h = typeof header === 'string' ? header : header instanceof Headers ? header.get('Authorization') : header.Authorization || header.authorization;
        if (h?.startsWith('Bearer ')) {
        const token = h.slice(7);
        // [v8.2.0 修复] 在捕获源头增加验证，拒绝已知的无效占位符Token
        if (token && token.toLowerCase() !== 'dummy') {
            accessToken = token;
        }
        }
    }

    async function ensureAccessToken() {
        throwIfCancelled();
        if (accessToken) return accessToken;
        try {
            const session = await (await exportFetch('/api/auth/session?unstable_client=true')).json();
            if (session.accessToken) {
                accessToken = session.accessToken;
                return accessToken;
            }
        } catch (_) { throwIfCancelled(); }
        alert(t('alert.accessTokenUnavailable'));
        return null;
    }

    // --- 辅助函数 ---
    const MAX_SAFE_NAME_LENGTH = 120;
    const MAX_SAFE_ID_LENGTH = 64;
    const MAX_IMAGE_ID_LENGTH = 80;
    const LOCAL_FILE_REF_PREFIX = 'chatgpt-file:';
  let activeTask = null;

  function cancellationError() {
    const error = new Error("已停止导出，未下载的内容已丢弃。");
    error.name = "ExportCancelledError";
    return error;
  }

  function throwIfCancelled(task = activeTask) {
    if (task?.signal.aborted) throw cancellationError();
  }

  function onCancellation(task, callback) {
    if (!task) return () => {};
    if (task.signal.aborted) { callback(); return () => {}; }
    task.signal.addEventListener("abort", callback, { once: true });
    return () => task.signal.removeEventListener("abort", callback);
  }

  function sleep(ms) {
    const task = activeTask;
    throwIfCancelled(task);
    return new Promise((resolve, reject) => {
      let unsubscribe = () => {};
      const timer = setTimeout(() => { unsubscribe(); resolve(); }, ms);
      unsubscribe = onCancellation(task, () => { clearTimeout(timer); reject(cancellationError()); });
    });
  }

  // Use JSZip's public stream API so stopping also pauses ZIP generation.
  function generateZip(zip, task, onProgress) {
    throwIfCancelled(task);
    return new Promise((resolve, reject) => {
      const stream = zip.generateInternalStream({ type: "uint8array", compression: "DEFLATE" });
      let chunks = [];
      let settled = false;
      let unsubscribe = () => {};
      const fail = (error) => {
        if (settled) return;
        settled = true;
        stream.pause();
        chunks = [];
        unsubscribe();
        reject(error);
      };
      unsubscribe = onCancellation(task, () => fail(cancellationError()));
      stream.on("data", (chunk, metadata) => {
        if (settled) return;
        if (task.signal.aborted) { fail(cancellationError()); return; }
        chunks.push(chunk);
        onProgress?.(metadata.percent);
      });
      stream.on("error", fail);
      stream.on("end", () => {
        if (settled) return;
        if (task.signal.aborted) { fail(cancellationError()); return; }
        try {
          const blob = new Blob(chunks, { type: "application/zip" });
          chunks = [];
          settled = true;
          unsubscribe();
          resolve(blob);
        } catch (error) { fail(error); }
      });
      if (!settled) stream.resume();
    });
  }


    let exportUi = null;
    let exportNoticeTimer = null;

    function showExportNotice(message) {
        addBtn();
        clearTimeout(exportNoticeTimer);
        exportUi.status.textContent = message;
        exportUi.status.hidden = false;
        exportNoticeTimer = setTimeout(() => {
            if (!activeTask) exportUi.status.hidden = true;
        }, 10000);
    }

    function beginExportTask() {
        if (activeTask) {
            showExportNotice('已有任务正在运行，请先停止或等待完成。');
            return null;
        }
        addBtn();
        clearTimeout(exportNoticeTimer);
        activeTask = new AbortController();
        exportUi.dock.setExpanded(false);
        exportUi.stop.hidden = false;
        exportUi.stop.disabled = false;
        exportUi.stop.textContent = '停止';
        exportUi.status.hidden = false;
        exportUi.status.textContent = '正在准备导出…';
        exportUi.dock.text.textContent = '导出中';
        for (const button of exportUi.dock.menu.querySelectorAll('button')) button.disabled = true;
        return activeTask;
    }

    function finishExportTask(task) {
        if (activeTask !== task) return;
        activeTask = null;
        exportUi.stop.hidden = true;
        exportUi.stop.disabled = false;
        exportUi.dock.text.textContent = exportUi.caption;
        for (const button of exportUi.dock.menu.querySelectorAll('button')) button.disabled = false;
        clearTimeout(exportNoticeTimer);
        exportNoticeTimer = setTimeout(() => {
            if (!activeTask) exportUi.status.hidden = true;
        }, 10000);
    }

    // Only exporter requests receive this signal; website requests are unaffected.
    async function exportFetch(resource, options = {}) {
        const task = activeTask;
        throwIfCancelled(task);
        try {
            const response = await window.fetch(resource, task ? { ...options, signal: task.signal } : options);
            throwIfCancelled(task);
            return response;
        } catch (error) {
            throwIfCancelled(task);
            throw error;
        }
    }

    const jitter = () => BASE_DELAY + Math.random() * JITTER;
    const sanitizeFilename = (name, fallback = 'untitled', maxLength = MAX_SAFE_NAME_LENGTH) => {
        const fallbackName = String(fallback || 'untitled')
            .replace(/[\x00-\x1f\x7f]/g, '')
            .replace(/[\/\\?%*:|"<>]/g, '-')
            .trim() || 'untitled';
        let safe = String(name ?? '')
            .replace(/[\x00-\x1f\x7f]/g, '')
            .replace(/[\/\\?%*:|"<>]/g, '-')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/^[. -]+|[. -]+$/g, '');
        if (!safe) safe = fallbackName;
        if (safe.length > maxLength) {
            safe = safe.slice(0, maxLength).replace(/[. -]+$/g, '');
        }
        return safe || fallbackName;
    };
    const sanitizeImageFilenamePart = (value, fallback = 'image') => {
        const safe = sanitizeFilename(value, fallback, MAX_IMAGE_ID_LENGTH)
            .replace(/[^A-Za-z0-9_.-]+/g, '-')
            .replace(/[-.]{2,}/g, '-')
            .replace(/^[.-]+|[.-]+$/g, '');
        return safe || fallback;
    };
    const splitFilename = (filename) => {
        const idx = filename.lastIndexOf('.');
        if (idx <= 0 || idx === filename.length - 1) return { stem: filename, ext: '' };
        return { stem: filename.slice(0, idx), ext: filename.slice(idx) };
    };
    const makeUniqueZipFilename = (filename, registry, scopeKey = '') => {
        if (!registry) return filename;
        const key = scopeKey || '';
        if (!registry.has(key)) registry.set(key, new Set());
        const used = registry.get(key);
        let candidate = filename;
        if (used.has(candidate)) {
            const { stem, ext } = splitFilename(filename);
            let index = 2;
            do {
                candidate = `${stem} (${index++})${ext}`;
            } while (used.has(candidate));
        }
        used.add(candidate);
        return candidate;
    };
    const normalizeEpochSeconds = (value) => {
        if (!value) return 0;
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value > 1e12 ? Math.floor(value / 1000) : value;
        }
        if (typeof value === 'string') {
            const parsed = Date.parse(value);
            if (!Number.isNaN(parsed)) {
                return Math.floor(parsed / 1000);
            }
        }
        return 0;
    };
    const formatTimestamp = (value) => {
        const seconds = normalizeEpochSeconds(value);
        if (!seconds) return '';
        const date = new Date(seconds * 1000);
        return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
    };
    const parseDateInputToEpoch = (value, isEnd = false) => {
        if (!value) return null;
        const parts = value.split('-').map(Number);
        if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
        const [year, month, day] = parts;
        const date = isEnd
            ? new Date(year, month - 1, day, 23, 59, 59, 999)
            : new Date(year, month - 1, day, 0, 0, 0, 0);
        const epochMs = date.getTime();
        return Number.isNaN(epochMs) ? null : Math.floor(epochMs / 1000);
    };

    /**
     * [新增] 从Cookie中获取 oai-device-id
     * @returns {string|null} - 返回设备ID或null
     */
    function getOaiDeviceId() {
        const cookieString = document.cookie;
        const match = cookieString.match(/oai-did=([^;]+)/);
        return match ? match[1] : null;
    }

    function generateUniqueFilename(convData) {
        const convId = convData.conversation_id || '';
        const shortId = convId.includes('-') ? convId.split('-').pop() : (convId || Date.now().toString(36));
        let baseName = convData.title;
        if (!baseName || baseName.trim().toLowerCase() === 'new chat') {
            baseName = t('fallback.untitledConversation');
        }
        const safeBaseName = sanitizeFilename(baseName, t('fallback.untitledConversation'), MAX_SAFE_NAME_LENGTH);
        const safeShortId = sanitizeImageFilenamePart(shortId, 'conversation').slice(0, MAX_SAFE_ID_LENGTH);
        return `${safeBaseName}_${safeShortId}.json`;
    }

    function generateMarkdownFilename(convData) {
        const jsonName = generateUniqueFilename(convData);
        return jsonName.endsWith('.json')
            ? `${jsonName.slice(0, -5)}.md`
            : `${jsonName}.md`;
    }

    function cleanMessageContent(text) {
        if (!text) return '';
        return text
            .replace(/\uE200cite(?:\uE202turn\d+[a-z_]+\d+)+\uE201/gi, '')
            .replace(/[\uE200-\uE202]?cite(?:[\uE200-\uE202]?turn\d+[a-z_]+\d+)+[\uE200-\uE202]?/gi, '')
            .trim();
    }

    function processContentReferences(text, contentReferences) {
        if (!text || !Array.isArray(contentReferences) || contentReferences.length === 0) {
            return { text, footnotes: [] };
        }

        const references = contentReferences.filter(ref => ref && typeof ref.matched_text === 'string' && ref.matched_text.length > 0);
        if (references.length === 0) {
            return { text, footnotes: [] };
        }

        const getReferenceInfo = (ref) => {
            const file = inspectReferenceFile(ref);
            if (file) {
                const label = file.label || file.filename || t('fallback.file');
                return {
                    url: `${LOCAL_FILE_REF_PREFIX}${encodeURIComponent(file.key)}`,
                    title: label,
                    label,
                    fileKey: file.key
                };
            }
            const item = Array.isArray(ref.items) ? ref.items[0] : null;
            const url = item?.url || (Array.isArray(ref.safe_urls) ? ref.safe_urls[0] : '') || '';
            const title = item?.title || '';
            let label = item?.attribution || '';
            if (!label && typeof ref.alt === 'string') {
                const match = ref.alt.match(/\[([^\]]+)\]\([^)]+\)/);
                if (match) label = match[1];
            }
            if (!label) label = title || url;
            return { url, title, label };
        };

        const footnotes = [];
        const footnoteIndexByKey = new Map();
        const citationRefs = references
            .filter(ref => ref.type === 'grouped_webpages' || inspectReferenceFile(ref))
            .sort((a, b) => {
                const aIdx = Number.isFinite(a.start_idx) ? a.start_idx : Number.MAX_SAFE_INTEGER;
                const bIdx = Number.isFinite(b.start_idx) ? b.start_idx : Number.MAX_SAFE_INTEGER;
                return aIdx - bIdx;
            });

        citationRefs.forEach(ref => {
            const info = getReferenceInfo(ref);
            if (!info.url) return;
            const key = `${info.url}|${info.title}`;
            if (footnoteIndexByKey.has(key)) return;
            const index = footnotes.length + 1;
            footnoteIndexByKey.set(key, index);
            footnotes.push({ index, url: info.url, title: info.title, label: info.label });
        });

        const sortedByReplacement = references
            .slice()
            .sort((a, b) => {
                const aIdx = Number.isFinite(a.start_idx) ? a.start_idx : -1;
                const bIdx = Number.isFinite(b.start_idx) ? b.start_idx : -1;
                if (aIdx !== -1 || bIdx !== -1) {
                    return bIdx - aIdx;
                }
                return (b.matched_text?.length || 0) - (a.matched_text?.length || 0);
            });

        let output = text;
        sortedByReplacement.forEach(ref => {
            if (!ref?.matched_text || ref.type === 'sources_footnote') return;
            let replacement = '';
            if (ref.type === 'grouped_webpages' || inspectReferenceFile(ref)) {
                const info = getReferenceInfo(ref);
                if (info.url) {
                    const key = `${info.url}|${info.title}`;
                    const index = footnoteIndexByKey.get(key);
                    replacement = index ? `([${markdownLinkLabel(info.label)}][${index}])` : (ref.alt || '');
                } else {
                    replacement = ref.alt || '';
                }
            } else {
                replacement = ref.alt || '';
            }

            if (Number.isFinite(ref.start_idx) && Number.isFinite(ref.end_idx)) {
                if (output.slice(ref.start_idx, ref.end_idx) === ref.matched_text) {
                    output = output.slice(0, ref.start_idx) + replacement + output.slice(ref.end_idx);
                    return;
                }
            }
            output = output.split(ref.matched_text).join(replacement);
        });

        return { text: output, footnotes };
    }

    // 从一个 image_asset 对象中尽可能提取可下载线索
    // 支持旧格式 (image_asset 嵌套对象) 和新格式 (image_asset_pointer 扁平对象)
    function inspectImageAsset(asset) {
        if (!asset || typeof asset !== 'object') return null;
        const pointer = asset.asset_pointer || asset.file_id || asset.id || null;
        if (!pointer) return null;
        let label = asset.disposition_label || asset.alt_text || asset.alt || '';
        if (!label && asset.metadata?.dalle?.prompt) {
            label = asset.metadata.dalle.prompt;
        }
        // 从 metadata 中提取 image_gen_title 作为备选标签
        if (!label && asset.metadata?.generation?.serialization_title) {
            label = asset.metadata.generation.serialization_title;
        }
        return {
            asset_pointer: pointer,
            url: asset.url || asset.download_url || asset.dalle_url || null,
            content_type: asset.content_type || asset.mime_type || null,
            file_id: asset.file_id || null,
            dispositionLabel: (typeof label === 'string' ? label : 'image').slice(0, 200),
        };
    }

    function isImageContentType(value) {
        const text = String(value || '').toLowerCase();
        return text === 'image_asset' ||
            text === 'image_asset_pointer' ||
            text.startsWith('image/') ||
            text.includes('image_asset');
    }

    function imageReferenceKeys(image) {
        if (!image || typeof image !== 'object') return [];
        return [
            image.asset_pointer,
            image.file_id,
            image.url,
            image.download_url,
            normalizeAssetId(image.asset_pointer || image.file_id || image.url || image.download_url || '')
        ].filter(Boolean);
    }

    function addImageIfMissing(images, image, source) {
        if (!image) return;
        const incoming = { ...image, source };
        const keys = imageReferenceKeys(incoming);
        const existingIndex = images.findIndex(existing => {
            const existingKeys = imageReferenceKeys(existing);
            return existingKeys.some(key => keys.includes(key));
        });
        if (existingIndex >= 0) {
            const existing = images[existingIndex];
            const sources = [existing.source, source]
                .flatMap(value => String(value || '').split(','))
                .filter(Boolean)
                .filter((value, index, list) => list.indexOf(value) === index);
            images[existingIndex] = { ...existing };
            [
                'asset_pointer',
                'url',
                'download_url',
                'content_type',
                'file_id',
                'dispositionLabel',
                'localUrl',
                'localPath',
                'filename'
            ].forEach(field => {
                if (!images[existingIndex][field] && incoming[field]) images[existingIndex][field] = incoming[field];
            });
            images[existingIndex].source = sources.join(',');
            return;
        }
        images.push(incoming);
    }

    function inspectFileAttachment(att) {
        if (!att || typeof att !== 'object') return null;
        const nested = att.file && typeof att.file === 'object' ? att.file : {};
        const contentType = att.mime_type || att.content_type || att.type ||
            nested.mime_type || nested.content_type || nested.type || '';
        if (isImageContentType(contentType) || att.image_asset || nested.image_asset) return null;
        const fileId = att.file_id || nested.file_id || att.id || nested.id ||
            att.asset_pointer || nested.asset_pointer || '';
        const url = att.download_url || att.url || nested.download_url || nested.url || '';
        const rawName = att.name || att.file_name || att.filename || att.title || att.display_name ||
            nested.name || nested.file_name || nested.filename || nested.title || '';
        const contentTypeText = String(contentType || '').toLowerCase();
        const hasFileSignal = contentTypeText.includes('file') ||
            contentTypeText.includes('attachment') ||
            (contentTypeText && contentTypeText !== 'text' && contentTypeText !== 'multimodal_text') ||
            Boolean(att.file || nested.file || rawName);
        if (!fileId && !url && !(rawName && hasFileSignal)) return null;
        const fallbackName = normalizeAssetId(fileId || url) || 'attachment';
        const filename = sanitizeFilename(rawName || fallbackName, fallbackName, MAX_SAFE_NAME_LENGTH);
        return {
            key: fileId || url || rawName || filename,
            file_id: fileId,
            url,
            download_url: att.download_url || nested.download_url || '',
            filename,
            label: rawName || filename,
            content_type: contentType,
            size: att.size || nested.size || null
        };
    }

    function addFileIfMissing(files, file, source) {
        if (!file) return;
        const keys = fileReferenceKeys(file);
        const existingIndex = files.findIndex(existing => {
            const existingKeys = fileReferenceKeys(existing);
            return existingKeys.some(key => keys.includes(key));
        });
        if (existingIndex >= 0) {
            files[existingIndex] = mergeFileAttachment(files[existingIndex], file, source);
            return;
        }
        files.push({
            ...file,
            aliases: keys,
            source
        });
    }

    function mergeFileAttachment(existing, incoming, source) {
        const aliases = [...fileReferenceKeys(existing), ...fileReferenceKeys(incoming)]
            .filter(Boolean)
            .filter((value, index, list) => list.indexOf(value) === index);
        const merged = { ...existing, aliases };
        [
            'key',
            'file_id',
            'url',
            'download_url',
            'filename',
            'label',
            'content_type',
            'size',
            'path',
            'file_path',
            'sandbox_path'
        ].forEach(field => {
            if (!merged[field] && incoming[field]) merged[field] = incoming[field];
        });
        merged.source = [existing.source, source].filter(Boolean).filter((value, index, list) => list.indexOf(value) === index).join(',');
        return merged;
    }

    function inspectReferenceFile(ref) {
        if (!ref || typeof ref !== 'object') return null;
        const refType = String(ref.type || ref.content_type || ref.mime_type || '').toLowerCase();
        if (refType === 'grouped_webpages' || refType === 'sources_footnote' || refType.includes('webpage')) return null;
        const nameOnlyFile = (item) => {
            const explicitName = item?.name || item?.file_name || item?.filename || item?.title || item?.display_name || '';
            const pathName = item?.path || item?.file_path || item?.sandbox_path || item?.matched_text || '';
            const rawName = explicitName || String(pathName).split(/[\\/]/).filter(Boolean).pop() || pathName;
            const key = item?.file_id || item?.asset_pointer || item?.url || item?.download_url ||
                item?.path || item?.file_path || item?.sandbox_path || rawName;
            if (!key && !rawName) return null;
            const fallbackName = normalizeAssetId(key) || 'attachment';
            const filename = sanitizeFilename(rawName || fallbackName, fallbackName, MAX_SAFE_NAME_LENGTH);
            return {
                key: key || filename,
                file_id: item?.file_id || item?.asset_pointer || '',
                url: item?.url || '',
                download_url: item?.download_url || '',
                filename,
                label: rawName || filename,
                content_type: item?.mime_type || item?.content_type || item?.type || '',
                size: item?.size || null
            };
        };
        const hasFileSignal = refType.includes('file') ||
            refType.includes('sandbox') ||
            refType.includes('attachment') ||
            Boolean(ref.file_id || ref.asset_pointer || ref.file || ref.file_path || ref.sandbox_path);
        const direct = inspectFileAttachment(ref);
        if (direct && hasFileSignal) return direct;
        const fallback = hasFileSignal ? nameOnlyFile(ref) : null;
        if (fallback) return fallback;
        const items = Array.isArray(ref.items) ? ref.items : [];
        for (const item of items) {
            const itemType = String(item?.type || item?.content_type || item?.mime_type || '').toLowerCase();
            const itemHasFileSignal = itemType.includes('file') ||
                itemType.includes('sandbox') ||
                itemType.includes('attachment') ||
                Boolean(item?.file_id || item?.asset_pointer || item?.file || item?.file_path || item?.sandbox_path);
            const inspected = inspectFileAttachment(item);
            if (inspected && itemHasFileSignal) return inspected;
            const itemFallback = itemHasFileSignal ? nameOnlyFile(item) : null;
            if (itemFallback) return itemFallback;
        }
        return null;
    }

    function extractConversationMessages(convData) {
        const mapping = convData?.mapping;
        if (!mapping) return [];

        const messages = [];
        const mappingKeys = Object.keys(mapping);
        const rootId = mapping['client-created-root']
            ? 'client-created-root'
            : mappingKeys.find(id => !mapping[id]?.parent) || mappingKeys[0];
        const visited = new Set();

        // Collect parts of a single message, capturing both text and image pointers.
        const collectParts = (content) => {
            let textParts = [];
            const images = [];
            const files = [];

            const contentType = content?.content_type;
            const parts = Array.isArray(content?.parts) ? content.parts : [];

            const handleImagePart = (imgAsset, source) => {
                const inspected = inspectImageAsset(imgAsset);
                if (!inspected) return;
                addImageIfMissing(images, inspected, source);
            };
            const handleFilePart = (fileAsset, source) => {
                const inspected = inspectFileAttachment(fileAsset?.file || fileAsset);
                if (!inspected) return;
                addFileIfMissing(files, inspected, source);
                textParts.push(`<!-- file:${encodeURIComponent(inspected.key)} -->`);
            };

            // 判断是否为图片类型的 content_type
            const isImageContentType = (ct) => ct === 'image_asset' || ct === 'image_asset_pointer';
            const isFileContentType = (ct) => {
                const text = String(ct || '').toLowerCase();
                return text.includes('file') || text.includes('attachment');
            };

            if (contentType === 'text') {
                parts.forEach(part => collectTextPart(part, textParts, images, files));
            } else if (isImageContentType(contentType)) {
                // 旧格式: content.image_asset 嵌套; 新格式: content 本身就是 asset
                handleImagePart(content.image_asset || content, 'image_asset');
            } else if (isFileContentType(contentType)) {
                handleFilePart(content.file || content, 'file_asset');
            } else if (contentType === 'multimodal_text') {
                parts.forEach(part => {
                    if (typeof part === 'string') {
                        collectTextPart(part, textParts, images, files);
                    } else if (part && isImageContentType(part.content_type || part.type)) {
                        // 新格式: part 自身就是 image_asset_pointer，无嵌套的 .image_asset
                        handleImagePart(part.image_asset || part, 'multimodal_text');
                    } else if (part && isFileContentType(part.content_type || part.type)) {
                        handleFilePart(part.file || part, 'multimodal_text');
                    } else if (part && typeof part === 'object' && part.text) {
                        collectTextPart(part.text, textParts, images, files);
                    } else {
                        collectTextPart(part, textParts, images, files);
                    }
                });
            } else if (contentType && Array.isArray(parts) && parts.length) {
                // Fallback: any content_type that still carries parts — gather text & be permissive about images.
                parts.forEach(part => collectTextPart(part, textParts, images, files));
            }

            const rawText = textParts.filter(Boolean).join('\n');
            return { rawText, images, files };
        };

        const collectTextPart = (part, textParts, images, files) => {
            if (typeof part === 'string') { textParts.push(part); return; }
            if (part && typeof part === 'object') {
                const inspectedFile = inspectFileAttachment(part.file || part);
                if (inspectedFile) {
                    addFileIfMissing(files, inspectedFile, 'text_part');
                    textParts.push(`<!-- file:${encodeURIComponent(inspectedFile.key)} -->`);
                    return;
                }
                if (typeof part.text === 'string') textParts.push(part.text);
                const isImg = part.content_type === 'image_asset' || part.content_type === 'image_asset_pointer' || part.image_asset;
                if (isImg) {
                    const inspected = inspectImageAsset(part.image_asset || part);
                    if (inspected) {
                        textParts.push(`<!-- image:${inspected.asset_pointer} -->`);
                        if (images) addImageIfMissing(images, inspected, 'text_part');
                    }
                }
            }
        };

        const traverse = (nodeId) => {
            if (!nodeId || visited.has(nodeId)) return;
            visited.add(nodeId);
            const node = mapping[nodeId];
            if (!node) return;

            const msg = node.message;
            if (msg) {
                const author = msg.author?.role;
                const isHidden = msg.metadata?.is_visually_hidden_from_conversation ||
                    msg.metadata?.is_contextual_answers_system_message;
                if (author && author !== 'system' && !isHidden) {
                    const content = msg.content;
                    const { rawText = '', images = [], files: partFiles = [] } = content ? (collectParts(content) || {}) : {};

                    const files = partFiles.slice();

                    // attachments may carry image pointers or downloadable files.
                    if (Array.isArray(msg.metadata?.attachments)) {
                        msg.metadata.attachments.forEach(att => {
                            if (!att) return;
                            if (isImageContentType(att.content_type || att.type || att.mime_type)) {
                                const inspected = inspectImageAsset(att.image_asset || att);
                                if (inspected) addImageIfMissing(images, inspected, 'attachment');
                                return;
                            }
                            const file = inspectFileAttachment(att);
                            addFileIfMissing(files, file, 'attachment');
                        });
                    }

                    const contentReferences = msg.metadata?.content_references || [];
                    if (Array.isArray(contentReferences)) {
                        contentReferences.forEach(ref => {
                            const file = inspectReferenceFile(ref);
                            if (!file) return;
                            addFileIfMissing(files, file, 'content_reference');
                        });
                    }
                    let processedText = rawText;
                    let footnotes = [];
                    if (Array.isArray(contentReferences) && contentReferences.length > 0) {
                        const processed = processContentReferences(rawText, contentReferences);
                        processedText = processed.text;
                        footnotes = processed.footnotes;
                    }
                    const cleaned = cleanMessageContent(processedText);

                    const hasText = cleaned && cleaned.length > 0;
                    const hasImages = images.length > 0;
                    const hasFiles = files.length > 0;
                    if (hasText || hasImages || hasFiles) {
                        messages.push({
                            messageId: msg.id || nodeId,
                            role: author,
                            content: cleaned || '',
                            create_time: msg.create_time || null,
                            footnotes,
                            images,
                            files
                        });
                    }
                }
            }

            if (Array.isArray(node.children)) {
                node.children.forEach(childId => traverse(childId));
            }
        };

        if (rootId) {
            traverse(rootId);
        } else {
            mappingKeys.forEach(traverse);
        }

        return messages;
    }

    function markdownLinkLabel(value) {
        return String(value || 'file').replace(/([\\\[\]])/g, '\\$1');
    }

    function markdownPath(path) {
        return String(path || '')
            .split('/')
            .map(part => encodeURIComponent(part))
            .join('/');
    }

    function localFileRefKey(url) {
        const value = String(url || '');
        if (!value.startsWith(LOCAL_FILE_REF_PREFIX)) return '';
        try {
            return decodeURIComponent(value.slice(LOCAL_FILE_REF_PREFIX.length));
        } catch (_) {
            return value.slice(LOCAL_FILE_REF_PREFIX.length);
        }
    }

    function resolveFootnoteUrl(url, attachmentFiles) {
        const key = localFileRefKey(url);
        if (!key) return url;
        const file = localFileRefCandidates(key).map(candidate => attachmentFiles?.get(candidate)).find(Boolean);
        return file ? markdownPath(`files/${file.filename}`) : '';
    }

    function localFileRefCandidates(key) {
        const candidates = [
            key,
            normalizeAssetId(key),
            sanitizeFilename(key, key, MAX_SAFE_NAME_LENGTH),
            sanitizeFilename(String(key).split(/[\\/]/).filter(Boolean).pop() || key, key, MAX_SAFE_NAME_LENGTH)
        ].filter(Boolean);
        return candidates.filter((candidate, index) => candidates.indexOf(candidate) === index);
    }

    function fileReferenceKeys(file) {
        if (!file || typeof file !== 'object') return [];
        return [
            file.key,
            file.file_id,
            file.url,
            file.download_url,
            file.path,
            file.file_path,
            file.sandbox_path,
            file.filename,
            ...(Array.isArray(file.aliases) ? file.aliases : [])
        ].filter(Boolean);
    }

    function convertConversationToMarkdown(convData) {
        // imageFiles (optional): Map<asset_pointer, {filename, dispositionLabel}> — when passed,
        // image markers inside text are replaced with `![alt](images/filename)` and a
        // "生成图片" block is appended for any image that has no in-text marker.
        const imageFiles = (arguments.length > 1 && arguments[1] instanceof Map) ? arguments[1] : null;
        const attachmentFiles = (arguments.length > 2 && arguments[2] instanceof Map) ? arguments[2] : null;
        const messages = extractConversationMessages(convData);
        if (messages.length === 0) {
            return '# Conversation\nNo visible user or assistant messages were exported.\n';
        }

        const mdLines = [];
        messages.forEach((msg, msgIdx) => {
            const roleLabel = msg.role === 'user' ? '# User' : '# Assistant';
            mdLines.push(roleLabel);

            let body = msg.content || '';

            // Collect which images are referenced inline so we can append the rest at the end.
            const referenced = new Set();
            if (imageFiles && Array.isArray(msg.images) && msg.images.length > 0) {
                msg.images.forEach(img => {
                    const entry = imageFiles.get(img.asset_pointer);
                    if (!entry) return;
                    const placeholder = `<!-- image:${img.asset_pointer} -->`;
                    const mdImg = `\n\n![${entry.dispositionLabel || 'image'}](images/${entry.filename})\n`;
                    if (body.includes(placeholder)) {
                        body = body.split(placeholder).join(mdImg);
                        referenced.add(img.asset_pointer);
                    }
                });
            }

            const referencedFileEntries = new Set();
            if (Array.isArray(msg.files) && msg.files.length > 0) {
                msg.files.forEach(file => {
                    const entry = attachmentFiles
                        ? fileReferenceKeys(file).map(key => attachmentFiles.get(key)).find(Boolean)
                        : null;
                    const replacement = entry
                        ? `\n\n[${markdownLinkLabel(entry.label || entry.filename)}](${markdownPath(`files/${entry.filename}`)})\n\n`
                        : `\n\n${markdownLinkLabel(file.label || file.filename || t('fallback.file'))}\n\n`;
                    fileReferenceKeys(file).forEach(key => {
                        const placeholder = `<!-- file:${encodeURIComponent(key)} -->`;
                        if (body.includes(placeholder)) {
                            body = body.split(placeholder).join(replacement);
                            if (entry) referencedFileEntries.add(entry);
                        }
                    });
                });
            }

            mdLines.push(body);

            // Append any images that weren't referenced inline as a dedicated block.
            if (imageFiles && Array.isArray(msg.images) && msg.images.length > 0) {
                const leftover = msg.images.filter(img => !referenced.has(img.asset_pointer));
                if (leftover.length > 0) {
                    mdLines.push('');
                    mdLines.push(`<!-- 生成图片 (${leftover.length}) -->`);
                    leftover.forEach(img => {
                        const entry = imageFiles.get(img.asset_pointer);
                        if (!entry) return;
                        mdLines.push(`![${entry.dispositionLabel || 'image'}](images/${entry.filename})`);
                    });
                }
            }

            if (attachmentFiles && Array.isArray(msg.files) && msg.files.length > 0) {
                const referencedFiles = new Set((msg.footnotes || [])
                    .map(note => localFileRefKey(note.url))
                    .filter(Boolean)
                    .flatMap(key => localFileRefCandidates(key))
                    .map(key => attachmentFiles.get(key))
                    .filter(Boolean));
                const linkedFiles = msg.files
                    .map(file => fileReferenceKeys(file).map(key => attachmentFiles.get(key)).find(Boolean))
                    .filter(Boolean)
                    .filter(file => !referencedFiles.has(file) && !referencedFileEntries.has(file));
                if (linkedFiles.length > 0) {
                    mdLines.push('');
                    mdLines.push(`<!-- 附件 (${linkedFiles.length}) -->`);
                    linkedFiles.forEach(file => {
                        mdLines.push(`- [${markdownLinkLabel(file.label || file.filename)}](${markdownPath(`files/${file.filename}`)})`);
                    });
                }
            }

            if (Array.isArray(msg.footnotes) && msg.footnotes.length > 0) {
                mdLines.push('');
                msg.footnotes
                    .slice()
                    .sort((a, b) => a.index - b.index)
                    .forEach(note => {
                        const url = resolveFootnoteUrl(note.url, attachmentFiles);
                        if (!url) return;
                        const title = note.title ? ` "${note.title}"` : '';
                        mdLines.push(`[${note.index}]: ${url}${title}`);
                    });
            }
            mdLines.push('');
        });

        return mdLines.join('\n').trim() + '\n';
    }

    function downloadFile(blob, filename) {
        throwIfCancelled();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    }

    // --- 导出流程核心逻辑 ---
    function getExportButton() {
        addBtn();
        return exportUi.status;
    }

    function makeZipScopeRegistry() {
        return new Map();
    }

    async function exportConversations(options = {}) {
        let { mode = 'personal', workspaceId = null, conversationEntries = null, exportType = null } = options;
        const task = beginExportTask();
        if (!task) return;
        const btn = getExportButton();

        try {
            if (!await ensureAccessToken()) { btn.textContent = t('alert.accessTokenUnavailable'); return; }
            throwIfCancelled(task);
            if (mode === 'project' && !Array.isArray(conversationEntries)) {
                btn.textContent = '正在扫描项目会话…';
                conversationEntries = await listProjectSpaceConversations(workspaceId);
                exportType = 'full';
            }
            if (Array.isArray(conversationEntries) && conversationEntries.length === 0) {
                btn.textContent = mode === 'project' ? t('alert.noProjectConversations') : '没有选中的会话。';
                return;
            }
            const zip = new JSZip();
            const zipFilenameRegistry = makeZipScopeRegistry();
            const failedConversations = [];
            if (Array.isArray(conversationEntries) && conversationEntries.length > 0) {
                for (let i = 0; i < conversationEntries.length; i++) {
                    const entry = conversationEntries[i];
                    const label = entry?.title ? entry.title.slice(0, 12) : t('fallback.conversation');
                    btn.textContent = `📥 ${label} (${i + 1}/${conversationEntries.length})`;
                    try {
                        const convData = await getConversation(entry.id, workspaceId);
                        const target = entry?.projectTitle
                            ? zip.folder(sanitizeFilename(entry.projectTitle))
                            : zip;
                        await exportConversationIntoZip(convData, target, accessToken, zipFilenameRegistry);
                    } catch (convErr) {
                        throwIfCancelled(task);
                        console.error(`⚠️ 跳过对话 [${entry.title || entry.id}]: ${convErr.message}`);
                        failedConversations.push({ id: entry.id, title: entry.title || t('fallback.unknown'), error: convErr.message });
                    }
                    await sleep(jitter());
                }
            } else {
                btn.textContent = `📂 ${t('status.fetchingOrphanConversations')}`;
                const orphanIds = await collectIds(btn, workspaceId, null);
                for (let i = 0; i < orphanIds.length; i++) {
                    btn.textContent = `📥 ${t('status.rootProgress', { current: i + 1, total: orphanIds.length })}`;
                    try {
                        const convData = await getConversation(orphanIds[i], workspaceId);
                        await exportConversationIntoZip(convData, zip, accessToken, zipFilenameRegistry);
                    } catch (convErr) {
                        throwIfCancelled(task);
                        console.error(`⚠️ 跳过对话 [${orphanIds[i]}]: ${convErr.message}`);
                        failedConversations.push({ id: orphanIds[i], title: orphanIds[i], error: convErr.message });
                    }
                    await sleep(jitter());
                }

                btn.textContent = `🔍 ${t('status.fetchingProjectList')}`;
                const projects = await getProjects(workspaceId);
                for (const project of projects) {
                    const projectFolder = zip.folder(sanitizeFilename(project.title));
                    btn.textContent = `📂 ${t('status.project', { title: project.title })}`;
                    const projectConvIds = await collectIds(btn, workspaceId, project.id);
                    if (projectConvIds.length === 0) continue;

                    for (let i = 0; i < projectConvIds.length; i++) {
                        btn.textContent = `📥 ${t('status.projectProgress', { title: project.title.substring(0, 10), current: i + 1, total: projectConvIds.length })}`;
                        try {
                            const convData = await getConversation(projectConvIds[i], workspaceId);
                            await exportConversationIntoZip(convData, projectFolder, accessToken, zipFilenameRegistry);
                        } catch (convErr) {
                        throwIfCancelled(task);
                            console.error(`⚠️ 跳过对话 [${projectConvIds[i]}]: ${convErr.message}`);
                            failedConversations.push({ id: projectConvIds[i], title: projectConvIds[i], error: convErr.message });
                        }
                        await sleep(jitter());
                    }
                }
            }

            btn.textContent = `📦 ${t('status.generatingZip')}`;
            const blob = await generateZip(zip, task, percent => {
                btn.textContent = `正在生成 ZIP：${Math.round(percent)}%`;
            });
            throwIfCancelled(task);
            const date = new Date().toISOString().slice(0, 10);
            const selectionType = exportType || ((Array.isArray(conversationEntries) && conversationEntries.length > 0) ? 'selected' : 'full');
            let filename = '';
            if (selectionType === 'selected') {
                filename = mode === 'team'
                    ? `chatgpt_team_selected_${workspaceId}_${date}.zip`
                    : mode === 'project'
                        ? `chatgpt_project_selected_${date}.zip`
                        : `chatgpt_personal_selected_${date}.zip`;
            } else {
                filename = mode === 'team'
                    ? `chatgpt_team_backup_${workspaceId}_${date}.zip`
                    : mode === 'project'
                        ? `chatgpt_project_backup_${date}.zip`
                        : `chatgpt_personal_backup_${date}.zip`;
            }
            downloadFile(blob, filename);
            if (failedConversations.length > 0) {
                const failList = failedConversations.map(f => `• ${f.title}: ${f.error}`).join('\n');
                alert(`⚠️ ${t('alert.exportCompletedWithFailures', { count: failedConversations.length, list: failList })}`);
                console.warn('导出中跳过的对话:', failedConversations);
            } else {
                alert(`✅ ${t('alert.exportSuccess')}`);
            }
            btn.textContent = `✅ ${t('button.done')}`;

        } catch (e) {
            if (task.signal.aborted || e.name === 'ExportCancelledError') {
                btn.textContent = cancellationError().message;
            } else {
                console.error("导出过程中发生严重错误:", e);
                alert(t('alert.exportFailed', { message: e.message }));
                btn.textContent = `⚠️ ${t('button.error')}`;
            }
        } finally {
            finishExportTask(task);
        }
    }

    async function startExportProcess(mode, workspaceId) {
        await exportConversations({ mode, workspaceId });
    }

    async function startProjectSpaceExportProcess(workspaceId = null) {
        await exportConversations({ mode: 'project', workspaceId, exportType: 'full' });
    }

    async function startSelectiveExportProcess(mode, workspaceId, conversationEntries) {
        await exportConversations({ mode, workspaceId, conversationEntries });
    }

    function startScheduledExport(options = {}) {
        const { mode = 'personal', workspaceId = null, autoConfirm = false, source = 'schedule' } = options;
        const proceed = async () => {
            try {
                if (mode === 'project') {
                    await startProjectSpaceExportProcess(workspaceId);
                } else {
                    await startExportProcess(mode, workspaceId);
                }
            } catch (err) {
                console.error('[ChatGPT Exporter] 自动导出失败:', err);
            }
        };

        if (autoConfirm) {
            proceed();
            return;
        }

        const modeLabel = t(`mode.${mode === 'team' ? 'team' : mode === 'project' ? 'project' : 'personal'}`);
        if (confirm(t('confirm.scheduledExport', { mode: modeLabel, source }))) {
            proceed();
        }
    }

    // --- API 调用函数 ---
    function normalizeProjectSpaceItem(item) {
        const rawGizmo = item?.gizmo?.gizmo || item?.gizmo || item;
        const display = rawGizmo?.display || item?.gizmo?.display || item?.display;
        const id = rawGizmo?.id || item?.gizmo?.id || item?.id;
        const title = display?.name || rawGizmo?.name || t('fallback.untitledProject');
        if (!id) return null;
        return {
            id,
            title,
            conversations: item?.conversations?.items || []
        };
    }

    function resolveWorkspaceId(workspaceId) {
        if (workspaceId) return workspaceId;
        const match = document.cookie.match(/(?:^|; )_account=([^;]+)/);
        if (match?.[1]) return match[1];
        const detectedIds = detectAllWorkspaceIds();
        return detectedIds.length > 0 ? detectedIds[0] : null;
    }

    async function getProjectSpaces(workspaceId, options = {}) {
        const deviceId = getOaiDeviceId();
        if (!deviceId) {
            throw new Error(t('error.deviceIdUnavailable'));
        }
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'oai-device-id': deviceId
        };
        const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
        if (resolvedWorkspaceId) { headers['ChatGPT-Account-Id'] = resolvedWorkspaceId; }

        const projects = new Map();
        let cursor = null;

        do {
            const query = new URLSearchParams();
            query.set('limit', String(PROJECT_SIDEBAR_LIMIT));
            if (options.conversationsPerGizmo !== undefined) {
                query.set('conversations_per_gizmo', String(options.conversationsPerGizmo));
            }
            if (options.ownedOnly !== undefined) {
                query.set('owned_only', options.ownedOnly ? 'true' : 'false');
            }
            if (cursor) {
                query.set('cursor', cursor);
            }

            const r = await exportFetch(`/backend-api/gizmos/snorlax/sidebar?${query.toString()}`, { headers });
            if (!r.ok) {
                throw new Error(t('error.projectSpaceListFailed', { status: r.status }));
            }
            const data = await r.json();
            data.items?.forEach(item => {
                const project = normalizeProjectSpaceItem(item);
                if (project) {
                    projects.set(project.id, project);
                }
            });
            cursor = data.cursor || null;
            if (cursor) {
                await sleep(jitter());
            }
        } while (cursor);

        return Array.from(projects.values());
    }

    async function getProjects(workspaceId) {
        if (!workspaceId) return [];
        try {
            const projects = await getProjectSpaces(workspaceId);
            return projects.map(({ id, title }) => ({ id, title }));
        } catch (err) {
            throwIfCancelled();
            console.warn(`获取项目(Gizmo)列表失败 (${err?.message || err})`);
            return [];
        }
    }

    async function collectIds(btn, workspaceId, gizmoId) {
        const all = new Set();
        const deviceId = getOaiDeviceId();
        if (!deviceId) {
            throw new Error(t('error.deviceIdUnavailable'));
        }
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'oai-device-id': deviceId
        };
        if (workspaceId) { headers['ChatGPT-Account-Id'] = workspaceId; }

        if (gizmoId) {
            let cursor = '0';
            do {
                const r = await exportFetch(`/backend-api/gizmos/${gizmoId}/conversations?cursor=${cursor}`, { headers });
                if (!r.ok) throw new Error(t('error.projectConversationListFailed', { status: r.status }));
                const j = await r.json();
                j.items?.forEach(it => all.add(it.id));
                cursor = j.cursor;
                await sleep(jitter());
            } while (cursor);
        } else {
            for (const is_archived of [false, true]) {
                let offset = 0, has_more = true, page = 0;
                do {
                    btn.textContent = `📂 ${t('status.rootPage', {
                        state: is_archived ? t('status.archived') : t('status.active'),
                        page: ++page
                    })}`;
                    const r = await exportFetch(`/backend-api/conversations?offset=${offset}&limit=${PAGE_LIMIT}&order=updated${is_archived ? '&is_archived=true' : ''}`, { headers });
                    if (!r.ok) throw new Error(t('error.rootConversationListFailed', { status: r.status }));
                    const j = await r.json();
                    if (j.items && j.items.length > 0) {
                        j.items.forEach(it => all.add(it.id));
                        has_more = j.items.length === PAGE_LIMIT;
                        offset += j.items.length;
                    } else {
                        has_more = false;
                    }
                    await sleep(jitter());
                } while (has_more);
            }
        }
        return Array.from(all);
    }

    function upsertConversationEntry(map, item, extra = {}) {
        if (!item?.id) return;
        const create_time = normalizeEpochSeconds(item.create_time || 0);
        const update_time = normalizeEpochSeconds(item.update_time || item.create_time || 0);
        const entry = {
            id: item.id,
            title: item.title || t('fallback.untitledConversation'),
            create_time,
            update_time,
            is_archived: item.is_archived ?? extra.is_archived ?? false,
            projectId: extra.projectId || null,
            projectTitle: extra.projectTitle || null
        };
        const existing = map.get(entry.id);
        if (!existing) {
            map.set(entry.id, entry);
            return;
        }
        if (!existing.projectTitle && entry.projectTitle) {
            existing.projectTitle = entry.projectTitle;
            existing.projectId = entry.projectId;
        }
        if (!existing.create_time && entry.create_time) {
            existing.create_time = entry.create_time;
        }
        existing.is_archived = existing.is_archived || entry.is_archived;
        if ((entry.update_time || 0) > (existing.update_time || 0)) {
            existing.update_time = entry.update_time;
        }
        if (existing.title === t('fallback.untitledConversation') && entry.title) {
            existing.title = entry.title;
        }
    }

    async function listConversations(workspaceId) {
        if (!await ensureAccessToken()) {
            throw new Error(t('alert.accessTokenUnavailable'));
        }

        const deviceId = getOaiDeviceId();
        if (!deviceId) {
            throw new Error(t('error.deviceIdUnavailable'));
        }

        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'oai-device-id': deviceId
        };
        if (workspaceId) { headers['ChatGPT-Account-Id'] = workspaceId; }

        const map = new Map();
        const addEntry = (item, extra = {}) => upsertConversationEntry(map, item, extra);

        for (const is_archived of [false, true]) {
            let offset = 0;
            let has_more = true;
            do {
                const r = await exportFetch(`/backend-api/conversations?offset=${offset}&limit=${PAGE_LIMIT}&order=updated${is_archived ? '&is_archived=true' : ''}`, { headers });
                if (!r.ok) throw new Error(t('error.conversationListFailed', { status: r.status }));
                const j = await r.json();
                if (j.items && j.items.length > 0) {
                    j.items.forEach(it => addEntry(it, { is_archived }));
                    has_more = j.items.length === PAGE_LIMIT;
                    offset += j.items.length;
                } else {
                    has_more = false;
                }
                await sleep(jitter());
            } while (has_more);
        }

        if (workspaceId) {
            const projects = await getProjects(workspaceId);
            for (const project of projects) {
                let cursor = '0';
                do {
                    const r = await exportFetch(`/backend-api/gizmos/${project.id}/conversations?cursor=${cursor}`, { headers });
                    if (!r.ok) throw new Error(t('error.projectConversationListFailed', { status: r.status }));
                    const j = await r.json();
                    j.items?.forEach(it => addEntry(it, { projectId: project.id, projectTitle: project.title }));
                    cursor = j.cursor;
                    await sleep(jitter());
                } while (cursor);
            }
        }

        return Array.from(map.values())
            .sort((a, b) => (b.update_time || 0) - (a.update_time || 0));
    }

    async function listProjectSpaceConversations(workspaceId) {
        if (!await ensureAccessToken()) {
            throw new Error(t('alert.accessTokenUnavailable'));
        }

        const deviceId = getOaiDeviceId();
        if (!deviceId) {
            throw new Error(t('error.deviceIdUnavailable'));
        }

        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'oai-device-id': deviceId
        };
        const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
        if (resolvedWorkspaceId) { headers['ChatGPT-Account-Id'] = resolvedWorkspaceId; }

        const map = new Map();
        const projects = await getProjectSpaces(resolvedWorkspaceId, { conversationsPerGizmo: PROJECT_SIDEBAR_PREVIEW, ownedOnly: true });

        for (const project of projects) {
            let cursor = '0';
            let fetched = false;
            do {
                const r = await exportFetch(`/backend-api/gizmos/${project.id}/conversations?cursor=${cursor}`, { headers });
                if (!r.ok) {
                    if (!fetched && Array.isArray(project.conversations) && project.conversations.length > 0) {
                        console.warn(`项目空间对话列表请求失败 (${r.status})，使用侧边栏返回的预览对话。`);
                        project.conversations.forEach(item => upsertConversationEntry(map, item, {
                            projectId: project.id,
                            projectTitle: project.title
                        }));
                        cursor = null;
                        break;
                    }
                    throw new Error(t('error.projectSpaceConversationListFailed', { status: r.status }));
                }
                const j = await r.json();
                j.items?.forEach(item => upsertConversationEntry(map, item, {
                    projectId: project.id,
                    projectTitle: project.title
                }));
                cursor = j.cursor;
                fetched = true;
                await sleep(jitter());
            } while (cursor);
        }

        return Array.from(map.values())
            .sort((a, b) => (b.update_time || 0) - (a.update_time || 0));
    }

    async function getConversation(id, workspaceId, retries = 3) {
        const deviceId = getOaiDeviceId();
        if (!deviceId) {
            throw new Error(t('error.deviceIdUnavailable'));
        }
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'oai-device-id': deviceId
        };
        const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
        if (resolvedWorkspaceId) { headers['ChatGPT-Account-Id'] = resolvedWorkspaceId; }

        let lastError = null;
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const r = await exportFetch(`/backend-api/conversation/${id}`, { headers });
                if (r.ok) {
                    const j = await r.json();
                    j.__fetched_at = new Date().toISOString();
                    return j;
                }
                lastError = new Error(t('error.conversationDetailFailed', { id, status: r.status }));
                // 仅对 5xx 服务端错误重试
                if (r.status >= 500 && attempt < retries) {
                    const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
                    console.warn(`⚠️ 第 ${attempt} 次获取对话 ${id} 失败 (${r.status})，${Math.round(backoff / 1000)}s 后重试...`);
                    await sleep(backoff);
                    continue;
                }
                throw lastError;
            } catch (err) {
            throwIfCancelled();
                lastError = err;
                if (attempt < retries && !(err.message && err.message.includes('(4'))) {
                    const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
                    console.warn(`⚠️ 第 ${attempt} 次获取对话 ${id} 异常: ${err.message}，${Math.round(backoff / 1000)}s 后重试...`);
                    await sleep(backoff);
                    continue;
                }
                throw err;
            }
        }
        throw lastError;
    }

    // --- 图片导出辅助函数 ---
    function normalizeAssetId(raw) {
        if (!raw) return '';
        if (typeof raw !== 'string') return '';
        const trimmed = raw.trim();
        // 处理 sediment://file_xxx 格式 (新格式)
        if (trimmed.startsWith('sediment://')) {
            const path = trimmed.replace('sediment://', '');
            // sediment://file_0000000066dc72099fe3a16ea00b7e51 → file_0000000066dc72099fe3a16ea00b7e51
            return path || trimmed.replace(/[^\w.-]/g, '_');
        }
        if (trimmed.startsWith('file://') || trimmed.startsWith('file-') || trimmed.startsWith('file_')) {
            const m = trimmed.match(/[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}/i);
            if (m) return m[0];
            // 也尝试匹配 file_xxxx 格式 (无连字符)
            const m2 = trimmed.match(/file[_-]([a-f0-9]+)/i);
            if (m2) return `file_${m2[1]}`;
        }
        if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
            const u = new URL(trimmed);
            const path = u.pathname.split('/').filter(Boolean);
            const last = path[path.length - 1];
            if (last) return last.replace(/\.[a-z0-9]+$/i, '');
        }
        if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(trimmed)) {
            return trimmed.toLowerCase();
        }
        return trimmed.replace(/[^\w.-]/g, '_');
    }

    function guessImageExt(contentType, url) {
        if (typeof contentType === 'string') {
            const ct = contentType.toLowerCase();
            if (ct.includes('png')) return 'png';
            if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
            if (ct.includes('webp')) return 'webp';
            if (ct.includes('gif')) return 'gif';
            if (ct.includes('svg')) return 'svg';
            if (ct.includes('bmp')) return 'bmp';
        }
        if (typeof url === 'string') {
            const m = url.toLowerCase().match(/\.(png|jpe?g|webp|gif|svg|bmp)(?:\?|$)/);
            if (m) return m[1] === 'jpg' ? 'jpg' : m[1];
        }
        return 'png';
    }

    function guessFileExt(contentType, url, filename) {
        const byName = String(filename || url || '').toLowerCase().match(/\.([a-z0-9]{1,12})(?:\?|$)/);
        if (byName) return byName[1];
        const ct = String(contentType || '').toLowerCase();
        if (ct.includes('pdf')) return 'pdf';
        if (ct.includes('csv')) return 'csv';
        if (ct.includes('json')) return 'json';
        if (ct.includes('markdown')) return 'md';
        if (ct.includes('plain')) return 'txt';
        if (ct.includes('spreadsheet')) return 'xlsx';
        if (ct.includes('presentation')) return 'pptx';
        if (ct.includes('wordprocessing')) return 'docx';
        if (ct.includes('zip')) return 'zip';
        return '';
    }

    async function resolveFileDownloadUrl(fileId, accessToken) {
        const deviceId = getOaiDeviceId();
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
        };
        if (deviceId) headers['oai-device-id'] = deviceId;
        const resolvedWs = resolveWorkspaceId(null);
        if (resolvedWs) headers['ChatGPT-Account-Id'] = resolvedWs;

        const r = await exportFetch(`/backend-api/files/${fileId}/download`, { headers });
        if (!r.ok) throw new Error(t('error.fileDownloadUrlFailed', { status: r.status }));
        const data = await r.json();
        return data.download_url || null;
    }

    async function resolveImageDownloadUrl(fileId, accessToken) {
        return resolveFileDownloadUrl(fileId, accessToken);
    }

    async function fetchImageBlob(image, accessToken) {
        let url = image.url || image.download_url;

        // 如果没有直接 URL，尝试通过 asset_pointer 从后端 API 解析真实下载链接
        if (!url && image.asset_pointer) {
            const fileId = normalizeAssetId(image.asset_pointer);
            if (fileId) {
                try {
                    url = await resolveImageDownloadUrl(fileId, accessToken);
                    console.log(`🖼️ 已解析图片下载链接 [${fileId}]`);
                } catch (err) {
            throwIfCancelled();
                    console.warn(`⚠️ 无法解析图片下载链接 [${fileId}]:`, err.message);
                    return null;
                }
            }
        }

        if (!url) return null;

        const opts = { credentials: 'include' };
        // 对 ChatGPT 同源请求添加 Authorization，对签名 CDN URL 则不需要
        if (accessToken && url.startsWith('/')) {
            opts.headers = { 'Authorization': `Bearer ${accessToken}` };
        }
        const r = await exportFetch(url, opts);
        if (!r.ok) throw new Error(t('error.imageDownloadFailed', { status: r.status }));
        return await r.blob();
    }

    async function fetchAttachmentBlob(file, accessToken) {
        let url = file.url || file.download_url;
        if (!url && file.file_id) {
            const fileId = normalizeAssetId(file.file_id);
            if (fileId) {
                url = await resolveFileDownloadUrl(fileId, accessToken);
                console.log(`📎 已解析文件下载链接 [${fileId}]`);
            }
        }
        if (!url) return null;

        const opts = { credentials: 'include' };
        if (accessToken && url.startsWith('/')) {
            opts.headers = { 'Authorization': `Bearer ${accessToken}` };
        }
        const r = await exportFetch(url, opts);
        if (!r.ok) throw new Error(t('error.fileDownloadFailed', { status: r.status }));
        return await r.blob();
    }

    async function downloadConversationAssets(convData, targetZip, generateMarkdown, accessToken, zipFilenameRegistry) {
        const messages = extractConversationMessages(convData);
        const seen = new Set();
        const pending = [];
        const seenFiles = new Set();
        const pendingFiles = [];
        const imageFiles = new Map(); // asset_pointer -> { filename, dispositionLabel }
        const attachmentFiles = new Map(); // attachment key -> { filename, label }

        for (const msg of messages) {
            if (Array.isArray(msg.images)) {
                for (let k = 0; k < msg.images.length; k++) {
                    const img = msg.images[k];
                    const key = img.asset_pointer || img.url || (img.asset_pointer + '_' + k);
                    if (seen.has(key)) continue;
                    seen.add(key);
                    pending.push({ image: img, msgIndex: pending.length, assetId: normalizeAssetId(img.asset_pointer) });
                }
            }
            if (Array.isArray(msg.files)) {
                for (let k = 0; k < msg.files.length; k++) {
                    const file = msg.files[k];
                    const key = file.key || file.file_id || file.url || `${file.filename}_${k}`;
                    if (seenFiles.has(key)) continue;
                    seenFiles.add(key);
                    pendingFiles.push({ file, key, assetId: normalizeAssetId(file.file_id || file.url || key) });
                }
            }
        }

        if (pending.length === 0 && pendingFiles.length === 0) {
            return generateMarkdown ? convertConversationToMarkdown(convData) : null;
        }
        let okCount = 0;
        if (pending.length > 0) {
            const ns = targetZip.folder('images');
            const imageScope = `${targetZip.root || ''}${targetZip.name || ''}images/`;
            for (let i = 0; i < pending.length; i++) {
                const { image, assetId } = pending[i];
                try {
                    const blob = await fetchImageBlob(image, accessToken);
                    const ext = guessImageExt(image.content_type, image.url);
                    const safeAssetId = sanitizeImageFilenamePart(assetId, `image_${i + 1}`);
                    const filename = makeUniqueZipFilename(
                        `img_${String(i + 1).padStart(2, '0')}_${safeAssetId}.${ext}`,
                        zipFilenameRegistry,
                        imageScope
                    );
                    ns.file(filename, blob);
                    imageFiles.set(image.asset_pointer, {
                        filename,
                        dispositionLabel: image.dispositionLabel || 'image'
                    });
                    okCount++;
                } catch (err) {
            throwIfCancelled();
                    console.warn(`⚠️ 图片下载跳过 [${assetId}]:`, err.message, image);
                }
                await sleep(jitter());
            }
            console.log(`🖼️ 图片导出: ${okCount}/${pending.length} 张成功`);
        }

        let okFileCount = 0;
        if (pendingFiles.length > 0) {
            const ns = targetZip.folder('files');
            const fileScope = `${targetZip.root || ''}${targetZip.name || ''}files/`;
            for (let i = 0; i < pendingFiles.length; i++) {
                const { file, key, assetId } = pendingFiles[i];
                try {
                    const blob = await fetchAttachmentBlob(file, accessToken);
                    if (!blob) throw new Error(t('error.noDownloadUrl'));
                    let safeName = sanitizeFilename(file.filename || file.label || assetId, `file_${i + 1}`, MAX_SAFE_NAME_LENGTH);
                    if (!splitFilename(safeName).ext) {
                        const ext = guessFileExt(file.content_type, file.url, file.filename);
                        if (ext) safeName += `.${ext}`;
                    }
                    const filename = makeUniqueZipFilename(safeName, zipFilenameRegistry, fileScope);
                    ns.file(filename, blob);
                    const entry = {
                        filename,
                        label: file.label || file.filename || filename
                    };
                    fileReferenceKeys({ ...file, key }).forEach(alias => attachmentFiles.set(alias, entry));
                    okFileCount++;
                } catch (err) {
            throwIfCancelled();
                    console.warn(`⚠️ 文件下载跳过 [${assetId}]:`, err.message, file);
                }
                await sleep(jitter());
            }
            console.log(`📎 文件导出: ${okFileCount}/${pendingFiles.length} 个成功`);
        }

        return generateMarkdown ? convertConversationToMarkdown(convData, imageFiles, attachmentFiles) : null;
    }

    /**
     * 将单个对话导出到 ZIP（同时写入 JSON 原始数据、Markdown（含图片引用）、以及图片文件）。
     * @returns {Promise<void>}
     */
    async function exportConversationIntoZip(convData, zip, accessToken, zipFilenameRegistry) {
        const scope = `${zip.root || ''}${zip.name || ''}`;
        const jsonFilename = makeUniqueZipFilename(generateUniqueFilename(convData), zipFilenameRegistry, scope);
        zip.file(jsonFilename, JSON.stringify(convData, null, 2));
        const markdown = await downloadConversationAssets(convData, zip, true, accessToken, zipFilenameRegistry);
        const markdownFilename = makeUniqueZipFilename(
            jsonFilename.endsWith('.json') ? `${jsonFilename.slice(0, -5)}.md` : generateMarkdownFilename(convData),
            zipFilenameRegistry,
            scope
        );
        zip.file(markdownFilename, markdown);
    }

    // --- UI 相关函数 ---
    // (UI部分无变动，此处省略以保持简洁)
    /**
     * [新增] 全面检测函数，返回所有找到的ID
     * @returns {string[]} - 返回包含所有唯一Workspace ID的数组
     */
    function detectAllWorkspaceIds() {
        const foundIds = new Set(capturedWorkspaceIds); // 从网络拦截的结果开始

        // 扫描 __NEXT_DATA__
        try {
            const data = JSON.parse(document.getElementById('__NEXT_DATA__').textContent);
            // 遍历所有账户信息
            const accounts = data?.props?.pageProps?.user?.accounts;
            if (accounts) {
                Object.values(accounts).forEach(acc => {
                    if (acc?.account?.id) {
                        foundIds.add(acc.account.id);
                    }
                });
            }
        } catch (e) {}

        // 扫描 localStorage
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.includes('account') || key.includes('workspace'))) {
                    const value = localStorage.getItem(key);
                    if (value && /^[a-z0-9]{2,}-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.replace(/"/g, ''))) {
                         const extractedId = value.match(/ws-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
                         if(extractedId) foundIds.add(extractedId[0]);
                    } else if (value && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.replace(/"/g, ''))) {
                         foundIds.add(value.replace(/"/g, ''));
                    }
                }
            }
        } catch(e) {}

        console.log('🔍 检测到以下 Workspace IDs:', Array.from(foundIds));
        return Array.from(foundIds);
    }

    function showConversationPicker(options = {}) {
        if (activeTask) { showExportNotice('已有任务正在运行，请先停止或等待完成。'); return; }
        const scanTask = beginExportTask();
        if (!scanTask) return;
        exportUi.status.textContent = '正在扫描会话列表…';
        const { mode = 'personal', workspaceId = null } = options;
        const existing = document.getElementById('export-dialog-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'export-dialog-overlay';
        Object.assign(overlay.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: '99998',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        });

        const dialog = document.createElement('div');
        dialog.id = 'export-dialog';
        Object.assign(dialog.style, {
            background: '#fff', padding: '24px', borderRadius: '12px',
            boxShadow: '0 5px 15px rgba(0,0,0,.3)', width: '720px', colorScheme: 'light',
            fontFamily: 'sans-serif', color: '#333', boxSizing: 'border-box'
        });

        const closeDialog = () => {
            if (activeTask === scanTask) scanTask.abort();
            overlay.remove();
        };
        overlay.addEventListener('exporter-close', closeDialog);
        const state = {
            list: [],
            filtered: [],
            selected: new Set(),
            query: '',
            scope: mode === 'project' ? 'project' : 'all',
            scopeLocked: mode === 'project',
            archived: 'all',
            timeField: 'update',
            loading: true,
            pageSize: 100,
            visibleCount: 100,
            startDate: '',
            endDate: ''
        };

        const renderBase = () => {
            const modeLabel = t(`mode.${mode === 'team' ? 'team' : mode === 'project' ? 'project' : 'personal'}`);
            const workspaceLabel = workspaceId ? ` (${workspaceId})` : '';
            dialog.innerHTML = `
                <h2 style="margin-top:0; margin-bottom: 12px; font-size: 18px;">${t('dialog.selectConversationsTitle')}</h2>
                <div style="margin-bottom: 12px; color: #666; font-size: 12px;">${t('dialog.space', { mode: modeLabel, workspace: workspaceLabel })}</div>
                <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                    <input id="conv-search" type="text" placeholder="${t('dialog.searchPlaceholder')}"
                        style="flex: 1; padding: 8px; border-radius: 6px; border: 1px solid #ccc; box-sizing: border-box;">
                    <select id="filter-scope" style="padding: 8px 28px 8px 8px; border-radius: 6px; border: 1px solid #ccc;">
                        <option value="all">${t('filter.scopeAll')}</option>
                        <option value="project">${t('filter.scopeProject')}</option>
                        <option value="root">${t('filter.scopeRoot')}</option>
                    </select>
                    <select id="filter-archived" style="padding: 8px 28px 8px 8px; border-radius: 6px; border: 1px solid #ccc;">
                        <option value="all">${t('filter.statusAll')}</option>
                        <option value="active">${t('filter.statusActive')}</option>
                        <option value="archived">${t('filter.statusArchived')}</option>
                    </select>
                </div>
                <div style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center;">
                    <select id="filter-time-field" style="padding: 8px 28px 8px 8px; border-radius: 6px; border: 1px solid #ccc;">
                        <option value="update">${t('filter.timeUpdate')}</option>
                        <option value="create">${t('filter.timeCreate')}</option>
                    </select>
                    <input id="filter-start-date" type="date" style="padding: 8px; border-radius: 6px; border: 1px solid #ccc;">
                    <span style="color: #666; font-size: 12px;">${t('filter.dateTo')}</span>
                    <input id="filter-end-date" type="date" style="padding: 8px; border-radius: 6px; border: 1px solid #ccc;">
                    <button id="clear-date-btn" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer;">${t('button.clearDates')}</button>
                </div>
                <div id="conv-status" style="margin-bottom: 8px; font-size: 12px; color: #666;">${t('status.loadingList')}</div>
                <div id="conv-list" style="max-height: 360px; overflow: auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; background: #fff;"></div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px;">
                    <div style="display: flex; gap: 8px;">
                        <button id="select-all-btn" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer;">${t('button.selectAll')}</button>
                        <button id="clear-all-btn" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer;">${t('button.clear')}</button>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button id="back-btn" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer;">${t('button.back')}</button>
                        <button id="export-selected-btn" style="padding: 8px 12px; border: none; border-radius: 6px; background: #10a37f; color: #fff; cursor: pointer; font-weight: bold;" disabled>${t('button.exportSelected', { count: 0 })}</button>
                    </div>
                </div>
            `;

            const searchInput = dialog.querySelector('#conv-search');
            const scopeSelect = dialog.querySelector('#filter-scope');
            const archivedSelect = dialog.querySelector('#filter-archived');
            const timeFieldSelect = dialog.querySelector('#filter-time-field');
            const startDateInput = dialog.querySelector('#filter-start-date');
            const endDateInput = dialog.querySelector('#filter-end-date');
            const clearDateBtn = dialog.querySelector('#clear-date-btn');
            const selectAllBtn = dialog.querySelector('#select-all-btn');
            const clearAllBtn = dialog.querySelector('#clear-all-btn');
            const backBtn = dialog.querySelector('#back-btn');
            const exportBtn = dialog.querySelector('#export-selected-btn');

            if (state.scopeLocked && scopeSelect) {
                scopeSelect.value = 'project';
                scopeSelect.disabled = true;
                scopeSelect.style.opacity = '0.7';
                scopeSelect.style.cursor = 'not-allowed';
                scopeSelect.title = t('dialog.projectScopeLocked');
            }

            searchInput.oninput = (e) => {
                state.query = e.target.value || '';
                applyFilters();
                renderList();
            };
            scopeSelect.onchange = (e) => {
                state.scope = e.target.value;
                applyFilters();
                renderList();
            };
            archivedSelect.onchange = (e) => {
                state.archived = e.target.value;
                applyFilters();
                renderList();
            };
            timeFieldSelect.onchange = (e) => {
                state.timeField = e.target.value;
                applyFilters();
                renderList();
            };
            startDateInput.onchange = (e) => {
                state.startDate = e.target.value || '';
                applyFilters();
                renderList();
            };
            endDateInput.onchange = (e) => {
                state.endDate = e.target.value || '';
                applyFilters();
                renderList();
            };
            clearDateBtn.onclick = () => {
                state.startDate = '';
                state.endDate = '';
                startDateInput.value = '';
                endDateInput.value = '';
                applyFilters();
                renderList();
            };
            selectAllBtn.onclick = () => {
                state.filtered.forEach(item => state.selected.add(item.id));
                renderList();
            };
            clearAllBtn.onclick = () => {
                state.selected.clear();
                renderList();
            };
            backBtn.onclick = () => {
                closeDialog();
                showExportDialog();
            };
            exportBtn.onclick = async () => {
                if (state.selected.size === 0) return;
                const selectedList = state.list.filter(item => state.selected.has(item.id));
                closeDialog();
                await startSelectiveExportProcess(mode, workspaceId, selectedList);
            };
        };

        const applyFilters = () => {
            const query = state.query.trim().toLowerCase();
            const startBound = parseDateInputToEpoch(state.startDate, false);
            const endBound = parseDateInputToEpoch(state.endDate, true);
            state.filtered = state.list.filter(item => {
                const text = `${item.title || ''} ${item.projectTitle || ''} ${item.id || ''}`.toLowerCase();
                if (query && !text.includes(query)) return false;
                if (state.scope === 'project' && !item.projectTitle) return false;
                if (state.scope === 'root' && item.projectTitle) return false;
                if (state.archived === 'active' && item.is_archived) return false;
                if (state.archived === 'archived' && !item.is_archived) return false;
                if (startBound || endBound) {
                    const sourceTime = state.timeField === 'create'
                        ? item.create_time
                        : item.update_time;
                    const ts = normalizeEpochSeconds(sourceTime || 0);
                    if (!ts) return false;
                    if (startBound && ts < startBound) return false;
                    if (endBound && ts > endBound) return false;
                }
                return true;
            });
            state.visibleCount = state.pageSize;
        };

        const updateSelectionSummary = () => {
            const statusEl = dialog.querySelector('#conv-status');
            const exportBtn = dialog.querySelector('#export-selected-btn');
            const visibleCount = Math.min(state.visibleCount, state.filtered.length);
            statusEl.textContent = t('status.listSummary', {
                total: state.list.length,
                filtered: state.filtered.length,
                visible: visibleCount,
                selected: state.selected.size
            });
            exportBtn.textContent = t('button.exportSelected', { count: state.selected.size });
            exportBtn.disabled = state.loading || state.selected.size === 0;
        };

        const renderList = () => {
            const statusEl = dialog.querySelector('#conv-status');
            const listEl = dialog.querySelector('#conv-list');
            const exportBtn = dialog.querySelector('#export-selected-btn');
            const selectAllBtn = dialog.querySelector('#select-all-btn');
            const clearAllBtn = dialog.querySelector('#clear-all-btn');
            const controlsDisabled = state.loading;

            if (selectAllBtn) selectAllBtn.disabled = controlsDisabled;
            if (clearAllBtn) clearAllBtn.disabled = controlsDisabled;
            const backBtn = dialog.querySelector('#back-btn');
            if (backBtn) backBtn.textContent = state.loading ? '停止加载' : t('button.back');
            if (exportBtn) exportBtn.disabled = controlsDisabled || state.selected.size === 0;

            listEl.innerHTML = '';
            if (state.loading) {
                statusEl.textContent = t('status.loadingList');
                return;
            }

            updateSelectionSummary();

            if (state.filtered.length === 0) {
                const empty = document.createElement('div');
                empty.textContent = t('status.noMatches');
                empty.style.color = '#999';
                empty.style.padding = '8px 4px';
                listEl.appendChild(empty);
                return;
            }

            const visibleItems = state.filtered.slice(0, state.visibleCount);
            visibleItems.forEach(item => {
                const label = document.createElement('label');
                Object.assign(label.style, {
                    display: 'flex', gap: '8px', padding: '8px',
                    border: '1px solid #e5e7eb', borderRadius: '6px',
                    marginBottom: '8px', cursor: 'pointer', alignItems: 'flex-start',
                    color: '#1f2937'
                });

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = state.selected.has(item.id);
                Object.assign(checkbox.style, {
                    accentColor: '#047857', width: '16px', height: '16px',
                    flexShrink: '0', marginTop: '3px'
                });
                const updateSelectionStyle = () => {
                    const selected = state.selected.has(item.id);
                    label.style.backgroundColor = selected ? '#d1fae5' : '#fff';
                    label.style.borderColor = selected ? '#059669' : '#e5e7eb';
                    label.style.boxShadow = selected ? 'inset 3px 0 0 #059669' : 'none';
                };
                updateSelectionStyle();
                checkbox.onchange = (e) => {
                    if (e.target.checked) {
                        state.selected.add(item.id);
                    } else {
                        state.selected.delete(item.id);
                    }
                    updateSelectionStyle();
                    updateSelectionSummary();
                };

                const content = document.createElement('div');
                content.style.flex = '1';

                const title = document.createElement('div');
                title.textContent = item.title || t('fallback.untitledConversation');
                title.style.fontWeight = 'bold';
                title.style.fontSize = '14px';

                const meta = document.createElement('div');
                meta.style.fontSize = '12px';
                meta.style.color = '#666';
                const timeLabelPrefix = state.timeField === 'create' ? t('picker.timeCreated') : t('picker.timeUpdated');
                const timeValue = state.timeField === 'create' ? item.create_time : item.update_time;
                const timeLabel = formatTimestamp(timeValue) || t('picker.unknownTime');
                meta.textContent = `${timeLabelPrefix}: ${timeLabel}`;

                const tags = document.createElement('div');
                tags.style.marginTop = '6px';
                tags.style.display = 'flex';
                tags.style.gap = '6px';
                tags.style.flexWrap = 'wrap';

                if (item.projectTitle) {
                    const projectTag = document.createElement('span');
                    projectTag.textContent = t('picker.projectTag', { title: item.projectTitle });
                    Object.assign(projectTag.style, {
                        background: '#eef2ff', color: '#4338ca',
                        padding: '2px 6px', borderRadius: '999px', fontSize: '11px'
                    });
                    tags.appendChild(projectTag);
                }

                if (item.is_archived) {
                    const archivedTag = document.createElement('span');
                    archivedTag.textContent = t('picker.archivedTag');
                    Object.assign(archivedTag.style, {
                        background: '#fef3c7', color: '#92400e',
                        padding: '2px 6px', borderRadius: '999px', fontSize: '11px'
                    });
                    tags.appendChild(archivedTag);
                }

                content.appendChild(title);
                content.appendChild(meta);
                if (tags.childNodes.length > 0) content.appendChild(tags);

                label.appendChild(checkbox);
                label.appendChild(content);
                listEl.appendChild(label);
            });

            if (state.filtered.length > state.visibleCount) {
                const loadMore = document.createElement('button');
                loadMore.textContent = t('button.loadMore', { count: state.filtered.length - state.visibleCount });
                Object.assign(loadMore.style, {
                    width: '100%', padding: '8px 12px', border: '1px solid #ccc',
                    borderRadius: '6px', background: '#fff', cursor: 'pointer'
                });
                loadMore.onclick = () => {
                    state.visibleCount = Math.min(state.visibleCount + state.pageSize, state.filtered.length);
                    renderList();
                };
                listEl.appendChild(loadMore);
            }
        };

        renderBase();
        styleExportDialog(overlay, dialog);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        overlay.onclick = (e) => { if (e.target === overlay) closeDialog(); };

        const listPromise = mode === 'project'
            ? listProjectSpaceConversations(workspaceId)
            : listConversations(workspaceId);
        listPromise
            .then(list => {
                throwIfCancelled(scanTask);
                if (!overlay.isConnected) return;
                state.list = list;
                state.loading = false;
                applyFilters();
                renderList();
            })
            .catch(err => {
                if (scanTask.signal.aborted || err.name === 'ExportCancelledError') {
                    overlay.remove();
                    exportUi.status.textContent = cancellationError().message;
                    return;
                }
                if (!overlay.isConnected) return;
                state.loading = false;
                state.list = [];
                state.filtered = [];
                renderList();
                dialog.querySelector('#conv-status').textContent = t('status.loadFailed', { message: err.message });
                exportUi.status.textContent = t('status.loadFailed', { message: err.message });
            })
            .finally(() => {
                finishExportTask(scanTask);
                if (!scanTask.signal.aborted && state.list.length) exportUi.status.hidden = true;
            });
    }

    /**
     * [重构] 多步骤、用户主导的导出对话框
     */
    function showExportDialog() {
        if (activeTask && !activeTask.signal.aborted) { showExportNotice('已有任务正在运行，请先停止或等待完成。'); return; }
        if (document.getElementById('export-dialog-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'export-dialog-overlay';
        Object.assign(overlay.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: '99998',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        });

        const dialog = document.createElement('div');
        dialog.id = 'export-dialog';
        Object.assign(dialog.style, {
            background: '#fff', padding: '24px', borderRadius: '12px',
            boxShadow: '0 5px 15px rgba(0,0,0,.3)', width: '450px',
            fontFamily: 'sans-serif', color: '#333', boxSizing: 'border-box'
        });

        const closeDialog = () => document.body.removeChild(overlay);

        let pendingTeamAction = null;
        const renderStep = (step, action = null) => {
            pendingTeamAction = action;
            let html = '';
            switch (step) {
                case 'team': {
                    const detectedIds = detectAllWorkspaceIds();
                    html = `<h2 style="margin-top:0; margin-bottom: 20px; font-size: 18px;">${t('dialog.exportTeamTitle')}</h2>`;

                    if (detectedIds.length > 1) {
                        html += `<div style="background: #eef2ff; border: 1px solid #818cf8; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
                                     <p style="margin: 0 0 12px 0; font-weight: bold; color: #4338ca;">🔎 ${t('dialog.multipleWorkspace')}</p>
                                     <div id="workspace-id-list">`;
                        detectedIds.forEach((id, index) => {
                            html += `<label style="display: block; margin-bottom: 8px; padding: 8px; border-radius: 6px; cursor: pointer; border: 1px solid #ddd; background: #fff;">
                                         <input type="radio" name="workspace_id" value="${id}" ${index === 0 ? 'checked' : ''}>
                                         <code style="margin-left: 8px; font-family: monospace; color: #555;">${id}</code>
                                      </label>`;
                        });
                        html += `</div></div>`;
                    } else if (detectedIds.length === 1) {
                        html += `<div style="background: #f0fdf4; border: 1px solid #4ade80; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
                                     <p style="margin: 0 0 8px 0; font-weight: bold; color: #166534;">✅ ${t('dialog.workspaceDetected')}</p>
                                     <code id="workspace-id-code" style="background: #e0e7ff; padding: 4px 8px; border-radius: 4px; font-family: monospace; color: #4338ca; word-break: break-all;">${detectedIds[0]}</code>
                                   </div>`;
                    } else {
                        html += `<div style="background: #fffbeb; border: 1px solid #facc15; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
                                     <p style="margin: 0; color: #92400e;">⚠️ ${t('dialog.workspaceMissing')}</p>
                                     <p style="margin: 8px 0 0 0; font-size: 12px; color: #92400e;">${t('dialog.workspaceMissingHint')}</p>
                                   </div>
                                   <label for="team-id-input" style="display: block; margin-bottom: 8px; font-weight: bold;">${t('dialog.manualWorkspaceLabel')}</label>
                                   <input type="text" id="team-id-input" placeholder="${t('dialog.workspacePlaceholder')}" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #ccc; box-sizing: border-box;">`;
                    }

                    let actionButtons = '';
                    if (pendingTeamAction === 'all') {
                        actionButtons = `<button id="start-team-export-btn" style="padding: 10px 16px; border: none; border-radius: 8px; background: #10a37f; color: #fff; cursor: pointer; font-weight: bold;">${t('button.exportAllZip')}</button>`;
                    } else if (pendingTeamAction === 'select') {
                        actionButtons = `<button id="start-team-picker-btn" style="padding: 10px 16px; border: 1px solid #ccc; border-radius: 8px; background: #fff; cursor: pointer;">${t('button.selectConversationsExport')}</button>`;
                    } else {
                        actionButtons = `<button id="start-team-export-btn" style="padding: 10px 16px; border: none; border-radius: 8px; background: #10a37f; color: #fff; cursor: pointer; font-weight: bold;">${t('button.exportAllZip')}</button>
                                     <button id="start-team-picker-btn" style="padding: 10px 16px; border: 1px solid #ccc; border-radius: 8px; background: #fff; cursor: pointer;">${t('button.selectConversationsExport')}</button>`;
                    }

                    html += `<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 24px;">
                                 <button id="back-btn" style="padding: 10px 16px; border: 1px solid #ccc; border-radius: 8px; background: #fff; cursor: pointer;">${t('button.back')}</button>
                                 <div style="display: flex; gap: 8px;">
                                     ${actionButtons}
                                 </div>
                               </div>`;
                    break;
                }

                case 'initial':
                default:
                    html = `<h2 style="margin-top:0; margin-bottom: 20px; font-size: 18px;">${t('dialog.selectSpaceTitle')}</h2>
                                <div style="display: flex; flex-direction: column; gap: 16px;">
                                    <div style="padding: 16px; border: 1px solid #ccc; border-radius: 8px; background: #f9fafb;">
                                        <strong style="font-size: 16px;">${t('dialog.personalTitle')}</strong>
                                        <p style="margin: 4px 0 12px 0; color: #666;">${t('dialog.personalCopy')}</p>
                                        <div style="display: flex; gap: 8px;">
                                            <button id="select-personal-btn" style="padding: 8px 12px; border: none; border-radius: 6px; background: #10a37f; color: #fff; cursor: pointer; font-weight: bold;">${t('button.exportAll')}</button>
                                            <button id="select-personal-picker-btn" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer;">${t('button.selectConversationsExport')}</button>
                                        </div>
                                    </div>
                                    <div style="padding: 16px; border: 1px solid #ccc; border-radius: 8px; background: #f9fafb;">
                                        <strong style="font-size: 16px;">${t('dialog.projectTitle')}</strong>
                                        <p style="margin: 4px 0 12px 0; color: #666;">${t('dialog.projectCopy')}</p>
                                        <div style="display: flex; gap: 8px;">
                                            <button id="select-project-btn" style="padding: 8px 12px; border: none; border-radius: 6px; background: #10a37f; color: #fff; cursor: pointer; font-weight: bold;">${t('button.exportAll')}</button>
                                            <button id="select-project-picker-btn" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer;">${t('button.selectConversationsExport')}</button>
                                        </div>
                                    </div>
                                    <div style="padding: 16px; border: 1px solid #ccc; border-radius: 8px; background: #f9fafb;">
                                        <strong style="font-size: 16px;">${t('dialog.teamTitle')}</strong>
                                        <p style="margin: 4px 0 12px 0; color: #666;">${t('dialog.teamCopy')}</p>
                                        <div style="display: flex; gap: 8px;">
                                            <button id="select-team-btn" style="padding: 8px 12px; border: none; border-radius: 6px; background: #10a37f; color: #fff; cursor: pointer; font-weight: bold;">${t('button.exportAll')}</button>
                                            <button id="select-team-picker-btn" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer;">${t('button.selectConversationsExport')}</button>
                                        </div>
                                    </div>
                                </div>
                                <div style="display: flex; justify-content: flex-end; margin-top: 24px;">
                                    <button id="cancel-btn" style="padding: 10px 16px; border: 1px solid #ccc; border-radius: 8px; background: #fff; cursor: pointer;">${t('button.cancel')}</button>
                                </div>`;
                    break;
            }
            dialog.innerHTML = html;
            attachListeners(step);
        };

        const attachListeners = (step) => {
            if (step === 'initial') {
                document.getElementById('select-personal-btn').onclick = () => {
                    closeDialog();
                    startExportProcess('personal', null);
                };
                document.getElementById('select-personal-picker-btn').onclick = () => {
                    closeDialog();
                    showConversationPicker({ mode: 'personal', workspaceId: null });
                };
                document.getElementById('select-project-btn').onclick = () => {
                    closeDialog();
                    startProjectSpaceExportProcess();
                };
                document.getElementById('select-project-picker-btn').onclick = () => {
                    closeDialog();
                    showConversationPicker({ mode: 'project', workspaceId: null });
                };
                const startTeamFlow = (action) => {
                    const detectedIds = detectAllWorkspaceIds();
                    if (detectedIds.length === 1) {
                        const workspaceId = detectedIds[0];
                        closeDialog();
                        if (action === 'all') {
                            startExportProcess('team', workspaceId);
                        } else {
                            showConversationPicker({ mode: 'team', workspaceId });
                        }
                        return;
                    }
                    renderStep('team', action);
                };
                document.getElementById('select-team-btn').onclick = () => startTeamFlow('all');
                document.getElementById('select-team-picker-btn').onclick = () => startTeamFlow('select');
                document.getElementById('cancel-btn').onclick = closeDialog;
            } else if (step === 'team') {
                document.getElementById('back-btn').onclick = () => renderStep('initial');
                const resolveWorkspaceId = () => {
                    let workspaceId = '';
                    const radioChecked = document.querySelector('input[name="workspace_id"]:checked');
                    const codeEl = document.getElementById('workspace-id-code');
                    const inputEl = document.getElementById('team-id-input');

                    if (radioChecked) {
                        workspaceId = radioChecked.value;
                    } else if (codeEl) {
                        workspaceId = codeEl.textContent;
                    } else if (inputEl) {
                        workspaceId = inputEl.value.trim();
                    }

                    if (!workspaceId) {
                        alert(t('alert.invalidWorkspaceId'));
                        return;
                    }
                    return workspaceId;
                };
                const exportAllBtn = document.getElementById('start-team-export-btn');
                const pickerBtn = document.getElementById('start-team-picker-btn');
                if (exportAllBtn) exportAllBtn.onclick = () => {
                    const workspaceId = resolveWorkspaceId();
                    if (!workspaceId) return;
                    closeDialog();
                    startExportProcess('team', workspaceId);
                };
                if (pickerBtn) pickerBtn.onclick = () => {
                    const workspaceId = resolveWorkspaceId();
                    if (!workspaceId) return;
                    closeDialog();
                    showConversationPicker({ mode: 'team', workspaceId });
                };
            }
        };

        styleExportDialog(overlay, dialog);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        overlay.onclick = (e) => { if (e.target === overlay) closeDialog(); };
        renderStep('initial');
    }


  function createExportDock(id, zIndex, caption = "导出") {
    const host = document.createElement("div");
    host.id = id;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; position: fixed; right: max(16px, env(safe-area-inset-right));
        bottom: max(16px, env(safe-area-inset-bottom)); z-index: ${zIndex};
        font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color-scheme: light; }
      .dock-stack { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
      .dock-launcher { all: unset; box-sizing: border-box; display: inline-flex; align-items: center;
        justify-content: center; gap: 6px; min-height: 36px; padding: 0 12px;
        border: 1px solid #ffffff26; border-radius: 999px; background: #252629; color: #fff;
        font: 600 12px/1 system-ui, sans-serif; cursor: pointer; user-select: none;
        box-shadow: 0 3px 12px #0002; }
      .dock-launcher:hover, .dock-launcher[aria-expanded="true"] { background: #3f4146; }
      .dock-launcher svg { width: 15px; height: 15px; flex: none; }
      .dock-menu { box-sizing: border-box; display: flex; flex-direction: column; flex-wrap: nowrap; gap: 4px;
        width: min(224px, calc(100vw - 32px)); max-height: calc(100dvh - 100px); overflow: auto;
        padding: 6px; background: #fff; color: #1f2937; border: 1px solid #e5e7eb;
        border-radius: 14px; box-shadow: 0 8px 28px #0002; }
      .dock-menu[hidden] { display: none; }
      .dock-menu > button { all: unset; box-sizing: border-box; display: flex;
        align-items: center; justify-content: flex-start; gap: 8px; width: 100%; min-height: 38px;
        padding: 8px 10px; border-radius: 8px; background: transparent; color: #1f2937;
        font: 500 13px/1.45 system-ui, sans-serif; cursor: pointer; text-align: left; }
      .dock-menu > button:hover { background: #f3f4f6; }
      .dock-menu > button:disabled { opacity: .45; cursor: default; }
      .dock-launcher:focus-visible, .dock-menu > button:focus-visible {
        outline: 2px solid #059669; outline-offset: 3px; }
      @media (pointer: coarse) { .dock-launcher { min-height: 44px; } }
    `;
    const stack = document.createElement("div");
    stack.className = "dock-stack";
    const menu = document.createElement("div");
    menu.className = "dock-menu";
    menu.id = id + "-menu";
    menu.hidden = true;
    menu.setAttribute("role", "group");
    menu.setAttribute("aria-label", caption);
    const launcher = document.createElement("button");
    launcher.type = "button";
    launcher.className = "dock-launcher";
    launcher.title = caption;
    launcher.setAttribute("aria-label", caption);
    launcher.setAttribute("aria-controls", menu.id);
    launcher.setAttribute("aria-expanded", "false");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "1.8");
    icon.setAttribute("stroke-linecap", "round");
    icon.setAttribute("stroke-linejoin", "round");
    icon.setAttribute("aria-hidden", "true");
    const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
    line.setAttribute("d", "M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4");
    icon.append(line);
    const text = document.createElement("span");
    text.textContent = caption;
    launcher.append(icon, text);
    const dock = { host, shadow, stack, menu, launcher, text, style, onClose: null };
    dock.setExpanded = (expanded, focus = false) => {
      menu.hidden = !expanded;
      launcher.setAttribute("aria-expanded", String(expanded));
      if (!expanded) dock.onClose?.();
      if (focus) (expanded ? menu.querySelector("button:not(:disabled)") : launcher)?.focus();
    };
    launcher.addEventListener("click", () => dock.setExpanded(menu.hidden, true));
    document.addEventListener("pointerdown", event => {
      if (!menu.hidden && !event.composedPath().includes(host)) dock.setExpanded(false);
    });
    shadow.addEventListener("keydown", event => {
      if (event.key === "Escape" && !menu.hidden) {
        event.preventDefault();
        event.stopPropagation();
        dock.setExpanded(false, true);
      }
    });
    stack.append(menu, launcher);
    shadow.append(style, stack);
    return dock;
  }

    function styleExportDialog(overlay, dialog) {
        const style = document.createElement('style');
        style.textContent = `
            #export-dialog-overlay { background: #11182766 !important; padding: 16px; box-sizing: border-box; }
            #export-dialog { background: #fff !important; color: #1f2937 !important; color-scheme: light;
                border: 1px solid #e5e7eb; border-radius: 16px !important; padding: 24px !important;
                max-width: 100%; max-height: 88dvh; overflow: auto;
                box-shadow: 0 16px 48px #0003 !important; font: 14px/1.5 system-ui, sans-serif !important; }
            #export-dialog h2 { font-size: 18px !important; font-weight: 650; color: #111827; }
            #export-dialog button { box-sizing: border-box; min-height: 36px; padding: 8px 12px !important;
                background: #f9fafb !important; color: #374151 !important; border: 1px solid #d1d5db !important;
                border-radius: 8px !important; font: 500 13px/1.4 system-ui, sans-serif !important; }
            #export-dialog button:hover:not(:disabled) { filter: brightness(.96); }
            #export-dialog button:disabled { opacity: .45; cursor: default !important; }
            #export-dialog #export-selected-btn, #export-dialog #start-team-export-btn,
            #export-dialog #select-personal-btn, #export-dialog #select-project-btn,
            #export-dialog #select-team-btn { background: #047857 !important; color: #fff !important;
                border-color: #047857 !important; }
            #export-dialog input:not([type=checkbox]):not([type=radio]), #export-dialog select {
                background: #fff !important; color: #1f2937 !important; border: 1px solid #d1d5db !important;
                border-radius: 8px !important; min-width: 0; max-width: 100%;
                padding: 8px !important; font: 13px/1.4 system-ui, sans-serif; }
            #export-dialog input[type=checkbox], #export-dialog input[type=radio] { accent-color: #047857; }
            #export-dialog :is(button, input, select):focus-visible { outline: 2px solid #059669; outline-offset: 2px; }
            #export-dialog > div { flex-wrap: wrap; gap: 8px; }
            #export-dialog #conv-list { border: 1px solid #e5e7eb; border-radius: 10px !important; }
            #export-dialog #conv-list label:focus-within { outline: 2px solid #059669; outline-offset: -2px; }
            @media (max-width: 520px) { #export-dialog { padding: 16px !important; }
                #export-dialog #conv-search { flex-basis: 100% !important; } }
        `;
        overlay.appendChild(style);
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-label', t('button.export'));
        queueMicrotask(() => dialog.querySelector('input:not(:disabled), button:not(:disabled)')?.focus());
        overlay.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                overlay.dispatchEvent(new Event('exporter-close'));
                overlay.remove();
                document.getElementById('gpt-rescue-btn')?.shadowRoot?.querySelector('.dock-launcher')?.focus();
            }
            if (event.key === 'Tab') {
                const controls = [...dialog.querySelectorAll('button, input, select, [tabindex="0"]')]
                    .filter(element => !element.disabled && element.getClientRects().length);
                const first = controls[0];
                const last = controls[controls.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
        });
    }

    function addBtn() {
        if (exportUi?.dock.host.isConnected) return;
        const chinese = /[\u3400-\u9fff]/.test(t('button.export'));
        const caption = chinese ? '导出' : 'Export';
        const dock = createExportDock('gpt-rescue-btn', 99997, caption);
        const style = document.createElement('style');
        style.textContent = `
            .export-taskbar { display: flex; align-items: center; gap: 6px; }
            .stop-export { min-height: 36px; padding: 0 12px; border-radius: 999px;
                background: #fff1f2; color: #be123c; border: 1px solid #fecdd3;
                font: 600 12px/1 system-ui, sans-serif; box-shadow: 0 3px 12px #0002; cursor: pointer; }
            .stop-export[hidden], .export-status[hidden] { display: none; }
            .stop-export:hover { background: #ffe4e6; }
            .stop-export:focus-visible { outline: 2px solid #be123c; outline-offset: 2px; }
            .stop-export:disabled { opacity: .6; cursor: default; }
            .export-status { box-sizing: border-box; max-width: min(320px, calc(100vw - 32px));
                padding: 10px 12px; border-radius: 12px; background: #252629; color: #fff;
                font: 13px/1.5 system-ui, sans-serif; overflow-wrap: anywhere; box-shadow: 0 4px 18px #0002; }
            @media (pointer: coarse) { .stop-export { min-height: 44px; } }
        `;
        const stop = document.createElement('button');
        stop.type = 'button';
        stop.className = 'stop-export';
        stop.textContent = '停止';
        stop.title = '停止本次导出，丢弃尚未下载的内容';
        stop.hidden = true;
        stop.addEventListener('click', () => {
            if (!activeTask || activeTask.signal.aborted) return;
            stop.disabled = true;
            stop.textContent = '停止中';
            activeTask.abort();
        });
        const status = document.createElement('div');
        status.className = 'export-status';
        status.hidden = true;
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        const taskbar = document.createElement('div');
        taskbar.className = 'export-taskbar';
        taskbar.append(dock.launcher, stop);
        dock.stack.prepend(status);
        dock.stack.append(taskbar);
        dock.shadow.append(style);
        exportUi = { dock, caption, stop, status };
        const action = (label, callback) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            button.addEventListener('click', () => { dock.setExpanded(false); callback(); });
            dock.menu.append(button);
        };
        action(chinese ? '选择个人会话' : 'Select personal chats', () => showConversationPicker({ mode: 'personal' }));
        action(chinese ? '更多导出选项…' : 'More export options…', showExportDialog);
        document.body.appendChild(dock.host);
    }

    // --- 脚本启动 ---
    setTimeout(addBtn, 2000);

    window.ChatGPTExporter = window.ChatGPTExporter || {};
    Object.assign(window.ChatGPTExporter, {
        showDialog: showExportDialog,
        startManualExport: (mode = 'personal', workspaceId = null) => {
            if (mode === 'project') {
                return startProjectSpaceExportProcess(workspaceId);
            }
            return startExportProcess(mode, workspaceId);
        },
        startScheduledExport
    });

    document.documentElement.setAttribute('data-chatgpt-exporter-ready', '1');
    window.dispatchEvent(new CustomEvent('CHATGPT_EXPORTER_READY'));

    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        const data = event.data || {};
        if (data?.type !== 'CHATGPT_EXPORTER_COMMAND') return;
        const api = window.ChatGPTExporter;
        if (!api) return;
        try {
            switch (data.action) {
                case 'START_SCHEDULED_EXPORT':
                    api.startScheduledExport(data.payload || {});
                    break;
                case 'OPEN_DIALOG':
                    api.showDialog();
                    break;
                case 'START_MANUAL_EXPORT':
                    api.startManualExport(data.payload?.mode, data.payload?.workspaceId);
                    break;
                default:
                    console.warn('[ChatGPT Exporter] 未知命令:', data.action);
            }
        } catch (err) {
            console.error('[ChatGPT Exporter] 处理命令失败:', err);
        }
    });

})();
