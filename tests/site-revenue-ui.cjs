const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { chromium } = require(process.argv[2] || 'playwright')

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-revenue-ui-'))
  const extension = path.resolve('build/chrome-mv3-prod')
  const screenshots = path.resolve('build/revenue-ui-screenshots')
  fs.mkdirSync(screenshots, { recursive: true })
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: chromium.executablePath(), headless: true, viewport: { width: 384, height: 600 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  })
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker')
    const extensionId = new URL(worker.url()).host
    const now = Date.now()
    const date = new Date(now)
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const seed = { id: 'owned', site_name: '我的经营站点', site_url: 'https://revenue.test', site_type: 'new-api',
      exchange_rate: 7.2, health_status: 'healthy', last_sync_time: now, created_at: now, updated_at: now,
      revenue_enabled: true, revenue_exchange_rate: 6,
      revenue: { rawQuota: 1500000, date: dateKey, updatedAt: now },
      account_info: { id: 1, username: 'admin', access_token: 'test', quota: 5000000,
        today_quota_consumption: 500000, today_prompt_tokens: 20, today_completion_tokens: 10, today_requests_count: 1 }
    }
    const subscription = { ...seed, id: 'subscription', site_url: 'https://subscription.test', site_name: '订阅站点', revenue_enabled: false,
      account_info: { ...seed.account_info, expire_time: Math.floor(now / 1000) + 864000, subscription_status: 'active', plan_type: '月度套餐' } }
    const duplicate = { ...seed, id: 'duplicate', site_url: `${seed.site_url}/` }
    await worker.evaluate(async data => chrome.storage.local.set({
      site_accounts: JSON.stringify({ accounts: data.accounts, last_updated: Date.now() }),
      user_preferences: JSON.stringify({ activeTab: 'revenue', currencyType: 'CNY', sortField: 'balance', sortOrder: 'desc',
        autoRefresh: false, refreshOnOpen: false, refreshInterval: 360, lastUpdated: Date.now() })
    }), { accounts: [seed, duplicate, subscription] })
    let role = 10, denied = false
    await context.route('https://revenue.test/**', async route => {
      const url = new URL(route.request().url())
      let data
      if (url.pathname === '/api/user/self') data = { id: 1, username: 'admin', role, quota: 5000000 }
      else if (url.pathname === '/api/log/self') data = { items: [{ quota: 500000, prompt_tokens: 20, completion_tokens: 10 }], total: 1 }
      else if (url.pathname === '/api/log/stat') {
        if (denied) return route.fulfill({ status: 403, body: '' })
        data = { quota: 1500000 }
      } else throw new Error(`Unexpected API: ${url}`)
      await route.fulfill({ json: { success: true, data } })
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`chrome-extension://${extensionId}/popup.html`)
    await page.getByRole('tab', { name: '营收统计' }).waitFor()
    assert.equal(await page.getByRole('tab').count(), 4)
    assert.equal(await page.getByRole('tab', { name: '营收统计' }).getAttribute('aria-selected'), 'true')
    for (const tab of await page.getByRole('tab').all()) {
      assert.equal((await tab.getAttribute('class')).includes('bg-white'), (await tab.getAttribute('aria-selected')) === 'true')
    }
    const panel = page.getByRole('tabpanel')
    assert.match(await panel.innerText(), /预计净收益/)
    assert.match(await panel.innerText(), /总流水/)
    assert.match(await panel.innerText(), /总消耗/)
    assert.deepEqual(await panel.locator('dt').allTextContents(), ['总流水', '总消耗'])
    assert.equal(await panel.getByRole('button').filter({ hasText: '¥' }).first().innerText(), '+¥10.80')
    assert.equal(await panel.getByTestId('revenue-difference').innerText(), '+¥10.80')
    assert.equal(await panel.getByTestId('revenue-total-flow').innerText(), '+¥18.00')
    const expense = page.getByTestId('revenue-consumption')
    const difference = page.getByTestId('revenue-difference')
    assert.equal(await expense.innerText(), '-¥7.20')
    assert.equal(await expense.evaluate(el => getComputedStyle(el).color), 'rgb(185, 28, 28)')
    assert.equal(await difference.innerText(), '+¥10.80')
    await page.getByRole('tabpanel').getByRole('button').click()
    assert.equal(await expense.innerText(), '-$1.00')
    assert.equal(await difference.innerText(), '+$2.00')
    await page.getByRole('tabpanel').getByRole('button').click()
    assert.equal(await page.getByRole('tabpanel').getByRole('link').count(), 1)
    for (const width of [384, 1280]) {
      await page.setViewportSize({ width, height: 600 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await page.waitForTimeout(250)
      await page.screenshot({ path: path.join(screenshots, `revenue-${width}.png`) })
    }
    for (const [rawQuota, expected, color] of [
      [2000000, '-¥10.80', 'rgb(185, 28, 28)'],
      [1250000, '¥0.00', 'rgb(75, 85, 99)']
    ]) {
      await page.evaluate(async rawQuota => {
        const stored = JSON.parse((await chrome.storage.local.get('site_accounts')).site_accounts)
        stored.accounts.find(account => account.id === 'subscription').account_info.today_quota_consumption = rawQuota
        await chrome.storage.local.set({ site_accounts: JSON.stringify(stored) })
      }, rawQuota)
      await page.reload()
      await page.getByRole('tab', { name: '营收统计', selected: true }).waitFor()
      assert.equal(await difference.innerText(), expected)
      assert.equal(await difference.evaluate(el => getComputedStyle(el).color), color)
    }
    await page.evaluate(async () => {
      const stored = JSON.parse((await chrome.storage.local.get('site_accounts')).site_accounts)
      stored.accounts.find(account => account.id === 'subscription').account_info.today_quota_consumption = 500000
      await chrome.storage.local.set({ site_accounts: JSON.stringify(stored) })
    })
    await page.reload()
    await page.getByRole('tab', { name: '营收统计', selected: true }).waitFor()
    await page.setViewportSize({ width: 384, height: 600 })
    await page.getByRole('tab', { name: '订阅信息' }).click()
    await page.getByRole('tabpanel').getByText('月度套餐', { exact: true }).waitFor()
    assert.match(await page.getByRole('tabpanel').innerText(), /月度套餐/)
    await page.getByRole('tab', { name: '营收统计' }).click()
    await page.getByRole('tab', { name: '营收统计', selected: true }).waitFor()
    await page.reload()
    await page.getByRole('tab', { name: '营收统计', selected: true }).waitFor()

    await page.getByRole('button', { name: '新增账号' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('combobox').selectOption('new-api')
    await dialog.getByPlaceholder('https://example.com').fill('https://revenue.test')
    await dialog.getByPlaceholder('用户名', { exact: true }).fill('admin')
    await dialog.getByPlaceholder('用户 ID (数字)').fill('1')
    await dialog.getByPlaceholder('访问令牌', { exact: true }).fill('test')
    const toggle = dialog.getByRole('switch', { name: '统计站点营收' })
    await dialog.getByText('已验证管理员权限', { exact: true }).waitFor()
    assert.equal(await toggle.isEnabled(), true)
    assert.equal(await toggle.getAttribute('aria-checked'), 'false')
    await toggle.click()
    await dialog.getByLabel('营收折算比例 (CNY/USD)').fill('6')
    await toggle.scrollIntoViewIfNeeded()
    await page.waitForTimeout(250)
    await page.screenshot({ path: path.join(screenshots, 'add-admin.png') })
    await dialog.getByPlaceholder('请输入充值比例').fill('7.2')
    assert.equal(await toggle.getAttribute('aria-checked'), 'true')
    await dialog.getByRole('button', { name: '手动添加', exact: true }).scrollIntoViewIfNeeded()
    await page.waitForTimeout(250)
    await page.screenshot({ path: path.join(screenshots, 'add-submit.png') })
    await dialog.getByRole('button', { name: '手动添加', exact: true }).click()
    await page.waitForFunction(async () => JSON.parse((await chrome.storage.local.get('site_accounts')).site_accounts).accounts.length === 4)
    await dialog.waitFor({ state: 'hidden' })
    const stored = await page.evaluate(async () => JSON.parse((await chrome.storage.local.get('site_accounts')).site_accounts))
    const added = stored.accounts.find(account => !['owned', 'duplicate', 'subscription'].includes(account.id))
    assert.ok(added, `Added account missing: ${JSON.stringify(stored.accounts.map(account => account.id))}`)
    assert.equal(added.revenue_enabled, true)
    assert.equal(added.revenue_exchange_rate, 6)
    assert.equal(added.revenue.rawQuota, 1500000)
    await page.getByRole('button', { name: '新增账号' }).click()
    await dialog.getByRole('combobox').selectOption('new-api')
    await dialog.getByPlaceholder('https://example.com').fill('https://revenue.test')
    await dialog.getByPlaceholder('用户名', { exact: true }).fill('ordinary')
    await dialog.getByPlaceholder('用户 ID (数字)').fill('2')
    role = 1
    await dialog.getByPlaceholder('访问令牌', { exact: true }).fill('ordinary-test')
    await dialog.getByText('统计站点营收需要管理员权限', { exact: true }).waitFor()
    assert.equal(await toggle.isDisabled(), true)
    await page.screenshot({ path: path.join(screenshots, 'add-ordinary.png') })
    await dialog.getByRole('button', { name: '取消', exact: true }).click()

    role = 10
    const row = page.locator('.group').filter({ has: page.getByRole('link', { name: seed.site_name, exact: true }) }).first()
    await row.hover()
    await row.getByRole('button').last().click()
    await page.getByRole('menuitem').filter({ hasText: '编辑' }).click()
    await page.getByText('已验证管理员权限', { exact: true }).waitFor()
    assert.equal(await page.getByRole('switch', { name: '统计站点营收' }).getAttribute('aria-checked'), 'true')
    assert.equal(await page.getByLabel('营收折算比例 (CNY/USD)').inputValue(), '6')
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
    denied = true
    await row.hover()
    await row.getByRole('button').first().click()
    await page.getByText('1 个站点营收未获取', { exact: true }).waitFor()
    assert.match(await page.getByRole('tabpanel').innerText(), /获取失败/)
    assert.equal(await difference.innerText(), '待计算')
    await page.screenshot({ path: path.join(screenshots, 'revenue-failed.png') })
    assert.deepEqual(errors, [])
    console.log('PASS: popup persistence, four tabs, site deduplication, admin switch, ordinary-user denial, edit restore, failed refresh and layout at 384/1280px')
    console.log(`Screenshots: ${screenshots}`)
  } finally {
    await context.close()
    fs.rmSync(profile, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
