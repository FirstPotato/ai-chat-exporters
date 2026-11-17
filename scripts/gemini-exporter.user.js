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

(function initializeGeminiExporterCore(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.GeminiWebExporterCore = api;
  }
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function createGeminiExporterCore() {
    "use strict";

    const HISTORY_RPC_ID = "hNvQHb";

    function invariant(condition, message) {
      if (!condition) {
        throw new Error(message);
      }
    }

    function parseJsonLines(rawResponse) {
      invariant(
        typeof rawResponse === "string" && rawResponse.length > 0,
        "Gemini returned an empty history response.",
      );

      const withoutXssiPrefix = rawResponse.replace(/^\)\]\}'\r?\n?/, "");
      const parsedLines = [];

      for (const rawLine of withoutXssiPrefix.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || /^\d+$/.test(line)) {
          continue;
        }

        try {
          parsedLines.push(JSON.parse(line));
        } catch {
          // Batchexecute length markers and transport metadata are not payloads.
        }
      }

      invariant(
        parsedLines.length > 0,
        "Gemini's history response did not contain any JSON payloads.",
      );

      return parsedLines;
    }

    function findRpcPayload(value, rpcId) {
      if (!Array.isArray(value)) {
        return null;
      }

      if (
        value[0] === "wrb.fr" &&
        value[1] === rpcId &&
        typeof value[2] === "string"
      ) {
        return value[2];
      }

      for (const child of value) {
        const match = findRpcPayload(child, rpcId);
        if (match !== null) {
          return match;
        }
      }

      return null;
    }

    function parseBatchexecuteResponse(rawResponse, rpcId = HISTORY_RPC_ID) {
      const chunks = parseJsonLines(rawResponse);

      for (const chunk of chunks) {
        const encodedPayload = findRpcPayload(chunk, rpcId);
        if (encodedPayload === null) {
          continue;
        }

        try {
          return JSON.parse(encodedPayload);
        } catch (error) {
          throw new Error(
            `Gemini returned malformed JSON for history RPC ${rpcId}: ${error.message}`,
          );
        }
      }

      throw new Error(
        `Gemini's response did not contain history RPC ${rpcId}. The private API may have changed.`,
      );
    }

    function parseHistoryPage(rawResponse) {
      const payload = parseBatchexecuteResponse(rawResponse, HISTORY_RPC_ID);

      invariant(
        Array.isArray(payload) && Array.isArray(payload[0]),
        "Gemini returned an unrecognized history payload.",
      );

      const cursor =
        typeof payload[1] === "string" && payload[1].length > 0
          ? payload[1]
          : null;

      return {
        rawTurns: payload[0],
        cursor,
      };
    }

    async function collectHistoryPages(
      fetchPage,
      { maxPages = 200 } = {},
    ) {
      invariant(typeof fetchPage === "function", "fetchPage must be a function.");

      const pages = [];
      const seenCursors = new Set();
      let cursor = null;

      for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
        const rawResponse = await fetchPage(cursor, pageNumber);
        const page =
          typeof rawResponse === "string"
            ? parseHistoryPage(rawResponse)
            : rawResponse;

        invariant(
          page && Array.isArray(page.rawTurns),
          `Gemini history page ${pageNumber + 1} was invalid.`,
        );

        pages.push(page);

        if (!page.cursor) {
          return {
            pages,
            rawTurnsNewestFirst: pages.flatMap(
              (historyPage) => historyPage.rawTurns,
            ),
          };
        }

        invariant(
          page.rawTurns.length > 0,
          "Gemini returned a continuation cursor with no turns.",
        );
        invariant(
          !seenCursors.has(page.cursor),
          "Gemini repeated a history cursor; export stopped to avoid duplicate turns.",
        );

        seenCursors.add(page.cursor);
        cursor = page.cursor;
      }

      throw new Error(
        `Export exceeded ${maxPages} history pages. Stopped instead of producing a potentially incomplete file.`,
      );
    }

    function timestampToIso(timestampTuple) {
      if (
        !Array.isArray(timestampTuple) ||
        !Number.isFinite(Number(timestampTuple[0]))
      ) {
        return null;
      }

      const seconds = Number(timestampTuple[0]);
      const nanoseconds = Number(timestampTuple[1] || 0);
      const milliseconds = seconds * 1000 + nanoseconds / 1_000_000;
      const date = new Date(milliseconds);

      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }

    function extractSelectedCandidate(rawTurn) {
      const candidates = rawTurn?.[3]?.[0];
      if (!Array.isArray(candidates)) {
        return null;
      }

      return (
        candidates.find(
          (candidate) =>
            Array.isArray(candidate) &&
            typeof candidate?.[1]?.[0] === "string" &&
            candidate[1][0].length > 0,
        ) || null
      );
    }

    function extractTurn(rawTurn, sourceIndex) {
      invariant(
        Array.isArray(rawTurn),
        `Gemini turn ${sourceIndex + 1} was not an array.`,
      );

      const userMarkdown = rawTurn?.[2]?.[0]?.[0];
      const candidate = extractSelectedCandidate(rawTurn);
      const assistantMarkdown = candidate?.[1]?.[0];

      return {
        conversationId:
          typeof rawTurn?.[0]?.[0] === "string"
            ? rawTurn[0][0]
            : rawTurn?.[1]?.[0] || null,
        responseId:
          typeof rawTurn?.[0]?.[1] === "string" ? rawTurn[0][1] : null,
        parentResponseId:
          typeof rawTurn?.[1]?.[1] === "string" ? rawTurn[1][1] : null,
        candidateId:
          typeof candidate?.[0] === "string"
            ? candidate[0]
            : rawTurn?.[3]?.[3] || null,
        parentCandidateId:
          typeof rawTurn?.[1]?.[2] === "string" ? rawTurn[1][2] : null,
        userMarkdown:
          typeof userMarkdown === "string" ? userMarkdown : "",
        assistantMarkdown:
          typeof assistantMarkdown === "string" ? assistantMarkdown : "",
        timestamp: timestampToIso(rawTurn?.[4]),
        sourceIndex,
      };
    }

    function historyToChronologicalTurns(rawTurnsNewestFirst) {
      invariant(
        Array.isArray(rawTurnsNewestFirst),
        "Gemini history turns were missing.",
      );

      const seenResponseIds = new Set();
      const uniqueNewestFirst = [];

      rawTurnsNewestFirst.forEach((rawTurn, sourceIndex) => {
        const turn = extractTurn(rawTurn, sourceIndex);
        const dedupeKey =
          turn.responseId ||
          `${turn.timestamp || "unknown"}\u0000${turn.userMarkdown}\u0000${turn.assistantMarkdown}`;

        if (seenResponseIds.has(dedupeKey)) {
          return;
        }

        seenResponseIds.add(dedupeKey);
        uniqueNewestFirst.push(turn);
      });

      return uniqueNewestFirst.reverse();
    }

    function countOccurrences(text, expression) {
      return (text.match(expression) || []).length;
    }

    function fnv1a(text) {
      let hash = 0x811c9dc5;

      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
      }

      return (hash >>> 0).toString(16).padStart(8, "0");
    }

    function validateConversation(turns) {
      invariant(Array.isArray(turns), "Exported turns were missing.");
      invariant(turns.length > 0, "Gemini returned no conversation turns.");

      const missing = [];
      const responseIds = new Set();
      const duplicateResponseIds = [];
      const bodyFingerprints = new Set();
      const duplicateBodies = [];
      const chainBreaks = [];
      const timestampRegressions = [];
      const markdownWarnings = [];

      turns.forEach((turn, index) => {
        if (!turn.userMarkdown.trim()) {
          missing.push(`turn ${index + 1} user message`);
        }
        if (!turn.assistantMarkdown.trim()) {
          missing.push(`turn ${index + 1} Gemini response`);
        }

        if (turn.responseId) {
          if (responseIds.has(turn.responseId)) {
            duplicateResponseIds.push(turn.responseId);
          }
          responseIds.add(turn.responseId);
        }

        const bodyFingerprint = fnv1a(
          `${turn.userMarkdown}\u0000${turn.assistantMarkdown}`,
        );
        if (bodyFingerprints.has(bodyFingerprint)) {
          duplicateBodies.push(index + 1);
        }
        bodyFingerprints.add(bodyFingerprint);

        if (index > 0) {
          const previous = turns[index - 1];
          if (
            turn.parentResponseId &&
            previous.responseId &&
            turn.parentResponseId !== previous.responseId
          ) {
            chainBreaks.push({
              turn: index + 1,
              expectedParent: previous.responseId,
              actualParent: turn.parentResponseId,
            });
          }

          if (
            turn.timestamp &&
            previous.timestamp &&
            Date.parse(turn.timestamp) < Date.parse(previous.timestamp)
          ) {
            timestampRegressions.push(index + 1);
          }
        }

        for (const [role, markdown] of [
          ["user", turn.userMarkdown],
          ["Gemini", turn.assistantMarkdown],
        ]) {
          if (countOccurrences(markdown, /```/g) % 2 !== 0) {
            markdownWarnings.push(
              `turn ${index + 1} ${role} text has an unbalanced code fence`,
            );
          }

          if (countOccurrences(markdown, /\$\$/g) % 2 !== 0) {
            markdownWarnings.push(
              `turn ${index + 1} ${role} text has an unbalanced display-math delimiter`,
            );
          }
        }
      });

      invariant(
        missing.length === 0,
        `Export stopped because content was missing: ${missing.join(", ")}.`,
      );
      invariant(
        duplicateResponseIds.length === 0,
        "Export stopped because Gemini returned duplicate response IDs.",
      );
      if (chainBreaks.length > 0) {
        throw new Error(
          `Export stopped because the active conversation branch was discontinuous at turn ${chainBreaks[0].turn}.`,
        );
      }

      const fingerprint = fnv1a(
        turns
          .map(
            (turn) =>
              `${turn.responseId || ""}\u0000${turn.userMarkdown}\u0000${turn.assistantMarkdown}`,
          )
          .join("\u0001"),
      );

      return {
        turnCount: turns.length,
        duplicateBodies,
        timestampRegressions,
        markdownWarnings,
        fingerprint,
      };
    }

    function normalizeBlock(markdown) {
      return String(markdown)
        .replace(/\r\n?/g, "\n")
        .replace(/^\n+|\n+$/g, "");
    }

    function escapeMarkdownLinkDestination(url) {
      return String(url).replace(/[()\\]/g, "\\$&");
    }

    function turnPreview(markdown, maxLength = 72) {
      const plainText = normalizeBlock(markdown)
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/```[^\n]*\n?/g, " ")
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/<[^>]+>/g, " ")
        .replace(/[`*_~#$>|]/g, " ")
        .replace(/^\s*(?:[-+*]|\d+[.)])\s+/gm, "")
        .replace(/\s+/g, " ")
        .replace(/\s+([,.;:!?])/g, "$1")
        .trim();

      if (plainText.length <= maxLength) {
        return plainText;
      }

      const candidate = plainText.slice(0, maxLength + 1);
      const lastSpace = candidate.lastIndexOf(" ");
      const clipped =
        lastSpace >= Math.floor(maxLength * 0.6)
          ? candidate.slice(0, lastSpace)
          : plainText.slice(0, maxLength);

      return `${clipped.trimEnd()}…`;
    }

    function escapeMarkdownLinkText(text) {
      return String(text).replace(/([\\[\]])/g, "\\$1");
    }

    function renderMarkdown({
      title,
      sourceUrl,
      conversationId,
      exportedAt,
      turns,
      diagnostics,
      includeMetadata = true,
      includeOutline = true,
    }) {
      invariant(Array.isArray(turns) && turns.length > 0, "No turns to render.");

      const safeTitle = normalizeBlock(title || "Gemini conversation").replace(
        /\n+/g,
        " ",
      );
      const lines = [`# ${safeTitle}`, ""];

      if (includeMetadata) {
        lines.push(
          `> Source: [Google Gemini](${escapeMarkdownLinkDestination(sourceUrl)})`,
          `> Exported: ${exportedAt}`,
          `> Conversation: ${conversationId}`,
          `> Turns: ${turns.length}`,
          `> Validation fingerprint: \`${diagnostics.fingerprint}\``,
          "",
        );
      }

      if (includeOutline) {
        lines.push("## Conversation outline", "");
        turns.forEach((turn, index) => {
          const number = index + 1;
          const preview = turnPreview(turn.userMarkdown);
          const label = preview
            ? `Turn ${number} — ${preview}`
            : `Turn ${number}`;

          lines.push(
            `${number}. [${escapeMarkdownLinkText(label)}](#turn-${number})`,
          );
        });
        lines.push("");
      }

      turns.forEach((turn, index) => {
        if (index > 0) {
          lines.push("---", "");
        }

        if (includeMetadata) {
          const commentParts = [
            `turn=${index + 1}`,
            turn.responseId ? `response=${turn.responseId}` : null,
            turn.candidateId ? `candidate=${turn.candidateId}` : null,
            turn.timestamp ? `timestamp=${turn.timestamp}` : null,
          ].filter(Boolean);

          lines.push(
            `<!-- gemini-export: ${commentParts.join(" ")} -->`,
            "",
          );
        }

        if (includeOutline) {
          lines.push(`## turn-${index + 1}`, "", "### User", "");
        } else {
          lines.push("## User", "");
        }

        lines.push(normalizeBlock(turn.userMarkdown), "");

        if (includeOutline) {
          lines.push("### Gemini", "");
        } else {
          lines.push("## Gemini", "");
        }

        lines.push(normalizeBlock(turn.assistantMarkdown), "");
      });

      return `${lines.join("\n").replace(/\n{4,}/g, "\n\n\n").trim()}\n`;
    }

    function conversationIdFromPath(pathname) {
      const parts = String(pathname).split("/").filter(Boolean);
      const appIndex =
        parts[0] === "u" && /^\d+$/.test(parts[1] || "") ? 2 : 0;

      if (parts[appIndex] !== "app" || !parts[appIndex + 1]) {
        return null;
      }

      const conversationId = parts[appIndex + 1];
      return conversationId.startsWith("c_")
        ? conversationId
        : `c_${conversationId}`;
    }

    function accountScopedPath(pathname, targetPath) {
      const accountMatch = String(pathname).match(/^\/u\/(\d+)(?:\/|$)/);
      const normalizedTarget = `/${String(targetPath).replace(/^\/+/, "")}`;

      return accountMatch
        ? `/u/${accountMatch[1]}${normalizedTarget}`
        : normalizedTarget;
    }

    function cleanDocumentTitle(documentTitle) {
      const withoutProduct = String(documentTitle || "")
        .replace(/\s*[-–—]\s*Google Gemini\s*$/i, "")
        .trim();

      return withoutProduct || "Gemini conversation";
    }

    function safeFilename(title) {
      const cleaned = String(title || "Gemini conversation")
        .normalize("NFKC")
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
        .replace(/\s+/g, " ")
        .replace(/[.\s-]+$/g, "")
        .trim()
        .slice(0, 120);

      return `${cleaned || "Gemini conversation"}.md`;
    }

    function filterConversationEntries(entries, { query = "", startDate = "", endDate = "" } = {}) {
      const boundary = (value, nextDay = false) => {
        if (!value) return null;
        invariant(/^\d{4}-\d{2}-\d{2}$/.test(value), "日期格式无效。");
        const date = new Date(`${value}T00:00:00`);
        invariant(Number.isFinite(date.getTime()), "日期无效。");
        if (nextDay) date.setDate(date.getDate() + 1);
        return date.getTime();
      };
      const start = boundary(startDate);
      const end = boundary(endDate, true);
      invariant(start == null || end == null || start < end, "开始日期不能晚于结束日期。");
      const needle = query.trim().toLocaleLowerCase();
      return entries.filter((item) => {
        if (needle && !`${item.title} ${item.id}`.toLocaleLowerCase().includes(needle)) return false;
        if (start == null && end == null) return true;
        const time = Date.parse(item.listedAt || "");
        return Number.isFinite(time) && (start == null || time >= start) && (end == null || time < end);
      });
    }

    function collectImageAssets(rawTurns) {
      const found = new Map();
      const pending = [rawTurns];
      while (pending.length) {
        const node = pending.pop();
        if (!Array.isArray(node)) continue;
        const mime = [node[10], node[11]].find((value) =>
          typeof value === "string" && /^image\//i.test(value));
        if (mime && typeof node[3] === "string") {
          try {
            const url = new URL(node[3]);
            if (url.protocol === "https:" && !url.username && !url.password
              && (url.hostname === "googleusercontent.com" || url.hostname.endsWith(".googleusercontent.com"))) {
              found.set(url.href, { url: url.href, mimeType: mime,
                name: typeof node[2] === "string" ? node[2] : "image" });
            }
          } catch { /* Not a supported media URL. */ }
        }
        for (const child of node) if (Array.isArray(child)) pending.push(child);
      }
      return [...found.values()];
    }

    return Object.freeze({
      HISTORY_RPC_ID,
      accountScopedPath,
      cleanDocumentTitle,
      collectImageAssets,
      collectHistoryPages,
      conversationIdFromPath,
      extractTurn,
      fnv1a,
      filterConversationEntries,
      historyToChronologicalTurns,
      parseBatchexecuteResponse,
      parseHistoryPage,
      renderMarkdown,
      safeFilename,
      timestampToIso,
      turnPreview,
      validateConversation,
    });
  },
);


(function runGeminiExporterUserscript() {
  "use strict";

  const Core = globalThis.GeminiWebExporterCore;
  if (!Core) {
    throw new Error("Gemini exporter core failed to initialize.");
  }

  const ROOT_ID = "gemini-web-exporter-root";
  const HISTORY_PAGE_SIZE = 50;
  const LIST_RPC_ID = "MaZiqc";
  const PREFERENCE_KEYS = Object.freeze({
    includeMetadata: "export.includeMetadata",
    includeOutline: "export.includeOutline",
    downloadImages: "export.downloadImages",
  });
  const pageWindow =
    typeof unsafeWindow !== "undefined" ? unsafeWindow : globalThis;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function captureExportContext() {
    return {
      config: { ...getGeminiConfig() },
      pathname: location.pathname,
      search: location.search,
      origin: location.origin,
      href: location.href,
      title: Core.cleanDocumentTitle(document.title),
      language: (document.documentElement.lang || "en").split("-")[0],
    };
  }

  async function fetchText(endpoint, options) {
    const controller = new pageWindow.AbortController();
    options.signal = controller.signal;
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await pageWindow.fetch(endpoint.toString(), options);
      if (!response.ok) throw new Error(`Gemini 请求失败 (HTTP ${response.status})`);
      return await response.text();
    } catch (error) {
      if (controller.signal.aborted) throw new Error("Gemini 请求超时（45 秒），请稍后重试。");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function downloadImage(asset) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== "function") {
        reject(new Error("油猴未提供图片下载权限，请重新安装最新版脚本。"));
        return;
      }
      let request;
      const limit = 30 * 1024 * 1024;
      request = GM_xmlhttpRequest({
        method: "GET", url: asset.url, responseType: "blob", timeout: 30000,
        onprogress(event) {
          if (event.loaded > limit || event.total > limit) {
            reject(new Error("图片超过 30 MB 限制。"));
            request?.abort();
          }
        },
        onload(response) {
          const blob = response.response;
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`图片请求失败 (HTTP ${response.status})`));
          } else if (!blob || !/^image\//i.test(blob.type || "") || blob.size > limit) {
            reject(new Error("图片内容类型异常或超过 30 MB 限制。"));
          } else resolve(blob);
        },
        onerror: () => reject(new Error("图片网络请求失败。")),
        ontimeout: () => reject(new Error("图片下载超时（30 秒）。")),
        onabort: () => reject(new Error("图片下载已中止。")),
      });
    });
  }

  async function exportImages(zip, rawTurns, conversationId, enabled) {
    const images = Core.collectImageAssets(rawTurns);
    const results = [];
    const extensions = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
      "image/gif": "gif", "image/avif": "avif", "image/bmp": "bmp", "image/svg+xml": "svg", "image/tiff": "tiff" };
    for (let index = 0; index < images.length; index++) {
      const asset = images[index];
      if (!enabled) {
        results.push({ ...asset, status: "not-requested" });
        continue;
      }
      if (index >= 100) {
        results.push({ ...asset, status: "failed", error: "每个会话最多下载 100 张图片。" });
        continue;
      }
      try {
        const blob = await downloadImage(asset);
        const extension = extensions[blob.type.toLowerCase().split(";")[0]];
        if (!extension) throw new Error("暂不支持此图片格式。");
        const filename = `images/${conversationId}_${index + 1}.${extension}`;
        zip.file(filename, blob);
        results.push({ ...asset, status: "downloaded", filename });
      } catch (error) {
        results.push({ ...asset, status: "failed", error: error.message });
      }
      await sleep(200);
    }
    return results;
  }

  function isConversationPage() {
    return Core.conversationIdFromPath(location.pathname) !== null;
  }

  function getGeminiConfig() {
    const config = pageWindow.WIZ_global_data;
    const required = ["cfb2h", "FdrFJe", "SNlM0e"];

    if (
      !config ||
      required.some(
        (key) => typeof config[key] !== "string" || config[key].length === 0,
      )
    ) {
      throw new Error(
        "Gemini 页面配置尚未就绪，请刷新页面后再试。",
      );
    }

    return config;
  }

  function makeRequestId() {
    return String(Math.floor(Math.random() * 9_000_000) + 1_000_000);
  }

  function cloneForPageRealm(value) {
    return typeof cloneInto === "function"
      ? cloneInto(value, pageWindow)
      : value;
  }

  function readBooleanPreference(key, fallback) {
    if (typeof GM_getValue !== "function") return fallback;
    try {
      const value = GM_getValue(key, fallback);
      return typeof value === "boolean" ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function writeBooleanPreference(key, value) {
    if (typeof GM_setValue !== "function") return;
    try {
      GM_setValue(key, Boolean(value));
    } catch {}
  }

  async function fetchHistoryPage(conversationId, cursor, context) {
    const config = context.config;
    const query = new URLSearchParams({
      rpcids: Core.HISTORY_RPC_ID,
      "source-path": context.pathname,
      bl: config.cfb2h,
      "f.sid": config.FdrFJe,
      hl: context.language,
      _reqid: makeRequestId(),
      rt: "c",
    });
    const pageId = new URLSearchParams(context.search).get("pageId");
    if (pageId) query.set("pageId", pageId);

    const rpcArguments = [
      conversationId,
      HISTORY_PAGE_SIZE,
      cursor,
      1,
      [0],
      [4],
      null,
      1,
    ];
    const rpcCall = [
      Core.HISTORY_RPC_ID,
      JSON.stringify(rpcArguments),
      null,
      "generic",
    ];
    const body = new URLSearchParams({
      "f.req": JSON.stringify([[rpcCall]]),
      at: config.SNlM0e,
    });
    const endpointPath = Core.accountScopedPath(
      context.pathname,
      "/_/BardChatUi/data/batchexecute",
    );
    const endpoint = new URL(endpointPath, context.origin);
    endpoint.search = query.toString();

    const requestOptions = cloneForPageRealm({
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "X-Same-Domain": "1",
      },
      body: body.toString(),
    });
    return fetchText(endpoint, requestOptions);
  }

  // --- 批量导出扩展：获取全量会话列表 (MaZiqc RPC) ---
  async function fetchConversationListPage(cursor, context) {
    const config = context.config;
    const query = new URLSearchParams({
      rpcids: LIST_RPC_ID,
      "source-path": context.pathname,
      bl: config.cfb2h,
      "f.sid": config.FdrFJe,
      hl: context.language,
      _reqid: makeRequestId(),
      rt: "c",
    });

    const pageId = new URLSearchParams(context.search).get("pageId");
    if (pageId) query.set("pageId", pageId);

    const rpcArguments = [50, cursor, [0, null, 1]];
    const rpcCall = [
      LIST_RPC_ID,
      JSON.stringify(rpcArguments),
      null,
      "generic",
    ];
    const body = new URLSearchParams({
      "f.req": JSON.stringify([[rpcCall]]),
      at: config.SNlM0e,
    });
    const endpointPath = Core.accountScopedPath(
      context.pathname,
      "/_/BardChatUi/data/batchexecute",
    );
    const endpoint = new URL(endpointPath, context.origin);
    endpoint.search = query.toString();

    const requestOptions = cloneForPageRealm({
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "X-Same-Domain": "1",
      },
      body: body.toString(),
    });

    const text = await fetchText(endpoint, requestOptions);
    return Core.parseBatchexecuteResponse(text, LIST_RPC_ID);
  }

  function parseConversationListPayload(payload) {
    if (!Array.isArray(payload)) throw new Error("无法识别会话列表响应。");
    // Both response layouts have been observed in Gemini web clients.
    const candidates = [payload[2], payload[0]].filter(Array.isArray);
    const isEntry = (entry) => Array.isArray(entry) && typeof entry[0] === "string"
      && /^(?:c_[a-zA-Z0-9_-]+|[a-fA-F0-9]{16})$/.test(entry[0]);
    const populated = candidates.filter((list) => list.length > 0);
    const listPart = populated.find((list) => list.every(isEntry))
      ?? (populated.length === 0 ? candidates[0] : undefined);
    if (!listPart) throw new Error("会话列表结构已变化，不能确认列表完整性。");
    if (payload[1] != null && typeof payload[1] !== "string") {
      throw new Error("无法识别会话列表的分页标记。");
    }
    const items = listPart.map((entry) => ({
      id: entry[0].startsWith("c_") ? entry[0] : `c_${entry[0]}`,
      title: typeof entry[1] === "string" && entry[1].trim()
        ? entry[1] : "Gemini conversation",
      listedAt: Core.timestampToIso(entry[5]),
    }));
    const nextCursor =
      typeof payload[1] === "string" && payload[1].length > 0 ? payload[1] : null;
    return { items, nextCursor };
  }

  // 备用机制：从侧边栏 DOM 中提取会话链接
  function harvestSidebarConversationLinks(context) {
    const items = [];
    const seen = new Set();
    const links = document.querySelectorAll('a[href*="/app/"]');
    for (const a of links) {
      let url;
      try { url = new URL(a.getAttribute("href"), context.href); } catch { continue; }
      if (url.origin !== context.origin || Core.accountScopedPath(url.pathname, "/")
        !== Core.accountScopedPath(context.pathname, "/")) continue;
      const match = url.pathname.match(/^\/(?:u\/\d+\/)?app\/(c_[a-zA-Z0-9_-]+|[a-fA-F0-9]{16})\/?$/);
      if (match) {
        let id = match[1];
        if (!id.startsWith("c_")) id = "c_" + id;
        if (!seen.has(id)) {
          seen.add(id);
          const title =
            a.textContent?.trim() || a.getAttribute("aria-label") || "Gemini conversation";
          items.push({ id, title });
        }
      }
    }
    return items;
  }

  async function collectAllConversationIds(progressCallback, context) {
    const all = [];
    const seen = new Set();
    const seenCursors = new Set();
    const warnings = [];
    let listTraversalCompleted = false;

    try {
      let cursor = null;
      let page = 0;
      do {
        page++;
        if (progressCallback) progressCallback(`🔍 正在扫描列表 (第 ${page} 页)...`);
        const rawPayload = await fetchConversationListPage(cursor, context);
        const { items, nextCursor } = parseConversationListPayload(rawPayload);
        for (const it of items) {
          if (!seen.has(it.id)) {
            seen.add(it.id);
            all.push(it);
          }
        }
        cursor = nextCursor;
        if (!cursor) {
          listTraversalCompleted = true;
          break;
        }
        if (items.length === 0 || seenCursors.has(cursor)) {
          throw new Error("会话列表分页为空或重复，已停止扫描。");
        }
        if (page >= 200) throw new Error("扫描达到 200 页上限，列表可能不完整。");
        seenCursors.add(cursor);
        await sleep(400);
      } while (cursor);
    } catch (err) {
      console.warn("[Gemini Exporter] RPC list failed, using sidebar fallback:", err);
      warnings.push(`列表扫描未完成：${err.message}。仅导出已发现的会话。`);
    }

    const domItems = location.pathname === context.pathname
      ? harvestSidebarConversationLinks(context) : [];
    let sidebarAdded = 0;
    for (const it of domItems) {
      if (!seen.has(it.id)) {
        seen.add(it.id);
        all.push(it);
        sidebarAdded++;
      }
    }

    if (sidebarAdded > 0) {
      listTraversalCompleted = false;
      warnings.push(`页面链接补充了 ${sidebarAdded} 个会话，无法保证包含全部历史。`);
    }
    return { conversations: all, listTraversalCompleted, warnings };
  }

  function downloadFile(blob, filename) {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    link.style.display = "none";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
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

  function createUi() {
    const preferences = {
      downloadImages: readBooleanPreference(PREFERENCE_KEYS.downloadImages, false),
      includeMetadata: readBooleanPreference(
        PREFERENCE_KEYS.includeMetadata,
        true,
      ),
      includeOutline: readBooleanPreference(
        PREFERENCE_KEYS.includeOutline,
        true,
      ),
    };

    const dock = createExportDock(ROOT_ID, 2147483647);
    const { host, shadow, stack } = dock;
    const style = document.createElement("style");
    style.textContent = `
        button { font: inherit; appearance: none; border: 0; cursor: pointer; }
        .panel {
          box-sizing: border-box;
          width: min(290px, calc(100vw - 32px));
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 14px;
          background: #1f1f1f;
          color: #fff;
          padding: 14px;
          box-shadow: 0 6px 24px rgba(0, 0, 0, 0.34);
        }
        .panel[hidden] { display: none; }
        .panel-heading {
          margin: 0 0 10px;
          font-size: 13px;
          font-weight: 700;
        }
        .option {
          display: grid;
          grid-template-columns: 20px minmax(0, 1fr);
          gap: 9px;
          align-items: start;
          border-radius: 9px;
          cursor: pointer;
          padding: 6px;
        }
        .option:hover { background: rgba(255, 255, 255, 0.07); }
        .option input { accent-color: #a8c7fa; margin-top: 2px; }
        .option-copy { display: flex; flex-direction: column; gap: 2px; }
        .option-label { font-size: 13px; font-weight: 600; }
        .option-description { color: #c7c7c7; font-size: 11px; }
        .toast {
          box-sizing: border-box;
          display: none;
          max-width: min(420px, calc(100vw - 44px));
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 12px;
          background: #1f1f1f;
          color: #fff;
          font: 500 13px/1.45 system-ui, sans-serif;
          padding: 10px 14px;
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.28);
        }
        .toast[data-kind="error"] { background: #8c1d18; }
        .picker-overlay { position: fixed; inset: 0; background: #0009; display: flex;
          align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; }
        .picker { width: min(720px, 100%); max-height: 85vh; display: flex; flex-direction: column;
          background: #202124; color: #f1f3f4; border: 1px solid #5f6368; border-radius: 16px;
          padding: 20px; gap: 12px; font: 14px/1.5 system-ui; box-sizing: border-box; }
        .picker h2, .picker p { margin: 0; }
        .picker-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .picker input { background: #303134; color: #fff; border: 1px solid #70757a;
          border-radius: 6px; padding: 8px; font: inherit; min-width: 0; }
        .picker input[type=search] { flex: 1; width: 100%; }
        .picker button { background: #3c4043; color: #fff; border-radius: 7px; padding: 8px 12px; }
        .picker button.primary { background: #a8c7fa; color: #142742; }
        .picker button:disabled { opacity: .45; cursor: default; }
        .picker-list { overflow: auto; min-height: 60px; max-height: 40vh; border-block: 1px solid #5f6368; }
        .picker-row { display: flex; gap: 12px; padding: 10px 4px; align-items: start; cursor: pointer; }
        .picker-row span { overflow-wrap: anywhere; }
        .picker-note { color: #6b7280; font-size: 12px; }
        .panel { background: #fff; color: #1f2937; border-color: #e5e7eb;
          box-shadow: 0 8px 28px #0002; max-height: calc(100dvh - 280px); overflow: auto; }
        .option:hover { background: #f3f4f6; }
        .option input { accent-color: #047857; }
        .option-description { color: #6b7280; }
        .picker-overlay { background: #11182766; }
        .picker { background: #fff; color: #1f2937; border-color: #e5e7eb; padding: 24px;
          box-shadow: 0 16px 48px #0003; max-height: 88dvh; overflow: auto;
          font: 14px/1.5 system-ui, sans-serif; }
        .picker h2 { font-size: 18px; font-weight: 650; color: #111827; }
        .picker input { background: #fff; color: #1f2937; border-color: #d1d5db;
          border-radius: 8px; padding: 8px; font-size: 13px; accent-color: #047857; }
        .picker button { box-sizing: border-box; min-height: 36px; background: #f9fafb;
          color: #374151; border: 1px solid #d1d5db; border-radius: 8px; font: 500 13px/1.4 system-ui, sans-serif; }
        .picker button.primary { background: #047857; color: #fff; border-color: #047857; }
        .picker button:hover:not(:disabled) { filter: brightness(.96); }
        .picker :is(button, input):focus-visible, .panel input:focus-visible {
          outline: 2px solid #059669; outline-offset: 2px; }
        .picker-list { border: 1px solid #e5e7eb; border-radius: 10px; padding: 8px; flex-shrink: 1; }
        .picker-row { padding: 8px; margin-bottom: 8px; border: 1px solid #e5e7eb; border-radius: 6px; }
        .picker-row:last-child { margin-bottom: 0; }
        .picker-row input { width: 16px; height: 16px; flex-shrink: 0; margin-top: 3px; }
        .picker-row[data-selected="true"] { background: #d1fae5; border-color: #059669;
          box-shadow: inset 3px 0 0 #059669; }
        .picker-row:focus-within { outline: 2px solid #059669; outline-offset: -2px; }
        @media (max-width: 520px) { .picker { padding: 16px; } }
    `;

    const toast = document.createElement("div");
    toast.className = "toast";

    const panel = document.createElement("div");
    panel.className = "panel";
    panel.hidden = true;

    const panelHeading = document.createElement("p");
    panelHeading.className = "panel-heading";
    panelHeading.textContent = "导出配置选项";

    function createOption({ label, description, checked, onChange }) {
      const option = document.createElement("label");
      option.className = "option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = checked;
      input.addEventListener("change", () => onChange(input.checked));
      const copy = document.createElement("span");
      copy.className = "option-copy";
      const l = document.createElement("span");
      l.className = "option-label";
      l.textContent = label;
      const d = document.createElement("span");
      d.className = "option-description";
      d.textContent = description;
      copy.append(l, d);
      option.append(input, copy);
      return option;
    }

    panel.append(
      panelHeading,
      createOption({
        label: "大纲与目录",
        description: "生成按问答分支跳转的 Outline 索引",
        checked: preferences.includeOutline,
        onChange: (v) => {
          preferences.includeOutline = v;
          writeBooleanPreference(PREFERENCE_KEYS.includeOutline, v);
        },
      }),
      createOption({
        label: "完整元数据",
        description: "包含 Turn ID、时间戳与校验指纹",
        checked: preferences.includeMetadata,
        onChange: (v) => {
          preferences.includeMetadata = v;
          writeBooleanPreference(PREFERENCE_KEYS.includeMetadata, v);
        },
      })
    );

    const control = dock.menu;
    panel.append(createOption({
      label: "尝试下载图片（ZIP）",
      description: "默认关闭；识别到的图片保存到 ZIP，失败写入报告。文件附件尚未适配。",
      checked: preferences.downloadImages,
      onChange: (value) => {
        preferences.downloadImages = value;
        writeBooleanPreference(PREFERENCE_KEYS.downloadImages, value);
      },
    }));
    control.className = "control dock-menu";

    // Build labels without HTML parsing so Trusted Types cannot block startup.
    function appendButtonLabel(button, iconText, labelText) {
      const icon = document.createElement("span");
      icon.textContent = iconText;
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = labelText;
      button.append(icon, label);
    }

    // 按钮 1：导出当前会话 (.md)
    const exportCurrentBtn = document.createElement("button");
    exportCurrentBtn.className = "btn";
    appendButtonLabel(exportCurrentBtn, "📄", "当前会话 (.md)");

    // 按钮 2：批量全量导出 (.zip)
    const exportBatchBtn = document.createElement("button");
    exportBatchBtn.className = "btn";
    appendButtonLabel(exportBatchBtn, "📦", "批量导出 (ZIP)");

    const selectBtn = document.createElement("button");
    selectBtn.className = "btn";
    selectBtn.textContent = "☑ 选择会话";

    // 按钮 3：菜单设置
    const menuBtn = document.createElement("button");
    menuBtn.className = "btn menu-button";
    menuBtn.textContent = "导出设置";
    menuBtn.setAttribute("aria-expanded", "false");

    control.append(exportCurrentBtn, exportBatchBtn, selectBtn, menuBtn);
    stack.prepend(toast, panel);
    dock.onClose = () => { panel.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); };
    shadow.append(style, dock.style);

    let busy = false;
    function setBusy(value) {
      busy = value;
      dock.text.textContent = value ? "导出中" : "导出";
      dock.launcher.setAttribute("aria-label", value ? "正在导出，点击查看菜单" : "导出");
      for (const button of [exportCurrentBtn, exportBatchBtn, selectBtn]) button.disabled = value;
    }

    function chooseConversations(scan) {
      return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "picker-overlay";
        const dialog = document.createElement("section");
        dialog.className = "picker";
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        dialog.setAttribute("aria-label", "选择要导出的会话");
        const heading = document.createElement("h2");
        heading.textContent = "选择要导出的会话";
        const note = document.createElement("p");
        note.className = "picker-note";
        note.textContent = scan.warnings.join(" ") || "日期按会话列表提供的时间筛选；时间未知的会话不参与日期筛选。";
        const search = document.createElement("input");
        search.type = "search";
        search.placeholder = "搜索标题或 ID";
        search.setAttribute("aria-label", "搜索标题或 ID");
        const dates = document.createElement("div");
        dates.className = "picker-tools";
        const start = document.createElement("input");
        start.type = "date";
        start.setAttribute("aria-label", "开始日期");
        const end = document.createElement("input");
        end.type = "date";
        end.setAttribute("aria-label", "结束日期");
        const dateLabel = (text, input) => {
          const label = document.createElement("label");
          label.textContent = text;
          label.append(input);
          return label;
        };
        dates.append(dateLabel("从 ", start), dateLabel("至 ", end));
        const status = document.createElement("p");
        status.setAttribute("aria-live", "polite");
        const list = document.createElement("div");
        list.className = "picker-list";
        const actions = document.createElement("div");
        actions.className = "picker-tools";
        const button = (text, onClick) => {
          const element = document.createElement("button");
          element.type = "button";
          element.textContent = text;
          element.addEventListener("click", onClick);
          return element;
        };
        const selected = new Set();
        let filtered = scan.conversations;
        let visible = 100;
        let filterError = "";
        const finish = (value) => { overlay.remove(); dock.launcher.focus(); resolve(value); };
        const exportSelection = button("导出选中 (0)", () => {
          if (!selected.size || filterError) return;
          finish(scan.conversations.filter((item) => selected.has(item.id)));
        });
        exportSelection.className = "primary";
        const updateStatus = () => {
          status.textContent = filterError || `共 ${scan.conversations.length} 个，匹配 ${filtered.length} 个，已选择 ${selected.size} 个（含筛选外选择）。`;
          exportSelection.textContent = `导出选中 (${selected.size})`;
          exportSelection.disabled = !selected.size || Boolean(filterError);
        };
        const render = () => {
          list.replaceChildren();
          updateStatus();
          for (const item of filtered.slice(0, visible)) {
            const row = document.createElement("label");
            row.className = "picker-row";
            const check = document.createElement("input");
            check.type = "checkbox";
            check.checked = selected.has(item.id);
            row.dataset.selected = String(check.checked);
            check.addEventListener("change", () => {
              if (check.checked) selected.add(item.id); else selected.delete(item.id);
              row.dataset.selected = String(check.checked);
              updateStatus();
            });
            const text = document.createElement("span");
            text.textContent = `${item.title} · ${item.listedAt ? new Date(item.listedAt).toLocaleString() : "时间未知"} · ${item.id}`;
            row.append(check, text);
            list.append(row);
          }
          if (visible < filtered.length) list.append(button("加载更多", () => { visible += 100; render(); }));
        };
        const applyFilters = () => {
          try {
            filtered = Core.filterConversationEntries(scan.conversations, {
              query: search.value, startDate: start.value, endDate: end.value,
            });
            filterError = "";
          } catch (error) { filtered = []; filterError = error.message; }
          visible = 100;
          render();
        };
        search.addEventListener("input", applyFilters);
        start.addEventListener("change", applyFilters);
        end.addEventListener("change", applyFilters);
        dates.append(button("清除日期", () => { start.value = ""; end.value = ""; applyFilters(); }));
        actions.append(
          button("全选匹配", () => { filtered.forEach((item) => selected.add(item.id)); render(); }),
          button("清空选择", () => { selected.clear(); render(); }),
          button("取消", () => finish(null)), exportSelection,
        );
        dialog.append(heading, note, search, dates, status, list, actions);
        overlay.append(dialog);
        shadow.append(overlay);
        overlay.addEventListener("keydown", (event) => {
          if (event.key === "Escape") { event.preventDefault(); finish(null); }
          if (event.key === "Tab") {
            const focusable = [...dialog.querySelectorAll("input, button")].filter((el) => !el.disabled);
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && shadow.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && shadow.activeElement === last) { event.preventDefault(); first.focus(); }
          }
        });
        render();
        search.focus();
      });
    }

    let toastTimer = null;
    function showToast(message, kind = "success", duration = 8000) {
      clearTimeout(toastTimer);
      toast.textContent = message;
      toast.dataset.kind = kind;
      toast.style.display = "block";
      toastTimer = setTimeout(() => {
        toast.style.display = "none";
      }, duration);
    }

    // --- 导出当前会话 ---
    async function handleExportCurrent() {
      if (busy) return;
      const conversationId = Core.conversationIdFromPath(location.pathname);
      if (!conversationId) {
        showToast("请先在左侧点开任意一个具体对话后再导出。", "error");
        return;
      }

      setBusy(true);
      const label = exportCurrentBtn.querySelector(".label");
      label.textContent = "正在导出...";

      try {
        const context = captureExportContext();
        const exportPreferences = { ...preferences };
        const history = await Core.collectHistoryPages((cursor) =>
          fetchHistoryPage(conversationId, cursor, context)
        );
        const turns = Core.historyToChronologicalTurns(history.rawTurnsNewestFirst);
        const diagnostics = Core.validateConversation(turns);
        const title = context.title;
        const exportedAt = new Date().toISOString();
        const markdown = Core.renderMarkdown({
          title,
          sourceUrl: context.href,
          conversationId,
          exportedAt,
          turns,
          diagnostics,
          includeMetadata: exportPreferences.includeMetadata,
          includeOutline: exportPreferences.includeOutline,
        });
        const filename = Core.safeFilename(title);

        const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
        downloadFile(blob, filename);
        showToast(`✅ 导出成功！共 ${turns.length} 轮对话。`);
      } catch (err) {
        console.error(err);
        showToast(`导出失败: ${err.message}`, "error");
      } finally {
        setBusy(false);
        label.textContent = "当前会话 (.md)";
      }
    }

    // --- 批量导出所有会话 ---
    async function handleExportBatch(selectMode = false) {
      if (busy) return;
      if (typeof JSZip === "undefined") {
        showToast("JSZip 库未成功加载，请检查网络或刷新页面。", "error");
        return;
      }

      setBusy(true);
      const label = exportBatchBtn.querySelector(".label");

      try {
        const context = captureExportContext();
        const exportPreferences = { ...preferences };
        label.textContent = "🔍 扫描会话列表中...";
        const scan = await collectAllConversationIds((msg) => {
          label.textContent = msg;
        }, context);
        let { conversations } = scan;

        if (conversations.length === 0) {
          throw new Error(scan.warnings[0] || "未能找到任何会话，请确保已登录并展开左侧历史记录。");
        }

        if (selectMode) {
          conversations = await chooseConversations(scan);
          if (!conversations?.length) return;
        }

        const zip = new JSZip();
        const total = conversations.length;
        let successCount = 0;
        let jsonCount = 0;
        const results = [];

        for (let i = 0; i < total; i++) {
          const item = conversations[i];
          label.textContent = `📥 (${i + 1}/${total}) ${item.title.slice(0, 8)}...`;

          let jsonFilename = null;
          try {
            const history = await Core.collectHistoryPages((cursor) =>
              fetchHistoryPage(item.id, cursor, context)
            );
            const sourceUrl = new URL(Core.accountScopedPath(context.pathname,
              `/app/${item.id.replace(/^c_/, "")}`), context.origin).href;
            const baseName = `${Core.safeFilename(item.title).replace(/\.md$/, "")}_${item.id}`;
            jsonFilename = `${baseName}.json`;
            zip.file(jsonFilename, JSON.stringify({
              schemaVersion: 1, platform: "gemini", conversationId: item.id,
              title: item.title, sourceUrl, exportedAt: new Date().toISOString(),
              historyPages: history.pages,
            }, null, 2));
            jsonCount++;
            const turns = Core.historyToChronologicalTurns(
              history.rawTurnsNewestFirst
            );
            const diagnostics = Core.validateConversation(turns);
            const exportedAt = new Date().toISOString();
            let markdown = Core.renderMarkdown({
              title: item.title,
              sourceUrl,
              conversationId: item.id,
              exportedAt,
              turns,
              diagnostics,
              includeMetadata: exportPreferences.includeMetadata,
              includeOutline: exportPreferences.includeOutline,
            });

            const images = await exportImages(zip, history.rawTurnsNewestFirst, item.id, exportPreferences.downloadImages);
            const downloaded = images.filter((image) => image.status === "downloaded");
            if (downloaded.length) {
              markdown += "\n## 图片资源\n\n" + downloaded.map((image) =>
                `![${Core.safeFilename(image.name).replace(/[\[\]\\]/g, "").replace(/\.md$/, "")}](${image.filename})`).join("\n\n") + "\n";
            }
            const safeFileName = `${baseName}.md`;
            zip.file(safeFileName, markdown);
            successCount++;
            results.push({ ...item, status: "exported", filename: safeFileName,
              jsonFilename, turns: turns.length, diagnostics, images });
          } catch (itemErr) {
            console.warn(`[Gemini Exporter] 会话 ${item.id} 导出失败:`, itemErr);
            results.push({ ...item, status: jsonFilename ? "json-only" : "failed", jsonFilename, error: itemErr.message });
          }

          // 防频控抖动延时 (类似 ChatGPT 导出的 Jitter)
          await sleep(500 + Math.random() * 300);
        }

        const failedImages = results.flatMap((result) => result.images || []).filter((image) => image.status === "failed").length;
        const complete = scan.listTraversalCompleted && successCount === total && failedImages === 0;
        zip.file("export-report.json", JSON.stringify({
          exportedAt: new Date().toISOString(),
          listTraversalCompleted: scan.listTraversalCompleted,
          exportMode: selectMode ? "selected" : "discovered",
          discovered: scan.conversations.length, requested: total,
          exported: successCount, jsonSaved: jsonCount, failed: total - successCount, failedImages,
          warnings: scan.warnings,
          scope: "原始历史 JSON 与经校验的 Markdown；可选下载已识别图片。文件附件及完整分支恢复未适配。",
          conversations: results,
        }, null, 2));
        label.textContent = "📦 正在压缩生成 ZIP...";
        const blob = await zip.generateAsync({
          type: "blob",
          compression: "DEFLATE",
        });
        const dateStr = new Date().toISOString().slice(0, 10);
        downloadFile(blob, `gemini_${complete ? "export" : "partial_export"}_${selectMode ? "selected_" : ""}${dateStr}.zip`);
        showToast(complete
          ? `✅ 已导出${selectMode ? "选中的" : "扫描到的"} ${successCount} 篇会话（JSON＋Markdown）。`
          : `⚠️ 导出不完整：Markdown ${successCount}/${total}，JSON ${jsonCount}，图片失败 ${failedImages}；详见 export-report.json。`,
          complete ? "success" : "error", 15000);
        label.textContent = complete ? "✅ 完成" : "⚠️ 部分完成";
      } catch (err) {
        console.error(err);
        showToast(`批量导出失败: ${err.message}`, "error");
        label.textContent = "⚠️ 出错";
      } finally {
        setBusy(false);
        label.textContent = "批量导出 (ZIP)";
      }
    }

    exportCurrentBtn.addEventListener("click", () => { dock.setExpanded(false); handleExportCurrent(); });
    exportBatchBtn.addEventListener("click", () => { dock.setExpanded(false); handleExportBatch(false); });
    selectBtn.addEventListener("click", () => { dock.setExpanded(false); handleExportBatch(true); });
    menuBtn.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      menuBtn.setAttribute("aria-expanded", String(!panel.hidden));
    });

    return { host, exportCurrentBtn };
  }

  const ui = createUi();
  document.documentElement.append(ui.host);

  // 保证按钮在所有 Gemini 页面可见，如果不在具体会话中则禁用“单篇”
  function syncRoute() {
    if (!ui.host.isConnected) document.documentElement.append(ui.host);
    ui.exportCurrentBtn.style.opacity = isConversationPage() ? "1" : "0.5";
    ui.exportCurrentBtn.title = isConversationPage()
      ? "导出当前打开的会话"
      : "请在左侧打开具体会话后导出";
  }

  syncRoute();
  setInterval(syncRoute, 1000);
})();
