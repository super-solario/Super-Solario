/**
 * Super Solario — Local Leaderboard (v2)
 * Best-per-user board + recent runs.
 * Syncs via localStorage + BroadcastChannel (site ↔ game iframe ↔ tabs).
 * Scores are browser-local only — not on-chain / not a global competitive board.
 */
(function (global) {
  const KEY = 'solario_leaderboard_v2';
  const RECENT_KEY = 'solario_recent_v1';
  const USER_KEY = 'solario_username';
  const CHANNEL = 'solario_lb';
  const MAX = 25;
  const MAX_RECENT = 12;
  const MAX_SCORE = 9999999;
  const MAX_COINS = 99999;
  const MAX_LEVEL = 99;

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
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        const s = seed();
        safeSet(KEY, JSON.stringify(s));
        return s.slice();
      }
      const parsed = JSON.parse(raw);
      const clean = sanitizeList(parsed);
      return clean.length ? clean : seed();
    } catch (e) {
      return seed();
    }
  }

  function readRecent() {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (!raw) return [];
      return sanitizeRecent(JSON.parse(raw));
    } catch (e) {
      return [];
    }
  }

  function emit(scores, recent) {
    if (bus) {
      try { bus.postMessage({ type: 'update', scores, recent }); } catch (e) {}
    }
    try {
      global.dispatchEvent(new CustomEvent('solario-lb', { detail: { scores, recent } }));
    } catch (e) {}
  }

  function write(list) {
    const sliced = sanitizeList(list).slice(0, MAX);
    safeSet(KEY, JSON.stringify(sliced));
    emit(sliced, readRecent());
  }

  function writeRecent(list) {
    safeSet(RECENT_KEY, JSON.stringify(sanitizeRecent(list).slice(0, MAX_RECENT)));
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
    return read().slice().sort((a, b) => b.score - a.score || b.ts - a.ts);
  }

  function getRecent(limit) {
    return readRecent().slice(0, limit == null ? MAX_RECENT : limit);
  }

  function getRank(name) {
    const n = normalizeName(name || getUsername());
    if (!n) return 0;
    const scores = getScores();
    const i = scores.findIndex((r) => r.name === n);
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

  function submitScore({ name, score, coins, level }) {
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

    const recent = readRecent();
    recent.unshift(entry);
    writeRecent(recent);

    const list = read();
    const idx = list.findIndex((r) => r.name === entry.name);
    let improved = true;
    if (idx >= 0) {
      if (entry.score >= list[idx].score) list[idx] = entry;
      else {
        improved = false;
        const scores = getScores();
        const rank = scores.findIndex((r) => r.name === entry.name) + 1;
        emit(scores, recent.slice(0, MAX_RECENT));
        return { ok: true, improved: false, entry: list[idx], scores, recent: recent.slice(0, MAX_RECENT), rank };
      }
    } else {
      list.push(entry);
    }
    list.sort((a, b) => b.score - a.score || b.ts - a.ts);
    write(list);
    const scores = getScores();
    const rank = scores.findIndex((r) => r.name === entry.name) + 1;
    return { ok: true, improved, entry, scores, recent: recent.slice(0, MAX_RECENT), rank };
  }

  function shareText({ name, score, coins, level, rank }) {
    const n = normalizeName(name || getUsername()) || 'ANON';
    const r = rank || getRank(n);
    const rankBit = r ? ` · Rank #${r}` : '';
    return `$SOLARIO — ${n} scored ${formatScore(score)} (Lv ${level || 1}, ${coins || 0} coins)${rankBit}. Play Super Solario Bros!`;
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

  /** Escape for safe HTML interpolation (names are already A-Z0-9_ but belt+suspenders). */
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  global.SolarioLB = {
    KEY, RECENT_KEY, MAX, MAX_RECENT, MAX_SCORE,
    getScores, getRecent, getRank, getEntry, getTop, getPersonalBest,
    submitScore, getUsername, setUsername, normalizeName, sanitizeEntry,
    onUpdate, formatScore, timeAgo, shareText, shareScore, escapeHtml
  };
})(typeof window !== 'undefined' ? window : globalThis);
