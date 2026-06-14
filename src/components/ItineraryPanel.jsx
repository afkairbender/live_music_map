import { useEffect, useRef, useState } from "react";
import { searchCities, flagEmoji } from "../lib/geo.js";
import { addDays, fmtDate, todayIso } from "../lib/itinerary.js";
import * as sound from "../lib/sound.js";

export default function ItineraryPanel({
  stops,
  selectedId,
  onSelect,
  onRemove,
  onAdd,
  onUpdate,
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [chosen, setChosen] = useState(null);
  const [arrive, setArrive] = useState("");
  const [depart, setDepart] = useState("");
  // draft for the inline date editor — kept apart from the stop itself so
  // cancel really cancels and half-typed dates never hit localStorage
  const [editing, setEditing] = useState(null);
  const seq = useRef(0);

  useEffect(() => {
    if (chosen && query === chosen.city) return;
    setChosen(null);
    const q = query;
    if (q.trim().length < 2) {
      setResults([]);
      setActiveIdx(-1);
      return;
    }
    const mySeq = ++seq.current;
    const t = setTimeout(async () => {
      const r = await searchCities(q);
      if (seq.current === mySeq) {
        setResults(r);
        setActiveIdx(-1);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [query, chosen]);

  // the dropdown scrolls past 6 items' worth of height — keep the keyboard
  // highlight in view
  useEffect(() => {
    if (activeIdx >= 0)
      document.getElementById(`city-opt-${activeIdx}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const pickCity = (c) => {
    sound.tick();
    setChosen(c);
    setQuery(c.city);
    setResults([]);
    setActiveIdx(-1);
    if (!arrive) {
      const start = stops.length ? stops[stops.length - 1].depart : addDays(todayIso(), 21);
      setArrive(start);
      setDepart(addDays(start, 4));
    }
  };

  const onSearchKey = (e) => {
    if (!results.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      sound.tick();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      setActiveIdx((i) =>
        i < 0 ? (dir > 0 ? 0 : results.length - 1) : (i + dir + results.length) % results.length
      );
    } else if (e.key === "Enter") {
      // dropdown open: Enter chooses (or does nothing) — never submits the form
      e.preventDefault();
      if (activeIdx >= 0) pickCity(results[activeIdx]);
    } else if (e.key === "Escape") {
      // App's Escape handler sits on window in the bubble phase, so stopping
      // here means Escape dismisses only the dropdown, not the city panel
      e.stopPropagation();
      setResults([]);
      setActiveIdx(-1);
    }
  };

  const valid = chosen && arrive && depart && arrive <= depart;
  const editValid = editing && editing.arrive && editing.depart && editing.arrive <= editing.depart;

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

  const beginEdit = (s) => {
    sound.tick();
    setEditing({ id: s.id, arrive: s.arrive, depart: s.depart });
  };

  const saveEdit = () => {
    if (!editValid) return;
    sound.blip();
    onUpdate(editing.id, { arrive: editing.arrive, depart: editing.depart });
    setEditing(null);
  };

  const cancelEdit = () => {
    sound.zap();
    setEditing(null);
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
            <span className="stop-tools">
              <button
                className="stop-edit"
                aria-label={`Edit dates for ${s.city}`}
                aria-expanded={editing?.id === s.id}
                title="Edit dates"
                onClick={() => (editing?.id === s.id ? cancelEdit() : beginEdit(s))}
              >
                ✎
              </button>
              <button
                className="stop-x"
                aria-label={`Remove ${s.city}`}
                title="Remove stop"
                onClick={() => { sound.zap(); onRemove(s.id); }}
              >
                ×
              </button>
            </span>
            {editing?.id === s.id && (
              <div className="date-row stop-edit-row">
                <label>
                  Arrive
                  <input
                    type="date"
                    autoFocus
                    value={editing.arrive}
                    max={editing.depart || undefined}
                    onChange={(e) => setEditing((d) => ({ ...d, arrive: e.target.value }))}
                  />
                </label>
                <label>
                  Leave
                  <input
                    type="date"
                    value={editing.depart}
                    min={editing.arrive || undefined}
                    onChange={(e) => setEditing((d) => ({ ...d, depart: e.target.value }))}
                  />
                </label>
                <button
                  type="button"
                  className="btn save-btn"
                  aria-label={`Save dates for ${s.city}`}
                  title="Save"
                  disabled={!editValid}
                  onClick={saveEdit}
                >
                  ✓
                </button>
                <button
                  type="button"
                  className="btn ghost save-btn"
                  aria-label="Cancel date edit"
                  title="Cancel"
                  onClick={cancelEdit}
                >
                  ×
                </button>
              </div>
            )}
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
            onKeyDown={onSearchKey}
            spellCheck="false"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="city-results"
            aria-autocomplete="list"
            aria-activedescendant={activeIdx >= 0 ? `city-opt-${activeIdx}` : undefined}
          />
          {results.length > 0 && (
            <ul className="search-results" id="city-results" role="listbox">
              {results.map((c, i) => (
                <li key={c.city + c.country} role="presentation">
                  <button
                    type="button"
                    role="option"
                    id={`city-opt-${i}`}
                    aria-selected={i === activeIdx}
                    className={i === activeIdx ? "active" : ""}
                    tabIndex={-1}
                    onClick={() => pickCity(c)}
                  >
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
