const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
const scriptPath = path.join(root, 'scripts/gemini-exporter.user.js');
const source = fs.readFileSync(scriptPath, 'utf8');
const checks = [];
const idA = 'c_1234567811111111';
const idB = 'c_1234567822222222';
const idC = 'c_1234567833333333';
const encode = (rpc, body) => ")]}'\n123\n" + JSON.stringify([['wrb.fr', rpc, JSON.stringify(body)]]);

function boot(fetchImpl, fullUi = false, extras = {}) {
  const elements = [];
  class Element {
    constructor(tag) { this.tag = tag; this.style = {}; this.dataset = {}; this.events = {}; this.children = []; this.disabled = false; this.value = ''; this.attributes = {}; elements.push(this); }
    append(...children) { this.children.push(...children); }
    attachShadow() { return new Element('shadow'); }
    addEventListener(name, fn) { this.events[name] = fn; }
    querySelector(selector) { if (selector === '.label') return this.label ||= { textContent: '' }; return null; }
    click() { return this.events.click?.(); }
    remove() { this.removed = true; }
    replaceChildren(...children) { this.children = children; }
    setAttribute(key, value) { this.attributes[key] = value; }
    focus() {}
  }
  const document = {
    title: 'Sample - Google Gemini',
    documentElement: new Element('html'), body: new Element('body'),
    createElement: tag => new Element(tag), querySelectorAll: () => [],
  };
  document.documentElement.lang = 'zh-CN';
  const archives = [];
  class MockZip {
    constructor() { this.files = {}; archives.push(this); }
    file(name, value) {
      assert.equal(Object.hasOwn(this.files, name), false, 'ZIP entry must not be overwritten');
      this.files[name] = value;
    }
    async generateAsync() { return new Blob(['mock ZIP']); }
  }
  const context = {
    document, console: { warn() {}, error() {} }, URL, URLSearchParams, Blob,
    AbortController, JSZip: MockZip,
    location: { pathname: '/u/2/app/1234567811111111', search: '?pageId=example', origin: 'https://gemini.google.com', href: 'https://gemini.google.com/u/2/app/1234567811111111?pageId=example' },
    WIZ_global_data: { cfb2h: 'test-build', FdrFJe: 'test-session', SNlM0e: 'test-token' },
    fetch: fetchImpl,
    setTimeout: (fn, ms) => { if (ms < 1000) queueMicrotask(fn); return 1; },
    clearTimeout() {}, setInterval() {},
    ...extras,
  };
  vm.createContext(context);
  const exposed = source.replace('  const ui = createUi();',
    '  globalThis.testApi = { parseConversationListPayload, collectAllConversationIds, captureExportContext, fetchHistoryPage, harvestSidebarConversationLinks, exportImages };\n'
    + (fullUi ? '  const ui = createUi();' : '  return;\n  const ui = createUi();'));
  vm.runInContext(exposed, context, { timeout: 1000 });
  return { context, api: context.testApi, elements, archives };
}
const response = text => ({ ok: true, text: async () => text });
const copy = data => JSON.parse(JSON.stringify(data));
function turn(id) {
  const raw = [];
  raw[0] = [id, 'r_test']; raw[1] = [id, null, null];
  raw[2] = [['Question']]; raw[3] = [[['rc_test', ['Answer']]]]; raw[4] = [1700000000, 0];
  return raw;
}

(async () => {
  const basic = boot();
  for (const payload of [[[[idA, 'Title']], null], [null, null, [[idA, 'Title']]]]) {
    assert.deepEqual(copy(basic.api.parseConversationListPayload(payload).items), [{ id: idA, title: 'Title', listedAt: null }]);
  }
  for (const payload of [null, {}, [], [null, null], [[['not-an-id', 'Bad']], null], [[], {}, null]]) {
    assert.throws(() => basic.api.parseConversationListPayload(payload));
  }
  checks.push('Both observed list layouts accepted; unknown schemas and cursors rejected');

  let calls = 0;
  const paged = boot(async (url, options) => {
    const req = JSON.parse(new URLSearchParams(options.body).get('f.req'))[0][0];
    const args = JSON.parse(req[1]);
    assert.equal(args[1], calls === 0 ? null : 'page-two');
    calls++;
    return response(encode('MaZiqc', calls === 1
      ? [null, 'page-two', [[idA, 'A']]]
      : [null, null, [[idA, 'A'], [idB, 'B']]]));
  });
  const scan = await paged.api.collectAllConversationIds(null, paged.api.captureExportContext());
  assert.equal(scan.listTraversalCompleted, true);
  assert.equal(scan.conversations.length, 2);
  assert.equal(calls, 2);
  checks.push('Pagination follows cursors, deduplicates conversations, and records terminal page');

  calls = 0;
  const repeated = boot(async () => { calls++; return response(encode('MaZiqc', [[[idA, 'A']], 'repeat'])); });
  const partial = await repeated.api.collectAllConversationIds(null, repeated.api.captureExportContext());
  assert.equal(calls, 2);
  assert.equal(partial.listTraversalCompleted, false);
  assert.match(partial.warnings[0], /重复/);
  checks.push('Repeated cursor stops after two calls and marks export incomplete');

  const fallback = boot(async () => { throw new Error('offline'); });
  fallback.context.document.querySelectorAll = () => [
    { getAttribute: () => '/u/2/app/1234567811111111', textContent: 'visible' },
    { getAttribute: () => 'https://evil.example/u/2/app/1234567822222222', textContent: 'outside' },
    { getAttribute: () => '/u/1/app/1234567833333333', textContent: 'other account' },
  ];
  const fallbackResult = await fallback.api.collectAllConversationIds(null, fallback.api.captureExportContext());
  assert.equal(fallbackResult.conversations.length, 1);
  assert.equal(fallbackResult.listTraversalCompleted, false);
  assert.match(fallbackResult.warnings[0], /offline/);
  checks.push('Sidebar fallback stays partial and excludes external and other-account links');

  let requested;
  const scoped = boot(async (url, options) => { requested = { url: new URL(url), options }; return response('history'); });
  const captured = scoped.api.captureExportContext();
  scoped.context.location.pathname = '/u/3/app/1234567822222222';
  await scoped.api.fetchHistoryPage(idA, null, captured);
  assert.equal(requested.url.pathname, '/u/2/_/BardChatUi/data/batchexecute');
  assert.equal(requested.url.searchParams.get('pageId'), 'example');
  assert.equal(requested.url.searchParams.get('source-path'), captured.pathname);
  checks.push('Requests retain captured account and page context during navigation');

  const endToEnd = boot(async (url, options) => {
    const [rpc, argsText] = JSON.parse(new URLSearchParams(options.body).get('f.req'))[0][0];
    if (rpc === 'MaZiqc') return response(encode(rpc, [null, null, [[idA, 'Same'], [idB, 'Same'], [idC, 'Fail']]]));
    const [id] = JSON.parse(argsText);
    if (id === idC) return { ok: false, status: 503 };
    return response(encode(rpc, [[turn(id)], null]));
  }, true);
  const batch = endToEnd.elements.find(el => el.innerHTML?.includes('批量导出'));
  assert.ok(batch, 'UI created from full userscript');
  await batch.click();
  const archive = endToEnd.archives[0].files;
  assert.ok(archive[`Same_${idA}.md`]);
  assert.ok(archive[`Same_${idB}.md`]);
  assert.match(archive[`Same_${idA}.md`], /https:\/\/gemini.google.com\/u\/2\/app\/1234567811111111/);
  const report = JSON.parse(archive['export-report.json']);
  assert.equal(report.exported, 2); assert.equal(report.failed, 1);
  assert.match(report.conversations[2].error, /503/);
  assert.ok(endToEnd.elements.some(el => el.download?.startsWith('gemini_partial_export_')));
  assert.ok(endToEnd.elements.some(el => el.textContent?.includes('导出不完整')));
  checks.push('Full script creates UI; batch retains colliding short IDs, reports failures, and downloads partial archive');

  const allFailed = boot(async (url, options) => {
    const [rpc] = JSON.parse(new URLSearchParams(options.body).get('f.req'))[0][0];
    return rpc === 'MaZiqc' ? response(encode(rpc, [[[idA, 'A']], null])) : { ok: false, status: 403 };
  }, true);
  await allFailed.elements.find(el => el.innerHTML?.includes('批量导出')).click();
  const failedReport = JSON.parse(allFailed.archives[0].files['export-report.json']);
  assert.equal(failedReport.exported, 0);
  assert.equal(failedReport.failed, 1);
  assert.ok(allFailed.elements.some(el => el.textContent?.includes('导出不完整')));
  checks.push('Zero successful conversations produces a failure report and never a success message');

  const core = basic.context.GeminiWebExporterCore;
  const entries = [
    { id: idA, title: 'Alpha', listedAt: new Date(2026, 10, 17, 23, 59, 59).toISOString() },
    { id: idB, title: 'Beta', listedAt: new Date(2026, 10, 18).toISOString() },
    { id: idC, title: 'Unknown', listedAt: null },
  ];
  assert.equal(core.filterConversationEntries(entries, { query: 'ALPHA' })[0].id, idA);
  assert.equal(core.filterConversationEntries(entries, { startDate: '2026-11-17', endDate: '2026-11-17' }).length, 1);
  assert.equal(core.filterConversationEntries(entries).length, 3);
  assert.throws(() => core.filterConversationEntries(entries, { startDate: '2026-11-18', endDate: '2026-11-17' }));
  checks.push('Search is case insensitive; date range includes full local end day and excludes unknown dates');

  const picker = boot(async (url, options) => {
    const [rpc, argsText] = JSON.parse(new URLSearchParams(options.body).get('f.req'))[0][0];
    if (rpc === 'MaZiqc') return response(encode(rpc, [[[idA, 'Alpha'], [idB, 'Beta']], null]));
    const [id] = JSON.parse(argsText);
    assert.equal(id, idB, 'only selected conversation fetched');
    return response(encode(rpc, [[turn(id)], null]));
  }, true);
  const exportPromise = picker.elements.find(el => el.textContent === '☑ 选择会话').click();
  for (let count = 0; count < 50 && !picker.elements.some(el => el.placeholder === '搜索标题或 ID'); count++) {
    await new Promise(resolve => setImmediate(resolve));
  }
  const search = picker.elements.find(el => el.placeholder === '搜索标题或 ID');
  assert.ok(search, 'picker is visible');
  search.value = 'Beta'; search.events.input();
  await picker.elements.find(el => el.textContent === '全选匹配').click();
  await picker.elements.find(el => el.textContent === '导出选中 (1)').click();
  await exportPromise;
  const selectionReport = JSON.parse(picker.archives[0].files['export-report.json']);
  assert.equal(selectionReport.requested, 1);
  assert.equal(selectionReport.discovered, 2);
  assert.equal(selectionReport.exportMode, 'selected');
  assert.equal(selectionReport.jsonSaved, 1);
  assert.ok(picker.archives[0].files[`Beta_${idB}.json`]);
  assert.ok(!picker.archives[0].files[`Alpha_${idA}.json`]);
  checks.push('Picker filters, selects, and exports only chosen conversation as JSON and Markdown');

  const cancelled = boot(async () => response(encode('MaZiqc', [[[idA, 'A']], null])), true);
  const cancelledPromise = cancelled.elements.find(el => el.textContent === '☑ 选择会话').click();
  for (let count = 0; count < 50 && !cancelled.elements.some(el => el.textContent === '取消'); count++) {
    await new Promise(resolve => setImmediate(resolve));
  }
  await cancelled.elements.find(el => el.textContent === '取消').click();
  await cancelledPromise;
  assert.equal(cancelled.archives.length, 0);
  assert.equal(cancelled.elements.find(el => el.textContent === '☑ 选择会话').disabled, false);
  checks.push('Cancelling picker creates no archive and restores controls');

  const incomplete = boot(async (url, options) => {
    const [rpc] = JSON.parse(new URLSearchParams(options.body).get('f.req'))[0][0];
    const raw = turn(idA); raw[3] = [];
    return response(encode(rpc, rpc === 'MaZiqc' ? [[[idA, 'A']], null] : [[raw], null]));
  }, true);
  await incomplete.elements.find(el => el.innerHTML?.includes('批量导出')).click();
  const incompleteFiles = incomplete.archives[0].files;
  assert.ok(incompleteFiles[`A_${idA}.json`]);
  assert.ok(!incompleteFiles[`A_${idA}.md`]);
  assert.equal(JSON.parse(incompleteFiles['export-report.json']).conversations[0].status, 'json-only');
  checks.push('Raw JSON survives Markdown validation failure and is explicitly reported as JSON only');

  const imageNode = (url) => { const item = []; item[2] = 'image'; item[3] = url; item[11] = 'image/png'; return item; };
  const validImage = imageNode('https://lh3.googleusercontent.com/sample');
  assert.equal(core.collectImageAssets([validImage, validImage, imageNode('https://example.com/file'), imageNode('https://evilgoogleusercontent.com/file')]).length, 1);
  let imageCalls = 0;
  const imageApi = boot(undefined, false, {
    GM_xmlhttpRequest(options) {
      imageCalls++;
      queueMicrotask(() => options.onload({ status: 200, response: new Blob(['image'], { type: 'image/png' }) }));
      return { abort() {} };
    },
  });
  const imageZip = { files: {}, file(name, blob) { this.files[name] = blob; } };
  const disabledImages = await imageApi.api.exportImages(imageZip, [validImage], idA, false);
  assert.equal(imageCalls, 0); assert.equal(disabledImages[0].status, 'not-requested');
  const savedImages = await imageApi.api.exportImages(imageZip, [validImage], idA, true);
  assert.equal(imageCalls, 1); assert.equal(savedImages[0].status, 'downloaded');
  assert.ok(imageZip.files[`images/${idA}_1.png`]);
  const failedImageApi = boot(undefined, false, { GM_xmlhttpRequest(options) {
    queueMicrotask(() => options.onload({ status: 200, response: new Blob(['login'], { type: 'text/html' }) }));
    return { abort() {} };
  } });
  const failedImageResults = await failedImageApi.api.exportImages(imageZip, [validImage], idB, true);
  assert.equal(failedImageResults[0].status, 'failed');
  checks.push('Images restricted to observed CDN schema, deduplicated, opt in, and reject HTML responses');

  fs.mkdirSync(path.join(root, '.local'), { recursive: true });
  fs.writeFileSync(path.join(root, '.local/check-results.json'), JSON.stringify({
    checkedAt: new Date().toISOString(),
    scriptSha256: require('node:crypto').createHash('sha256').update(fs.readFileSync(scriptPath)).digest('hex'),
    passed: checks.length, checks,
    limits: 'Synthetic responses and mock DOM/JSZip only; no live Gemini or Tampermonkey integration checked.',
  }, null, 2));
  console.log(`PASS ${checks.length} checks; mock DOM/API/ZIP, no live account access.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
