#!/usr/bin/env node
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const PORT = process.env.PORT || 8787;
const DATA = path.join(__dirname, 'board.json');
const MAX = 25, MAX_RECENT = 12;

const SEED = [
  { name: 'DIAMOND_DEV', score: 42069, coins: 180, level: 4, ts: 1760000000000 },
  { name: 'MOONBAG', score: 28800, coins: 140, level: 3, ts: 1760001000000 },
  { name: 'SOLWHALE', score: 19650, coins: 95, level: 3, ts: 1760002000000 },
  { name: 'BEARSLAYER', score: 12400, coins: 72, level: 2, ts: 1760003000000 },
  { name: 'HODLR', score: 8200, coins: 48, level: 2, ts: 1760004000000 }
];

function load() {
  try { return JSON.parse(fs.readFileSync(DATA, 'utf8')); }
  catch { return { entries: SEED.slice(), recent: [], version: 1, updatedAt: Date.now() }; }
}
function save(data) {
  data.updatedAt = Date.now();
  fs.writeFileSync(DATA, JSON.stringify(data, null, 2));
}

function syncGithub(data) {
  try {
    const repoData = path.join(__dirname, '..', 'data', 'leaderboard.json');
    fs.mkdirSync(path.dirname(repoData), { recursive: true });
    fs.writeFileSync(repoData, JSON.stringify(data, null, 2));
    execFile('node', [path.join(__dirname, 'sync-github.js')], () => {});
  } catch (e) {}
}

function norm(n){return String(n||'').trim().toUpperCase().replace(/[^A-Z0-9_]/g,'').slice(0,12)}
function clamp(n,a,b){n=Math.floor(Number(n));return Number.isFinite(n)?Math.max(a,Math.min(b,n)):a}
function sanitize(raw){
  const name=norm(raw&&raw.name); if(!name||name.length<2) return null;
  const score=clamp(raw.score,1,9999999); if(score<=0) return null;
  return {name,score,coins:clamp(raw.coins,0,99999),level:clamp(raw.level,1,99),ts:clamp(raw.ts||Date.now(),0,Date.now()+6e4)||Date.now()};
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Bypass-Tunnel-Reminder',
  'Content-Type': 'application/json'
};

if (!fs.existsSync(DATA)) save(load());

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/health') {
    res.writeHead(200, cors); res.end(JSON.stringify({ ok: true, service: 'super-solario-lb', v: 1 })); return;
  }
  if (url.pathname === '/board' && req.method === 'GET') {
    res.writeHead(200, cors); res.end(JSON.stringify(load())); return;
  }
  if (url.pathname === '/submit' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let raw; try { raw = JSON.parse(body||'{}'); } catch { res.writeHead(400,cors); res.end(JSON.stringify({ok:false,reason:'json'})); return; }
      const entry = sanitize(raw);
      if (!entry) { res.writeHead(400,cors); res.end(JSON.stringify({ok:false,reason:'invalid'})); return; }
      if (entry.score > entry.level * 50000 + 100000) { res.writeHead(400,cors); res.end(JSON.stringify({ok:false,reason:'rejected'})); return; }
      const data = load();
      data.recent = [entry, ...(data.recent||[])].slice(0, MAX_RECENT);
      const idx = data.entries.findIndex(e => e.name === entry.name);
      let improved = true;
      if (idx >= 0) {
        if (entry.score >= data.entries[idx].score) data.entries[idx] = entry;
        else improved = false;
      } else data.entries.push(entry);
      data.entries.sort((a,b)=>b.score-a.score||b.ts-a.ts);
      data.entries = data.entries.slice(0, MAX);
      save(data);
      // best-effort sync into repo data file (for Pages mirror)
      syncGithub(data);
      const rank = data.entries.findIndex(e => e.name === entry.name) + 1;
      res.writeHead(200, cors);
      res.end(JSON.stringify({ ok: true, improved, rank, entry, scores: data.entries, recent: data.recent }));
    });
    return;
  }
  res.writeHead(404, cors); res.end(JSON.stringify({ ok: false }));
});

server.listen(PORT, '0.0.0.0', () => console.log('LB on', PORT));
