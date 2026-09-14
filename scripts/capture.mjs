import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
for (const [name, width, height] of [
  ["desktop", 1440, 1100],
  ["mobile", 390, 844],
]) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173");
  await page
    .getByRole("heading", { name: "Find your missing seconds." })
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: `.impeccable/review/${name}.png`,
    fullPage: true,
  });
  console.log(
    name,
    await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      tiles: document.querySelectorAll(".leaflet-tile-loaded").length,
      text: document.querySelector(".telemetry-stats")?.textContent,
    })),
  );
  await page.close();
}
console.log("Runtime errors:", errors);
await browser.close();
