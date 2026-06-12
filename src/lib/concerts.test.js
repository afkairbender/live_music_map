// fetchConcerts tested end-to-end through a routed fetch stub — no real
// network, no timers. Every test re-imports the module (vi.resetModules)
// because concerts.js keeps module-level state: the result cache, the RA area
// memo, and the Bandsintown direct-vs-proxy base.
import { describe, expect, it, vi } from "vitest";

const STOP = { city: "Berlin", country: "DE", lat: 52.52, lng: 13.41, arrive: "2026-07-01", depart: "2026-07-05" };
const artists = (...names) => names.map((name) => ({ id: name, name, image: null }));

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// ---- per-source wire-shape builders ----

const raPage = (events) =>
  json({
    data: {
      eventListings: {
        data: events.map((e) => ({
          id: "L" + e.id,
          listingDate: e.date,
          event: {
            id: e.id,
            title: e.name,
            date: e.date,
            startTime: e.time ? e.date + "T" + e.time + ":00" : null,
            contentUrl: "/events/" + e.id,
            venue: { name: e.venue ?? null },
            artists: (e.artists ?? []).map((name) => ({ name })),
            genres: (e.genres ?? []).map((name) => ({ name })),
          },
        })),
        totalResults: events.length,
      },
    },
  });

const bitEvent = (e) => ({
  id: e.id,
  datetime: e.date + "T" + (e.time ?? "20:00") + ":00",
  title: e.name,
  url: "https://bandsintown.com/e/" + e.id,
  venue: { name: e.venue ?? "Somewhere", latitude: "52.52", longitude: "13.41", city: "Berlin" },
  lineup: e.lineup ?? [],
  offers: [],
});

// Routes fetch by URL substring; unrouted URLs fail loudly. The defaults make
// a healthy-but-empty Berlin fetch: RA/Eventim/DICE ok with no events,
// Bandsintown 404s every artist (= not listed there, still "ok"), GoOut is
// skipped (Berlin isn't CZ/SK) and Ticketmaster is skipped (no key).
function stubFetch(overrides = {}) {
  const routes = {
    "/api/ra": () => raPage([]),
    "public-api.eventim.com": () => json({ products: [] }),
    "/api/dice": () => json({ sections: [], next_page_cursor: null }),
    "/api/goout": () => {
      throw new Error("GoOut should be skipped for this stop");
    },
    "rest.bandsintown.com": () => json([], 404),
    "app.ticketmaster.com": () => {
      throw new Error("Ticketmaster should be skipped without a key");
    },
    ...overrides,
  };
  const stub = vi.fn(async (url, init) => {
    const u = String(url);
    for (const [substr, handler] of Object.entries(routes)) {
      if (u.includes(substr)) return handler(u, init);
    }
    throw new Error("unrouted fetch: " + u);
  });
  vi.stubGlobal("fetch", stub);
  return stub;
}

async function load() {
  vi.resetModules();
  return await import("./concerts.js");
}

it("merges sources and reports per-source status (ok / skipped)", async () => {
  stubFetch({
    "/api/ra": () => raPage([{ id: "1", name: "Open Air", date: "2026-07-02", time: "21:00", venue: "Gärten der Welt" }]),
  });
  const { fetchConcerts } = await load();
  const { sources, events } = await fetchConcerts(STOP, artists("Four Tet"));

  expect(Object.fromEntries(sources.map((s) => [s.id, s.status]))).toEqual({
    ra: "ok", evm: "ok", dice: "ok", goout: "skipped", bit: "ok", tm: "skipped",
  });
  expect(sources.find((s) => s.id === "ra").count).toBe(1);
  expect(events).toEqual([
    {
      id: "ra-1", source: "ra", name: "Open Air", date: "2026-07-02", time: "21:00",
      venue: "Gärten der Welt", url: "https://ra.co/events/1", attractions: [], genres: [], matches: [],
    },
  ]);
});

it("dedupes the same show across sources — RA beats a Bandsintown duplicate", async () => {
  stubFetch({
    "/api/ra": () => raPage([
      { id: "10", name: "Four Tet — All Night Long", date: "2026-07-02", venue: "Funkhaus", artists: ["Four Tet"] },
      { id: "11", name: "Klub Nacht", date: "2026-07-03", venue: "Berghain", artists: ["Overmono"] },
    ]),
    "rest.bandsintown.com": (url) =>
      url.includes("/artists/Four%20Tet/")
        ? // same date + same normalized title as ra-10
          json([bitEvent({ id: 901, name: "Four Tet | All Night Long", date: "2026-07-02", venue: "Other Hall" })])
        : // different title but same venue + date + headliner as ra-11
          json([bitEvent({ id: 902, name: "Overmono live in Berlin", date: "2026-07-03", venue: "Berghain", lineup: ["Overmono"] })]),
  });
  const { fetchConcerts } = await load();
  const { sources, events } = await fetchConcerts(STOP, artists("Four Tet", "Overmono"));

  expect(events.map((e) => e.id)).toEqual(["ra-10", "ra-11"]); // first-source-wins per declared priority
  expect(sources.find((s) => s.id === "bit")).toMatchObject({ status: "ok", count: 0 });
});

it("matches artists exactly on attractions, fuzzily on titles, and sorts matched events first", async () => {
  stubFetch({
    "/api/ra": () => raPage([
      { id: "20", name: "Warehouse Wednesday", date: "2026-07-01" },
      { id: "21", name: "Overmono all night", date: "2026-07-03" },
      { id: "22", name: "Club Special", date: "2026-07-02", artists: ["Four Tet"] },
      { id: "23", name: "Goya night", date: "2026-07-04" },
      { id: "24", name: "Overmonofest", date: "2026-07-05" },
    ]),
  });
  const { fetchConcerts } = await load();
  const { events } = await fetchConcerts(STOP, artists("Four Tet", "Overmono", "Goya"));

  expect(events.map((e) => [e.id, e.matches])).toEqual([
    ["ra-22", ["Four Tet"]], // exact attraction match
    ["ra-21", ["Overmono"]], // ≥5-char artist name, word-bounded in the title
    ["ra-20", []], // unmatched sorts after matched despite the earliest date
    ["ra-23", []], // "Goya" is under 5 chars — no fuzzy title matching
    ["ra-24", []], // "Overmonofest" is not word-bounded — no match
  ]);
});

it("keeps other sources' events when one source fails, reporting it as an error", async () => {
  stubFetch({
    "/api/ra": () => json({}, 500),
    "rest.bandsintown.com": () => json([bitEvent({ id: 903, name: "Caribou", date: "2026-07-02", lineup: ["Caribou"] })]),
  });
  const { fetchConcerts } = await load();
  const { sources, events } = await fetchConcerts(STOP, artists("Caribou"));

  expect(sources.find((s) => s.id === "ra")).toMatchObject({ status: "error", detail: "HTTP 500" });
  expect(events.map((e) => e.id)).toEqual(["bit-903"]);
  expect(events[0].matches).toEqual(["Caribou"]);
});

it("throws a joined message when every source fails or is skipped", async () => {
  stubFetch({
    "/api/ra": () => json({}, 500),
    "public-api.eventim.com": () => json({}, 502), // swallowed by the per-day pool → "no response"
    "/api/dice": () => json({}, 503),
    "rest.bandsintown.com": () => json({}, 504), // swallowed by the per-artist pool → "no response"
  });
  const { fetchConcerts } = await load();

  await expect(fetchConcerts(STOP, artists("Four Tet"))).rejects.toThrow(
    "Resident Advisor: HTTP 500; Eventim: no response; DICE: HTTP 503; Bandsintown: no response"
  );
});

it("memoizes a clean fetch — identical args hit no network the second time", async () => {
  const stub = stubFetch({ "/api/ra": () => raPage([{ id: "30", name: "Set", date: "2026-07-02" }]) });
  const { fetchConcerts } = await load();

  const first = await fetchConcerts(STOP, artists("Four Tet"));
  const callsAfterFirst = stub.mock.calls.length;
  expect(callsAfterFirst).toBeGreaterThan(0);
  const second = await fetchConcerts(STOP, artists("Four Tet"));
  expect(stub.mock.calls.length).toBe(callsAfterFirst);
  expect(second.events).toEqual(first.events);
});

it("does not cache a degraded result — the second call refetches everything", async () => {
  const stub = stubFetch({ "/api/ra": () => json({}, 500) });
  const { fetchConcerts } = await load();

  await fetchConcerts(STOP, artists("Four Tet"));
  const callsAfterFirst = stub.mock.calls.length;
  await fetchConcerts(STOP, artists("Four Tet"));
  expect(stub.mock.calls.length).toBe(2 * callsAfterFirst);
});

it("drops catch-all genre buckets, title-cases and dedupes the rest", async () => {
  stubFetch({
    "/api/ra": () => raPage([
      { id: "40", name: "Genre Test", date: "2026-07-02", genres: ["music", "techno", "Techno ", "drum & bass", "Other"] },
    ]),
  });
  const { fetchConcerts } = await load();
  const { events } = await fetchConcerts(STOP, artists("Four Tet"));

  expect(events[0].genres).toEqual(["Techno", "Drum & Bass"]);
});

it("double-encodes Bandsintown artist names (dots → %2E, slash → %252F)", async () => {
  const stub = stubFetch();
  const { fetchConcerts } = await load();
  await fetchConcerts(STOP, artists("Fred again..", "AC/DC"));

  const bitUrls = stub.mock.calls.map(([u]) => String(u)).filter((u) => u.includes("rest.bandsintown.com"));
  expect(bitUrls.find((u) => u.includes("Fred"))).toContain(
    "/artists/Fred%20again%2E%2E/events?app_id=js_widget&date=2026-07-01%2C2026-07-05"
  );
  expect(bitUrls.find((u) => u.includes("DC"))).toContain("/artists/AC%252FDC/events");
});

it("resolves non-seeded RA areas via the areas query, preferring the stop's country, and persists the id", async () => {
  const stub = stubFetch({
    "/api/ra": (url, init) =>
      JSON.parse(init.body).query.includes("areas(")
        ? json({ data: { areas: [
            { id: "7", name: "Leipzig", country: { name: "Canada" } },
            { id: "237", name: "Leipzig", country: { name: "Germany" } },
          ] } })
        : raPage([{ id: "50", name: "Distillery Night", date: "2026-07-02" }]),
  });
  const { fetchConcerts } = await load();
  const { sources, events } = await fetchConcerts({ ...STOP, city: "Leipzig" }, artists("Four Tet"));

  expect(sources.find((s) => s.id === "ra")).toMatchObject({ status: "ok", count: 1 });
  expect(events.map((e) => e.id)).toEqual(["ra-50"]);
  const raBodies = stub.mock.calls.filter(([u]) => String(u) === "/api/ra").map(([, init]) => JSON.parse(init.body));
  expect(raBodies[0].variables.searchTerm).toBe("Leipzig"); // areas lookup first
  expect(raBodies[1].variables.filters.areas).toEqual({ eq: 237 }); // the German Leipzig won
  expect(JSON.parse(localStorage.getItem("lmm.ra.areas.v1"))).toEqual({ "leipzig|DE": 237 });
});

it("falls back to the /api/bit proxy when direct Bandsintown fetch is blocked", async () => {
  const stub = stubFetch({
    "rest.bandsintown.com": () => {
      throw new TypeError("cors blocked");
    },
    "/api/bit": () => json([bitEvent({ id: 905, name: "Bicep live", date: "2026-07-03", lineup: ["Bicep"] })]),
  });
  const { fetchConcerts } = await load();
  const { sources, events } = await fetchConcerts(STOP, artists("Bicep"));

  expect(sources.find((s) => s.id === "bit").status).toBe("ok");
  expect(events.map((e) => e.id)).toEqual(["bit-905"]);
  expect(stub.mock.calls.map(([u]) => String(u))).toContain(
    "/api/bit/artists/Bicep/events?app_id=js_widget&date=2026-07-01%2C2026-07-05"
  );
});

it("parses GoOut schedules for covered CZ cities, blanking raw control chars in the response", async () => {
  const PRAGUE = { city: "Prague", country: "CZ", lat: 50.08, lng: 14.44, arrive: "2026-07-01", depart: "2026-07-05" };
  // GoOut emits raw (unescaped) control characters inside JSON strings —
  // rebuild that invalid payload the same way to exercise the blanking
  const gooutBody = JSON.stringify({
    schedules: [{
      id: "sch1",
      url: "https://goout.net/x",
      attributes: { startAt: "2026-07-02T19:30:00", hasTime: true, state: "published" },
      relationships: { event: { id: "ev1" }, venue: { id: "v1" } },
    }],
    included: {
      events: [{
        id: "ev1",
        locales: { en: { name: "JazzCTRLNight" } },
        attributes: { tags: ["concert_jazz_blues_swing"] },
        relationships: { performers: [{ id: "p1" }] },
      }],
      venues: [{ id: "v1", locales: { en: { name: "Roxy" } } }],
      performers: [{ id: "p1", locales: { en: { name: "Tomáš Band" } } }],
    },
    meta: {},
  }).replace("CTRL", "\u0001"); // a raw, unescaped control byte — invalid JSON, as GoOut ships it
  stubFetch({
    "/api/goout": () => new Response(gooutBody, { headers: { "content-type": "application/json" } }),
  });
  const { fetchConcerts } = await load();
  const { sources, events } = await fetchConcerts(PRAGUE, artists("Four Tet"));

  expect(sources.find((s) => s.id === "goout")).toMatchObject({ status: "ok", count: 1 });
  expect(sources.find((s) => s.id === "evm").status).toBe("skipped"); // CZ has no Eventim shop
  expect(events).toEqual([
    {
      id: "go-sch1", source: "goout", name: "Jazz Night", date: "2026-07-02", time: "19:30",
      venue: "Roxy", url: "https://goout.net/x", attractions: ["Tomáš Band"],
      genres: ["Jazz Blues Swing"], matches: [],
    },
  ]);
});

it("queries Ticketmaster when a key is set, sending the stop's geohash as geoPoint", async () => {
  localStorage.setItem("lmm.tm.key", "test-key");
  const stub = stubFetch({
    "app.ticketmaster.com": () =>
      json({
        _embedded: {
          events: [{
            id: "Z1",
            name: "Stadium Special",
            url: "https://tm.example/z1",
            dates: { start: { localDate: "2026-07-04", localTime: "20:00:00" } },
            _embedded: { venues: [{ name: "Olympiastadion" }], attractions: [{ name: "Caribou" }] },
            classifications: [{ genre: { name: "Dance/Electronic" }, subGenre: { name: "Other" } }],
          }],
        },
        page: { totalPages: 1 },
      }),
  });
  const { fetchConcerts } = await load();
  const { sources, events } = await fetchConcerts(STOP, artists("Caribou"));

  expect(sources.find((s) => s.id === "tm")).toMatchObject({ status: "ok", count: 1 });
  const tmUrl = new URL(stub.mock.calls.map(([u]) => String(u)).find((u) => u.includes("app.ticketmaster.com")));
  expect(tmUrl.searchParams.get("apikey")).toBe("test-key");
  expect(tmUrl.searchParams.get("geoPoint")).toBe("u33dc0uz5"); // geohash(52.52, 13.41)
  expect(events.map((e) => [e.id, e.time, e.venue, e.genres, e.matches])).toEqual([
    ["tm-Z1", "20:00", "Olympiastadion", ["Dance/Electronic"], ["Caribou"]],
  ]);
});
