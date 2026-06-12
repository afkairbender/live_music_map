import { describe, expect, it } from "vitest";
import {
  eventSnapshot,
  loadSavedEvents,
  saveSavedEvents,
  toggleSavedEvent,
} from "./saved.js";

const LS_KEY = "lmm.saved.v1";

const STOP = {
  id: "s1",
  city: "Berlin",
  country: "DE",
  lat: 52.52,
  lng: 13.41,
  arrive: "2026-07-01",
  depart: "2026-07-05",
};

// a feed event as fetchConcerts produces it, including fields the snapshot
// deliberately drops (attractions, genres)
const EV = {
  id: "ra-101",
  source: "ra",
  name: "Four Tet all night",
  date: "2026-07-02",
  time: "23:00",
  venue: "Panorama Bar",
  url: "https://ra.co/events/101",
  attractions: ["Four Tet"],
  genres: ["Electronic"],
  matches: ["Four Tet"],
};

describe("eventSnapshot", () => {
  it("keeps only what the saved list renders, stamped with the stop's city", () => {
    expect(eventSnapshot(EV, STOP)).toEqual({
      id: "ra-101",
      source: "ra",
      name: "Four Tet all night",
      date: "2026-07-02",
      time: "23:00",
      venue: "Panorama Bar",
      url: "https://ra.co/events/101",
      matches: ["Four Tet"],
      city: "Berlin",
      country: "DE",
    });
  });

  it("normalizes missing optionals", () => {
    expect(
      eventSnapshot({ id: "bit-1", source: "bit", name: "Gig", date: "2026-07-02" }, null)
    ).toEqual({
      id: "bit-1",
      source: "bit",
      name: "Gig",
      date: "2026-07-02",
      time: null,
      venue: null,
      url: null,
      matches: [],
      city: "",
      country: "",
    });
  });
});

describe("toggleSavedEvent", () => {
  it("adds an unsaved event as a snapshot", () => {
    const out = toggleSavedEvent([], EV, STOP);
    expect(out).toEqual([eventSnapshot(EV, STOP)]);
  });

  it("removes an already-saved event by id, keeping the rest", () => {
    const a = eventSnapshot(EV, STOP);
    const b = eventSnapshot({ ...EV, id: "tm-2", name: "Other show" }, STOP);
    expect(toggleSavedEvent([a, b], EV, STOP)).toEqual([b]);
  });

  it("round-trips: toggling twice is a no-op", () => {
    const once = toggleSavedEvent([], EV, STOP);
    expect(toggleSavedEvent(once, EV, STOP)).toEqual([]);
  });

  it("does not mutate the input list", () => {
    const list = [eventSnapshot(EV, STOP)];
    toggleSavedEvent(list, EV, STOP);
    toggleSavedEvent(list, { ...EV, id: "tm-2" }, STOP);
    expect(list).toEqual([eventSnapshot(EV, STOP)]);
  });
});

describe("loadSavedEvents", () => {
  it("returns an empty list when storage is empty", () => {
    expect(loadSavedEvents()).toEqual([]);
  });

  it("returns an empty list for corrupt JSON", () => {
    localStorage.setItem(LS_KEY, "{not json!");
    expect(loadSavedEvents()).toEqual([]);
  });

  it("returns an empty list for a non-array", () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ id: "ra-101" }));
    expect(loadSavedEvents()).toEqual([]);
  });

  it("drops invalid rows individually, keeping the good ones", () => {
    const good = eventSnapshot(EV, STOP);
    localStorage.setItem(
      LS_KEY,
      JSON.stringify([
        good,
        { id: "no-date", name: "x" }, // missing date
        null,
        { id: 7, name: "x", date: "2026-07-02" }, // non-string id
        { ...good, id: "ra-102", matches: "Four Tet" }, // matches must be a list
      ])
    );
    expect(loadSavedEvents()).toEqual([good]);
  });
});

describe("saveSavedEvents", () => {
  it("round-trips through loadSavedEvents", () => {
    const list = [eventSnapshot(EV, STOP), eventSnapshot({ ...EV, id: "tm-2" }, STOP)];
    saveSavedEvents(list);
    expect(loadSavedEvents()).toEqual(list);
  });
});
