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
