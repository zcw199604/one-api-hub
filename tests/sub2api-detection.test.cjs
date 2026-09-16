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
const originalChrome = global.chrome
afterEach(() => { global.fetch = originalFetch; global.chrome = originalChrome })
const settings = { site_name: 'RouteX', version: '0.2.1-ainexus.1', server_timezone: 'Asia/Shanghai' }

test('RouteX is detected without the optional channel setting and reads logged-in account', async () => {
  global.fetch = async (url, init) => {
    if (new URL(url).pathname === '/api/v1/settings/public') {
      return Response.json({ code: 0, data: settings })
    }
    assert.equal(new URL(url).pathname, '/api/v1/user/profile')
    assert.equal(init.headers.Authorization, 'Bearer session-token')
    return Response.json({ code: 0, data: { id: 7, username: 'test-user' } })
  }
  global.chrome = { runtime: { sendMessage: async request => {
    assert.equal(request.action, 'autoDetectSite')
    assert.equal(request.url, 'https://routex.best')
    return { success: true, data: { authToken: 'session-token' } }
  } } }
  const adapter = new Sub2ApiAdapter()
  assert.deepEqual(await adapter.getSiteStatus('https://routex.best'), { detected: true, siteName: 'RouteX' })
  assert.deepEqual(await adapter.autoDetectAccount('https://routex.best'), {
    success: true, data: { username: 'test-user', accessToken: 'session-token', userId: '7', exchangeRate: null }
  })
})

test('standard Sub2API remains detectable with channels enabled or disabled', async () => {
  for (const available_channels_enabled of [true, false]) {
    global.fetch = async () => Response.json({ code: 0, data: { ...settings, available_channels_enabled } })
    assert.equal((await new Sub2ApiAdapter().getSiteStatus('https://example.test')).detected, true)
  }
})

test('unsuccessful or incomplete settings do not identify unrelated sites as Sub2API', async () => {
  for (const payload of [
    { code: 1, data: settings },
    { code: 0, data: { site_name: 'Other site' } },
    { code: 0, data: { ...settings, version: 2 } },
    { code: 0, data: { ...settings, server_timezone: null } }
  ]) {
    global.fetch = async () => Response.json(payload)
    assert.equal(await new Sub2ApiAdapter().getSiteStatus('https://example.test'), null)
  }
})
