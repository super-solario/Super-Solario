/**
 * Super Solario — Live Leaderboard
 * Same-origin localStorage + BroadcastChannel so the site + game iframe
 * stay in sync, and multiple tabs update live.
 */
(function (global) {
  const KEY = 'solario_leaderboard_v2';
  const USER_KEY = 'solario_username';
  const CHANNEL = 'solario_lb';
  const MAX = 25;

  const bus = ('BroadcastChannel' in global) ? new BroadcastChannel(CHANNEL) : null;

  function seed() {
    return [
      { name: 'DIAMOND_DEV', score: 42069, coins: 180, level: 4, ts: Date.now() - 86400000 },
      { name: 'MOONBAG', score: 28800, coins: 140, level: 3, ts: Date.now() - 72000000 },
      { name: 'SOLWHALE', score: 19650, coins: 95, level: 3, ts: Date.now() - 54000000 },
      { name: 'BEARSLAYER', score: 12400, coins: 72, level: 2, ts: Date.now() - 36000000 },
      { name: 'HODLR', score: 8200, coins: 48, level: 2, ts: Date.now() - 18000000 },
      { name: 'PAPERHANDS', score: 2100, coins: 12, level: 1, ts: Date.now() - 9000000 }
    ];
  }

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        const s = seed();
        localStorage.setItem(KEY, JSON.stringify(s));
        return s;
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : seed();
    } catch (e) {
      return seed();
    }
  }

  function write(list) {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
    if (bus) bus.postMessage({ type: 'update', scores: list.slice(0, MAX) });
    try {
      global.dispatchEvent(new CustomEvent('solario-lb', { detail: list.slice(0, MAX) }));
    } catch (e) {}
  }

  function normalizeName(name) {
    return String(name || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '')
      .slice(0, 12);
  }

  function getUsername() {
    try { return localStorage.getItem(USER_KEY) || ''; } catch (e) { return ''; }
  }

  function setUsername(name) {
    const n = normalizeName(name);
    localStorage.setItem(USER_KEY, n);
    return n;
  }

  function getScores() {
    return read().slice().sort((a, b) => b.score - a.score || b.ts - a.ts);
  }

  function submitScore({ name, score, coins, level }) {
    const entry = {
      name: normalizeName(name || getUsername()),
      score: Math.max(0, Math.floor(Number(score) || 0)),
      coins: Math.max(0, Math.floor(Number(coins) || 0)),
      level: Math.max(1, Math.floor(Number(level) || 1)),
      ts: Date.now()
    };
    if (entry.score <= 0) return { ok: false, reason: 'zero', entry };

    const list = read();
    // Keep best score per username; replace if new is higher
    const idx = list.findIndex((r) => r.name === entry.name);
    if (idx >= 0) {
      if (entry.score >= list[idx].score) list[idx] = entry;
      else return { ok: true, improved: false, entry: list[idx], scores: getScores() };
    } else {
      list.push(entry);
    }
    list.sort((a, b) => b.score - a.score || b.ts - a.ts);
    write(list);
    return { ok: true, improved: true, entry, scores: getScores(), rank: list.findIndex((r) => r.name === entry.name) + 1 };
  }

  function onUpdate(cb) {
    const handler = () => cb(getScores());
    global.addEventListener('storage', (e) => {
      if (e.key === KEY) handler();
    });
    global.addEventListener('solario-lb', handler);
    if (bus) bus.onmessage = () => handler();
    return () => {
      global.removeEventListener('solario-lb', handler);
    };
  }

  function formatScore(n) {
    return Number(n || 0).toLocaleString();
  }

  function timeAgo(ts) {
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }

  global.SolarioLB = {
    KEY, getScores, submitScore, getUsername, setUsername,
    normalizeName, onUpdate, formatScore, timeAgo, MAX
  };
})(typeof window !== 'undefined' ? window : globalThis);
