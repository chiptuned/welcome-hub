/* ============================================================
   WELCOME HUB — Main JS
   ============================================================ */

// =============================================================
// CONFIG — Edit these values to connect your services
// =============================================================
const CONFIG = {
  github: {
    user: 'chiptuned',
  },
  spotify: {
    // Cloudflare Pages Function endpoint
    apiUrl: 'https://welcome-hub-2c3.pages.dev/api/now-playing',
  },
  poker: {
    // Cloudflare Pages Function — proxies + parses your public iCal feed
    apiUrl: 'https://welcome-hub-2c3.pages.dev/api/poker-events',
  },
};

// ---------- Theme Toggle ----------
const themeToggle = document.getElementById('themeToggle');
const htmlEl = document.documentElement;

const savedTheme = (() => {
  try { return localStorage.getItem('hub-theme'); } catch { return null; }
})();
if (savedTheme) htmlEl.setAttribute('data-theme', savedTheme);

themeToggle.addEventListener('click', () => {
  const current = htmlEl.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  htmlEl.setAttribute('data-theme', next);
  try { localStorage.setItem('hub-theme', next); } catch {}
});

// ---------- GitHub Activity ----------
const githubContent = document.getElementById('githubContent');

async function fetchGitHubActivity() {
  const GH_USER = CONFIG.github.user;
  try {
    const [reposRes, eventsRes] = await Promise.all([
      fetch(`https://api.github.com/users/${GH_USER}/repos?sort=pushed&per_page=5`),
      fetch(`https://api.github.com/users/${GH_USER}/events/public?per_page=30`),
    ]);

    if (!reposRes.ok) throw new Error('GitHub API error');
    const repos = await reposRes.json();
    const events = eventsRes.ok ? await eventsRes.json() : [];

    const pushEvents = events
      .filter(e => e.type === 'PushEvent' && e.payload?.commits?.length)
      .slice(0, 5);

    let html = '';

    if (pushEvents.length > 0) {
      for (const event of pushEvents) {
        const repo = event.repo.name.replace(`${GH_USER}/`, '');
        const commit = event.payload.commits[event.payload.commits.length - 1];
        const ago = timeAgo(new Date(event.created_at));
        html += `
          <div class="commit-item">
            <div class="commit-dot"></div>
            <div class="commit-info">
              <div class="commit-msg">${esc(commit.message.split('\n')[0])}</div>
              <div class="commit-meta">${esc(repo)} &middot; ${ago}</div>
            </div>
          </div>`;
      }
    } else if (repos.length > 0) {
      for (const repo of repos.slice(0, 4)) {
        const ago = timeAgo(new Date(repo.pushed_at));
        const desc = repo.description
          ? esc(repo.description.slice(0, 60)) + (repo.description.length > 60 ? '...' : '')
          : 'No description';
        html += `
          <div class="commit-item">
            <div class="commit-dot"></div>
            <div class="commit-info">
              <div class="commit-msg">${esc(repo.name)}</div>
              <div class="commit-meta">${desc} &middot; ${ago}</div>
            </div>
          </div>`;
      }
    } else {
      html = '<p style="color:var(--text-tertiary);font-size:0.85rem;">No recent activity</p>';
    }

    githubContent.innerHTML = html;
    console.log(`[hub] GitHub: loaded ${pushEvents.length} commits, ${repos.length} repos`);
  } catch (err) {
    console.error('[hub] GitHub fetch error:', err);
    githubContent.innerHTML = `
      <p style="color:var(--text-tertiary);font-size:0.85rem;">
        Could not load GitHub activity.
        <a href="https://github.com/${CONFIG.github.user}" target="_blank" style="color:var(--accent);">View profile &rarr;</a>
      </p>`;
  }
}

// ---------- Spotify Now Playing ----------
const spotifyCard = document.getElementById('spotifyCard');
const equalizer = document.getElementById('equalizer');

async function fetchNowPlaying() {
  if (!CONFIG.spotify.apiUrl) {
    console.log('[hub] Spotify: no API URL configured, skipping');
    return;
  }

  try {
    const res = await fetch(CONFIG.spotify.apiUrl);
    if (!res.ok) throw new Error(`Spotify API ${res.status}`);
    const data = await res.json();

    const listeningContent = spotifyCard.querySelector('.listening-content');

    if (data.isPlaying && data.title) {
      listeningContent.innerHTML = `
        <div class="album-art-placeholder" style="${data.albumArt ? `background-image:url(${data.albumArt});background-size:cover;` : ''}">
          ${!data.albumArt ? '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>' : ''}
        </div>
        <div class="track-info">
          <span class="track-status" style="color:var(--green);">Now playing</span>
          <span class="track-name"><strong>${esc(data.title)}</strong></span>
          <span class="track-artist" style="font-size:0.78rem;color:var(--text-tertiary);">${esc(data.artist)}</span>
        </div>`;
      equalizer.classList.add('playing');
      equalizer.style.opacity = '1';
      console.log(`[hub] Spotify: playing "${data.title}" by ${data.artist}`);
    } else {
      listeningContent.innerHTML = `
        <div class="album-art-placeholder">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        </div>
        <div class="track-info">
          <span class="track-status">Nothing playing</span>
          <span class="track-name">Silence is golden</span>
        </div>`;
      equalizer.classList.remove('playing');
      equalizer.style.opacity = '0.3';
      console.log('[hub] Spotify: nothing playing');
    }
  } catch (err) {
    console.error('[hub] Spotify error:', err);
  }
}

// ---------- Online Poker Live Pill (Sundays 17:00–01:00 Paris) ----------
const onlinePill = document.getElementById('onlinePill');

function updateOnlinePill() {
  // Paris timezone — Sunday 17:00 to Monday 01:00
  const now = new Date();
  const paris = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const day = paris.getDay(); // 0 = Sunday
  const hour = paris.getHours();

  const isLive = (day === 0 && hour >= 17) || (day === 1 && hour < 1);

  if (onlinePill) {
    onlinePill.classList.toggle('live', isLive);
    console.log(`[hub] Online pill: ${isLive ? 'LIVE' : 'off'} (Paris: ${day}/${hour}h)`);
  }
}

updateOnlinePill();
setInterval(updateOnlinePill, 60 * 1000); // check every minute

// ---------- Poker Venues (Google Calendar) ----------
const venueList = document.getElementById('venueList');
const addToCalendarBtn = document.getElementById('addToCalendarBtn');

async function fetchPokerVenues() {
  if (!CONFIG.poker.apiUrl) {
    venueList.innerHTML = `
      <div class="venue-item">
        <span class="venue-date">TBD</span>
        <span class="venue-name">No upcoming sessions found</span>
      </div>`;
    console.log('[hub] Poker: no API URL configured, showing placeholder');
    return;
  }

  try {
    const res = await fetch(CONFIG.poker.apiUrl);
    if (!res.ok) throw new Error(`Poker API ${res.status}`);
    const data = await res.json();

    // Filter out online-only events (Winamax/PokerStars series without a physical location)
    const ONLINE_KEYWORDS = ['winamax', 'pokerstars'];
    const isOnlineEvent = (event) => {
      const name = event.summary.toLowerCase();
      return ONLINE_KEYWORDS.some(kw => name.includes(kw)) && !event.location;
    };

    const liveEvents = (data.events || []).filter(e => !isOnlineEvent(e));

    // Group consecutive days of the same event title into a single entry with date range
    function groupConsecutiveEvents(events) {
      if (!events.length) return [];
      const groups = [];
      let current = null;

      for (const event of events) {
        const startDate = new Date(event.start);
        const dayKey = `${startDate.getFullYear()}-${startDate.getMonth()}-${startDate.getDate()}`;

        if (current && current.summary === event.summary) {
          // Check if this is the next day (or same day different time — skip dupes)
          const prevEnd = new Date(current.lastDate);
          const diffDays = Math.round((startDate - prevEnd) / 86400000);
          if (diffDays <= 1) {
            current.lastDate = startDate;
            current.dayCount++;
            continue;
          }
        }

        // Start a new group
        if (current) groups.push(current);
        current = {
          summary: event.summary,
          firstDate: startDate,
          lastDate: startDate,
          time: !event.allDay
            ? startDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
            : '',
          location: event.location,
          allDay: event.allDay,
          dayCount: 1,
        };
      }
      if (current) groups.push(current);
      return groups;
    }

    const grouped = groupConsecutiveEvents(liveEvents);

    if (grouped.length > 0) {
      venueList.innerHTML = grouped.map(g => {
        const fmtDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        let dateStr = fmtDate(g.firstDate);
        if (g.dayCount > 1) {
          dateStr += ` – ${fmtDate(g.lastDate)}`;
        }
        const timeStr = g.time || '';
        const location = g.location ? ` — ${esc(g.location)}` : '';
        return `
          <div class="venue-item">
            <span class="venue-date">${dateStr}${timeStr ? ' ' + timeStr : ''}</span>
            <span class="venue-name">${esc(g.summary)}${location}</span>
          </div>`;
      }).join('');
      console.log(`[hub] Poker: ${data.events.length} raw → ${liveEvents.length} live → ${grouped.length} grouped`);
    } else {
      venueList.innerHTML = `
        <div class="venue-item">
          <span class="venue-date">&mdash;</span>
          <span class="venue-name">No upcoming sessions</span>
        </div>`;
      console.log('[hub] Poker: no upcoming events');
    }
  } catch (err) {
    console.error('[hub] Poker venues error:', err);
    venueList.innerHTML = `
      <div class="venue-item">
        <span class="venue-date">!</span>
        <span class="venue-name">Could not load calendar</span>
      </div>`;
  }
}

// Google Calendar "Sync" button — opens user's calendar to subscribe
addToCalendarBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  // Public calendar — visitors can subscribe via this URL
  const calId = 'b7f8bc27bffb00fdc90e7c8e8383c094fcf5b325060f88950bc0d2571a482f8a@group.calendar.google.com';
  const url = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(calId)}`;
  window.open(url, '_blank');
});

// ---------- Notify Form ----------
const notifyForm = document.getElementById('notifyForm');
notifyForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = notifyForm.querySelector('.cs-input');
  const btn = notifyForm.querySelector('.cs-btn');
  const email = input.value;

  // In production: POST to your email service (Resend, ConvertKit, etc.)
  console.log('[hub] Notify signup:', email);

  btn.textContent = 'Subscribed!';
  btn.style.background = 'var(--green)';
  input.value = '';
  input.disabled = true;
  btn.disabled = true;

  setTimeout(() => {
    btn.textContent = 'Notify me';
    btn.style.background = '';
    input.disabled = false;
    btn.disabled = false;
  }, 3000);
});

// ---------- Utilities ----------
function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  const intervals = [
    { label: 'y', seconds: 31536000 },
    { label: 'mo', seconds: 2592000 },
    { label: 'd', seconds: 86400 },
    { label: 'h', seconds: 3600 },
    { label: 'm', seconds: 60 },
  ];
  for (const { label, seconds: s } of intervals) {
    const count = Math.floor(seconds / s);
    if (count >= 1) return `${count}${label} ago`;
  }
  return 'just now';
}

// ---------- Init ----------
console.log('[hub] Welcome Hub initializing...');
fetchGitHubActivity();
fetchNowPlaying();
fetchPokerVenues();

// Auto-refresh intervals
setInterval(fetchGitHubActivity, 5 * 60 * 1000);  // GitHub: every 5min
setInterval(fetchNowPlaying, 10 * 1000);            // Spotify: every 10s
setInterval(fetchPokerVenues, 15 * 60 * 1000);      // Poker calendar: every 15min

console.log('[hub] All modules loaded. Refresh intervals active.');
