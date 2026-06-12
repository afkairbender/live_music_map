# Live Music Map 🎶

A light, whimsical 3D globe for your next trip — think Airbnb, but for
concerts. Drop your stops on the map, link Spotify, and see which of your
artists are playing each city while you're there, with stitched coral flight
arcs connecting the route.

- **3D interactive globe** — candy-pastel storybook continents, auto-spin,
  click a stop to fly to it
- **Itinerary** — add cities with arrive/leave dates, flight lines connect
  them in order
- **Spotify** — one click, no account system; uses the PKCE flow entirely in
  your browser to read your top artists (`user-top-read` only)
- **Concerts per stop** — click Barcelona and see what's actually on during
  your dates, your artists first
- **Real listings, zero keys** — every show comes from a live source:
  Resident Advisor, the Eventim network, DICE, GoOut and Bandsintown all work
  with no setup, Ticketmaster adds arena coverage with a free key. There is
  no fake/demo feed — if nothing's listed, you see nothing.
- **Fun bits** — soft marimba pops on interaction (toggle with 🔊), pulsing
  rings, country flags, km counter

Everything is client-side. No backend, no database, no login. Keys and your
itinerary live in `localStorage`.

## Run it

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173 (use `127.0.0.1`, not `localhost` — Spotify only
allows loopback-IP redirect URIs for new apps).

## Hook up Spotify (optional but the point)

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
   and create an app (takes ~1 minute, any name).
2. Add the redirect URI shown in the app's **🔑 API keys** modal — e.g.
   `http://127.0.0.1:5173/` for local dev, or your deployed URL. It must match
   exactly.
3. Copy the **Client ID** into the **🔑 API keys** modal (or set
   `VITE_SPOTIFY_CLIENT_ID` in a `.env` file) and hit **Connect Spotify**.

## Concert data — all real, merged from six sources

| Source | What it covers | Key needed |
| --- | --- | --- |
| [Resident Advisor](https://ra.co) | Club nights, festivals, electronic music worldwide | none |
| [Eventim network](https://www.eventim.de) | Europe's biggest ticketer group — eventim.de, oeticket.at, ticketcorner.ch, eventim.fr, entradas.com, ticketone.it, billetlugen.dk, eventim.co.uk | none |
| [DICE](https://dice.fm) | Club & gig coverage | none |
| [GoOut](https://goout.net) | Czech/Slovak scene | none |
| [Bandsintown](https://bandsintown.com) | Tour dates for *your* top artists, every genre | none |
| [Ticketmaster Discovery](https://developer.ticketmaster.com/) | Arena/stadium & mainstream shows | free key (optional) |

Results are fetched in parallel, deduped (same show on two sources keeps one
entry), and tagged with a small RA / EVM / DICE / GO / BIT / TM badge. Each
stop queries the city sources by area/coordinates and Bandsintown by your top
artists, filtered to venues within ~80 km of the stop during your dates.

Several sources can't be called cross-origin from the browser (RA and GoOut
send no CORS headers, DICE allowlists its own origins), so the app calls them
through same-origin routes: `/api/ra`, `/api/dice`, `/api/goout`, plus
`/api/bit` as a fallback when a direct Bandsintown call is blocked. The Vite
dev server proxies them locally (`vite.config.js`) and Netlify rewrites them
in production (`netlify.toml`). If you host the static build somewhere other
than Netlify, add equivalent rewrites:

- `/api/ra` → `https://ra.co/graphql`
- `/api/dice` → `https://api.dice.fm/unified_search`
- `/api/goout` → `https://goout.net/services/entities/v1/schedules`
- `/api/bit/*` → `https://rest.bandsintown.com/:splat`

Without them those sources are skipped and the rest still work. Eventim has
no proxy route and needs none — it works everywhere because the app calls it
browser-direct, and it must be: Akamai rejects non-browser TLS fingerprints,
so proxying it gets a 403.

To add Ticketmaster, paste a free Discovery API key into the **🔑 API keys**
modal (or set `VITE_TM_API_KEY`).

## Deploy

It's a static site — `npm run build` and host `dist/` anywhere. A
`netlify.toml` is included. Remember to add your deployed URL as a second
redirect URI in the Spotify dashboard.

## Controls

| Action | Result |
| --- | --- |
| Drag / scroll | Spin / zoom the globe |
| Click a stop (globe or list) | Fly there + show concerts during your stay |
| `ESC` or click empty space | Close the city panel |
| "Where to next?" | Search any city (local list + Open-Meteo geocoder, arrow keys + Enter work) |
| ✎ / ↑ ↓ on a stop | Edit its dates / reorder the trip |
| 🔊 | Toggle the sound effects |
| 🔑 API keys | Set Spotify client ID / Ticketmaster key |

## Stack

[Vite](https://vite.dev) + [React](https://react.dev) +
[react-globe.gl](https://github.com/vasturiano/react-globe.gl) (three.js), and
nothing else. ~1 weekend of code, no CSS framework.
