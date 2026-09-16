const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, filename)
const originalFetch = global.fetch
const originalChrome = global.chrome
afterEach(() => { global.fetch = originalFetch; global.chrome = originalChrome })
const credentials = { siteUrl: 'https://example.test', auth: { kind: 'cookie' }, adapterConfig: { username: 'haha' } }
const quota = { userName: 'haha', userIsEnabled: true, keyIsEnabled: true,
  userLimitTotalUsd: 5551.39, userCurrentTotalUsd: 3858.78, userCurrentDailyUsd: 70.57,
  keyLimitTotalUsd: null, keyCurrentTotalUsd: 0.67 }
const adapter = () => new (require('../adapters/ClaudeCodeHubAdapter.ts').ClaudeCodeHubAdapter)()

test('detects Claude Code Hub using its public API contract', async () => {
  global.fetch = async () => Response.json({ info: { title: 'Claude Code Hub API' }, paths: {
    '/api/actions/my-usage/getMyQuota': { post: {} }
  } })
  assert.equal((await adapter().getSiteStatus(credentials.siteUrl)).detected, true)
  global.fetch = async () => Response.json({ info: { title: 'Other API' }, paths: {} })
  assert.equal(await adapter().getSiteStatus(credentials.siteUrl), null)
})

test('automatically reads username using browser session without extracting tokens', async () => {
  global.fetch = async (url, init) => {
    assert.ok(url.endsWith('/api/actions/my-usage/getMyQuota'))
    assert.equal(init.method, 'POST')
    assert.equal(init.body, '{}')
    assert.equal(init.credentials, 'include')
    return Response.json({ ok: true, data: quota })
  }
  const result = await adapter().autoDetectAccount(credentials.siteUrl)
  assert.equal(result.success, true)
  assert.equal(result.data.username, 'haha')
  assert.equal(result.data.accessToken, '')
  assert.equal(result.data.exchangeRate, null)
  const balance = await adapter().getAccountBalance(credentials)
  assert.ok(Math.abs(balance.rawBalance - 1692.61) < 1e-9)
  assert.equal(balance.conversionFactor, 1)
})

test('uses page context when extension cookies cannot authenticate', async () => {
  global.fetch = async () => new Response('', { status: 401 })
  global.chrome = { runtime: { sendMessage: async request => {
    assert.equal(request.action, 'readClaudeCodeHubQuota')
    return { success: true, data: { ok: true, data: quota } }
  } } }
  assert.equal((await adapter().autoDetectAccount(credentials.siteUrl)).success, true)
})

test('missing background response reports extension reload instead of blaming website login', async () => {
  global.fetch = async () => new Response('', { status: 401 })
  global.chrome = { runtime: { sendMessage: async () => undefined } }
  const result = await adapter().autoDetectAccount(credentials.siteUrl)
  assert.equal(result.success, false)
  assert.match(result.error, /后台.*重新加载/)
  assert.doesNotMatch(result.error, /请先登录/)
})

test('page authentication errors retain their actual reason', async () => {
  global.fetch = async () => new Response('', { status: 401 })
  global.chrome = { runtime: { sendMessage: async () => ({ success: false, error: 'HTTP 401: site login expired' }) } }
  assert.match((await adapter().autoDetectAccount(credentials.siteUrl)).error, /HTTP 401: site login expired/)
})

test('rejects unlimited, malformed, disabled and changed accounts instead of inventing balances', async () => {
  for (const change of [{ userLimitTotalUsd: null }, { userCurrentTotalUsd: 'broken' },
    { userName: 'another' }, { userIsEnabled: false }]) {
    global.fetch = async () => Response.json({ ok: true, data: { ...quota, ...change } })
    await assert.rejects(adapter().getAccountBalance(credentials))
  }
})

test('preserves an overdrawn balance', async () => {
  global.fetch = async () => Response.json({ ok: true, data: { ...quota, userLimitTotalUsd: 1, userCurrentTotalUsd: 2 } })
  assert.equal((await adapter().getAccountBalance(credentials)).rawBalance, -1)
})

test('daily consumption uses user daily usage and rejects missing data', async () => {
  global.fetch = async () => Response.json({ ok: true, data: { ...quota, keyCurrentDailyUsd: 0.1 } })
  assert.equal((await adapter().getUsageStats(credentials)).rawConsumption, 70.57)
  global.fetch = async () => Response.json({ ok: true, data: { ...quota, userCurrentDailyUsd: 0 } })
  assert.equal((await adapter().getUsageStats(credentials)).rawConsumption, 0)
  global.fetch = async () => Response.json({ ok: true, data: { ...quota, userCurrentDailyUsd: null } })
  await assert.rejects(adapter().getUsageStats(credentials), /日额度/)
})

test('saves without tokens, refreshes through both entry points and applies recharge ratio once', async () => {
  const Module = require('node:module')
  const originalLoad = Module._load
  const db = new Map()
  Module._load = function(name, ...args) {
    if (name === '@plasmohq/storage') return { Storage: class {
      async get(key) { return structuredClone(db.get(key)) }
      async set(key, value) { db.set(key, structuredClone(value)) }
    } }
    return originalLoad.call(this, name, ...args)
  }
  let manager, storage
  try {
    manager = require('../services/AccountManager.ts').AccountManager.getInstance()
    storage = require('../services/accountStorage.ts').accountStorage
  } finally { Module._load = originalLoad }
  global.fetch = async url => {
    if (url.endsWith('/api/actions/openapi.json')) return Response.json({ info: { title: 'Claude Code Hub API' }, paths: {
      '/api/actions/my-usage/getMyQuota': { post: {} }
    } })
    if (url.endsWith('/api/actions/my-usage/getMyQuota')) return Response.json({ ok: true, data: quota })
    return new Response('', { status: 404 })
  }
  const detected = await manager.autoDetectAccount(credentials.siteUrl, 'auto')
  assert.equal(detected.data.siteType, 'claude-code-hub')
  const saved = await manager.validateAndSaveAccount({ siteType: detected.data.siteType,
    url: credentials.siteUrl, siteName: 'Clouder', username: detected.data.username, exchangeRate: '0.13' })
  assert.equal(saved.success, true, saved.error)
  assert.equal(await manager.refreshAccount(saved.accountId), true)
  assert.equal(await storage.refreshAccount(saved.accountId), true)
  const account = await storage.getAccountById(saved.accountId)
  assert.equal(account.account_info.api_key, undefined)
  const [display] = storage.convertToDisplayData([account])
  assert.equal(display.balance.USD, 1692.61)
  assert.equal(display.balance.CNY, 220.04)
  assert.equal(display.todayConsumption.USD, 70.57)
  assert.equal(display.todayConsumption.CNY, 9.17)
})

test('injected quota reader is self-contained, read-only and rejects cross-origin redirects', async () => {
  const { readClaudeCodeHubQuotaInPage } = require('../services/claudeCodeHubSession.ts')
  const read = (0, eval)(`(${readClaudeCodeHubQuotaInPage.toString()})`)
  const originalLocation = global.location
  try {
    global.location = { origin: credentials.siteUrl }
    global.fetch = async (url, init) => {
      assert.equal(url, credentials.siteUrl + '/api/actions/my-usage/getMyQuota')
      assert.equal(init.method, 'POST')
      assert.equal(init.redirect, 'error')
      assert.equal(init.body, '{}')
      return Response.json({ ok: true, data: quota })
    }
    assert.equal((await read(credentials.siteUrl)).success, true)
    global.location = { origin: 'https://another.test' }
    assert.equal((await read(credentials.siteUrl)).success, false)
  } finally { global.location = originalLocation }
})

test('403 falls back to the authenticated quota page and reads user totals, not key totals', async () => {
  const { readClaudeCodeHubQuotaInPage } = require('../services/claudeCodeHubSession.ts')
  const read = (0, eval)(`(${readClaudeCodeHubQuotaInPage.toString()})`)
  const previousLocation = global.location
  const previousParser = global.DOMParser
  const calls = []
  // DOMParser is a browser boundary; the live site's DOM is verified separately in Chrome.
  const progress = (label, title = '总额度', amount = '') => ({ getAttribute: () => label,
    nextElementSibling: { textContent: amount },
    parentElement: { parentElement: { firstElementChild: { textContent: title } } } })
  global.DOMParser = class { parseFromString() { return {
    querySelectorAll: () => [progress('密钥: $0.67 / $9,999.00'), progress('用户: $3,859.23 / $5,551.39'),
      progress('用户: 不限', '日额度', '$70.57 / '), progress('密钥: 不限', '日额度', '$0.00 / ')],
    querySelector: () => ({ nextElementSibling: { textContent: 'haha' } })
  } } }
  global.location = { origin: credentials.siteUrl }
  global.fetch = async (url, init) => {
    calls.push({ url, method: init.method })
    return calls.length === 1 ? Response.json({ error: 'Forbidden' }, { status: 403 }) : new Response('<html></html>')
  }
  try {
    const result = await read(credentials.siteUrl)
    assert.equal(result.success, true, result.error)
    assert.equal(result.data.data.userName, 'haha')
    assert.equal(result.data.data.userCurrentTotalUsd, 3859.23)
    assert.equal(result.data.data.userLimitTotalUsd, 5551.39)
    assert.equal(result.data.data.userCurrentDailyUsd, 70.57)
    assert.deepEqual(calls, [
      { url: credentials.siteUrl + '/api/actions/my-usage/getMyQuota', method: 'POST' },
      { url: credentials.siteUrl + '/zh-CN/dashboard/my-quota', method: 'GET' }
    ])
    global.DOMParser = class { parseFromString() { return { querySelectorAll: () => [], querySelector: () => null } } }
    calls.length = 0
    assert.equal((await read(credentials.siteUrl)).success, false)
  } finally { global.location = previousLocation; global.DOMParser = previousParser }
})

test('background refresh reads existing site tab without messaging itself and rejects content scripts', async () => {
  const Module = require('node:module')
  const path = require('node:path')
  let listener
  global.chrome = {
    runtime: { id: 'extension', onStartup: { addListener() {} }, onInstalled: { addListener() {} },
      onMessage: { addListener(fn) { listener = fn } }, sendMessage() { assert.fail('cannot message background itself') } },
    tabs: { query: async () => [{ id: 2, url: credentials.siteUrl + '/dashboard' }],
      get: (_id, callback) => callback({ status: 'complete' }) },
    windows: { create: async () => assert.fail('must reuse existing tab'), onRemoved: { addListener() {} } },
    scripting: { executeScript: async ({ args, target }) => {
      assert.deepEqual(args, [credentials.siteUrl])
      assert.equal(target.tabId, 2)
      return [{ result: { success: true, data: { ok: true, data: quota } } }]
    } }
  }
  const filename = path.resolve(__dirname, '../background.ts')
  const background = new Module(filename, module)
  background.filename = filename
  background.paths = module.paths
  background.require = name => name === './services/autoRefreshService'
    ? { autoRefreshService: {}, handleAutoRefreshMessage() {} }
    : require(path.resolve(path.dirname(filename), name + '.ts'))
  require.extensions['.ts'](background, filename)
  const { readClaudeCodeHubQuota } = require('../services/claudeCodeHubSession.ts')
  assert.equal((await readClaudeCodeHubQuota(credentials.siteUrl)).success, true)
  let rejected
  listener({ action: 'readClaudeCodeHubQuota', url: credentials.siteUrl },
    { id: 'extension', tab: { id: 2 }, url: credentials.siteUrl }, result => { rejected = result })
  assert.equal(rejected.success, false)
})
