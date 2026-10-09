const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, filename)
const originalFetch = global.fetch
afterEach(() => { global.fetch = originalFetch })
const credentials = { siteUrl: 'https://example.test/', auth: { kind: 'one-api-token', userId: 1, accessToken: 'test' } }
const adapter = () => new (require('../adapters/OneApiAdapter.ts').OneApiAdapter)()
const range = { start: 100, end: 200 }

test('admin revenue uses aggregate consumption stats with token authentication and no user filter', async () => {
  global.fetch = async (url, init) => {
    assert.equal(init.credentials, 'omit')
    assert.equal(init.headers.Authorization, 'Bearer test')
    const parsed = new URL(url)
    if (parsed.pathname === '/api/user/self') return Response.json({ success: true, data: { role: 10 } })
    assert.equal(parsed.pathname, '/api/log/stat')
    assert.equal(parsed.searchParams.get('type'), '2')
    assert.equal(parsed.searchParams.get('start_timestamp'), '100')
    assert.equal(parsed.searchParams.get('end_timestamp'), '200')
    assert.equal(parsed.searchParams.has('username'), false)
    return Response.json({ success: true, data: { quota: 1500000, rpm: 5, tpm: 10 } })
  }
  assert.equal(await adapter().checkRevenueAccess(credentials), 10)
  assert.equal((await adapter().getSiteRevenue(credentials, range)).rawQuota, 1500000)
})

test('ordinary users and unknown roles cannot fetch admin stats', async () => {
  for (const role of [1, undefined, '10']) {
    global.fetch = async url => {
      assert.equal(new URL(url).pathname, '/api/user/self')
      return Response.json({ success: true, data: { role } })
    }
    await assert.rejects(adapter().getSiteRevenue(credentials, range), /管理员|权限/)
  }
})

test('root users are supported; valid zero differs from denied or malformed revenue', async () => {
  for (const stats of [{ quota: 0 }, {}, { quota: '500000' }, { quota: -1 }, null]) {
    global.fetch = async url => Response.json({ success: true, data:
      new URL(url).pathname === '/api/user/self' ? { role: 100 } : stats })
    if (stats?.quota === 0) assert.equal((await adapter().getSiteRevenue(credentials, range)).rawQuota, 0)
    else await assert.rejects(adapter().getSiteRevenue(credentials, range), /营收/)
  }
  global.fetch = async url => new URL(url).pathname === '/api/user/self'
    ? Response.json({ success: true, data: { role: 10 } })
    : new Response('', { status: 403 })
  await assert.rejects(adapter().getSiteRevenue(credentials, range), /403/)
})

test('revenue refresh failures are separate from personal usage and unsupported sites are rejected', async () => {
  const { fetchRevenueSnapshot } = require('../services/siteRevenue.ts')
  const result = await fetchRevenueSnapshot({ getSiteRevenue: async () => { throw new Error('HTTP 403') } }, credentials, range)
  assert.match(result.error, /403/)
  assert.equal(result.rawQuota, undefined)
  assert.match((await fetchRevenueSnapshot({}, credentials, range)).error, /不支持/)
})

test('revenue totals count a site once, prefer its latest snapshot, and preserve personal totals', () => {
  const { getRevenueSites, calculateRevenueSummary } = require('../utils/siteRevenue.ts')
  const personal = { balance: { USD: 10, CNY: 72 }, todayConsumption: { USD: 1, CNY: 7.2 } }
  const sites = [
    { ...personal, id: 'a', baseUrl: 'https://example.test/', revenueEnabled: true, revenueUpdatedAt: 10, todayRevenue: { USD: 5, CNY: 30 } },
    { ...personal, id: 'b', baseUrl: 'https://example.test', revenueEnabled: true, revenueUpdatedAt: 20, todayRevenue: { USD: 6, CNY: 36 } },
    { ...personal, id: 'c', baseUrl: 'https://other.test', revenueEnabled: true, revenueError: '403' },
    { ...personal, id: 'd', baseUrl: 'https://personal.test' }
  ]
  assert.deepEqual(getRevenueSites(sites).map(s => s.id), ['b', 'c'])
  assert.deepEqual(calculateRevenueSummary(sites), { total: { USD: 6, CNY: 36 }, successful: 1, failed: 1 })
  assert.equal(sites[1].todayConsumption.USD, 1)
})

test('revenue-enabled sites are excluded from personal balance and consumption totals', () => {
  const { calculateTotalConsumption, calculateTotalBalance, calculateConsumptionBreakdown } = require('../utils/formatters.ts')
  const sites = [
    { revenueEnabled: true, balance: { USD: 100, CNY: 720 }, todayConsumption: { USD: 10, CNY: 72 }, subscription: undefined },
    { revenueEnabled: false, balance: { USD: 4, CNY: 28.8 }, todayConsumption: { USD: 1, CNY: 7.2 }, subscription: undefined }
  ]
  assert.deepEqual(calculateTotalBalance(sites), { USD: 4, CNY: 28.8 })
  assert.deepEqual(calculateTotalConsumption(sites), { USD: 1, CNY: 7.2 })
  assert.deepEqual(calculateConsumptionBreakdown(sites), {
    subscription: { USD: 0, CNY: 0 }, payAsYouGo: { USD: 1, CNY: 7.2 }
  })
})

test('yesterday revenue is not presented as today; revenue and subscription tabs keep independent identities', () => {
  const { getDisplayRevenue, getBalanceTabs } = require('../utils/siteRevenue.ts')
  assert.equal(getDisplayRevenue({ revenue_enabled: true, revenue: { date: '2000-01-01', rawQuota: 500000 } }, 500000).todayRevenue, undefined)
  assert.deepEqual(getBalanceTabs(true, true), ['consumption', 'balance', 'revenue', 'subscription'])
  assert.deepEqual(getBalanceTabs(false, true), ['consumption', 'balance', 'subscription'])
})

test('save, edit and both refresh paths persist independent revenue and reject unauthorized configuration', async () => {
  const Module = require('node:module')
  const originalLoad = Module._load
  const db = new Map()
  Module._load = function(name, ...args) {
    if (name === '@plasmohq/storage') return { Storage: class {
      async get(k) { return db.get(k) }
      async set(k, v) { db.set(k, v) }
    } }
    return originalLoad.call(this, name, ...args)
  }
  let role = 10, revenue = 1500000, denied = false, revenueRequests = 0
  global.fetch = async url => {
    const parsed = new URL(url)
    let data
    if (parsed.pathname === '/api/user/self') data = { id: 1, username: 'admin', quota: 5000000, role }
    else if (parsed.pathname === '/api/log/self') data = { items: [{ quota: 500000, prompt_tokens: 20, completion_tokens: 10 }], total: 1 }
    else if (parsed.pathname === '/api/log/stat') {
      revenueRequests++
      if (denied) return new Response('', { status: 403 })
      data = { quota: revenue }
    } else throw new Error(`Unexpected URL ${url}`)
    return Response.json({ success: true, data })
  }
  try {
    const { AccountManager } = require('../services/AccountManager.ts')
    const { accountStorage: storage } = require('../services/accountStorage.ts')
    const manager = AccountManager.getInstance()
    const params = { siteType: 'new-api', url: 'https://example.test', siteName: 'My site', username: 'admin',
      accessToken: 'test', userId: '1', exchangeRate: '7.2', revenueEnabled: true, revenueExchangeRate: '6' }
    role = 1
    assert.equal((await manager.validateAndSaveAccount(params)).success, false)
    assert.equal((await storage.getAllAccounts()).length, 0)
    role = 10
    assert.equal((await manager.validateAndSaveAccount({ ...params, revenueExchangeRate: '0' })).success, false)
    const saved = await manager.validateAndSaveAccount(params)
    assert.equal(saved.success, true)
    let account = await storage.getAccountById(saved.accountId)
    assert.equal(account.revenue_enabled, true)
    assert.equal(account.revenue.rawQuota, revenue)
    let display = storage.convertToDisplayData([account])[0]
    assert.deepEqual(display.todayRevenue, { USD: 3, CNY: 18 })
    assert.deepEqual(display.todayConsumption, { USD: 1, CNY: 7.2 })
    for (const refresh of [() => storage.refreshAccount(saved.accountId), () => manager.refreshAccount(saved.accountId)]) {
      revenue += 500000
      assert.equal(await refresh(), true)
      assert.equal((await storage.getAccountById(saved.accountId)).revenue.rawQuota, revenue)
      denied = true
      assert.equal(await refresh(), false)
      account = await storage.getAccountById(saved.accountId)
      assert.equal(account.account_info.today_quota_consumption, 500000)
      display = storage.convertToDisplayData([account])[0]
      assert.equal(display.todayRevenue, undefined)
      assert.match(display.revenueError, /403/)
      denied = false
    }
    role = 1
    const count = revenueRequests
    assert.equal((await manager.validateAndUpdateAccount(saved.accountId, { ...params, revenueEnabled: false })).success, true)
    account = await storage.getAccountById(saved.accountId)
    assert.equal(account.revenue_enabled, false)
    assert.equal(account.revenue, null)
    assert.equal(revenueRequests, count)
    role = 10
    denied = true
    assert.equal((await manager.validateAndUpdateAccount(saved.accountId, params)).success, false)
    assert.equal((await storage.getAccountById(saved.accountId)).revenue_enabled, false)
    denied = false
    assert.equal((await manager.validateAndUpdateAccount(saved.accountId, params)).success, true)
    role = 1
    assert.equal(await storage.refreshAccount(saved.accountId), false)
    assert.match((await storage.getAccountById(saved.accountId)).revenue.error, /管理员/)
    role = 10
    const okFetch = global.fetch
    for (const refresh of [() => storage.refreshAccount(saved.accountId), () => manager.refreshAccount(saved.accountId)]) {
      global.fetch = okFetch
      assert.equal(await refresh(), true)
      global.fetch = async () => new Response('', { status: 401 })
      assert.equal(await refresh(), false)
      assert.equal(storage.convertToDisplayData([await storage.getAccountById(saved.accountId)])[0].todayRevenue, undefined)
    }
  } finally { Module._load = originalLoad }
})
