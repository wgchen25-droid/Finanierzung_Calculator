#!/usr/bin/env node

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(root, 'src/calculator.html');
const fixturePath = resolve(root, 'reference-data.json');
const assetsDir = resolve(root, 'assets');
const payloadCount = 5;
const payloadPattern = /^payload-(\d+)\.js$/;
const payloadPrefix = 'window.__MORTGAGE_PAYLOAD=(window.__MORTGAGE_PAYLOAD||"")+"';
const payloadSuffix = '";\n';
const referencePattern = /(<script id="reference-data" type="application\/json">)(.*?)(<\/script>)/s;

function fail(message) {
  throw new Error(message);
}

function strictBase64(text) {
  if (!text || text.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) fail('Payload is not strict Base64.');
  const bytes = Buffer.from(text, 'base64');
  if (bytes.toString('base64') !== text) fail('Payload Base64 is not canonical.');
  return bytes;
}

async function payloadFiles() {
  const names = (await readdir(assetsDir))
    .filter(name => payloadPattern.test(name))
    .sort((a, b) => Number(a.match(payloadPattern)[1]) - Number(b.match(payloadPattern)[1]));
  if (names.length !== payloadCount || names.some((name, index) => name !== `payload-${index + 1}.js`)) {
    fail(`Expected exactly payload-1.js through payload-${payloadCount}.js.`);
  }
  return names.map(name => resolve(assetsDir, name));
}

async function decodePayload() {
  let encoded = '';
  for (const path of await payloadFiles()) {
    const text = await readFile(path, 'utf8');
    const match = text.match(/^window\.__MORTGAGE_PAYLOAD=\(window\.__MORTGAGE_PAYLOAD\|\|""\)\+"([A-Za-z0-9+/=]+)";\n?$/);
    if (!match) fail(`Unsupported payload wrapper: ${basename(path)}`);
    encoded += match[1];
  }
  const bytes = gunzipSync(strictBase64(encoded));
  const html = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!html.includes('window.MortgageCore') || !html.includes('id="page-help"')) fail('Decoded payload is not the expected calculator.');
  return html;
}

async function syncedSource() {
  const html = await readFile(sourcePath, 'utf8');
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  const canonicalFixture = JSON.stringify(fixture).replaceAll('<', '\\u003c');
  if (!referencePattern.test(html)) fail('Source is missing the reference-data script.');
  return html.replace(referencePattern, `$1${canonicalFixture}$3`);
}

function generatedPayloads(html) {
  const encoded = gzipSync(Buffer.from(html), { level: 9, mtime: 0 }).toString('base64');
  const size = Math.ceil(encoded.length / payloadCount);
  return Array.from({ length: payloadCount }, (_, index) =>
    payloadPrefix + encoded.slice(index * size, (index + 1) * size) + payloadSuffix
  );
}

async function checkIndex() {
  const index = await readFile(resolve(root, 'index.html'), 'utf8');
  const refs = [...index.matchAll(/<script src="assets\/payload-(\d+)\.js"><\/script>/g)].map(match => Number(match[1]));
  if (refs.length !== payloadCount || refs.some((value, index) => value !== index + 1)) {
    fail(`index.html must reference exactly payload-1.js through payload-${payloadCount}.js in order.`);
  }
}

async function extract() {
  await mkdir(dirname(sourcePath), { recursive: true });
  const html = await decodePayload();
  await writeFile(sourcePath, html, 'utf8');
  console.log(`Extracted ${sourcePath} (${Buffer.byteLength(html)} bytes).`);
}

async function build(checkOnly) {
  await checkIndex();
  const html = await syncedSource();
  const generated = generatedPayloads(html);
  const files = await payloadFiles();

  if (checkOnly) {
    const currentSource = await readFile(sourcePath, 'utf8');
    if (currentSource !== html) fail('src/calculator.html does not contain the canonical reference-data.json fixture. Run npm run build.');
    for (let index = 0; index < files.length; index += 1) {
      if (await readFile(files[index], 'utf8') !== generated[index]) fail(`${basename(files[index])} is stale. Run npm run build.`);
    }
  } else {
    await writeFile(sourcePath, html, 'utf8');
    await Promise.all(files.map((path, index) => writeFile(path, generated[index], 'utf8')));
  }

  const decoded = await decodePayload();
  if (decoded !== html) fail('Decoded payload does not exactly equal src/calculator.html.');
  console.log(`${checkOnly ? 'Verified' : 'Built'} ${payloadCount} deterministic payloads; decoded output exactly matches src/calculator.html (${Buffer.byteLength(html)} bytes).`);
}

const command = process.argv[2];
if (command === '--extract') await extract();
else if (command === '--check') await build(true);
else if (!command) await build(false);
else fail(`Unknown option: ${command}`);
