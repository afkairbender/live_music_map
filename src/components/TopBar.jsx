import * as sound from "../lib/sound.js";

export default function TopBar({ spotify, onConnect, onDisconnect, onKeys, muted, onToggleMute }) {
  return (
    <header className="topbar">
      <h1 className="logo">
        LIVE<span className="acc">//</span>MUSIC<span className="acc">//</span>MAP
        <span className="cursor">▮</span>
      </h1>
      <nav className="controls">
        <button className="btn ghost" onClick={onToggleMute}>
          SND:{muted ? "OFF" : "ON"}
        </button>
        <button className="btn ghost" onClick={() => { sound.tick(); onKeys(); }}>
          [API]
        </button>
        {spotify.phase === "connected" ? (
          <button
            className="btn spotify on"
            title="disconnect"
            onClick={() => { sound.zap(); onDisconnect(); }}
          >
            <span className="pulse-dot" />
            {(spotify.profile?.display_name || "LINKED").toUpperCase()} ·{" "}
            {spotify.artists.length} ARTISTS
          </button>
        ) : spotify.phase === "loading" ? (
          <button className="btn spotify" disabled>
            <span className="blink">SYNCING…</span>
          </button>
        ) : (
          <button className="btn spotify" onClick={() => { sound.blip(); onConnect(); }}>
            CONNECT SPOTIFY ▸
          </button>
        )}
      </nav>
    </header>
  );
}
