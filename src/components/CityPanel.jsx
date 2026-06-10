import { useEffect, useState } from "react";
import { fetchConcerts } from "../lib/concerts.js";
import { fmtDate } from "../lib/itinerary.js";
import * as sound from "../lib/sound.js";

function EventRow({ ev }) {
  const matched = ev.matches.length > 0;
  const title = matched ? ev.matches.join(" + ") : ev.name;
  return (
    <li className={"event" + (matched ? " matched" : "")}>
      <div className="ev-line1">
        <span className="ev-date">{fmtDate(ev.date)}</span>
        <span className="ev-name">{title.toUpperCase()}</span>
      </div>
      <div className="ev-line2">
        <span className="ev-venue">
          {[ev.venue, ev.time].filter(Boolean).join(" · ") || "VENUE TBA"}
        </span>
        {ev.url && (
          <a href={ev.url} target="_blank" rel="noreferrer" onClick={() => sound.tick()}>
            TICKETS ↗
          </a>
        )}
      </div>
      {matched && ev.name.toUpperCase() !== title.toUpperCase() && (
        <div className="ev-sub">{ev.name.toUpperCase()}</div>
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
            <span className="dim">{String(index + 1).padStart(2, "0")} /</span>{" "}
            {stop.city.toUpperCase()}
          </h2>
          <p className="city-dates">
            {fmtDate(stop.arrive)} — {fmtDate(stop.depart)}
            {stop.country && <span className="cc">{stop.country}</span>}
          </p>
        </div>
        <button className="stop-x" onClick={() => { sound.zap(); onClose(); }}>
          ×
        </button>
      </header>

      {state.phase === "loading" && <p className="status blink">SCANNING FREQUENCIES…</p>}
      {state.phase === "error" && <p className="status err">FEED ERROR — {state.error}</p>}

      {state.phase === "done" && (
        <div className="city-body">
          <h3 className="sec acc2">
            ● YOUR ARTISTS <span className="dim">({matched.length})</span>
          </h3>
          {matched.length ? (
            <ul className="events">{matched.map((ev) => <EventRow key={ev.id} ev={ev} />)}</ul>
          ) : (
            <p className="status">NO MATCHES IN THIS WINDOW</p>
          )}

          {rest.length > 0 && (
            <>
              <h3 className="sec">○ ALSO ON</h3>
              <ul className="events">{rest.map((ev) => <EventRow key={ev.id} ev={ev} />)}</ul>
            </>
          )}

          <footer className="feed-note">
            {usingDemoTaste && <p>TASTE: DEMO SET — CONNECT SPOTIFY TO USE YOURS</p>}
            {state.source === "demo" ? (
              <p>FEED: SIMULATED — ADD A TICKETMASTER KEY [API] FOR REAL LISTINGS</p>
            ) : (
              <p>FEED: TICKETMASTER LIVE</p>
            )}
          </footer>
        </div>
      )}
    </aside>
  );
}
