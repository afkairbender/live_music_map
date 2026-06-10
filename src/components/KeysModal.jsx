import { useState } from "react";
import * as spotify from "../lib/spotify.js";
import { getTmKey, setTmKey } from "../lib/concerts.js";
import * as sound from "../lib/sound.js";

export default function KeysModal({ onClose, needSpotify }) {
  const [clientId, setClientIdInput] = useState(spotify.getClientId());
  const [tmKey, setTmKeyInput] = useState(getTmKey());
  const [copied, setCopied] = useState(false);
  const uri = spotify.redirectUri();

  const save = () => {
    spotify.setClientId(clientId);
    setTmKey(tmKey);
    sound.chime();
    onClose(clientId.trim());
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(uri);
      setCopied(true);
      sound.tick();
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — the uri is selectable
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => onClose(null)}>
      <div className="modal panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="panel-title">🔑 API keys</h2>
        {needSpotify && (
          <p className="status need">You'll need a Spotify client ID to connect — it takes about a minute.</p>
        )}

        <label className="field">
          Spotify client ID
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientIdInput(e.target.value)}
            placeholder="from developer.spotify.com/dashboard"
            spellCheck="false"
          />
        </label>
        <p className="hint-text">
          Create an app at developer.spotify.com/dashboard and register this
          exact redirect URI:
        </p>
        <button type="button" className="uri" onClick={copy} title="Copy">
          {uri} {copied ? "✓ copied!" : "⧉"}
        </button>

        <label className="field">
          Ticketmaster API key <span className="dim">(optional)</span>
          <input
            type="text"
            value={tmKey}
            onChange={(e) => setTmKeyInput(e.target.value)}
            placeholder="blank = demo concert feed"
            spellCheck="false"
          />
        </label>
        <p className="hint-text">
          Free at developer.ticketmaster.com — unlocks real listings. Keys
          never leave your browser.
        </p>

        <div className="modal-actions">
          <button className="btn ghost" onClick={() => onClose(null)}>
            Cancel
          </button>
          <button className="btn" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
