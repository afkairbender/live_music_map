// Spotify auth via Authorization Code + PKCE — runs entirely in the browser,
// no backend and no client secret needed. Only scope requested: user-top-read.

const SCOPES = "user-top-read";
const LS = {
  clientId: "lmm.spotify.clientId",
  token: "lmm.spotify.token",
  verifier: "lmm.spotify.verifier",
};

export function getClientId() {
  return (
    localStorage.getItem(LS.clientId) ||
    import.meta.env.VITE_SPOTIFY_CLIENT_ID ||
    ""
  );
}

export function setClientId(id) {
  if (id.trim()) localStorage.setItem(LS.clientId, id.trim());
  else localStorage.removeItem(LS.clientId);
}

export function redirectUri() {
  return window.location.origin + window.location.pathname;
}

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function beginLogin() {
  const clientId = getClientId();
  if (!clientId) throw new Error("missing Spotify client id");
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  localStorage.setItem(LS.verifier, verifier);
  const challenge = b64url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  );
  const p = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  window.location.assign("https://accounts.spotify.com/authorize?" + p);
}

function readToken() {
  try {
    return JSON.parse(localStorage.getItem(LS.token));
  } catch {
    return null;
  }
}

async function tokenRequest(body) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  if (!res.ok) throw new Error("spotify token request failed (" + res.status + ")");
  const t = await res.json();
  const saved = {
    access: t.access_token,
    refresh: t.refresh_token || readToken()?.refresh || null,
    exp: Date.now() + (t.expires_in - 60) * 1000,
  };
  localStorage.setItem(LS.token, JSON.stringify(saved));
  return saved;
}

// Call once on app load; consumes ?code=... if we just came back from Spotify.
export async function completeLoginFromUrl() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");
  if (!code && !err) return false;
  url.search = "";
  history.replaceState({}, "", url);
  if (err || !code) return false;
  const verifier = localStorage.getItem(LS.verifier);
  if (!verifier) return false;
  await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    client_id: getClientId(),
    code_verifier: verifier,
  });
  localStorage.removeItem(LS.verifier);
  return true;
}

export function isConnected() {
  const t = readToken();
  return !!(t && (t.refresh || t.exp > Date.now()));
}

export function disconnect() {
  localStorage.removeItem(LS.token);
}

async function accessToken() {
  let t = readToken();
  if (!t) throw new Error("not connected");
  if (t.exp <= Date.now()) {
    if (!t.refresh) throw new Error("session expired");
    t = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: t.refresh,
      client_id: getClientId(),
    });
  }
  return t.access;
}

async function api(path) {
  const res = await fetch("https://api.spotify.com/v1" + path, {
    headers: { Authorization: "Bearer " + (await accessToken()) },
  });
  if (res.status === 401) {
    disconnect();
    throw new Error("spotify session expired");
  }
  if (!res.ok) throw new Error("spotify api error (" + res.status + ")");
  return res.json();
}

export function fetchMe() {
  return api("/me");
}

// Union of medium-, short- and long-term top artists, ranked by first
// appearance — long_term keeps old favorites that fell out of rotation.
export async function fetchTopArtists() {
  const [med, short, long] = await Promise.all([
    api("/me/top/artists?limit=50&time_range=medium_term"),
    api("/me/top/artists?limit=50&time_range=short_term"),
    api("/me/top/artists?limit=50&time_range=long_term"),
  ]);
  const seen = new Map();
  for (const a of [...med.items, ...short.items, ...long.items]) {
    if (!seen.has(a.id)) {
      seen.set(a.id, {
        id: a.id,
        name: a.name,
        image: a.images?.[a.images.length - 1]?.url || null,
      });
    }
  }
  return [...seen.values()];
}
