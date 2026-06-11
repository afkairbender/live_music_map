// Real concert listings — no fake data. Three sources, fetched in parallel,
// merged and deduped:
//  - Resident Advisor: public GraphQL endpoint (ra.co/graphql). It has no
//    CORS headers, so we call it through the same-origin /api/ra route —
//    Vite's dev proxy locally, a Netlify rewrite in production.
//  - Bandsintown: public REST API, queried per top artist (tour dates near
//    the stop). No key needed.
//  - Ticketmaster Discovery: optional free API key for extra arena/stadium
//    coverage.

import { geohash, distanceKm } from "./geo.js";

const LS_TM_KEY = "lmm.tm.key";
const LS_RA_AREAS = "lmm.ra.areas.v1";
const RA_PROXY = "/api/ra";
const BIT_APP_ID = "live_music_map";
const BIT_MAX_ARTISTS = 30;
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
    cache.set(cacheKey, entry);
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
  const tasks = [
    ["ra", "Resident Advisor", fetchResidentAdvisor(stop)],
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
      const keys = [ev.date + "|" + norm(ev.name)];
      if (ev.venue) keys.push(ev.date + "|" + norm(ev.venue) + "|" + norm(ev.attractions[0] || ev.name));
      if (keys.some((k) => seen.has(k))) continue;
      keys.forEach((k) => seen.add(k));
      events.push(ev);
      count++;
    }
    sources.push({ id, label, status: "ok", count });
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

const areaMemo = new Map();

// RA organises listings by "area" (Berlin, London, ...). Resolve the stop's
// city to an area id via RA's search, preferring an area in the stop's
// country, falling back to an exact name match. null = RA doesn't cover it.
async function resolveRaArea(stop) {
  const key = norm(stop.city) + "|" + (stop.country || "").toUpperCase();
  if (areaMemo.has(key)) return areaMemo.get(key);
  const stored = loadAreaCache();
  if (key in stored) {
    areaMemo.set(key, stored[key]);
    return stored[key];
  }
  const data = await raQuery(
    "query($searchTerm: String!) { areas(searchTerm: $searchTerm, limit: 8) { id name country { name } } }",
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

const RA_EVENTS_QUERY = `query($filters: FilterInputDtoInput, $page: Int, $pageSize: Int) {
  eventListings(filters: $filters, pageSize: $pageSize, page: $page) {
    data {
      id
      listingDate
      event { id title date startTime contentUrl venue { name } artists { name } }
    }
    totalResults
  }
}`;

const RA_PAGE = 20;
const RA_MAX_PAGES = 6;

async function fetchResidentAdvisor(stop) {
  const areaId = await resolveRaArea(stop);
  if (areaId == null) return { skipped: true, detail: stop.city + " isn't a Resident Advisor area" };

  const filters = {
    areas: { eq: areaId },
    listingDate: { gte: stop.arrive + "T00:00:00.000Z", lte: stop.depart + "T23:59:59.999Z" },
  };
  const fetchPage = (n) => raQuery(RA_EVENTS_QUERY, { filters, pageSize: RA_PAGE, page: n });

  const first = await fetchPage(1);
  let rows = first?.eventListings?.data || [];
  const total = Math.min(first?.eventListings?.totalResults || rows.length, RA_PAGE * RA_MAX_PAGES);
  if (rows.length === RA_PAGE && total > rows.length) {
    const rest = [];
    for (let n = 2; n <= Math.ceil(total / RA_PAGE); n++) rest.push(fetchPage(n));
    for (const d of await Promise.all(rest)) rows = rows.concat(d?.eventListings?.data || []);
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
    });
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
  return { events };
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
  // Bandsintown wants /, ? and * double-encoded in artist names
  const enc = encodeURIComponent(name)
    .replace(/%2F/gi, "%252F")
    .replace(/%3F/gi, "%253F")
    .replace(/\*/g, "%252A");
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
    });
  }
  return out;
}

// ---- Ticketmaster ----

async function fetchTicketmaster(stop, apikey) {
  const params = new URLSearchParams({
    apikey,
    geoPoint: geohash(stop.lat, stop.lng),
    radius: "60",
    unit: "km",
    classificationName: "Music",
    startDateTime: stop.arrive + "T00:00:00Z",
    endDateTime: stop.depart + "T23:59:59Z",
    size: "180",
    sort: "date,asc",
  });
  const res = await fetch(
    "https://app.ticketmaster.com/discovery/v2/events.json?" + params
  );
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  const seen = new Set();
  const events = [];
  for (const ev of data._embedded?.events || []) {
    const date = ev.dates?.start?.localDate;
    if (!date) continue;
    const dedupe = norm(ev.name) + "|" + date;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    events.push({
      id: "tm-" + ev.id,
      source: "tm",
      name: ev.name,
      date,
      time: ev.dates?.start?.localTime?.slice(0, 5) || null,
      venue: ev._embedded?.venues?.[0]?.name || null,
      url: ev.url || null,
      attractions: (ev._embedded?.attractions || []).map((a) => a.name),
    });
  }
  return { events };
}
