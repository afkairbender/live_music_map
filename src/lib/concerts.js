// Real concert listings — no fake data. Six sources, fetched in parallel,
// merged and deduped:
//  - Resident Advisor: public GraphQL endpoint (ra.co/graphql). It has no
//    CORS headers, so we call it through the same-origin /api/ra route —
//    Vite's dev proxy locally, a Netlify rewrite in production.
//  - Eventim network: public-api.eventim.com serves Europe's biggest
//    ticketer group (eventim.de, oeticket.at, ticketcorner.ch, eventim.fr /
//    France Billet, entradas.com, ticketone.it, billetlugen.dk,
//    eventim.co.uk) keyless with open CORS. Akamai blocks non-browser TLS
//    fingerprints, so it must be called browser-direct — a server-side
//    proxy would get 403.
//  - DICE: keyless unified_search, great club/gig coverage. CORS is
//    origin-allowlisted, so it goes through the same-origin /api/dice route.
//  - GoOut: keyless schedules API via the same-origin /api/goout route —
//    Czech/Slovak scene depth.
//  - Bandsintown: public REST API, queried per top artist (tour dates near
//    the stop). No key needed.
//  - Ticketmaster Discovery: optional free API key for extra arena/stadium
//    coverage.

import { geohash, distanceKm } from "./geo.js";

const LS_TM_KEY = "lmm.tm.key";
const LS_RA_AREAS = "lmm.ra.areas.v1";
const LS_EVM_CITIES = "lmm.evm.cities.v1";
const RA_PROXY = "/api/ra";
const DICE_PROXY = "/api/dice";
// Bandsintown allowlists app_ids (arbitrary ones get 403); js_widget is the
// public id its own embeddable widget uses in browsers.
const BIT_APP_ID = "js_widget";
// Spotify supplies up to ~150 artists (3 time ranges × 50); query them all —
// the API showed no rate limiting at 25 rapid sequential requests.
const BIT_MAX_ARTISTS = 150;
const NEARBY_KM = 80; // venue can be this far from the stop's coordinates

export function getTmKey() {
  return localStorage.getItem(LS_TM_KEY) || import.meta.env.VITE_TM_API_KEY || "";
}

export function setTmKey(key) {
  if (key.trim()) localStorage.setItem(LS_TM_KEY, key.trim());
  else localStorage.removeItem(LS_TM_KEY);
}

// Real artists used as the taste profile until Spotify is connected — the
// listings they match against are always live data.
export const SAMPLE_ARTISTS = [
  "Four Tet",
  "Bicep",
  "Jamie xx",
  "Floating Points",
  "Peggy Gou",
  "Overmono",
  "Caribou",
  "Fred again..",
  "Helena Hauff",
  "Ross From Friends",
].map((name) => ({ id: name, name, image: null }));

const norm = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// norm() strips non-Latin scripts entirely; without a fallback every
// Japanese/Cyrillic-titled event on the same date would collapse into one
// dedupe key.
const slug = (s) => norm(s || "") || (s || "").toLowerCase().trim();

// Tag each event with the top artists it features: exact match on billed
// attractions, fuzzy fallback on the event title for longer artist names.
function applyMatches(events, artists) {
  const byNorm = new Map(artists.map((a) => [norm(a.name), a.name]));
  return events.map((ev) => {
    const matches = [];
    for (const att of ev.attractions) {
      const hit = byNorm.get(norm(att));
      if (hit && !matches.includes(hit)) matches.push(hit);
    }
    if (!matches.length) {
      const title = " " + norm(ev.name) + " ";
      for (const [n, orig] of byNorm) {
        if (n.length >= 5 && title.includes(" " + n + " ")) {
          matches.push(orig);
          break;
        }
      }
    }
    return { ...ev, matches };
  });
}

// Tidy a source's genre labels into display-ready tags: title-case, dedupe,
// and drop the catch-all buckets that say nothing ("Music", "Other", ...).
const GENRE_NOISE = new Set(["music", "other", "undefined", "unknown", "weitere konzerte"]);

function cleanGenres(raw) {
  const out = [];
  const seen = new Set();
  for (const g of raw) {
    const label = (g || "")
      .trim()
      .toLowerCase()
      .replace(/(^|[\s/&-])[a-z]/g, (c) => c.toUpperCase());
    const key = norm(label);
    if (!label || GENRE_NOISE.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

const cache = new Map();

export async function fetchConcerts(stop, artists) {
  const tmKey = getTmKey();
  const names = artists.map((a) => a.name);
  const cacheKey = [
    stop.lat,
    stop.lng,
    stop.arrive,
    stop.depart,
    tmKey ? "tm" : "",
    names.slice(0, BIT_MAX_ARTISTS).join(","),
  ].join("|");
  let entry = cache.get(cacheKey);
  if (!entry) {
    entry = await fetchAllSources(stop, names, tmKey);
    // don't memoize degraded results — a transient source failure would
    // otherwise hide its events for the whole session
    if (!entry.sources.some((s) => s.status === "error")) cache.set(cacheKey, entry);
  }
  const events = applyMatches(entry.events, artists);
  events.sort(
    (a, b) =>
      b.matches.length - a.matches.length ||
      a.date.localeCompare(b.date) ||
      (a.time || "~").localeCompare(b.time || "~")
  );
  return { sources: entry.sources, events };
}

async function fetchAllSources(stop, names, tmKey) {
  // order matters: dedupe keeps the first occurrence, so richer listings
  // (lineups, local ticket links) win over sparser ones
  const tasks = [
    ["ra", "Resident Advisor", fetchResidentAdvisor(stop)],
    ["evm", "Eventim", fetchEventim(stop)],
    ["dice", "DICE", fetchDice(stop)],
    ["goout", "GoOut", fetchGoOut(stop)],
    ["bit", "Bandsintown", fetchBandsintown(stop, names)],
    ["tm", "Ticketmaster", tmKey ? fetchTicketmaster(stop, tmKey) : Promise.resolve({ skipped: true })],
  ];
  const settled = await Promise.allSettled(tasks.map((t) => t[2]));

  const sources = [];
  const events = [];
  const seen = new Set();
  settled.forEach((res, i) => {
    const [id, label] = tasks[i];
    if (res.status === "rejected") {
      sources.push({ id, label, status: "error", detail: res.reason?.message || "failed" });
      return;
    }
    if (res.value.skipped) {
      sources.push({ id, label, status: "skipped", detail: res.value.detail });
      return;
    }
    let count = 0;
    for (const ev of res.value.events) {
      // the same show often appears on two sources under slightly different
      // names — match on title+date, or venue+date+headliner
      const keys = [ev.date + "|" + slug(ev.name)];
      if (ev.venue) keys.push(ev.date + "|" + slug(ev.venue) + "|" + slug(ev.attractions[0] || ev.name));
      if (keys.some((k) => seen.has(k))) continue;
      keys.forEach((k) => seen.add(k));
      events.push(ev);
      count++;
    }
    sources.push({ id, label, status: "ok", count, detail: res.value.detail });
  });

  if (!sources.some((s) => s.status === "ok")) {
    const why = sources
      .filter((s) => s.status === "error")
      .map((s) => s.label + ": " + s.detail)
      .join("; ");
    throw new Error(why || "no concert source responded");
  }
  return { sources, events };
}

// ---- Resident Advisor ----

async function raQuery(query, variables) {
  const res = await fetch(RA_PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message || "graphql error");
  return json.data;
}

function countryName(cc) {
  if (!cc || cc.length !== 2) return "";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(cc.toUpperCase()) || "";
  } catch {
    return "";
  }
}

function loadAreaCache() {
  try {
    return JSON.parse(localStorage.getItem(LS_RA_AREAS)) || {};
  } catch {
    return {};
  }
}

// RA area ids verified against ra.co (June 2026) — instant lookups for
// common European stops; other cities go through the areas search above.
const RA_AREA_SEED = {
  "amsterdam|NL": 29, "athens|GR": 549, "barcelona|ES": 20, "berlin|DE": 34,
  "brussels|BE": 405, "budapest|HU": 449, "cologne|DE": 143, "copenhagen|DK": 402,
  "dublin|IE": 386, "frankfurt|DE": 147, "glasgow|GB": 340, "hamburg|DE": 148,
  "helsinki|FI": 407, "istanbul|TR": 73, "lisbon|PT": 53, "london|GB": 13,
  "madrid|ES": 41, "manchester|GB": 344, "milan|IT": 347, "munich|DE": 151,
  "oslo|NO": 408, "paris|FR": 44, "porto|PT": 364, "prague|CZ": 451,
  "rome|IT": 351, "stockholm|SE": 396, "tbilisi|GE": 188, "vienna|AT": 450,
  "warsaw|PL": 454, "zurich|CH": 390,
};

const areaMemo = new Map();

// RA organises listings by "area" (Berlin, London, ...). Resolve the stop's
// city to an area id via RA's search, preferring an area in the stop's
// country, falling back to an exact name match. null = RA doesn't cover it.
async function resolveRaArea(stop) {
  const key = norm(stop.city) + "|" + (stop.country || "").toUpperCase();
  if (key in RA_AREA_SEED) return RA_AREA_SEED[key];
  if (areaMemo.has(key)) return areaMemo.get(key);
  const stored = loadAreaCache();
  if (key in stored) {
    areaMemo.set(key, stored[key]);
    return stored[key];
  }
  // limit must stay <= 10 — larger values make the endpoint silently return []
  const data = await raQuery(
    "query($searchTerm: String!) { areas(searchTerm: $searchTerm, limit: 10) { id name country { name } } }",
    { searchTerm: stop.city }
  );
  const areas = data?.areas || [];
  const want = norm(countryName(stop.country));
  const area =
    (want && areas.find((a) => norm(a.country?.name || "") === want)) ||
    areas.find((a) => norm(a.name) === norm(stop.city)) ||
    null;
  const id = area ? Number(area.id) : null;
  areaMemo.set(key, id);
  if (id != null) {
    try {
      localStorage.setItem(LS_RA_AREAS, JSON.stringify({ ...loadAreaCache(), [key]: id }));
    } catch {
      // storage full/blocked — the in-memory cache still applies
    }
  }
  return id;
}

// sort makes pagination deterministic — without it pages can skip or repeat
// rows while we walk them
const raEventsQuery = (withGenres) => `query($filters: FilterInputDtoInput, $page: Int, $pageSize: Int) {
  eventListings(filters: $filters, pageSize: $pageSize, page: $page, sort: {listingDate: {order: ASCENDING}}) {
    data {
      id
      listingDate
      event { id title date startTime contentUrl venue { name } artists { name }${withGenres ? " genres { name }" : ""} }
    }
    totalResults
  }
}`;

const RA_PAGE = 100; // server caps pageSize at 100 ("Limit must not be greater than 100")
// London listed 1232 events over 30 days when probed — 20 pages of 100 keeps
// even month-long stays in the biggest cities complete
const RA_MAX_PAGES = 20;

// drop to a genre-less query if RA ever rejects the genres field
let raHasGenres = true;

async function fetchResidentAdvisor(stop) {
  const areaId = await resolveRaArea(stop);
  if (areaId == null) return { skipped: true, detail: stop.city + " isn't a Resident Advisor area" };

  const filters = {
    areas: { eq: areaId },
    listingDate: { gte: stop.arrive + "T00:00:00.000Z", lte: stop.depart + "T23:59:59.999Z" },
  };
  const fetchPage = (n) =>
    raQuery(raEventsQuery(raHasGenres), { filters, pageSize: RA_PAGE, page: n });

  let first;
  try {
    first = await fetchPage(1);
  } catch (e) {
    if (!raHasGenres || !/genres/i.test(e.message)) throw e;
    raHasGenres = false;
    first = await fetchPage(1);
  }
  let rows = first?.eventListings?.data || [];
  const total = Math.min(first?.eventListings?.totalResults || rows.length, RA_PAGE * RA_MAX_PAGES);
  if (rows.length === RA_PAGE && total > rows.length) {
    const rest = [];
    for (let n = 2; n <= Math.ceil(total / RA_PAGE); n++) rest.push(fetchPage(n));
    // keep whatever pages succeed — one failed page shouldn't void the rest
    for (const d of await Promise.allSettled(rest)) {
      if (d.status === "fulfilled") rows = rows.concat(d.value?.eventListings?.data || []);
    }
  }

  const events = [];
  const seen = new Set();
  for (const row of rows) {
    const ev = row.event;
    const date = (row.listingDate || ev?.date || "").slice(0, 10);
    if (!ev || !date || seen.has(ev.id)) continue;
    seen.add(ev.id);
    events.push({
      id: "ra-" + ev.id,
      source: "ra",
      name: ev.title,
      date,
      time: ev.startTime?.length >= 16 ? ev.startTime.slice(11, 16) : null,
      venue: ev.venue?.name || null,
      url: ev.contentUrl ? new URL(ev.contentUrl, "https://ra.co").href : null,
      attractions: (ev.artists || []).map((a) => a.name),
      genres: cleanGenres((ev.genres || []).map((g) => g.name)),
    });
  }
  return { events };
}

// ---- Eventim network ----
// One shared search API behind Europe's largest ticketer group. Keyless and
// CORS-open, but Akamai rejects non-browser TLS fingerprints — these calls
// only work browser-direct (do NOT route them through a proxy).

const EVM_BASE = "https://public-api.eventim.com/websearch/search/api/exploration/v1/products";
// the API hard-caps top at 50 and silently ignores its page param, so wide
// stays are fetched one day at a time — no single day exceeds 50 listings
const EVM_TOP = 50;
const EVM_MAX_DAYS = 31;

// per-country shop + the local name of its music category (probed June 2026;
// the API's categories facet is empty, so these can't be discovered at runtime)
const EVM_SHOPS = {
  DE: { webId: "web__eventim-de", lang: "de", categories: ["Konzerte"] },
  AT: { webId: "web__oeticket-at", lang: "de", categories: ["Konzerte"] },
  CH: { webId: "web__ticketcorner-ch", lang: "de", categories: ["Musik"] },
  FR: { webId: "web__eventim-fr", lang: "fr", categories: ["Concerts & Festivals"] },
  ES: { webId: "web__entradas-com", lang: "es", categories: ["Conciertos y festivales", "Discotecas y Fiestas"] },
  IT: { webId: "web__ticketone-it", lang: "it", categories: ["Concerti"] },
  DK: { webId: "web__billetlugen-dk", lang: "da", categories: ["Musik"] },
  GB: { webId: "web__eventim-co-uk", lang: "en", categories: ["Music"] },
};

// city ids verified via the API's cities facet (one shared id space across
// shops); other cities resolve at runtime through the same facet
const EVM_CITY_SEED = {
  "berlin|DE": "1", "hamburg|DE": "7", "cologne|DE": "9", "munich|DE": "11",
  "frankfurt|DE": "6", "stuttgart|DE": "12", "dresden|DE": "3", "leipzig|DE": "10",
  "zurich|CH": "21", "paris|FR": "369", "madrid|ES": "370", "barcelona|ES": "371",
  "milan|IT": "215", "london|GB": "181", "copenhagen|DK": "1694",
};

// the facet search wants local spellings; stops use English names
const EVM_LOCAL_NAME = {
  vienna: "wien", munich: "muenchen", cologne: "koeln", zurich: "zuerich",
  geneva: "genf", milan: "milano", rome: "roma", florence: "firenze",
  naples: "napoli", turin: "torino", venice: "venezia", copenhagen: "koebenhavn",
  seville: "sevilla", nuremberg: "nuernberg", hanover: "hannover", genoa: "genova",
  padua: "padova", mantua: "mantova", syracuse: "siracusa",
  lucerne: "luzern", saragossa: "zaragoza",
};

function evmUrl(shop, params) {
  const q = new URLSearchParams({ webId: shop.webId, language: shop.lang, ...params });
  return EVM_BASE + "?" + q;
}

async function evmFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

async function resolveEvmCity(shop, stop) {
  const key = norm(stop.city) + "|" + (stop.country || "").toUpperCase();
  if (key in EVM_CITY_SEED) return EVM_CITY_SEED[key];
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(LS_EVM_CITIES)) || {};
  } catch {
    // ignore — falls through to a fresh lookup
  }
  if (key in stored) return stored[key];

  const term = EVM_LOCAL_NAME[norm(stop.city)] || stop.city;
  const data = await evmFetch(evmUrl(shop, { search_term: term, top: "1" }));
  const items = (data.facets || []).find((f) => f.name === "cities")?.facetItems || [];
  const wantNorm = norm(stop.city);
  const wantLocal = norm(term);
  const hit = items.find((i) => {
    const v = norm(i.value || "");
    return i.info && (v === wantNorm || v === wantLocal || v.startsWith(wantLocal + " "));
  });
  const id = hit ? hit.info.slice(hit.info.lastIndexOf("-") + 1) : null;
  // only persist hits — a cached miss would outlive fixes to the matching
  if (id != null) {
    try {
      localStorage.setItem(LS_EVM_CITIES, JSON.stringify({ ...stored, [key]: id }));
    } catch {
      // storage full/blocked — lookup just repeats next time
    }
  }
  return id;
}

function eachDay(from, to, cap) {
  const days = [];
  const end = new Date(to + "T00:00:00Z").getTime();
  for (let t = new Date(from + "T00:00:00Z").getTime(); t <= end && days.length < cap; t += 86400000) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

async function fetchEventim(stop) {
  const shop = EVM_SHOPS[(stop.country || "").toUpperCase()];
  if (!shop) return { skipped: true };
  const cityId = await resolveEvmCity(shop, stop);
  if (!cityId) return { skipped: true };

  const slices = [];
  for (const category of shop.categories) {
    for (const day of eachDay(stop.arrive, stop.depart, EVM_MAX_DAYS)) slices.push({ category, day });
  }
  const lists = await pool(slices, 6, ({ category, day }) =>
    evmFetch(
      evmUrl(shop, {
        city_ids: cityId,
        categories: category,
        date_from: day,
        date_to: day,
        sort: "DateAsc",
        top: String(EVM_TOP),
      })
    ).then((d) => d.products || [])
  );
  if (lists.every((l) => l === null)) throw new Error("no response");

  const events = [];
  const seen = new Set();
  for (const products of lists) {
    for (const p of products || []) {
      const le = p.typeAttributes?.liveEntertainment;
      const start = le?.startDate || "";
      const date = start.slice(0, 10);
      if (!p.productId || !date || seen.has(p.productId)) continue;
      seen.add(p.productId);
      events.push({
        id: "evm-" + p.productId,
        source: "evm",
        name: p.name,
        date,
        time: start.length >= 16 ? start.slice(11, 16) : null,
        venue: le?.location?.name || null,
        url: p.link || (p.url ? p.url.domain + p.url.path : null),
        attractions: (p.attractions || []).map((a) => a.name).filter(Boolean),
        // subcategories under the shop's music category are genres
        // ("Rock & Pop", "Hard & Heavy", ...)
        genres: cleanGenres(
          (p.categories || [])
            .filter((c) => c.parentCategory && shop.categories.includes(c.parentCategory.name))
            .map((c) => c.name)
        ),
      });
    }
  }
  return { events };
}

// ---- DICE ----
// Keyless browse search grouped by day; CORS is origin-allowlisted, so it
// goes through the same-origin /api/dice route (Vite proxy / Netlify rewrite).

const DICE_PAGE = 50;
const DICE_MAX_PAGES = 4;

async function fetchDice(stop) {
  const events = [];
  const seen = new Set();
  let cursor = null;
  for (let n = 0; n < DICE_MAX_PAGES; n++) {
    const res = await fetch(DICE_PROXY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        count: DICE_PAGE,
        lat: stop.lat,
        lng: stop.lng,
        dates: { from: stop.arrive, to: stop.depart },
        ...(cursor ? { cursor } : {}),
      }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();

    for (const section of data.sections || []) {
      for (const item of section.items || []) {
        const ev = item.event;
        if (item.type !== "event" || !ev || seen.has(ev.id) || ev.status === "cancelled") continue;
        seen.add(ev.id);
        const start = ev.dates?.event_start_date || "";
        const date = start.slice(0, 10);
        if (!date || date < stop.arrive || date > stop.depart) continue;
        // browse mode keys off DICE's nearest city — when the stop is far
        // from any DICE city that "nearest" can be a long way off
        const v = ev.venues?.[0];
        const loc = v?.location || v?.city?.location;
        if (loc && distanceKm(stop, loc) > NEARBY_KM) continue;
        events.push({
          id: "dice-" + ev.id,
          source: "dice",
          name: ev.name,
          date,
          time: start.length >= 16 ? start.slice(11, 16) : null,
          venue: v?.name || null,
          url: "https://dice.fm/event/" + ev.id,
          attractions: (ev.summary_lineup?.artists || []).map((a) => a.name).filter(Boolean),
          genres: [], // unified_search browse results carry no genre info
        });
      }
    }
    cursor = data.next_page_cursor;
    if (!cursor) break;
  }
  return { events };
}

// ---- GoOut ----
// The JSON:API behind goout.net (its feeder API has no upper date bound and
// returns unordered rows). Keyless but no CORS headers, so it goes through
// the same-origin /api/goout route. City ids scraped from goout.net pages
// (June 2026) — it only covers these scenes, other stops skip it.

const GOOUT_PROXY = "/api/goout";
// CZ/SK only — GoOut's Polish and German scenes returned ~no rows when probed
const GOOUT_CITIES = {
  "prague|CZ": 101748113, "brno|CZ": 101748109, "ostrava|CZ": 101748125,
  "pilsen|CZ": 101748111, "bratislava|SK": 1108800123,
};
const GOOUT_PAGE = 50;
const GOOUT_MAX_PAGES = 6;

async function fetchGoOut(stop) {
  const cityId = GOOUT_CITIES[norm(stop.city) + "|" + (stop.country || "").toUpperCase()];
  if (!cityId) return { skipped: true };

  const events = [];
  const seen = new Set();
  let scrollId = null;
  for (let page = 0; page < GOOUT_MAX_PAGES; page++) {
    const q = new URLSearchParams({
      "languages[]": "en",
      "categories[]": "concerts",
      "cityIds[]": String(cityId),
      after: stop.arrive + "T00:00:00.000Z",
      before: stop.depart + "T23:59:59.999Z",
      sort: "popularity:desc",
      grouped: "true",
      limit: String(GOOUT_PAGE),
      include: "events,venues,performers",
      ...(scrollId ? { scrollId } : {}),
    });
    const res = await fetch(GOOUT_PROXY + "?" + q);
    if (!res.ok) throw new Error("HTTP " + res.status);
    // GoOut emits raw control characters inside JSON strings; the response is
    // minified, so blanking them never touches structural whitespace
    const data = JSON.parse((await res.text()).replace(/[\u0000-\u001f]/g, " "));

    const evById = new Map((data.included?.events || []).map((e) => [e.id, e]));
    const venueById = new Map((data.included?.venues || []).map((v) => [v.id, v]));
    const perfById = new Map((data.included?.performers || []).map((p) => [p.id, p]));
    const rows = data.schedules || [];

    for (const s of rows) {
      const start = s.attributes?.startAt || "";
      const date = start.slice(0, 10);
      if (!date || seen.has(s.id) || s.attributes?.state === "cancelled") continue;
      if (date < stop.arrive || date > stop.depart) continue;
      seen.add(s.id);
      const ev = evById.get(s.relationships?.event?.id);
      const venue = venueById.get(s.relationships?.venue?.id);
      events.push({
        id: "go-" + s.id,
        source: "goout",
        name: ev?.locales?.en?.name || venue?.locales?.en?.name || "Concert",
        date,
        time: s.attributes?.hasTime && start.length >= 16 ? start.slice(11, 16) : null,
        venue: venue?.locales?.en?.name || null,
        url: s.url || null,
        attractions: (ev?.relationships?.performers || [])
          .map((p) => perfById.get(p.id)?.locales?.en?.name)
          .filter(Boolean),
        // tags are snake_case genre slugs ("jazz_blues_swing", "concert_alternative")
        genres: cleanGenres(
          (ev?.attributes?.tags || []).map((t) => t.replace(/^concert_/, "").replace(/_/g, " "))
        ),
      });
    }
    scrollId = data.meta?.nextScrollId;
    if (!scrollId || rows.length < GOOUT_PAGE) break;
  }
  return { events };
}

// ---- Bandsintown ----

// Run fn over items with limited concurrency; failures resolve to null.
async function pool(items, limit, fn) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]).catch(() => null);
    }
  });
  await Promise.all(workers);
  return out;
}

async function fetchBandsintown(stop, names) {
  const top = names.slice(0, BIT_MAX_ARTISTS);
  if (!top.length) return { skipped: true };
  const lists = await pool(top, 8, (name) => bitArtistEvents(name, stop));
  if (lists.every((l) => l === null)) throw new Error("no response");
  const events = [];
  const seen = new Set();
  for (const list of lists) {
    for (const ev of list || []) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      events.push(ev);
    }
  }
  const failed = lists.filter((l) => l === null).length;
  return { events, detail: failed ? `${top.length - failed}/${top.length} artists checked` : undefined };
}

const BIT_DIRECT = "https://rest.bandsintown.com";
const BIT_PROXY = "/api/bit";
let bitBase = BIT_DIRECT;

async function bitFetch(path) {
  if (bitBase === BIT_DIRECT) {
    try {
      return await fetch(BIT_DIRECT + path);
    } catch {
      bitBase = BIT_PROXY; // CORS or network blocked — retry via same-origin proxy
    }
  }
  return fetch(bitBase + path);
}

async function bitArtistEvents(name, stop) {
  // Bandsintown wants /, ? and * double-encoded in artist names, and dots
  // percent-encoded ("Fred again.." only resolves as Fred%20again%2E%2E)
  const enc = encodeURIComponent(name)
    .replace(/%2F/gi, "%252F")
    .replace(/%3F/gi, "%253F")
    .replace(/\*/g, "%252A")
    .replace(/\./g, "%2E");
  const res = await bitFetch(
    "/artists/" + enc + "/events?app_id=" + BIT_APP_ID +
      "&date=" + stop.arrive + "%2C" + stop.depart
  );
  if (res.status === 404) return []; // artist not on Bandsintown
  if (!res.ok) throw new Error("HTTP " + res.status);
  if (!(res.headers.get("content-type") || "").includes("json")) {
    throw new Error("blocked (is the /api/bit rewrite set up?)");
  }
  const data = await res.json().catch(() => null);
  if (!Array.isArray(data)) return [];

  const out = [];
  for (const ev of data) {
    const v = ev.venue || {};
    const lat = parseFloat(v.latitude);
    const lng = parseFloat(v.longitude);
    const near =
      Number.isFinite(lat) && Number.isFinite(lng)
        ? distanceKm(stop, { lat, lng }) <= NEARBY_KM
        : norm(v.city || "") === norm(stop.city);
    const date = (ev.datetime || "").slice(0, 10);
    if (!near || !date || date < stop.arrive || date > stop.depart) continue;
    out.push({
      id: "bit-" + ev.id,
      source: "bit",
      name: ev.title?.trim() || name,
      date,
      time: ev.datetime?.length >= 16 ? ev.datetime.slice(11, 16) : null,
      venue: v.name || null,
      url: ev.offers?.find((o) => o.url)?.url || ev.url || null,
      attractions: ev.lineup?.length ? ev.lineup : [name],
      genres: [], // Bandsintown's events API carries no genre info
    });
  }
  return out;
}

// ---- Ticketmaster ----

const TM_PAGE = 200; // API rejects size > 200
const TM_MAX_PAGES = 5; // deep-paging rule: size * page < 1000

async function fetchTicketmaster(stop, apikey) {
  const events = [];
  const seen = new Set();
  for (let page = 0; page < TM_MAX_PAGES; page++) {
    const params = new URLSearchParams({
      apikey,
      geoPoint: geohash(stop.lat, stop.lng),
      radius: String(NEARBY_KM),
      unit: "km",
      classificationName: "Music",
      // venue-local time, not UTC — late shows on the departure day stay in
      localStartDateTime: stop.arrive + "T00:00:00," + stop.depart + "T23:59:59",
      // default locale=en hides events localized in other languages
      locale: "*",
      size: String(TM_PAGE),
      page: String(page),
      sort: "date,asc",
    });
    const res = await fetch(
      "https://app.ticketmaster.com/discovery/v2/events.json?" + params
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    for (const ev of data._embedded?.events || []) {
      const date = ev.dates?.start?.localDate;
      if (!date || seen.has(ev.id)) continue;
      seen.add(ev.id);
      events.push({
        id: "tm-" + ev.id,
        source: "tm",
        name: ev.name,
        date,
        time: ev.dates?.start?.localTime?.slice(0, 5) || null,
        venue: ev._embedded?.venues?.[0]?.name || null,
        url: ev.url || null,
        attractions: (ev._embedded?.attractions || []).map((a) => a.name),
        genres: cleanGenres(
          (ev.classifications || []).flatMap((c) => [c.genre?.name, c.subGenre?.name])
        ),
      });
    }
    if (page >= (data.page?.totalPages || 1) - 1) break;
  }
  return { events };
}
