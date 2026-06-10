// Concert lookups. With a Ticketmaster Discovery API key we pull real events
// near each stop during the stay; without one we synthesize a deterministic
// "simulated feed" from your artists so the app works with zero setup.

import { geohash } from "./geo.js";

const LS_TM_KEY = "lmm.tm.key";

export function getTmKey() {
  return localStorage.getItem(LS_TM_KEY) || import.meta.env.VITE_TM_API_KEY || "";
}

export function setTmKey(key) {
  if (key.trim()) localStorage.setItem(LS_TM_KEY, key.trim());
  else localStorage.removeItem(LS_TM_KEY);
}

export const DEMO_ARTISTS = [
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
  const key = getTmKey();
  const cacheKey = [stop.lat, stop.lng, stop.arrive, stop.depart, key ? "tm" : "demo"].join("|");
  let entry = cache.get(cacheKey);
  if (!entry) {
    entry = key ? await fetchTicketmaster(stop, key) : { source: "demo", events: demoEvents(stop, artists) };
    cache.set(cacheKey, entry);
  }
  const events = applyMatches(entry.events, artists);
  events.sort((a, b) =>
    (b.matches.length - a.matches.length) || a.date.localeCompare(b.date)
  );
  return { source: entry.source, events };
}

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
  if (!res.ok) throw new Error("ticketmaster error (" + res.status + ")");
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
      id: ev.id,
      name: ev.name,
      date,
      time: ev.dates?.start?.localTime?.slice(0, 5) || null,
      venue: ev._embedded?.venues?.[0]?.name || null,
      url: ev.url || null,
      attractions: (ev._embedded?.attractions || []).map((a) => a.name),
    });
  }
  return { source: "ticketmaster", events };
}

// ---- simulated feed ----

const FILLER_ACTS = [
  "VOID CIRCUIT", "NIGHT BUREAU", "STATIC BLOOM", "GHOST LATTICE",
  "MODULAR GRIEF", "PHASE IV", "KERNEL PANIC", "TAPE LOOP ORPHANS",
  "ACID ARCHIVE", "SIGNAL DECAY", "POLY RHYTHM UNIT", "DIAL TONE CHOIR",
];

const VENUES = [
  "BUNKER 03", "TURBINE HALL", "DRIFT WAREHOUSE", "CLUB MERIDIAN",
  "SUBSTATION K", "NEON DEPOT", "HANGAR NORD", "THE OSCILLOSCOPE",
  "SALA APEX", "PALAIS NUIT",
];

const TIMES = ["20:00", "21:00", "22:00", "23:00", "23:59", "01:00"];

function seededRng(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), h | 1);
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
}

function* datesBetween(arrive, depart) {
  const d = new Date(arrive + "T12:00:00Z");
  const end = new Date(depart + "T12:00:00Z");
  while (d <= end) {
    yield d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

function demoEvents(stop, artists) {
  const rng = seededRng(stop.city + "|" + stop.arrive);
  const days = [...datesBetween(stop.arrive, stop.depart)];
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const pool = (artists.length ? artists : DEMO_ARTISTS).map((a) => a.name);
  const events = [];
  // 2-3 shows from artists you actually listen to
  const yours = Math.min(pool.length, days.length, 2 + Math.floor(rng() * 2));
  const used = new Set();
  for (let i = 0; i < yours; i++) {
    let name = pick(pool.slice(0, Math.min(pool.length, 20)));
    if (used.has(name)) continue;
    used.add(name);
    events.push({
      id: "demo-y-" + i,
      name,
      date: pick(days),
      time: pick(TIMES),
      venue: pick(VENUES),
      url: null,
      attractions: [name],
    });
  }
  // plus a handful of local filler acts
  const fillers = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < fillers; i++) {
    const name = FILLER_ACTS[(i * 5 + Math.floor(rng() * FILLER_ACTS.length)) % FILLER_ACTS.length];
    events.push({
      id: "demo-f-" + i,
      name,
      date: pick(days),
      time: pick(TIMES),
      venue: pick(VENUES),
      url: null,
      attractions: [name],
    });
  }
  return events;
}
