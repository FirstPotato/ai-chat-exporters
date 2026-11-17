const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
for (const name of ['chatgpt-exporter', 'gemini-exporter']) {
  const file = path.join(root, 'scripts', `${name}.user.js`);
  let source = fs.readFileSync(file, 'utf8');
  if (process.argv.includes('--write-metadata')) {
    source = source.replace(/\r\n/g, '\n').trimEnd() + '\n';
    fs.writeFileSync(file, source);
  }
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const header = source.match(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/);
  assert.ok(header, `Missing metadata: ${name}`);
  for (const key of ['name', 'namespace', 'version', 'match', 'license', 'downloadURL', 'updateURL']) {
    assert.match(header[0], new RegExp(`^// @${key}\\s+\\S+`, 'm'), `${name}: ${key}`);
  }
  const metaFile = file.replace(/\.user\.js$/, '.meta.js');
  const metadata = header[0].replace(/\r\n/g, '\n') + '\n';
  if (process.argv.includes('--write-metadata')) fs.writeFileSync(metaFile, metadata);
  assert.equal(fs.readFileSync(metaFile, 'utf8').replace(/\r\n/g, '\n'), metadata, `Regenerate ${name} metadata with npm run metadata`);
  assert.ok(!source.includes('YOUR_GITHUB'), 'Unresolved publish placeholder');
}
console.log('PASS: both userscripts parse; metadata matches source.');
