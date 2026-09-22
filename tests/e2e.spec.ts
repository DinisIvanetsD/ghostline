import { test, expect, type Page } from "@playwright/test";
import { Encoder, Profile } from "@garmin/fitsdk";
import { readFile } from "node:fs/promises";

const gpx = (
  points: Array<{ lat: number; lon: number; ele?: number; time?: number }>,
  timed = true,
) =>
  `<?xml version="1.0"?><gpx version="1.1" creator="Ghostline"><trk><trkseg>${points.map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}"><ele>${p.ele ?? 0}</ele>${timed && p.time ? `<time>${new Date(p.time).toISOString()}</time>` : ""}</trkpt>`).join("")}</trkseg></trk></gpx>`;

async function demo(page: Page) {
  return page.evaluate(async () =>
    (await import("/src/lib/demo.ts")).createDemoData(),
  );
}
async function blockTiles(page: Page) {
  await page.route(
    "**/{tile.openstreetmap.org,basemaps.cartocdn.com}/**",
    (route) => route.abort(),
  );
}

async function open(page: Page, label: string) {
  await page.getByRole("button", { name: label, exact: true }).click();
}
function faster(
  points: Array<{ lat: number; lon: number; ele?: number; time?: number }>,
  factor: number,
) {
  const start = points[0].time ?? 0;
  return points.map((p) => ({
    ...p,
    time: start + ((p.time ?? start) - start) * factor,
  }));
}

function fit(points: Array<{ lat: number; lon: number; ele: number; time: number }>) {
  const encoder = new Encoder();
  const write = (messageNumber: number, message: object) =>
    encoder.onMesg(
      messageNumber,
      message as unknown as Parameters<Encoder["onMesg"]>[1],
    );
  write(Profile.MesgNum.FILE_ID, {
    manufacturer: "development",
    product: 1,
    timeCreated: new Date(points[0].time),
    type: "activity",
  });
  for (const point of points) {
    write(Profile.MesgNum.RECORD, {
      timestamp: new Date(point.time),
      positionLat: Math.round((point.lat / 180) * 2 ** 31),
      positionLong: Math.round((point.lon / 180) * 2 ** 31),
      altitude: point.ele,
    });
  }
  return Buffer.from(encoder.close());
}

test.beforeEach(async ({ page }) => {
  await blockTiles(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(() => localStorage.removeItem("ghostline.video-projects.v1"));
  await page.reload();
});

test("demo analysis has seven primary runs, stable PB, sector selection, reference, progress and elevation", async ({
  page,
}) => {
  await expect(page.getByText("DEMO SESSION")).toBeVisible();
  await expect(page.locator('select[aria-label="Selected trail"]')).toHaveValue(
    "mundial",
  );
  await expect(page.getByRole("button", { name: /S4/ })).toBeVisible();
  await expect(page.getByLabel("Current run")).toContainText(
    "Run 05 · Personal best",
  );
  await expect(page.getByLabel("Current run")).toContainText(
    "Run 05 · Personal best",
  );
  await expect(page.locator("body")).not.toContainText("NaN");

  await page.getByRole("button", { name: /S4/ }).click();
  await expect(page.getByRole("button", { name: /S4/ })).toHaveClass(
    /selected/,
  );
  await page.getByLabel("Reference run").selectOption("run-01");
  await expect(page.getByText("REFERENCE", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Elevation" }).click();
  await expect(
    page.getByRole("img", { name: /elevation over distance/i }),
  ).toBeVisible();
  const slider = page.locator('input[type="range"]');
  await slider.fill("800");
  await expect(slider).toHaveValue("800");

  const trail = page.locator('select[aria-label="Selected trail"]');
  await trail.selectOption("free-ride");
  await expect(page.getByLabel("Current run")).toContainText(
    "Run 08 · Easy flow",
  );
  await expect(page.locator("body")).not.toContainText("NaN");
  await trail.selectOption("mundial");
  await expect(page.getByLabel("Current run")).toContainText(
    "Run 05 · Personal best",
  );
});

test("history search, analyze, delete and PB recomputation work", async ({
  page,
}) => {
  await open(page, "Run history");
  await expect(page.getByRole("button", { name: "Share" }).first()).toBeDisabled();
  const search = page.getByRole("textbox", { name: "Search runs" });
  await search.fill("Personal best");
  await expect(
    page.getByText("Run 05 · Personal best", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("tbody").getByText("Run 01 · Warm up")).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await expect(page.getByText("Against the Ghost")).toBeVisible();
  await open(page, "Run history");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete Run 05 · Personal best" })
    .click();
  await search.fill("");
  await expect(page.getByText("Run 05 · Personal best")).toHaveCount(0);
  await expect(
    page.getByRole("row", { name: /Run 03 · Full send/ }),
  ).toContainText("PB");
  await open(page, "Run analysis");
  await expect(page.locator(".reference-time")).toContainText("2:59.00");
});

test("video lab keeps the sync workflow focused on a selected ride", async ({
  page,
}) => {
  await open(page, "Video lab");
  await expect(page.getByText("Line up the ride.")).toBeVisible();
  await expect(page.getByLabel("Video trail")).toHaveValue("mundial");
  await expect(page.getByLabel("Video run")).toContainText(
    "Run 05 · Personal best",
  );
  await expect(page.getByText("Drop in your ride footage.")).toBeVisible();
  await expect(page.getByText("AI-ready by design.")).toBeVisible();
  await page.getByLabel("Video trail").selectOption("free-ride");
  await expect(page.getByLabel("Video run")).toContainText("Run 09 · Valley sprint");
  await expect(page.locator("body")).not.toContainText("NaN");
  const viewport = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(viewport.width).toBeLessThanOrEqual(viewport.viewport + 1);
});

test("video lab loads a playable DJI Mimo clip and exports its sync plan", async ({
  page,
}) => {
  await open(page, "Video lab");
  const video = await readFile(new URL("./fixtures/dji-mimo-sample.webm", import.meta.url));
  await page.getByLabel("Choose video file").first().setInputFiles({
    name: "dji-mimo-run.webm",
    mimeType: "video/webm",
    buffer: video,
  });
  await expect(page.getByText("dji-mimo-run.webm")).toBeVisible();
  await expect.poll(() => page.locator("video").evaluate((element) => element.duration)).toBeGreaterThan(0);
  await expect(page.getByText("Make the clocks agree")).toBeVisible();
  await expect(page.getByLabel("Video timeline")).toBeEnabled();
  const mapPane = page.locator(".leaflet-map-pane");
  await page.locator(".leaflet-control-zoom-in").click();
  const zoomedMapStyle = await mapPane.getAttribute("style");
  const timeline = page.getByLabel("Video timeline");
  const scrubTime = Math.min(0.8, Number(await timeline.getAttribute("max")) * 0.7);
  await timeline.fill(String(scrubTime));
  await expect.poll(() => mapPane.getAttribute("style")).toBe(zoomedMapStyle);
  const sectorWindow = page.locator(".sector-video-row").first().locator("small");
  const normalWindow = await sectorWindow.innerText();
  await page.getByLabel("Video playback rate").selectOption("2");
  await expect(sectorWindow).toHaveText(normalWindow);
  await page.getByRole("button", { name: "Play video" }).click();
  await expect.poll(() => page.locator("video").evaluate((element) => !element.paused)).toBe(true);
  await page.getByLabel("GPS start offset").fill("0.4");
  await expect(page.getByLabel("GPS start offset")).toHaveValue("0.4");
  const originalRun = await page.getByLabel("Video run").inputValue();
  await page.getByLabel("Video run").selectOption({ index: 1 });
  await page.getByLabel("Video run").selectOption(originalRun);
  await expect(page.getByLabel("GPS start offset")).toHaveValue("0.4");
  const eventRow = page.locator(".riding-event-row").first();
  await eventRow.click();
  await expect(eventRow).toHaveClass(/selected/);
  await page.getByRole("button", { name: "Scan GPS stops" }).click();
  await page.getByRole("button", { name: "Apply ride window" }).click();
  await expect(page.getByText(/Output window/)).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download edit plan" }).click();
  const planDownload = await download;
  const planPath = await planDownload.path();
  expect(planPath).toBeTruthy();
  const plan = JSON.parse(await readFile(planPath!, "utf8")) as { sync: { offsetSeconds: number }; trim: { start: number; end: number } };
  expect(plan.sync.offsetSeconds).toBe(0.4);
  expect(plan.trim.end).toBeGreaterThan(plan.trim.start);
  const rendered = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export overlay WebM" }).click();
  const renderedDownload = await rendered;
  expect(renderedDownload.suggestedFilename()).toMatch(/ghostline\.webm$/);
  const renderedPath = await renderedDownload.path();
  expect(renderedPath).toBeTruthy();
  await expect.poll(async () => (await readFile(renderedPath!)).byteLength, { timeout: 10_000 }).toBeGreaterThan(100);
  await expect(page.getByText("Overlay clip downloaded")).toBeVisible();
});

test("video lab reports an unsupported local clip", async ({ page }) => {
  await open(page, "Video lab");
  await page.getByLabel("Choose video file").first().setInputFiles({
    name: "broken-dji-export.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("not-a-video"),
  });
  await expect(page.getByText("broken-dji-export.mp4")).toBeVisible();
  await expect(page.getByText(/could not be decoded/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Download edit plan" })).toBeDisabled();
});

test("video lab restores two point sync when the same clip is reattached", async ({ page }) => {
  await open(page, "Video lab");
  const video = await readFile(new URL("./fixtures/dji-mimo-sample.webm", import.meta.url));
  await page.getByLabel("Choose video file").first().setInputFiles({
    name: "dji-mimo-anchors.webm",
    mimeType: "video/webm",
    buffer: video,
  });
  await expect.poll(() => page.locator("video").evaluate((element) => element.duration)).toBeGreaterThan(0);
  const timeline = page.getByLabel("Video timeline");
  await timeline.fill("0.2");
  await page.getByRole("button", { name: "Mark start" }).click();
  // Keep a little room before the final frame so the range input receives a
  // valid value in all Chromium builds.
  await timeline.fill("4");
  await page.getByRole("button", { name: "Mark finish" }).click();
  await expect(page.locator(".sync-anchors")).toContainText("2 anchors");
  await expect.poll(() => page.evaluate(() => {
    const projects = JSON.parse(localStorage.getItem("ghostline.video-projects.v1") ?? "{}");
    return projects["run-07"]?.videoName ?? "";
  })).toBe("dji-mimo-anchors.webm");
  await page.reload();
  await open(page, "Video lab");
  await expect.poll(() => page.evaluate(() => {
    const projects = JSON.parse(localStorage.getItem("ghostline.video-projects.v1") ?? "{}");
    return projects["run-07"]?.videoName ?? "";
  })).toBe("dji-mimo-anchors.webm");
  await expect(page.getByText("Pick up your synced run.")).toBeVisible();
  await page.getByLabel("Choose video file").first().setInputFiles({
    name: "dji-mimo-anchors.webm",
    mimeType: "video/webm",
    buffer: video,
  });
  await expect(page.locator(".sync-anchors")).toContainText("2 anchors");
});

test("garage supports add edit delete and protects referenced bikes", async ({
  page,
}) => {
  await open(page, "Bike garage");
  await page.getByLabel("Name").fill("Unused rig");
  await page.getByLabel("Brand").fill("Test brand");
  await page.getByLabel("Travel (mm)").fill("160");
  await page.getByRole("button", { name: "Add bike" }).click();
  await expect(page.getByText("Unused rig")).toBeVisible();
  await page.getByRole("article").filter({ hasText: "Unused rig" }).locator("summary").click();
  await page.getByLabel("Unused rig service description").fill("Fork lower service");
  await page.getByRole("button", { name: "Log service" }).click();
  await expect(page.getByText("Fork lower service")).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem("ghostline.data.v1") ?? "{}");
    return workspace.bikes.find((bike: { name?: string }) => bike.name === "Unused rig")?.serviceHistory?.length ?? 0;
  })).toBe(1);
  await page.getByTitle("Edit Unused rig").click();
  await page.getByLabel("Name").fill("Edited rig");
  await page.getByRole("button", { name: "Update bike" }).click();
  await expect(page.getByText("Edited rig")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTitle("Delete Edited rig").click();
  await expect(page.getByText("Edited rig")).toHaveCount(0);
  await page.getByTitle("Delete Enduro 29").click();
  await expect(page.getByRole("alert")).toContainText(
    "referenced by saved runs",
  );
});

test("profile save persists across reload", async ({ page }) => {
  await page.getByRole("button", { name: /Alex Morgan/ }).click();
  await page.getByLabel("Rider name").fill("Rider Persisted");
  await page.getByLabel("Email").fill("persisted@example.com");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("ghostline.data.v1") ?? "{}").profile
            ?.name,
      ),
    )
    .toBe("Rider Persisted");
  await page.reload();
  await page.getByRole("button", { name: /Rider Persisted/ }).click();
  await expect(page.getByLabel("Rider name")).toHaveValue("Rider Persisted");
  await expect(page.getByLabel("Email")).toHaveValue("persisted@example.com");
});

test("manual trail, timestamped route imports, PB change, sector edit and compare", async ({
  page,
}) => {
  const data = await demo(page);
  const route = gpx(data.trails[0].points, false);
  const fast = gpx(faster(data.runs[5].points, 0.8), true);
  const slow = gpx(data.runs[0].points, true);
  await open(page, "Trails");
  await page.getByRole("button", { name: "New trail" }).click();
  await page.getByLabel("Trail name").fill("Manual test trail");
  await page.getByLabel("Location").fill("Test valley");
  await page.getByRole("button", { name: "Save trail" }).click();
  await expect(page.getByText("Manual test trail")).toBeVisible();
  await page.getByRole("button", { name: "Import GPX / FIT route" }).click();
  await page
    .locator('input[type="file"]')
    .nth(0)
    .setInputFiles({
      name: "manual-route.gpx",
      mimeType: "application/gpx+xml",
      buffer: Buffer.from(route),
    });
  await expect(page.getByText("manual-route")).toBeVisible();

  await page.getByRole("button", { name: "Import run" }).click();
  await page
    .locator("label.field")
    .filter({ hasText: /^Trail/ })
    .locator("select")
    .selectOption({ label: "Manual test trail" });
  await page.getByRole("button", { name: /Choose GPX or FIT file/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "slow.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from(slow),
  });
  await page.getByRole("button", { name: "Save run" }).click();
  await expect(page.getByText("Against the Ghost")).toBeVisible();
  await page.getByRole("button", { name: "Import run" }).click();
  await page
    .locator("label.field")
    .filter({ hasText: /^Trail/ })
    .locator("select")
    .selectOption({ label: "Manual test trail" });
  await page.getByRole("button", { name: /Choose GPX or FIT file/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "fast.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from(fast),
  });
  await page.getByRole("button", { name: "Save run" }).click();
  await expect(page.locator(".pb-badge").first()).toBeVisible();
  await expect(page.getByLabel("Current run").locator("option")).toHaveCount(2);
  await page
    .getByLabel("Reference run")
    .selectOption({ label: "slow · 3:03.00" });
  await expect(page.locator(".time-comparison")).toContainText("-39.00s");

  await open(page, "Trails");
  await page.getByTitle("Edit Manual test trail").click();
  await page.getByLabel("Sector boundaries").fill("0.3, 0.7");
  await page.getByLabel("Sector names").fill("Start, Middle, Finish");
  await page.getByRole("button", { name: "Save trail" }).click();
  await expect(page.getByText("Manual test trail")).toBeVisible();
  await page
    .locator(".trail-row")
    .filter({ hasText: "Manual test trail" })
    .getByRole("button", { name: "Select analysis" })
    .click();
  await expect(page.locator(".sector-row")).toHaveCount(3);
});

test("FIT activity imports through the run workflow", async ({ page }) => {
  const data = await demo(page);
  await open(page, "Import run");
  await page.getByRole("button", { name: /Choose GPX or FIT file/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "mundial-run.fit",
    mimeType: "application/octet-stream",
    buffer: fit(data.runs[0].points),
  });
  await expect(page.getByText(/points ·/)).toBeVisible();
  await page.getByRole("button", { name: "Save run" }).click();
  await expect(page.getByText("Against the Ghost")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem("ghostline.data.v1") ?? "{}");
        return saved.runs?.some(
          (run: { trailId?: string; synthetic?: boolean }) =>
            run.trailId === "mundial" && run.synthetic,
        ) ?? false;
      }),
    )
    .toBe(false);
});

test("sample GPX download can be imported as a real practice run", async ({ page }) => {
  await page.getByRole("button", { name: "Import run" }).click();
  const downloadReady = page.waitForEvent("download");
  await page.getByRole("button", { name: "Try a sample GPX" }).click();
  const download = await downloadReady;
  expect(download.suggestedFilename()).toBe("ghostline-demo-run.gpx");
  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  await page.locator('input[type="file"]').setInputFiles(filePath!);
  await expect(page.getByText(/points ·/)).toBeVisible();
  await page.getByRole("button", { name: "Save run" }).click();
  await expect(page.getByText("Against the Ghost")).toBeVisible();
  const imported = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem("ghostline.data.v1") ?? "{}");
    return workspace.runs?.at(-1) ?? null;
  });
  expect(imported?.points.length).toBeGreaterThan(100);
  expect(imported?.synthetic).not.toBe(true);
});

test("Secret Spot imports stop at the marked physical finish", async ({ page }) => {
  const data = await demo(page);
  const secret = data.trails.find((trail: { id: string }) => trail.id === "secret-spot")!;
  const start = Date.parse("2026-09-14T09:00:00Z");
  const route = secret.points.map((point: { lat: number; lon: number; ele: number }, index: number) => ({
    ...point,
    time: start + index * 1000,
  }));
  const withForgottenTail = [
    ...route,
    { lat: 41.5635, lon: -8.3733, ele: 440, time: route.at(-1)!.time + 1000 },
    { lat: 41.565, lon: -8.374, ele: 435, time: route.at(-1)!.time + 2000 },
  ];
  await open(page, "Import run");
  await page
    .locator("label.field")
    .filter({ hasText: /^Trail/ })
    .locator("select")
    .selectOption("secret-spot");
  await expect(page.getByText(/Secret Spot finish gate/)).toBeVisible();
  await page.getByRole("button", { name: /Choose GPX or FIT file/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "secret-with-tail.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from(gpx(withForgottenTail)),
  });
  await page.getByRole("button", { name: "Save run" }).click();
  await expect(page.getByText("Against the Ghost")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem("ghostline.data.v1") ?? "{}");
      const run = saved.runs?.at(-1);
      return { count: run?.points?.length ?? 0, last: run?.points?.at(-1) ?? null };
    }))
    .toMatchObject({ count: route.length, last: { lat: 41.5628056, lon: -8.3732222 } });
});

test("first real ride can replace a demo trail route", async ({ page }) => {
  const data = await demo(page);
  const shifted = data.runs[0].points.map((point) => ({
    ...point,
    lat: point.lat + 0.02,
    lon: point.lon + 0.02,
  }));
  await open(page, "Import run");
  await page.getByRole("button", { name: /Choose GPX or FIT file/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "secret-spot-sameiro.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from(gpx(shifted)),
  });
  await page.getByRole("button", { name: "Save run" }).click();
  await expect(page.getByText("Against the Ghost")).toBeVisible();
  await expect(page.getByLabel("Current run")).toContainText(
    "secret-spot-sameiro",
  );
});

test("invalid GPX gives a useful error and mobile management screens do not overflow", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Import run", exact: true }).click();
  await page.getByRole("button", { name: /Choose GPX or FIT file/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "bad.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from("<gpx/>"),
  });
  await expect(page.getByRole("alert")).toContainText("track points");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const label of ["Bike garage", "Trails", "Import run"]) {
    if (label === "Import run")
      await page.getByRole("button", { name: "Import run" }).click();
    else await open(page, label);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= 390),
      )
      .toBe(true);
  }
});

test("backup restore updates profile draft and keeps restored data after saving", async ({
  page,
}) => {
  const data = await demo(page);
  data.profile = {
    name: "Restored rider",
    email: "restore@example.com",
    home: "Restored valley",
  };
  await page.getByRole("button", { name: /Alex Morgan/ }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('input[type="file"]').setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await expect(page.getByLabel("Rider name")).toHaveValue("Restored rider");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("ghostline.data.v1")!).profile.name,
      ),
    )
    .toBe("Restored rider");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export all data" }).click();
  expect((await download).suggestedFilename()).toBe("ghostline-backup.json");
});

test("mobile analysis, replay, empty state and corrupt storage recover without runtime errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 360, height: 800 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(360);
  const slider = page.locator('input[type="range"]');
  await slider.fill("200");
  await page.getByRole("button", { name: "Replay run · 4×" }).click();
  await expect.poll(() => slider.inputValue()).not.toBe("200");
  await page.getByRole("button", { name: "Pause replay" }).click();
  const data = await demo(page);
  data.runs = [];
  data.trails = [];
  data.bikes = [];
  await page.evaluate(
    (value) => localStorage.setItem("ghostline.data.v1", JSON.stringify(value)),
    data,
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your Ghost starts with one run." }),
  ).toBeVisible();
  await page.evaluate(() =>
    localStorage.setItem("ghostline.data.v1", "broken"),
  );
  await page.reload();
  await expect(page.getByRole("status")).toContainText("could not be loaded");
  await expect(
    page.getByRole("heading", { name: "Find your missing seconds." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("sector inspection pauses replay and progression resizes after an empty trail", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Replay run · 4×" }).click();
  await page.getByRole("button", { name: /S2 Pines/ }).click();
  await expect(
    page.getByRole("button", { name: "Replay run · 4×" }),
  ).toBeVisible();
  await expect(page.locator('input[type="range"]')).toHaveValue("375");
  const data = await demo(page);
  data.trails.push({ ...data.trails[0], id: "empty", name: "Empty trail" });
  await page.evaluate(
    (value) => localStorage.setItem("ghostline.data.v1", JSON.stringify(value)),
    data,
  );
  await page.reload();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Selected trail").selectOption("empty");
  await open(page, "Run history");
  await expect(
    page.getByText("Import a run to start your progression."),
  ).toBeVisible();
  await page.getByLabel("Selected trail").selectOption("mundial");
  await expect
    .poll(() =>
      page
        .locator(".progression svg")
        .evaluate((e) => Number(e.getAttribute("viewBox")!.split(" ")[2])),
    )
    .toBeLessThan(390);
});

test("invalid private run links show a useful return path", async ({ page }) => {
  await page.goto("/#share=not-a-valid-share-token");
  await expect(page.getByText(/expired or is not valid/i)).toBeVisible();
  await expect(page.locator(".shared-run-message a")).toBeVisible();
});
