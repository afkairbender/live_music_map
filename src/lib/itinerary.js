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
  return d
    .toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" })
    .toUpperCase();
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

export function loadItinerary() {
  try {
    const stops = JSON.parse(localStorage.getItem(LS_KEY));
    if (Array.isArray(stops) && stops.length && stops.every((s) => s.id && s.city)) {
      return stops;
    }
  } catch {
    // fall through to default
  }
  return defaultItinerary();
}

export function saveItinerary(stops) {
  localStorage.setItem(LS_KEY, JSON.stringify(stops));
}
