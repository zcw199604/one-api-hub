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

const credentials = { siteUrl: 'https://ahmes.dev', auth: { kind: 'cookie' }, adapterConfig: { username: 'zcw199604@gmail.com' } }
const adapter = () => new (require('../adapters/AhmesAdapter.ts').AhmesAdapter)()

test('reads Ahmes identity, micro-point wallet and daily usage', async () => {
  global.chrome = { runtime: { sendMessage: async request => {
    assert.equal(request.action, 'readAhmesSnapshot')
    return { success: true, data: {
      me: { id: 'u1', email: credentials.adapterConfig.username }, wallet: { balance_micros: 101731669 },
      daily: [{ date: '2026-10-03', requests: 154, input_tokens: 308, output_tokens: 220944, cost_micros: 8628933 }]
    } }
  } } }
  assert.equal((await adapter().getSiteStatus(credentials.siteUrl)).detected, true)
  assert.equal((await adapter().autoDetectAccount(credentials.siteUrl)).data.username, credentials.adapterConfig.username)
  assert.equal((await adapter().getAccountBalance(credentials)).balanceUSD, 101.731669)
  const usage = await adapter().getUsageStats(credentials)
  assert.equal(usage.rawConsumption, 8628933)
  assert.equal(usage.promptTokens, 308)
  assert.equal(usage.completionTokens, 220944)
  assert.equal(usage.requestCount, 154)
})

test('rejects a switched account', async () => {
  global.chrome = { runtime: { sendMessage: async request => {
    return { success: true, data: { me: { email: 'other@example.com' }, wallet: { balance_micros: 1 }, daily: [] } }
  } } }
  assert.match((await adapter().validateConnection(credentials)).message, /浏览器登录账号已变化/)
})
