'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'output/playwright');
const reportPath = path.join(__dirname, 'browser_test_report.json');
const entryUrl = `file://${path.join(root, 'index.html')}`;
const chromeCandidates = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium'
].filter(Boolean);
const executablePath = chromeCandidates.find(candidate => fs.existsSync(candidate));
let checks = 0;
let activeBrowser = null;

function check(value, message) {
  assert.ok(value, message);
  checks += 1;
}

function equal(actual, expected, message) {
  assert.deepStrictEqual(actual, expected, message);
  checks += 1;
}

function financialState(state) {
  return JSON.stringify({ global: state.global, offers: state.offers });
}

async function downloadFrom(page, selector, destination) {
  const event = page.waitForEvent('download');
  await page.locator(selector).click();
  const download = await event;
  await download.saveAs(destination);
  return download.suggestedFilename();
}

async function acceptNext(page) {
  page.once('dialog', dialog => dialog.accept());
}

async function dismissNext(page) {
  page.once('dialog', dialog => dialog.dismiss());
}

async function run() {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  activeBrowser = browser;
  const browserVersion = browser.version();
  const context = await browser.newContext({
    viewport: { width: 3840, height: 2160 },
    deviceScaleFactor: 1,
    acceptDownloads: true
  });
  const page = await context.newPage();
  const pageErrors = [];
  const remoteRequests = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('request', request => {
    if (/^https?:/i.test(request.url())) remoteRequests.push(request.url());
  });

  await page.goto(entryUrl);
  await page.waitForSelector('#tab-reference');
  equal(page.viewportSize(), { width: 3840, height: 2160 }, 'viewport must be 3840x2160 CSS pixels');
  equal(await page.evaluate(() => devicePixelRatio), 1, 'device pixel ratio must be 1');
  equal(await page.title(), 'Finanzierung · 房贷报价比较器', 'file entry title');
  equal(await page.locator('[role="tab"]').count(), 7, 'seven tabs');
  equal(await page.locator('[role="tab"]').evaluateAll(nodes => nodes.map(node => node.dataset.tab)), ['compare', 'inputs', 'sale', 'refi', 'schedule', 'help', 'reference'], 'tab order');
  equal(await page.locator('#tab-reference').count(), 1, 'unique Reference tab');
  equal(await page.locator('#page-reference').count(), 1, 'unique Reference page');

  for (const tab of ['compare', 'inputs', 'sale', 'refi', 'schedule', 'help', 'reference']) {
    await page.locator(`#tab-${tab}`).click();
    check(await page.locator(`#page-${tab}`).isVisible(), `${tab} tab opens its panel`);
  }

  const initial = await page.evaluate(() => window.__mortgageDebug.getState());
  const initialFinancial = financialState(initial);
  for (const bank of ['cb', 'ing']) {
    await page.locator('#reference-bank').selectOption(bank);
    check((await page.locator('#reference-audit').innerText()).includes('24/24'), `${bank}: browser audit shows 24/24 intervals`);
    equal(await page.locator('#reference-checkpoints tbody tr').count(), 24, `${bank}: browser renders 24 source intervals`);
    const audit = await page.evaluate(id => window.__mortgageReferenceDebug.audit().find(item => item.bank === id), bank);
    check(audit.checks.every(interval => interval.ok), `${bank}: browser engine matches all interval amounts`);
  }
  equal(financialState(await page.evaluate(() => window.__mortgageDebug.getState())), initialFinancial, 'switching reference bank does not change financial state');

  await page.locator('#tab-help').focus();
  await page.keyboard.press('ArrowRight');
  equal(await page.evaluate(() => document.activeElement.id), 'tab-reference', 'ArrowRight moves keyboard focus to Reference');
  equal(await page.locator('#tab-reference').getAttribute('aria-selected'), 'true', 'keyboard navigation selects Reference');

  await page.locator('#remember').check();
  const cancelState = await page.evaluate(() => JSON.stringify(window.__mortgageDebug.getState()));
  const cancelCache = await page.evaluate(() => localStorage.getItem('finanzierung-offer-comparator-v1'));
  let cancelDownloads = 0;
  const countDownload = () => { cancelDownloads += 1; };
  page.on('download', countDownload);
  await dismissNext(page);
  await page.locator('#reference-load').click();
  await page.waitForTimeout(100);
  page.off('download', countDownload);
  equal(await page.evaluate(() => JSON.stringify(window.__mortgageDebug.getState())), cancelState, 'cancelled load does not change state');
  equal(await page.evaluate(() => localStorage.getItem('finanzierung-offer-comparator-v1')), cancelCache, 'cancelled load does not change cache');
  equal(cancelDownloads, 0, 'cancelled load does not request a backup download');

  await page.locator('#reference-bank').selectOption('ing');
  const beforeLoad = await page.evaluate(() => window.__mortgageDebug.getState());
  const backupPath = path.join(outputDir, 'preload-ing.json');
  await acceptNext(page);
  await downloadFrom(page, '#reference-load', backupPath);
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  equal(backup, beforeLoad, 'pre-load download is the complete old state');
  const loaded = await page.evaluate(() => window.__mortgageDebug.getState());
  equal(loaded.offers.length, 1, 'load replaces the offer list with one bank');
  equal(loaded.global.equity, 259950, 'ING actual equity');
  equal(loaded.offers[0].tranches[0].amount, 552300, 'ING principal');
  equal(loaded.offers[0].tranches[0].rate, 3.89, 'ING nominal rate');
  equal(loaded.offers[0].tranches[0].effective, 3.99, 'ING effective rate record');
  equal(loaded.offers[0].tranches[0].monthly, 2710.87, 'ING contract payment');
  equal(loaded.offers[0].tranches[0].specialPct, 5, 'ING special repayment right');
  equal(loaded.global.specialAnnual, 0, 'ING actual special repayment budget remains zero');
  equal(loaded.offers[0].freeMonths, 6, 'ING commitment-interest-free months');
  equal(loaded.offers[0].commitmentRate, 0.2, 'ING monthly commitment rate record');
  equal(loaded.offers[0].penalty, null, 'unknown penalty stays null');
  check(loaded.offers[0].notes.includes('[Reference 2026-09-01]'), 'loaded quote contains provenance');
  for (const key of ['refiRate', 'refiYears', 'refiSpecialPct', 'sellYears', 'sellPrice', 'sellPct', 'sellFixed', 'sellTax', 'ownerAnnual', 'rentMonthly', 'rentGrowth', 'rentStartup', 'investmentReturn']) {
    equal(loaded.global[key], beforeLoad.global[key], `load preserves scenario field ${key}`);
  }
  check(await page.locator('#reference-persistent-warning').isVisible(), 'loaded provenance warning is visible');
  equal(await page.evaluate(() => JSON.parse(localStorage.getItem('finanzierung-offer-comparator-v1')).state), loaded, 'confirmed load updates opted-in cache');

  await acceptNext(page);
  await page.locator('#reference-undo').click();
  const restored = await page.evaluate(() => window.__mortgageDebug.getState());
  equal(restored, beforeLoad, 'session undo restores the exact pre-load state');
  equal(await page.evaluate(() => JSON.parse(localStorage.getItem('finanzierung-offer-comparator-v1')).state), beforeLoad, 'session undo restores opted-in cache');
  equal(await page.locator('#reference-persistent-warning').isVisible(), false, 'session undo removes loaded provenance warning when the old state had none');
  equal(await page.locator('#reference-undo').isDisabled(), true, 'session undo is available only once');

  await acceptNext(page);
  await downloadFrom(page, '#reference-load', path.join(outputDir, 'preload-ing-reload.json'));
  equal(await page.evaluate(() => window.__mortgageDebug.getState()), loaded, 'controlled reload restores the verified ING state after undo');

  await page.locator('#tab-inputs').click();
  const liveId = loaded.offers[0].id;
  await page.locator(`[data-offer="${liveId}"][data-key="monthly"]`).fill('2800');
  await page.waitForTimeout(180);
  await page.locator('#tab-reference').click();
  check((await page.locator('#reference-audit').innerText()).includes('24/24'), 'editing work payment leaves immutable benchmark unchanged');
  const paymentCells = await page.locator('#reference-results tbody tr').filter({ hasText: '首期月供' }).locator('td').allInnerTexts();
  check(paymentCells[3].includes('0,00'), 'benchmark payment delta stays zero');
  check(paymentCells[5].includes('+89,13'), 'work payment delta changes independently');

  await page.locator('#tab-inputs').click();
  await page.locator(`[data-offer="${liveId}"][data-key="monthly"]`).fill('2710.87');
  await page.locator(`[data-offer="${liveId}"][data-key="amount"]`).fill('552350');
  await page.waitForTimeout(180);
  await page.locator('#tab-reference').click();
  check((await page.locator('#reference-current-status').innerText()).includes('未通过原有校验'), 'invalid work offer shows validation reason');
  equal((await page.locator('#reference-results tbody tr').filter({ hasText: '第 120 期末余债' }).locator('td').nth(4).innerText()).trim(), '—', 'invalid work offer shows no fabricated result');
  await page.locator('#tab-inputs').click();
  await page.locator(`[data-offer="${liveId}"][data-key="amount"]`).fill('552300');
  await page.waitForTimeout(180);
  await page.locator(`[data-action="add-tranche"][data-id="${liveId}"]`).click();
  await page.locator('#tab-reference').click();
  check((await page.locator('#reference-current-status').innerText()).includes('多分笔'), 'multi-tranche work offer is identified without averaged single-loan terms');
  await page.locator('#tab-inputs').click();
  const multi = await page.evaluate(() => window.__mortgageDebug.getState());
  const addedId = multi.offers[0].tranches[1].id;
  await acceptNext(page);
  await page.locator(`[data-action="delete-tranche"][data-tid="${addedId}"]`).click();
  await page.locator(`[data-offer="${liveId}"][data-key="fixedYears"]`).fill('5');
  await page.waitForTimeout(180);
  await page.locator('#tab-reference').click();
  check((await page.locator('#reference-current-status').innerText()).includes('续贷假设'), 'short fixation warns that month 120 contains refinancing assumptions');
  await page.locator('#tab-inputs').click();
  await page.locator(`[data-offer="${liveId}"][data-key="fixedYears"]`).fill('10');
  await page.waitForTimeout(180);
  await page.locator('#tab-reference').click();

  const stableLoaded = await page.evaluate(() => window.__mortgageDebug.getState());
  const referenceJsonPath = path.join(outputDir, 'reference-ing.json');
  const referenceCsvPath = path.join(outputDir, 'reference-ing.csv');
  const workingJsonPath = path.join(outputDir, 'working-ing.json');
  await downloadFrom(page, '#reference-export', referenceJsonPath);
  await downloadFrom(page, '#reference-export-csv', referenceCsvPath);
  await downloadFrom(page, '#export-json', workingJsonPath);
  equal(await page.evaluate(() => window.__mortgageDebug.getState()), stableLoaded, 'reference and working exports do not change state');
  const referenceJson = JSON.parse(fs.readFileSync(referenceJsonPath, 'utf8'));
  check(referenceJson.offers[0].notes.includes('[Reference 2026-09-01]'), 'reference JSON preserves provenance');
  equal(referenceJson.ui.referenceBank, 'ing', 'reference JSON preserves Reference selection');
  const referenceCsv = fs.readFileSync(referenceCsvPath, 'utf8');
  equal((referenceCsv.match(/\n/g) || []).length + 1, 101, 'reference CSV contains 96 interval metrics plus metadata and header');
  check(!referenceCsv.includes('-0.00'), 'reference CSV normalizes zero deltas');

  await page.locator('#tab-schedule').click();
  await downloadFrom(page, '#export-summary', path.join(outputDir, 'summary-ing.csv'));
  await downloadFrom(page, '#export-csv', path.join(outputDir, 'schedule-ing.csv'));
  check(fs.statSync(path.join(outputDir, 'summary-ing.csv')).size > 100, 'existing summary CSV export works');
  check(fs.statSync(path.join(outputDir, 'schedule-ing.csv')).size > 1000, 'existing schedule CSV export works');

  await page.locator('#tab-reference').click();
  const exportedHtmlPath = path.join(outputDir, 'exported-ing.html');
  await downloadFrom(page, '#export-html', exportedHtmlPath);
  const exportedContext = await browser.newContext({ viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 });
  const exportedPage = await exportedContext.newPage();
  const exportedErrors = [];
  exportedPage.on('pageerror', error => exportedErrors.push(String(error)));
  await exportedPage.goto(`file://${exportedHtmlPath}`);
  await exportedPage.waitForSelector('#tab-reference');
  equal(exportedPage.viewportSize(), { width: 3840, height: 2160 }, 'exported HTML viewport');
  equal(await exportedPage.evaluate(() => devicePixelRatio), 1, 'exported HTML DPR');
  equal(await exportedPage.locator('[role="tab"]').count(), 7, 'exported HTML keeps all tabs');
  equal(await exportedPage.evaluate(() => window.__mortgageDebug.getState()), stableLoaded, 'exported HTML restores exact state');
  check(await exportedPage.locator('#reference-persistent-warning').isVisible(), 'exported HTML restores provenance warning');
  check((await exportedPage.locator('#reference-audit').innerText()).includes('24/24'), 'exported HTML keeps reference fixture and audit');
  equal(exportedErrors, [], 'exported HTML has no uncaught errors');
  await exportedContext.close();

  await page.reload();
  await page.waitForSelector('#tab-reference');
  equal(await page.evaluate(() => window.__mortgageDebug.getState()), stableLoaded, 'opted-in cache restores confirmed loaded state after reload');

  const legacy = JSON.parse(JSON.stringify(initial));
  delete legacy.ui.referenceBank;
  delete legacy.ui.referenceOffer;
  await acceptNext(page);
  await page.locator('#file-input').setInputFiles({ name: 'legacy-v1.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) });
  await page.waitForFunction(() => window.__mortgageDebug.getState().offers.length === 2);
  const imported = await page.evaluate(() => window.__mortgageDebug.getState());
  equal(imported.schema, 1, 'legacy import stays schema 1');
  equal(imported.ui.referenceBank, 'cb', 'legacy import gets safe Reference bank default');
  check(imported.offers.some(offer => offer.id === imported.ui.referenceOffer), 'legacy import gets non-dangling Reference offer');

  await page.locator('#tab-reference').click();
  await page.locator('#reference-bank').selectOption('cb');
  await acceptNext(page);
  await downloadFrom(page, '#reference-load', path.join(outputDir, 'preload-cb.json'));
  const cb = await page.evaluate(() => window.__mortgageDebug.getState());
  equal(cb.global.equity, 260000, 'Commerzbank actual equity');
  equal(cb.offers[0].tranches[0].amount, 552250, 'Commerzbank principal');
  equal(cb.offers[0].tranches[0].monthly, 2696.82, 'Commerzbank contract payment');
  check((await page.locator('#reference-audit').innerText()).includes('24/24'), 'Commerzbank remains exact after controlled load');
  const screenshotPath = path.join(outputDir, 'reference-3840x2160.png');
  await page.screenshot({ path: screenshotPath });
  check(fs.statSync(screenshotPath).size > 10000, '3840x2160 Reference screenshot was captured');

  equal(remoteRequests, [], 'runtime makes no HTTP(S) requests');
  equal(pageErrors, [], 'main browser flow has no uncaught errors');

  const report = {
    status: 'PASS',
    command: 'npm run test:browser',
    environment: {
      playwright: require('playwright/package.json').version,
      browser: browserVersion,
      executablePath: executablePath || 'Playwright bundled Chromium',
      platform: `${process.platform}-${process.arch}`
    },
    viewport: { width: 3840, height: 2160, deviceScaleFactor: 1 },
    checks,
    entry: 'file://index.html',
    exportedHtmlReopened: true,
    screenshot: 'output/playwright/reference-3840x2160.png',
    remoteRequests,
    pageErrors,
    failures: [],
    limitations: [
      'Browser coverage is Chromium only.',
      'Printing and a deployed GitHub Pages response were not exercised.'
    ]
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  await context.close();
  await browser.close();
  activeBrowser = null;
  console.log(`status: PASS; browser checks: ${checks}; viewport: 3840x2160 CSS px; DPR: 1`);
}

run().catch(async error => {
  if (activeBrowser) await activeBrowser.close().catch(() => {});
  console.error(`status: FAIL; checks completed: ${checks}`);
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
