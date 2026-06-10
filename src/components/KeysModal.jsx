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
        <h2 className="panel-title">API KEYS</h2>
        {needSpotify && (
          <p className="status acc2">A SPOTIFY CLIENT ID IS NEEDED TO CONNECT</p>
        )}

        <label className="field">
          SPOTIFY CLIENT ID
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientIdInput(e.target.value)}
            placeholder="from developer.spotify.com/dashboard"
            spellCheck="false"
          />
        </label>
        <p className="hint-text">
          CREATE AN APP AT DEVELOPER.SPOTIFY.COM/DASHBOARD AND REGISTER THIS
          EXACT REDIRECT URI:
        </p>
        <button type="button" className="uri" onClick={copy} title="copy">
          {uri} {copied ? "✓ COPIED" : "⧉"}
        </button>

        <label className="field">
          TICKETMASTER API KEY <span className="dim">(OPTIONAL)</span>
          <input
            type="text"
            value={tmKey}
            onChange={(e) => setTmKeyInput(e.target.value)}
            placeholder="blank = simulated concert feed"
            spellCheck="false"
          />
        </label>
        <p className="hint-text">
          FREE AT DEVELOPER.TICKETMASTER.COM — UNLOCKS REAL LISTINGS. KEYS LIVE
          IN YOUR BROWSER'S LOCALSTORAGE ONLY.
        </p>

        <div className="modal-actions">
          <button className="btn ghost" onClick={() => onClose(null)}>
            CANCEL
          </button>
          <button className="btn" onClick={save}>
            SAVE
          </button>
        </div>
      </div>
    </div>
  );
}
