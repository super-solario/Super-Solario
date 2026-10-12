/**
 * Super Solario — Hybrid Leaderboard (local + remote backend)
 * - Instant localStorage UX
 * - Syncs with remote API when available
 * - Mirrors durable board from data/leaderboard.json
 */
(function (global) {
  const KEY = 'solario_leaderboard_v3';
  const RECENT_KEY = 'solario_recent_v3';
  const USER_KEY = 'solario_username';
  const CHANNEL = 'solario_lb';
  const MAX = 25;
  const MAX_RECENT = 12;
  const MAX_SCORE = 9999999;
  const MAX_COINS = 99999;
  const MAX_LEVEL = 99;

  const cfg = global.SOLARIO_LB_REMOTE || {};
  let SEASON = cfg.season || 'SEASON 1 · GLOBAL';
  let remoteOnline = false;
  let lastRemoteFetch = 0;

  const bus = ('BroadcastChannel' in global) ? new BroadcastChannel(CHANNEL) : null;

  function normalizeName(name) {
    return String(name || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '')
      .slice(0, 12);
  }

  function clampInt(n, min, max) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v)) return min;
    return Math.max(min, Math.min(max, v));
  }

  function sanitizeEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const name = normalizeName(raw.name);
    if (!name) return null;
    return {
      name,
      score: clampInt(raw.score, 0, MAX_SCORE),
      coins: clampInt(raw.coins, 0, MAX_COINS),
      level: clampInt(raw.level, 1, MAX_LEVEL),
      ts: clampInt(raw.ts, 0, Date.now() + 60000) || Date.now(),
      seed: !!raw.seed
    };
  }

  function sanitizeList(arr) {
    if (!Array.isArray(arr)) return [];
    const out = [];
    const seen = Object.create(null);
    for (let i = 0; i < arr.length; i++) {
      const e = sanitizeEntry(arr[i]);
      if (!e || seen[e.name]) continue;
      seen[e.name] = true;
      out.push(e);
    }
    return out;
  }

  function sanitizeRecent(arr) {
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const e = sanitizeEntry(arr[i]);
      if (!e || e.seed) continue;
      out.push(e);
      if (out.length >= MAX_RECENT) break;
    }
    return out;
  }

  function seed() {
    const now = Date.now();
    return [
      { name: 'DIAMOND_DEV', score: 42069, coins: 180, level: 4, ts: now - 86400000, seed: true },
      { name: 'MOONBAG', score: 28800, coins: 140, level: 3, ts: now - 72000000, seed: true },
      { name: 'SOLWHALE', score: 19650, coins: 95, level: 3, ts: now - 54000000, seed: true },
      { name: 'BEARSLAYER', score: 12400, coins: 72, level: 2, ts: now - 36000000, seed: true },
      { name: 'HODLR', score: 8200, coins: 48, level: 2, ts: now - 18000000, seed: true },
      { name: 'PAPERHANDS', score: 2100, coins: 12, level: 1, ts: now - 9000000, seed: true }
    ];
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }

  function readLocal() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        const s = seed();
        safeSet(KEY, JSON.stringify(s));
        return s.slice();
      }
      const clean = sanitizeList(JSON.parse(raw));
      return clean.length ? clean : seed();
    } catch (e) { return seed(); }
  }

  function readRecentLocal() {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (!raw) return [];
      return sanitizeRecent(JSON.parse(raw));
    } catch (e) { return []; }
  }

  function emit(scores, recent) {
    if (bus) {
      try { bus.postMessage({ type: 'update', scores, recent, remote: remoteOnline }); } catch (e) {}
    }
    try {
      global.dispatchEvent(new CustomEvent('solario-lb', { detail: { scores, recent, remote: remoteOnline } }));
    } catch (e) {}
  }

  function writeLocal(list) {
    const sliced = sanitizeList(list).slice(0, MAX);
    safeSet(KEY, JSON.stringify(sliced));
    emit(sliced, readRecentLocal());
  }

  function writeRecentLocal(list) {
    safeSet(RECENT_KEY, JSON.stringify(sanitizeRecent(list).slice(0, MAX_RECENT)));
  }

  function mergeBoards(a, b) {
    const map = Object.create(null);
    sanitizeList(a).concat(sanitizeList(b)).forEach((e) => {
      const prev = map[e.name];
      if (!prev || e.score > prev.score || (e.score === prev.score && e.ts > prev.ts)) map[e.name] = e;
    });
    return Object.keys(map).map((k) => map[k]).sort((x, y) => y.score - x.score || y.ts - x.ts).slice(0, MAX);
  }

  function apiHeaders() {
    return {
      'Content-Type': 'application/json',
      'Bypass-Tunnel-Reminder': '1',
      'Accept': 'application/json'
    };
  }

  async function fetchRemoteBoard() {
    const urls = [];
    if (cfg.apiUrl) urls.push(String(cfg.apiUrl).replace(/\/$/, '') + '/board');
    if (cfg.boardUrl) urls.push(cfg.boardUrl);
    for (let i = 0; i < urls.length; i++) {
      try {
        const r = await fetch(urls[i], { headers: apiHeaders(), cache: 'no-store' });
        if (!r.ok) continue;
        const data = await r.json();
        const entries = sanitizeList(data.entries || data);
        if (!entries.length) continue;
        remoteOnline = /\/board$/.test(urls[i]) || !!cfg.apiUrl;
        lastRemoteFetch = Date.now();
        if (data.season) SEASON = data.season;
        const merged = mergeBoards(entries, readLocal());
        writeLocal(merged);
        if (Array.isArray(data.recent)) writeRecentLocal(sanitizeRecent(data.recent));
        emit(merged, readRecentLocal());
        return { ok: true, entries: merged, remote: remoteOnline };
      } catch (e) {}
    }
    remoteOnline = false;
    return { ok: false, entries: getScores(), remote: false };
  }

  async function submitRemote(entry) {
    if (!cfg.apiUrl) return null;
    try {
      const r = await fetch(String(cfg.apiUrl).replace(/\/$/, '') + '/submit', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify(entry)
      });
      if (!r.ok) return null;
      const data = await r.json();
      if (!data || !data.ok) return null;
      remoteOnline = true;
      if (Array.isArray(data.scores)) writeLocal(sanitizeList(data.scores));
      if (Array.isArray(data.recent)) writeRecentLocal(sanitizeRecent(data.recent));
      return data;
    } catch (e) {
      remoteOnline = false;
      return null;
    }
  }

  function getUsername() {
    try { return normalizeName(localStorage.getItem(USER_KEY) || ''); } catch (e) { return ''; }
  }

  function setUsername(name) {
    const n = normalizeName(name);
    if (n) safeSet(USER_KEY, n);
    return n;
  }

  function getScores() {
    return readLocal().slice().sort((a, b) => b.score - a.score || b.ts - a.ts);
  }

  function getRecent(limit) {
    return readRecentLocal().slice(0, limit == null ? MAX_RECENT : limit);
  }

  function getRank(name) {
    const n = normalizeName(name || getUsername());
    if (!n) return 0;
    const i = getScores().findIndex((r) => r.name === n);
    return i < 0 ? 0 : i + 1;
  }

  function getEntry(name) {
    const n = normalizeName(name || getUsername());
    return getScores().find((r) => r.name === n) || null;
  }

  function getTop(n) {
    return getScores().slice(0, n == null ? 3 : n);
  }

  function getPersonalBest(name) {
    const e = getEntry(name);
    return e ? e.score : 0;
  }

  function submitScoreLocal({ name, score, coins, level }) {
    const entry = sanitizeEntry({
      name: name || getUsername(),
      score,
      coins,
      level,
      ts: Date.now(),
      seed: false
    });
    if (!entry) return { ok: false, reason: 'name', entry: null };
    if (entry.score <= 0) return { ok: false, reason: 'zero', entry };

    const recent = readRecentLocal();
    recent.unshift(entry);
    writeRecentLocal(recent);

    const list = readLocal();
    const idx = list.findIndex((r) => r.name === entry.name);
    let improved = true;
    if (idx >= 0) {
      if (entry.score >= list[idx].score) list[idx] = entry;
      else {
        improved = false;
        const scores = getScores();
        const rank = scores.findIndex((r) => r.name === entry.name) + 1;
        emit(scores, recent.slice(0, MAX_RECENT));
        return { ok: true, improved: false, entry: list[idx], scores, recent: recent.slice(0, MAX_RECENT), rank, remote: false };
      }
    } else list.push(entry);
    list.sort((a, b) => b.score - a.score || b.ts - a.ts);
    writeLocal(list);
    const scores = getScores();
    const rank = scores.findIndex((r) => r.name === entry.name) + 1;
    return { ok: true, improved, entry, scores, recent: recent.slice(0, MAX_RECENT), rank, remote: false };
  }

  async function submitScore(opts) {
    const local = submitScoreLocal(opts);
    if (!local.ok) return local;
    const remote = await submitRemote(local.entry);
    if (remote && remote.ok) {
      return {
        ok: true,
        improved: !!remote.improved,
        entry: remote.entry || local.entry,
        scores: remote.scores ? sanitizeList(remote.scores) : getScores(),
        recent: remote.recent ? sanitizeRecent(remote.recent) : getRecent(),
        rank: remote.rank || getRank(local.entry.name),
        remote: true
      };
    }
    return local;
  }

  function shareText({ name, score, coins, level, rank }) {
    const n = normalizeName(name || getUsername()) || 'ANON';
    const r = rank || getRank(n);
    const rankBit = r ? ` · Rank #${r}` : '';
    return `$SOLARIO — ${n} scored ${formatScore(score)} (Lv ${level || 1}, ${coins || 0} coins)${rankBit}. Play Super Solario!`;
  }

  async function shareScore(opts) {
    const text = shareText(opts || {});
    try {
      if (navigator.share) {
        await navigator.share({ title: '$SOLARIO', text });
        return { ok: true, method: 'share' };
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, reason: 'abort' };
    }
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true, method: 'clipboard', text };
    } catch (e) {
      return { ok: false, reason: 'clipboard', text };
    }
  }

  function onUpdate(cb) {
    const handler = () => cb(getScores(), getRecent());
    const onStorage = (e) => {
      if (e.key === KEY || e.key === RECENT_KEY) handler();
    };
    global.addEventListener('storage', onStorage);
    global.addEventListener('solario-lb', handler);
    if (bus) bus.addEventListener('message', handler);
    return () => {
      global.removeEventListener('storage', onStorage);
      global.removeEventListener('solario-lb', handler);
      if (bus) bus.removeEventListener('message', handler);
    };
  }

  function formatScore(n) {
    return clampInt(n, 0, MAX_SCORE).toLocaleString();
  }

  function timeAgo(ts) {
    const s = Math.max(0, Math.floor((Date.now() - Number(ts || 0)) / 1000));
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isRemoteOnline() { return remoteOnline; }
  function getSeason() { return SEASON; }

  // Kick off remote sync
  fetchRemoteBoard().catch(() => {});
  setInterval(() => { fetchRemoteBoard().catch(() => {}); }, 45000);

  global.SolarioLB = {
    KEY, RECENT_KEY, MAX, MAX_RECENT, MAX_SCORE,
    get SEASON() { return SEASON; },
    getScores, getRecent, getRank, getEntry, getTop, getPersonalBest,
    submitScore, submitScoreLocal, fetchRemoteBoard,
    getUsername, setUsername, normalizeName, sanitizeEntry,
    onUpdate, formatScore, timeAgo, shareText, shareScore, escapeHtml,
    isRemoteOnline, getSeason
  };
})(typeof window !== 'undefined' ? window : globalThis);
