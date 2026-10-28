// Interaction smoke test for the production export in dist/.
// The three Squeekchain endpoints are answered from fixtures below, so the test is repeatable offline;
// the real API's field paths are the ones the brief lists. Run: npm run build && npm test
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const FAIL_TEXT = "数据拉取失败，10 秒后重试";
const HOUR = 3600000;

/* ---------- fixtures ---------- */
let work = 123456789012n;
let progress = 637412345;
function statusFixture() {
  return {
    measurement: { cumulativeWorkUnits: String(work), rpmMilli: 42500, speedMmPerSecond: 312, coreStatus: "SPINNING", receivedAt: new Date(Date.now() - 90000).toISOString() },
    builder: { anchor: { blockHeight: "1752", blockProgress: progress } },
  };
}
const now = Math.floor(Date.now() / HOUR) * HOUR;
const buckets = Array.from({ length: 24 }, (_, i) => ({
  startAt: new Date(now - (23 - i) * HOUR).toISOString(),
  workAdded: String(40000 + ((i * 7919) % 31) * 1500),
  settlementCount: i % 3 === 0 ? 2 : 0,
  completedBlockCount: i % 4 === 0 ? 1 : 0,
}));
function settlementsFixture() {
  return { range: "24h", buckets, summary: { settlementCount: 16, workAdded: String(buckets.reduce((a, b) => a + Number(b.workAdded), 0)) } };
}
const economyFixture = { supply: { totalMintedBaseUnits: "5603205665827975025624674" }, mining: { processedThroughRound: "328" } };

/* ---------- static server for dist/ under a subpath ---------- */
const types = { ".html": "text/html; charset=utf-8", ".png": "image/png" };
const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://x").pathname.replace(/^\/preview\/?/, "") || "index.html";
  try {
    res.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream" }).end(await readFile(join(dist, path)));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/preview/`;

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
}

let apiMode = "online";
async function routeApi(context) {
  await context.route("https://api.squeekchain.com/**", (route) => {
    if (apiMode === "offline") return route.abort("internetdisconnected");
    const u = new URL(route.request().url());
    const body = u.pathname.endsWith("/status") ? statusFixture() : u.pathname.endsWith("/settlements") ? settlementsFixture() : economyFixture;
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  });
}

const browser = await chromium.launch();
try {
  /* 1. Phone 390: values within 10 s, no console errors, no horizontal scroll */
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await routeApi(context);
    const page = await context.newPage();
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(e.message));
    const t0 = Date.now();
    await page.goto(url);
    await page.waitForFunction(() => /\d/.test(document.getElementById("work-total").textContent) && document.querySelectorAll("#board tr").length === 5, null, { timeout: 10000 });
    check("all numbers filled within 10 s", true, `${Date.now() - t0} ms`);
    const ids = ["block-height", "block-pct", "work-total", "rpm", "speed", "sqk-minted", "round", "chart-total", "settle-count", "race-note"];
    const texts = await page.evaluate((ids) => ids.map((id) => document.getElementById(id).textContent), ids);
    check("every stat has a numeric value", texts.every((t) => /\d/.test(t)), texts.join(" | "));
    // Reference homepage displays a floored integer, while the bar keeps its precise ratio.
    check("block progress uses the reference homepage's integer precision", texts[1] === "63%", `${texts[1]} vs 63%`);
    check("thousands separators", texts[2] === "123,456,789,012" && texts[5] === "5,603,205.66", `${texts[2]} / ${texts[5]}`);
    const live = await page.textContent("#live-label");
    check("LIVE light on", live === "LIVE");
    const firstScreen = await page.evaluate(() => {
      const r = document.getElementById("track").getBoundingClientRect();
      return { top: Math.round(r.top), vh: innerHeight };
    });
    check("race track starts on the first 390x844 screen", firstScreen.top < firstScreen.vh - 120, `track top ${firstScreen.top}px`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("no horizontal scroll at 390", overflow <= 0, `overflow ${overflow}px`);
    const xs1 = await page.$$eval(".runner", (els) => els.map((e) => e.style.getPropertyValue("--x")));
    check("runners placed by work share", xs1.some((x) => parseInt(x) > 0), xs1.join(","));
    const medals = await page.$$eval("#board .rank", (els) => els.slice(0, 3).map((e) => e.className));
    check("top three carry medal styles", medals.join() === "rank rank-1,rank rank-2,rank rank-3", medals.join(" / "));

    // chart keyboard interaction
    await page.focus("#chart");
    const cap0 = await page.textContent("#chart-caption");
    await page.keyboard.press("ArrowLeft");
    const cap1 = await page.textContent("#chart-caption");
    await page.keyboard.press("Home");
    const cap2 = await page.textContent("#chart-caption");
    check("chart arrow keys change the selected hour", cap0 !== cap1 && cap1 !== cap2, `${cap1} -> ${cap2}`);

    // manual refresh with new data moves the work counter and re-splits the current hour
    work += 98765n;
    progress = 912345678;
    buckets[23].workAdded = String(Number(buckets[23].workAdded) + 250000);
    await page.click("#refresh");
    await page.waitForFunction(() => document.getElementById("block-pct").textContent === "91%", null, { timeout: 10000 });
    const xs2 = await page.$$eval(".runner", (els) => els.map((e) => e.style.getPropertyValue("--x")));
    check("refresh button updates values and moves runners", xs2.join() !== xs1.join(), xs2.join(","));
    check("session work delta shown", (await page.textContent("#work-delta")).includes("98,765"));

    // automatic 10 s refresh
    const before = await page.evaluate(() => performance.getEntriesByType("resource").filter((e) => e.name.includes("/v1/status")).length);
    await page.waitForTimeout(10600);
    const after = await page.evaluate(() => performance.getEntriesByType("resource").filter((e) => e.name.includes("/v1/status")).length);
    check("auto refresh every 10 s", after > before, `${before} -> ${after} status requests`);

    check("zero console errors while online", errors.length === 0, errors.join(" | "));

    // failure after success keeps last values and shows the banner (the aborted requests log
    // "Failed to load resource" by design, so console errors are counted before this step)
    apiMode = "offline";
    await page.click("#refresh");
    await page.waitForFunction((t) => document.getElementById("alert").textContent === t, FAIL_TEXT, { timeout: 10000 });
    check("failure keeps last numbers", /\d/.test(await page.textContent("#work-total")));
    check("LIVE light turns off on failure", (await page.textContent("#live-label")) === "离线");
    apiMode = "online";
    await page.click("#refresh");
    await page.waitForFunction(() => document.getElementById("alert").textContent === "", null, { timeout: 10000 });
    check("banner clears after recovery", true);
    await page.screenshot({ path: process.env.SHOT_DIR ? join(process.env.SHOT_DIR, "smoke-390.png") : undefined, fullPage: true });
    await context.close();
  }

  /* 2. Offline from the first load: banner, never a blank page */
  {
    apiMode = "offline";
    const context = await browser.newContext({ viewport: { width: 320, height: 640 } });
    await routeApi(context);
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction((t) => document.getElementById("alert").textContent === t, FAIL_TEXT, { timeout: 10000 });
    check("offline first load shows the failure text", true, FAIL_TEXT);
    const visible = await page.evaluate(() => document.body.innerText.length);
    check("offline page not blank", visible > 200, `${visible} chars of text`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("no horizontal scroll at 320", overflow <= 0, `overflow ${overflow}px`);
    await context.setOffline(true);
    await context.close();
    apiMode = "online";
  }

  /* 3. Desktop 1440: two columns */
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await routeApi(context);
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(() => document.querySelectorAll("#board tr").length === 5);
    const cols = await page.evaluate(() => {
      const race = document.querySelector(".race").getBoundingClientRect();
      const board = document.querySelector(".board").getBoundingClientRect();
      return { raceLeft: race.left, boardLeft: board.left, sameRow: Math.abs(race.top - board.top) < 2 };
    });
    check("desktop shows race and leaderboard side by side", cols.sameRow && cols.boardLeft > cols.raceLeft);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("no horizontal scroll at 1440", overflow <= 0);
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
