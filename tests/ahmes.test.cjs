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

test('range usage requests enough days and sums only rows inside the range', async () => {
  const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const day = offset => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - offset); return d }
  let requestedDays
  global.chrome = { runtime: { sendMessage: async request => {
    requestedDays = request.days
    return { success: true, data: { me: { email: credentials.adapterConfig.username }, wallet: { balance_micros: 1 },
      daily: [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ date: key(day(i)), requests: 1, input_tokens: 10, output_tokens: 20, cost_micros: 1_000_000 })) } }
  } } }
  const range = { start: Math.floor(day(6).getTime() / 1000), end: Math.floor(day(0).getTime() / 1000) + 86399 }
  const usage = await adapter().getRangeUsageStats(credentials, range)
  assert.equal(requestedDays, 7)
  assert.equal(usage.rawConsumption, 7_000_000)
  assert.equal(usage.requestCount, 7)
  global.chrome = { runtime: { sendMessage: async () => ({ success: true, data: { me: { email: credentials.adapterConfig.username }, wallet: {}, daily: [{ cost_micros: 1 }] } }) } }
  await assert.rejects(adapter().getRangeUsageStats(credentials, range), /格式异常/)
  await assert.rejects(adapter().getRangeUsageStats(credentials, { start: 1, end: 2 }), /366/)
})
