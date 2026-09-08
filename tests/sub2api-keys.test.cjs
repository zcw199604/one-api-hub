const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, filename)
const { Sub2ApiAdapter } = require('../adapters/Sub2ApiAdapter.ts')
const credentials = { siteUrl: 'https://example.test', auth: { kind: 'api-key', apiKey: 'panel-jwt' } }
const originalFetch = global.fetch
afterEach(() => { global.fetch = originalFetch; delete global.chrome })

test('Sub2API advertises complete key management', () => {
  assert.ok(new Sub2ApiAdapter().metadata.capabilities.includes('TOKEN_MANAGEMENT'))
})

test('key pagination uses one-based pages and preserves USD quota and custom keys', async () => {
  global.fetch = async (url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer panel-jwt')
    assert.ok(url.includes('/api/v1/keys?page=2&page_size=20'))
    return Response.json({ code: 0, data: { items: [{ id: 5, user_id: 7, key: 'custom-key', name: 'test',
      status: 'quota_exhausted', quota: 10, quota_used: 12, group_id: 3, group: { name: 'Claude' },
      created_at: '2026-09-01T00:00:00Z', expires_at: null, ip_whitelist: [] }], total: 21 } })
  }
  const [key] = await new Sub2ApiAdapter().getApiTokens(credentials, { page: 1, pageSize: 20 })
  assert.equal(key.key, 'custom-key')
  assert.equal(key.remain_quota, 0)
  assert.equal(key.used_quota, 12)
  assert.equal(key.quota_conversion_factor, 1)
  assert.equal(key.status_label, '额度耗尽')
  assert.equal(key.group, 'Claude')
  assert.equal(key.expired_time, -1)
})

test('CRUD uses official methods and preserves unlimited quota and expiration clearing', async () => {
  const requests = []
  global.fetch = async (url, init) => {
    requests.push({ url, method: init.method, body: init.body && JSON.parse(init.body) })
    return Response.json({ code: 0, data: { id: 5 } })
  }
  const adapter = new Sub2ApiAdapter()
  await adapter.createApiToken(credentials, { name: 'new', quota: 0, expires_in_days: 7, group_id: 3 })
  await adapter.updateApiToken(credentials, '5', { name: 'edit', expires_at: '', quota: 0, ip_whitelist: [], status: 'inactive' })
  await adapter.deleteApiToken(credentials, '5')
  assert.deepEqual(requests.map(r => r.method), ['POST', 'PUT', 'DELETE'])
  assert.equal(requests[0].body.quota, 0)
  assert.equal(requests[1].body.expires_at, '')
  assert.deepEqual(requests[1].body.ip_whitelist, [])
  assert.ok(requests[2].url.endsWith('/keys/5'))
  assert.equal(requests[2].body, undefined)
})

test('batch usage remains keyed by ID when key names are duplicated', async () => {
  global.fetch = async (url, init) => {
    assert.ok(url.endsWith('/usage/dashboard/api-keys-usage'))
    assert.deepEqual(JSON.parse(init.body), { api_key_ids: [1, 2] })
    return Response.json({ code: 0, data: { stats: {
      1: { today_actual_cost: 2, total_actual_cost: 8 },
      2: { today_actual_cost: 3, total_actual_cost: 9 }
    } } })
  }
  const stats = await new Sub2ApiAdapter().getKeysUsage(credentials, [1, 2])
  assert.equal(stats['1'].today_actual_cost, 2)
  assert.equal(stats['2'].today_actual_cost, 3)
})

test('key writes retry only after 401 and save the renewed credential first', async () => {
  const { withCredentialRecovery } = require('../services/fetchAccountSnapshot.ts')
  const adapter = new Sub2ApiAdapter()
  const auth = { ...credentials, auth: { ...credentials.auth } }
  let saved = false
  let calls = 0
  global.chrome = { runtime: { sendMessage: async () => ({ success: true, token: 'new' }) } }
  global.fetch = async (_url, init) => {
    calls++
    if (init.headers.Authorization === 'Bearer panel-jwt') return new Response('', { status: 401 })
    assert.ok(saved)
    return Response.json({ code: 0, data: { id: 5 } })
  }
  await withCredentialRecovery(adapter, auth, 7, async () => { saved = true }, () => adapter.createApiToken(auth, { name: 'new' }))
  assert.equal(calls, 2)
})

test('editing a name preserves expiry precision, group, disabled status and quota accounting', () => {
  const { sub2ApiKeyForm, buildSub2ApiKeyInput } = require('../utils/sub2apiKeyForm.ts')
  const original = { name: 'old', group_id: 3, status: 'inactive', quota: 10, quota_used: 4,
    expires_at: '2026-10-01T12:34:56Z', ip_whitelist: ['10.0.0.0/8'], ip_blacklist: ['10.0.0.1'], rate_limit_5h: 2 }
  const form = sub2ApiKeyForm(original)
  const request = buildSub2ApiKeyInput({ ...form, name: 'new' }, original)
  assert.equal(request.quota, 10)
  assert.equal(request.expires_at, undefined)
  assert.equal(request.group_id, undefined)
  assert.equal(request.status, undefined)
  assert.equal(request.reset_quota, undefined)
  assert.equal(request.rate_limit_5h, 2)
  assert.deepEqual(request.ip_blacklist, ['10.0.0.1'])
  assert.equal(buildSub2ApiKeyInput({ ...form, expiry: '' }, original).expires_at, '')
})

test('creation validates whole-day expiry and nonnegative dollar limits', () => {
  const { emptySub2ApiKeyForm, buildSub2ApiKeyInput } = require('../utils/sub2apiKeyForm.ts')
  const form = { ...emptySub2ApiKeyForm, name: 'new', days: '7', quota: '1.25', group: '3' }
  const request = buildSub2ApiKeyInput(form, null)
  assert.equal(request.quota, 1.25)
  assert.equal(request.expires_in_days, 7)
  assert.equal(request.group_id, 3)
  assert.throws(() => buildSub2ApiKeyInput({ ...form, days: '1.5' }, null), /正整数/)
  assert.throws(() => buildSub2ApiKeyInput({ ...form, quota: '-1' }, null), /非负/)
})

test('a failed write with an unknown outcome is never automatically repeated', async () => {
  const { withCredentialRecovery } = require('../services/fetchAccountSnapshot.ts')
  const adapter = new Sub2ApiAdapter()
  let calls = 0
  global.fetch = async () => { calls++; return new Response('', { status: 500 }) }
  await assert.rejects(withCredentialRecovery(adapter, credentials, 7, async () => assert.fail('must not save'),
    () => adapter.createApiToken(credentials, { name: 'new' })), /HTTP 500/)
  assert.equal(calls, 1)
})

test('unpaginated lists load every page', async () => {
  const sample = { user_id: 7, key: 'test', name: 'same', status: 'active', quota: 0, quota_used: 0 }
  global.fetch = async url => {
    const page = Number(new URL(url).searchParams.get('page'))
    const items = page === 1 ? Array.from({ length: 100 }, (_, i) => ({ ...sample, id: i + 1 })) : [{ ...sample, id: 101 }]
    return Response.json({ code: 0, data: { items, total: 101 } })
  }
  const keys = await new Sub2ApiAdapter().getApiTokens(credentials)
  assert.equal(keys.length, 101)
  assert.equal(keys[100].id, 101)
  assert.equal(keys[0].unlimited_quota, true)
})

test('management service uses fresh stored credentials and persists recovery for subsequent operations', async () => {
  const Module = require('node:module')
  const originalLoad = Module._load
  const db = new Map([['site_accounts', { accounts: [{ id: 'account', site_type: 'sub2api',
    site_url: 'https://example.test', account_info: { id: 7, api_key: 'old', quota: 0 } }] }]])
  // Only browser storage is replaced; registry, adapter, recovery and account storage run together.
  Module._load = function(name, ...args) {
    if (name === '@plasmohq/storage') return { Storage: class {
      async get(key) { return structuredClone(db.get(key)) }
      async set(key, value) { db.set(key, structuredClone(value)) }
    } }
    return originalLoad.call(this, name, ...args)
  }
  let service
  try { service = require('../services/tokenManagement.ts') } finally { Module._load = originalLoad }
  let recoveries = 0
  global.chrome = { runtime: { sendMessage: async () => { recoveries++; return { success: true, token: 'new' } } } }
  global.fetch = async (_url, init) => {
    if (init.headers.Authorization === 'Bearer old') return new Response('', { status: 401 })
    assert.equal(init.headers.Authorization, 'Bearer new')
    return Response.json({ code: 0, data: { items: [], total: 0 } })
  }
  await service.listAccountKeys('account')
  assert.equal(db.get('site_accounts').accounts[0].account_info.api_key, 'new')
  await service.deleteAccountKey('account', 5)
  assert.equal(recoveries, 1)
  assert.equal(service.keyForClipboard('custom-key', 'sub2api'), 'custom-key')
  assert.equal(service.keyForClipboard('abc', 'one-api'), 'sk-abc')
  // Existing OneAPI routing still uses its native endpoint and credential pair.
  db.set('site_accounts', { accounts: [{ id: 'one', site_type: 'one-api', site_url: 'https://one.test',
    account_info: { id: 9, access_token: 'one-token', quota: 0 } }] })
  global.fetch = async (url, init) => {
    assert.ok(url.startsWith('https://one.test/api/token/'))
    assert.equal(init.headers.Authorization, 'Bearer one-token')
    return Response.json({ success: true, data: [] })
  }
  assert.deepEqual(await service.listAccountKeys('one'), [])
})
