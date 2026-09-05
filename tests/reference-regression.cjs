'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'src/calculator.html');
const fixturePath = path.join(root, 'reference-data.json');
const reportPath = path.join(__dirname, 'core_test_report.json');
let assertions = 0;

function check(value, message) {
  assert.ok(value, message);
  assertions += 1;
}

function equal(actual, expected, message) {
  assert.deepStrictEqual(actual, expected, message);
  assertions += 1;
}

function cents(actual, expected, message) {
  equal(Math.round(actual * 100), Math.round(expected * 100), message);
}

function strictDecode(parts) {
  let encoded = '';
  for (const text of parts) {
    const match = text.match(/^window\.__MORTGAGE_PAYLOAD=\(window\.__MORTGAGE_PAYLOAD\|\|""\)\+"([A-Za-z0-9+/=]+)";\n?$/);
    check(match, 'payload wrapper must match the inert, supported format');
    encoded += match[1];
  }
  check(encoded.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(encoded), 'payload must be strict Base64');
  const compressed = Buffer.from(encoded, 'base64');
  equal(compressed.toString('base64'), encoded, 'payload Base64 must be canonical');
  return zlib.gunzipSync(compressed).toString('utf8');
}

function sourceFromGit(commit) {
  const parts = Array.from({ length: 5 }, (_, index) =>
    execFileSync('git', ['show', `${commit}:assets/payload-${index + 1}.js`], { cwd: root, encoding: 'utf8' })
  );
  return strictDecode(parts);
}

function coreScript(html) {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const script = scripts.find(text => text.includes('/* Pure calculation engine. EUR amounts, monthly end-of-period cash flows. */'));
  check(script, 'calculator source must contain the pure calculation engine');
  return script;
}

function loadCore(script) {
  const context = { module: { exports: {} }, exports: {}, globalThis: {} };
  vm.runInNewContext(script, context, { filename: 'calculator-core.js' });
  return context.module.exports;
}

function businessFormulaSlice(script) {
  const start = script.indexOf('function loanNeed');
  const end = script.indexOf('function normalize');
  check(start >= 0 && end > start, 'business formula slice must be present');
  return script.slice(start, end);
}

function referenceOffer(C, quote) {
  const offer = C.offer(`REF-${quote.id}`, `${quote.name} · 2026-09-01`, quote.rate, quote.fixedYears);
  Object.assign(offer, {
    fees: 0,
    commitment: 0,
    penalty: null,
    freeMonths: quote.freeMonths,
    commitmentRate: quote.commitmentMonthly,
    flexibility: quote.flexibility,
    notes: '[Reference 2026-09-01] test fixture'
  });
  Object.assign(offer.tranches[0], {
    amount: quote.principal,
    rate: quote.rate,
    effective: quote.effective,
    fixedYears: 10,
    basis: 'monthly',
    monthly: quote.monthly,
    tilgung: quote.tilgung,
    specialPct: quote.specialPct,
    graceMonths: 0
  });
  return offer;
}

function referenceGlobal(C, fixture, quote) {
  return {
    ...C.blank().global,
    price: fixture.project.price,
    buyPct: fixture.project.buyPct,
    buyFixed: 0,
    renovation: 0,
    equity: quote.equity,
    compareMode: 'contract',
    specialAnnual: 0
  };
}

function firstJsonScript(html, id) {
  const match = html.match(new RegExp(`<script id="${id}" type="application/json">([\\s\\S]*?)<\\/script>`));
  check(match, `${id} must be embedded`);
  return JSON.parse(match[1]);
}

function run() {
  const html = fs.readFileSync(sourcePath, 'utf8');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const payloads = Array.from({ length: 5 }, (_, index) => fs.readFileSync(path.join(root, `assets/payload-${index + 1}.js`), 'utf8'));
  const decoded = strictDecode(payloads);
  equal(decoded, html, 'decoded production payload must exactly equal canonical source');
  equal(firstJsonScript(html, 'reference-data'), fixture, 'embedded fixture must exactly equal reference-data.json');
  equal((html.match(/id="tab-reference"/g) || []).length, 1, 'Reference tab must be unique');
  equal((html.match(/id="page-reference"/g) || []).length, 1, 'Reference page must be unique');
  equal([...html.matchAll(/data-tab="([^"]+)"/g)].slice(0, 7).map(match => match[1]), ['compare', 'inputs', 'sale', 'refi', 'schedule', 'help', 'reference'], 'Reference tab must be seventh');

  const currentCore = coreScript(html);
  const baselineCore = coreScript(sourceFromGit('9c1e0c96eea2054db662b4d1f2d0b1c54e34af9c'));
  const currentBusiness = businessFormulaSlice(currentCore);
  const baselineBusiness = businessFormulaSlice(baselineCore);
  equal(crypto.createHash('sha256').update(currentBusiness).digest('hex'), crypto.createHash('sha256').update(baselineBusiness).digest('hex'), 'loan, simulation, refinancing, and sale formulas must be byte-identical to baseline');
  const C = loadCore(currentCore);

  equal(fixture.schema, 'mortgage-reference-1', 'fixture schema');
  equal(fixture.project.price, 750000, 'project purchase price');
  equal(fixture.project.tax + fixture.project.notary, 62250, 'source purchase costs');
  cents(fixture.project.price * (1 + fixture.project.buyPct / 100), fixture.project.total, 'project total');
  equal(fixture.banks.length, 2, 'fixture bank count');

  for (const quote of fixture.banks) {
    const global = referenceGlobal(C, fixture, quote);
    const offer = referenceOffer(C, quote);
    cents(C.loanNeed(global), quote.principal, `${quote.id}: loan need`);
    const result = C.simulateOffer(global, offer, 121);
    check(result.valid, `${quote.id}: reference input validates`);
    equal(result.rows.length, 122, `${quote.id}: simulation contains months 0 through 121`);
    cents(result.total, quote.principal, `${quote.id}: principal`);
    cents(result.rows[1].regular, quote.monthly, `${quote.id}: first payment`);
    cents(result.rows[1].interest, quote.schedule[0].interest, `${quote.id}: first interest`);
    cents(result.rows[1].principal, quote.schedule[0].principal, `${quote.id}: first principal`);
    cents(result.rows[1].balance, quote.schedule[0].balance, `${quote.id}: first balance`);
    cents(result.rows[12].balance, quote.schedule[11].balance, `${quote.id}: month 12 balance`);
    cents(result.rows[15].balance, quote.schedule[14].balance, `${quote.id}: month 15 balance`);
    cents(result.rows[120].balance, quote.residual, `${quote.id}: month 120 balance`);
    cents(result.rows[120].cumRegular, quote.paid, `${quote.id}: month 120 paid`);
    cents(result.rows[120].cumInterest, quote.interest, `${quote.id}: month 120 interest`);
    cents(result.rows[120].cumPrincipal, quote.repaid, `${quote.id}: month 120 repaid`);
    cents(result.rows[120].cumSpecial, 0, `${quote.id}: no actual special repayment`);
    equal(result.rows[120].projected, false, `${quote.id}: month 120 excludes refinancing`);
    equal(result.rows[121].projected, true, `${quote.id}: month 121 includes refinancing`);
    equal(quote.schedule.length, 24, `${quote.id}: 24 source intervals`);

    for (const interval of quote.schedule) {
      const previous = result.rows[interval.startMonth - 1];
      const end = result.rows[interval.endMonth];
      const actual = {
        regular: C.round(end.cumRegular - previous.cumRegular),
        interest: C.round(end.cumInterest - previous.cumInterest),
        principal: C.round(end.cumPrincipal - previous.cumPrincipal),
        balance: end.balance
      };
      for (const key of ['regular', 'interest', 'principal', 'balance']) {
        cents(actual[key], interval[key], `${quote.id} ${interval.startMonth}-${interval.endMonth} ${key}`);
      }
    }

    const changedRecordOnly = referenceOffer(C, quote);
    changedRecordOnly.tranches[0].effective = quote.effective + 0.01;
    changedRecordOnly.freeMonths = quote.freeMonths + 1;
    changedRecordOnly.commitmentRate = quote.commitmentMonthly + 0.01;
    const recordOnlyResult = C.simulateOffer(global, changedRecordOnly, 120);
    equal(JSON.stringify(recordOnlyResult.rows), JSON.stringify(result.rows.slice(0, 121)), `${quote.id}: record-only fields do not change cash flow`);
  }

  const ing = fixture.banks.find(quote => quote.id === 'ing');
  const wrongGlobal = referenceGlobal(C, fixture, ing);
  wrongGlobal.equity = 260000;
  const wrong = C.simulateOffer(wrongGlobal, referenceOffer(C, ing), 120);
  equal(wrong.valid, false, '50 EUR ING mismatch must remain invalid');
  check(wrong.errors.some(message => message.includes('50')), '50 EUR validation error must remain visible');

  const ingGlobal = referenceGlobal(C, fixture, ing);
  const ingOffer = referenceOffer(C, ing);
  const noAutomaticSpecial = C.simulateOffer(ingGlobal, ingOffer, 120);
  cents(noAutomaticSpecial.rows[120].cumSpecial, 0, 'ING 5% right with zero budget must execute no special repayment');

  const legacy = C.defaults();
  legacy.ui = { tab: 'help', horizon: 7, saleOffer: legacy.offers[1].id, scheduleOffer: legacy.offers[1].id, chartYear: 6 };
  const normalizedLegacy = C.normalize(legacy);
  equal(normalizedLegacy.schema, 1, 'legacy schema remains 1');
  equal(normalizedLegacy.ui.referenceBank, 'cb', 'legacy JSON gets safe reference bank default');
  equal(normalizedLegacy.ui.referenceOffer, normalizedLegacy.offers[0].id, 'legacy JSON gets non-dangling reference offer');
  const selected = C.clone(legacy);
  selected.ui.referenceBank = 'ing';
  selected.ui.referenceOffer = selected.offers[1].id;
  const normalizedSelected = C.normalize(selected);
  equal(normalizedSelected.ui.referenceBank, 'ing', 'reference bank round-trip');
  equal(normalizedSelected.ui.referenceOffer, normalizedSelected.offers[1].id, 'reference offer follows normalized offer by source index');

  const invalid = C.clone(C.defaults());
  invalid.offers[0].tranches[0].amount += 50;
  equal(C.simulateOffer(invalid.global, invalid.offers[0], 120).valid, false, 'invalid work offer stays invalid');
  const shortFix = C.clone(C.defaults());
  shortFix.offers[0].tranches[0].fixedYears = 5;
  equal(C.simulateOffer(shortFix.global, shortFix.offers[0], 120).rows[120].projected, true, 'short fixation marks month 120 as projected');

  for (const text of [html, fs.readFileSync(fixturePath, 'utf8')]) {
    check(!/Ihre_Finanzierungsanfrage|(?:^|[^a-z])Chen\s+und\s+He|\bPIN\b\s*[:=]|@(?:gmail|outlook|icloud)\./i.test(text), 'public runtime data must not contain direct identity markers');
  }

  const report = {
    status: 'PASS',
    command: 'node tests/reference-regression.cjs',
    environment: { node: process.version, platform: `${process.platform}-${process.arch}` },
    assertions,
    fixtureIntervals: fixture.banks.reduce((sum, quote) => sum + quote.schedule.length, 0),
    fixtureAmountAssertions: fixture.banks.reduce((sum, quote) => sum + quote.schedule.length * 4, 0),
    sourceBytes: Buffer.byteLength(html),
    sourceSha256: crypto.createHash('sha256').update(html).digest('hex'),
    businessFormulaSha256: crypto.createHash('sha256').update(currentBusiness).digest('hex'),
    baselineCore: '9c1e0c96eea2054db662b4d1f2d0b1c54e34af9c',
    failures: [],
    limitations: [
      'No daily-interest, staged-drawdown, commitment-fee, or bank-calendar contract behavior was added.',
      'Long-term PDF examples after month 120 remain record-only.'
    ]
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`status: PASS; assertions: ${assertions}; source intervals: 48; source amount checks: 192`);
}

try {
  run();
} catch (error) {
  console.error(`status: FAIL; assertions completed: ${assertions}`);
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
}
