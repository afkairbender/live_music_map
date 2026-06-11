import { useEffect, useState } from "react";
import { fetchConcerts } from "../lib/concerts.js";
import { flagEmoji } from "../lib/geo.js";
import { fmtDate } from "../lib/itinerary.js";
import * as sound from "../lib/sound.js";

const SRC_BADGE = {
  ra: ["RA", "Resident Advisor"],
  bit: ["BIT", "Bandsintown"],
  tm: ["TM", "Ticketmaster"],
};

function EventRow({ ev }) {
  const matched = ev.matches.length > 0;
  const title = matched ? ev.matches.join(" + ") : ev.name;
  const badge = SRC_BADGE[ev.source];
  return (
    <li className={"event" + (matched ? " matched" : "")}>
      <span className="ev-date">{fmtDate(ev.date)}</span>
      <div className="ev-main">
        <div className="ev-name">{title}</div>
        <div className="ev-venue">
          {[ev.venue, ev.time].filter(Boolean).join(" · ") || "Venue TBA"}
          {badge && (
            <span className="ev-src" title={badge[1]}>
              {badge[0]}
            </span>
          )}
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

export default function CityPanel({ stop, index, artists, usingSampleTaste, onClose }) {
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
  const ok = state.sources?.filter((s) => s.status === "ok") || [];
  const failed = state.sources?.filter((s) => s.status === "error") || [];
  const raSkipped = state.sources?.find((s) => s.id === "ra" && s.status === "skipped");
  const tmSkipped = state.sources?.some((s) => s.id === "tm" && s.status === "skipped");

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
        <p className="status err">Hmm, the concert feeds hiccuped — {state.error}</p>
      )}

      {state.phase === "done" && (
        <div className="city-body">
          {state.events.length === 0 ? (
            <p className="status">
              Nothing listed for these dates yet — venues often announce a few
              weeks out, so check back closer to the trip.
            </p>
          ) : (
            <>
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
            </>
          )}

          <footer className="feed-note">
            {usingSampleTaste && <p>Using a sample taste profile — connect Spotify to make it yours.</p>}
            {ok.length > 0 && <p>Live listings via {ok.map((s) => s.label).join(" + ")}.</p>}
            {raSkipped && raSkipped.detail && <p>{raSkipped.detail} — showing other sources.</p>}
            {failed.map((s) => (
              <p key={s.id}>
                {s.label} didn't respond this time{s.detail ? ` (${s.detail})` : ""}.
              </p>
            ))}
            {tmSkipped && (
              <p>Add a free Ticketmaster key (🔑 API keys) for extra arena &amp; stadium coverage.</p>
            )}
          </footer>
        </div>
      )}
    </aside>
  );
}
