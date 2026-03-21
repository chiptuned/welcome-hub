/**
 * Poker Events — Cloudflare Pages Function
 *
 * Fetches the public iCal feed from Google Calendar,
 * parses upcoming events, and returns JSON.
 * No API key needed — just the public iCal URL.
 *
 * Uses Cloudflare Cache API to avoid hammering Google Calendar.
 *
 * Env var (set in Cloudflare Pages dashboard):
 *   POKER_ICAL_URL — the public .ics URL from Google Calendar
 */

const DEFAULT_ICAL_URL =
  'https://calendar.google.com/calendar/ical/b7f8bc27bffb00fdc90e7c8e8383c094fcf5b325060f88950bc0d2571a482f8a@group.calendar.google.com/public/basic.ics';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

const CACHE_TTL = 600; // 10 minutes

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
    },
  });
}

/**
 * Minimal iCal parser — extracts VEVENT blocks with SUMMARY, DTSTART, DTEND, LOCATION
 */
function parseIcal(icalText) {
  const events = [];
  const blocks = icalText.split('BEGIN:VEVENT');

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split('END:VEVENT')[0];

    // Unfold continuation lines
    const unfolded = block.replace(/\r?\n[ \t]/g, '');

    const summaryMatch = unfolded.match(/^SUMMARY[;:](.*)$/m);
    const dtStartMatch = unfolded.match(/^DTSTART[;:](.*)$/m);
    const dtEndMatch = unfolded.match(/^DTEND[;:](.*)$/m);
    const locationMatch = unfolded.match(/^LOCATION[;:](.*)$/m);

    const extractValue = (match) => {
      if (!match) return null;
      const raw = match[1];
      const colonIdx = raw.indexOf(':');
      if (colonIdx > 0 && raw.substring(0, colonIdx).includes('=')) {
        return raw.substring(colonIdx + 1);
      }
      return raw;
    };

    const summary = extractValue(summaryMatch);
    const dtStart = extractValue(dtStartMatch);
    const dtEnd = extractValue(dtEndMatch);
    const location = extractValue(locationMatch);

    if (!summary || !dtStart) continue;

    const parseDate = (str) => {
      if (!str) return null;
      const clean = str.replace(/[^0-9T]/g, '');
      if (clean.length === 8) {
        return new Date(`${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T00:00:00`);
      }
      const d = `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T${clean.slice(9, 11)}:${clean.slice(11, 13)}:${clean.slice(13, 15)}`;
      return str.endsWith('Z') ? new Date(d + 'Z') : new Date(d);
    };

    events.push({
      summary: summary.replace(/\\,/g, ',').replace(/\\n/g, ' ').trim(),
      start: parseDate(dtStart),
      end: parseDate(dtEnd),
      location: location ? location.replace(/\\,/g, ',').replace(/\\n/g, ' ').trim() : null,
      allDay: dtStart.length === 8 || (dtStartMatch && dtStartMatch[1].includes('VALUE=DATE')),
    });
  }

  return events;
}

/**
 * Fetch iCal with Cloudflare Cache API — avoids hammering Google Calendar.
 * Serves stale cache if Google returns 429 (rate limited).
 * Uses two cache keys: fresh (10min TTL) and stale (24h fallback).
 */
async function fetchIcalWithCache(icalUrl) {
  const cache = caches.default;
  const freshKey = new Request('https://cache-internal/poker-ical-fresh');
  const staleKey = new Request('https://cache-internal/poker-ical-stale');

  // 1. Try fresh cache first
  const freshCached = await cache.match(freshKey);
  if (freshCached) {
    console.log('[poker-events] Fresh cache HIT');
    return await freshCached.text();
  }

  // 2. Cache miss — try fetching from Google
  console.log('[poker-events] Cache MISS — fetching from Google Calendar');
  try {
    const icalRes = await fetch(icalUrl, {
      headers: { 'User-Agent': 'welcome-hub/1.0' },
      cf: { cacheTtl: 3600, cacheEverything: true }, // let CF edge cache upstream for 1h
    });

    if (icalRes.ok) {
      const icalText = await icalRes.text();

      // Store fresh (10min) + stale (24h) caches
      await Promise.all([
        cache.put(freshKey, new Response(icalText, {
          headers: { 'Cache-Control': `s-maxage=${CACHE_TTL}`, 'Content-Type': 'text/calendar' },
        })),
        cache.put(staleKey, new Response(icalText, {
          headers: { 'Cache-Control': 's-maxage=86400', 'Content-Type': 'text/calendar' },
        })),
      ]);

      console.log('[poker-events] Fetched OK, cached fresh + stale');
      return icalText;
    }

    // Non-OK response — fall through to stale cache
    console.log(`[poker-events] Google returned ${icalRes.status}, trying stale cache`);
  } catch (fetchErr) {
    console.log(`[poker-events] Fetch error: ${fetchErr.message}, trying stale cache`);
  }

  // 3. Fall back to stale cache
  const staleCached = await cache.match(staleKey);
  if (staleCached) {
    console.log('[poker-events] Stale cache HIT (fallback)');
    return await staleCached.text();
  }

  throw new Error('Calendar unavailable (rate limited, no cache)');
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const icalUrl = context.env.POKER_ICAL_URL || DEFAULT_ICAL_URL;

  try {
    const icalText = await fetchIcalWithCache(icalUrl);
    const allEvents = parseIcal(icalText);

    const now = new Date();
    const maxDate = new Date(Date.now() + 60 * 86400000);

    const upcoming = allEvents
      .filter(e => e.start && e.start >= now && e.start <= maxDate)
      .sort((a, b) => a.start - b.start)
      .slice(0, 6)
      .map(e => ({
        summary: e.summary,
        start: e.start.toISOString(),
        end: e.end?.toISOString() || null,
        location: e.location,
        allDay: e.allDay,
      }));

    return jsonResponse({
      events: upcoming,
      total: allEvents.length,
      fetched: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[poker-events] Error:', err.message);
    return jsonResponse({ error: err.message }, 500);
  }
}
