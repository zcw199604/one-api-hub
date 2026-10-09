const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, filename)
}
const { Sub2ApiAdapter } = require('../adapters/Sub2ApiAdapter.ts')
const originalFetch = global.fetch
afterEach(() => { global.fetch = originalFetch })
const credentials = { siteUrl: 'https://example.test/', auth: { kind: 'api-key', apiKey: 'session' } }
const expected = { rawConsumption: 1.25, rawUnit: 'USD', conversionFactor: 1, promptTokens: 100, completionTokens: 50, requestCount: 3 }

test('admin revenue uses Sub2API actual cost and admin UI request header', async () => {
  const calls = []
  global.fetch = async (url, init) => {
    const path = new URL(url).pathname
    calls.push(path)
    assert.equal(init.headers.Authorization, 'Bearer session')
    if (path === '/api/v1/user/profile') return Response.json({ code: 0, data: { role: 'admin' } })
    assert.equal(path, '/api/v1/admin/dashboard/stats')
    assert.equal(init.headers['X-Admin-UI-Request'], 'true')
    return Response.json({ code: 0, data: { today_actual_cost: 18.5, today_account_cost: 20, today_cost: 42 } })
  }
  const adapter = new Sub2ApiAdapter()
  assert.equal(await adapter.checkRevenueAccess(credentials), 10)
  assert.deepEqual(await adapter.getSiteRevenue(credentials, { start: 1, end: 2 }), { rawQuota: 18.5 })
  assert.deepEqual(calls, ['/api/v1/user/profile', '/api/v1/user/profile', '/api/v1/admin/dashboard/stats'])
})

test('non-admin Sub2API users cannot enable revenue', async () => {
  global.fetch = async url => new URL(url).pathname === '/api/v1/user/profile'
    ? Response.json({ code: 0, data: { role: 'user' } })
    : Response.json({ code: 0, data: { today_actual_cost: 1 } })
  await assert.rejects(new Sub2ApiAdapter().getSiteRevenue(credentials, { start: 1, end: 2 }), /管理员权限/)
})

test('standard dashboard usage preserves existing values without fallback', async () => {
  global.fetch = async url => {
    assert.equal(new URL(url).pathname, '/api/v1/usage/dashboard/stats')
    return Response.json({ code: 0, data: { today_actual_cost: 1.25, today_input_tokens: 100, today_output_tokens: 50, today_requests: 3 } })
  }
  assert.deepEqual(await new Sub2ApiAdapter().getUsageStats(credentials), expected)
})

test('missing dashboard falls back to today stats and maps actual billed cost', async () => {
  const paths = []
  global.fetch = async (url, init) => {
    paths.push(new URL(url).pathname)
    if (paths.length === 1) return new Response('404 page not found', { status: 404 })
    assert.equal(new URL(url).searchParams.get('period'), 'today')
    assert.equal(init.headers.Authorization, 'Bearer session')
    return Response.json({ code: 0, data: { total_actual_cost: 1.25, total_cost: 9, total_input_tokens: 100, total_output_tokens: 50, total_requests: 3 } })
  }
  assert.deepEqual(await new Sub2ApiAdapter().getUsageStats(credentials), expected)
  assert.deepEqual(paths, ['/api/v1/usage/dashboard/stats', '/api/v1/usage/stats'])
})

for (const status of [401, 403, 500]) {
  test(`HTTP ${status} does not trigger compatibility fallback`, async () => {
    let calls = 0
    global.fetch = async () => { calls++; return new Response('', { status }) }
    await assert.rejects(new Sub2ApiAdapter().getUsageStats(credentials))
    assert.equal(calls, 1)
  })
}

test('fallback failure remains an error instead of reporting zero usage', async () => {
  let calls = 0
  global.fetch = async () => new Response('', { status: ++calls === 1 ? 404 : 500 })
  await assert.rejects(new Sub2ApiAdapter().getUsageStats(credentials), /HTTP 500/)
})
