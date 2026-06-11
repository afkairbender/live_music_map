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
  Resident Advisor (clubs & electronic) and Bandsintown (tour dates) work
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

## Concert data — all real, merged from three sources

| Source | What it covers | Key needed |
| --- | --- | --- |
| [Resident Advisor](https://ra.co) | Club nights, festivals, electronic music worldwide | none |
| [Bandsintown](https://bandsintown.com) | Tour dates for *your* top artists, every genre | none |
| [Ticketmaster Discovery](https://developer.ticketmaster.com/) | Arena/stadium & mainstream shows | free key (optional) |

Results are fetched in parallel, deduped (same show on two sources keeps one
entry), and tagged with a small RA / BIT / TM badge. Each stop queries RA by
city area and Bandsintown by your top artists, filtered to venues within
~80 km of the stop during your dates.

Resident Advisor's GraphQL API doesn't send CORS headers, so the app calls
it through a same-origin `/api/ra` route: the Vite dev server proxies it
locally (`vite.config.js`) and Netlify rewrites it in production
(`netlify.toml`). Bandsintown is called directly, with `/api/bit` as a
fallback route. If you host the static build somewhere other than Netlify,
add equivalent rewrites (`/api/ra` → `https://ra.co/graphql`, `/api/bit/*` →
`https://rest.bandsintown.com/*`) — without them RA is skipped and the
other sources still work.

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
| "Where to next?" | Search any city (local list + Open-Meteo geocoder) |
| 🔊 | Toggle the sound effects |
| 🔑 API keys | Set Spotify client ID / Ticketmaster key |

## Stack

[Vite](https://vite.dev) + [React](https://react.dev) +
[react-globe.gl](https://github.com/vasturiano/react-globe.gl) (three.js), and
nothing else. ~1 weekend of code, no CSS framework.
