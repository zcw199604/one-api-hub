const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, filename)

// 内存 Storage，读写之间带延迟，复现「读取-修改-写回」竞态
const mem = new Map()
const delay = () => new Promise(r => setTimeout(r, 5))
const originalLoad = Module._load
Module._load = function (request, ...rest) {
  if (request === '@plasmohq/storage') {
    return { Storage: class {
      async get(k) { const v = mem.get(k); await delay(); return v }
      async set(k, v) { await delay(); mem.set(k, v) }
    } }
  }
  if (request === './apiService') return { determineHealthStatus: () => ({ status: 'error' }) }
  return originalLoad.call(this, request, ...rest)
}

test('concurrent updateAccount calls do not overwrite each other', async () => {
  const { accountStorage } = require('../services/accountStorage.ts')
  const base = { site_name: 'n', site_url: 'u', health_status: 'unknown', account_info: { id: 1, access_token: 't', username: 'u' } }
  const ids = []
  for (let i = 0; i < 5; i++) ids.push(await accountStorage.addAccount({ ...base, site_name: `s${i}` }))
  await Promise.all(ids.map((id, i) => accountStorage.updateAccount(id, { site_name: `updated${i}` })))
  const names = (await accountStorage.getAllAccounts()).map(a => a.site_name)
  assert.deepEqual(names, ids.map((_, i) => `updated${i}`))
})
