/**
 * IndexedDB storage layer for Reading Faces (MicroExpression App).
 * All data stays on-device in IndexedDB ('readingFacesDB', v1).
 */

const DB_NAME = 'readingFacesDB';
const DB_VERSION = 1;

export const STORES = [
  'trials',
  'sessions',
  'staircases',
  'reviewCards',
  'assessments',
  'mirrorAttempts',
  'progress'
];

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('trials')) {
        const s = db.createObjectStore('trials', { keyPath: 'id' });
        s.createIndex('by_level', 'level', { unique: false });
        s.createIndex('by_ts', 'ts', { unique: false });
      }
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('staircases')) {
        db.createObjectStore('staircases', { keyPath: 'emotion' });
      }
      if (!db.objectStoreNames.contains('reviewCards')) {
        const s = db.createObjectStore('reviewCards', { keyPath: 'id' });
        s.createIndex('by_due', 'dueAt', { unique: false });
        s.createIndex('by_kind', 'kind', { unique: false });
      }
      if (!db.objectStoreNames.contains('assessments')) {
        db.createObjectStore('assessments', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('mirrorAttempts')) {
        db.createObjectStore('mirrorAttempts', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('progress')) {
        db.createObjectStore('progress', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function putRecord(storeName, record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getRecord(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllRecords(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function clearStore(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const DEFAULT_PROGRESS = {
  id: 'main',
  ethicsPassedAt: null,
  ethicsCompleted: false,
  levelMastery: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 },
  unlockAll: false,
  bypassEthicsGateForTest: false,
  reducedMotion: false,
  quality: 'high',
  activeIdentityId: 'riya',
  calibratedFrameMs: 16.67,
  calibratedHz: 60,
  migratedV1: false
};

export async function getProgress() {
  const existing = await getRecord('progress', 'main');
  if (!existing) {
    const init = { ...DEFAULT_PROGRESS, levelMastery: { ...DEFAULT_PROGRESS.levelMastery } };
    await putRecord('progress', init);
    return init;
  }
  return {
    ...DEFAULT_PROGRESS,
    ...existing,
    levelMastery: { ...DEFAULT_PROGRESS.levelMastery, ...(existing.levelMastery || {}) }
  };
}

export async function updateProgress(patch) {
  const cur = await getProgress();
  const next = {
    ...cur,
    ...patch,
    levelMastery: {
      ...cur.levelMastery,
      ...(patch.levelMastery || {})
    }
  };
  await putRecord('progress', next);
  return next;
}

export async function recordLevelScore(levelNum, accuracy) {
  const cur = await getProgress();
  const prev = cur.levelMastery[levelNum] || 0;
  const best = Math.max(prev, Math.round(accuracy <= 1 ? accuracy * 100 : accuracy));
  return updateProgress({
    levelMastery: { [levelNum]: best }
  });
}

export async function isLevelUnlocked(levelNum) {
  const p = await getProgress();
  if (levelNum >= 6) {
    const ethicsOk = Boolean(p.ethicsPassedAt) || Boolean(p.ethicsCompleted);
    if (!ethicsOk) return false;
  }
  if (p.unlockAll) return true;
  if (levelNum <= 1) return true;
  const prevMastery = p.levelMastery[levelNum - 1] || 0;
  return prevMastery >= 70;
}

// High-level convenience wrappers used by training & UI modules
let trialSeq = 0;

export async function logTrial(record) {
  const ts = record.timestamp || record.ts || Date.now();
  const id = record.id || `trial_${ts}_${++trialSeq}`;
  return putRecord('trials', {
    firstTry: record.firstTry ?? true,
    hintUsed: record.hintUsed ?? false,
    ...record,
    id,
    ts,
    timestamp: ts
  });
}

export async function getTrials() {
  return getAllRecords('trials');
}

export async function getStaircases() {
  return getAllRecords('staircases');
}

export async function saveStaircase(staircaseRecord) {
  return putRecord('staircases', staircaseRecord);
}

export async function getSRSCard(key) {
  return getRecord('reviewCards', key);
}

export async function putSRSCard(card) {
  return putRecord('reviewCards', {
    ...card,
    id: card.key || card.id
  });
}

export async function getAllSRSCards() {
  return getAllRecords('reviewCards');
}

export async function getAssessments() {
  return getAllRecords('assessments');
}

export async function saveAssessment(assessment) {
  const id = assessment.id || `assess_${assessment.timestamp || Date.now()}`;
  return putRecord('assessments', { ...assessment, id });
}

export async function getAllSettings() {
  const p = await getProgress();
  return {
    unlockAll: Boolean(p.unlockAll),
    ethicsCompleted: Boolean(p.ethicsCompleted || p.ethicsPassedAt),
    reducedMotion: Boolean(p.reducedMotion),
    quality: p.quality || 'high',
    activeIdentityId: p.activeIdentityId || 'riya'
  };
}

export async function saveSetting(key, value) {
  const patch = { [key]: value };
  if (key === 'ethicsCompleted' && value) {
    patch.ethicsPassedAt = Date.now();
  }
  return updateProgress(patch);
}

export async function getLevelProgressMap() {
  const p = await getProgress();
  const list = [];
  for (let i = 1; i <= 10; i++) {
    const score = p.levelMastery?.[i] || 0;
    list.push({
      levelId: i,
      completed: Boolean(p.levelCompleted?.[i]),
      bestScore: score
    });
  }
  return list;
}

export async function saveLevelProgress({ levelId, completed, bestScore }) {
  const score = Number(bestScore) || 0;
  await recordLevelScore(levelId, score);
  const p = await getProgress();
  return updateProgress({levelCompleted: {...(p.levelCompleted||{}), [levelId]: Boolean(p.levelCompleted?.[levelId] || completed)}});
}
