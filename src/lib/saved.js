// Saved-events persistence — the "I want to go to that" list. Listings come
// from live feeds and can vanish from a source between sessions, so each save
// keeps a self-contained snapshot (plus the stop's city) rather than a
// reference into the feed cache.

const LS_KEY = "lmm.saved.v1";

// Saved rows flow into date formatting and the panel renderer, so the fields
// they rely on get vetted; unlike the itinerary there's no default to fall
// back to, so one bad row is dropped instead of voiding the whole list.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validSaved = (e) =>
  e &&
  typeof e.id === "string" &&
  typeof e.name === "string" &&
  DATE_RE.test(e.date) &&
  (e.matches === undefined || Array.isArray(e.matches));

export function loadSavedEvents() {
  try {
    const events = JSON.parse(localStorage.getItem(LS_KEY));
    if (Array.isArray(events)) return events.filter(validSaved);
  } catch {
    // fall through to empty
  }
  return [];
}

export function saveSavedEvents(events) {
  // Private mode / full storage throws on setItem; losing persistence beats
  // crashing the app from inside a React effect, so swallow it.
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(events));
  } catch {
    // the list just won't survive a reload
  }
}

// Only the fields the saved list renders; matches are frozen at save time —
// the taste profile may change later, the show the user starred doesn't.
export function eventSnapshot(ev, stop) {
  return {
    id: ev.id,
    source: ev.source,
    name: ev.name,
    date: ev.date,
    time: ev.time || null,
    venue: ev.venue || null,
    url: ev.url || null,
    matches: ev.matches || [],
    city: stop?.city || "",
    country: stop?.country || "",
  };
}

// Feed ids are stable per source ("ra-101", "tm-…"), so the heart survives
// reloads and re-fetches, and the same show toggles off from any panel.
export function toggleSavedEvent(events, ev, stop) {
  return events.some((e) => e.id === ev.id)
    ? events.filter((e) => e.id !== ev.id)
    : [...events, eventSnapshot(ev, stop)];
}
