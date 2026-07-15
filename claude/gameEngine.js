import { signInAnon, createUser, saveGameLog, savePartialLog, updateHonestyCheck, updateUserField, appendUserArrayField, getUserGameLogs, markSessionComplete, getLeaderboardScores } from './dataHandler.js';

// ════════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════════

const SKIP_ENABLE_SECONDS = 30;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const COLORS_CYCLE = ['Red', 'Blue', 'Green', 'Yellow', 'Purple'];
const COLOR_HEX = { Red:'#CC3311', Blue:'#0077BB', Green:'#009988', Yellow:'#eab308', Purple:'#a855f7', Orange:'#f97316' };
const ROTATION_OPTIONS = [0, 45, 90, 135, 180, 225, 270, 315];

const PUZZLE_BANK = [
  { id:'puzzle_01', type:'number_sequence', sequence:[2,3,10,26,72], answer:196 },
  { id:'puzzle_02', type:'alphabet_wheel' },
  { id:'puzzle_03', type:'shape_sequence', answer:{ sides:8, color:'Red', rotation:225 } },
  { id:'puzzle_04', type:'hybrid',
    shapeSeq:[
      { label:'Triangle', sides:3, value:2 },
      { label:'Square',   sides:4, value:6 },
      { label:'Pentagon', sides:5, value:27 },
      { label:'Hexagon',  sides:6, value:null }
    ], answer:158 },
  { id:'puzzle_05', type:'tile_sequence', sequence:[2,5,13,34], answer:89 }
];

const SURVEY_QUESTIONS = [
  { id:'age', label:'How old are you?', type:'number', min:13, max:99 },
  { id:'gender', label:'What is your gender?', type:'cards',
    options:['Male', 'Female', 'Non-binary', 'Other'] },
  { id:'educationLevel', label:'What is your highest level of education?', type:'cards',
    options:['Still in high school','High school diploma or GED','Vocational or trade school','Some college (no degree)','Associate\'s degree','Bachelor\'s degree','Master\'s degree','PhD or doctoral degree','Prefer not to say'] },
  { id:'quantitativeExposure', label:'How often do you work with numbers, statistics, or logic?', type:'likert', min:1, max:5, lo:'Never', hi:'All the time' },
  { id:'energyLevel', label:'How would you rate your energy level right now?', type:'likert', min:1, max:5, lo:'Exhausted', hi:'Fully energized' },
  { id:'puzzleFrequency', label:'How often do you play logic or puzzle games?', type:'cards',
    options:['Never','A few times a year','Monthly','Weekly','Daily'] },
  { id:'puzzleSkill', label:'How skilled do you feel at logic puzzles?', type:'likert', min:1, max:5, lo:'Total beginner', hi:'Expert' },
  { id:'puzzleEnjoyment', label:'How much do you enjoy logic puzzles?', type:'likert', min:1, max:5, lo:'Hate them', hi:'Love them' }
];

// ════════════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════════════

const S = {
  userId: null,
  treatment: null,
  surveyAnswers: {},
  surveyPage: 0,
  puzzleOrder: [],          // shuffled puzzle ids
  currentRound: 0,         // 0-based index
  completedLogs: [],        // saved round log objects for scoring
  ipAddress: null,
  isReplay: false,          // true if this browser has completed a session before
  sessionTimestamp: null,   // ISO timestamp of first session start (user-level)
  resumeRound: null,        // round index at which a multi-session resume happened
  // per-round (reset each round)
  r: null,
};

function resetSession() {
  // Clear sessionStorage so signInAnon() issues a fresh local userId
  sessionStorage.removeItem('localUserId');
  S.userId = null;
  S.treatment = null;
  S.surveyAnswers = {};
  S.surveyPage = 0;
  S.puzzleOrder = [];
  S.currentRound = 0;
  S.completedLogs = [];
  S.ipAddress = null;
  S.isReplay = false;
  S.sessionTimestamp = null;
  S.resumeRound = null;
  S.r = null;
}

function makeRound(puzzleId) {
  return {
    puzzleId,
    timeEngaged: 0,
    _timerInterval: null,
    _timerPaused: false,
    _timerLastStart: null,
    attemptCount: 0,
    firstAnswerCorrect: null,
    timeToFirstAttempt: null,
    rageClicks: 0,
    rapidGuesses: 0,
    rawSubmissionTimestamps: [],
    tabSwitchCount: 0,
    tabSwitchTimePaused: 0,
    _tabPauseStart: null,
    isSolved: false,
    didSkip: false,
    _skipEnabled: false,
    // puzzle 2
    _p2seq: null,
    _p2answer: null,
    _wheelIdx: 0,
    // puzzle 4
    _p4answer: null,
    // puzzle 3
    _p3seq: null,
    _p3answer: null,
    // rage click
    _clickMap: {},   // elementKey -> [timestamps]
    // rapid guess
    _subTimestamps: [],
    // skip button
    // break tracking
    _breakStart: null,
  };
}

// ════════════════════════════════════════════════════════════════════
// APP ENTRY
// ════════════════════════════════════════════════════════════════════

// ── Admin mode (Shift+Ctrl+A toggles, persists in localStorage) ──
function isAdminMode() { return !!localStorage.getItem('lpc_admin'); }

// ── Draft session persistence ──
function saveDraft() {
  localStorage.setItem('lpc_draft', JSON.stringify({
    treatment:        S.treatment,
    userId:           S.userId           || null,
    puzzleOrder:      S.puzzleOrder      || [],
    currentRound:     S.currentRound     || 0,
    surveyAnswers:    S.surveyAnswers     || {},
    sessionTimestamp: S.sessionTimestamp || new Date().toISOString(),
  }));
}
function clearDraft() { localStorage.removeItem('lpc_draft'); }

function setAdminBadge(on) {
  let badge = document.getElementById('admin-badge');
  if (on) {
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'admin-badge';
      badge.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:9999;display:flex;gap:6px;align-items:center;';

      const label = document.createElement('span');
      label.textContent = 'ADMIN';
      label.style.cssText = 'background:#f59e0b;color:#1a0a2e;font-family:monospace;font-size:10px;font-weight:700;padding:3px 7px;border-radius:4px;letter-spacing:0.08em;';

      const skipBtn = document.createElement('button');
      skipBtn.textContent = 'Skip Puzzle';
      skipBtn.style.cssText = 'background:#ef4444;color:#fff;font-family:monospace;font-size:10px;font-weight:700;padding:3px 7px;border-radius:4px;border:none;cursor:pointer;letter-spacing:0.08em;';
      skipBtn.addEventListener('click', () => {
        if (S.r && !S.r.isSolved && !S.r.didSkip) doSkip();
      });

      badge.appendChild(label);
      badge.appendChild(skipBtn);
      document.body.appendChild(badge);
    }
  } else {
    if (badge) badge.remove();
  }
}

document.addEventListener('keydown', e => {
  if (e.shiftKey && e.ctrlKey && e.key === 'A') {
    if (isAdminMode()) {
      localStorage.removeItem('lpc_admin');
      setAdminBadge(false);
      console.log('[LPC] Admin mode OFF — protections enabled');
    } else {
      localStorage.setItem('lpc_admin', '1');
      setAdminBadge(true);
      console.log('[LPC] Admin mode ON — protections disabled');
    }
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  S.userId = await signInAnon();

  // Flag Prolific participants via ?source=prolific
  if (new URLSearchParams(window.location.search).get('source') === 'prolific') {
    S.recruitmentSource = 'prolific';
  }

  // Restore admin badge if already set
  if (isAdminMode()) setAdminBadge(true);

  // Block copy/cut everywhere so puzzle content can't be grabbed
  document.addEventListener('copy',  e => { if (!isAdminMode()) e.preventDefault(); });
  document.addEventListener('cut',   e => { if (!isAdminMode()) e.preventDefault(); });
  // Block paste on answer inputs so answers can't be pasted in
  document.addEventListener('paste', e => { if (!isAdminMode() && e.target.matches('input')) e.preventDefault(); });
  // Disable right-click context menu
  document.addEventListener('contextmenu', e => { if (!isAdminMode()) e.preventDefault(); });

  showLanding();
});

// ════════════════════════════════════════════════════════════════════
// SCREEN TRANSITION
// ════════════════════════════════════════════════════════════════════

function go(renderFn) {
  const app = document.getElementById('app');
  app.style.opacity = '0';
  setTimeout(() => {
    app.innerHTML = '';
    // Clear any stale inline styles from previous screen
    app.style.cssText = 'opacity: 1; transition: opacity 250ms ease-in-out;';
    renderFn(app);
  }, 220);
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function makeBtn(label, onClick, extraClass) {
  const w = el('div', 'btn-wrap' + (extraClass ? ' ' + extraClass : ''));
  const s = el('div', 'btn-shadow');
  const f = el('button', 'btn-face', label);
  f.addEventListener('click', onClick);
  w.appendChild(s); w.appendChild(f);
  return w;
}

function blobs(c) {
  c.insertAdjacentHTML('beforeend', '<div class="blob blob-a"></div><div class="blob blob-b"></div>');
}

function stars(c, positions) {
  positions.forEach(([t, l]) => {
    const s = el('span', 'deco-star', '✦');
    s.style.top = t; s.style.left = l;
    c.appendChild(s);
  });
}

// Shared animated background used on consent + survey screens
function addAnimBg(app) {
  blobs(app);

  function p(e, t, b, l, r, kf, dur, dl) {
    e.style.position = 'absolute';
    if (t != null) e.style.top    = t;
    if (b != null) e.style.bottom = b;
    if (l != null) e.style.left   = l;
    if (r != null) e.style.right  = r;
    e.style.animation = `${kf} ${dur * 0.62}s ease-in-out ${dl}s infinite`;
    e.style.pointerEvents = 'none';
    return e;
  }

  // Number tiles — spread across all four zones, same as landing
  [
    // Top strip full width
    { t:'2%', l:'2%',   n:2,   sz:22, kf:'d1', dur:9,  dl:0   },
    { t:'2%', l:'16%',  n:26,  sz:20, kf:'d2', dur:11, dl:1.5 },
    { t:'2%', l:'34%',  n:10,  sz:20, kf:'d1', dur:8,  dl:0.8 },
    { t:'2%', l:'52%',  n:72,  sz:20, kf:'d2', dur:10, dl:2.0 },
    { t:'2%', l:'68%',  n:3,   sz:22, kf:'d1', dur:9,  dl:0.4 },
    { t:'2%', l:'84%',  n:34,  sz:20, kf:'d2', dur:11, dl:1.8 },
    // Left column spread — x: 4%–16% so they're visible, not just at the pixel edge
    { t:'18%', l:'6%',  n:89,  sz:20, kf:'d3', dur:13, dl:0.6 },
    { t:'30%', l:'12%', n:34,  sz:18, kf:'d1', dur:11, dl:2.0 },
    { t:'43%', l:'5%',  n:13,  sz:18, kf:'d2', dur:12, dl:0.3 },
    { t:'57%', l:'14%', n:196, sz:18, kf:'d3', dur:10, dl:1.4 },
    { t:'70%', l:'7%',  n:2,   sz:18, kf:'d1', dur:14, dl:3.0 },
    // Right column — x: 84%–94%
    { t:'16%', r:'6%',  n:158, sz:20, kf:'d2', dur:11, dl:1.1 },
    { t:'28%', r:'12%', n:26,  sz:18, kf:'d1', dur:9,  dl:2.3 },
    { t:'42%', r:'5%',  n:72,  sz:18, kf:'d2', dur:13, dl:0.5 },
    { t:'56%', r:'13%', n:3,   sz:18, kf:'d3', dur:10, dl:1.7 },
    { t:'70%', r:'7%',  n:89,  sz:18, kf:'d1', dur:12, dl:0.9 },
    // Bottom strip full width
    { b:'2%', l:'2%',   n:89,  sz:22, kf:'d2', dur:10, dl:1   },
    { b:'2%', l:'18%',  n:158, sz:20, kf:'d1', dur:9,  dl:2.8 },
    { b:'2%', l:'36%',  n:34,  sz:20, kf:'d2', dur:11, dl:0.3 },
    { b:'2%', l:'54%',  n:13,  sz:20, kf:'d1', dur:8,  dl:1.6 },
    { b:'2%', l:'70%',  n:26,  sz:20, kf:'d2', dur:10, dl:0.5 },
    { b:'2%', l:'86%',  n:3,   sz:22, kf:'d1', dur:12, dl:2.1 },
  ].forEach(d => {
    const t = el('div', 'landing-tile', String(d.n));
    t.style.fontSize = d.sz + 'px';
    t.style.opacity  = '0.28';
    p(t, d.t||null, d.b||null, d.l||null, d.r||null, d.kf, d.dur, d.dl);
    app.appendChild(t);
  });

  // Letters — pulled inward from edges so they're clearly visible
  [
    { t:'10%', l:'8%',  ch:'A', c:'#c084fc', sz:32, kf:'d1', dur:14, dl:1.0 },
    { t:'10%', r:'8%',  ch:'Z', c:'#f9a8d4', sz:32, kf:'d2', dur:12, dl:2.0 },
    { b:'10%', l:'8%',  ch:'G', c:'#a78bfa', sz:30, kf:'d2', dur:11, dl:0.5 },
    { b:'10%', r:'8%',  ch:'L', c:'#c084fc', sz:30, kf:'d1', dur:13, dl:1.8 },
    { t:'38%', l:'16%', ch:'M', c:'#f9a8d4', sz:26, kf:'d3', dur:10, dl:0.3 },
    { t:'58%', r:'16%', ch:'W', c:'#a78bfa', sz:26, kf:'d1', dur:12, dl:2.2 },
    { t:'22%', l:'18%', ch:'C', c:'#c084fc', sz:24, kf:'d2', dur:15, dl:3.5 },
    { t:'72%', r:'18%', ch:'R', c:'#f9a8d4', sz:24, kf:'d3', dur:11, dl:1.3 },
  ].forEach(d => {
    const span = el('div');
    span.style.cssText = `font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:${d.sz}px;color:${d.c};opacity:0.28;user-select:none;`;
    span.textContent = d.ch;
    p(span, d.t||null, d.b||null, d.l||null, d.r||null, d.kf, d.dur, d.dl);
    app.appendChild(span);
  });

  // Shapes — corners + shoulder positions pulled inward
  [
    { t:'8px',  l:'8px',  sides:3, color:'#ef4444', rot:0,  sz:66, kf:'d1', dur:11, dl:0   },
    { t:'8px',  r:'8px',  sides:4, color:'#3b82f6', rot:45, sz:66, kf:'d2', dur:13, dl:0.7 },
    { b:'8px',  l:'8px',  sides:6, color:'#22c55e', rot:0,  sz:60, kf:'d2', dur:10, dl:1.4 },
    { b:'8px',  r:'8px',  sides:8, color:'#a855f7', rot:0,  sz:60, kf:'d1', dur:12, dl:2.1 },
    { t:'28%',  l:'16%',  sides:5, color:'#c084fc', rot:20, sz:44, kf:'d3', dur:14, dl:0.5 },
    { t:'52%',  r:'16%',  sides:7, color:'#f9a8d4', rot:30, sz:44, kf:'d1', dur:11, dl:1.6 },
    { t:'18%',  r:'20%',  sides:4, color:'#a78bfa', rot:15, sz:38, kf:'d2', dur:13, dl:2.8 },
    { b:'16%',  l:'20%',  sides:3, color:'#22c55e', rot:0,  sz:38, kf:'d3', dur:10, dl:0.8 },
  ].forEach(d => {
    const svg  = makeSVGPolygon(d.sides, d.color, d.sz, d.rot);
    const wrap = el('div');
    wrap.style.opacity = '0.28';
    p(wrap, d.t||null, d.b||null, d.l||null, d.r||null, d.kf, d.dur, d.dl);
    wrap.appendChild(svg);
    app.appendChild(wrap);
  });

  // ── Italian brainrot easter egg ──
  const ibr = el('div', null, '🗿🤌🍕');
  ibr.style.cssText = 'position:absolute;bottom:20%;left:14%;font-size:24px;letter-spacing:4px;opacity:0.22;pointer-events:none;user-select:none;';
  ibr.style.animation = 'd3 9s ease-in-out 2.1s infinite';
  app.appendChild(ibr);

  // ── 67 easter egg (bigger than regular tiles) ──
  const ee67 = el('div', 'landing-tile', '67');
  ee67.style.cssText = 'position:absolute;top:5%;left:42%;font-size:46px;opacity:0.36;color:#f9a8d4;background:linear-gradient(145deg,#2d0a1e,#1a0a2e);border-color:#f9a8d466;pointer-events:none;';
  ee67.style.animation = 'd1 11s ease-in-out 4s infinite';
  app.appendChild(ee67);
}

// ════════════════════════════════════════════════════════════════════
// LANDING SCREEN
// ════════════════════════════════════════════════════════════════════

function showLanding() {
  go(app => {
    blobs(app);

    // Helper: place a positioned element
    function place(elem, t, b, l, r) {
      elem.style.position = 'absolute';
      if (t != null) elem.style.top    = t;
      if (b != null) elem.style.bottom = b;
      if (l != null) elem.style.left   = l;
      if (r != null) elem.style.right  = r;
    }
    function anim(elem, kf, dur, dl) {
      elem.style.animation = `${kf} ${dur * 0.62}s ease-in-out ${dl}s infinite`;
    }

    // ── Number tiles — spread across ALL four zones, not just the pixel-edge ──
    // Center text is roughly x:28%-72%, y:28%-68%. Safe zones: the rest.
    const numTiles = [
      // Top strip — full width
      { t:'3%',  l:'3%',   n:2,   sz:26, kf:'d1', dur:9,  dl:0   },
      { t:'2%',  l:'14%',  n:3,   sz:24, kf:'d2', dur:11, dl:1.5 },
      { t:'4%',  l:'26%',  n:10,  sz:22, kf:'d1', dur:8,  dl:0.8 },
      { t:'2%',  l:'45%',  n:26,  sz:22, kf:'d2', dur:10, dl:2.0 },
      { t:'3%',  l:'60%',  n:72,  sz:24, kf:'d1', dur:9,  dl:0.4 },
      { t:'2%',  l:'74%',  n:158, sz:22, kf:'d2', dur:11, dl:1.8 },
      { t:'3%',  l:'87%',  n:34,  sz:24, kf:'d1', dur:10, dl:0.9 },
      // Left column — spread vertically, x:3%–18% (safe left of center text)
      { t:'16%', l:'5%',   n:89,  sz:24, kf:'d3', dur:13, dl:0.6 },
      { t:'26%', l:'10%',  n:34,  sz:22, kf:'d1', dur:11, dl:2.0 },
      { t:'38%', l:'4%',   n:13,  sz:22, kf:'d2', dur:12, dl:0.3 },
      { t:'50%', l:'12%',  n:196, sz:20, kf:'d3', dur:10, dl:1.4 },
      { t:'62%', l:'5%',   n:2,   sz:20, kf:'d1', dur:14, dl:3.0 },
      { t:'74%', l:'9%',   n:10,  sz:22, kf:'d2', dur:10, dl:1.1 },
      // Right column — x:78%–94%
      { t:'14%', r:'5%',   n:158, sz:24, kf:'d2', dur:11, dl:1.1 },
      { t:'25%', r:'10%',  n:26,  sz:22, kf:'d1', dur:9,  dl:2.3 },
      { t:'37%', r:'4%',   n:72,  sz:22, kf:'d2', dur:13, dl:0.5 },
      { t:'49%', r:'11%',  n:3,   sz:20, kf:'d3', dur:10, dl:1.7 },
      { t:'61%', r:'5%',   n:89,  sz:20, kf:'d1', dur:12, dl:0.9 },
      { t:'73%', r:'9%',   n:13,  sz:22, kf:'d3', dur:11, dl:2.5 },
      // Bottom strip — full width
      { b:'4%',  l:'3%',   n:89,  sz:26, kf:'d2', dur:10, dl:1   },
      { b:'3%',  l:'14%',  n:158, sz:24, kf:'d1', dur:9,  dl:2.8 },
      { b:'4%',  l:'27%',  n:34,  sz:22, kf:'d2', dur:11, dl:0.3 },
      { b:'3%',  l:'44%',  n:26,  sz:22, kf:'d1', dur:8,  dl:1.6 },
      { b:'4%',  l:'59%',  n:196, sz:22, kf:'d2', dur:10, dl:0.5 },
      { b:'3%',  l:'73%',  n:13,  sz:24, kf:'d1', dur:12, dl:2.1 },
      { b:'4%',  l:'87%',  n:3,   sz:24, kf:'d2', dur:9,  dl:0.7 },
    ];
    numTiles.forEach(d => {
      const tile = el('div', 'landing-tile', String(d.n));
      tile.style.fontSize = d.sz + 'px';
      place(tile, d.t||null, d.b||null, d.l||null, d.r||null);
      anim(tile, d.kf, d.dur, d.dl);
      app.appendChild(tile);
    });

    // ── Large standalone letters — fill shoulder areas ──
    const letterEls = [
      { t:'11%', l:'7%',   ch:'A', c:'#c084fc', sz:36, kf:'d1', dur:14, dl:1.0 },
      { t:'10%', r:'7%',   ch:'Z', c:'#f9a8d4', sz:36, kf:'d2', dur:12, dl:2.0 },
      { b:'11%', l:'7%',   ch:'G', c:'#a78bfa', sz:34, kf:'d2', dur:11, dl:0.5 },
      { b:'10%', r:'7%',   ch:'L', c:'#c084fc', sz:34, kf:'d1', dur:13, dl:1.8 },
      { t:'32%', l:'15%',  ch:'D', c:'#f9a8d4', sz:30, kf:'d3', dur:10, dl:0.3 },
      { t:'56%', r:'15%',  ch:'W', c:'#a78bfa', sz:30, kf:'d1', dur:12, dl:2.2 },
      { t:'20%', l:'20%',  ch:'C', c:'#c084fc', sz:28, kf:'d2', dur:15, dl:3.5 },
      { t:'68%', r:'20%',  ch:'M', c:'#f9a8d4', sz:28, kf:'d3', dur:11, dl:1.3 },
      { t:'44%', l:'18%',  ch:'R', c:'#a78bfa', sz:26, kf:'d1', dur:13, dl:0.7 },
      { t:'44%', r:'18%',  ch:'X', c:'#c084fc', sz:26, kf:'d2', dur:14, dl:2.8 },
    ];
    letterEls.forEach(d => {
      const span = el('div');
      span.style.cssText = `position:absolute;font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:${d.sz}px;color:${d.c};opacity:0.40;pointer-events:none;user-select:none;`;
      place(span, d.t||null, d.b||null, d.l||null, d.r||null);
      anim(span, d.kf, d.dur, d.dl);
      span.textContent = d.ch;
      app.appendChild(span);
    });

    // ── Shapes — corners + shoulders ──
    const shapes = [
      { t:'8px',  l:'8px',  sides:3, color:'#ef4444', rot:0,  sz:80, kf:'d1', dur:11, dl:0   },
      { t:'8px',  r:'8px',  sides:4, color:'#3b82f6', rot:45, sz:80, kf:'d2', dur:13, dl:0.7 },
      { b:'8px',  l:'8px',  sides:6, color:'#22c55e', rot:0,  sz:74, kf:'d2', dur:10, dl:1.4 },
      { b:'8px',  r:'8px',  sides:8, color:'#a855f7', rot:0,  sz:74, kf:'d1', dur:12, dl:2.1 },
      { t:'30%',  l:'18%',  sides:5, color:'#c084fc', rot:20, sz:52, kf:'d3', dur:14, dl:0.5 },
      { t:'52%',  r:'18%',  sides:7, color:'#f9a8d4', rot:30, sz:52, kf:'d1', dur:11, dl:1.6 },
      { t:'18%',  l:'22%',  sides:4, color:'#a78bfa', rot:15, sz:44, kf:'d2', dur:13, dl:2.8 },
      { b:'16%',  r:'22%',  sides:3, color:'#22c55e', rot:0,  sz:44, kf:'d3', dur:10, dl:0.8 },
      { t:'68%',  l:'18%',  sides:6, color:'#f9a8d4', rot:60, sz:40, kf:'d1', dur:12, dl:1.5 },
      { t:'20%',  r:'22%',  sides:5, color:'#c084fc', rot:45, sz:40, kf:'d2', dur:10, dl:3.0 },
    ];
    shapes.forEach(d => {
      const svg = makeSVGPolygon(d.sides, d.color, d.sz, d.rot);
      const wrap = el('div');
      wrap.style.cssText = `position:absolute;opacity:0.42;pointer-events:none;`;
      place(wrap, d.t||null, d.b||null, d.l||null, d.r||null);
      anim(wrap, d.kf, d.dur, d.dl);
      wrap.appendChild(svg);
      app.appendChild(wrap);
    });

    // ── Alphabet wheels ──
    function makeWheel(ltrs, t, b, l, r, dl) {
      const w = el('div', 'landing-wheel');
      w.style.cssText = 'position:absolute;opacity:0.44;pointer-events:none;';
      place(w, t, b, l, r);
      anim(w, 'd2', 15, dl);
      w.innerHTML = `
        <div style="font-family:'Bricolage Grotesque',sans-serif;font-weight:800;color:#4c1d9577;font-size:20px;">${ltrs[0]}</div>
        <div style="font-family:'Bricolage Grotesque',sans-serif;font-weight:800;color:#c084fc;font-size:34px;border:2px solid #7c3aed55;border-radius:10px;padding:4px 18px;background:var(--card-grad);">${ltrs[1]}</div>
        <div style="font-family:'Bricolage Grotesque',sans-serif;font-weight:800;color:#4c1d9577;font-size:20px;">${ltrs[2]}</div>`;
      return w;
    }
    app.appendChild(makeWheel(['W','M','G'], null, '14%', null, '5%', 1));
    app.appendChild(makeWheel(['D','A','H'], null, '22%', '5%', null, 2));

    // ── Sequence rows ──
    function seqRow(nums, t, b, l, r, dl, kf) {
      const row = el('div');
      row.style.cssText = 'position:absolute;display:flex;gap:5px;opacity:0.38;pointer-events:none;';
      place(row, t, b, l, r);
      anim(row, kf, 14, dl);
      nums.forEach(n => {
        const tile = el('div', 'seq-num', String(n));
        tile.style.cssText = 'font-size:15px;padding:6px 10px;border-radius:10px;';
        row.appendChild(tile);
      });
      return row;
    }
    app.appendChild(seqRow([2,3,10],    '40%', null, '5%',  null, 0.5, 'd1'));
    app.appendChild(seqRow([26,72,158], '58%', null, null,  '5%', 2.0, 'd2'));
    app.appendChild(seqRow([13,34],     null,  '18%','14%', null, 1.2, 'd3'));

    // ── 67 easter egg (bigger than regular tiles) ──
    const ee = el('div', 'landing-tile', '67');
    ee.style.cssText = 'position:absolute;top:6%;right:4%;font-size:52px;opacity:0.44;color:#f9a8d4;background:linear-gradient(145deg,#2d0a1e,#1a0a2e);border-color:#f9a8d466;';
    anim(ee, 'd2', 18, 6);
    app.appendChild(ee);

    // ── Brainrot emojis ──
    const e1 = el('div', null, '🐊✈️'); e1.style.cssText = 'position:absolute;bottom:10%;left:20%;opacity:0.18;font-size:22px;'; anim(e1,'d1',20,0);
    const e2 = el('div', null, '☕💀'); e2.style.cssText = 'position:absolute;top:13%;left:6%;opacity:0.18;font-size:22px;';  anim(e2,'d2',24,2);
    // ── Italian brainrot easter egg ──
    const e3 = el('div', null, '🗿🤌🍕'); e3.style.cssText = 'position:absolute;top:22%;right:5%;opacity:0.20;font-size:22px;letter-spacing:4px;'; anim(e3,'d1',16,3.5);
    app.appendChild(e1); app.appendChild(e2); app.appendChild(e3);

    // ── Center content (z-index above everything) ──
    const center = el('div');
    center.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 20px;text-align:center;gap:16px;z-index:10;pointer-events:none;';
    // Emojis must live in plain <span>s — background-clip:text turns them into silhouettes
    const grad = 'background:linear-gradient(135deg,#c084fc,#f0abfc,#f9a8d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;';
    const slime = 'background:linear-gradient(160deg,#4ade80,#86efac,#bbf7d0,#65a30d,#a3e635);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;filter:drop-shadow(0 2px 8px rgba(74,222,128,0.55));';
    center.innerHTML = `
      <h1 style="font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:clamp(42px,11vw,68px);line-height:1.1;letter-spacing:-1px;text-align:center;">
        <span style="${slime}">Brain rot</span>&nbsp;<span style="font-size:0.85em;">🫠</span>&nbsp;<span style="${grad}">or</span><br>
        <span style="${grad}">big brain</span>&nbsp;<span style="font-size:0.85em;">🧠</span><span style="${grad}">?</span>
      </h1>
      <p style="font-family:'Space Grotesk',sans-serif;color:#c4b5fd;font-size:20px;font-weight:600;margin-top:4px;">It's giving... genius.</p>
      <p style="font-family:'Space Grotesk',sans-serif;color:#c4b5fd;font-size:17px;line-height:1.6;">Prove you've got the logic to match in<br><strong style="color:#e2d9f3;">5 rapid-fire rounds.</strong></p>
    `;
    const btnWrap = el('div'); btnWrap.style.pointerEvents = 'all';
    const btn = makeBtn('Start', () => showConsent(), 'pulse');
    btn.querySelector('.btn-face').style.fontSize = '18px';
    btn.querySelector('.btn-face').style.padding = '16px 52px';
    btnWrap.appendChild(btn);
    center.appendChild(btnWrap);
    app.appendChild(center);
  });
}

// ════════════════════════════════════════════════════════════════════
// CONSENT SCREEN
// ════════════════════════════════════════════════════════════════════

function showConsent() {
  go(app => {
    addAnimBg(app);

    // Full-screen flex center — not top-aligned
    const wrap = el('div');
    wrap.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px 20px;';

    const card = el('div');
    card.style.cssText = 'width:100%;max-width:420px;display:flex;flex-direction:column;align-items:center;gap:0;text-align:center;';

    card.innerHTML = `
      <h1 class="headline" style="font-size:clamp(30px,8vw,42px);line-height:1.15;margin-bottom:22px;">
        Before we get started 👋
      </h1>

      <p style="font-family:'Space Grotesk',sans-serif;color:#e2d9f3;font-size:17px;font-weight:600;line-height:1.5;margin-bottom:18px;">
        Help us understand puzzle game players like you.
      </p>

      <p style="font-family:'Space Grotesk',sans-serif;color:#c4b5fd;font-size:15px;line-height:1.75;margin-bottom:10px;">
        We have a quick survey that helps us get to know you a bit better.
        All data is anonymized and used for academic research purposes only —
        just for the vibes<br>(and the science!).
      </p>

      <p style="font-family:'Space Grotesk',sans-serif;color:#7c6aaa;font-size:13px;line-height:1.65;margin-bottom:32px;">
        You can opt out at any point before the game begins.<br>
        No data is saved until you confirm you're ready to play.
      </p>
    `;

    const btn = makeBtn('I understand — let\'s go', () => {
      const saved = localStorage.getItem('lpc_draft');
      const draft = saved ? JSON.parse(saved) : null;
      if (draft && draft.currentRound > 0) {
        // Left mid-game — show welcome back
        showWelcomeBack(draft);
      } else {
        // No draft or left before game started — assign/restore treatment and start survey fresh
        if (draft) {
          S.treatment = draft.treatment;
        } else {
          const r = Math.random();
          S.treatment = r < 0.333 ? 'no_label' : r < 0.666 ? 'hard_label' : 'easy_label';
          saveDraft();
        }
        const hasPlayed = !!localStorage.getItem('lpc_played');
        hasPlayed ? showReplayCheck() : showSurvey(0);
      }
    });
    btn.style.marginBottom = '16px';
    card.appendChild(btn);

    const optOut = el('button', 'btn-ghost', 'I\'d rather not participate');
    optOut.addEventListener('click', () => showLanding());
    card.appendChild(optOut);

    wrap.appendChild(card);
    app.appendChild(wrap);
  });
}

// ════════════════════════════════════════════════════════════════════
// WELCOME BACK (shown when a saved draft is detected on consent)
// ════════════════════════════════════════════════════════════════════

function showWelcomeBack(draft) {
  go(app => {
    addAnimBg(app);

    const scroller = el('div');
    scroller.style.cssText = 'position:absolute;inset:0;overflow-y:auto;display:flex;flex-direction:column;align-items:center;z-index:10;';

    const inner = el('div');
    inner.style.cssText = 'width:100%;max-width:440px;margin:auto;padding:22px 16px;display:flex;flex-direction:column;align-items:center;text-align:center;';

    const qLabel = el('h2', 'headline', 'Welcome back!');
    qLabel.style.cssText = 'font-size:clamp(20px,5vw,26px);line-height:1.3;color:#e2d9f3;margin-bottom:10px;';
    inner.appendChild(qLabel);

    const sub = el('p', '', `You completed ${draft.currentRound} of 5 puzzles last time. Pick up right where you left off — no need to redo anything.`);
    sub.style.cssText = 'font-family:"Space Grotesk",sans-serif;font-size:15px;color:#c4b5fd;margin-bottom:28px;line-height:1.6;';
    inner.appendChild(sub);

    const continueBtn = makeBtn('Continue where I left off', () => {
      S.treatment          = draft.treatment;
      S.surveyAnswers      = draft.surveyAnswers || {};
      S.sessionTimestamp   = draft.sessionTimestamp || null;
      showInstructions();
    });
    continueBtn.style.marginBottom = '12px';
    inner.appendChild(continueBtn);

    const optOut = el('button');
    optOut.style.cssText = 'background:none;border:none;font-family:"Space Grotesk",sans-serif;font-size:13px;color:#ffffff;cursor:pointer;text-decoration:underline;margin-top:4px;';
    optOut.textContent = 'I\'d rather not participate';
    optOut.addEventListener('click', showOptOut);
    inner.appendChild(optOut);

    scroller.appendChild(inner);
    app.appendChild(scroller);
  });
}

// ════════════════════════════════════════════════════════════════════
// REPLAY CHECK (shown before survey when isReplay === true)
// ════════════════════════════════════════════════════════════════════

function showReplayCheck() {
  go(app => {
    addAnimBg(app);

    const scroller = el('div');
    scroller.style.cssText = 'position:absolute;inset:0;overflow-y:auto;display:flex;flex-direction:column;align-items:center;z-index:10;';

    const inner = el('div');
    inner.style.cssText = 'width:100%;max-width:440px;margin:auto;padding:22px 16px;display:flex;flex-direction:column;align-items:center;text-align:center;';

    const qLabel = el('h2', 'headline', 'It looks like this device has been used to play before.');
    qLabel.style.cssText = 'font-size:clamp(20px,5vw,26px);line-height:1.3;color:#e2d9f3;margin-bottom:10px;';
    inner.appendChild(qLabel);

    const sub = el('p', '', 'Are you a new player, or have you played this game before on this device?');
    sub.style.cssText = 'font-family:"Space Grotesk",sans-serif;font-size:15px;color:#c4b5fd;margin-bottom:24px;line-height:1.6;';
    inner.appendChild(sub);

    const options = [
      { label: "I'm a new player — I haven't played this before", value: 'new_player' },
      { label: "I've played this game before on this device",      value: 'returning'  },
    ];

    const grid = el('div');
    grid.style.cssText = 'display:flex;flex-direction:column;gap:7px;width:100%;margin-bottom:18px;';
    let selected = null;

    options.forEach(opt => {
      const card = el('button', 'survey-card', opt.label);
      card.addEventListener('click', () => {
        grid.querySelectorAll('.survey-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selected = opt.value;
      });
      grid.appendChild(card);
    });
    inner.appendChild(grid);

    const errMsg = el('p', 'flash-msg', '');
    errMsg.style.marginBottom = '8px';
    inner.appendChild(errMsg);

    const nextBtn = makeBtn('Next →', () => {
      if (!selected) { errMsg.textContent = 'Please answer this question to continue.'; return; }
      S.surveyAnswers.sharedDevice = selected;
      showSurvey(0);
    });
    nextBtn.style.marginBottom = '10px';
    inner.appendChild(nextBtn);

    const optOut = el('button');
    optOut.style.cssText = 'background:none;border:none;font-family:"Space Grotesk",sans-serif;font-size:13px;color:#ffffff;cursor:pointer;text-decoration:underline;margin-top:4px;';
    optOut.textContent = 'I\'d rather not participate';
    optOut.addEventListener('click', showOptOut);
    inner.appendChild(optOut);

    scroller.appendChild(inner);
    app.appendChild(scroller);
  });
}

// ════════════════════════════════════════════════════════════════════
// SURVEY
// ════════════════════════════════════════════════════════════════════

function showSurvey(idx) {
  S.surveyPage = idx;
  const q = SURVEY_QUESTIONS[idx];
  const total = SURVEY_QUESTIONS.length;

  go(app => {
    addAnimBg(app);

    // Scrollable column that vertically centers when content is short enough
    const scroller = el('div');
    scroller.style.cssText = 'position:absolute;inset:0;overflow-y:auto;display:flex;flex-direction:column;align-items:center;z-index:10;';

    // inner card — margin:auto centers vertically; padding prevents content touching edges
    const inner = el('div');
    inner.style.cssText = 'width:100%;max-width:440px;margin:auto;padding:22px 16px;display:flex;flex-direction:column;align-items:center;text-align:center;';

    // Progress bar + counter
    const prog = el('div');
    prog.style.cssText = 'width:100%;margin-bottom:16px;';
    prog.innerHTML = `
      <div class="progress-track"><div class="progress-fill" style="width:${(idx / total) * 100}%"></div></div>
      <p style="font-family:'Space Grotesk',sans-serif;font-size:12px;color:var(--lavender);text-align:right;margin-top:6px;">${idx + 1} of ${total}</p>
    `;
    inner.appendChild(prog);

    // Question label
    const qLabel = el('h2', 'headline', q.label);
    qLabel.style.cssText = 'font-size:clamp(20px,5vw,26px);line-height:1.3;color:#e2d9f3;margin-bottom:18px;';
    inner.appendChild(qLabel);

    let getValue;

    if (q.type === 'number') {
      const inp = el('input');
      inp.type = 'number'; inp.min = q.min; inp.max = q.max;
      inp.className = 'answer-input'; inp.placeholder = 'Your age';
      inp.style.marginBottom = '24px';
      if (S.surveyAnswers[q.id]) inp.value = S.surveyAnswers[q.id];
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') nextBtn.querySelector('.btn-face').click(); });
      inner.appendChild(inp);
      getValue = () => { const v = parseInt(inp.value); return (isNaN(v) || v < q.min || v > q.max) ? null : v; };

    } else if (q.type === 'cards') {
      const grid = el('div');
      grid.style.cssText = 'display:flex;flex-direction:column;gap:7px;width:100%;margin-bottom:18px;';
      let selected = S.surveyAnswers[q.id] || null;
      q.options.forEach(opt => {
        const card = el('button', 'survey-card', opt);
        if (selected === opt) card.classList.add('selected');
        card.addEventListener('click', () => {
          grid.querySelectorAll('.survey-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          selected = opt;
        });
        grid.appendChild(card);
      });
      inner.appendChild(grid);
      getValue = () => selected;

    } else if (q.type === 'likert') {
      const wrap = el('div');
      wrap.style.cssText = 'width:100%;margin-bottom:24px;';
      const labels = el('div');
      labels.style.cssText = 'display:flex;justify-content:space-between;font-family:"Space Grotesk",sans-serif;font-size:13px;color:var(--lavender);margin-bottom:12px;';
      labels.innerHTML = `<span>${q.lo}</span><span>${q.hi}</span>`;
      wrap.appendChild(labels);
      const row = el('div', 'likert-row');
      row.style.justifyContent = 'center';
      let selected = S.surveyAnswers[q.id] || null;
      for (let v = q.min; v <= q.max; v++) {
        const btn = el('button', 'likert-btn', String(v));
        if (selected === v) btn.classList.add('selected');
        btn.addEventListener('click', () => {
          row.querySelectorAll('.likert-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          selected = v;
        });
        row.appendChild(btn);
      }
      wrap.appendChild(row);
      inner.appendChild(wrap);
      getValue = () => selected;
    }

    // Error message
    const errMsg = el('p', 'flash-msg', '');
    errMsg.style.marginBottom = '8px';
    inner.appendChild(errMsg);

    // Next button (always "Next →" — "Start Challenge" lives on instructions page)
    const nextBtn = makeBtn('Next →', () => {
      const val = getValue();
      if (val === null || val === undefined) {
        errMsg.textContent = 'Please answer this question to continue.';
        return;
      }
      S.surveyAnswers[q.id] = val;
      if (idx === total - 1) {
        // Survey complete — persist answers so they're restored on resume
        if (!S.sessionTimestamp) S.sessionTimestamp = new Date().toISOString();
        saveDraft();
        showInstructions();
      } else {
        showSurvey(idx + 1);
      }
    });
    nextBtn.style.marginBottom = '10px';
    inner.appendChild(nextBtn);

    // Back button (not on first question)
    if (idx > 0) {
      const backBtn = el('button', 'btn-ghost', '← Back');
      backBtn.style.marginBottom = '10px';
      backBtn.addEventListener('click', () => {
        if (getValue() !== null && getValue() !== undefined) S.surveyAnswers[q.id] = getValue();
        showSurvey(idx - 1);
      });
      inner.appendChild(backBtn);
    }

    const optOut = el('button');
    optOut.style.cssText = 'background:none;border:none;font-family:"Space Grotesk",sans-serif;font-size:13px;color:#ffffff;cursor:pointer;text-decoration:underline;margin-top:4px;';
    optOut.textContent = 'I\'d rather not participate';
    optOut.addEventListener('click', showOptOut);
    inner.appendChild(optOut);

    scroller.appendChild(inner);
    app.appendChild(scroller);
  });
}

// ════════════════════════════════════════════════════════════════════
// OPT-OUT
// ════════════════════════════════════════════════════════════════════

function showOptOut() {
  clearDraft();
  S.surveyAnswers = {};
  const overlay = el('div', 'optout-screen');
  overlay.innerHTML = `
    <h2 class="headline" style="font-size:24px;">No worries — thanks for stopping by.</h2>
    <p class="body-text" style="max-width:320px;font-size:15px;">This study is trying to understand how people approach logic challenges. Every participant helps make the research more meaningful — even one session counts. If you change your mind, you're welcome to refresh and start fresh.</p>
    <p style="font-family:'Space Grotesk';font-size:13px;color:var(--lavender);">Either way, we appreciate you. Good luck out there. 🧠</p>
  `;
  const btn = makeBtn('Take me back', () => {
    document.body.removeChild(overlay);
    showLanding();
  });
  overlay.appendChild(btn);
  document.body.appendChild(overlay);
  setTimeout(() => {
    if (document.body.contains(overlay)) {
      document.body.removeChild(overlay);
      showLanding();
    }
  }, 4000);
}

// ════════════════════════════════════════════════════════════════════
// INSTRUCTIONS
// ════════════════════════════════════════════════════════════════════

function showInstructions() {
  go(app => {
    addAnimBg(app);

    const scroller = el('div');
    scroller.style.cssText = 'position:absolute;inset:0;overflow-y:auto;display:flex;flex-direction:column;align-items:center;z-index:10;';

    const inner = el('div');
    inner.style.cssText = 'width:100%;max-width:440px;margin:auto;padding:28px 20px;display:flex;flex-direction:column;align-items:center;text-align:center;';

    const grad = 'background:linear-gradient(135deg,#c084fc,#f0abfc,#f9a8d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;';
    inner.innerHTML = `
      <h1 style="font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:clamp(24px,5.5vw,30px);line-height:1.3;text-align:center;margin-bottom:16px;">
        <span style="${grad}">Here's how it works</span>&nbsp;<span>🧠</span>
      </h1>
      <p class="body-text" style="text-align:center;font-size:15px;line-height:1.6;margin-bottom:20px;">You'll get 5 logic puzzles, one at a time. Each one has a hidden pattern — your job is to figure out the rule and find the missing piece.</p>
      <div style="background:var(--card-grad);border:1.5px solid #4c1d9522;border-radius:16px;padding:18px 22px;width:100%;margin-bottom:12px;text-align:left;">
        <p style="font-family:'Space Grotesk';font-size:13px;color:var(--lavender);font-weight:600;margin-bottom:8px;letter-spacing:0.05em;">EXAMPLE — Numbers</p>
        <p class="body-text" style="font-size:16px;">2 · 4 · 8 · __ → the rule is ×2, so the answer is <strong style="color:#e2d9f3;">16</strong></p>
      </div>
      <div style="background:var(--card-grad);border:1.5px solid #4c1d9522;border-radius:16px;padding:18px 22px;width:100%;margin-bottom:20px;text-align:left;">
        <p style="font-family:'Space Grotesk';font-size:13px;color:var(--lavender);font-weight:600;margin-bottom:8px;letter-spacing:0.05em;">EXAMPLE — Letters</p>
        <p class="body-text" style="font-size:16px;">A · C · E · __ → the rule is +2 letters, so the answer is <strong style="color:#e2d9f3;">G</strong></p>
      </div>
      <p class="body-text" style="text-align:center;font-size:15px;margin-bottom:12px;">The real puzzles are harder — but the idea is the same. Find the rule, trust it.</p>
      <p style="font-family:'Space Grotesk';font-size:15px;color:var(--text-2);text-align:center;margin-bottom:8px;">📝 Pro tip: grab a pen and paper before you start.</p>
      <div style="background:rgba(124,58,237,0.12);border:1.5px solid rgba(192,132,252,0.25);border-radius:12px;padding:12px 16px;width:100%;margin-bottom:24px;text-align:center;">
        <p style="font-family:'Space Grotesk';font-size:13px;color:var(--lavender);font-weight:600;margin:0;">🚫 No AI or outside help please — it affects our research data.</p>
      </div>
    `;

    const startBtn = makeBtn('Start the Challenge 🚀', onStartChallenge);
    startBtn.style.marginBottom = '16px';
    inner.appendChild(startBtn);

    const optOut = el('button', 'btn-ghost', 'I\'d rather not participate');
    optOut.addEventListener('click', showOptOut);
    inner.appendChild(optOut);

    scroller.appendChild(inner);
    app.appendChild(scroller);
  });
}

async function onStartChallenge() {
  // Treatment was assigned and saved at consent time; assign fallback only if missing
  if (!S.treatment) {
    const r = Math.random();
    S.treatment = r < 0.333 ? 'no_label' : r < 0.666 ? 'hard_label' : 'easy_label';
  }

  const draft = (() => { try { return JSON.parse(localStorage.getItem('lpc_draft')); } catch { return null; } })();
  const resuming = draft && draft.currentRound > 0 && draft.userId && draft.puzzleOrder?.length;

  if (resuming) {
    // Restore saved game state so round logs share the same userId
    S.userId           = draft.userId;
    S.puzzleOrder      = draft.puzzleOrder;
    S.currentRound     = draft.currentRound;
    S.resumeRound      = draft.currentRound + 1;  // 1-based to match roundNumber in gameLogs
    S.sessionTimestamp = draft.sessionTimestamp || null;
  } else {
    // Fresh game — shuffle puzzles and start from round 0
    const shuffled = fisherYates([...PUZZLE_BANK]);
    S.puzzleOrder  = shuffled.map(p => p.id);
    S.currentRound = 0;
  }

  // ── Replay detection ──
  S.isReplay = !!localStorage.getItem('lpc_played');

  // Save full game state to draft now that userId and puzzleOrder are set
  saveDraft();

  showLabelCard(S.currentRound);

  // ── IP capture + user doc write happen in background after UI moves on ──
  (async () => {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 3000);
      const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
      S.ipAddress = (await res.json()).ip;
    } catch { S.ipAddress = null; }

    // Stage 2 (Asynchronous): The definitive check. After the IP is fetched,
    // we re-evaluate `isReplay` using a more reliable IP-based key.
    // This updated value is used for the main `users` document and for all
    // subsequent round logs. Note: the very first round log might use the
    // initial Stage 1 value if it's saved before this async block completes.
    const replayKey = 'lpc_played_' + (S.ipAddress || 'local');
    S.isReplay = !!localStorage.getItem(replayKey) || !!localStorage.getItem('lpc_played');

    if (resuming) {
      // Update the existing user doc — don't create a duplicate
      updateUserField(S.userId, { multiSession: true });
      appendUserArrayField(S.userId, 'resumeRounds', S.resumeRound);
      // Load prior rounds so the results screen scores all 5 rounds, not just this session
      const priorLogs = await getUserGameLogs(S.userId);
      priorLogs.forEach(log => {
        if (!S.completedLogs.find(l => l.roundNumber === log.roundNumber)) {
          S.completedLogs.push(log);
        }
      });
    } else {
      const userObj = {
        userId: S.userId,
        treatment: S.treatment,
        ipAddress: S.ipAddress,
        isReplay: S.isReplay,
        recruitmentSource: S.recruitmentSource || 'organic',
        multiSession: false,
        resumeRounds: [],
        timestamp: S.sessionTimestamp || new Date().toISOString(),
        deviceType: (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768) ? 'Mobile' : 'Desktop',
        puzzleOrder: S.puzzleOrder,
        breakLog: [],
        sessionComplete: false,
        honestyCheck: null,
        ...S.surveyAnswers,
      };
      createUser(userObj);
    }
  })();
}

// ════════════════════════════════════════════════════════════════════
// LABEL CARD
// ════════════════════════════════════════════════════════════════════

function showLabelCard(roundIdx) {
  S.currentRound = roundIdx;
  saveDraft();
  const roundNum = roundIdx + 1;
  const treatment = S.treatment;
  let seconds = 10;
  let _interval = null;
  let _dismissed = false;
  let _paused = false;
  let _breakStart = null;
  let _breakStartISO = null;

  go(app => {
    addAnimBg(app);

    // Center stack
    const center = el('div');
    center.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;z-index:10;padding:32px;text-align:center;';

    // "ROUND X" + "of 5" heading
    const gradS = 'background:linear-gradient(135deg,#c084fc,#f0abfc,#f9a8d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;';
    const heading = el('div');
    heading.innerHTML = `
      <div style="font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:clamp(60px,11vw,96px);line-height:1.0;${gradS}">ROUND ${roundNum}</div>
      <div style="font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:clamp(18px,3vw,24px);color:var(--lavender);margin-top:8px;letter-spacing:0.04em;">of 5</div>
      ${treatment !== 'no_label' ? `<div class="badge ${treatment === 'hard_label' ? 'badge-hard' : 'badge-easy'}" style="display:inline-flex;margin-top:20px;font-size:clamp(18px,3.5vw,26px);padding:10px 28px;letter-spacing:0.05em;">${treatment === 'hard_label' ? 'Difficulty: HARD 🔥' : 'Difficulty: EASY ✌️'}</div>` : ''}
    `;
    center.appendChild(heading);

    // No-AI reminder
    const noAI = el('p');
    noAI.style.cssText = 'font-family:"Space Grotesk",sans-serif;font-size:14px;font-weight:500;color:var(--text);letter-spacing:0.02em;';
    noAI.textContent = '🚫 No AI or outside help — it affects our data.';
    center.appendChild(noAI);

    // Glowing countdown ring
    const ring = el('div');
    ring.style.cssText = [
      'width:190px;height:190px;border-radius:50%;flex-shrink:0;',
      'border:3px solid rgba(192,132,252,0.55);',
      'background:radial-gradient(circle at 50% 55%,rgba(124,58,237,0.30),rgba(10,4,24,0.60));',
      'box-shadow:0 0 70px rgba(192,132,252,0.40),0 0 140px rgba(124,58,237,0.15),inset 0 0 36px rgba(124,58,237,0.18);',
      'display:flex;align-items:center;justify-content:center;',
    ].join('');

    const countEl = el('div', 'label-card-countdown', String(seconds));
    countEl.id = 'card-count';
    countEl.style.fontSize = 'clamp(76px,13vw,100px)';
    ring.appendChild(countEl);
    center.appendChild(ring);

    // Pause / resume button
    const pauseBtn = el('button');
    pauseBtn.style.cssText = [
      'background:none;border:1.5px solid rgba(167,139,250,0.35);border-radius:100px;',
      'padding:8px 24px;font-family:"Space Grotesk",sans-serif;font-size:14px;',
      'color:var(--lavender);cursor:pointer;transition:border-color 0.2s,color 0.2s;',
    ].join('');
    pauseBtn.textContent = 'Take a Break ⏸';
    center.appendChild(pauseBtn);

    app.appendChild(center);

    // Countdown logic
    function dismiss() {
      if (_dismissed) return;
      _dismissed = true;
      clearInterval(_interval);
      showPuzzle(roundIdx);
    }

    _interval = setInterval(() => {
      if (_paused) return;
      seconds--;
      const ct = document.getElementById('card-count');
      if (ct) {
        ct.style.animation = 'none';
        void ct.offsetWidth;
        ct.textContent = seconds > 0 ? String(seconds) : 'GO!';
        ct.style.animation = 'countPop 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards';
      }
      if (seconds <= 0) {
        clearInterval(_interval);
        _dismissed = true;
        setTimeout(() => showPuzzle(roundIdx), 450);
      }
    }, 1000);

    pauseBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (!_paused) {
        _paused = true;
        _breakStart    = Date.now();
        _breakStartISO = new Date().toISOString();
        pauseBtn.textContent = 'Resume →';
        pauseBtn.style.borderColor = 'rgba(167,139,250,0.70)';
        pauseBtn.style.color = 'var(--text)';
      } else {
        _paused = false;
        if (_breakStart) {
          const duration = parseFloat(((Date.now() - _breakStart) / 1000).toFixed(2));
          _breakStart = null;
          if (S.userId) {
            appendUserArrayField(S.userId, 'breakLog', { timestamp: _breakStartISO, duration });
          }
          _breakStartISO = null;
        }
        pauseBtn.textContent = 'Take a Break ⏸';
        pauseBtn.style.borderColor = 'rgba(167,139,250,0.35)';
        pauseBtn.style.color = 'var(--lavender)';
      }
    });

  });
}

// ════════════════════════════════════════════════════════════════════
// PUZZLE SCREEN
// ════════════════════════════════════════════════════════════════════

function showPuzzle(roundIdx) {
  S.currentRound = roundIdx;
  saveDraft();
  const puzzleId = S.puzzleOrder[roundIdx];
  const puzzle = PUZZLE_BANK.find(p => p.id === puzzleId);
  S.r = makeRound(puzzleId);

  const HDR_H = 58;

  go(app => {
    // ── Full-width header — matches the game space / llama footer width ──
    const hdr = el('div');
    hdr.style.cssText = [
      `position:absolute;top:0;left:0;right:0;height:${HDR_H}px;z-index:5;`,
      'display:flex;align-items:center;justify-content:center;',
      'background:rgba(10,4,24,0.90);',
      'backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);',
      'border-bottom:1.5px solid rgba(124,58,237,0.28);',
    ].join('');

    // Inner wrapper — same max-width as puzzle content, 3-column layout
    const hdrInner = el('div');
    hdrInner.style.cssText = 'width:100%;max-width:480px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 22px;';

    // Left: empty spacer (keeps center truly centered)
    hdrInner.appendChild(el('div'));

    // Center: difficulty label — large text, no pill
    const diffCenter = el('div');
    diffCenter.style.cssText = 'display:flex;align-items:center;justify-content:center;';
    if (S.treatment !== 'no_label') {
      const isHard = S.treatment === 'hard_label';
      const diffLbl = el('span');
      diffLbl.id = 'diff-badge-round';
      diffLbl.style.cssText = [
        'font-family:"Bricolage Grotesque",sans-serif;font-weight:800;font-size:18px;letter-spacing:0.06em;text-transform:uppercase;',
        isHard ? 'color:#f87171;text-shadow:0 0 12px rgba(248,113,113,0.5);' : 'color:#86efac;text-shadow:0 0 12px rgba(134,239,172,0.5);',
      ].join('');
      diffLbl.textContent = isHard ? 'DIFFICULTY: HARD' : 'DIFFICULTY: EASY';
      diffCenter.appendChild(diffLbl);
    }
    hdrInner.appendChild(diffCenter);

    // Right: ROUND label + X/5 + pip dots
    const rightCol = el('div');
    rightCol.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;gap:3px;';

    const roundRow = el('div');
    roundRow.style.cssText = 'display:flex;align-items:baseline;gap:4px;';
    const roundLbl = el('span');
    roundLbl.style.cssText = 'font-family:"Space Grotesk",sans-serif;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(196,181,253,0.55);';
    roundLbl.textContent = 'ROUND';
    const roundNum = el('span');
    roundNum.innerHTML = `<span style="font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:18px;color:var(--purple-light);">${roundIdx+1}</span><span style="font-family:'Bricolage Grotesque',sans-serif;font-size:13px;color:rgba(196,181,253,0.45);"> / 5</span>`;
    roundRow.appendChild(roundLbl);
    roundRow.appendChild(roundNum);
    rightCol.appendChild(roundRow);

    const pipRow = el('div');
    pipRow.style.cssText = 'display:flex;align-items:center;gap:5px;';
    for (let i = 0; i < 5; i++) {
      const pip = el('div');
      pip.style.cssText = `width:7px;height:7px;border-radius:50%;background:${i < roundIdx + 1 ? 'var(--purple-light)' : '#2d1254'};box-shadow:${i < roundIdx + 1 ? '0 0 6px #c084fc88' : 'none'};`;
      pipRow.appendChild(pip);
    }
    rightCol.appendChild(pipRow);
    hdrInner.appendChild(rightCol);

    // Hidden timer for backend tracking
    const hiddenTimer = el('span');
    hiddenTimer.id = 'timer';
    hiddenTimer.style.display = 'none';
    hdrInner.appendChild(hiddenTimer);

    hdr.appendChild(hdrInner);
    app.appendChild(hdr);

    // ── Pixel scene — starts below the header so moon is visible ──
    const scene = makePixelScene();
    scene.style.cssText = `position:absolute;top:${HDR_H}px;left:0;right:0;bottom:0;width:100%;height:calc(100% - ${HDR_H}px);z-index:0;pointer-events:none;image-rendering:pixelated;`;
    app.appendChild(scene);

    // ── Scrollable centered puzzle area ──
    const scroller = el('div');
    scroller.style.cssText = `position:absolute;top:${HDR_H}px;left:0;right:0;bottom:0;overflow-y:auto;display:flex;flex-direction:column;align-items:center;padding-top:20px;padding-bottom:140px;z-index:2;`;

    // ── Scattered stars in the dead space ──
    const starPositions = [
      ['12%','8%'],['88%','11%'],['6%','38%'],['93%','42%'],
      ['15%','62%'],['85%','68%'],['20%','82%'],['78%','80%'],
      ['50%','6%'],['4%','72%'],['96%','25%'],['42%','92%'],
      ['60%','14%'],['30%','50%'],['70%','55%'],
    ];
    starPositions.forEach(([t, l]) => {
      const s = el('div');
      const size = Math.random() > 0.6 ? '10px' : '7px';
      s.style.cssText = `position:absolute;top:${t};left:${l};font-size:${size};color:var(--lavender);opacity:${(0.12 + Math.random()*0.15).toFixed(2)};pointer-events:none;user-select:none;animation:d${Math.ceil(Math.random()*3)} ${(8+Math.random()*6).toFixed(1)}s ease-in-out ${(Math.random()*4).toFixed(1)}s infinite;`;
      s.textContent = Math.random() > 0.5 ? '✦' : '✧';
      scroller.appendChild(s);
    });

    const puzBox = el('div');
    puzBox.id = 'puzzle-box';
    puzBox.style.cssText = 'width:100%;max-width:480px;display:flex;flex-direction:column;align-items:center;gap:20px;padding:0 20px;margin:auto;position:relative;z-index:2;';

    scroller.appendChild(puzBox);
    app.appendChild(scroller);

    // Render puzzle
    switch (puzzle.type) {
      case 'number_sequence': renderPuzzle1(puzBox, puzzle); break;
      case 'alphabet_wheel':  renderPuzzle2(puzBox, puzzle); break;
      case 'shape_sequence':  renderPuzzle3(puzBox, puzzle); break;
      case 'hybrid':          renderPuzzle4(puzBox); break;
      case 'tile_sequence':   renderPuzzle5(puzBox, puzzle); break;
    }

    // ── Skip/Quit button — below check button, enabled after 30s ──
    const isLast = S.currentRound === 4;
    const skipCorner = el('button', 'btn-check', isLast ? 'Quit Challenge' : 'Skip Round');
    skipCorner.id = 'corner-skip';
    skipCorner.disabled = true;
    skipCorner.title = 'Skip will be available shortly';
    skipCorner.style.cssText = 'opacity:0.6;pointer-events:none;cursor:default;background:rgba(124,58,237,0.35);color:var(--lavender);box-shadow:2px 3px 0 rgba(76,29,149,0.4);margin-top:4px;border:1.5px solid rgba(167,139,250,0.4);';
    skipCorner.addEventListener('click', () => { if (S.r._skipEnabled) doSkip(); });

    const skipNote = el('p');
    skipNote.id = 'skip-note';
    skipNote.textContent = '⏳ Skip will unlock shortly — hang tight!';
    skipNote.style.cssText = 'font-family:"Space Grotesk",sans-serif;font-size:14px;color:#ffffff;text-align:center;margin-top:2px;';

    puzBox.appendChild(skipCorner);
    puzBox.appendChild(skipNote);

    timerStart();
    setupTabSwitch(app);
    registerBeforeUnload();
    setupRageClickTracking(app);
  });
}

// ════════════════════════════════════════════════════════════════════
// PUZZLE 1 — Number Sequence
// ════════════════════════════════════════════════════════════════════

function renderPuzzle1(box, puzzle) {
  const title = el('p', 'headline', 'Find the missing number');
  title.style.cssText = 'font-size:22px;text-align:center;color:var(--text-2);';
  box.appendChild(title);

  const seqRow = el('div', 'seq-row');
  puzzle.sequence.forEach((n, i) => {
    seqRow.appendChild(el('div', 'seq-num', String(n)));
    if (i < puzzle.sequence.length - 1) seqRow.appendChild(el('span', 'seq-dot', '·'));
  });
  seqRow.appendChild(el('span', 'seq-dot', '·'));
  seqRow.appendChild(el('div', 'seq-blank', '?'));
  box.appendChild(seqRow);

  const inp = el('input');
  inp.type = 'number'; inp.className = 'answer-input'; inp.placeholder = '?';
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') check(); });
  box.appendChild(inp);

  const chips = el('div', 'chips-box'); chips.id = 'chips1'; box.appendChild(chips);
  const btn = el('button', 'btn-check', 'Check Answer');
  btn.addEventListener('click', check); box.appendChild(btn);

  function check() {
    if (S.r.isSolved || btn.classList.contains('btn-wrong')) return;
    const val = parseInt(inp.value);
    if (isNaN(val)) { inp.classList.add('flash-error'); setTimeout(() => inp.classList.remove('flash-error'), 1500); return; }
    recordSubmission();
    if (S.r.firstAnswerCorrect === null) S.r.firstAnswerCorrect = (val === puzzle.answer);
    if (S.r.timeToFirstAttempt === null) S.r.timeToFirstAttempt = S.r.timeEngaged;
    S.r.attemptCount++;
    if (val === puzzle.answer) { onCorrect(); }
    else { addChip(chips, val); btnFeedback(btn, false, 'Check Answer'); }
    inp.value = '';
  }
}

// ════════════════════════════════════════════════════════════════════
// PUZZLE 2 — Alphabet Wheel
// ════════════════════════════════════════════════════════════════════

function renderPuzzle2(box) {
  const gen = genP2Sequence();
  S.r._p2seq = gen.shown;
  S.r._p2answer = gen.answer;
  let startIdx = Math.floor(Math.random() * 26);
  while (startIdx === S.r._p2answer) startIdx = Math.floor(Math.random() * 26);
  S.r._wheelIdx = startIdx;

  const title = el('p', 'headline', 'What letter comes next?');
  title.style.cssText = 'font-size:22px;text-align:center;color:var(--text-2);';
  box.appendChild(title);

  const seqDiv = el('div');
  seqDiv.id = 'p2seq';
  seqDiv.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center;margin-bottom:8px;';
  renderP2Sequence(seqDiv);
  box.appendChild(seqDiv);

  const wheelWrap = el('div', 'wheel-wrap');
  wheelWrap.id = 'wheel-wrap';
  renderWheel(wheelWrap);
  box.appendChild(wheelWrap);

  const btn = el('button', 'btn-check', 'Check Answer');
  btn.addEventListener('click', check); box.appendChild(btn);

  function check() {
    if (S.r.isSolved || btn.classList.contains('btn-wrong')) return;
    recordSubmission();
    const guess = S.r._wheelIdx;
    if (S.r.firstAnswerCorrect === null) S.r.firstAnswerCorrect = (guess === S.r._p2answer);
    if (S.r.timeToFirstAttempt === null) S.r.timeToFirstAttempt = S.r.timeEngaged;
    S.r.attemptCount++;
    if (guess === S.r._p2answer) { onCorrect(); }
    else {
      btnFeedback(btn, false, 'Check Answer');
      setTimeout(() => {
        const newGen = genP2Sequence();
        S.r._p2seq = newGen.shown;
        S.r._p2answer = newGen.answer;
        let newIdx = Math.floor(Math.random() * 26);
        while (newIdx === S.r._p2answer) newIdx = Math.floor(Math.random() * 26);
        S.r._wheelIdx = newIdx;
        const seqD = document.getElementById('p2seq');
        if (seqD) renderP2Sequence(seqD);
        const ww = document.getElementById('wheel-wrap');
        if (ww) renderWheel(ww);
      }, 1400);
    }
  }
}

function renderP2Sequence(container) {
  container.innerHTML = '';
  S.r._p2seq.forEach((idx, i) => {
    const span = el('span');
    span.style.cssText = 'font-family:"Bricolage Grotesque",sans-serif;font-weight:800;font-size:22px;color:var(--text-2);';
    span.textContent = LETTERS[idx];
    container.appendChild(span);
    if (i < S.r._p2seq.length - 1) {
      const dot = el('span'); dot.style.cssText = 'color:var(--lavender);font-size:18px;'; dot.textContent = '→';
      container.appendChild(dot);
    }
  });
  const arr = el('span'); arr.style.cssText = 'color:var(--lavender);font-size:18px;'; arr.textContent = '→';
  container.appendChild(arr);
  const q = el('span');
  q.style.cssText = 'font-family:"Bricolage Grotesque",sans-serif;font-weight:800;font-size:22px;color:var(--lavender);';
  q.textContent = '?';
  container.appendChild(q);
}

function renderWheel(container) {
  container.innerHTML = '';

  const ITEM_H = 62;
  const SHOW   = 5;
  const PAD    = 2;   // empty slots above and below so A/Z can center
  const W      = 130;

  // Drum wrapper (the visible window)
  const drumWrap = el('div', 'wheel-drum-wrap');
  drumWrap.style.cssText += `width:${W}px;height:${SHOW * ITEM_H}px;`;

  // Highlight stripe in the center slot
  const hl = el('div', 'wheel-hl');
  hl.style.cssText += `top:${PAD * ITEM_H}px;height:${ITEM_H}px;`;
  drumWrap.appendChild(hl);

  // The scrollable drum
  const drum = el('div', 'wheel-drum');
  drum.style.width = W + 'px';

  // Padding slots so first/last letter can be centered
  for (let p = 0; p < PAD; p++) {
    const pad = el('div'); pad.style.cssText = `height:${ITEM_H}px;width:${W}px;flex-shrink:0;`; drum.appendChild(pad);
  }
  for (let i = 0; i < 26; i++) {
    const item = el('div');
    item.dataset.li = i;
    item.style.cssText = `width:${W}px;height:${ITEM_H}px;display:flex;align-items:center;justify-content:center;font-family:'Bricolage Grotesque',sans-serif;font-weight:800;flex-shrink:0;`;
    item.textContent = LETTERS[i];
    drum.appendChild(item);
  }
  for (let p = 0; p < PAD; p++) {
    const pad = el('div'); pad.style.cssText = `height:${ITEM_H}px;width:${W}px;flex-shrink:0;`; drum.appendChild(pad);
  }

  drumWrap.appendChild(drum);

  function offsetFor(idx) { return -idx * ITEM_H; }
  function idxFromOffset(off) { return Math.round(-off / ITEM_H); }

  function styleItems(nearIdx) {
    drum.querySelectorAll('[data-li]').forEach(item => {
      const dist = Math.abs(parseInt(item.dataset.li) - nearIdx);
      item.style.color    = dist === 0 ? '#c084fc' : dist === 1 ? 'rgba(167,139,250,0.52)' : 'rgba(76,29,149,0.28)';
      item.style.fontSize = dist === 0 ? '40px'   : dist === 1 ? '27px'                    : '20px';
    });
  }

  function applyOffset(off, animate) {
    drum.style.transition = animate ? 'transform 0.18s cubic-bezier(0.25,0.46,0.45,0.94)' : 'none';
    drum.style.transform  = `translateY(${off}px)`;
  }

  function snapTo(idx) {
    idx = Math.max(0, Math.min(25, idx));
    S.r._wheelIdx = idx;
    applyOffset(offsetFor(idx), true);
    styleItems(idx);
  }

  // Initial render — no animation
  applyOffset(offsetFor(S.r._wheelIdx), false);
  styleItems(S.r._wheelIdx);

  // ── Drag (touch + mouse) ──
  let _startY = null, _startOff = null;
  const minOff = offsetFor(25), maxOff = offsetFor(0);

  function dragStart(y) {
    _startY   = y;
    _startOff = offsetFor(S.r._wheelIdx);
    drum.style.transition = 'none';
  }
  function dragMove(y) {
    if (_startY === null) return;
    const raw = Math.max(minOff, Math.min(maxOff, _startOff + (y - _startY)));
    drum.style.transform = `translateY(${raw}px)`;
    styleItems(idxFromOffset(raw));
  }
  function dragEnd(y) {
    if (_startY === null) return;
    const raw = Math.max(minOff, Math.min(maxOff, _startOff + (y - _startY)));
    snapTo(idxFromOffset(raw));
    _startY = null;
  }

  drumWrap.addEventListener('touchstart', e => dragStart(e.touches[0].clientY), { passive: true });
  drumWrap.addEventListener('touchmove',  e => dragMove(e.touches[0].clientY),  { passive: true });
  drumWrap.addEventListener('touchend',   e => dragEnd(e.changedTouches[0].clientY));

  let _md = false;
  drumWrap.addEventListener('mousedown', e => { _md = true; dragStart(e.clientY); e.preventDefault(); });
  const _mm = e => { if (_md) dragMove(e.clientY); };
  const _mu = e => { if (!_md) return; _md = false; dragEnd(e.clientY); };
  window.addEventListener('mousemove', _mm);
  window.addEventListener('mouseup',   _mu);

  // Clean up global listeners when wheel is removed from DOM
  const obs = new MutationObserver(() => {
    if (!document.contains(drumWrap)) {
      window.removeEventListener('mousemove', _mm);
      window.removeEventListener('mouseup',   _mu);
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  // Scroll-wheel support
  drumWrap.addEventListener('wheel', e => {
    e.preventDefault();
    snapTo(S.r._wheelIdx + (e.deltaY > 0 ? 1 : -1));
  }, { passive: false });

  container.appendChild(drumWrap);

  // Label below
  const hint = el('p');
  hint.style.cssText = 'font-family:"Space Grotesk",sans-serif;font-size:12px;color:rgba(196,181,253,0.55);letter-spacing:0.04em;';
  hint.textContent = 'scroll or drag to select';
  container.appendChild(hint);
}

function genP2Sequence() {
  const SHIFTS = [1, 3, 6, 10, 15];
  const start = Math.floor(Math.random() * 26);
  const seq = [start];
  for (const sh of SHIFTS) seq.push((seq[seq.length - 1] + sh) % 26);
  return { shown: seq.slice(0, 5), answer: seq[5] };
}

// ════════════════════════════════════════════════════════════════════
// PUZZLE 3 — Shape Sequence
// ════════════════════════════════════════════════════════════════════

const P3_COLORS     = ['Red','Blue','Green','Yellow','Purple','Orange'];
const P3_ROTS       = [0, 45, 90, 135, 180, 225, 270, 315];
const P3_SIDES_CYCLE = [3, 4, 5, 6]; // shapes cycle through this 4-element set

function genP3Sequence() {
  // Rule: each property independently cycles through its set.
  // Sides cycle [3,4,5,6], rotations advance +45°, colors advance +1.
  // Changing start positions gives visually distinct sequences with max 6 sides.
  const startSI = Math.floor(Math.random() * 4);
  const startRI = Math.floor(Math.random() * 8);
  const startCI = Math.floor(Math.random() * 6);
  const seq = [];
  for (let i = 0; i < 6; i++) {
    seq.push({
      sides:    P3_SIDES_CYCLE[(startSI + i) % 4],
      rotation: P3_ROTS[(startRI + i) % 8],
      color:    P3_COLORS[(startCI + i) % 6],
    });
  }
  return { shown: seq.slice(0, 5), answer: seq[5] };
}

function renderP3Preview(container) {
  container.innerHTML = '';
  S.r._p3seq.forEach((d, i) => {
    const wrap = el('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;flex-shrink:0;';
    const svg = makeSVGPolygon(d.sides, COLOR_HEX[d.color], 46, d.rotation);
    wrap.appendChild(svg);
    const lbl = el('span');
    lbl.style.cssText = 'font-family:"Space Grotesk",sans-serif;font-size:9px;font-weight:700;color:var(--lavender);letter-spacing:0.04em;text-transform:uppercase;';
    lbl.textContent = d.color;
    wrap.appendChild(lbl);
    container.appendChild(wrap);
    if (i < S.r._p3seq.length - 1) {
      const a = el('span'); a.style.cssText = 'color:var(--text);font-size:22px;'; a.textContent = '→';
      container.appendChild(a);
    }
  });
  const qmark = el('span');
  qmark.style.cssText = 'font-family:"Bricolage Grotesque",sans-serif;font-size:30px;color:var(--lavender);font-weight:700;margin-left:4px;';
  qmark.textContent = '→ ?';
  container.appendChild(qmark);
}

function renderPuzzle3(box) {
  // ── Generate initial puzzle ──
  function newPuzzle() {
    const gen = genP3Sequence();
    S.r._p3seq = gen.shown;
    S.r._p3answer = gen.answer;
    const others = P3_ROTS.filter(r => r !== gen.answer.rotation);
    return { ans: gen.answer, rotOpts: shuffle([gen.answer.rotation, ...shuffle(others).slice(0, 5)]) };
  }
  let { ans, rotOpts } = newPuzzle();
  const sel = { sides: P3_SIDES_CYCLE[0], color: P3_COLORS[0], rotation: rotOpts[0] };

  // Title
  const title = el('p', 'headline', 'What comes next in the sequence?');
  title.style.cssText = 'font-size:22px;text-align:center;color:var(--text);font-weight:600;';
  box.appendChild(title);

  // Sequence preview
  const seqDiv = el('div'); seqDiv.id = 'p3preview';
  seqDiv.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center;margin-bottom:6px;';
  renderP3Preview(seqDiv);
  box.appendChild(seqDiv);

  // ── Paint builder ──
  const paint = el('div', 'p3-paint');
  box.appendChild(paint);

  // Bar label helper
  function barLbl(txt) {
    const p = el('p');
    p.style.cssText = 'font-family:"Space Grotesk",sans-serif;font-size:9px;font-weight:700;letter-spacing:0.1em;color:var(--lavender);text-transform:uppercase;margin:0 0 5px 0;text-align:center;';
    p.textContent = txt;
    return p;
  }

  // ── LEFT: shape toolbar ──
  const shapeBar = el('div', 'p3-bar');
  shapeBar.appendChild(barLbl('Shape'));
  const shapeItems = [];
  P3_SIDES_CYCLE.forEach(sides => {
    const btn = el('div', 'p3-tool');
    if (sides === sel.sides) btn.classList.add('selected');
    btn.appendChild(makeSVGPolygon(sides, '#7c3aed', 24, 0, false));
    const lbl = el('span');
    lbl.style.cssText = 'font-size:9px;color:var(--text-2);margin-top:2px;font-family:"Space Grotesk",sans-serif;';
    lbl.textContent = sidesLabel(sides);
    btn.appendChild(lbl);
    btn.addEventListener('click', () => {
      if (S.r.isSolved) return;
      sel.sides = sides;
      shapeItems.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      refreshRotStrip(); updateCanvas();
    });
    shapeItems.push(btn);
    shapeBar.appendChild(btn);
  });
  paint.appendChild(shapeBar);

  // ── CENTER: canvas + rotation strip ──
  const center = el('div', 'p3-center');
  paint.appendChild(center);

  const canvas = el('div', 'p3-canvas');
  center.appendChild(canvas);

  function updateCanvas() {
    canvas.innerHTML = '';
    canvas.appendChild(makeSVGPolygon(sel.sides, COLOR_HEX[sel.color], 72, sel.rotation));
  }
  updateCanvas();

  const rotLbl = barLbl('Rotation');
  rotLbl.style.marginTop = '8px';
  center.appendChild(rotLbl);

  const rotStrip = el('div', 'p3-rot-strip');
  center.appendChild(rotStrip);
  const rotBtns = [];

  function buildRotBtn(rot) {
    const btn = el('div', 'p3-rot-btn');
    if (rot === sel.rotation) btn.classList.add('selected');
    btn.appendChild(makeSVGPolygon(sel.sides, COLOR_HEX[sel.color], 20, rot));
    const lbl = el('span');
    lbl.style.cssText = 'font-size:8px;color:var(--text-2);font-family:"Space Grotesk",sans-serif;';
    lbl.textContent = rot + '°';
    btn.appendChild(lbl);
    btn.addEventListener('click', () => {
      if (S.r.isSolved) return;
      sel.rotation = rot;
      rotBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      updateCanvas();
    });
    rotBtns.push(btn);
    return btn;
  }

  function refreshRotStrip() {
    rotStrip.innerHTML = ''; rotBtns.length = 0;
    rotOpts.forEach(rot => rotStrip.appendChild(buildRotBtn(rot)));
    // keep sel.rotation valid
    if (!rotOpts.includes(sel.rotation)) sel.rotation = rotOpts[0];
    rotBtns.forEach(b => b.classList.toggle('selected', +b.querySelector('span').textContent === sel.rotation));
  }
  refreshRotStrip();

  // ── RIGHT: color toolbar ──
  const colorBar = el('div', 'p3-color-bar');
  colorBar.appendChild(barLbl('Color'));
  const colorDots = [];
  P3_COLORS.forEach(col => {
    const btn = el('div', 'p3-tool');
    const swatch = el('div');
    swatch.style.cssText = `width:28px;height:28px;border-radius:8px;background:${COLOR_HEX[col]};flex-shrink:0;pointer-events:none;`;
    btn.appendChild(swatch);
    const lbl = el('span');
    lbl.style.cssText = 'font-size:9px;color:var(--text-2);font-family:"Space Grotesk",sans-serif;margin-top:1px;';
    lbl.textContent = col;
    btn.appendChild(lbl);
    if (col === sel.color) btn.classList.add('selected');
    btn.title = col;
    btn.addEventListener('click', () => {
      if (S.r.isSolved) return;
      sel.color = col;
      colorDots.forEach(d => d.classList.remove('selected'));
      btn.classList.add('selected');
      refreshRotStrip(); updateCanvas();
    });
    colorDots.push(btn);
    colorBar.appendChild(btn);
  });
  paint.appendChild(colorBar);

  const submitBtn = el('button', 'btn-check', 'Submit Answer');
  submitBtn.addEventListener('click', () => {
    if (S.r.isSolved || submitBtn.classList.contains('btn-wrong')) return;
    recordSubmission(); S.r.attemptCount++;
    if (S.r.firstAnswerCorrect === null) {
      S.r.firstAnswerCorrect = (sel.sides === ans.sides && sel.color === ans.color && sel.rotation === ans.rotation);
    }
    if (S.r.timeToFirstAttempt === null) S.r.timeToFirstAttempt = S.r.timeEngaged;

    if (sel.sides === ans.sides && sel.color === ans.color && sel.rotation === ans.rotation) {
      onCorrect();
    } else {
      btnFeedback(submitBtn, false, 'Submit Answer');
      setTimeout(() => {
        const next = newPuzzle();
        ans = next.ans; rotOpts = next.rotOpts;
        const pd = document.getElementById('p3preview');
        if (pd) renderP3Preview(pd);
        sel.sides = P3_SIDES_CYCLE[0]; sel.color = P3_COLORS[0];
        shapeItems.forEach((b, i) => b.classList.toggle('selected', i === 0));
        colorDots.forEach((d, i) => d.classList.toggle('selected', i === 0));
        refreshRotStrip(); updateCanvas();
      }, 1400);
    }
  });
  box.appendChild(submitBtn);
}

function sidesLabel(n) {
  const m = { 3:'Triangle',4:'Square',5:'Pentagon',6:'Hexagon',7:'Heptagon',8:'Octagon',9:'Nonagon',10:'Decagon',11:'Hendecagon',12:'Dodecagon' };
  return m[n] || n + '-gon';
}

// ════════════════════════════════════════════════════════════════════
// PUZZLE 4 — Hybrid (shape × multiplier)
// ════════════════════════════════════════════════════════════════════

const P4_SHAPES = [
  { label:'Triangle', sides:3 },
  { label:'Square',   sides:4 },
  { label:'Pentagon', sides:5 },
  { label:'Hexagon',  sides:6 },
];
const P4_COLOR_MAP = { 3:'#CC3311', 4:'#0077BB', 5:'#009988', 6:'#a855f7' }; // keyed by sides

function genP4Puzzle() {
  // Fixed puzzle — rule: value = sides × 4
  // Triangle=12, Square=16, Hexagon=24, Pentagon=? (answer: 20)
  const m = 4;
  const shapeSeq = [
    { label:'Triangle', sides:3, value: 12 },
    { label:'Square',   sides:4, value: 16 },
    { label:'Hexagon',  sides:6, value: 24 },
    { label:'Pentagon', sides:5, value: null },
  ];
  return { shapeSeq, answer: 20, m };
}

function renderP4Row(container, shapeSeq) {
  container.innerHTML = '';
  shapeSeq.forEach((item, i) => {
    const col = el('div', 'hybrid-shape');
    col.appendChild(makeSVGPolygon(item.sides, P4_COLOR_MAP[item.sides], 44, 0, false));
    const nameLbl = el('span');
    nameLbl.style.cssText = 'font-family:"Space Grotesk",sans-serif;font-size:9px;font-weight:700;color:var(--lavender);letter-spacing:0.04em;text-transform:uppercase;';
    nameLbl.textContent = item.label;
    col.appendChild(nameLbl);
    col.appendChild(item.value !== null
      ? el('div', 'hybrid-num', String(item.value))
      : el('div', 'hybrid-blank', '?'));
    container.appendChild(col);
    if (i < shapeSeq.length - 1) {
      container.appendChild(el('div', 'hybrid-plus', '→'));
    }
  });
}

function renderPuzzle4(box) {
  const gen = genP4Puzzle();
  S.r._p4answer = gen.answer;

  const title = el('p', 'headline', 'Find the missing number');
  title.style.cssText = 'font-size:22px;text-align:center;color:var(--text);font-weight:600;';
  box.appendChild(title);

  const row = el('div', 'hybrid-row'); row.id = 'p4row';
  renderP4Row(row, gen.shapeSeq);
  box.appendChild(row);

  const inp = el('input');
  inp.type = 'number'; inp.className = 'answer-input'; inp.placeholder = '?';
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') check(); });
  box.appendChild(inp);

  const chips = el('div', 'chips-box'); chips.id = 'chips4'; box.appendChild(chips);
  const btn = el('button', 'btn-check', 'Check Answer');
  btn.addEventListener('click', check); box.appendChild(btn);

  function check() {
    if (S.r.isSolved || btn.classList.contains('btn-wrong')) return;
    const val = parseInt(inp.value);
    if (isNaN(val)) { inp.classList.add('flash-error'); setTimeout(() => inp.classList.remove('flash-error'), 1500); return; }
    recordSubmission();
    if (S.r.firstAnswerCorrect === null) S.r.firstAnswerCorrect = (val === S.r._p4answer);
    if (S.r.timeToFirstAttempt === null) S.r.timeToFirstAttempt = S.r.timeEngaged;
    S.r.attemptCount++;
    if (val === S.r._p4answer) {
      onCorrect();
    } else {
      addChip(chips, val);
      btnFeedback(btn, false, 'Check Answer');
    }
    inp.value = '';
  }
}

// ════════════════════════════════════════════════════════════════════
// PUZZLE 5 — Tile Sequence
// ════════════════════════════════════════════════════════════════════

function renderPuzzle5(box, puzzle) {
  const title = el('p', 'headline', 'Find the missing number');
  title.style.cssText = 'font-size:22px;text-align:center;color:var(--text-2);';
  box.appendChild(title);

  const seqRow = el('div', 'seq-row');
  puzzle.sequence.forEach((n, i) => {
    seqRow.appendChild(el('div', 'seq-num', String(n)));
    seqRow.appendChild(el('span', 'seq-dot', '·'));
  });
  seqRow.appendChild(el('div', 'seq-blank', '?'));
  box.appendChild(seqRow);

  const inp = el('input');
  inp.type = 'number'; inp.className = 'answer-input'; inp.placeholder = '?';
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') check(); });
  box.appendChild(inp);

  const chips = el('div', 'chips-box'); chips.id = 'chips5'; box.appendChild(chips);
  const btn = el('button', 'btn-check', 'Check Answer');
  btn.addEventListener('click', check); box.appendChild(btn);

  function check() {
    if (S.r.isSolved || btn.classList.contains('btn-wrong')) return;
    const val = parseInt(inp.value);
    if (isNaN(val)) { inp.classList.add('flash-error'); setTimeout(() => inp.classList.remove('flash-error'), 1500); return; }
    recordSubmission();
    if (S.r.firstAnswerCorrect === null) S.r.firstAnswerCorrect = (val === puzzle.answer);
    if (S.r.timeToFirstAttempt === null) S.r.timeToFirstAttempt = S.r.timeEngaged;
    S.r.attemptCount++;
    if (val === puzzle.answer) { onCorrect(); }
    else { addChip(chips, val); btnFeedback(btn, false, 'Check Answer'); }
    inp.value = '';
  }
}

// ════════════════════════════════════════════════════════════════════
// ANSWER HELPERS
// ════════════════════════════════════════════════════════════════════

function showErr(errDiv, inp, msg) {
  if (errDiv) { errDiv.textContent = msg; setTimeout(() => { if (errDiv) errDiv.textContent = ''; }, 1800); }
  if (inp) { inp.classList.add('flash-error'); setTimeout(() => inp.classList.remove('flash-error'), 1500); }
}

function btnFeedback(btn, correct, label) {
  if (correct) {
    btn.textContent = '✓ Correct!';
    btn.classList.add('btn-correct');
  } else {
    btn.textContent = '✗ Incorrect';
    btn.classList.add('btn-wrong');
    setTimeout(() => {
      btn.classList.remove('btn-wrong');
      btn.textContent = label;
    }, 1400);
  }
}

function addChip(container, val) {
  const c = el('div', 'chip', String(val));
  container.appendChild(c);
}

function recordSubmission() {
  const now = Date.now();
  S.r.rawSubmissionTimestamps.push(now);
  // Rapid guess detection: 3+ submissions within 8s
  S.r._subTimestamps.push(now);
  S.r._subTimestamps = S.r._subTimestamps.filter(t => now - t <= 8000);
  if (S.r._subTimestamps.length >= 3) {
    S.r.rapidGuesses++;
    S.r._subTimestamps = [];
  }
}

// ════════════════════════════════════════════════════════════════════
// CORRECT ANSWER
// ════════════════════════════════════════════════════════════════════

function onCorrect() {
  S.r.isSolved = true;
  timerStop();
  logRound();
  const checkBtn = document.querySelector('#puzzle-box .btn-check');
  if (checkBtn) btnFeedback(checkBtn, true, '');
  setTimeout(() => {
    const isLast = S.currentRound === 4;
    // Clean up rage click listener
    if (_rageClickHandler) {
      document.body.removeEventListener('click', _rageClickHandler, true);
      _rageClickHandler = null;
    }
    if (isLast) showResults();
    else showLabelCard(S.currentRound + 1);
  }, 1200);
}

// ════════════════════════════════════════════════════════════════════
// TIMER
// ════════════════════════════════════════════════════════════════════

function timerStart() {
  S.r._timerPaused = false;
  S.r._timerAccum = 0;
  S.r._timerLastStart = Date.now();
  S.r._timerInterval = setInterval(() => {
    if (!S.r || S.r._timerPaused) return;
    S.r.timeEngaged = S.r._timerAccum + Math.floor((Date.now() - S.r._timerLastStart) / 1000);
    const timerEl = document.getElementById('timer');
    if (timerEl) timerEl.textContent = formatTime(S.r.timeEngaged);
    if (!S.r._skipEnabled && S.r.timeEngaged >= SKIP_ENABLE_SECONDS) {
      S.r._skipEnabled = true;
      const skipCorner = document.getElementById('corner-skip');
      if (skipCorner) {
        skipCorner.disabled = false;
        skipCorner.removeAttribute('title');
        skipCorner.style.cssText = 'margin-top:4px;';
        const note = document.getElementById('skip-note');
        if (note) note.remove();
      }
    }
  }, 500);
}

function timerPause(reason) {
  if (!S.r || S.r._timerPaused) return;
  S.r._timerPaused = true;
  if (S.r._timerLastStart) {
    S.r._timerAccum += Math.floor((Date.now() - S.r._timerLastStart) / 1000);
    S.r._timerLastStart = null;
  }
  if (reason === 'tab') S.r._tabPauseStart = Date.now();
}

function timerResume(reason) {
  if (!S.r || !S.r._timerPaused) return;
  S.r._timerPaused = false;
  S.r._timerLastStart = Date.now();
  if (reason === 'tab' && S.r._tabPauseStart) {
    S.r.tabSwitchTimePaused += (Date.now() - S.r._tabPauseStart) / 1000;
    S.r._tabPauseStart = null;
  }
}

function timerStop() {
  if (!S.r) return;
  clearInterval(S.r._timerInterval);
  S.r._timerInterval = null;
  if (!S.r._timerPaused && S.r._timerLastStart) {
    S.r._timerAccum += Math.floor((Date.now() - S.r._timerLastStart) / 1000);
    S.r._timerLastStart = null;
  }
  S.r.timeEngaged = S.r._timerAccum;
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ════════════════════════════════════════════════════════════════════
// TAB SWITCH
// ════════════════════════════════════════════════════════════════════

let _tabHandler = null;
let _blurHandler = null;
let _focusHandler = null;

function setupTabSwitch(app) {
  // Clean up previous listeners
  if (_tabHandler) document.removeEventListener('visibilitychange', _tabHandler);
  if (_blurHandler) window.removeEventListener('blur', _blurHandler);
  if (_focusHandler) window.removeEventListener('focus', _focusHandler);

  function showFocusOverlay() {
    if (document.getElementById('tab-overlay')) return;
    timerPause('tab');
    S.r.tabSwitchCount++;
    const ov = el('div', 'overlay');
    ov.id = 'tab-overlay';
    ov.innerHTML = `
      <div class="tab-overlay-msg">
        <p class="headline" style="font-size:24px;margin-bottom:10px;">Stay focused! 👀</p>
        <p class="body-text" style="font-size:15px;margin-bottom:14px;">The challenge is paused while you're away.</p>
        <p class="body-text" style="font-size:14px;color:#f87171;font-weight:600;margin-bottom:10px;">🚫 No AI or outside help — it affects our research data.</p>
        <p class="body-text" style="font-size:13px;color:rgba(196,181,253,0.7);line-height:1.5;">If you're stuck, use the <strong style="color:var(--text-2);">Skip</strong> button to proceed to the next round.</p>
      </div>`;
    document.getElementById('app').appendChild(ov);
  }

  function hideFocusOverlay() {
    const ov = document.getElementById('tab-overlay');
    if (!ov) return;
    timerResume('tab');
    ov.remove();
  }

  _tabHandler = () => {
    if (document.hidden) showFocusOverlay();
    else hideFocusOverlay();
  };
  _blurHandler = () => showFocusOverlay();
  _focusHandler = () => hideFocusOverlay();

  document.addEventListener('visibilitychange', _tabHandler);
  window.addEventListener('blur', _blurHandler);
  window.addEventListener('focus', _focusHandler);
}

function doSkip() {
  S.r.didSkip = true;
  timerStop();
  logRound();
  // Clean up rage click listener
  if (_rageClickHandler) {
    document.body.removeEventListener('click', _rageClickHandler, true);
    _rageClickHandler = null;
  }
  const isLast = S.currentRound === 4;
  if (isLast) showResults();
  else showLabelCard(S.currentRound + 1);
}

// ════════════════════════════════════════════════════════════════════
// RAGE CLICK
// ════════════════════════════════════════════════════════════════════

let _rageClickHandler = null;

function setupRageClickTracking(app) {
  // Clean up previous listener if it exists
  if (_rageClickHandler) {
    document.body.removeEventListener('click', _rageClickHandler);
  }

  _rageClickHandler = (e) => {
    if (!S.r) return;
    // Create a simple key for the element, e.g., 'BUTTON.btn-check' or 'DIV#p3-canvas'
    const key = e.target.tagName + (e.target.id ? `#${e.target.id}` : '') + (e.target.className ? `.${e.target.className.split(' ').join('.')}` : '');
    trackClick(key, Date.now());
  };

  document.body.addEventListener('click', _rageClickHandler, true); // Use capture to get all clicks
}

function trackClick(key, ts) {
  if (!S.r._clickMap[key]) S.r._clickMap[key] = [];
  const arr = S.r._clickMap[key];
  arr.push(ts);
  const recent = arr.filter(t => ts - t < 1000);
  S.r._clickMap[key] = recent;
  if (recent.length >= 3) {
    S.r.rageClicks++;
    S.r._clickMap[key] = [];
  }
}

// ════════════════════════════════════════════════════════════════════
// TELEMETRY LOG
// ════════════════════════════════════════════════════════════════════

async function logRound() {
  const puzzle = PUZZLE_BANK.find(p => p.id === S.r.puzzleId);
  const log = {
    userId: S.userId,
    roundNumber: S.currentRound + 1,
    puzzleId: S.r.puzzleId,
    timeEngaged: parseFloat(S.r.timeEngaged.toFixed(2)),
    isSolved: S.r.isSolved,
    didSkip: S.r.didSkip,
    attemptCount: S.r.attemptCount,
    firstAnswerCorrect: S.r.firstAnswerCorrect,
    timeToFirstAttempt: S.r.timeToFirstAttempt,
    rageClicks: S.r.rageClicks,
    rapidGuesses: S.r.rapidGuesses,
    rawSubmissionTimestamps: S.r.rawSubmissionTimestamps,
    tabSwitchCount: S.r.tabSwitchCount,
    tabSwitchTimePaused: parseFloat(S.r.tabSwitchTimePaused.toFixed(2)),
    treatment: S.treatment,
    isReplay: S.isReplay,
  };
  S.completedLogs.push(log);
  await saveGameLog(log);
}

function registerBeforeUnload() {
  const handler = () => {
    if (!S.r || S.r.isSolved || S.r.didSkip) return;
    const log = {
      userId: S.userId,
      roundNumber: S.currentRound + 1,
      puzzleId: S.r.puzzleId,
      timeEngaged: S.r.timeEngaged,
      isSolved: false, didSkip: false,
      attemptCount: S.r.attemptCount,
      rageClicks: S.r.rageClicks, rapidGuesses: S.r.rapidGuesses,
      rawSubmissionTimestamps: S.r.rawSubmissionTimestamps,
      tabSwitchCount: S.r.tabSwitchCount,
      tabSwitchTimePaused: S.r.tabSwitchTimePaused,
      treatment: S.treatment,
      isReplay: S.isReplay,
    };
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/log', JSON.stringify(log));
    }
    savePartialLog(log);
  };
  window.addEventListener('beforeunload', handler);
}

// ════════════════════════════════════════════════════════════════════
// RESULTS SCREEN
// ════════════════════════════════════════════════════════════════════

async function showResults() {
  clearDraft();
  // Mark this browser as played now so shared-device detection works even if
  // the user closes the tab before clicking the honesty check button
  const _replayKey = 'lpc_played_' + (S.ipAddress || 'local');
  localStorage.setItem(_replayKey, '1');
  localStorage.setItem('lpc_played', '1');
  // Mark user as having completed all 5 puzzles
  markSessionComplete(S.userId);
  // No tab-away modal on results screen
  if (_tabHandler)  document.removeEventListener('visibilitychange', _tabHandler);
  if (_blurHandler)  window.removeEventListener('blur', _blurHandler);
  if (_focusHandler) window.removeEventListener('focus', _focusHandler);
  _tabHandler = null; _blurHandler = null; _focusHandler = null;

  const totalScore = Math.max(0, S.completedLogs.reduce((sum, l) => sum + calcRoundScore(l), 0));
  // Save score to user doc so leaderboard reads users, not all gameLogs
  updateUserField(S.userId, { totalScore });

  go(app => {
    blobs(app);
    const s = el('div', 'screen');
    const inner = el('div', 'screen-inner');
    inner.style.paddingTop = '48px';
    inner.style.gap = '16px';
    inner.style.display = 'flex';
    inner.style.flexDirection = 'column';
    inner.style.alignItems = 'center';

    inner.innerHTML = `
      <h1 class="headline-grad" id="pct-headline" style="font-size:24px;text-align:center;">Calculating your rank…</h1>
      <p class="body-text" style="text-align:center;font-size:14px;">You crushed the Logic Challenge. Here's how your brain ranks against other players.</p>
      <div class="score-big" id="total-score">${totalScore}</div>
    `;

    // Per-round breakdown
    const breakdown = el('div'); breakdown.style.cssText = 'width:100%;display:flex;flex-direction:column;gap:8px;';
    S.completedLogs.forEach(log => {
      const rs = calcRoundScore(log);
      const row = el('div', 'round-row');
      row.innerHTML = `<span style="color:var(--text-2);">Round ${log.roundNumber}</span><span style="font-family:'Space Grotesk';font-size:12px;color:var(--lavender);">${log.isSolved ? '✅ Solved' : '⏭ Skipped'} · ${Math.round(log.timeEngaged)}s</span><span style="font-weight:700;color:${rs > 0 ? 'var(--green-light)' : 'var(--pink)'};">${rs > 0 ? '+' : ''}${rs}</span>`;
      breakdown.appendChild(row);
    });
    inner.appendChild(breakdown);

    // Percentile bar placeholder
    const barSection = el('div'); barSection.style.cssText = 'width:100%;';
    barSection.innerHTML = `<div class="pct-bar-track"><div class="pct-bar-fill" id="pct-bar"></div></div>`;
    inner.appendChild(barSection);

    // Honesty check
    const honSection = el('div'); honSection.style.cssText = 'width:100%;padding:20px;background:var(--card-grad);border:1.5px solid #4c1d9522;border-radius:16px;text-align:center;';
    honSection.innerHTML = `<p style="font-family:'Space Grotesk';font-size:14px;color:var(--text-2);line-height:1.5;margin-bottom:16px;">Before you go, one last thing: Did you use any outside help or AI tools to solve these? Seriously — you can be totally honest, we won't get mad! We're just checking the 'vibes' of our research data.</p>`;
    const honBtns = el('div', 'honesty-wrap');
    [['solo','💯 Solo — all me'], ['assisted','I used a little help / AI']].forEach(([val, lbl]) => {
      const btn = el('button', 'honesty-btn', lbl);
      btn.addEventListener('click', () => {
        updateHonestyCheck(S.userId, val);
        // Mark this browser as having completed a session
        const replayKey = 'lpc_played_' + (S.ipAddress || 'local');
        localStorage.setItem(replayKey, '1');
        localStorage.setItem('lpc_played', '1');
        clearDraft();
        // Replace honesty section with thank-you, then reset state and return to landing
        honSection.innerHTML = `
          <p style="font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:22px;color:var(--text);margin-bottom:6px;">Thank you! 🙏</p>
          <p style="font-family:'Space Grotesk',sans-serif;font-size:14px;color:var(--text-2);line-height:1.5;">Your response has been recorded. We really appreciate your honesty — it makes our research better.</p>
        `;
        setTimeout(async () => {
          resetSession();
          S.userId = await signInAnon();
          showLanding();
        }, 2200);
      });
      honBtns.appendChild(btn);
    });
    honSection.appendChild(honBtns);
    inner.appendChild(honSection);

    s.appendChild(inner);
    app.appendChild(s);

    // Async: fetch leaderboard and display percentile
    getLeaderboardScores().then(scores => {
      const headline = document.getElementById('pct-headline');
      const bar = document.getElementById('pct-bar');
      if (scores.length < 10) {
        if (headline) headline.textContent = 'Final Score:';
        const sub = el('p'); sub.style.cssText = 'font-family:"Space Grotesk";font-size:13px;color:var(--lavender);text-align:center;margin-top:-8px;';
        sub.textContent = 'You\'re one of our first players — check back soon for your percentile!';
        if (headline) headline.insertAdjacentElement('afterend', sub);
      } else {
        const lower = scores.filter(u => u.totalScore < totalScore).length;
        const pct = Math.round((lower / scores.length) * 100);
        const top = 100 - pct;
        if (headline) {
          headline.textContent = `Final Stats: You're in the Top ${top}%!`;
          headline.className = 'headline-grad';
          headline.style.fontSize = '22px';
          headline.style.textAlign = 'center';
        }
        if (bar) setTimeout(() => { bar.style.width = pct + '%'; }, 300);
      }
    });
  });
}

function calcRoundScore(log) {
  if (!log.isSolved) return 0;
  return 50 + Math.max(0, 50 - Math.floor(log.timeEngaged / 6));
}

// ════════════════════════════════════════════════════════════════════
// PIXEL ART SCENE (Section 10.7)
// ════════════════════════════════════════════════════════════════════

function makePixelScene() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 580 520');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;image-rendering:pixelated;';

  function rect(x, y, w, h, fill, opts) {
    const r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', x); r.setAttribute('y', y);
    r.setAttribute('width', w); r.setAttribute('height', h);
    r.setAttribute('fill', fill);
    if (opts) Object.entries(opts).forEach(([k, v]) => r.setAttribute(k, v));
    return r;
  }

  // ── Moon (top-left) ──
  const moonG = document.createElementNS(ns, 'g');
  moonG.style.animation = 'moonGlow 4s ease-in-out infinite';
  moonG.appendChild(rect(18, 18, 14, 14, '#fde68a'));
  moonG.appendChild(rect(24, 16, 10, 4, '#fde68a'));
  moonG.appendChild(rect(28, 18, 4, 6, '#0f0720'));
  moonG.appendChild(rect(26, 22, 6, 6, '#0f0720'));
  svg.appendChild(moonG);

  // ── Stars ──
  [[48,22],[60,14],[36,38],[72,30],[50,44]].forEach(([x,y]) => {
    const s = rect(x, y, 2, 2, '#c4b5fd');
    s.setAttribute('opacity', (0.3 + Math.random()*0.15).toFixed(2));
    svg.appendChild(s);
  });

  // ── Clouds ──
  function cloud(x, y, dur, dir) {
    const g = document.createElementNS(ns, 'g');
    g.style.animation = `cloudDrift ${dur}s ease-in-out infinite ${dir}`;
    [[0,4,20,8],[8,0,24,6],[20,2,16,8],[4,10,28,6]].forEach(([ox,oy,w,h]) => {
      g.appendChild(rect(x+ox, y+oy, w, h, '#c4b5fd', {opacity:'0.10'}));
    });
    return g;
  }
  svg.appendChild(cloud(80,  40, 7,  ''));
  svg.appendChild(cloud(200, 30, 8,  'alternate-reverse'));
  svg.appendChild(cloud(360, 50, 10, 'alternate'));

  // ── Ground strip ──
  svg.appendChild(rect(0, 488, 580, 3, '#1e0a3c'));
  svg.appendChild(rect(0, 491, 580, 3, '#160830'));
  svg.appendChild(rect(0, 494, 580, 3, '#0f0720'));

  // ── Grass wall ──
  for (let x = 0; x < 580; x += 4) {
    const h = 8 + (x * 7 + 13) % 9;
    const fill = x % 12 === 0 ? '#16a34a' : x % 8 === 0 ? '#15803d' : '#22c55e';
    const opacity = (x > 60 && x < 90) ? '0.28' : '0.82'; // eaten patch near llama
    svg.appendChild(rect(x, 488 - h, 4, h, fill, {opacity}));
  }

  // ── Flowers ──
  [[100,472],[180,476],[300,470],[420,474],[500,472]].forEach(([x,y],i) => {
    svg.appendChild(rect(x, y, 2, 6, '#22c55e'));
    const petals = i%2===0 ? '#f9a8d4' : '#c084fc';
    [[-2,-2],[0,-4],[2,-2],[-2,0],[2,0]].forEach(([ox,oy]) => svg.appendChild(rect(x+ox, y+oy, 2, 2, petals)));
  });

  // ── Llamas ──
  const ly = 445;

  function drawLlamaInto(g, saddle1, saddle2) {
    const lx = 0;
    g.appendChild(rect(lx+8,  ly+10, 22, 18, '#e2d9f3'));
    g.appendChild(rect(lx+10, ly+12, 18, 14, '#f0e6ff'));
    g.appendChild(rect(lx+10, ly+12, 18,  6, saddle1));
    g.appendChild(rect(lx+12, ly+14, 14,  4, saddle2));
    g.appendChild(rect(lx+24, ly+2,   8, 12, '#e2d9f3'));
    g.appendChild(rect(lx+22, ly,    12, 10, '#f0e6ff'));
    g.appendChild(rect(lx+30, ly+2,   2,  2, '#1e0a3c'));
    g.appendChild(rect(lx+24, ly-4,   4,  6, '#e2d9f3'));
    g.appendChild(rect(lx+25, ly-3,   2,  4, saddle2));
    g.appendChild(rect(lx+10, ly+28,  4, 10, '#ddd6fe'));
    g.appendChild(rect(lx+16, ly+28,  4, 10, '#ddd6fe'));
    g.appendChild(rect(lx+22, ly+28,  4, 10, '#ddd6fe'));
    g.appendChild(rect(lx+10, ly+36,  4,  4, '#4c1d95'));
    g.appendChild(rect(lx+16, ly+36,  4,  4, '#4c1d95'));
    g.appendChild(rect(lx+22, ly+36,  4,  4, '#4c1d95'));
    g.appendChild(rect(lx+4,  ly+12,  6,  8, '#e2d9f3'));
  }

  function makeLlamaGroup(saddle1, saddle2, munchDur) {
    const walkG  = document.createElementNS(ns, 'g');
    const flipG  = document.createElementNS(ns, 'g');
    const munchG = document.createElementNS(ns, 'g');
    munchG.style.animation = `llamaMunch ${munchDur}s steps(2) infinite`;
    drawLlamaInto(munchG, saddle1, saddle2);
    flipG.appendChild(munchG);
    walkG.appendChild(flipG);
    return { walkG, flipG };
  }

  function setFacing(flipEl, dir) {
    flipEl.style.transform = dir < 0 ? 'translateX(34px) scaleX(-1)' : '';
  }

  const ll1 = makeLlamaGroup('#7c3aed', '#f9a8d4', 0.9);
  const ll2 = makeLlamaGroup('#0d9488', '#f9a8d4', 1.1);
  svg.appendChild(ll1.walkG);
  svg.appendChild(ll2.walkG);

  // JS-driven bounce — stays within grass, flips to face direction of travel
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    if (window._llamaRaf) cancelAnimationFrame(window._llamaRaf);
    const SPEED = 7, MIN_X = 10, MAX_X = 538;
    // nextPauseIn: ms of walking before a random mid-walk graze pause
    function mkSt(x, dir) {
      return { x, dir, grazeTil: 0, walked: 0, nextPauseIn: 8000 + Math.random() * 12000 };
    }
    const st1 = mkSt(30, 1);
    const st2 = mkSt(420, -1);
    let lastTs = null;

    function stepLlama(st, ts, dt) {
      if (ts <= st.grazeTil) return;
      st.x += st.dir * SPEED * dt / 1000;
      st.walked += SPEED * dt / 1000;
      // Random mid-walk pause
      if (st.walked >= st.nextPauseIn / 1000 * SPEED) {
        st.walked = 0;
        st.nextPauseIn = 8000 + Math.random() * 12000;
        st.grazeTil = ts + 5000 + Math.random() * 7000;
        return;
      }
      // Wall bounce
      if (st.x >= MAX_X) {
        st.x = MAX_X; st.dir = -1;
        st.walked = 0;
        st.nextPauseIn = 8000 + Math.random() * 12000;
        st.grazeTil = ts + 6000 + Math.random() * 8000;
      } else if (st.x <= MIN_X) {
        st.x = MIN_X; st.dir = 1;
        st.walked = 0;
        st.nextPauseIn = 8000 + Math.random() * 12000;
        st.grazeTil = ts + 6000 + Math.random() * 8000;
      }
    }

    function tickLlamas(ts) {
      if (!lastTs) lastTs = ts;
      const dt = Math.min(ts - lastTs, 80);
      lastTs = ts;
      stepLlama(st1, ts, dt);
      ll1.walkG.style.transform = `translateX(${st1.x}px)`;
      setFacing(ll1.flipG, st1.dir);
      stepLlama(st2, ts, dt);
      ll2.walkG.style.transform = `translateX(${st2.x}px)`;
      setFacing(ll2.flipG, st2.dir);
      window._llamaRaf = requestAnimationFrame(tickLlamas);
    }
    window._llamaRaf = requestAnimationFrame(tickLlamas);
  } else {
    ll1.walkG.style.transform = 'translateX(30px)';
    ll2.walkG.style.transform = 'translateX(420px)';
    setFacing(ll2.flipG, -1);
  }

  return svg;
}

// ════════════════════════════════════════════════════════════════════
// SVG POLYGON HELPER
// ════════════════════════════════════════════════════════════════════

function makeSVGPolygon(sides, color, size, rotationDeg, showDot = true) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  const cx = size / 2, cy = size / 2, r = size * 0.42;
  const points = [];
  const angle0 = -Math.PI / 2 + (rotationDeg * Math.PI / 180);
  for (let i = 0; i < sides; i++) {
    const angle = angle0 + (2 * Math.PI * i / sides);
    points.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  const poly = document.createElementNS(ns, 'polygon');
  poly.setAttribute('points', points.join(' '));
  poly.setAttribute('fill', color);
  poly.setAttribute('stroke', 'rgba(255,255,255,0.15)');
  poly.setAttribute('stroke-width', '1.5');
  svg.appendChild(poly);

  // Rotation indicator dot at the first vertex
  if (showDot) {
    const dotR = Math.max(2, size * 0.07);
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', (cx + r * Math.cos(angle0)).toFixed(2));
    dot.setAttribute('cy', (cy + r * Math.sin(angle0)).toFixed(2));
    dot.setAttribute('r', dotR.toFixed(1));
    dot.setAttribute('fill', 'white');
    dot.setAttribute('stroke', 'rgba(0,0,0,0.3)');
    dot.setAttribute('stroke-width', '1');
    svg.appendChild(dot);
  }
  return svg;
}

// ════════════════════════════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════════════════════════════

function fisherYates(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function shuffle(arr) { return fisherYates([...arr]); }
