import * as sound from "../lib/sound.js";

export default function TopBar({ spotify, onConnect, onDisconnect, onKeys, muted, onToggleMute }) {
  return (
    <header className="topbar">
      <h1 className="logo">
        <span className="logo-mark">🎶</span> Live Music Map
      </h1>
      <nav className="controls">
        <button
          className="btn round"
          title={muted ? "Unmute" : "Mute"}
          aria-label={muted ? "Unmute sound effects" : "Mute sound effects"}
          aria-pressed={muted}
          onClick={onToggleMute}
        >
          {muted ? "🔇" : "🔊"}
        </button>
        {/* label text collapses to just 🔑 on small screens (CSS hides the
            span), so the accessible name lives in aria-label instead */}
        <button className="btn ghost" aria-label="API keys" onClick={() => { sound.tick(); onKeys(); }}>
          🔑<span className="keys-label"> API keys</span>
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
        ) : spotify.phase === "error" ? (
          <button
            className="btn spotify err"
            title={spotify.detail || "Something went sideways"}
            onClick={() => { sound.blip(); onConnect(); }}
          >
            {spotify.message || "Spotify hiccuped — try again"}
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
