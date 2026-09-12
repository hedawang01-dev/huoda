const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');
const { createServer } = require('../scripts/serve.cjs');

const HUODA_STORAGE_KEYS = [
  'huoda_mvp_v050',
  'huoda_v050_no_legacy_import',
  'huoda_favorites_v050_guest'
];

const VIEWPORTS = [
  [375, 812],
  [430, 932],
  [768, 1024],
  [1366, 768],
  [1440, 900],
  [1920, 1080]
];

async function startServer() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

async function stopServer(server) {
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

async function withIsolatedPage(browser, baseURL, viewport, run) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(keys => {
    for (const key of keys) localStorage.removeItem(key);
  }, HUODA_STORAGE_KEYS);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  try {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.task-card');
    await run(page);
    assert.deepEqual(pageErrors, [], '页面不应出现未处理的 JavaScript 异常');
  } finally {
    if (!page.isClosed()) {
      await page.evaluate(keys => {
        for (const key of keys) localStorage.removeItem(key);
      }, HUODA_STORAGE_KEYS).catch(() => {});
    }
    await context.close();
  }
}

async function applicationStatus(page, applicationId) {
  return page.evaluate(id => {
    const current = state.applications.find(item => item.id === id);
    const stored = localDb().applications.find(item => item.id === id);
    return {
      current: current?.status || null,
      stored: stored?.status || null
    };
  }, applicationId);
}

async function assertApplicationStatus(page, applicationId, expected) {
  assert.deepEqual(
    await applicationStatus(page, applicationId),
    { current: expected, stored: expected },
    `报名状态应同步进入 ${expected}`
  );
}

async function assertNoHorizontalOverflow(page, label) {
  await page.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  const metrics = await page.evaluate(() => ({
    viewportWidth: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth
  }));
  assert.ok(
    metrics.documentWidth <= metrics.viewportWidth && metrics.bodyWidth <= metrics.viewportWidth,
    `${label} 横向溢出：viewport=${metrics.viewportWidth}, document=${metrics.documentWidth}, body=${metrics.bodyWidth}`
  );
}

test('HUODA v5.4 本地浏览器回归', async t => {
  const server = await startServer();
  const address = server.address();
  const baseURL = `http://127.0.0.1:${address.port}`;
  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: require('./browser-path.cjs')
    });

    await t.test('游客收藏先登录，且不生成游客收藏', async () => {
      await withIsolatedPage(browser, baseURL, { width: 390, height: 844 }, async page => {
        await page.locator('.task-card').filter({ hasText: '淘宝主图精修 5 张' }).locator('.task-title').click();
        await page.getByRole('button', { name: '登录后收藏', exact: true }).click();
        await page.waitForSelector('#authEmail');

        const snapshot = await page.evaluate(() => {
          const raw = localStorage.getItem('huoda_mvp_v050');
          const db = raw ? JSON.parse(raw) : null;
          return {
            loggedIn: Boolean(state.user),
            stateFavorites: [...state.favorites],
            storedFavorites: Object.values(db?.favoritesByUser || {}).flat(),
            legacyGuestFavorites: localStorage.getItem('huoda_favorites_v050_guest')
          };
        });

        assert.equal(snapshot.loggedIn, false, '点击收藏后仍应保持游客身份');
        assert.deepEqual(snapshot.stateFavorites, [], '游客收藏不应进入页面状态');
        assert.deepEqual(snapshot.storedFavorites, [], '游客收藏不应写入任何用户收藏');
        assert.equal(snapshot.legacyGuestFavorites, null, '不应创建旧版游客收藏键');
        await page.evaluate(() => { closeModal(); go('home'); go('publish'); });
        await page.waitForSelector('#authEmail');
        assert.equal(await page.evaluate(() => state.route), 'home', '游客进入发布页前必须登录');
        assert.equal(await page.locator('#pTitle').count(), 0, '游客不应看到发布表单');
      });
    });

    await t.test('商家任务从草稿提交为审核中', async () => {
      await withIsolatedPage(browser, baseURL, { width: 1440, height: 900 }, async page => {
        const title = 'V054 浏览器回归草稿';
        await page.evaluate(async () => {
          await demoLogin('merchant');
          go('publish');
        });
        await page.waitForSelector('#pTitle');
        await page.locator('#pType').selectOption('online');
        await page.locator('#pTitle').fill(title);
        await page.locator('#pPrice').fill('260');
        await page.locator('#pUnit').selectOption('单');
        await page.locator('#pPay').selectOption('完工结');
        await page.locator('#pSpots').fill('2');
        await page.locator('#pTime').fill('48 小时内交付');
        await page.locator('#pLocation').fill('线上');
        await page.locator('#pTags').fill('回归测试, 线上');
        await page.locator('#pDesc').fill('用于验证 5.4 草稿提交审核的浏览器回归任务。');
        await page.getByRole('button', { name: '保存草稿', exact: true }).click();

        await page.waitForFunction(taskTitle => {
          return localDb().tasks.some(task => task.title === taskTitle && task.status === 'draft');
        }, title);
        let card = page.locator('.merchant-card').filter({ hasText: title });
        assert.match(await card.innerText(), /草稿/, '我发布的列表应显示草稿状态');

        await card.getByRole('button', { name: /提交审核/ }).click();
        await page.waitForFunction(taskTitle => {
          return localDb().tasks.some(task => task.title === taskTitle && task.status === 'pending_review');
        }, title);
        card = page.locator('.merchant-card').filter({ hasText: title });
        assert.match(await card.innerText(), /审核中/, '提交后列表应显示审核中');

        const stored = await page.evaluate(taskTitle => {
          const task = localDb().tasks.find(item => item.title === taskTitle);
          return { status: task.status, reviewStatus: task.review_status };
        }, title);
        assert.deepEqual(stored, { status: 'pending_review', reviewStatus: 'pending' });
      });
    });

    await t.test('报名按 applied → viewed → communicating → accepted → completed 闭环', async () => {
      await withIsolatedPage(browser, baseURL, { width: 1440, height: 900 }, async page => {
        await page.evaluate(async () => {
          await demoLogin('worker');
          await openTask('demo-2');
        });
        await page.getByRole('button', { name: '立即接单', exact: true }).click();
        await page.waitForFunction(() => state.applications.some(item => item.task_id === 'demo-2'));
        const applicationId = await page.evaluate(() => {
          return state.applications.find(item => item.task_id === 'demo-2').id;
        });
        await assertApplicationStatus(page, applicationId, 'applied');
        assert.match(await page.locator('#app').innerText(), /已报名/);

        await page.evaluate(async () => {
          await logout();
          await demoLogin('merchant');
          state.publishTab = 'mine';
          go('publish');
        });
        let taskCard = page.locator('.merchant-card').filter({ hasText: '淘宝主图精修 5 张' });
        await taskCard.getByRole('button', { name: '标记已查看', exact: true }).click();
        await page.waitForFunction(id => localDb().applications.find(item => item.id === id)?.status === 'viewed', applicationId);
        await assertApplicationStatus(page, applicationId, 'viewed');
        taskCard = page.locator('.merchant-card').filter({ hasText: '淘宝主图精修 5 张' });
        assert.match(await taskCard.innerText(), /商家已查看/);

        await taskCard.getByRole('button', { name: '开始沟通', exact: true }).click();
        await page.waitForFunction(id => localDb().applications.find(item => item.id === id)?.status === 'communicating', applicationId);
        await assertApplicationStatus(page, applicationId, 'communicating');
        taskCard = page.locator('.merchant-card').filter({ hasText: '淘宝主图精修 5 张' });
        assert.match(await taskCard.innerText(), /沟通中/);

        const serviceMessage = '沟通中状态的 Service 消息';
        await page.evaluate(async ({ id, content }) => {
          await H.services.message.send(id, content);
          await loadData();
        }, { id: applicationId, content: serviceMessage });
        assert.equal(await page.evaluate(({ id, content }) => {
          return localDb().messages.some(message => message.application_id === id && message.content === content);
        }, { id: applicationId, content: serviceMessage }), true, 'communicating 状态应允许消息 Service 写入');

        taskCard = page.locator('.merchant-card').filter({ hasText: '淘宝主图精修 5 张' });
        await taskCard.getByRole('button', { name: '录用', exact: true }).click();
        await page.waitForFunction(id => localDb().applications.find(item => item.id === id)?.status === 'accepted', applicationId);
        await assertApplicationStatus(page, applicationId, 'accepted');
        taskCard = page.locator('.merchant-card').filter({ hasText: '淘宝主图精修 5 张' });
        assert.match(await taskCard.innerText(), /已录用/);

        await page.evaluate(async () => {
          await logout();
          await demoLogin('worker');
          state.orderTab = 'worker';
          go('orders');
        });
        assert.match(await page.locator('#app').innerText(), /已录用/);
        await page.getByRole('button', { name: '标记已完成', exact: true }).click();
        await page.waitForFunction(id => localDb().applications.find(item => item.id === id)?.status === 'completed', applicationId);
        await assertApplicationStatus(page, applicationId, 'completed');
        assert.match(await page.locator('#app').innerText(), /已完成/);
      });
    });

    await t.test('communicating 状态可从 UI 打开聊天并发送消息', async () => {
      await withIsolatedPage(browser, baseURL, { width: 390, height: 844 }, async page => {
        const applicationId = await page.evaluate(async () => {
          await demoLogin('worker');
          const application = await H.services.application.apply('demo-2');
          await logout();
          await demoLogin('merchant');
          await H.services.application.transition(application.id, 'viewed');
          await H.services.application.transition(application.id, 'communicating');
          await loadData();
          return application.id;
        });

        await page.evaluate(id => openChat(id), applicationId);
        const opened = await page.evaluate(() => ({
          route: state.route,
          status: state.selectedApplication?.status || null,
          toast: [...document.querySelectorAll('.toast')].at(-1)?.textContent || ''
        }));
        assert.equal(opened.status, 'communicating');
        assert.equal(opened.route, 'chat', `communicating 应能打开聊天页，当前提示：${opened.toast}`);
        await page.waitForSelector('#chatText');

        const content = '沟通中可以直接确认工作安排';
        await page.locator('#chatText').fill(content);
        await page.getByRole('button', { name: '发送', exact: true }).click();
        await page.waitForFunction(({ id, text }) => {
          return localDb().messages.some(message => message.application_id === id && message.content === text);
        }, { id: applicationId, text: content });
      });
    });

    await t.test('六档视口的首页和商家任务页无横向溢出', async () => {
      await withIsolatedPage(browser, baseURL, { width: 375, height: 812 }, async page => {
        await page.evaluate(() => demoLogin('merchant'));

        for (const [width, height] of VIEWPORTS) {
          await page.setViewportSize({ width, height });
          await page.evaluate(() => go('home'));
          await assertNoHorizontalOverflow(page, `${width}x${height} 首页`);

          await page.evaluate(() => {
            state.publishTab = 'mine';
            go('publish');
          });
          await assertNoHorizontalOverflow(page, `${width}x${height} 商家任务页`);
        }
      });
    });
  } finally {
    if (browser) await browser.close();
    await stopServer(server);
  }
});
