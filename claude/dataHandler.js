// All Firestore reads/writes. No game logic here.
// When db = null (Firebase not yet configured), operations fall back to localStorage.

import { db, auth } from './firebase-config.js';

// Lazily loaded Firebase modules — only imported when db is non-null
let _addDoc, _collection, _getDocs, _updateDoc, _doc, _signInAnonymously;

async function loadFirebase() {
  if (!db) return false;
  if (_addDoc) return true;
  try {
    const fs = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const au = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    _addDoc = fs.addDoc;
    _collection = fs.collection;
    _getDocs = fs.getDocs;
    _updateDoc = fs.updateDoc;
    _doc = fs.doc;
    _signInAnonymously = au.signInAnonymously;
    return true;
  } catch {
    return false;
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function signInAnon() {
  if (!auth) {
    // Generate a stable local ID for this browser session
    let id = sessionStorage.getItem('localUserId');
    if (!id) {
      id = 'local_' + Math.random().toString(36).slice(2, 11);
      sessionStorage.setItem('localUserId', id);
    }
    return id;
  }
  try {
    await loadFirebase();
    const cred = await _signInAnonymously(auth);
    return cred.user.uid;
  } catch (e) {
    console.warn('Anonymous auth failed, using local ID:', e);
    return 'local_' + Math.random().toString(36).slice(2, 11);
  }
}

// ── Users collection ──────────────────────────────────────────────────────────

export async function createUser(userObject) {
  const ok = await loadFirebase();
  if (!ok) {
    localStorage.setItem('userData_' + userObject.userId, JSON.stringify(userObject));
    return userObject.userId;
  }
  await writeWithRetry(() => _addDoc(_collection(db, 'users'), userObject), userObject.userId, 'user');
  return userObject.userId;
}

export async function updateUserField(userId, fields) {
  const ok = await loadFirebase();
  if (!ok) {
    const key = 'userData_' + userId;
    const existing = JSON.parse(localStorage.getItem(key) || '{}');
    localStorage.setItem(key, JSON.stringify({ ...existing, ...fields }));
    return;
  }
  // updateDoc requires the document reference — userId is the auto-doc id stored separately
  // For simplicity the caller passes userId which may be the Firestore doc id stored in state
  // TODO: store the Firestore doc ref at createUser time and pass it here for updateDoc to work
  // await writeWithRetry(() => _updateDoc(_doc(db, 'users', userId), fields), userId, 'userUpdate');
}

// ── gameLogs collection ───────────────────────────────────────────────────────

export async function saveGameLog(logObject) {
  const ok = await loadFirebase();
  if (!ok) {
    const key = `gameLog_${logObject.userId}_${logObject.roundNumber}`;
    localStorage.setItem(key, JSON.stringify(logObject));
    return;
  }
  // TODO: import { db } from './firebase-config.js'
  // TODO: addDoc(collection(db, 'gameLogs'), logObject)
  await writeWithRetry(() => _addDoc(_collection(db, 'gameLogs'), logObject), logObject.userId, logObject.roundNumber);
}

export async function savePartialLog(logObject) {
  // Called from beforeunload — best-effort, no retry
  const ok = await loadFirebase();
  if (!ok) {
    localStorage.setItem(`partialLog_${logObject.userId}_${logObject.roundNumber}`, JSON.stringify(logObject));
    return;
  }
  try {
    await _addDoc(_collection(db, 'gameLogs'), logObject);
  } catch {
    localStorage.setItem(`partialLog_${logObject.userId}_${logObject.roundNumber}`, JSON.stringify(logObject));
  }
}

// ── Honesty check ─────────────────────────────────────────────────────────────

export async function updateHonestyCheck(userId, value) {
  const ok = await loadFirebase();
  if (!ok) {
    const key = 'userData_' + userId;
    const existing = JSON.parse(localStorage.getItem(key) || '{}');
    existing.honestyCheck = value;
    localStorage.setItem(key, JSON.stringify(existing));
    return;
  }
  // TODO: updateDoc(doc(db, 'users', userId), { honestyCheck: value })
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export async function getLeaderboardScores() {
  const ok = await loadFirebase();
  if (!ok) {
    // Aggregate local logs for a local-only leaderboard
    return collectLocalScores();
  }
  try {
    // TODO: getDocs(collection(db, 'gameLogs')) → filter + aggregate
    const snap = await _getDocs(_collection(db, 'gameLogs'));
    const allLogs = snap.docs.map(d => d.data());
    return aggregateScores(allLogs);
  } catch (e) {
    console.warn('Leaderboard fetch failed:', e);
    return [];
  }
}

function aggregateScores(allLogs) {
  // Group by userId, keep only users with exactly 5 sessionComplete=true rounds
  const byUser = {};
  for (const log of allLogs) {
    if (!log.sessionComplete) continue;
    if (!byUser[log.userId]) byUser[log.userId] = [];
    byUser[log.userId].push(log);
  }
  const scores = [];
  for (const [uid, logs] of Object.entries(byUser)) {
    if (logs.length !== 5) continue;
    const total = Math.max(0, logs.reduce((sum, l) => sum + calcRoundScore(l), 0));
    scores.push({ userId: uid, totalScore: total });
  }
  return scores;
}

function collectLocalScores() {
  const scores = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key.startsWith('gameLog_')) continue;
    const log = JSON.parse(localStorage.getItem(key));
    if (!log.sessionComplete) continue;
    if (!scores[log.userId]) scores[log.userId] = [];
    scores[log.userId].push(log);
  }
  const result = [];
  for (const [uid, logs] of Object.entries(scores)) {
    if (logs.length !== 5) continue;
    result.push({ userId: uid, totalScore: Math.max(0, logs.reduce((s, l) => s + calcRoundScore(l), 0)) });
  }
  return result;
}

function calcRoundScore(log) {
  return (log.isSolved ? 100 : 0) + Math.max(0, 500 - log.timeEngaged) - (log.didSkip ? 50 : 0);
}

// ── Retry / error handling ────────────────────────────────────────────────────

async function writeWithRetry(fn, userId, tag) {
  try {
    await fn();
  } catch (e) {
    console.warn(`Firestore write failed (${tag}), retrying in 2s…`, e);
    await new Promise(r => setTimeout(r, 2000));
    try {
      await fn();
    } catch (e2) {
      console.error(`Firestore retry also failed (${tag}):`, e2);
      localStorage.setItem(`failedLog_${userId}_${tag}`, JSON.stringify({ firestoreFailed: true, error: String(e2) }));
    }
  }
}
