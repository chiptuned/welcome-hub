#!/usr/bin/env node
/**
 * Spotify Refresh Token Generator
 *
 * Usage:
 *   1. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in ../.env
 *      or pass them as env vars.
 *   2. Run: node scripts/get-spotify-token.js
 *   3. Open the URL printed in your browser
 *   4. Authorize the app → redirected to 127.0.0.1:3000/callback
 *   5. The refresh token will be printed in the terminal
 *
 * Required scope: user-read-currently-playing user-read-playback-state
 *
 * NOTE: In the Spotify Developer Dashboard, the Redirect URI must be set to:
 *       http://127.0.0.1:3000/callback
 *       (Spotify blocks http://localhost but allows http://127.0.0.1)
 */

import http from 'node:http';

// Credentials — update these or set as env vars
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = 'http://127.0.0.1:3000/callback';
const SCOPE = 'user-read-currently-playing user-read-playback-state';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET env vars first.');
  console.error('   Example:');
  console.error('   SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy node scripts/get-spotify-token.js');
  process.exit(1);
}

const authUrl = `https://accounts.spotify.com/authorize?${new URLSearchParams({
  response_type: 'code',
  client_id: CLIENT_ID,
  scope: SCOPE,
  redirect_uri: REDIRECT_URI,
})}`;

console.log('\n🎵 Spotify Refresh Token Generator\n');
console.log('Open this URL in your browser:\n');
console.log(`  ${authUrl}\n`);
console.log('Waiting for callback on http://127.0.0.1:3000/callback ...\n');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:3000');

  if (url.pathname === '/callback') {
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`<h1>Error: ${error}</h1>`);
      console.error(`❌ Authorization error: ${error}`);
      process.exit(1);
    }

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<h1>No code received</h1>');
      return;
    }

    try {
      const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
        }),
      });

      const data = await tokenRes.json();

      if (data.error) {
        throw new Error(data.error_description || data.error);
      }

      console.log('✅ Success! Here is your refresh token:\n');
      console.log(`  SPOTIFY_REFRESH_TOKEN=${data.refresh_token}\n`);
      console.log('Add this to your .env and Vercel environment variables.');
      console.log('The refresh token never expires unless you revoke access.\n');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <h1>✅ Success!</h1>
        <p>Your refresh token has been printed in the terminal.</p>
        <p>You can close this tab.</p>
      `);

      setTimeout(() => process.exit(0), 1000);
    } catch (err) {
      console.error('❌ Token exchange error:', err.message);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`<h1>Error: ${err.message}</h1>`);
      process.exit(1);
    }
  }
});

server.listen(3000, '127.0.0.1', () => {
  console.log('🔌 HTTP server listening on http://127.0.0.1:3000');
});
