import { test, expect } from "@playwright/test";
import { installMocks, SEED_STOP, BERLIN_DATES } from "./mocks.js";

test("plan a stop, connect Spotify (mocked PKCE), see matched concerts", async ({
  page,
  baseURL,
}) => {
  const captured = await installMocks(page, baseURL);

  // Seed BEFORE first load. The init script reruns on every navigation
  // (including the OAuth redirect), so the itinerary seed must be
  // conditional or it would clobber stops added during the test.
  await page.addInitScript((stop) => {
    localStorage.setItem("lmm.muted", "1"); // no WebAudio in headless
    localStorage.setItem("lmm.spotify.clientId", "e2e-client-id");
    if (!localStorage.getItem("lmm.itinerary.v1")) {
      localStorage.setItem("lmm.itinerary.v1", JSON.stringify([stop]));
    }
  }, SEED_STOP);

  await page.goto("/");

  // globe canvas up = WebGL worked (a failure trips the app-wide ErrorBoundary)
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator(".stop-row", { hasText: "Lisbon" })).toBeVisible();

  // ---- connect Spotify through the mocked OAuth redirect dance ----
  await page.getByRole("button", { name: "Connect Spotify" }).click();
  await expect(page.getByRole("button", { name: /Cameron Tester · 3 artists/ })).toBeVisible();

  // real beginLogin() built the authorize URL (PKCE, no state param)
  const auth = new URL(captured.authorizeUrl);
  expect(auth.searchParams.get("client_id")).toBe("e2e-client-id");
  expect(auth.searchParams.get("response_type")).toBe("code");
  expect(auth.searchParams.get("redirect_uri")).toBe(baseURL + "/");
  expect(auth.searchParams.get("scope")).toBe("user-top-read");
  expect(auth.searchParams.get("code_challenge_method")).toBe("S256");
  expect(auth.searchParams.get("code_challenge")).toBeTruthy();

  // real completeLoginFromUrl() exchanged the code with its stored verifier
  const tokenBody = new URLSearchParams(captured.tokenBodies[0]);
  expect(tokenBody.get("grant_type")).toBe("authorization_code");
  expect(tokenBody.get("code")).toBe("e2e-auth-code");
  expect(tokenBody.get("code_verifier")).toBeTruthy();

  // token persisted, verifier consumed, ?code stripped from the URL
  await expect(page).toHaveURL(baseURL + "/");
  const token = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("lmm.spotify.token"))
  );
  expect(token).toMatchObject({ access: "e2e-access-token", refresh: "e2e-refresh-token" });
  expect(await page.evaluate(() => localStorage.getItem("lmm.spotify.verifier"))).toBeNull();

  // ---- add Berlin via the search UI (local city list; geocoder stubbed empty) ----
  await page.getByPlaceholder("Where to next?").fill("Berl");
  await page.getByRole("option", { name: /^Berlin/ }).click();
  // scope to the add form — the inline date editor reuses the same labels
  const form = page.locator(".add-form");
  await form.getByLabel("Arrive").fill(BERLIN_DATES.arrive);
  await form.getByLabel("Leave").fill(BERLIN_DATES.depart);
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.locator(".stop-row", { hasText: "Berlin" })).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("lmm.itinerary.v1"))
  );
  expect(saved).toHaveLength(2);
  expect(saved[1]).toMatchObject({ city: "Berlin", country: "DE", ...BERLIN_DATES });

  // ---- adding auto-selects the stop: CityPanel opens with stubbed listings ----
  const panel = page.locator(".panel.city");
  await expect(panel.getByRole("heading", { name: /Berlin/ })).toBeVisible();

  await expect(
    panel.getByRole("heading", { name: "🎉 Your artists are playing" })
  ).toBeVisible();
  const matched = panel.locator("li.event.matched");
  await expect(matched).toHaveCount(2);
  await expect(matched.nth(0)).toContainText("The Midnight Echoes"); // matches.join title
  await expect(matched.nth(0)).toContainText("Warehouse Rites"); // .ev-sub original name
  await expect(matched.nth(0)).toContainText("Berghain");
  await expect(matched.nth(0).locator(".ev-src")).toHaveText("RA");
  await expect(matched.nth(1)).toContainText("Neon Harbor");
  await expect(matched.nth(1).locator(".ev-src")).toHaveText("BIT");

  await expect(panel.getByRole("heading", { name: "🎵 Also in town" })).toBeVisible();
  const rest = panel.locator("li.event:not(.matched)");
  await expect(rest).toHaveCount(2);
  await expect(rest.nth(0)).toContainText("Kiezsalon: Modular Dreams");
  await expect(rest.nth(0).locator(".ev-src")).toHaveText("DICE");
  await expect(rest.nth(1)).toContainText("Synthwave Sommernacht");
  await expect(rest.nth(1).locator(".ev-src")).toHaveText("EVM");

  // genre bubbles harvested from the RA + Eventim fixtures
  await expect(panel.getByRole("button", { name: "Techno" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Rock & Pop" })).toBeVisible();

  // footer: ok sources in task order; GoOut/TM skipped; real taste profile
  await expect(panel.locator(".feed-note")).toContainText(
    "Live listings via Resident Advisor + Eventim + DICE + Bandsintown."
  );
  await expect(panel.locator(".feed-note")).not.toContainText("sample taste");
  await expect(panel.locator(".feed-note")).toContainText("Ticketmaster key");

  // ---- everything survives a reload (token + itinerary in localStorage) ----
  await page.reload();
  await expect(page.getByRole("button", { name: /Cameron Tester · 3 artists/ })).toBeVisible();
  await expect(page.locator(".stop-row", { hasText: "Berlin" })).toBeVisible();
});
