(() => {
'use strict';

if (!window.THREE) {
  document.body.innerHTML = '<p style="color:#fff;padding:24px;font-family:monospace">Failed to load Three.js</p>';
  return;
}

const THREE = window.THREE;
const canvas = document.getElementById('c');
const overlay = document.getElementById('overlay');
const toastEl = document.getElementById('toast');
const progEl = document.getElementById('progress');
const progFill = document.getElementById('progFill');
const pausePanel = document.getElementById('pausePanel');
const logoMark = document.getElementById('logoMark');

// ── Mario-64 / Smash Bros. feel ──────────────────────────
const GRAV = 46;
const JUMP_V = 16.2;
const JUMP2_V = 17.4;
const LONGJUMP_V = 12.5;
const LONGJUMP_H = 16;
const JUMP_CUT = 0.42;
const MOVE_ACC = 62;
const MOVE_MAX = 12.2;
const AIR_ACC = 32;
const FRICTION = 22;
const COYOTE = 0.14;
const JUMP_BUF = 0.14;
const PLAYER_R = 0.42;
const PLAYER_H = 1.4;
const STEP_UP = 0.4;
const RISE = (JUMP_V * JUMP_V) / (2 * GRAV); // ~2.85

const MUTE_KEY = 'solario_muted';
let username = (window.SolarioLB && SolarioLB.getUsername()) || '';
const unameEl = () => document.getElementById('uname');
if (unameEl()) unameEl().value = username;

let AC = null, muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}
function ac() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  return AC;
}
function beep(f, d = 0.08, type = 'square', v = 0.055, delay = 0, slide = 0) {
  if (muted) return;
  const a = ac(); if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t0 + d);
  g.gain.setValueAtTime(v, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + d);
  o.connect(g); g.connect(a.destination);
  o.start(t0); o.stop(t0 + d + 0.02);
}
const sfx = {
  jump: () => { beep(280, 0.05); beep(420, 0.07, 'square', 0.04, 0.04); },
  djump: () => { beep(340, 0.05); beep(520, 0.08, 'square', 0.045, 0.04); },
  ljump: () => { beep(200, 0.06, 'triangle', 0.06); beep(360, 0.1, 'square', 0.04, 0.05); },
  coin: () => { beep(880, 0.05); beep(1200, 0.07, 'square', 0.04, 0.04); },
  stomp: () => beep(180, 0.1, 'triangle', 0.07, 0, -40),
  hurt: () => { beep(200, 0.1, 'sawtooth', 0.05); beep(100, 0.14, 'sawtooth', 0.04, 0.05); },
  win: () => { beep(523, 0.1); beep(659, 0.1, 'square', 0.05, 0.1); beep(784, 0.16, 'square', 0.06, 0.2); },
  power: () => { beep(440, 0.07); beep(660, 0.09, 'square', 0.04, 0.06); },
  die: () => { beep(260, 0.12, 'sawtooth', 0.05); beep(120, 0.2, 'sawtooth', 0.04, 0.08, -80); },
  pound: () => beep(90, 0.12, 'triangle', 0.08),
  star: () => { beep(660, 0.08); beep(880, 0.1, 'square', 0.05, 0.08); beep(1175, 0.18, 'square', 0.06, 0.18); }
};
function setMuted(v) {
  muted = !!v;
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) {}
  ['btnMute', 'hudMute'].forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.textContent = muted ? 'MUT' : 'SND';
    btn.classList.toggle('on', muted);
  });
  if (!muted) { const a = ac(); if (a && a.state === 'suspended') a.resume(); }
}

const keys = Object.create(null);
const setKey = (code, down) => { keys[code] = down; };
window.addEventListener('keydown', (e) => {
  setKey(e.code, true);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (AC && AC.state === 'suspended') AC.resume();
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code === 'KeyM') setMuted(!muted);
  if ((e.code === 'Enter' || e.code === 'Space') && (state === 'entry' || state === 'over' || state === 'clear')) {
    e.preventDefault();
    if (state === 'entry') startFromOverlay();
    else if (state === 'over') showEntry();
    else if (state === 'clear') nextLevel();
  }
});
window.addEventListener('keyup', (e) => setKey(e.code, false));
window.addEventListener('pointerdown', () => { const a = ac(); if (a && a.state === 'suspended') a.resume(); });

function bindPad(id, code) {
  const el = document.getElementById(id);
  if (!el) return;
  const on = (e) => { e.preventDefault(); setKey(code, true); el.classList.add('on'); };
  const off = (e) => { e.preventDefault(); setKey(code, false); el.classList.remove('on'); };
  ['touchstart', 'mousedown'].forEach((ev) => el.addEventListener(ev, on, { passive: false }));
  ['touchend', 'touchcancel', 'mouseup', 'mouseleave'].forEach((ev) => el.addEventListener(ev, off));
}
bindPad('btnL', 'ArrowLeft');
bindPad('btnR', 'ArrowRight');
bindPad('btnU', 'ArrowUp');
bindPad('btnD', 'ArrowDown');
bindPad('btnJ', 'Space');
bindPad('btnCamL', 'KeyQ');
bindPad('btnCamR', 'KeyE');
['btnPause', 'hudPause'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', (e) => { e.preventDefault(); togglePause(); });
});
['btnMute', 'hudMute'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', (e) => { e.preventDefault(); setMuted(!muted); });
});
document.getElementById('btnResume').addEventListener('click', (e) => { e.preventDefault(); if (state === 'pause') togglePause(); });
document.getElementById('btnQuit').addEventListener('click', (e) => {
  e.preventDefault();
  if (state === 'pause') {
    pausePanel.classList.remove('show');
    if (score > 0) submitToBoard(true);
    showEntry();
  }
});
setMuted(muted);

const left = () => keys.ArrowLeft || keys.KeyA;
const right = () => keys.ArrowRight || keys.KeyD;
const forward = () => keys.ArrowUp || keys.KeyW;
const back = () => keys.ArrowDown || keys.KeyS;
const jumpHeld = () => keys.Space;
const poundHeld = () => keys.ShiftLeft || keys.ShiftRight;
const camL = () => keys.KeyQ || keys.Comma;
const camR = () => keys.KeyE || keys.Period;

// ── Courses: layered, jump-reachable (step ≤ 2.2, gap ≤ 5.5) ─
// Each course: ground spine + stair tower + mid bridges + high ridge + star perch
const COURSES = [
  {
    name: 'Bob-omb Grass',
    sky: 0x5eb8ff, fog: 0x9ed4ff, ground: 0x3ecf4a, dirt: 0xb45309, accent: 0x86efac,
    spawn: [0, 2.2, 0], flag: [46, 1, 0],
    plats: [
      // ground spine
      [-5, 0, 0, 14, 1, 12], [8, 0, 0, 10, 1, 10], [18, 0, 0, 9, 1, 9],
      [28, 0, 0, 10, 1, 10], [38, 0, 0, 10, 1, 10], [48, 0, 0, 12, 1, 12],
      // stair tower A (gentle 1.7 rises)
      [3, 1.7, -3, 3.2, 0.45, 3.2], [6, 3.4, -2, 3.2, 0.45, 3.2],
      [9, 5.1, -1, 3.4, 0.45, 3.4], [12, 6.8, 0, 3.4, 0.45, 3.4],
      [15, 8.5, 1, 3.6, 0.45, 3.6],
      // mid path alternate
      [10, 2.0, 3, 3, 0.4, 3], [14, 3.6, 3.5, 3, 0.4, 3],
      [18, 5.2, 3, 3.2, 0.4, 3], [22, 6.8, 2, 3.2, 0.4, 3],
      // high ridge chain
      [20, 8.5, -1, 3.5, 0.45, 3], [24, 10.0, 0, 3.5, 0.45, 3],
      [28, 11.5, 1, 3.5, 0.45, 3], [33, 10.0, 0, 3.5, 0.45, 3],
      [37, 11.5, -1, 3.5, 0.45, 3], [42, 13.0, 0, 4, 0.45, 3.5],
      // bridges + side pads
      [25, 2.4, 0, 6, 0.4, 2.4], [35, 3.8, 0, 5, 0.4, 2.4],
      [30, 5.5, -3, 3, 0.4, 2.8], [40, 7.2, 3, 3, 0.4, 2.8],
      // star perch
      [42, 14.6, 0, 3.2, 0.4, 3.2]
    ],
    movers: [
      { x: 16, y: 4.2, z: -4, w: 3, h: 0.4, d: 2.5, amp: 2.2, axis: 'z', speed: 1.1 },
      { x: 32, y: 8.2, z: 0, w: 3, h: 0.4, d: 2.5, amp: 1.8, axis: 'y', speed: 0.9 }
    ],
    qblocks: [[6, 5.2, -2], [15, 10.3, 1], [24, 11.8, 0], [37, 13.3, -1], [42, 16.4, 0]],
    coins: [
      [2, 2.2, 0], [3, 3.5, -3], [6, 5.2, -2], [9, 6.9, -1], [12, 8.6, 0],
      [15, 10.3, 1], [10, 3.8, 3], [14, 5.4, 3.5], [18, 7, 3], [22, 8.6, 2],
      [20, 10.3, -1], [24, 11.8, 0], [28, 13.3, 1], [33, 11.8, 0], [37, 13.3, -1],
      [42, 14.8, 0], [42, 16.4, 0], [26, 4.2, 0], [36, 5.6, 0], [44, 2.2, 0],
      [8, 2.2, 1], [18, 2.2, -1], [30, 7.3, -3], [40, 9, 3]
    ],
    stars: [[42, 16.0, 0]],
    enemies: [[10, 1.2, 0], [20, 1.2, 1], [30, 1.2, -1], [18, 6, 3], [28, 12.3, 1]],
    pipes: [[-3, 1, 4, 2.4], [46, 1, 4, 2.6]],
    trees: [[-2, 1, -4], [5, 1, 4], [22, 1, -4], [40, 1, -4]]
  },
  {
    name: 'Cool Cool Reef',
    sky: 0x38bdf8, fog: 0x7dd3fc, ground: 0x14b8a6, dirt: 0x0f766e, accent: 0x5eead4,
    spawn: [0, 2.2, 0], flag: [50, 1, 0], water: true,
    plats: [
      [-4, 0, 0, 12, 1, 10], [8, 0, 0, 8, 1, 8], [17, 0, 0, 8, 1, 8],
      [26, 0, 0, 8, 1, 8], [36, 0, 0, 9, 1, 9], [46, 0, 0, 10, 1, 10], [54, 0, 0, 10, 1, 10],
      [3, 1.8, 2, 3, 0.45, 3], [6, 3.5, 1, 3, 0.45, 3], [9, 5.2, 0, 3.2, 0.45, 3],
      [12, 6.9, -1, 3.2, 0.45, 3], [16, 8.5, 0, 3.4, 0.45, 3.2],
      [11, 2.2, -3.5, 3, 0.4, 2.8], [15, 3.9, -3.5, 3, 0.4, 2.8],
      [19, 5.6, -3, 3.2, 0.4, 2.8], [23, 7.3, -2, 3.2, 0.4, 2.8],
      [22, 8.5, 2, 3.4, 0.45, 3], [26, 10.1, 1, 3.4, 0.45, 3],
      [30, 11.7, 0, 3.4, 0.45, 3], [35, 10.1, -1, 3.4, 0.45, 3],
      [39, 11.7, 1, 3.4, 0.45, 3], [44, 13.2, 0, 3.8, 0.45, 3.2],
      [20, 2.6, 0, 5, 0.4, 2.2], [32, 4.0, 0, 5, 0.4, 2.2], [42, 5.5, 0, 4.5, 0.4, 2.2],
      [44, 14.8, 0, 3, 0.4, 3]
    ],
    movers: [
      { x: 28, y: 6.5, z: -4, w: 3, h: 0.4, d: 2.4, amp: 2.5, axis: 'x', speed: 1.0 },
      { x: 40, y: 8.5, z: 3, w: 2.8, h: 0.4, d: 2.4, amp: 2.0, axis: 'z', speed: 1.2 }
    ],
    qblocks: [[6, 5.3, 1], [16, 10.3, 0], [26, 11.9, 1], [39, 13.5, 1], [44, 16.6, 0]],
    coins: [
      [3, 3.6, 2], [6, 5.3, 1], [9, 7, 0], [12, 8.7, -1], [16, 10.3, 0],
      [11, 4, -3.5], [15, 5.7, -3.5], [19, 7.4, -3], [23, 9.1, -2],
      [22, 10.3, 2], [26, 11.9, 1], [30, 13.5, 0], [35, 11.9, -1], [39, 13.5, 1],
      [44, 15, 0], [44, 16.6, 0], [21, 4.4, 0], [33, 5.8, 0], [48, 2.2, 0],
      [10, 2.2, 0], [28, 2.2, 1], [42, 7.3, 0]
    ],
    stars: [[44, 16.2, 0]],
    enemies: [[9, 1.2, 0], [19, 1.2, -1], [29, 1.2, 1], [39, 1.2, 0], [23, 8.1, -2], [30, 12.5, 0]],
    pipes: [[-2, 1, -3.5, 2.2], [52, 1, 3.5, 2.5]],
    trees: [[1, 1, 4], [14, 1, 4], [34, 1, -4], [48, 1, -4]]
  },
  {
    name: 'Lethal Lava Ledger',
    sky: 0xfb923c, fog: 0xfdba74, ground: 0xea580c, dirt: 0x7c2d12, accent: 0xfbbf24,
    spawn: [0, 2.2, 0], flag: [54, 1, 0], lava: true,
    plats: [
      [-4, 0, 0, 10, 1, 9], [7, 0, 0, 6, 1, 6], [15, 0, 0, 6, 1, 6],
      [23, 0, 0, 7, 1, 7], [32, 0, 0, 7, 1, 7], [42, 0, 0, 8, 1, 8], [52, 0, 0, 12, 1, 11],
      [3, 1.8, 1, 2.8, 0.45, 2.8], [6, 3.5, 0, 2.8, 0.45, 2.8], [9, 5.2, -1, 2.8, 0.45, 2.8],
      [12, 6.9, 0, 3, 0.45, 3], [16, 8.5, 1, 3, 0.45, 3],
      [10, 2.2, -3, 2.8, 0.4, 2.6], [14, 3.9, -3, 2.8, 0.4, 2.6],
      [18, 5.6, -2.5, 3, 0.4, 2.6], [22, 7.3, -1.5, 3, 0.4, 2.6],
      [21, 8.5, 2, 3, 0.45, 2.8], [25, 10.1, 1, 3, 0.45, 2.8],
      [29, 11.7, 0, 3.2, 0.45, 2.8], [34, 10.2, -1, 3.2, 0.45, 2.8],
      [38, 11.8, 1, 3.2, 0.45, 2.8], [43, 13.3, 0, 3.4, 0.45, 3],
      [48, 11.6, -1, 3.2, 0.45, 2.8], [19, 2.8, 0, 4, 0.4, 2],
      [30, 4.2, 0, 4, 0.4, 2], [40, 5.8, 0, 4, 0.4, 2],
      [43, 15.0, 0, 3, 0.4, 3]
    ],
    movers: [
      { x: 27, y: 6.0, z: 3.5, w: 2.8, h: 0.4, d: 2.2, amp: 2.2, axis: 'z', speed: 1.15 },
      { x: 36, y: 8.8, z: -3, w: 2.8, h: 0.4, d: 2.2, amp: 1.6, axis: 'y', speed: 1.0 }
    ],
    qblocks: [[6, 5.3, 0], [16, 10.3, 1], [25, 11.9, 1], [38, 13.6, 1], [43, 16.8, 0]],
    coins: [
      [3, 3.6, 1], [6, 5.3, 0], [9, 7, -1], [12, 8.7, 0], [16, 10.3, 1],
      [10, 4, -3], [14, 5.7, -3], [18, 7.4, -2.5], [22, 9.1, -1.5],
      [21, 10.3, 2], [25, 11.9, 1], [29, 13.5, 0], [34, 12, -1], [38, 13.6, 1],
      [43, 15.1, 0], [43, 16.8, 0], [48, 13.4, -1], [20, 4.6, 0], [31, 6, 0],
      [41, 7.6, 0], [50, 2.2, 0], [12, 2.2, 0], [28, 2.2, 1]
    ],
    stars: [[43, 16.4, 0]],
    enemies: [[8, 1.2, 0], [16, 1.2, 1], [26, 1.2, -1], [36, 1.2, 0], [22, 8.1, -1.5], [29, 12.5, 0], [43, 14.1, 0]],
    pipes: [[-2, 1, 3, 2.2], [52, 1, -3.5, 2.6]],
    trees: []
  },
  {
    name: 'Rainbow Ride Market',
    sky: 0x1e1b4b, fog: 0x312e81, ground: 0x818cf8, dirt: 0x4338ca, accent: 0xc4b5fd,
    spawn: [0, 2.2, 0], flag: [58, 1, 0], stars: true,
    plats: [
      [-4, 0, 0, 10, 1, 9], [6, 0, 0, 6, 1, 6], [14, 0, 0, 6, 1, 6],
      [22, 0, 0, 6, 1, 6], [30, 0, 0, 7, 1, 7], [39, 0, 0, 7, 1, 7],
      [48, 0, 0, 8, 1, 8], [58, 0, 0, 12, 1, 11],
      [2.5, 1.8, 1, 2.6, 0.45, 2.6], [5.5, 3.5, 0, 2.6, 0.45, 2.6],
      [8.5, 5.2, -1, 2.8, 0.45, 2.8], [12, 6.9, 0, 3, 0.45, 3],
      [16, 8.5, 1, 3, 0.45, 3],
      [10, 2.2, -3.2, 2.6, 0.4, 2.5], [14, 3.9, -3.2, 2.6, 0.4, 2.5],
      [18, 5.6, -2.5, 2.8, 0.4, 2.5], [22, 7.3, -1.5, 2.8, 0.4, 2.5],
      [21, 8.5, 2.2, 3, 0.45, 2.8], [25, 10.1, 1.2, 3, 0.45, 2.8],
      [29, 11.7, 0, 3.2, 0.45, 2.8], [34, 10.2, -1, 3.2, 0.45, 2.8],
      [38, 11.8, 1, 3.2, 0.45, 2.8], [43, 13.3, 0, 3.4, 0.45, 3],
      [48, 11.8, -1, 3.2, 0.45, 2.8], [53, 13.3, 1, 3.4, 0.45, 3],
      [18, 2.8, 0, 3.6, 0.4, 2], [28, 4.0, 0, 3.6, 0.4, 2],
      [38, 5.4, 0, 3.6, 0.4, 2], [48, 6.8, 0, 3.6, 0.4, 2],
      [53, 14.9, 1, 3, 0.4, 3]
    ],
    movers: [
      { x: 32, y: 7.5, z: 3.5, w: 2.8, h: 0.4, d: 2.2, amp: 2.4, axis: 'z', speed: 1.05 },
      { x: 44, y: 9.5, z: -3, w: 2.8, h: 0.4, d: 2.2, amp: 2.0, axis: 'x', speed: 1.1 },
      { x: 50, y: 10.5, z: 0, w: 2.6, h: 0.4, d: 2.2, amp: 1.8, axis: 'y', speed: 0.95 }
    ],
    qblocks: [[5.5, 5.3, 0], [16, 10.3, 1], [25, 11.9, 1.2], [38, 13.6, 1], [53, 16.7, 1]],
    coins: [
      [2.5, 3.6, 1], [5.5, 5.3, 0], [8.5, 7, -1], [12, 8.7, 0], [16, 10.3, 1],
      [10, 4, -3.2], [14, 5.7, -3.2], [18, 7.4, -2.5], [22, 9.1, -1.5],
      [21, 10.3, 2.2], [25, 11.9, 1.2], [29, 13.5, 0], [34, 12, -1], [38, 13.6, 1],
      [43, 15.1, 0], [48, 13.6, -1], [53, 15.1, 1], [53, 16.7, 1],
      [19, 4.6, 0], [29, 5.8, 0], [39, 7.2, 0], [49, 8.6, 0],
      [56, 2.2, 0], [12, 2.2, 0], [26, 2.2, 1], [44, 2.2, -1]
    ],
    stars: [[53, 16.3, 1]],
    enemies: [[7, 1.2, 0], [15, 1.2, 1], [25, 1.2, -1], [35, 1.2, 0], [45, 1.2, 1], [22, 8.1, -1.5], [29, 12.5, 0], [43, 14.1, 0]],
    pipes: [[-2, 1, -3, 2.2], [56, 1, 3.5, 2.8]],
    trees: [[2, 1, 3.5], [20, 1, -3.5], [40, 1, 3.5]]
  }
];

// ── State ────────────────────────────────────────────────
let state = 'entry';
let score = 0, lives = 3, coins = 0, level = 1, starsGot = 0;
let personalBest = 0, beatBest = false, submitted = false;
let toastT = 0, checkpoint = null, clearLock = false;

let renderer, scene, camera, clock;
let rt, rtScene, rtCam, quad;
let worldGroup, playerMesh, shadowMesh, skyDome;
let plats = [], movers = [], coins3 = [], enemies = [], qblocks = [], pipes = [], powerStars = [];
let fx = [], flagMesh, waterMesh, lavaMesh;
let player, camYaw = 0, camPitch = 0.32, course = null, courseT = 0;
let jumpCount = 0, wasJump = false;

function refreshBestLine() {
  const el = document.getElementById('bestLine');
  if (!el || !window.SolarioLB) return;
  const me = SolarioLB.getUsername() || username;
  const pb = me ? SolarioLB.getPersonalBest(me) : 0;
  const top = SolarioLB.getTop(1)[0];
  if (pb > 0) el.textContent = `YOUR BEST · ${SolarioLB.formatScore(pb)}`;
  else if (top) el.textContent = `BOARD LEADER · ${top.name} ${SolarioLB.formatScore(top.score)}`;
  else el.textContent = '';
}
refreshBestLine();

function hud() {
  document.getElementById('hScore').textContent = score.toLocaleString();
  document.getElementById('hLives').textContent = String(Math.max(0, lives));
  document.getElementById('hCoins').textContent = String(coins);
  document.getElementById('hLevel').textContent = String(level);
  document.getElementById('hName').textContent = username || '---';
  if (course) document.getElementById('hWorld').textContent = course.name;
  const hs = document.getElementById('hStars');
  if (hs) hs.textContent = String(starsGot);
}
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.style.opacity = '1';
  toastT = 1.6;
}
function addScore(n) {
  if (!n) return;
  score += n;
  if (!beatBest && personalBest > 0 && score > personalBest) {
    beatBest = true; toast('NEW PERSONAL BEST'); sfx.power();
  }
  hud();
}

function spawnFx(x, y, z, color, n = 8) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.12),
      new THREE.MeshBasicMaterial({ color })
    );
    m.position.set(x, y, z);
    worldGroup.add(m);
    fx.push({
      mesh: m, life: 0.45 + Math.random() * 0.25,
      vx: (Math.random() - 0.5) * 6, vy: 3 + Math.random() * 5, vz: (Math.random() - 0.5) * 6
    });
  }
}

// ── Low-poly builders ────────────────────────────────────
function mat(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });
}
function boxMesh(w, h, d, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function makeSolario() {
  const g = new THREE.Group();
  const body = boxMesh(0.72, 0.58, 0.48, 0xfacc15);
  body.position.y = 0.62; g.add(body);
  const overalls = boxMesh(0.74, 0.48, 0.5, 0x7c3aed);
  overalls.position.y = 0.32; g.add(overalls);
  const strapL = boxMesh(0.12, 0.35, 0.08, 0x7c3aed);
  strapL.position.set(-0.22, 0.72, 0.22); g.add(strapL);
  const strapR = boxMesh(0.12, 0.35, 0.08, 0x7c3aed);
  strapR.position.set(0.22, 0.72, 0.22); g.add(strapR);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), mat(0xfbbf24));
  head.position.y = 1.12; g.add(head);
  const nose = boxMesh(0.14, 0.12, 0.18, 0xf59e0b);
  nose.position.set(0, 1.05, 0.32); g.add(nose);
  const brim = boxMesh(0.9, 0.1, 0.9, 0x6d28d9);
  brim.position.y = 1.3; g.add(brim);
  const hat = boxMesh(0.52, 0.3, 0.52, 0x6d28d9);
  hat.position.y = 1.5; g.add(hat);
  const badge = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 6), mat(0x14F195));
  badge.position.set(0, 1.52, 0.3); g.add(badge);
  const must = boxMesh(0.38, 0.08, 0.12, 0x451a03);
  must.position.set(0, 1.0, 0.3); g.add(must);
  const armL = boxMesh(0.22, 0.45, 0.22, 0xfacc15);
  armL.position.set(-0.48, 0.7, 0); g.add(armL);
  const armR = boxMesh(0.22, 0.45, 0.22, 0xfacc15);
  armR.position.set(0.48, 0.7, 0); g.add(armR);
  const bootL = boxMesh(0.3, 0.2, 0.4, 0x78350f);
  bootL.position.set(-0.2, 0.1, 0.06); g.add(bootL);
  const bootR = boxMesh(0.3, 0.2, 0.4, 0x78350f);
  bootR.position.set(0.2, 0.1, 0.06); g.add(bootR);
  g.userData.armL = armL; g.userData.armR = armR;
  g.userData.bootL = bootL; g.userData.bootR = bootR;
  g.traverse((c) => { if (c.isMesh) c.castShadow = true; });
  return g;
}
function makeRuglet() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.48, 8, 6), mat(0x92400e));
  body.position.y = 0.42; g.add(body);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 5), mat(0xb45309));
  shell.position.set(0, 0.55, -0.1); g.add(shell);
  const eyeL = boxMesh(0.15, 0.17, 0.08, 0xffffff); eyeL.position.set(-0.16, 0.52, 0.4); g.add(eyeL);
  const eyeR = boxMesh(0.15, 0.17, 0.08, 0xffffff); eyeR.position.set(0.16, 0.52, 0.4); g.add(eyeR);
  const pupilL = boxMesh(0.07, 0.09, 0.05, 0x111111); pupilL.position.set(-0.16, 0.52, 0.44); g.add(pupilL);
  const pupilR = boxMesh(0.07, 0.09, 0.05, 0x111111); pupilR.position.set(0.16, 0.52, 0.44); g.add(pupilR);
  const footL = boxMesh(0.2, 0.12, 0.22, 0x78350f); footL.position.set(-0.22, 0.06, 0.15); g.add(footL);
  const footR = boxMesh(0.2, 0.12, 0.22, 0x78350f); footR.position.set(0.22, 0.06, 0.15); g.add(footR);
  return g;
}
function makeCoin() {
  const g = new THREE.Group();
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.1, 12), mat(0x9945FF));
  disk.rotation.x = Math.PI / 2; g.add(disk);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.06, 6, 14), mat(0x14F195));
  rim.rotation.x = Math.PI / 2; g.add(rim);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), mat(0xfde047));
  g.add(gem);
  return g;
}
function makePowerStar() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), mat(0xfde047));
  g.add(core);
  for (let i = 0; i < 4; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 5), mat(0xfbbf24));
    spike.position.y = 0.55;
    spike.rotation.z = (i / 4) * Math.PI * 2;
    spike.rotation.x = 0.4;
    g.add(spike);
  }
  g.userData.core = core;
  return g;
}
function makeQBlock() {
  const g = new THREE.Group();
  const b = boxMesh(1, 1, 1, 0xfacc15);
  g.add(b);
  for (const [sx, sy, sz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), mat(0xfff3a0));
    face.position.set(sx * 0.51, sy, sz * 0.51);
    if (sx) face.rotation.y = sx > 0 ? 0 : Math.PI;
    if (sz < 0) face.rotation.y = Math.PI;
    g.add(face);
  }
  return g;
}
function makePipe(h) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.78, h, 12), mat(0x22c55e));
  body.position.y = h / 2; body.castShadow = true; g.add(body);
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 0.98, 0.38, 12), mat(0x16a34a));
  lip.position.y = h; g.add(lip);
  const dark = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 12), mat(0x14532d));
  dark.position.y = h + 0.18; g.add(dark);
  return g;
}
function makeFlag() {
  const g = new THREE.Group();
  const pole = boxMesh(0.14, 7, 0.14, 0xd6d3d1);
  pole.position.y = 3.5; g.add(pole);
  const base = boxMesh(0.8, 0.25, 0.8, 0xa8a29e);
  base.position.y = 0.12; g.add(base);
  const cloth = boxMesh(1.6, 1.0, 0.08, 0xef4444);
  cloth.position.set(0.85, 6.0, 0); g.add(cloth);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat(0xfde047));
  ball.position.set(0, 7.1, 0); g.add(ball);
  g.userData.cloth = cloth; g.userData.star = ball;
  return g;
}
function makeTree() {
  const g = new THREE.Group();
  const trunk = boxMesh(0.35, 1.6, 0.35, 0x92400e);
  trunk.position.y = 0.8; g.add(trunk);
  const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.2, 6), mat(0x16a34a));
  leaf.position.y = 2.4; g.add(leaf);
  const leaf2 = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.6, 6), mat(0x22c55e));
  leaf2.position.y = 3.3; g.add(leaf2);
  return g;
}

// ── World build ──────────────────────────────────────────
function clearWorld() {
  if (worldGroup) {
    scene.remove(worldGroup);
    worldGroup.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }
  worldGroup = new THREE.Group();
  scene.add(worldGroup);
  plats = []; movers = []; coins3 = []; enemies = []; qblocks = []; pipes = [];
  powerStars = []; fx = []; flagMesh = null; waterMesh = null; lavaMesh = null;
}

function addPlatform(x, y, z, w, h, d, color, opts = {}) {
  const mesh = boxMesh(w, h, d, color);
  mesh.position.set(x, y, z);
  if (!opts.hidden) worldGroup.add(mesh);
  else mesh.visible = false;
  const half = new THREE.Vector3(w / 2, h / 2, d / 2);
  const p = {
    mesh, x, y, z, w, h, d,
    min: new THREE.Vector3(x - half.x, y - half.y, z - half.z),
    max: new THREE.Vector3(x + half.x, y + half.y, z + half.z),
    mover: opts.mover || null
  };
  plats.push(p);
  return p;
}

function syncPlatBounds(p) {
  p.min.set(p.x - p.w / 2, p.y - p.h / 2, p.z - p.d / 2);
  p.max.set(p.x + p.w / 2, p.y + p.h / 2, p.z + p.d / 2);
  if (p.mesh) p.mesh.position.set(p.x, p.y, p.z);
}

function buildCourse(n) {
  course = COURSES[(n - 1) % COURSES.length];
  clearWorld();
  courseT = 0;
  scene.background = new THREE.Color(course.sky);
  scene.fog = new THREE.Fog(course.fog, 22, 78);

  if (skyDome) scene.remove(skyDome);
  const skyGeo = new THREE.SphereGeometry(90, 16, 12);
  const skyMat = new THREE.MeshBasicMaterial({ color: course.sky, side: THREE.BackSide });
  skyDome = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyDome);

  if (course.stars) {
    for (let i = 0; i < 100; i++) {
      const s = boxMesh(0.12 + Math.random() * 0.1, 0.12, 0.12, 0xffffff);
      s.position.set((Math.random() - 0.5) * 90, 8 + Math.random() * 40, (Math.random() - 0.5) * 90);
      worldGroup.add(s);
    }
  } else {
    for (let i = 0; i < 10; i++) {
      const c = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(1.1 + j * 0.25, 6, 5), mat(0xffffff));
        p.position.set(j * 1.1 - 1.2, (j % 2) * 0.35, (j % 3) * 0.2);
        c.add(p);
      }
      c.position.set(i * 9 - 25, 12 + (i % 4) * 1.5, -20 - (i % 5) * 2.5);
      worldGroup.add(c);
    }
  }

  for (let i = 0; i < 7; i++) {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(5 + i * 0.8, 4 + i * 0.6, 6), mat(course.dirt));
    hill.position.set(i * 12 - 12, 1.2, -24);
    worldGroup.add(hill);
    if (!course.lava) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(2, 1.6, 6), mat(course.accent || 0xf8fafc));
      cap.position.set(i * 12 - 12, 3.6 + i * 0.25, -24);
      worldGroup.add(cap);
    }
  }

  for (const p of course.plats) {
    const [x, y, z, w, h, d] = p;
    const top = y + h / 2;
    addPlatform(x, y, z, w, h, d, course.dirt);
    const grass = boxMesh(w + 0.08, 0.2, d + 0.08, course.ground);
    grass.position.set(x, top + 0.08, z);
    worldGroup.add(grass);
    // edge trim for PS2 chunk read
    const edge = boxMesh(w + 0.12, 0.08, d + 0.12, course.accent || 0xffffff);
    edge.position.set(x, top + 0.18, z);
    worldGroup.add(edge);
  }

  for (const m of course.movers || []) {
    const body = addPlatform(m.x, m.y, m.z, m.w, m.h, m.d, 0xf59e0b);
    const cap = boxMesh(m.w + 0.05, 0.15, m.d + 0.05, 0xfde047);
    cap.position.set(m.x, m.y + m.h / 2 + 0.05, m.z);
    worldGroup.add(cap);
    body.mover = {
      ox: m.x, oy: m.y, oz: m.z, amp: m.amp, axis: m.axis, speed: m.speed, phase: Math.random() * 6,
      cap
    };
    movers.push(body);
  }

  for (const q of course.qblocks) {
    const [x, y, z] = q;
    const mesh = makeQBlock();
    mesh.position.set(x, y, z);
    worldGroup.add(mesh);
    qblocks.push({ mesh, x, y, z, hit: false, content: Math.random() > 0.45 ? 'coin' : 'shroom' });
    const solid = addPlatform(x, y, z, 1, 1, 1, 0xfacc15, { hidden: true });
    solid.qRef = qblocks[qblocks.length - 1];
  }

  for (const c of course.coins) {
    const [x, y, z] = c;
    const mesh = makeCoin();
    mesh.position.set(x, y, z);
    worldGroup.add(mesh);
    coins3.push({ mesh, x, y, z, taken: false, a: Math.random() * 6 });
  }

  for (const s of course.stars || []) {
    const [x, y, z] = s;
    const mesh = makePowerStar();
    mesh.position.set(x, y, z);
    worldGroup.add(mesh);
    powerStars.push({ mesh, x, y, z, taken: false, a: Math.random() * 6 });
  }

  for (const e of course.enemies) {
    const [x, y, z] = e;
    const mesh = makeRuglet();
    mesh.position.set(x, y, z);
    worldGroup.add(mesh);
    enemies.push({ mesh, x, y, z, baseX: x, vx: 1.9 * (Math.random() > 0.5 ? 1 : -1), alive: true, sq: 0 });
  }

  for (const p of course.pipes || []) {
    const [x, y, z, h] = p;
    const mesh = makePipe(h);
    mesh.position.set(x, y, z);
    worldGroup.add(mesh);
    pipes.push({ mesh, x, y, z, h });
    addPlatform(x, y + h / 2, z, 1.55, h, 1.55, 0x22c55e, { hidden: true });
  }

  for (const t of course.trees || []) {
    const [x, y, z] = t;
    const mesh = makeTree();
    mesh.position.set(x, y, z);
    worldGroup.add(mesh);
  }

  const [flagX, flagY, flagZ] = course.flag;
  flagMesh = makeFlag();
  flagMesh.position.set(flagX, flagY, flagZ);
  worldGroup.add(flagMesh);

  if (course.lava) {
    lavaMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 50),
      new THREE.MeshLambertMaterial({ color: 0xea580c, flatShading: true, emissive: 0x7c2d12, emissiveIntensity: 0.35 })
    );
    lavaMesh.rotation.x = -Math.PI / 2;
    lavaMesh.position.set(28, -0.35, 0);
    worldGroup.add(lavaMesh);
  }
  if (course.water) {
    waterMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 50),
      new THREE.MeshLambertMaterial({ color: 0x0ea5e9, flatShading: true, transparent: true, opacity: 0.72 })
    );
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.set(28, -0.2, 0);
    worldGroup.add(waterMesh);
  }

  player = {
    x: course.spawn[0], y: course.spawn[1], z: course.spawn[2],
    vx: 0, vy: 0, vz: 0,
    on: false, coy: 0, jbuf: 0, face: 0, inv: 1.2, pound: false, long: false
  };
  if (checkpoint) {
    player.x = checkpoint.x; player.y = checkpoint.y; player.z = checkpoint.z;
  }
  jumpCount = 0; wasJump = false;
  playerMesh = makeSolario();
  worldGroup.add(playerMesh);
  shadowMesh = new THREE.Mesh(
    new THREE.CircleGeometry(0.6, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38 })
  );
  shadowMesh.rotation.x = -Math.PI / 2;
  worldGroup.add(shadowMesh);

  camera.position.set(player.x - 8, player.y + 5, player.z + 10);
  camYaw = 0;
}

// ── Collision ────────────────────────────────────────────
function resolvePlayer(dt) {
  player.vy -= GRAV * dt;
  if (player.vy < -32) player.vy = -32;

  const ox = player.x, oz = player.z;
  player.x += player.vx * dt;
  player.z += player.vz * dt;
  collideXZ();

  player.y += player.vy * dt;
  player.on = false;
  collideY();

  // carry with movers
  for (const m of movers) {
    if (!m.mover || !player.on) continue;
    if (player.y >= m.max.y - 0.05 && player.y <= m.max.y + 0.2) {
      const nx = Math.max(m.min.x, Math.min(player.x, m.max.x));
      const nz = Math.max(m.min.z, Math.min(player.z, m.max.z));
      const dx = player.x - nx, dz = player.z - nz;
      if (dx * dx + dz * dz <= PLAYER_R * PLAYER_R) {
        player.x += m.x - (m._px ?? m.x);
        player.y = m.max.y;
        player.z += m.z - (m._pz ?? m.z);
      }
    }
  }

  if (player.y < -6) hurt(true);
  if (course.lava && player.y < 0.15 && player.on === false && player.y < 0.5) {
    // soft lava kill if below ground pads
    if (player.y < -0.1) hurt(true);
  }
  void ox; void oz;
}

function collideXZ() {
  const r = PLAYER_R;
  for (const p of plats) {
    const py0 = p.min.y, py1 = p.max.y;
    if (player.y + 0.15 >= py1 || player.y + PLAYER_H <= py0) continue;
    const nx = Math.max(p.min.x, Math.min(player.x, p.max.x));
    const nz = Math.max(p.min.z, Math.min(player.z, p.max.z));
    const dx = player.x - nx, dz = player.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 1e-8) {
      const d = Math.sqrt(d2);
      const push = (r - d) / d;
      player.x += dx * push;
      player.z += dz * push;
      const dot = player.vx * dx + player.vz * dz;
      if (dot < 0) {
        player.vx -= (dx / d) * dot;
        player.vz -= (dz / d) * dot;
      }
    }
  }
}

function collideY() {
  const r = PLAYER_R;
  const feet = player.y;
  const head = player.y + PLAYER_H;
  for (const p of plats) {
    const nx = Math.max(p.min.x, Math.min(player.x, p.max.x));
    const nz = Math.max(p.min.z, Math.min(player.z, p.max.z));
    const dx = player.x - nx, dz = player.z - nz;
    if (dx * dx + dz * dz > r * r) continue;

    if (player.vy <= 0 && feet <= p.max.y && feet >= p.max.y - Math.max(0.65, Math.abs(player.vy) * 0.05 + STEP_UP)) {
      player.y = p.max.y;
      player.vy = 0;
      player.on = true;
      player.pound = false;
      player.long = false;
      jumpCount = 0;
    } else if (player.vy > 0 && head >= p.min.y && head <= p.min.y + 0.55) {
      player.y = p.min.y - PLAYER_H;
      player.vy = 0;
      if (p.qRef && !p.qRef.hit) hitQ(p.qRef);
      else {
        for (const q of qblocks) {
          if (!q.hit && Math.abs(q.x - p.x) < 0.15 && Math.abs(q.y - p.y) < 0.15 && Math.abs(q.z - p.z) < 0.15) hitQ(q);
        }
      }
    }
  }
}

function hitQ(q) {
  q.hit = true;
  q.mesh.children[0].material.color.setHex(0x92714a);
  spawnFx(q.x, q.y + 0.6, q.z, 0xfde047, 10);
  if (q.content === 'coin') {
    coins++; addScore(50); sfx.coin(); toast('+50');
  } else {
    addScore(200); sfx.power(); toast('SUPER SOLARIO!');
    player.inv = 2.0;
  }
  hud();
}

// ── Game flow ────────────────────────────────────────────
function loadLevel() {
  clearLock = false;
  buildCourse(level);
  toastT = 0;
  toast(course.name.toUpperCase());
  progEl.classList.add('show');
  hud();
}

function startFromOverlay() {
  const input = unameEl();
  const raw = String((input && input.value) || '').trim();
  if (raw.length < 2) { if (input) input.focus(); toast('ENTER A USERNAME'); return; }
  const name = window.SolarioLB
    ? SolarioLB.setUsername(raw)
    : raw.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 12);
  if (!name || name.length < 2) { if (input) input.focus(); toast('ENTER A USERNAME'); return; }
  username = name;
  personalBest = window.SolarioLB ? SolarioLB.getPersonalBest(username) : 0;
  beatBest = false;
  score = 0; lives = 3; coins = 0; level = 1; starsGot = 0;
  checkpoint = null; submitted = false; clearLock = false;
  overlay.classList.add('hidden');
  pausePanel.classList.remove('show');
  logoMark.classList.add('dim');
  loadLevel();
  state = 'play';
  hud();
  clock.getDelta();
}

function showEntry() {
  state = 'entry';
  progEl.classList.remove('show');
  pausePanel.classList.remove('show');
  logoMark.classList.remove('dim');
  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <div class="logo">Super<br>Solario 64</div>
    <div class="sub">N64 / PS2 STYLE 3D PLATFORMER</div>
    <div class="blurb">Layered 3D courses · stomp ruglets · grab <b>Power Stars</b> · race the flag.<br>WASD move · <b>Q/E</b> camera · Space jump · Shift pound/long-jump.<br>Scores sync to the <b>global</b> board when online.</div>
    <div class="best" id="bestLine"></div>
    <input id="uname" maxlength="12" placeholder="USERNAME" autocomplete="off" spellcheck="false" value="${(username || '').replace(/"/g, '')}">
    <div class="row"><button class="btn" id="btnStart">PRESS START</button></div>
    <div class="hint">DOUBLE JUMP IN AIR · SHIFT+JUMP FOR LONG JUMP</div>`;
  refreshBestLine();
  document.getElementById('btnStart').onclick = startFromOverlay;
  const u = unameEl();
  if (u) {
    u.addEventListener('keydown', (e) => { if (e.key === 'Enter') startFromOverlay(); });
    u.focus();
  }
}

function submitToBoard(force) {
  if (!force && submitted) return null;
  if (score <= 0 || !username) return null;
  submitted = true;
  if (!window.SolarioLB) return null;
  const res = SolarioLB.submitScore({ name: username, score, coins, level });
  if (res && typeof res.then === 'function') {
    res.then((r) => { if (r && r.ok) toast(r.remote ? `GLOBAL #${r.rank}` : (r.improved ? `BOARD #${r.rank}` : 'BEST KEPT')); });
    return res;
  }
  if (res && res.ok) toast(res.improved ? `BOARD #${res.rank}` : 'BEST KEPT');
  return res;
}

async function doShare(rank) {
  if (!window.SolarioLB) return;
  const res = await SolarioLB.shareScore({ name: username, score, coins, level, rank });
  if (res.ok) toast(res.method === 'share' ? 'SHARED' : 'COPIED');
}

function gameOver() {
  state = 'over';
  progEl.classList.remove('show');
  pausePanel.classList.remove('show');
  logoMark.classList.remove('dim');
  const resP = submitToBoard(true);
  const finish = (res) => {
    const rank = res && res.rank ? res.rank : (window.SolarioLB ? SolarioLB.getRank(username) : 0);
    overlay.classList.remove('hidden');
    overlay.innerHTML = `
      <div class="logo" style="font-size:clamp(28px,7vw,44px)">REKT</div>
      <div class="sub">COURSE FAILED</div>
      <div class="blurb"><b>${username}</b> scored <b>${score.toLocaleString()}</b><br>${coins} SOL · ★ ${starsGot} · Course ${level}${rank ? ` · Rank #${rank}` : ''}${beatBest ? '<br><span style="color:#14F195">NEW PERSONAL BEST</span>' : ''}</div>
      <div class="row">
        <button class="btn" id="btnRetry">RETRY</button>
        <button class="btn ghost" id="btnShare">SHARE</button>
      </div>`;
    document.getElementById('btnRetry').onclick = () => showEntry();
    document.getElementById('btnShare').onclick = () => doShare(rank);
  };
  if (resP && typeof resP.then === 'function') resP.then(finish); else finish(resP);
}

function levelClearUI() {
  state = 'clear';
  pausePanel.classList.remove('show');
  logoMark.classList.remove('dim');
  const resP = submitToBoard(true);
  submitted = false;
  const finish = (res) => {
    const rank = res && res.rank ? res.rank : (window.SolarioLB ? SolarioLB.getRank(username) : 0);
    const next = COURSES[level % COURSES.length];
    overlay.classList.remove('hidden');
    overlay.innerHTML = `
      <div class="logo" style="font-size:clamp(24px,6vw,40px)">COURSE ${level}<br>CLEAR!</div>
      <div class="sub">+${(1500 * level).toLocaleString()} · ★ ${starsGot}</div>
      <div class="blurb">Total <b>${score.toLocaleString()}</b> · Next: ${next.name}${rank ? ` · Rank #${rank}` : ''}</div>
      <div class="row">
        <button class="btn" id="btnNext">NEXT COURSE</button>
        <button class="btn ghost" id="btnShare">SHARE</button>
      </div>`;
    document.getElementById('btnNext').onclick = nextLevel;
    document.getElementById('btnShare').onclick = () => doShare(rank);
  };
  if (resP && typeof resP.then === 'function') resP.then(finish); else finish(resP);
}

function nextLevel() {
  level++;
  checkpoint = null;
  overlay.classList.add('hidden');
  logoMark.classList.add('dim');
  loadLevel();
  state = 'play';
  submitted = false;
}

function togglePause() {
  if (state === 'play') {
    state = 'pause';
    pausePanel.classList.add('show');
  } else if (state === 'pause') {
    state = 'play';
    pausePanel.classList.remove('show');
    clock.getDelta();
  }
}

function hurt(fell = false) {
  if (player.inv > 0 && !fell) return;
  sfx.hurt();
  if (!fell && player.inv <= 0) {
    player.inv = 1.4;
    player.vy = 9;
    player.vx *= -0.55; player.vz *= -0.55;
    toast('OUCH!');
    return;
  }
  lives--; hud();
  sfx.die();
  state = 'dead';
  if (lives <= 0) setTimeout(gameOver, 700);
  else setTimeout(() => { loadLevel(); state = 'play'; }, 800);
}

// ── Update ───────────────────────────────────────────────
function updateMovers(dt) {
  courseT += dt;
  for (const m of movers) {
    const mv = m.mover;
    if (!mv) continue;
    m._px = m.x; m._py = m.y; m._pz = m.z;
    const wave = Math.sin(courseT * mv.speed + mv.phase) * mv.amp;
    if (mv.axis === 'x') m.x = mv.ox + wave;
    else if (mv.axis === 'y') m.y = mv.oy + wave;
    else m.z = mv.oz + wave;
    syncPlatBounds(m);
    if (mv.cap) mv.cap.position.set(m.x, m.y + m.h / 2 + 0.05, m.z);
  }
}

function update(dt) {
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.style.opacity = '0'; }
  if (state !== 'play') {
    // still animate title world lightly
    if (state === 'entry' && worldGroup) {
      courseT += dt;
      if (flagMesh && flagMesh.userData.star) flagMesh.userData.star.rotation.y += dt * 1.5;
    }
    return;
  }

  if (player.inv > 0) player.inv -= dt;
  updateMovers(dt);

  // camera orbit
  if (camL()) camYaw += 1.8 * dt;
  if (camR()) camYaw -= 1.8 * dt;

  const camDir = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
  const camRight = new THREE.Vector3(camDir.z, 0, -camDir.x);
  let ix = 0, iz = 0;
  if (forward()) { ix += camDir.x; iz += camDir.z; }
  if (back()) { ix -= camDir.x; iz -= camDir.z; }
  if (left()) { ix -= camRight.x; iz -= camRight.z; }
  if (right()) { ix += camRight.x; iz += camRight.z; }
  const len = Math.hypot(ix, iz);
  if (len > 0) { ix /= len; iz /= len; }

  const acc = player.on ? MOVE_ACC : AIR_ACC;
  const maxSp = player.long ? LONGJUMP_H : MOVE_MAX;
  if (len > 0) {
    player.vx += ix * acc * dt;
    player.vz += iz * acc * dt;
    const sp = Math.hypot(player.vx, player.vz);
    if (sp > maxSp) {
      player.vx = (player.vx / sp) * maxSp;
      player.vz = (player.vz / sp) * maxSp;
    }
    player.face = Math.atan2(ix, iz);
  } else if (player.on && !player.long) {
    const sp = Math.hypot(player.vx, player.vz);
    if (sp > 0) {
      const dec = Math.min(sp, FRICTION * dt);
      player.vx -= (player.vx / sp) * dec;
      player.vz -= (player.vz / sp) * dec;
    }
  }

  if (len > 0.1) {
    const diff = ((player.face - camYaw + Math.PI) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    camYaw += diff * 0.04;
  }

  if (player.on) player.coy = COYOTE; else player.coy = Math.max(0, player.coy - dt);
  const jumpDown = jumpHeld() && !wasJump;
  wasJump = jumpHeld();
  if (jumpHeld()) player.jbuf = JUMP_BUF; else player.jbuf = Math.max(0, player.jbuf - dt);

  // long jump: shift + jump while running on ground
  const speed = Math.hypot(player.vx, player.vz);
  if (player.jbuf > 0 && player.coy > 0 && !player.pound) {
    if (poundHeld() && speed > 6) {
      player.vy = LONGJUMP_V;
      const f = player.face;
      player.vx = Math.sin(f) * LONGJUMP_H;
      player.vz = Math.cos(f) * LONGJUMP_H;
      player.long = true;
      player.on = false; player.jbuf = 0; player.coy = 0;
      jumpCount = 2;
      sfx.ljump();
    } else {
      player.vy = JUMP_V;
      player.on = false; player.jbuf = 0; player.coy = 0;
      jumpCount = 1;
      sfx.jump();
    }
  } else if (jumpDown && !player.on && jumpCount === 1 && !player.pound && !player.long) {
    player.vy = JUMP2_V;
    jumpCount = 2;
    sfx.djump();
    spawnFx(player.x, player.y + 0.2, player.z, 0xffffff, 5);
  }

  if (!jumpHeld() && player.vy > 2 && !player.long) player.vy *= Math.pow(JUMP_CUT, dt * 8);

  if (poundHeld() && !player.on && !player.pound && !player.long && player.vy < 5) {
    player.pound = true; player.vy = -30; sfx.pound();
  }

  resolvePlayer(dt);

  // coins
  for (const c of coins3) {
    if (c.taken) continue;
    c.a += dt * 3.2;
    c.mesh.rotation.y = c.a;
    c.mesh.position.y = c.y + Math.sin(c.a * 2) * 0.18;
    const dx = player.x - c.x, dy = (player.y + 0.7) - c.mesh.position.y, dz = player.z - c.z;
    if (dx * dx + dy * dy + dz * dz < 1.15) {
      c.taken = true; c.mesh.visible = false;
      coins++; addScore(10); sfx.coin();
      spawnFx(c.x, c.mesh.position.y, c.z, 0x9945FF, 6);
      if (coins % 100 === 0) { lives++; toast('1-UP!'); hud(); }
    }
  }

  // power stars
  for (const s of powerStars) {
    if (s.taken) continue;
    s.a += dt * 2;
    s.mesh.rotation.y = s.a;
    s.mesh.position.y = s.y + Math.sin(s.a * 2.5) * 0.25;
    if (s.mesh.userData.core) s.mesh.userData.core.rotation.x = s.a * 0.7;
    const dx = player.x - s.x, dy = (player.y + 0.8) - s.mesh.position.y, dz = player.z - s.z;
    if (dx * dx + dy * dy + dz * dz < 1.6) {
      s.taken = true; s.mesh.visible = false;
      starsGot++; addScore(1000); sfx.star(); toast('POWER STAR!');
      spawnFx(s.x, s.mesh.position.y, s.z, 0xfde047, 16);
      hud();
    }
  }

  // enemies
  for (const e of enemies) {
    if (!e.alive) {
      if (e.sq > 0) { e.sq -= dt; e.mesh.scale.set(1.2, 0.22, 1.2); }
      else e.mesh.visible = false;
      continue;
    }
    e.x += e.vx * dt;
    if (Math.abs(e.x - e.baseX) > 3.2) e.vx *= -1;
    e.mesh.position.set(e.x, e.y + Math.abs(Math.sin(courseT * 8 + e.x)) * 0.05, e.z);
    e.mesh.rotation.y = e.vx > 0 ? 0.35 : -0.35;
    const dx = player.x - e.x, dy = player.y - e.y, dz = player.z - e.z;
    if (dx * dx + dz * dz < 0.9 && dy > -0.25 && dy < 1.7) {
      if (player.vy < -1 || player.pound) {
        e.alive = false; e.sq = 0.7;
        player.vy = 11; player.pound = false;
        addScore(200); sfx.stomp(); toast('+200');
        spawnFx(e.x, e.y + 0.4, e.z, 0x92400e, 8);
      } else if (player.inv <= 0) hurt();
    }
  }

  // flag clear
  if (flagMesh && !clearLock) {
    const fx = flagMesh.position.x, fz = flagMesh.position.z;
    const dx = player.x - fx, dz = player.z - fz;
    if (dx * dx + dz * dz < 1.8 && player.y < 8 && player.y > 0.5) {
      clearLock = true;
      addScore(1500 * level);
      sfx.win(); toast('COURSE CLEAR!');
      state = 'clear';
      spawnFx(fx, player.y + 1, fz, 0xef4444, 14);
      setTimeout(levelClearUI, 550);
    }
    if (flagMesh.userData.cloth) flagMesh.userData.cloth.rotation.y = Math.sin(performance.now() * 0.005) * 0.28;
    if (flagMesh.userData.star) flagMesh.userData.star.rotation.y += dt * 2.2;
  }

  if (!checkpoint && player.x > 22) {
    checkpoint = { x: player.x, y: Math.max(player.y, 2), z: player.z };
    toast('CHECKPOINT'); sfx.power();
  }

  const goalX = course.flag[0];
  progFill.style.width = (Math.max(0, Math.min(1, player.x / Math.max(1, goalX))) * 100).toFixed(1) + '%';

  // player mesh
  playerMesh.position.set(player.x, player.y, player.z);
  playerMesh.rotation.y = player.face;
  playerMesh.visible = !(player.inv > 0 && Math.floor(player.inv * 14) % 2 === 0);
  const spd = Math.hypot(player.vx, player.vz);
  if (player.on && spd > 1.2) {
    const swing = Math.sin(performance.now() * 0.018) * 0.45;
    if (playerMesh.userData.armL) {
      playerMesh.userData.armL.rotation.x = swing;
      playerMesh.userData.armR.rotation.x = -swing;
      playerMesh.userData.bootL.position.z = 0.06 + swing * 0.15;
      playerMesh.userData.bootR.position.z = 0.06 - swing * 0.15;
    }
    playerMesh.position.y += Math.abs(Math.sin(performance.now() * 0.02)) * 0.06;
  } else if (playerMesh.userData.armL) {
    playerMesh.userData.armL.rotation.x *= 0.8;
    playerMesh.userData.armR.rotation.x *= 0.8;
  }
  if (player.pound) playerMesh.scale.set(1.15, 0.55, 1.15);
  else if (player.long) playerMesh.scale.set(1.25, 0.75, 0.9);
  else playerMesh.scale.set(1, 1, 1);

  shadowMesh.position.set(player.x, player.y + 0.03, player.z);
  shadowMesh.scale.setScalar(player.on ? 1 : 0.7);

  // fx
  for (let i = fx.length - 1; i >= 0; i--) {
    const p = fx[i];
    p.life -= dt;
    p.vy -= 18 * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.mesh.rotation.x += dt * 8;
    p.mesh.scale.setScalar(Math.max(0.01, p.life * 2));
    if (p.life <= 0) {
      worldGroup.remove(p.mesh);
      if (p.mesh.geometry) p.mesh.geometry.dispose();
      if (p.mesh.material) p.mesh.material.dispose();
      fx.splice(i, 1);
    }
  }

  if (waterMesh) {
    waterMesh.position.y = -0.2 + Math.sin(courseT * 1.4) * 0.06;
    waterMesh.material.opacity = 0.65 + Math.sin(courseT * 2) * 0.08;
  }
  if (lavaMesh) {
    lavaMesh.material.emissiveIntensity = 0.25 + Math.sin(courseT * 3) * 0.15;
    lavaMesh.position.y = -0.35 + Math.sin(courseT * 2.2) * 0.04;
  }

  // Mario 64 camera lag
  const dist = 10;
  const height = 4.6;
  const tx = player.x - Math.sin(camYaw) * dist * Math.cos(camPitch);
  const tz = player.z - Math.cos(camYaw) * dist * Math.cos(camPitch);
  const ty = player.y + height + Math.sin(camPitch) * 2;
  const lerp = Math.min(1, 5 * dt);
  camera.position.x += (tx - camera.position.x) * lerp;
  camera.position.y += (ty - camera.position.y) * Math.min(1, 3.5 * dt);
  camera.position.z += (tz - camera.position.z) * lerp;
  camera.lookAt(player.x, player.y + 1.35, player.z);
}

// ── Render (chunky N64/PS2 upsample) ─────────────────────
function initRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.outputEncoding = THREE.LinearEncoding;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 140);

  const hemi = new THREE.HemisphereLight(0xb1e1ff, 0x5a4630, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1c1, 0.95);
  sun.position.set(18, 32, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(512, 512);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  sun.shadow.camera.left = -35;
  sun.shadow.camera.right = 35;
  sun.shadow.camera.top = 35;
  sun.shadow.camera.bottom = -35;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x94a3b8, 0.25);
  fill.position.set(-12, 10, -8);
  scene.add(fill);

  rt = new THREE.WebGLRenderTarget(400, 225, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true
  });

  clock = new THREE.Clock();
  resize();
  window.addEventListener('resize', resize);
}

function resize() {
  const stage = document.getElementById('stage');
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  const iw = 400, ih = Math.max(180, Math.round(400 * (h / Math.max(1, w))));
  rt.setSize(iw, ih);
}

function render() {
  // mild PS2 wobble — nudge camera sub-pixel before low-res pass
  const wobX = camera.position.x;
  const wobY = camera.position.y;
  camera.position.x += (Math.sin(performance.now() * 0.04) * 0.012);
  camera.position.y += (Math.cos(performance.now() * 0.033) * 0.008);
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  camera.position.x = wobX;
  camera.position.y = wobY;

  if (!quad) {
    const geo = new THREE.PlaneGeometry(2, 2);
    const matQ = new THREE.MeshBasicMaterial({ map: rt.texture });
    quad = new THREE.Mesh(geo, matQ);
    rtScene = new THREE.Scene();
    rtCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    rtScene.add(quad);
  }
  quad.material.map = rt.texture;
  renderer.render(rtScene, rtCam);
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (state === 'play' || state === 'dead' || state === 'entry') update(dt);
  if (worldGroup) render();
  else {
    renderer.setClearColor(0x5eb8ff, 1);
    renderer.clear();
  }
}

function boot() {
  initRenderer();
  buildCourse(1);
  camera.position.set(-6, 9, 14);
  camera.lookAt(10, 3, 0);
  const btn = document.getElementById('btnStart');
  if (btn) btn.onclick = startFromOverlay;
  const u = unameEl();
  if (u) u.addEventListener('keydown', (e) => { if (e.key === 'Enter') startFromOverlay(); });
  hud();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'play') togglePause();
  });
  clock.start();
  loop();
}

window.__SOLARIO_GAME__ = {
  get state() { return state; },
  get score() { return score; },
  get coins() { return coins; },
  get level() { return level; },
  get lives() { return lives; },
  get username() { return username; },
  get stars() { return starsGot; },
  get playerX() { return player ? player.x : 0; },
  get playerY() { return player ? player.y : 0; },
  startFromOverlay,
  togglePause,
  submitToBoard,
  loadLevel
};

try {
  if (/(?:^|[?&])debug=1(?:&|$)/.test(location.search)) {
    window.__SOLARIO_GAME__.__debugSetLevel = (n) => {
      level = Math.max(1, Math.round(Number(n) || 1));
      checkpoint = null;
      loadLevel();
      state = 'play';
      overlay.classList.add('hidden');
      pausePanel.classList.remove('show');
      logoMark.classList.add('dim');
      hud();
    };
    window.__SOLARIO_GAME__.__debugJumpHeight = () => RISE;
    window.__SOLARIO_GAME__.__debugLevelReachable = () => {
      if (!course) return { ok: false };
      const rise = RISE;
      const nodes = course.plats.map((p, i) => ({ i, x: p[0], y: p[1] + p[4] / 2, z: p[2] }));
      const spawnY = course.spawn[1];
      const reach = new Set();
      const q = [];
      nodes.forEach((n) => {
        if (n.y <= spawnY + rise + 0.5) { reach.add(n.i); q.push(n); }
      });
      for (let i = 0; i < q.length; i++) {
        const cur = q[i];
        nodes.forEach((n) => {
          if (reach.has(n.i)) return;
          const dy = n.y - cur.y;
          const dist = Math.hypot(n.x - cur.x, n.z - cur.z);
          if (dy <= rise + 0.4 && dist < 7.5) { reach.add(n.i); q.push(n); }
          else if (dy < 0 && dist < 10) { reach.add(n.i); q.push(n); }
        });
      }
      // movers count as bridges
      (course.movers || []).forEach((m) => {
        nodes.forEach((n) => {
          if (reach.has(n.i)) return;
          const dist = Math.hypot(n.x - m.x, n.z - m.z);
          const dy = n.y - m.y;
          if (dist < 8 && dy <= rise + 1.5) { reach.add(n.i); q.push(n); }
        });
      });
      const coinOk = course.coins.every((c) =>
        nodes.some((n) => reach.has(n.i) && Math.hypot(n.x - c[0], n.z - c[2]) < 5.5 && c[1] - n.y < rise + 1.2)
      );
      const starOk = (course.stars || []).every((s) =>
        nodes.some((n) => reach.has(n.i) && Math.hypot(n.x - s[0], n.z - s[2]) < 5 && s[1] - n.y < rise + 1.5)
      );
      return {
        ok: reach.size >= Math.floor(nodes.length * 0.85) && coinOk && starOk,
        platsReached: reach.size,
        platCount: nodes.length,
        coinOk,
        starOk,
        rise
      };
    };
  }
} catch (e) {}

boot();
})();
