import { useEffect, useRef, useState } from "react";
import { searchCities, flagEmoji } from "../lib/geo.js";
import { addDays, fmtDate, todayIso } from "../lib/itinerary.js";
import * as sound from "../lib/sound.js";

export default function ItineraryPanel({ stops, selectedId, onSelect, onRemove, onAdd }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [arrive, setArrive] = useState("");
  const [depart, setDepart] = useState("");
  const seq = useRef(0);

  useEffect(() => {
    if (chosen && query === chosen.city) return;
    setChosen(null);
    const q = query;
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const mySeq = ++seq.current;
    const t = setTimeout(async () => {
      const r = await searchCities(q);
      if (seq.current === mySeq) setResults(r);
    }, 220);
    return () => clearTimeout(t);
  }, [query, chosen]);

  const pickCity = (c) => {
    sound.tick();
    setChosen(c);
    setQuery(c.city);
    setResults([]);
    if (!arrive) {
      const start = stops.length ? stops[stops.length - 1].depart : addDays(todayIso(), 21);
      setArrive(start);
      setDepart(addDays(start, 4));
    }
  };

  const valid = chosen && arrive && depart && arrive <= depart;

  const submit = (e) => {
    e.preventDefault();
    if (!valid) return;
    sound.blip();
    onAdd({ ...chosen, arrive, depart });
    setQuery("");
    setChosen(null);
    setArrive("");
    setDepart("");
  };

  return (
    <aside className="panel itinerary">
      <h2 className="panel-title">Your trip ✈️</h2>
      <ol className="stops">
        {stops.map((s, i) => (
          <li key={s.id} className={s.id === selectedId ? "sel" : ""}>
            <button className="stop-row" onClick={() => { sound.blip(); onSelect(s.id); }}>
              <span className="stop-num">{i + 1}</span>
              <span className="stop-city">
                {s.city} {flagEmoji(s.country)}
              </span>
              <span className="stop-dates">
                {fmtDate(s.arrive)} – {fmtDate(s.depart)}
              </span>
            </button>
            <button
              className="stop-x"
              title="Remove stop"
              onClick={() => { sound.zap(); onRemove(s.id); }}
            >
              ×
            </button>
          </li>
        ))}
        {!stops.length && <li className="empty">No stops yet — add your first city below!</li>}
      </ol>

      <form className="add-form" onSubmit={submit}>
        <div className="search-wrap">
          <input
            type="text"
            placeholder="Where to next?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck="false"
          />
          {results.length > 0 && (
            <ul className="search-results">
              {results.map((c) => (
                <li key={c.city + c.country}>
                  <button type="button" onClick={() => pickCity(c)}>
                    {c.city}
                    <span className="cc">
                      {flagEmoji(c.country)} {c.country}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {chosen && (
          <div className="date-row">
            <label>
              Arrive
              <input type="date" value={arrive} max={depart || undefined} onChange={(e) => setArrive(e.target.value)} />
            </label>
            <label>
              Leave
              <input type="date" value={depart} min={arrive || undefined} onChange={(e) => setDepart(e.target.value)} />
            </label>
            <button type="submit" className="btn add-btn" disabled={!valid}>
              Add
            </button>
          </div>
        )}
      </form>
    </aside>
  );
}
