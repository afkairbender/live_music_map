import { useEffect, useState } from "react";
import { fetchConcerts } from "../lib/concerts.js";
import { flagEmoji } from "../lib/geo.js";
import { fmtDate } from "../lib/itinerary.js";
import * as sound from "../lib/sound.js";

function EventRow({ ev }) {
  const matched = ev.matches.length > 0;
  const title = matched ? ev.matches.join(" + ") : ev.name;
  return (
    <li className={"event" + (matched ? " matched" : "")}>
      <span className="ev-date">{fmtDate(ev.date)}</span>
      <div className="ev-main">
        <div className="ev-name">{title}</div>
        <div className="ev-venue">
          {[ev.venue, ev.time].filter(Boolean).join(" · ") || "Venue TBA"}
        </div>
        {matched && ev.name !== title && <div className="ev-sub">{ev.name}</div>}
      </div>
      {ev.url && (
        <a
          className="ev-link"
          href={ev.url}
          target="_blank"
          rel="noreferrer"
          onClick={() => sound.tick()}
        >
          Tickets
        </a>
      )}
    </li>
  );
}

export default function CityPanel({ stop, index, artists, usingDemoTaste, onClose }) {
  const [state, setState] = useState({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ phase: "loading" });
    fetchConcerts(stop, artists)
      .then((r) => !cancelled && setState({ phase: "done", ...r }))
      .catch((e) => !cancelled && setState({ phase: "error", error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [stop.id, stop.arrive, stop.depart, artists]);

  const matched = state.events?.filter((e) => e.matches.length) || [];
  const rest = state.events?.filter((e) => !e.matches.length) || [];

  return (
    <aside className="panel city">
      <header className="city-head">
        <div>
          <h2>
            {stop.city} {flagEmoji(stop.country)}
          </h2>
          <p className="city-dates">
            Stop {index + 1} · {fmtDate(stop.arrive)} – {fmtDate(stop.depart)}
          </p>
        </div>
        <button className="close-x" title="Close" onClick={() => { sound.zap(); onClose(); }}>
          ×
        </button>
      </header>

      {state.phase === "loading" && <p className="status">Finding shows for you…</p>}
      {state.phase === "error" && (
        <p className="status err">Hmm, the concert feed hiccuped — {state.error}</p>
      )}

      {state.phase === "done" && (
        <div className="city-body">
          <h3 className="sec">🎉 Your artists are playing</h3>
          {matched.length ? (
            <ul className="events">{matched.map((ev) => <EventRow key={ev.id} ev={ev} />)}</ul>
          ) : (
            <p className="status">None of your artists this time — peek below!</p>
          )}

          {rest.length > 0 && (
            <>
              <h3 className="sec">🎵 Also in town</h3>
              <ul className="events">{rest.map((ev) => <EventRow key={ev.id} ev={ev} />)}</ul>
            </>
          )}

          <footer className="feed-note">
            {usingDemoTaste && <p>Using a sample taste profile — connect Spotify to make it yours.</p>}
            {state.source === "demo" ? (
              <p>These are demo shows — add a free Ticketmaster key (🔑 API keys) for real listings.</p>
            ) : (
              <p>Live listings via Ticketmaster.</p>
            )}
          </footer>
        </div>
      )}
    </aside>
  );
}
