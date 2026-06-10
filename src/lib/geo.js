// Geo helpers: city search (local list + Open-Meteo geocoder, no key needed),
// geohash encoding for Ticketmaster's geoPoint param, great-circle distance.

const LOCAL_CITIES = [
  ["Amsterdam", "NL", 52.37, 4.9],
  ["Athens", "GR", 37.98, 23.73],
  ["Austin", "US", 30.27, -97.74],
  ["Bangkok", "TH", 13.76, 100.5],
  ["Barcelona", "ES", 41.39, 2.17],
  ["Berlin", "DE", 52.52, 13.41],
  ["Bogotá", "CO", 4.71, -74.07],
  ["Buenos Aires", "AR", -34.6, -58.38],
  ["Cape Town", "ZA", -33.92, 18.42],
  ["Chicago", "US", 41.88, -87.63],
  ["Copenhagen", "DK", 55.68, 12.57],
  ["Detroit", "US", 42.33, -83.05],
  ["Dublin", "IE", 53.35, -6.26],
  ["Glasgow", "GB", 55.86, -4.25],
  ["Hong Kong", "HK", 22.32, 114.17],
  ["Istanbul", "TR", 41.01, 28.95],
  ["Lisbon", "PT", 38.72, -9.14],
  ["London", "GB", 51.51, -0.13],
  ["Los Angeles", "US", 34.05, -118.24],
  ["Madrid", "ES", 40.42, -3.7],
  ["Melbourne", "AU", -37.81, 144.96],
  ["Mexico City", "MX", 19.43, -99.13],
  ["Miami", "US", 25.76, -80.19],
  ["Milan", "IT", 45.46, 9.19],
  ["Montréal", "CA", 45.5, -73.57],
  ["Mumbai", "IN", 19.08, 72.88],
  ["Nashville", "US", 36.16, -86.78],
  ["New Orleans", "US", 29.95, -90.07],
  ["New York", "US", 40.71, -74.01],
  ["Osaka", "JP", 34.69, 135.5],
  ["Paris", "FR", 48.86, 2.35],
  ["Prague", "CZ", 50.08, 14.44],
  ["Reykjavík", "IS", 64.15, -21.94],
  ["Rio de Janeiro", "BR", -22.91, -43.17],
  ["Rome", "IT", 41.89, 12.48],
  ["San Francisco", "US", 37.77, -122.42],
  ["São Paulo", "BR", -23.55, -46.63],
  ["Seattle", "US", 47.61, -122.33],
  ["Seoul", "KR", 37.57, 126.98],
  ["Singapore", "SG", 1.35, 103.82],
  ["Stockholm", "SE", 59.33, 18.07],
  ["Sydney", "AU", -33.87, 151.21],
  ["Tbilisi", "GE", 41.72, 44.79],
  ["Tokyo", "JP", 35.68, 139.69],
  ["Toronto", "CA", 43.65, -79.38],
  ["Vienna", "AT", 48.21, 16.37],
].map(([city, country, lat, lng]) => ({ city, country, lat, lng }));

const fold = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

// Local matches come back instantly; remote results from Open-Meteo's free
// geocoder are merged in behind them. Works offline for the local list.
export async function searchCities(query) {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  const local = LOCAL_CITIES.filter((c) => fold(c.city).startsWith(q));
  let remote = [];
  try {
    const res = await fetch(
      "https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=" +
        encodeURIComponent(query.trim())
    );
    if (res.ok) {
      const data = await res.json();
      remote = (data.results || []).map((r) => ({
        city: r.name,
        country: r.country_code || "",
        lat: r.latitude,
        lng: r.longitude,
      }));
    }
  } catch {
    // offline / blocked — local list still works
  }
  const out = [];
  const seen = new Set();
  for (const c of [...local, ...remote]) {
    const key = fold(c.city) + "|" + c.country;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(c);
    }
  }
  return out.slice(0, 6);
}

const B32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function geohash(lat, lng, precision = 9) {
  let idx = 0;
  let bit = 0;
  let even = true;
  let hash = "";
  let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
  while (hash.length < precision) {
    if (even) {
      const mid = (lonMin + lonMax) / 2;
      if (lng >= mid) { idx = idx * 2 + 1; lonMin = mid; }
      else { idx *= 2; lonMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { idx = idx * 2 + 1; latMin = mid; }
      else { idx *= 2; latMax = mid; }
    }
    even = !even;
    if (++bit === 5) {
      hash += B32[idx];
      bit = 0;
      idx = 0;
    }
  }
  return hash;
}

export function flagEmoji(cc) {
  if (!cc || cc.length !== 2) return "";
  return String.fromCodePoint(
    ...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))
  );
}

export function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
