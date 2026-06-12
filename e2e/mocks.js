// Fixtures + network mocks for the e2e journey. page.route intercepts inside
// the browser, before a request leaves it — so the /api/* stubs win over
// Vite's dev proxy and no test traffic ever reaches the internet. The app's
// real PKCE login code still runs; only Spotify's servers are faked.

export const SEED_STOP = {
  id: "seed-lisbon",
  city: "Lisbon",
  country: "PT",
  lat: 38.72,
  lng: -9.14,
  arrive: "2026-07-05",
  depart: "2026-07-10",
};

export const BERLIN_DATES = { arrive: "2026-07-10", depart: "2026-07-14" };

export const PROFILE = { id: "e2e-user", display_name: "Cameron Tester" };

export const TOP_ARTIST_NAMES = ["The Midnight Echoes", "Neon Harbor", "Glass Citadel"];
export const TOP_ARTISTS_RESPONSE = {
  items: TOP_ARTIST_NAMES.map((name, i) => ({
    id: `art${i}`,
    name,
    images: [{ url: `https://i.scdn.co/big${i}` }, { url: `https://i.scdn.co/small${i}` }],
  })),
};

// Resident Advisor — matched event ("The Midnight Echoes" in artists[])
export const RA_RESPONSE = {
  data: {
    eventListings: {
      totalResults: 1,
      data: [
        {
          id: "L1",
          listingDate: "2026-07-11T00:00:00.000Z",
          event: {
            id: "900001",
            title: "Warehouse Rites",
            date: "2026-07-11T00:00:00.000Z",
            startTime: "2026-07-11T23:00:00.000",
            contentUrl: "/events/900001",
            venue: { name: "Berghain" },
            artists: [{ name: "The Midnight Echoes" }, { name: "DJ Filler" }],
            genres: [{ name: "techno" }],
          },
        },
      ],
    },
  },
};

// DICE — unmatched event; venue ~3 km from Berlin (must be < 80 km) and the
// date inside the stay window
export const DICE_RESPONSE = {
  sections: [
    {
      items: [
        {
          type: "event",
          event: {
            id: "abc123",
            name: "Kiezsalon: Modular Dreams",
            status: "live",
            dates: { event_start_date: "2026-07-12T20:00:00Z" },
            venues: [{ name: "Astra Kulturhaus", location: { lat: 52.51, lng: 13.45 } }],
            summary_lineup: { artists: [{ name: "Modular Dreams Ensemble" }] },
          },
        },
      ],
    },
  ],
  next_page_cursor: null,
};

// Eventim — unmatched event; the genre tag comes from a category whose
// parent is "Konzerte"
export const EVM_RESPONSE = {
  products: [
    {
      productId: "evm-777",
      name: "Synthwave Sommernacht",
      link: "https://www.eventim.de/event/synthwave-777",
      typeAttributes: {
        liveEntertainment: {
          startDate: "2026-07-13T19:30:00+02:00",
          location: { name: "Columbiahalle" },
        },
      },
      attractions: [{ name: "Synthwave Orchester" }],
      categories: [{ name: "Rock & Pop", parentCategory: { name: "Konzerte" } }],
    },
  ],
};

// Bandsintown — only "Neon Harbor" tours; matched via lineup
export const BIT_EVENTS = [
  {
    id: "777001",
    title: "Neon Harbor: Berlin",
    datetime: "2026-07-12T21:00:00",
    venue: { name: "Huxleys Neue Welt", city: "Berlin", latitude: "52.49", longitude: "13.44" },
    lineup: ["Neon Harbor"],
    offers: [{ url: "https://www.bandsintown.com/t/777001" }],
    url: "https://www.bandsintown.com/e/777001",
  },
];

export async function installMocks(page, baseURL) {
  const captured = { authorizeUrl: null, tokenBodies: [] };

  const json = (route, body) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      // cross-origin fetches (Spotify API sends Authorization) go through
      // CORS checks even when fulfilled — always allow
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(body),
    });
  const preflight = (route) =>
    route.fulfill({
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "authorization, content-type",
      },
    });
  const corsJson = (route, body) =>
    route.request().method() === "OPTIONS" ? preflight(route) : json(route, body);

  // -- Spotify OAuth: the app's real PKCE code runs, only the network is fake --
  await page.route("https://accounts.spotify.com/authorize**", (route) => {
    captured.authorizeUrl = route.request().url();
    // top-level navigation: a bodyless 302 back to the app, as Spotify would
    route.fulfill({ status: 302, headers: { location: baseURL + "/?code=e2e-auth-code" } });
  });
  await page.route("https://accounts.spotify.com/api/token", (route) => {
    if (route.request().method() === "OPTIONS") return preflight(route);
    captured.tokenBodies.push(route.request().postData() || "");
    return json(route, {
      access_token: "e2e-access-token",
      token_type: "Bearer",
      scope: "user-top-read",
      expires_in: 3600,
      refresh_token: "e2e-refresh-token",
    });
  });
  await page.route("https://api.spotify.com/v1/me", (r) => corsJson(r, PROFILE));
  await page.route("https://api.spotify.com/v1/me/top/artists**", (r) =>
    corsJson(r, TOP_ARTISTS_RESPONSE)
  );

  // -- city search: silence the remote geocoder so the dropdown is local-only --
  await page.route("https://geocoding-api.open-meteo.com/**", (r) => json(r, { results: [] }));

  // -- concert sources --
  await page.route("**/api/ra", (route) => {
    const body = route.request().postData() || "";
    // Berlin is in RA_AREA_SEED so only eventListings queries arrive; the
    // areas branch keeps the stub honest if the test city ever changes
    return json(route, body.includes("eventListings") ? RA_RESPONSE : { data: { areas: [] } });
  });
  await page.route("**/api/dice", (r) => json(r, DICE_RESPONSE));
  await page.route("https://public-api.eventim.com/**", (r) => corsJson(r, EVM_RESPONSE));
  await page.route("https://rest.bandsintown.com/**", (route) => {
    if (route.request().method() === "OPTIONS") return preflight(route);
    const artist = decodeURIComponent(new URL(route.request().url()).pathname.split("/")[2] || "");
    // must answer with a json content-type — the app treats non-JSON as "blocked"
    return json(route, artist === "Neon Harbor" ? BIT_EVENTS : []);
  });

  // defensive: never reachable for Berlin, but no test should hit the internet
  await page.route("**/api/goout**", (r) => json(r, { schedules: [], included: {}, meta: {} }));
  await page.route("**/api/bit/**", (r) => json(r, []));
  await page.route("https://app.ticketmaster.com/**", (r) =>
    json(r, { _embedded: { events: [] }, page: { totalPages: 1 } })
  );

  return captured;
}
