// Review regressions on the production export, using a reduced real public API capture.
// Run npm test, or TEST_BROWSER=webkit node tests/regressions.mjs after installing WebKit.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const fixture = JSON.parse(await readFile(new URL("./fixtures/public-data.json", import.meta.url), "utf8"));
const dist = new URL("../dist/", import.meta.url);
const FAIL_TEXT = "数据拉取失败，10 秒后重试";
const HOUR = 3600000;
const lastHour = Date.parse(fixture.settlements.buckets.at(-1).startAt);
const server = createServer(async (req, res) => {
  const file = new URL(req.url, "http://local").pathname.replace(/^\/preview\//, "") || "index.html";
  try {
    const body = await readFile(new URL(file, dist));
    res.writeHead(200, { "content-type": file.endsWith(".html") ? "text/html; charset=utf-8" : "image/png" }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
const browserType = process.env.TEST_BROWSER === "webkit" ? webkit : chromium;
let browser;
let passed = 0;
function check(name, test) { test(); passed++; console.log("PASS  " + name); }
const errors = [];

async function open(width = 390, initial) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: "UTC" });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.clock.setFixedTime(new Date(lastHour + HOUR + 30000));
  let payload = initial ?? structuredClone(fixture);
  await context.route("https://api.squeekchain.com/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const key = path.endsWith("/status") ? "status" : path.endsWith("/settlements") ? "settlements" : "economy";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload[key]) });
  });
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector("#refresh").textContent === "立即刷新" && document.querySelector("#live-label").textContent !== "连接中");
  return { page, context, async refresh(next) {
    payload = next;
    await page.locator("#refresh").click();
    await page.waitForFunction(() => document.querySelector("#refresh").textContent === "立即刷新");
  } };
}

async function snapshot(page) {
  return page.evaluate(() => ({
    work: document.querySelector("#work-total").textContent,
    pct: document.querySelector("#block-pct").textContent,
    fill: document.querySelector("#block-fill").style.transform,
    minted: document.querySelector("#sqk-minted").textContent,
    round: document.querySelector("#round").textContent,
    board: document.querySelector("#board").innerHTML,
    list: document.querySelector("#settle-list").innerHTML,
    caption: document.querySelector("#chart-caption").textContent,
    selected: state.selectedBar,
    updated: state.lastSuccess,
  }));
}

try {
  browser = await browserType.launch();
  const app = await open();
  const { page } = app;
  const actual = await page.evaluate(() => ({
    records: state.settlements.recent.length,
    first: document.querySelector("#settle-list li").innerText,
    latestTime: state.settlements.recent[0].time,
    times: state.settlements.buckets.map((b) => b.time),
    pct: document.querySelector("#block-pct").textContent,
    accessiblePct: document.querySelector("#block-progress").getAttribute("aria-valuenow"),
    fill: document.querySelector("#block-fill").style.transform,
    caption: document.querySelector("#chart-caption").textContent,
  }));
  check("real recentSettlements records render instead of hourly aggregates", () => {
    assert.equal(actual.records, 10);
    assert.match(actual.first, /结算到第 243 轮/);
    assert.match(actual.first, /\+70 work · 6 个区块/);
    assert.equal(actual.latestTime, Date.parse("2026-10-28T06:20:36.000Z"));
  });
  check("all source startAt timestamps survive a cached response crossing the hour", () => {
    assert.deepEqual(actual.times, fixture.settlements.buckets.map((b) => Date.parse(b.startAt)));
    assert.match(actual.caption, /^20:00 时段/);
  });
  check("visible percentage matches observed reference 75%; fill keeps the precise ratio", () => {
    assert.equal(actual.pct, "75%");
    assert.equal(actual.accessiblePct, "75");
    // CSSOM serializes transform numbers at reduced precision.
    assert.ok(Math.abs(Number(actual.fill.slice(7, -1)) - 0.753319164) < 0.000001);
  });

  const fallback = structuredClone(fixture);
  delete fallback.settlements.recentSettlements;
  await app.refresh(fallback);
  const hourly = await page.locator("#settle-list li").first().innerText();
  check("hourly fallback remains available only without individual records", () => {
    // The capture's 20:00 bucket has no settlements, so the latest active bucket is 19:00.
    assert.match(hourly, /^19:00 时段/);
    assert.match(hourly, /2 小时前/);
  });
  const aliases = await page.evaluate((raw) => {
    raw.buckets[0].startsAt = "2020-01-01T00:00:00Z";
    raw.recent = [{ settledThroughRound: "999", workAdded: "1", completedBlockCount: "0" }];
    const parsed = parseSettlements(raw);
    return { time: parsed.buckets[0].time, round: parsed.recent[0].round };
  }, fixture.settlements);
  check("canonical startAt and recentSettlements take priority over aliases", () => {
    assert.equal(aliases.time, Date.parse(fixture.settlements.buckets[0].startAt));
    assert.equal(aliases.round, "243");
  });

  await app.refresh(structuredClone(fixture));
  await page.locator("#chart").focus();
  await page.keyboard.press("ArrowLeft");
  // Call the public refresh handler directly to retain chart focus/selection during failure.
  // Clicking the refresh button intentionally blurs and resets the chart selection.
  const before = await snapshot(page);
  await page.route("https://api.squeekchain.com/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.evaluate(() => refresh());
  const after = await snapshot(page);
  check("HTTP 200 {} preserves every cached value, leaderboard and chart selection", () => assert.deepEqual(after, before));
  assert.equal(await page.locator("#alert").textContent(), FAIL_TEXT);
  assert.equal(await page.locator("#live-label").textContent(), "离线");
  check("invalid payload switches LIVE off and announces the retry", () => {});
  await page.unrouteAll();
  await app.refresh(structuredClone(fixture));
  assert.equal(await page.locator("#alert").textContent(), "");
  assert.equal(await page.locator("#live-label").textContent(), "LIVE");
  check("valid recovery clears the error and returns LIVE", () => {});

  // Required fields: missing, wrong types, negatives, fractional counts, nonfinite values and bounds.
  const badFields = [
    ["status", "measurement.cumulativeWorkUnits", undefined],
    ["status", "measurement.cumulativeWorkUnits", 1.5],
    ["status", "measurement.rpmMilli", false],
    ["status", "measurement.rpmMilli", "Infinity"],
    ["status", "measurement.speedMmPerSecond", -1],
    ["status", "measurement.coreStatus", "unknown"],
    ["status", "builder.anchor.blockHeight", {}],
    ["status", "builder.anchor.blockProgress", 1000000001],
    ["status", "builder.anchor.blockProgress", null],
    ["settlements", "buckets", null],
    ["settlements", "buckets.0.workAdded", "not a number"],
    ["settlements", "buckets.0.settlementCount", "0.5"],
    ["settlements", "buckets.0.completedBlockCount", undefined],
    ["settlements", "summary.workAdded", " "],
    ["settlements", "summary.settlementCount", []],
    ["economy", "supply.totalMintedBaseUnits", "-1"],
    ["economy", "mining.processedThroughRound", undefined],
  ];
  for (const [endpoint, path, value] of badFields) {
    const bad = structuredClone(fixture);
    const keys = path.split(".");
    const owner = keys.slice(0, -1).reduce((obj, key) => obj[key], bad[endpoint]);
    owner[keys.at(-1)] = value;
    const old = await snapshot(page);
    await app.refresh(bad);
    assert.equal(await page.locator("#alert").textContent(), FAIL_TEXT, path);
    assert.equal(await page.locator("#live-label").textContent(), "离线", path);
    const current = await snapshot(page);
    if (endpoint === "status") { assert.equal(current.work, old.work, path); assert.equal(current.fill, old.fill, path); }
    if (endpoint === "economy") { assert.equal(current.minted, old.minted, path); assert.equal(current.round, old.round, path); }
    if (endpoint === "settlements") { assert.equal(current.board, old.board, path); assert.equal(current.list, old.list, path); }
  }
  check("17 malformed required-field responses fail without erasing the affected cache", () => {});

  const partial = structuredClone(fixture);
  partial.status.measurement.cumulativeWorkUnits = "22074";
  partial.settlements = {};
  partial.economy.supply.totalMintedBaseUnits = "9000000000000000000";
  const oldList = await page.locator("#settle-list").innerHTML();
  await app.refresh(partial);
  assert.equal(await page.locator("#work-total").textContent(), "22,074");
  assert.equal(await page.locator("#sqk-minted").textContent(), "9.00");
  assert.equal(await page.locator("#settle-list").innerHTML(), oldList);
  assert.equal(await page.locator("#alert").textContent(), FAIL_TEXT);
  check("healthy endpoints update independently while the failed endpoint retains data", () => {});

  const empty = structuredClone(fixture);
  empty.settlements = { buckets: [], recentSettlements: [], summary: { workAdded: "0", settlementCount: "0" } };
  await app.refresh(empty);
  const cleared = await page.evaluate(() => ({ caption: document.querySelector("#chart-caption").textContent, selected: state.selectedBar, bars: chartGeom.n }));
  assert.deepEqual(cleared, { caption: "", selected: -1, bars: 0 });
  assert.match(await page.locator("#settle-list").textContent(), /过去 24 小时没有结算/);
  assert.equal(await page.locator("#live-label").textContent(), "LIVE");
  check("a valid empty dataset clears old chart geometry, selection and caption", () => {});

  await app.refresh(structuredClone(fixture));
  await page.locator("#chart").focus();
  await page.keyboard.press("End");
  const shorter = structuredClone(fixture);
  shorter.settlements.buckets = shorter.settlements.buckets.slice(0, 2);
  await page.route("https://api.squeekchain.com/v1/settlements?range=24h", (route) => route.fulfill({ json: shorter.settlements }));
  await page.evaluate(() => refresh());
  assert.equal(await page.evaluate(() => state.selectedBar), -1);
  assert.ok((await page.locator("#chart-caption").textContent()).length > 0);
  await page.unrouteAll();
  check("a shorter valid series resets an out-of-range selected bar without throwing", () => {});

  const zero = structuredClone(fixture);
  zero.status.measurement.cumulativeWorkUnits = "0";
  zero.status.builder.anchor = { blockHeight: "0", blockProgress: "0" };
  zero.economy = { supply: { totalMintedBaseUnits: "0" }, mining: { processedThroughRound: "0" } };
  zero.settlements.recentSettlements[0].completedBlockCount = "0";
  await app.refresh(zero);
  assert.equal(await page.locator("#live-label").textContent(), "LIVE");
  assert.equal(await page.locator("#block-pct").textContent(), "0%");
  assert.match(await page.locator("#settle-list li").first().innerText(), /0 个区块/);
  check("legitimate zero values and zero completed blocks remain visible", () => {});
  await app.context.close();

  const initialBad = await open(390, { status: {}, settlements: {}, economy: {} });
  assert.equal(await initialBad.page.locator("#alert").textContent(), FAIL_TEXT);
  assert.equal(await initialBad.page.locator("#live-label").textContent(), "离线");
  assert.match(await initialBad.page.locator("#settle-list").textContent(), /拿到结算数据后/);
  assert.ok((await initialBad.page.locator("body").innerText()).length > 200);
  assert.equal(await initialBad.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
  check("initial HTTP 200 {} shows failure and an intact mobile page, not fabricated zero activity", () => {});
  await initialBad.context.close();

  const desktop = await open(1440);
  assert.match(await desktop.page.locator("#settle-list li").first().innerText(), /结算到第 243 轮/);
  assert.equal(await desktop.page.locator("#block-pct").textContent(), "75%");
  assert.equal(await desktop.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
  check("desktop renders the same real settlement and percentage without overflow", () => {});
  await desktop.context.close();
  check("zero console or script errors across valid and invalid JSON cases", () => assert.deepEqual(errors, []));
  console.log(`\n${passed}/${passed} regression checks passed (${browserType.name()})`);
} finally {
  await browser?.close();
  server.close();
}
