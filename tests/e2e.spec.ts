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

function quickTimeWithCaptureDate(captureDate: string): Buffer {
  const box = (type: string, payload: Buffer) => {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(header.length + payload.length, 0);
    header.write(type, 4, 4, "latin1");
    return Buffer.concat([header, payload]);
  };
  return box("moov", box("udta", box("©day", Buffer.from(captureDate, "utf8"))));
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

test.beforeEach(async ({ page }, testInfo) => {
  await blockTiles(page);
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  if (testInfo.title.startsWith("account:")) return;
  await page.getByRole("button", { name: /Ver a demonstração sem conta/ }).click();
});

test("account: register, sign out, wrong password and sign back in", async ({ page }) => {
  await page.getByLabel("Nome").fill("Rider Teste");
  await page.getByLabel("Email").fill("rider@teste.pt");
  await page.getByLabel("Palavra-passe", { exact: true }).fill("descida-123");
  await page.getByLabel("Confirmar palavra-passe").fill("descida-123");
  await page.getByRole("button", { name: "Criar conta" }).last().click();
  await expect(page.getByText("Conta neste dispositivo")).toBeVisible();
  await page.getByRole("button", { name: /Rider Teste/ }).click();
  await page.getByRole("button", { name: "Terminar sessão" }).click();
  await expect(page.getByRole("heading", { name: /Cria a tua conta/ })).toBeVisible();
  await page.getByRole("tab", { name: "Entrar" }).click();
  await page.getByLabel("Email").fill("rider@teste.pt");
  await page.getByLabel("Palavra-passe", { exact: true }).fill("errada-123");
  await page.getByRole("button", { name: "Entrar" }).last().click();
  await expect(page.getByRole("alert")).toContainText("incorretos");
  await page.getByLabel("Palavra-passe", { exact: true }).fill("descida-123");
  await page.getByRole("button", { name: "Entrar" }).last().click();
  await expect(page.getByText("Conta neste dispositivo")).toBeVisible();
  const stored = await page.evaluate(() => localStorage.getItem("ghostline.auth.v1") ?? "");
  expect(stored).not.toContain("descida-123");
  expect(stored).toContain("pbkdf2$");
});

test("demo analysis has seven primary runs, stable PB, sector selection, reference, progress and elevation", async ({
  page,
}) => {
  await expect(page.getByText("SESSÃO DE DEMONSTRAÇÃO")).toBeVisible();
  await expect(page.locator('select[aria-label="Pista selecionada"]')).toHaveValue(
    "mundial",
  );
  await expect(page.getByRole("button", { name: /S4/ })).toBeVisible();
  await expect(page.getByLabel("Run atual")).toContainText(
    "Run 05 · Melhor pessoal",
  );
  await expect(page.getByLabel("Run atual")).toContainText(
    "Run 05 · Melhor pessoal",
  );
  await expect(page.locator("body")).not.toContainText("NaN");

  await page.getByRole("button", { name: /S4/ }).click();
  await expect(page.getByRole("button", { name: /S4/ })).toHaveClass(
    /selected/,
  );
  await page.getByLabel("Run de referência").selectOption("run-01");
  await expect(page.getByText("REFERÊNCIA", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Altitude" }).click();
  await expect(
    page.getByRole("img", { name: /altitude ao longo da distância/i }),
  ).toBeVisible();
  await page.locator(".segmented").getByRole("button", { name: "Δ Ghost" }).click();
  await expect(
    page.getByRole("img", { name: /Diferença para o Ghost/ }),
  ).toBeVisible();
  await expect(page.locator(".trace-meta b")).toContainText(/atrás|à frente/);
  const slider = page.locator('input[type="range"]');
  await slider.fill("800");
  await expect(slider).toHaveValue("800");

  const trail = page.locator('select[aria-label="Pista selecionada"]');
  await trail.selectOption("free-ride");
  await expect(page.getByLabel("Run atual")).toContainText(
    "Run 08 · Ritmo solto",
  );
  await expect(page.locator("body")).not.toContainText("NaN");
  await trail.selectOption("mundial");
  await expect(page.getByLabel("Run atual")).toContainText(
    "Run 05 · Melhor pessoal",
  );
});

test("history search, analyze, delete and PB recomputation work", async ({
  page,
}) => {
  await open(page, "Histórico");
  await expect(page.getByRole("button", { name: "Partilhar" }).first()).toBeDisabled();
  const search = page.getByRole("textbox", { name: "Procurar runs" });
  await search.fill("Melhor pessoal");
  await expect(
    page.locator("tbody").getByText("Run 05 · Melhor pessoal", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("tbody").getByText("Run 01 · Aquecimento")).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Analisar", exact: true }).click();
  await expect(page.getByText("Contra o Ghost")).toBeVisible();
  await open(page, "Histórico");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Apagar Run 05 · Melhor pessoal" })
    .click();
  await search.fill("");
  await expect(page.getByText("Run 05 · Melhor pessoal")).toHaveCount(0);
  await expect(
    page.getByRole("row", { name: /Run 06 · Raízes rápidas/ }),
  ).toContainText("PB");
  await open(page, "Análise");
  await expect(page.locator(".reference-time")).toContainText("3:04.00");
});

test("video lab keeps the sync workflow focused on a selected ride", async ({
  page,
}) => {
  await open(page, "Vídeo");
  await expect(page.getByText("Alinha a run.")).toBeVisible();
  await expect(page.getByLabel("Pista do vídeo")).toHaveValue("mundial");
  await expect(page.getByLabel("Run do vídeo")).toContainText(
    "Run 05 · Melhor pessoal",
  );
  await expect(page.getByText("Junta o vídeo da tua run.")).toBeVisible();
  await expect(page.getByText("Destaques automáticos.")).toBeVisible();
  await page.getByLabel("Pista do vídeo").selectOption("free-ride");
  await expect(page.getByLabel("Run do vídeo")).toContainText("Run 09 · Sprint no vale");
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
  await open(page, "Vídeo");
  const video = await readFile(new URL("./fixtures/dji-mimo-sample.webm", import.meta.url));
  await page.getByLabel("Escolher ficheiro de vídeo").first().setInputFiles({
    name: "dji-mimo-run.webm",
    mimeType: "video/webm",
    buffer: video,
  });
  await expect(page.getByText("dji-mimo-run.webm")).toBeVisible();
  await expect.poll(() => page.locator("video").evaluate((element) => element.duration)).toBeGreaterThan(0);
  await expect(page.getByText("Acerta os relógios")).toBeVisible();
  await expect(page.getByLabel("Linha do tempo do vídeo")).toBeEnabled();
  const mapPane = page.locator(".leaflet-map-pane");
  await page.locator(".leaflet-control-zoom-in").click();
  const zoomedMapStyle = await mapPane.getAttribute("style");
  const timeline = page.getByLabel("Linha do tempo do vídeo");
  const scrubTime = Math.min(0.8, Number(await timeline.getAttribute("max")) * 0.7);
  await timeline.fill(String(scrubTime));
  await expect.poll(() => mapPane.getAttribute("style")).toBe(zoomedMapStyle);
  const sectorWindow = page.locator(".sector-video-row").first().locator("small");
  const normalWindow = await sectorWindow.innerText();
  await page.getByLabel("Velocidade do vídeo").selectOption("2");
  await expect(sectorWindow).toHaveText(normalWindow);
  await page.getByRole("button", { name: "Reproduzir vídeo" }).click();
  await expect.poll(() => page.locator("video").evaluate((element) => !element.paused)).toBe(true);
  await page.getByLabel("Desfasamento da partida do GPS").fill("0.4");
  await expect(page.getByLabel("Desfasamento da partida do GPS")).toHaveValue("0.4");
  const originalRun = await page.getByLabel("Run do vídeo").inputValue();
  await page.getByLabel("Run do vídeo").selectOption({ index: 1 });
  await page.getByLabel("Run do vídeo").selectOption(originalRun);
  await expect(page.getByLabel("Desfasamento da partida do GPS")).toHaveValue("0.4");
  const eventRow = page.locator(".riding-event-row").first();
  await eventRow.click();
  await expect(eventRow).toHaveClass(/selected/);
  await page.getByRole("button", { name: "Procurar paragens no GPS" }).click();
  await page.getByRole("button", { name: "Aplicar janela da run" }).click();
  await expect(page.getByText(/Janela final/)).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descarregar plano de edição" }).click();
  const planDownload = await download;
  const planPath = await planDownload.path();
  expect(planPath).toBeTruthy();
  const plan = JSON.parse(await readFile(planPath!, "utf8")) as { sync: { offsetSeconds: number }; trim: { start: number; end: number } };
  expect(plan.sync.offsetSeconds).toBe(0.4);
  expect(plan.trim.end).toBeGreaterThan(plan.trim.start);
  const rendered = page.waitForEvent("download");
  await page.getByRole("button", { name: "Run completa (WebM)" }).click();
  const renderedDownload = await rendered;
  expect(renderedDownload.suggestedFilename()).toMatch(/ghostline\.webm$/);
  const renderedPath = await renderedDownload.path();
  expect(renderedPath).toBeTruthy();
  await expect.poll(async () => (await readFile(renderedPath!)).byteLength, { timeout: 10_000 }).toBeGreaterThan(100);
  await expect(page.getByText("Vídeo descarregado")).toBeVisible();
});

test("video lab offers a confirmable timestamp alignment for QuickTime clips", async ({ page }) => {
  await open(page, "Vídeo");
  const captureDate = new Date(Date.parse("2026-09-13T09:00:00Z") + 20_000).toISOString();
  await page.getByLabel("Escolher ficheiro de vídeo").first().setInputFiles({
    name: "timestamped-mimo-export.mp4",
    mimeType: "video/mp4",
    buffer: quickTimeWithCaptureDate(captureDate),
  });
  await expect(page.getByText("Hora de gravação encontrada")).toBeVisible();
  await expect(page.getByText(/relógio da câmara ou no fuso horário/)).toBeVisible();
  // The synthetic QuickTime container is metadata-only. Give the player a
  // metadata event so this test can exercise the opt-in sync control itself.
  await page.locator("video").evaluate((element) => {
    Object.defineProperty(element, "duration", { configurable: true, value: 300 });
    element.dispatchEvent(new Event("loadedmetadata"));
  });
  const suggestion = page.getByRole("button", { name: "Usar sugestão de -20.0s" });
  await expect(suggestion).toBeVisible();
  await suggestion.click();
  await expect(page.getByLabel("Desfasamento da partida do GPS")).toHaveValue("-20");
});

test("video lab reports an unsupported local clip", async ({ page }) => {
  await open(page, "Vídeo");
  await page.getByLabel("Escolher ficheiro de vídeo").first().setInputFiles({
    name: "broken-dji-export.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("not-a-video"),
  });
  await expect(page.getByText("broken-dji-export.mp4")).toBeVisible();
  await expect(page.getByText(/não consegue ler este vídeo/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Descarregar plano de edição" })).toBeDisabled();
});

test("video lab restores two point sync when the same clip is reattached", async ({ page }) => {
  await open(page, "Vídeo");
  const video = await readFile(new URL("./fixtures/dji-mimo-sample.webm", import.meta.url));
  await page.getByLabel("Escolher ficheiro de vídeo").first().setInputFiles({
    name: "dji-mimo-anchors.webm",
    mimeType: "video/webm",
    buffer: video,
  });
  await expect.poll(() => page.locator("video").evaluate((element) => element.duration)).toBeGreaterThan(0);
  const timeline = page.getByLabel("Linha do tempo do vídeo");
  await timeline.fill("0.2");
  await page.getByRole("button", { name: "Marcar partida", exact: true }).click();
  // Keep a little room before the final frame so the range input receives a
  // valid value in all Chromium builds.
  await timeline.fill("4");
  await page.getByRole("button", { name: "Marcar chegada", exact: true }).click();
  await expect(page.locator(".sync-anchors")).toContainText("2 marcadores");
  await expect.poll(() => page.evaluate(() => {
    const projects = JSON.parse(localStorage.getItem("ghostline.video-projects.v1") ?? "{}");
    return projects["run-07"]?.videoName ?? "";
  })).toBe("dji-mimo-anchors.webm");
  await page.reload();
  await open(page, "Vídeo");
  await expect.poll(() => page.evaluate(() => {
    const projects = JSON.parse(localStorage.getItem("ghostline.video-projects.v1") ?? "{}");
    return projects["run-07"]?.videoName ?? "";
  })).toBe("dji-mimo-anchors.webm");
  await expect(page.getByText("Continua a tua run sincronizada.")).toBeVisible();
  await page.getByLabel("Escolher ficheiro de vídeo").first().setInputFiles({
    name: "dji-mimo-anchors.webm",
    mimeType: "video/webm",
    buffer: video,
  });
  await expect(page.locator(".sync-anchors")).toContainText("2 marcadores");
});

test("garage supports add edit delete and protects referenced bikes", async ({
  page,
}) => {
  await open(page, "Garagem");
  await page.getByLabel("Nome", { exact: true }).fill("Unused rig");
  await page.getByLabel("Marca").fill("Test brand");
  await page.getByLabel("Curso (mm)").fill("160");
  await page.getByRole("button", { name: "Adicionar bike" }).click();
  await expect(page.getByText("Unused rig")).toBeVisible();
  await page.getByRole("article").filter({ hasText: "Unused rig" }).locator("summary").click();
  await page.getByLabel("Descrição da manutenção da Unused rig").fill("Fork lower service");
  await page.getByRole("button", { name: "Registar manutenção" }).click();
  await expect(page.getByText("Fork lower service")).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem("ghostline.data.v1") ?? "{}");
    return workspace.bikes.find((bike: { name?: string }) => bike.name === "Unused rig")?.serviceHistory?.length ?? 0;
  })).toBe(1);
  await page.getByTitle("Editar Unused rig").click();
  await page.getByLabel("Nome", { exact: true }).fill("Edited rig");
  await page.getByRole("button", { name: "Atualizar bike" }).click();
  await expect(page.getByText("Edited rig")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTitle("Apagar Edited rig").click();
  await expect(page.getByText("Edited rig")).toHaveCount(0);
  await page.getByTitle("Apagar Enduro 29").click();
  await expect(page.getByRole("alert")).toContainText(
    "tem runs guardadas",
  );
});

test("profile save persists across reload", async ({ page }) => {
  await page.getByRole("button", { name: /Alex Morgan/ }).click();
  await page.getByLabel("Nome do rider").fill("Rider Persisted");
  await page.getByLabel("Email").fill("persisted@example.com");
  await page.getByRole("button", { name: "Guardar perfil" }).click();
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
  await expect(page.getByLabel("Nome do rider")).toHaveValue("Rider Persisted");
  await expect(page.getByLabel("Email")).toHaveValue("persisted@example.com");
});

test("manual trail, timestamped route imports, PB change, sector edit and compare", async ({
  page,
}) => {
  const data = await demo(page);
  const route = gpx(data.trails[0].points, false);
  const fast = gpx(faster(data.runs[5].points, 0.8), true);
  const slow = gpx(data.runs[0].points, true);
  await open(page, "Pistas");
  await page.getByRole("button", { name: "Nova pista" }).click();
  await page.getByLabel("Nome da pista").fill("Manual test trail");
  await page.getByLabel("Local", { exact: true }).fill("Test valley");
  await page.getByRole("button", { name: "Guardar pista" }).click();
  await expect(page.getByText("Manual test trail")).toBeVisible();
  await page.getByRole("button", { name: "Importar rota GPX / FIT" }).click();
  await page
    .locator('input[type="file"]')
    .nth(0)
    .setInputFiles({
      name: "manual-route.gpx",
      mimeType: "application/gpx+xml",
      buffer: Buffer.from(route),
    });
  await expect(page.getByText("manual-route")).toBeVisible();

  await page.getByRole("button", { name: "Importar run" }).click();
  await page
    .locator("label.field")
    .filter({ hasText: /^Pista/ })
    .locator("select")
    .selectOption({ label: "Manual test trail" });
  await page.getByRole("button", { name: /Escolher ficheiro GPX ou FIT/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "slow.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from(slow),
  });
  await page.getByRole("button", { name: "Guardar run" }).click();
  await expect(page.getByText("Contra o Ghost")).toBeVisible();
  await page.getByRole("button", { name: "Importar run" }).click();
  await page
    .locator("label.field")
    .filter({ hasText: /^Pista/ })
    .locator("select")
    .selectOption({ label: "Manual test trail" });
  await page.getByRole("button", { name: /Escolher ficheiro GPX ou FIT/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "fast.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from(fast),
  });
  await page.getByRole("button", { name: "Guardar run" }).click();
  await expect(page.locator(".pb-badge").first()).toBeVisible();
  await expect(page.getByLabel("Run atual").locator("option")).toHaveCount(2);
  await page
    .getByLabel("Run de referência")
    .selectOption({ label: "slow · 3:06.00" });
  await expect(page.locator(".time-comparison")).toContainText("-38.80s");

  await open(page, "Pistas");
  await page.getByTitle("Editar Manual test trail").click();
  await page.getByLabel("Limites dos setores").fill("0.3, 0.7");
  await page.getByLabel("Nomes dos setores").fill("Start, Middle, Finish");
  await page.getByRole("button", { name: "Guardar pista" }).click();
  await expect(page.getByText("Manual test trail")).toBeVisible();
  await page
    .locator(".trail-row")
    .filter({ hasText: "Manual test trail" })
    .getByRole("button", { name: "Ver análise" })
    .click();
  await expect(page.locator(".sector-row")).toHaveCount(3);
});

test("FIT activity imports through the run workflow", async ({ page }) => {
  const data = await demo(page);
  await open(page, "Importar run");
  await page.getByRole("button", { name: /Escolher ficheiro GPX ou FIT/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "mundial-run.fit",
    mimeType: "application/octet-stream",
    buffer: fit(data.runs[0].points),
  });
  await expect(page.getByText(/pontos ·/)).toBeVisible();
  await page.getByRole("button", { name: "Guardar run" }).click();
  await expect(page.getByText("Contra o Ghost")).toBeVisible();
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
  await page.getByRole("button", { name: "Importar run" }).click();
  const downloadReady = page.waitForEvent("download");
  await page.getByRole("button", { name: "Experimentar GPX de exemplo" }).click();
  const download = await downloadReady;
  expect(download.suggestedFilename()).toBe("ghostline-demo-run.gpx");
  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  await page.locator('input[type="file"]').setInputFiles(filePath!);
  await expect(page.getByText(/pontos ·/)).toBeVisible();
  await page.getByRole("button", { name: "Guardar run" }).click();
  await expect(page.getByText("Contra o Ghost")).toBeVisible();
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
  await open(page, "Importar run");
  await page
    .locator("label.field")
    .filter({ hasText: /^Pista/ })
    .locator("select")
    .selectOption("secret-spot");
  await expect(page.getByText(/Esta pista tem meta/)).toBeVisible();
  await page.getByRole("button", { name: /Escolher ficheiro GPX ou FIT/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "secret-with-tail.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from(gpx(withForgottenTail)),
  });
  await page.getByRole("button", { name: "Guardar run" }).click();
  await expect(page.getByText("Contra o Ghost")).toBeVisible();
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
  await open(page, "Importar run");
  await page.getByRole("button", { name: /Escolher ficheiro GPX ou FIT/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "secret-spot-sameiro.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from(gpx(shifted)),
  });
  await page.getByRole("button", { name: "Guardar run" }).click();
  await expect(page.getByText("Contra o Ghost")).toBeVisible();
  await expect(page.getByLabel("Run atual")).toContainText(
    "secret-spot-sameiro",
  );
});

test("invalid GPX gives a useful error and mobile management screens do not overflow", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Importar run", exact: true }).click();
  await page.getByRole("button", { name: /Escolher ficheiro GPX ou FIT/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "bad.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from("<gpx/>"),
  });
  await expect(page.getByRole("alert")).toContainText("não foram encontrados pontos");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const label of ["Garagem", "Pistas", "Importar run"]) {
    if (label === "Importar run")
      await page.getByRole("button", { name: "Importar run" }).click();
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
  await expect(page.getByLabel("Nome do rider")).toHaveValue("Restored rider");
  await page.getByRole("button", { name: "Guardar perfil" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("ghostline.data.v1")!).profile.name,
      ),
    )
    .toBe("Restored rider");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar todos os dados" }).click();
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
  await page.getByRole("button", { name: "Repetir run · 4×" }).click();
  await expect.poll(() => slider.inputValue()).not.toBe("200");
  await page.getByRole("button", { name: "Pausar" }).click();
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
    page.getByRole("heading", { name: "O teu Ghost começa com uma run." }),
  ).toBeVisible();
  await page.evaluate(() =>
    localStorage.setItem("ghostline.data.v1", "broken"),
  );
  await page.reload();
  await expect(page.getByRole("status")).toContainText("possível carregar");
  await expect(
    page.getByRole("heading", { name: "Encontra os segundos que te faltam." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("sector inspection pauses replay and progression resizes after an empty trail", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Repetir run · 4×" }).click();
  await page.getByRole("button", { name: /S2 Zona íngreme/ }).click();
  await expect(
    page.getByRole("button", { name: "Repetir run · 4×" }),
  ).toBeVisible();
  await expect(page.locator('input[type="range"]')).toHaveValue("440");
  const data = await demo(page);
  data.trails.push({ ...data.trails[0], id: "empty", name: "Empty trail" });
  await page.evaluate(
    (value) => localStorage.setItem("ghostline.data.v1", JSON.stringify(value)),
    data,
  );
  await page.reload();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Pista selecionada").selectOption("empty");
  await open(page, "Histórico");
  await expect(
    page.getByText("Importa uma run para começares a tua progressão."),
  ).toBeVisible();
  await page.getByLabel("Pista selecionada").selectOption("mundial");
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
  await expect(page.getByText(/expirou ou não é válido/i)).toBeVisible();
  await expect(page.locator(".shared-run-message a")).toBeVisible();
});

test("records a run live with the phone GPS and keeps it after a reload", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  const at = (step: number) => ({ latitude: 41.51818 + step * 0.00003, longitude: -8.39571, accuracy: 6 });
  await context.setGeolocation(at(0));
  await open(page, "Importar run");
  await page.getByRole("button", { name: /Começar a gravar/ }).click();
  for (const step of [1, 2, 3]) {
    await page.waitForTimeout(1100);
    await context.setGeolocation(at(step));
  }
  await expect(page.locator(".run-recorder-live")).toContainText(/[3-9] ?pontos|\d{2} ?pontos/);
  await page.reload();
  await open(page, "Importar run");
  await expect(page.getByText(/gravação interrompida/)).toBeVisible();
  await page.getByRole("button", { name: "Recuperar" }).click();
  await expect(page.locator(".file-preview")).toContainText("Gravação");
});

test("shares a run result as an image card", async ({ page }) => {
  // Desktop Chrome may expose a share sheet; force the download path.
  await page.evaluate(() => Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true }));
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Partilhar resultado" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^mundial-da-santa-marta-run-07.*\.png$/);
  const path = await file.path();
  expect((await readFile(path!)).subarray(1, 4).toString()).toBe("PNG");
});

test("tags a run as wet, filters by surface and chases a same-surface Ghost", async ({ page }) => {
  await open(page, "Histórico");
  await page.getByLabel("Piso de Run 07 · A fundo").selectOption("wet");
  await page.getByLabel("Piso de Run 03 · A fundo").selectOption("wet");
  await page.getByLabel("Filtrar por piso").selectOption("wet");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await open(page, "Análise");
  await page.getByLabel("Run de referência").selectOption("pb-surface");
  await expect(page.locator(".reference-time")).toContainText("3:05.00");
  await page.reload();
  await open(page, "Histórico");
  await expect(page.getByLabel("Piso de Run 07 · A fundo")).toHaveValue("wet");
});
