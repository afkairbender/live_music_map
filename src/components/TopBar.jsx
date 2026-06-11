import * as sound from "../lib/sound.js";

export default function TopBar({ spotify, onConnect, onDisconnect, onKeys, muted, onToggleMute }) {
  return (
    <header className="topbar">
      <h1 className="logo">
        <span className="logo-mark">🎶</span> Live Music Map
      </h1>
      <nav className="controls">
        <button className="btn round" title={muted ? "Unmute" : "Mute"} onClick={onToggleMute}>
          {muted ? "🔇" : "🔊"}
        </button>
        <button className="btn ghost" onClick={() => { sound.tick(); onKeys(); }}>
          🔑 API keys
        </button>
        {spotify.phase === "connected" ? (
          <button
            className="btn spotify on"
            title="Click to disconnect"
            onClick={() => { sound.zap(); onDisconnect(); }}
          >
            <span className="pulse-dot" />
            {spotify.profile?.display_name || "Connected"} · {spotify.artists.length} artists
          </button>
        ) : spotify.phase === "loading" ? (
          <button className="btn spotify" disabled>
            Connecting…
          </button>
        ) : (
          <button className="btn spotify" onClick={() => { sound.blip(); onConnect(); }}>
            Connect Spotify
          </button>
        )}
      </nav>
    </header>
  );
}
