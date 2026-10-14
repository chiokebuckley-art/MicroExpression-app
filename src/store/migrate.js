/**
 * One-time migration from prototype localStorage ('mxTrainer.v1') to IndexedDB.
 */

import { getProgress, updateProgress, putRecord } from './db.js';

export async function migrateFromLocalStorage() {
  const prog = await getProgress();
  if (prog.migratedV1) return { migrated: false };

  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('mxTrainer.v1') : null;
    if (!raw) {
      await updateProgress({ migratedV1: true });
      return { migrated: false };
    }
    const parsed = JSON.parse(raw);
    let migratedTrials = 0;

    if (Array.isArray(parsed.trials)) {
      for (let i = 0; i < parsed.trials.length; i++) {
        const t = parsed.trials[i];
        const shownEm = t.shownEmotion || t.itemId || 'happiness';
        await putRecord('trials', {
          id: t.id || `migrated_trial_${i}_${Date.now()}`,
          sessionId: t.sessionId || 'migrated_v1',
          level: t.level || 7,
          itemId: shownEm,
          shownEmotion: shownEm,
          chosenEmotion: t.response || t.chosenEmotion || null,
          response: t.response || null,
          correct: Boolean(t.correct),
          nominalMs: t.nominalMs || t.dur || 200,
          frames: t.frames || 12,
          actualFrames: t.frames || 12,
          actualMs: t.actualMs || t.dur || 200,
          frameMs: t.frameMs || 16.67,
          timingValid: t.timingValid !== false,
          rtMs: t.rtMs || 800,
          replayed: Boolean(t.replayed),
          ts: t.ts || Date.now(),
          timestamp: t.ts || Date.now()
        });
        migratedTrials++;
      }
    }

    if (parsed.staircases && typeof parsed.staircases === 'object') {
      for (const [emotion, st] of Object.entries(parsed.staircases)) {
        await putRecord('staircases', {
          emotion,
          stepIndex: st.ladderIdx ?? 2,
          ladderIdx: st.ladderIdx ?? 2,
          streak: st.streak ?? 0,
          reversals: Array.isArray(st.reversals) ? st.reversals : []
        });
      }
    }

    await updateProgress({ migratedV1: true });
    localStorage.removeItem('mxTrainer.v1');
    return { migrated: true, migratedTrials };
  } catch (err) {
    console.warn('Migration from mxTrainer.v1 encountered non-fatal error:', err);
    await updateProgress({ migratedV1: true });
    return { migrated: false, error: String(err) };
  }
}

export const runStartupMigrations = migrateFromLocalStorage;
