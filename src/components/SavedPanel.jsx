import { flagEmoji } from "../lib/geo.js";
import { fmtDate, todayIso } from "../lib/itinerary.js";
import * as sound from "../lib/sound.js";

const byDate = (a, b) =>
  a.date.localeCompare(b.date) || (a.time || "~").localeCompare(b.time || "~");

function SavedRow({ ev, onRemove }) {
  const matched = ev.matches?.length > 0;
  const title = matched ? ev.matches.join(" + ") : ev.name;
  return (
    <li className={"event" + (matched ? " matched" : "")}>
      <span className="ev-date">{fmtDate(ev.date)}</span>
      <div className="ev-main">
        <div className="ev-name">{title}</div>
        <div className="ev-venue">
          {[ev.venue, ev.time].filter(Boolean).join(" · ") || "Venue TBA"}
        </div>
        {(ev.city || ev.country) && (
          <div className="ev-sub">
            {ev.city} {flagEmoji(ev.country)}
          </div>
        )}
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
      <button
        className="ev-save on"
        aria-label={`Remove ${title} from saved shows`}
        title="Remove from saved"
        onClick={() => { sound.zap(); onRemove(ev.id); }}
      >
        ♥
      </button>
    </li>
  );
}

export default function SavedPanel({ events, onRemove, onClose }) {
  // shares the city panel's right-hand slot (App keeps them mutually
  // exclusive), so it reuses the .city layout classes wholesale
  const today = todayIso();
  const sorted = [...events].sort(byDate);
  const upcoming = sorted.filter((e) => e.date >= today);
  const past = sorted.filter((e) => e.date < today);

  return (
    <aside className="panel city saved">
      <header className="city-head">
        <div>
          <h2>Saved shows 💖</h2>
          <p className="city-dates">
            {events.length
              ? `${events.length} ${events.length === 1 ? "show" : "shows"} on your list`
              : "Your concert wishlist"}
          </p>
        </div>
        <button
          className="close-x"
          title="Close"
          aria-label="Close"
          onClick={() => { sound.zap(); onClose(); }}
        >
          ×
        </button>
      </header>

      <div className="city-body">
        {events.length === 0 ? (
          <p className="status">
            Nothing saved yet — tap the ♡ next to any show to keep it here.
          </p>
        ) : (
          <>
            {upcoming.length > 0 && (
              <>
                <h3 className="sec">🎟️ Coming up</h3>
                <ul className="events">
                  {upcoming.map((ev) => (
                    <SavedRow key={ev.id} ev={ev} onRemove={onRemove} />
                  ))}
                </ul>
              </>
            )}
            {past.length > 0 && (
              <>
                <h3 className="sec">🕰️ Already happened</h3>
                <ul className="events">
                  {past.map((ev) => (
                    <SavedRow key={ev.id} ev={ev} onRemove={onRemove} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
