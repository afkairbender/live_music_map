// Itinerary persistence + a default trip (starting ~3 weeks out) so the globe
// is alive on first load.

const LS_KEY = "lmm.itinerary.v1";

export function addDays(isoDate, n) {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function fmtDate(iso) {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

let nextId = Date.now();
export const newId = () => "s" + (nextId++).toString(36);

function defaultItinerary() {
  const base = addDays(todayIso(), 21);
  const cities = [
    { city: "Lisbon", country: "PT", lat: 38.72, lng: -9.14 },
    { city: "Barcelona", country: "ES", lat: 41.39, lng: 2.17 },
    { city: "Berlin", country: "DE", lat: 52.52, lng: 13.41 },
    { city: "Tokyo", country: "JP", lat: 35.68, lng: 139.69 },
  ];
  return cities.map((c, i) => ({
    ...c,
    id: newId(),
    arrive: addDays(base, i * 4),
    depart: addDays(base, (i + 1) * 4),
  }));
}

// Corrupt or hand-edited storage flows straight into distance math and date
// formatting, so every field gets vetted before a saved trip is trusted.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validStop = (s) =>
  s &&
  typeof s.id === "string" &&
  typeof s.city === "string" &&
  Number.isFinite(s.lat) && Math.abs(s.lat) <= 90 &&
  Number.isFinite(s.lng) && Math.abs(s.lng) <= 180 &&
  DATE_RE.test(s.arrive) && DATE_RE.test(s.depart);

export function loadItinerary() {
  try {
    const stops = JSON.parse(localStorage.getItem(LS_KEY));
    if (Array.isArray(stops) && stops.length && stops.every(validStop)) {
      return stops;
    }
  } catch {
    // fall through to default
  }
  return defaultItinerary();
}

export function saveItinerary(stops) {
  // Private mode / full storage throws on setItem; losing persistence beats
  // crashing the app from inside a React effect, so swallow it.
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(stops));
  } catch {
    // the trip just won't survive a reload
  }
}
