import { describe, expect, it, vi } from "vitest";
import { distanceKm, flagEmoji, geohash, searchCities } from "./geo.js";

describe("geohash", () => {
  // expected hashes cross-checked against an independent bit-interleaving
  // implementation; Berlin/London carry the well-known u33d/gcpv prefixes
  it("encodes known cities", () => {
    expect(geohash(52.52, 13.41)).toBe("u33dc0uz5"); // Berlin
    expect(geohash(51.51, -0.13)).toBe("gcpvj1176"); // London
  });

  it("defaults to 9 chars and honors a custom precision", () => {
    expect(geohash(52.52, 13.41)).toHaveLength(9);
    expect(geohash(48.86, 2.35, 5)).toBe("u09tv"); // Paris
  });
});

describe("distanceKm", () => {
  it("London to Paris is ~343 km", () => {
    const d = distanceKm({ lat: 51.5074, lng: -0.1278 }, { lat: 48.8566, lng: 2.3522 });
    expect(d).toBeGreaterThan(338);
    expect(d).toBeLessThan(348);
  });

  it("is zero for identical points", () => {
    expect(distanceKm({ lat: 52.52, lng: 13.41 }, { lat: 52.52, lng: 13.41 })).toBe(0);
  });

  it("antipodal points are half Earth's circumference (~20015 km)", () => {
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(20015.09, 1);
  });
});

describe("flagEmoji", () => {
  it("maps ISO codes to regional-indicator pairs, case-insensitively", () => {
    expect(flagEmoji("DE")).toBe("🇩🇪");
    expect(flagEmoji("de")).toBe("🇩🇪");
    expect(flagEmoji("JP")).toBe("🇯🇵");
  });

  it("returns empty string for missing or malformed codes", () => {
    expect(flagEmoji("")).toBe("");
    expect(flagEmoji("D")).toBe("");
    expect(flagEmoji("DEU")).toBe("");
  });
});

describe("searchCities", () => {
  const remoteJson = (results) => vi.fn(async () => new Response(JSON.stringify({ results })));
  const offline = () => vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

  it("returns [] for queries under 2 chars without fetching", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await searchCities("b")).toEqual([]);
    expect(await searchCities("  a ")).toEqual([]); // trimmed before the length check
    expect(f).not.toHaveBeenCalled();
  });

  it("matches local cities by diacritic-folded prefix", async () => {
    offline();
    expect((await searchCities("sao")).map((c) => c.city)).toContain("São Paulo");
    expect((await searchCities("reyk")).map((c) => c.city)).toContain("Reykjavík");
  });

  it("still returns local matches when the remote geocoder fails", async () => {
    offline();
    expect(await searchCities("berl")).toEqual([{ city: "Berlin", country: "DE", lat: 52.52, lng: 13.41 }]);
  });

  it("merges remote results behind local ones and dedupes overlaps", async () => {
    const f = remoteJson([
      { name: "Berlin", country_code: "DE", latitude: 52.5, longitude: 13.4 }, // dupe of local entry
      { name: "Bern", country_code: "CH", latitude: 46.95, longitude: 7.45 },
    ]);
    vi.stubGlobal("fetch", f);
    const out = await searchCities("ber");
    expect(out.map((c) => c.city + "|" + c.country)).toEqual(["Berlin|DE", "Bern|CH"]);
    expect(out[0].lat).toBe(52.52); // the local entry won over the remote duplicate
    expect(String(f.mock.calls[0][0])).toContain("geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=ber");
  });

  it("caps combined results at 6", async () => {
    vi.stubGlobal(
      "fetch",
      remoteJson(["Loano", "Lobito", "Lodz", "Lommel", "Lorca", "Loreto"].map((name, i) => ({ name, country_code: "XX", latitude: i, longitude: i })))
    );
    const out = await searchCities("lo"); // local: London, Los Angeles + 6 remote = 8 candidates
    expect(out).toHaveLength(6);
    expect(out.slice(0, 2).map((c) => c.city)).toEqual(["London", "Los Angeles"]);
  });
});
