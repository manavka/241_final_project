// All Firestore reads/writes. No game logic here.
// When db = null (Firebase not yet configured), operations fall back to localStorage.

import { db, auth } from './firebase-config.js';

// Lazily loaded Firebase modules — only imported when db is non-null
let _addDoc, _collection, _getDocs, _updateDoc, _doc, _query, _where, _getDoc, _signInAnonymously, _arrayUnion;

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
    _query = fs.query;
    _where = fs.where;
    _getDoc = fs.getDoc;
    _arrayUnion = fs.arrayUnion;
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
  // Because createUser uses addDoc (which auto-generates a document ID),
  // we can't use the auth `userId` to get a direct document reference.
  // We must query the collection to find the document where the `userId` field matches.
  try {
    const q = _query(_collection(db, 'users'), _where('userId', '==', userId));
    const querySnapshot = await _getDocs(q);
    if (!querySnapshot.empty) {
      const userDocRef = querySnapshot.docs[0].ref;
      await writeWithRetry(() => _updateDoc(userDocRef, fields), userId, 'userUpdate');
    } else {
      console.warn(`Could not find user document for userId: ${userId} to update.`);
    }
  } catch (e) {
    console.error(`Failed to query and update user ${userId}:`, e);
  }
}

export async function appendUserArrayField(userId, field, value) {
  const ok = await loadFirebase();
  if (!ok) {
    const key = 'userData_' + userId;
    const existing = JSON.parse(localStorage.getItem(key) || '{}');
    existing[field] = [...(existing[field] || []), value];
    localStorage.setItem(key, JSON.stringify(existing));
    return;
  }
  try {
    const q = _query(_collection(db, 'users'), _where('userId', '==', userId));
    const snap = await _getDocs(q);
    if (!snap.empty) {
      await writeWithRetry(() => _updateDoc(snap.docs[0].ref, { [field]: _arrayUnion(value) }), userId, 'arrayAppend');
    } else {
      console.warn(`Could not find user document for userId: ${userId} to append array field.`);
    }
  } catch (e) {
    console.error(`Failed to append array field for user ${userId}:`, e);
  }
}

// ── gameLogs collection ───────────────────────────────────────────────────────

export async function markSessionComplete(userId) {
  await updateUserField(userId, { sessionComplete: true });
}

export async function getUserGameLogs(userId) {
  const ok = await loadFirebase();
  if (!ok) {
    // Collect from localStorage fallback
    const logs = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`gameLog_${userId}`)) {
        try { logs.push(JSON.parse(localStorage.getItem(key))); } catch {}
      }
    }
    return logs;
  }
  try {
    const q = _query(_collection(db, 'gameLogs'), _where('userId', '==', userId));
    const snap = await _getDocs(q);
    return snap.docs.map(d => d.data());
  } catch (e) {
    console.warn('Failed to fetch prior game logs:', e);
    return [];
  }
}

export async function saveGameLog(logObject) {
  const ok = await loadFirebase();
  if (!ok) {
    const key = `gameLog_${logObject.userId}_${logObject.roundNumber}`;
    localStorage.setItem(key, JSON.stringify(logObject));
    return;
  }
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
  await updateUserField(userId, { honestyCheck: value });
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export async function getLeaderboardScores() {
  const ok = await loadFirebase();
  if (!ok) {
    return collectLocalScores();
  }
  try {
    // Read completed user docs only — totalScore is written at session end
    const q = _query(_collection(db, 'users'), _where('sessionComplete', '==', true));
    const snap = await _getDocs(q);
    return snap.docs.map(d => ({ userId: d.data().userId, totalScore: d.data().totalScore || 0 }));
  } catch (e) {
    console.warn('Leaderboard fetch failed:', e);
    return [];
  }
}

function collectLocalScores() {
  const result = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key.startsWith('userData_')) continue;
    try {
      const user = JSON.parse(localStorage.getItem(key));
      if (user.sessionComplete && user.totalScore != null) {
        result.push({ userId: user.userId, totalScore: user.totalScore });
      }
    } catch {}
  }
  return result;
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
