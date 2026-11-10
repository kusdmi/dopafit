import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createRuntime } from "../src/runtime.js";
import { loadConfig } from "../src/config.js";
import { createTestDatabase } from "./database.js";
import { contractEndpoints } from "../scripts/contract-endpoints.js";

const { db, dispose } = await createTestDatabase();
const directory = await mkdtemp(join(tmpdir(), "dopafit-pwa-"));
await writeFile(join(directory, "index.html"), "<html>DopaFit PWA</html>");
await writeFile(join(directory, "sw.js"), "// service worker");
await writeFile(join(directory, "version.json"), JSON.stringify({ buildId: "release-test" }));
await mkdir(join(directory, "assets"));
await writeFile(join(directory, "assets", "app-a1b2c3.js"), "// hashed bundle");
await mkdir(join(directory, "icons"));
await writeFile(join(directory, "icons", "og-banner.png"), "not really a png");
const storage = {
  async putObject() {},
  async getObject() {
    return { data: new Uint8Array(), contentType: "image/jpeg" };
  },
  async delete() {},
  async presignedGet(key: string) {
    return `https://storage.test/${key}`;
  },
  async optimizeImage(data: Uint8Array, contentType: string) {
    return { data, contentType, extension: "jpg" };
  },
};
const runtime = createRuntime({ ...loadConfig({}), publicDirectory: directory }, db, storage, {
  async sendVerificationCode() {},
});
afterAll(async () => {
  await dispose();
  await rm(directory, { recursive: true });
});
describe("complete runtime composition", () => {
  it("serves PWA deep links and a fresh service worker while keeping API errors JSON", async () => {
    const page = await runtime.app.request("/settings/theme", { headers: { accept: "text/html" } });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("DopaFit PWA");
    const sw = await runtime.app.request("/sw.js");
    expect(sw.status).toBe(200);
    expect(sw.headers.get("cache-control")).toBe("no-cache");
    const release = await runtime.app.request("/version.json");
    expect(release.status).toBe(200);
    expect(release.headers.get("cache-control")).toBe("no-cache");
    expect(await release.json()).toEqual({ buildId: "release-test" });
    const missingApi = await runtime.app.request("/api/v1/unknown", {
      headers: { accept: "text/html" },
    });
    expect(missingApi.status).toBe(404);
    expect(await missingApi.json()).toMatchObject({ code: "not_found" });
    // Hashed bundles are safe to cache forever; a 404 must not inherit a caching
    // directive, since the header is set before the file is known to exist.
    const asset = await runtime.app.request("/assets/app-a1b2c3.js");
    expect(asset.status).toBe(200);
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    const missing = await runtime.app.request("/missing.js");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBeNull();
  });
  // Приложение за логином: в поиске ему делать нечего. robots.txt закрывает
  // обход у тех, кто его читает, заголовок — у остальных.
  it("keeps the app out of search results without breaking link previews", async () => {
    const page = await runtime.app.request("/settings/theme", { headers: { accept: "text/html" } });
    expect(page.headers.get("x-robots-tag")).toBe("noindex, nofollow");

    // На API заголовок не вешаем — туда краулер не ходит.
    const api = await runtime.app.request("/api/v1/unknown", { headers: { accept: "text/html" } });
    expect(api.headers.get("x-robots-tag")).toBeNull();
  });

  // Карточку ссылки рисует ЧУЖОЙ сервер: Telegram и прочие качают og:image к
  // себе. secureHeaders() ставит CORP `same-origin` на всё подряд, и картинка
  // для них закрыта — превью уходит без неё при идеально размеченном HTML.
  it("lets a link preview fetch the og image from another origin", async () => {
    const banner = await runtime.app.request("/icons/og-banner.png");
    expect(banner.status).toBe(200);
    expect(banner.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
  });

  // Открыт ровно список превью-ресурсов, а не вся статика: сама страница и
  // бандлы приложения остаются закрытыми.
  it("keeps the app shell readable only from its own origin", async () => {
    const page = await runtime.app.request("/settings/theme", { headers: { accept: "text/html" } });
    expect(page.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    const asset = await runtime.app.request("/assets/app-a1b2c3.js");
    expect(asset.headers.get("cross-origin-resource-policy")).toBe("same-origin");
  });

  it("serves every operation the contract documents", async () => {
    // The last link between the contract and the running server. `allEndpoints` already makes
    // the two lists one, so a module can no longer be added to the contract and forgotten in
    // the composition root — but this asserts the property against what `createRuntime`
    // *actually mounted*, not against a list rebuilt the way the root builds it, which would
    // only restate the composition rather than check it.
    //
    // Probed by asking the running app for each documented path: an unmounted route falls
    // through to the SPA middleware and the API 404, while a mounted one answers 401 (no
    // token), 422 (nothing to validate) or its own success. So 404 — and only 404 — means the
    // contract documents an operation the server does not serve.
    const missing: string[] = [];
    for (const { route } of contractEndpoints()) {
      // Path templates carry no real ids; any non-empty segment matches the same route.
      const path = route.path.replace(/\{[^}]+\}/g, "test");
      const response = await runtime.app.request(path, { method: route.method.toUpperCase() });
      if (response.status === 404) missing.push(`${route.method.toUpperCase()} ${route.path}`);
    }

    expect(missing).toStrictEqual([]);

    // Guards against the loop above going vacuous: the contract really does document the
    // whole API, so an empty or truncated endpoint list must not read as success.
    expect(contractEndpoints().length).toBeGreaterThan(90);
  });

  it("reports readiness and serves composed auth and support routes", async () => {
    expect((await runtime.app.request("/health/ready")).status).toBe(200);
    const headers = { "content-type": "application/json" };
    const register = await runtime.app.request("/api/v1/auth/register", {
      method: "POST",
      headers,
      body: JSON.stringify({
        email: "runtime@example.test",
        full_name: "Runtime Test",
        role: "client",
        personal_data_consent: true,
      }),
    });
    expect(register.status).toBe(201);
    const verify = await runtime.app.request("/api/v1/auth/register/verify", {
      method: "POST",
      headers,
      body: JSON.stringify({ email: "runtime@example.test", code: "000000" }),
    });
    expect(verify.status).toBe(200);
    const result = await verify.json();
    const tickets = await runtime.app.request("/api/v1/support/tickets", {
      headers: { authorization: `Bearer ${result.tokens.access_token}` },
    });
    expect(tickets.status).toBe(200);
    expect(await tickets.json()).toEqual([]);
    runtime.setReady(false);
    expect((await runtime.app.request("/health/ready")).status).toBe(503);
    expect((await runtime.app.request("/health/live")).status).toBe(200);
  });
});
