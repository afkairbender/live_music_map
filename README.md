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
- **Concerts per stop** — click Barcelona and see what's on during your dates,
  your artists first
- **Zero-setup demo mode** — without API keys you get a demo concert feed and
  a sample taste profile, so everything works out of the box
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

## Real concert data (optional)

Grab a free [Ticketmaster Discovery API](https://developer.ticketmaster.com/)
key and paste it into the **🔑 API keys** modal (or set `VITE_TM_API_KEY`).
Without it you get a clearly-labelled demo feed seeded from your artists.

> Coverage note: Ticketmaster is strongest in North America, UK/Europe,
> Australia. Club shows in some cities won't appear.

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
