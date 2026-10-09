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

test('revenue range presets resolve to inclusive local-day bounds and validate custom input', () => {
  const { resolveRevenueRange } = require('../utils/siteRevenue.ts')
  const now = new Date(2026, 9, 9, 15, 30)
  const sec = (y, m, d, h = 0, mi = 0, s = 0) => Math.floor(new Date(y, m, d, h, mi, s).getTime() / 1000)
  const custom = { start: '', end: '' }
  assert.deepEqual(resolveRevenueRange('today', custom, now).range, { preset: 'today', start: sec(2026, 9, 9), end: sec(2026, 9, 9, 23, 59, 59), text: '2026-10-09' })
  assert.deepEqual(resolveRevenueRange('week', custom, now).range, { preset: 'week', start: sec(2026, 9, 3), end: sec(2026, 9, 9, 23, 59, 59), text: '2026-10-03 ~ 2026-10-09' })
  assert.equal(resolveRevenueRange('month', custom, now).range.start, sec(2026, 9, 1))
  assert.equal(resolveRevenueRange('custom', { start: '2026-09-01', end: '2026-12-31' }, now).range.end, sec(2026, 9, 9, 23, 59, 59))
  for (const [input, message] of [
    [{ start: '', end: '2026-10-01' }, /选择/], [{ start: '2026-02-30', end: '2026-10-01' }, /选择/],
    [{ start: '2026-10-05', end: '2026-10-01' }, /不能晚于结束/], [{ start: '2026-10-10', end: '2026-10-11' }, /不能晚于今天/],
    [{ start: '2025-01-01', end: '2026-10-09' }, /366/]
  ]) assert.match(resolveRevenueRange('custom', input, now).error, message)
})

test('range report totals consumption and difference, and failures are never counted as zero', () => {
  const { buildRangeRevenueView } = require('../utils/siteRevenue.ts')
  const row = (id, usd, cny, error) => ({ id, name: id, baseUrl: `https://${id}.test`, amount: usd === undefined ? undefined : { USD: usd, CNY: cny }, error })
  const view = buildRangeRevenueView({ fetchedAt: 1,
    revenue: [row('a', 10, 60), row('b', undefined, undefined, '403')],
    consumption: [row('c', 2, 14.4), row('d', 1, 7.2), row('e', undefined, undefined, '不支持')] })
  assert.deepEqual(view.revenue, { total: { USD: 10, CNY: 60 }, successful: 1, failed: 1 })
  assert.deepEqual(view.consumption.failed, 1)
  assert.ok(Math.abs(view.consumption.total.CNY - 21.6) < 1e-9)
  assert.equal(view.rows.length, 2)
  const detailed = buildRangeRevenueView({ fetchedAt: 1, revenue: [], consumption: [row('c', 2, 14.4), row('e', undefined, undefined, '不支持')] },
    [{ id: 'c', balance: { USD: 10, CNY: 72 } }])
  assert.deepEqual(detailed.consumption.rows.map(r => [r.id, r.balance?.USD, r.error]), [['c', 10, undefined], ['e', undefined, '不支持']])
})

test('range queries use range stat endpoints for One API and Sub2API; unsupported sites report errors', async () => {
  const { fetchRevenueRangeReport } = require('../services/siteRevenue.ts')
  const seen = []
  global.fetch = async (url, init) => {
    const parsed = new URL(url)
    seen.push(parsed.pathname + '?' + [...parsed.searchParams.keys()].filter(k => k !== 'timezone').sort().join(','))
    if (parsed.pathname === '/api/user/self') return Response.json({ success: true, data: { role: 10 } })
    if (parsed.pathname === '/api/log/stat') return Response.json({ success: true, data: { quota: 1000000 } })
    if (parsed.pathname === '/api/log/self/stat') return Response.json({ success: true, data: { quota: 500000 } })
    throw new Error(`Unexpected ${url}`)
  }
  const account = (id, extra) => ({ id, site_name: id, site_url: `https://${id}.test`, site_type: 'new-api', exchange_rate: 7, updated_at: 1,
    account_info: {}, ...extra })
  const accounts = [
    account('rev', { revenue_enabled: true, revenue_exchange_rate: 6 }),
    account('rev', { revenue_enabled: true, revenue_exchange_rate: 6, id: 'rev2' }),
    account('mine'), account('cube', { site_type: 'cubence' })
  ]
  const report = await fetchRevenueRangeReport(accounts, range, a => ({ siteUrl: a.site_url, auth: { kind: 'one-api-token', userId: 1, accessToken: 't' } }))
  assert.equal(report.revenue.length, 1) // 同 origin 去重
  assert.deepEqual(report.revenue[0].amount, { USD: 2, CNY: 12 })
  assert.deepEqual(report.consumption.find(r => r.id === 'mine').amount, { USD: 1, CNY: 7 })
  assert.match(report.consumption.find(r => r.id === 'cube').error, /暂不支持/)
  assert.ok(seen.includes('/api/log/stat?end_timestamp,start_timestamp,type'))
  assert.ok(seen.includes('/api/log/self/stat?end_timestamp,start_timestamp,type'))

  const sub2api = new (require('../adapters/Sub2ApiAdapter.ts').Sub2ApiAdapter)()
  const sub = { siteUrl: 'https://s.test', auth: { kind: 'api-key', apiKey: 'jwt' } }
  const calls = []
  global.fetch = async (url, init) => {
    const parsed = new URL(url)
    calls.push(parsed.pathname + '?' + parsed.searchParams.get('start_date') + '/' + parsed.searchParams.get('end_date'))
    const data = parsed.pathname === '/api/v1/user/profile' ? { role: 'admin' } : { total_actual_cost: 3.5 }
    return Response.json({ code: 0, data })
  }
  const wide = { start: Math.floor(new Date(2026, 8, 1).getTime() / 1000), end: Math.floor(new Date(2026, 8, 30, 23, 59, 59).getTime() / 1000) }
  assert.equal((await sub2api.getSiteRevenue(sub, wide)).rawQuota, 3.5)
  assert.equal((await sub2api.getRangeUsageStats(sub, wide)).rawConsumption, 3.5)
  assert.ok(calls.includes('/api/v1/admin/usage/stats?2026-09-01/2026-09-30'))
  assert.ok(calls.includes('/api/v1/usage/stats?2026-09-01/2026-09-30'))
})

test('today view lists personal accounts with consumption and balance but not revenue sites', () => {
  const { buildTodayRevenueView } = require('../utils/siteRevenue.ts')
  const site = (id, revenueEnabled) => ({ id, name: id, baseUrl: `https://${id}.test`, revenueEnabled,
    balance: { USD: 10, CNY: 72 }, todayConsumption: { USD: 1, CNY: 7.2 } })
  const view = buildTodayRevenueView([site('mine', false), site('owned', true)], { USD: 1, CNY: 7.2 })
  assert.deepEqual(view.consumption.rows.map(r => [r.id, r.amount.USD, r.balance.CNY]), [['mine', 1, 72]])
})

test('daily ledger keeps the max per day, skips stale or missing values and serializes concurrent writes', async () => {
  const Module = require('node:module')
  const originalLoad = Module._load
  const db = new Map()
  Module._load = function(name, ...args) {
    if (name === '@plasmohq/storage') return { Storage: class {
      async get(k) { await new Promise(r => setTimeout(r, 1)); return db.get(k) }
      async set(k, v) { db.set(k, JSON.parse(JSON.stringify(v))) }
    } }
    return originalLoad.call(this, name, ...args)
  }
  delete require.cache[require.resolve('../services/dailyLedger.ts')]
  try {
    const { recordRefreshToLedger, readLedger, removeAccountFromLedger } = require('../services/dailyLedger.ts')
    const mine = { id: 'mine', site_url: 'https://mine.test' }
    const owned = { id: 'owned', site_url: 'https://owned.test/', revenue_enabled: true }
    await Promise.all([
      recordRefreshToLedger({ account: mine, factor: 500000, date: '2026-10-09', consumptionRaw: 1000000 }),
      recordRefreshToLedger({ account: { ...mine, id: 'other' }, factor: 1, date: '2026-10-09', consumptionRaw: 3 }),
      recordRefreshToLedger({ account: owned, factor: 500000, date: '2026-10-09', revenue: { date: '2026-10-09', rawQuota: 2500000, updatedAt: 1 } })
    ])
    await recordRefreshToLedger({ account: mine, factor: 500000, date: '2026-10-09', consumptionRaw: 500000 }) // lower value ignored
    await recordRefreshToLedger({ account: mine, factor: 500000, date: '2026-10-09', consumptionRaw: null }) // no usage this refresh
    await recordRefreshToLedger({ account: owned, factor: 500000, date: '2026-10-09', revenue: { date: '2026-10-08', rawQuota: 9, updatedAt: 1 } })
    await recordRefreshToLedger({ account: owned, factor: 500000, date: '2026-10-09', revenue: { date: '2026-10-09', error: 'x', updatedAt: 1 } })
    let ledger = await readLedger()
    assert.deepEqual(ledger.personal.mine, { '2026-10-09': 2 })
    assert.deepEqual(ledger.personal.other, { '2026-10-09': 3 })
    assert.deepEqual(ledger.revenue['https://owned.test'], { '2026-10-09': 5 })
    await removeAccountFromLedger('other')
    assert.equal((await readLedger()).personal.other, undefined)
  } finally {
    Module._load = originalLoad
    delete require.cache[require.resolve('../services/dailyLedger.ts')]
  }
})

test('range report fills gaps from the local ledger without double counting or hiding failures', async () => {
  const { fetchRevenueRangeReport } = require('../services/siteRevenue.ts')
  global.fetch = async url => {
    const parsed = new URL(url)
    if (parsed.pathname === '/api/user/self') return Response.json({ success: true, data: { role: 10 } })
    if (parsed.pathname === '/api/log/stat') return Response.json({ success: true, data: { quota: 500000 } }) // $1，被清理后偏小
    if (parsed.pathname === '/api/log/self/stat') {
      return parsed.host === 'big.test' ? Response.json({ success: true, data: { quota: 5000000 } }) : Response.json({ success: true, data: { quota: 500000 } })
    }
    throw new Error(`Unexpected ${url}`)
  }
  const account = (id, extra) => ({ id, site_name: id, site_url: `https://${id}.test`, site_type: 'new-api', exchange_rate: 7, updated_at: 1, account_info: {}, ...extra })
  const accounts = [
    account('rev', { revenue_enabled: true, revenue_exchange_rate: 6 }),
    account('small'), account('big'), account('cube', { site_type: 'cubence' }), account('none', { site_type: 'cubence' })
  ]
  const day = d => `2026-10-0${d}`
  const inRange = { start: Math.floor(new Date(2026, 9, 1).getTime() / 1000), end: Math.floor(new Date(2026, 9, 5, 23, 59, 59).getTime() / 1000) }
  const ledger = {
    revenue: { 'https://rev.test': { [day(1)]: 3, [day(2)]: 2, '2026-09-30': 100 } },
    personal: { small: { [day(2)]: 4, [day(3)]: 1 }, big: { [day(2)]: 1 }, cube: { [day(4)]: 2.5 } }
  }
  const report = await fetchRevenueRangeReport(accounts, inRange, a => ({ siteUrl: a.site_url, auth: { kind: 'one-api-token', userId: 1, accessToken: 't' } }), ledger)
  assert.deepEqual(report.revenue[0].amount, { USD: 5, CNY: 30 }) // 本地 5 > 站点 1
  assert.equal(report.revenue[0].localSince, '2026-09-30')
  const byId = id => report.consumption.find(r => r.id === id)
  assert.deepEqual(byId('small').amount, { USD: 5, CNY: 35 })
  assert.ok(byId('small').localSince)
  assert.deepEqual(byId('big').amount, { USD: 10, CNY: 70 }) // 站点更大，不叠加
  assert.equal(byId('big').localSince, undefined)
  assert.deepEqual(byId('cube').amount, { USD: 2.5, CNY: 17.5 }) // 站点不支持范围，仅本地
  assert.match(byId('none').error, /暂不支持/)
})
