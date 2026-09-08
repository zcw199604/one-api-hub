const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

// Use the project's TypeScript compiler; no additional test dependencies.
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, filename)
}
const { Sub2ApiAdapter } = require('../adapters/Sub2ApiAdapter.ts')
const originalFetch = global.fetch
afterEach(() => { global.fetch = originalFetch; delete global.chrome; delete global.localStorage; delete global.location })

test('401 exposes an authentication status for credential recovery', async () => {
  global.fetch = async () => new Response('', { status: 401 })
  await assert.rejects(new Sub2ApiAdapter().getAccountBalance({
    siteUrl: 'https://example.test', auth: { kind: 'api-key', apiKey: 'old' }
  }), error => error.status === 401)
})

function browserSession(token = 'old') {
  const data = new Map(Object.entries({ auth_token: token, refresh_token: 'refresh-old',
    auth_user: JSON.stringify({ id: 7 }), token_expires_at: '1' }))
  global.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
  global.location = { origin: 'https://example.test' }
  return data
}

test('page recovery rotates and persists the pair but returns only the access token', async () => {
  const { recoverSub2ApiSessionInPage } = require('../services/sub2apiSession.ts')
  const data = browserSession()
  global.fetch = async (url, init) => {
    if (url.endsWith('/auth/refresh')) {
      assert.deepEqual(JSON.parse(init.body), { refresh_token: 'refresh-old' })
      return Response.json({ code: 0, data: { access_token: 'new', refresh_token: 'refresh-new', expires_in: 3600 } })
    }
    assert.equal(init.headers.Authorization, 'Bearer new')
    return Response.json({ code: 0, data: { id: 7 } })
  }
  const result = await recoverSub2ApiSessionInPage('https://example.test', '7', 'old')
  assert.deepEqual(result, { success: true, token: 'new' })
  assert.equal(data.get('refresh_token'), 'refresh-new')
  assert.equal(data.get('auth_token'), 'new')
  assert.ok(Number(data.get('token_expires_at')) > Date.now())
})

test('page recovery adopts a token already updated by the website', async () => {
  const { recoverSub2ApiSessionInPage } = require('../services/sub2apiSession.ts')
  browserSession('new')
  global.fetch = async url => {
    assert.ok(url.endsWith('/user/profile'))
    return Response.json({ code: 0, data: { id: 7 } })
  }
  assert.deepEqual(await recoverSub2ApiSessionInPage('https://example.test', '7', 'old'), { success: true, token: 'new' })
})

test('page recovery refuses another logged-in account without rotating tokens', async () => {
  const { recoverSub2ApiSessionInPage } = require('../services/sub2apiSession.ts')
  browserSession()
  global.fetch = async () => assert.fail('must not access another account')
  const result = await recoverSub2ApiSessionInPage('https://example.test', '8', 'old')
  assert.equal(result.success, false)
  assert.match(result.error, /账号/)
})

test('account switch during rotation does not overwrite the new browser session', async () => {
  const { recoverSub2ApiSessionInPage } = require('../services/sub2apiSession.ts')
  const data = browserSession()
  global.fetch = async () => {
    data.set('auth_user', JSON.stringify({ id: 8 }))
    data.set('auth_token', 'other-account')
    return Response.json({ code: 0, data: { access_token: 'new', refresh_token: 'refresh-new', expires_in: 3600 } })
  }
  assert.equal((await recoverSub2ApiSessionInPage('https://example.test', '7', 'old')).success, false)
  assert.equal(data.get('auth_token'), 'other-account')
})

test('expired refresh token reports login required and preserves browser storage', async () => {
  const { recoverSub2ApiSessionInPage } = require('../services/sub2apiSession.ts')
  const data = browserSession()
  global.fetch = async () => new Response('', { status: 401 })
  const result = await recoverSub2ApiSessionInPage('https://example.test', '7', 'old')
  assert.match(result.error, /重新登录/)
  assert.equal(data.get('refresh_token'), 'refresh-old')
})

test('concurrent page recoveries share the official lock and rotate only once', async () => {
  const { recoverSub2ApiSessionInPage } = require('../services/sub2apiSession.ts')
  browserSession()
  let rotations = 0
  global.fetch = async url => {
    if (url.endsWith('/auth/refresh')) {
      rotations++
      return Response.json({ code: 0, data: { access_token: 'new', refresh_token: 'refresh-new', expires_in: 3600 } })
    }
    return Response.json({ code: 0, data: { id: 7 } })
  }
  const results = await Promise.all([1, 2].map(() => recoverSub2ApiSessionInPage('https://example.test', '7', 'old')))
  assert.ok(results.every(result => result.success && result.token === 'new'))
  assert.equal(rotations, 1)
})

test('two failing queries recover once, persist credentials and retry successfully', async () => {
  const { fetchAccountSnapshot } = require('../services/fetchAccountSnapshot.ts')
  const credentials = { siteUrl: 'https://example.test', auth: { kind: 'api-key', apiKey: 'old' } }
  const saved = []
  let messages = 0
  global.chrome = { runtime: { sendMessage: async request => {
    messages++
    assert.equal(request.expectedUserId, '7')
    return { success: true, token: 'new' }
  } } }
  global.fetch = async (url, init) => {
    if (init.headers.Authorization === 'Bearer old') return new Response('', { status: 401 })
    assert.deepEqual(saved, ['new'], 'persist before retrying either query')
    return Response.json({ code: 0, data: url.endsWith('/user/profile') ? { balance: 42 } : { today_actual_cost: 3 } })
  }
  const [balance, usage] = await fetchAccountSnapshot(new Sub2ApiAdapter(), credentials, {}, 7, async token => saved.push(token))
  assert.equal(balance.rawBalance, 42)
  assert.equal(usage.rawConsumption, 3)
  assert.equal(messages, 1)
})

test('403 does not trigger credential rotation', async () => {
  const { fetchAccountSnapshot } = require('../services/fetchAccountSnapshot.ts')
  global.chrome = { runtime: { sendMessage: async () => assert.fail('must not recover') } }
  global.fetch = async () => new Response('', { status: 403 })
  await assert.rejects(fetchAccountSnapshot(new Sub2ApiAdapter(), {
    siteUrl: 'https://example.test', auth: { kind: 'api-key', apiKey: 'old' }
  }, {}, 7, async () => assert.fail('must not save')), /HTTP 403/)
})

test('a second 401 stops after one recovery attempt', async () => {
  const { fetchAccountSnapshot } = require('../services/fetchAccountSnapshot.ts')
  let messages = 0
  global.chrome = { runtime: { sendMessage: async () => { messages++; return { success: true, token: 'new' } } } }
  global.fetch = async () => new Response('', { status: 401 })
  await assert.rejects(fetchAccountSnapshot(new Sub2ApiAdapter(), {
    siteUrl: 'https://example.test', auth: { kind: 'api-key', apiKey: 'old' }
  }, {}, 7, async () => {}), error => error.status === 401)
  assert.equal(messages, 1)
})

test('legacy accounts recover identity from JWT and keep the new token when usage retry fails', async () => {
  const { fetchAccountSnapshot } = require('../services/fetchAccountSnapshot.ts')
  const old = `header.${Buffer.from(JSON.stringify({ user_id: 7 })).toString('base64url')}.signature`
  let saved
  global.chrome = { runtime: { sendMessage: async request => {
    assert.equal(request.expectedUserId, '7')
    return { success: true, token: 'new' }
  } } }
  global.fetch = async (url, init) => {
    if (init.headers.Authorization !== 'Bearer new') return new Response('', { status: 401 })
    if (url.endsWith('/stats')) return new Response('', { status: 500 })
    return Response.json({ code: 0, data: { balance: 42 } })
  }
  await assert.rejects(fetchAccountSnapshot(new Sub2ApiAdapter(), {
    siteUrl: 'https://example.test', auth: { kind: 'api-key', apiKey: old }
  }, {}, undefined, async token => { saved = token }), /HTTP 500/)
  assert.equal(saved, 'new')
})

test('rotated refresh token survives a temporary profile failure', async () => {
  const { recoverSub2ApiSessionInPage } = require('../services/sub2apiSession.ts')
  const data = browserSession()
  global.fetch = async url => url.endsWith('/auth/refresh')
    ? Response.json({ code: 0, data: { access_token: 'new', refresh_token: 'refresh-new', expires_in: 3600 } })
    : new Response('', { status: 503 })
  const result = await recoverSub2ApiSessionInPage('https://example.test', '7', 'old')
  assert.equal(result.success, false)
  assert.equal(data.get('refresh_token'), 'refresh-new')
})

test('background recovery handles its own requests and deduplicates windows', async () => {
  const Module = require('node:module')
  const path = require('node:path')
  browserSession('new')
  global.fetch = async () => Response.json({ code: 0, data: { id: 7 } })
  let windows = 0
  let closed = 0
  let listener
  global.chrome = {
    runtime: { id: 'extension', onStartup: { addListener() {} }, onInstalled: { addListener() {} },
      onMessage: { addListener(fn) { listener = fn } }, sendMessage() { assert.fail('background cannot message itself') } },
    tabs: { query: async () => [], get: (_id, callback) => callback({ status: 'complete' }) },
    windows: { create: async () => { windows++; return { id: 1, tabs: [{ id: 2 }] } },
      remove: async () => { closed++ }, onRemoved: { addListener() {} } },
    scripting: { executeScript: async ({ func, args }) => {
      // Chrome serializes injected functions: ensure no module closure is required.
      const injected = (0, eval)(`(${func.toString()})`)
      return [{ result: await injected(...args) }]
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
  const { recoverSub2ApiCredentials } = require('../services/sub2apiSession.ts')
  const request = { url: 'https://example.test', expectedUserId: '7', failedToken: 'old' }
  const results = await Promise.all([recoverSub2ApiCredentials(request), recoverSub2ApiCredentials(request)])
  assert.ok(results.every(result => result.token === 'new'))
  assert.equal(windows, 1)
  assert.equal(closed, 1)
  let rejected
  listener({ action: 'recoverSub2ApiSession', ...request }, { id: 'extension', tab: { id: 2 } }, result => { rejected = result })
  assert.equal(rejected.success, false)
})
