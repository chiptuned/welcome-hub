/**
 * Spotify Now Playing — Cloudflare Pages Function
 *
 * Env vars required (set in Cloudflare Pages → Settings → Environment Variables):
 *   SPOTIFY_CLIENT_ID
 *   SPOTIFY_CLIENT_SECRET
 *   SPOTIFY_REFRESH_TOKEN
 *
 * Setup steps:
 * 1. Go to https://developer.spotify.com/dashboard → Create App
 * 2. Set redirect URI to http://127.0.0.1:3000/callback
 * 3. Copy Client ID + Client Secret
 * 4. Get refresh token via: node scripts/get-spotify-token.js
 * 5. Add all 3 env vars in Cloudflare Pages dashboard
 * 6. Deploy. The endpoint is /api/now-playing
 */

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_NOW_PLAYING_URL = 'https://api.spotify.com/v1/me/player/currently-playing';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

function jsonResponse(data, status = 200, cacheSeconds = 5) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Cache-Control': `s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}`,
    },
  });
}

async function getAccessToken(clientId, clientSecret, refreshToken) {
  const basic = btoa(`${clientId}:${clientSecret}`);

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

async function getNowPlaying(accessToken) {
  const res = await fetch(SPOTIFY_NOW_PLAYING_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`Now playing failed: ${res.status}`);

  return res.json();
}

// Handle OPTIONS preflight
export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } = context.env;

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) {
    return jsonResponse(
      { error: 'Missing Spotify environment variables. See functions/api/now-playing.js for setup.' },
      500,
    );
  }

  try {
    const accessToken = await getAccessToken(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN);
    const nowPlaying = await getNowPlaying(accessToken);

    if (!nowPlaying || !nowPlaying.item) {
      return jsonResponse({ isPlaying: false });
    }

    const { item, is_playing, progress_ms } = nowPlaying;

    return jsonResponse({
      isPlaying: is_playing,
      title: item.name,
      artist: item.artists?.map(a => a.name).join(', ') || 'Unknown',
      album: item.album?.name || 'Unknown',
      albumArt: item.album?.images?.[0]?.url || null,
      trackUrl: item.external_urls?.spotify || null,
      progressMs: progress_ms,
      durationMs: item.duration_ms,
    });
  } catch (err) {
    console.error('[spotify] Error:', err.message);
    return jsonResponse({ error: err.message }, 500);
  }
}
