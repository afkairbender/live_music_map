import { useCallback, useEffect, useMemo, useState } from "react";
import GlobeView from "./components/GlobeView.jsx";
import ItineraryPanel from "./components/ItineraryPanel.jsx";
import CityPanel from "./components/CityPanel.jsx";
import SavedPanel from "./components/SavedPanel.jsx";
import TopBar from "./components/TopBar.jsx";
import KeysModal from "./components/KeysModal.jsx";
import * as spotify from "./lib/spotify.js";
import { SAMPLE_ARTISTS } from "./lib/concerts.js";
import { distanceKm } from "./lib/geo.js";
import { loadItinerary, saveItinerary, newId } from "./lib/itinerary.js";
import { loadSavedEvents, saveSavedEvents, toggleSavedEvent } from "./lib/saved.js";
import * as sound from "./lib/sound.js";

export default function App() {
  const [stops, setStops] = useState(loadItinerary);
  const [selectedId, setSelectedId] = useState(null);
  const [saved, setSaved] = useState(loadSavedEvents);
  const [savedOpen, setSavedOpen] = useState(false);
  const [sp, setSp] = useState({
    phase: spotify.isConnected() ? "loading" : "idle",
    profile: null,
    artists: [],
  });
  const [keysOpen, setKeysOpen] = useState(false);
  const [needSpotify, setNeedSpotify] = useState(false);
  const [muted, setMuted] = useState(sound.isMuted());

  useEffect(() => saveItinerary(stops), [stops]);
  useEffect(() => saveSavedEvents(saved), [saved]);

  // Bouncing back to "Connect Spotify" after a failed round-trip looked like
  // nothing happened — keep the failure in state so TopBar can own up to it.
  const spotifyFailed = useCallback((e) => {
    console.error("spotify:", e);
    setSp({
      phase: "error",
      profile: null,
      artists: [],
      message: "Spotify hiccuped — try again",
      detail: e?.message || String(e),
    });
  }, []);

  // finish a PKCE redirect (if any), then load profile + top artists
  useEffect(() => {
    (async () => {
      try {
        const justConnected = await spotify.completeLoginFromUrl();
        if (!justConnected && !spotify.isConnected()) return;
        setSp((s) => ({ ...s, phase: "loading" }));
        const [profile, artists] = await Promise.all([
          spotify.fetchMe(),
          spotify.fetchTopArtists(),
        ]);
        setSp({ phase: "connected", profile, artists });
        if (justConnected) sound.chime();
      } catch (e) {
        spotifyFailed(e);
      }
    })();
  }, [spotifyFailed]);

  const connect = () => {
    if (!spotify.getClientId()) {
      setNeedSpotify(true);
      setKeysOpen(true);
      return;
    }
    // a retry from the error button drops the stale error before redirecting
    setSp({ phase: "loading", profile: null, artists: [] });
    spotify.beginLogin().catch(spotifyFailed);
  };

  const disconnect = () => {
    spotify.disconnect();
    setSp({ phase: "idle", profile: null, artists: [] });
  };

  const closeKeys = useCallback(
    (savedClientId) => {
      setKeysOpen(false);
      if (needSpotify && savedClientId) spotify.beginLogin().catch(spotifyFailed);
      setNeedSpotify(false);
    },
    [needSpotify, spotifyFailed]
  );

  // Escape peels only the topmost layer: the keys modal (a cancel, same as a
  // backdrop click) sits above the saved/city panels, which share the
  // right-hand slot. The search dropdown is layered in between, but it lives
  // in ItineraryPanel state — it swallows its own Escape via stopPropagation
  // before this window-level listener sees it.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (keysOpen) closeKeys(null);
      else if (savedOpen) setSavedOpen(false);
      else setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keysOpen, savedOpen, closeKeys]);

  // the saved panel and the city panel occupy the same right-hand slot, so
  // opening either one closes the other
  const selectStop = useCallback((id) => {
    if (id != null) setSavedOpen(false);
    setSelectedId(id);
  }, []);

  const toggleSavedPanel = () => {
    if (!savedOpen) setSelectedId(null);
    setSavedOpen(!savedOpen);
  };

  const toggleSave = useCallback((ev, stop) => {
    setSaved((prev) => toggleSavedEvent(prev, ev, stop));
  }, []);

  const unsave = useCallback((id) => {
    setSaved((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const addStop = useCallback((stop) => {
    const s = { ...stop, id: newId() };
    setStops((prev) => [...prev, s]);
    setSavedOpen(false);
    setSelectedId(s.id);
  }, []);

  const removeStop = useCallback((id) => {
    setStops((prev) => prev.filter((s) => s.id !== id));
    setSelectedId((sel) => (sel === id ? null : sel));
  }, []);

  const updateStop = useCallback((id, patch) => {
    setStops((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  // dir is ±1; arcs, numbering and the km counter all derive from stops order,
  // so a swap is the whole job
  const moveStop = useCallback((id, dir) => {
    setStops((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  const selectedIdx = stops.findIndex((s) => s.id === selectedId);
  const selected = selectedIdx >= 0 ? stops[selectedIdx] : null;

  const km = useMemo(
    () =>
      Math.round(
        stops.slice(1).reduce((sum, s, i) => sum + distanceKm(stops[i], s), 0)
      ),
    [stops]
  );

  const artists = sp.phase === "connected" ? sp.artists : SAMPLE_ARTISTS;

  const savedIds = useMemo(() => new Set(saved.map((e) => e.id)), [saved]);

  return (
    <div className="app">
      <GlobeView
        stops={stops}
        selectedId={selectedId}
        onSelect={selectStop}
        onBackgroundClick={() => setSelectedId(null)}
      />

      <TopBar
        spotify={sp}
        onConnect={connect}
        onDisconnect={disconnect}
        onKeys={() => setKeysOpen(true)}
        muted={muted}
        onToggleMute={() => setMuted(sound.toggleMute())}
        savedCount={saved.length}
        savedOpen={savedOpen}
        onToggleSaved={toggleSavedPanel}
      />

      <ItineraryPanel
        stops={stops}
        selectedId={selectedId}
        onSelect={selectStop}
        onRemove={removeStop}
        onAdd={addStop}
        onUpdate={updateStop}
        onMove={moveStop}
      />

      {selected && (
        <CityPanel
          key={selected.id}
          stop={selected}
          index={selectedIdx}
          artists={artists}
          usingSampleTaste={sp.phase !== "connected"}
          savedIds={savedIds}
          onToggleSave={toggleSave}
          onClose={() => setSelectedId(null)}
        />
      )}

      {savedOpen && (
        <SavedPanel events={saved} onRemove={unsave} onClose={() => setSavedOpen(false)} />
      )}

      <p className="hint">Drag to spin · scroll to zoom · click a stop for shows</p>
      <p className="stats">
        {stops.length} {stops.length === 1 ? "stop" : "stops"} ·{" "}
        {Math.max(stops.length - 1, 0)} {stops.length === 2 ? "flight" : "flights"} ·{" "}
        {km.toLocaleString("en-US")} km ✨
      </p>

      {keysOpen && <KeysModal onClose={closeKeys} needSpotify={needSpotify} />}
    </div>
  );
}
