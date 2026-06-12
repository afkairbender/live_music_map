import { describe, expect, it } from "vitest";
import { addDays, fmtDate, loadItinerary, newId, saveItinerary } from "./itinerary.js";

const LS_KEY = "lmm.itinerary.v1";
const STOPS = [
  { id: "s1", city: "Berlin", country: "DE", lat: 52.52, lng: 13.41, arrive: "2026-07-01", depart: "2026-07-05" },
  { id: "s2", city: "Tokyo", country: "JP", lat: 35.68, lng: 139.69, arrive: "2026-07-05", depart: "2026-07-09" },
];

// the default itinerary's exact contents may evolve; assert only the shape the
// app relies on: a non-empty list of identified, dated stops
const expectDefaultShape = (stops) => {
  expect(Array.isArray(stops)).toBe(true);
  expect(stops.length).toBeGreaterThan(0);
  for (const s of stops) {
    expect(s.id).toBeTruthy();
    expect(s.city).toBeTruthy();
    expect(s.arrive).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s.depart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s.arrive <= s.depart).toBe(true);
  }
};

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-01-30", 4)).toBe("2026-02-03");
    expect(addDays("2026-12-30", 4)).toBe("2027-01-03");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29"); // leap year
    expect(addDays("2026-07-04", 0)).toBe("2026-07-04");
  });

  it("is DST-proof in any host timezone (UTC-noon anchoring)", () => {
    const prev = process.env.TZ;
    try {
      for (const tz of ["America/New_York", "Europe/Berlin", "Pacific/Kiritimati"]) {
        process.env.TZ = tz;
        expect(addDays("2026-03-07", 1)).toBe("2026-03-08"); // US spring-forward day
        expect(addDays("2026-03-28", 1)).toBe("2026-03-29"); // EU spring-forward day
        expect(addDays("2026-10-31", 1)).toBe("2026-11-01"); // EU fall-back day
      }
    } finally {
      if (prev === undefined) delete process.env.TZ;
      else process.env.TZ = prev;
    }
  });
});

describe("fmtDate", () => {
  it('formats "2026-07-04" as "Jul 4"', () => {
    expect(fmtDate("2026-07-04")).toBe("Jul 4");
    expect(fmtDate("2026-12-31")).toBe("Dec 31");
  });
});

describe("newId", () => {
  it("returns distinct ids across calls", () => {
    const ids = [newId(), newId(), newId()];
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(id).toMatch(/^s[0-9a-z]+$/);
  });
});

describe("loadItinerary", () => {
  it("returns the default itinerary when storage is empty", () => {
    expectDefaultShape(loadItinerary());
  });

  it("returns the default itinerary for corrupt JSON", () => {
    localStorage.setItem(LS_KEY, "{not json!");
    expectDefaultShape(loadItinerary());
  });

  it("returns the default itinerary for an empty array", () => {
    localStorage.setItem(LS_KEY, "[]");
    expectDefaultShape(loadItinerary());
  });

  it("rejects stops missing required fields", () => {
    localStorage.setItem(LS_KEY, JSON.stringify([{ city: "Berlin" }])); // no id (or dates)
    const out = loadItinerary();
    expectDefaultShape(out);
    expect(out).not.toContainEqual({ city: "Berlin" });
  });

  it("returns valid stored stops as-is", () => {
    localStorage.setItem(LS_KEY, JSON.stringify(STOPS));
    expect(loadItinerary()).toEqual(STOPS);
  });
});

describe("saveItinerary", () => {
  it("round-trips through loadItinerary", () => {
    saveItinerary(STOPS);
    expect(loadItinerary()).toEqual(STOPS);
  });
});
