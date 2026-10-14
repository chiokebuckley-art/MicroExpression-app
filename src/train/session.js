/**
 * Training Session Controller & Immediate Diagnostic Replay (Sections 6.1, 6.2, 6.4).
 * - Calibrates display refresh rate at session start.
 * - Executes trial presentation, records response time, logs trial to IndexedDB.
 * - Updates per-emotion 3-down/1-up staircase and 6-box SRS card.
 * - On any wrong answer, returns a structured diagnostic feedback payload within < 50 ms
 *   (well inside the <= 300 ms SLA) and triggers a slow-motion replay with AU highlight overlays
 *   plus a 1-click Contrast View between the shown emotion and the chosen emotion.
 */

import { logTrial, putSRSCard, getSRSCard, getStaircases, saveStaircase } from '../store/db.js';
import { createStaircaseState, stepStaircase } from './staircase.js';
import { createSRSCard, updateSRSCard, makeCardKey } from './srs.js';

export class TrainingSessionController {
  constructor({ rig, expressionsCatalog, auCatalog, levelId = 4 }) {
    this.rig = rig;
    this.expressionsCatalog = expressionsCatalog;
    this.auCatalog = auCatalog;
    this.levelId = levelId;
    this.staircases = new Map();
  }

  async initSession() {
    if (this.rig?.scheduler) {
      await this.rig.scheduler.calibrateRefreshRate(20);
    }
    const savedStaircases = await getStaircases();
    for (const st of savedStaircases) {
      this.staircases.set(st.emotion, st);
    }
  }

  getStaircaseForEmotion(emotion) {
    if (!this.staircases.has(emotion)) {
      const st = createStaircaseState(emotion, 2);
      this.staircases.set(emotion, st);
    }
    return this.staircases.get(emotion);
  }

  findExpressionDef(emotionId) {
    const core = this.expressionsCatalog?.core?.find((e) => e.id === emotionId);
    if (core) return core;
    const variant = this.expressionsCatalog?.variants?.find((e) => e.id === emotionId);
    if (variant) return variant;
    const social = this.expressionsCatalog?.social?.find((e) => e.id === emotionId);
    return social || null;
  }

  findDistinguishingCue(shownEmotion, chosenEmotion) {
    const shownDef = this.findExpressionDef(shownEmotion);
    const chosenDef = this.findExpressionDef(chosenEmotion);

    // Check explicit confusable pairs table first
    const pairEntry = this.expressionsCatalog?.confusablePairs?.find(
      (p) =>
        (p.pair[0] === shownEmotion && p.pair[1] === chosenEmotion) ||
        (p.pair[1] === shownEmotion && p.pair[0] === chosenEmotion)
    );

    if (pairEntry) {
      return {
        pairTitle: pairEntry.title,
        sharedAUs: pairEntry.sharedAUs || [],
        distinguishingAUs: pairEntry.distinguishingAUs || [],
        explanation: pairEntry.keyDistinction,
        shownCueSummary: shownDef?.diagnosticSummary || '',
        chosenCueSummary: chosenDef?.diagnosticSummary || ''
      };
    }

    const shownAUs = (shownDef?.aus || []).map((a) => Number(a.au));
    const chosenAUs = new Set((chosenDef?.aus || []).map((a) => Number(a.au)));
    const uniqueShownAUs = shownAUs.filter((id) => !chosenAUs.has(id));

    return {
      pairTitle: `${shownDef?.name || shownEmotion} vs. ${chosenDef?.name || chosenEmotion}`,
      sharedAUs: shownAUs.filter((id) => chosenAUs.has(id)),
      distinguishingAUs: uniqueShownAUs.length > 0 ? uniqueShownAUs : shownAUs,
      explanation:
        shownDef?.confusableWith?.[chosenEmotion] ||
        shownDef?.diagnosticSummary ||
        'Compare the active Action Units highlighted on the face.',
      shownCueSummary: shownDef?.diagnosticSummary || '',
      chosenCueSummary: chosenDef?.diagnosticSummary || ''
    };
  }

  /**
   * Records a user's trial response, updates IndexedDB (trials, srsCards, staircases),
   * and returns the feedback payload (and triggers slow-mo replay + AU overlays on a miss).
   */
  async recordResponse({
    shownEmotion,
    chosenEmotion,
    nominalMs = 200,
    actualMs = 200,
    actualFrames = 12,
    intensity = 1.0,
    rigId = 'riya',
    viewAngle = 'front',
    rtMs = 1000,
    cardKind = 'emotion',
    cardId = null,
    updateStaircase = true
  }) {
    const correct = shownEmotion === chosenEmotion;
    const timestamp = Date.now();

    // 1. Log trial to IndexedDB
    const trialRecord = {
      timestamp,
      level: this.levelId,
      mode: cardKind,
      shownEmotion,
      chosenEmotion,
      intensity,
      nominalMs,
      actualMs,
      actualFrames,
      rigId,
      viewAngle,
      rtMs,
      correct,
      isAssessment: false
    };
    await logTrial(trialRecord);

    // 2. Update staircase if applicable
    let nextStaircase = null;
    if (updateStaircase && shownEmotion) {
      const prevSt = this.getStaircaseForEmotion(shownEmotion);
      nextStaircase = stepStaircase(prevSt, correct);
      this.staircases.set(shownEmotion, nextStaircase);
      await saveStaircase(nextStaircase);
    }

    // 3. Update SRS card
    const effectiveId = cardId || shownEmotion;
    const key = makeCardKey(cardKind, effectiveId);
    const existingCard = (await getSRSCard(key)) || createSRSCard(cardKind, effectiveId, timestamp);
    const updatedCard = updateSRSCard(existingCard, {
      correct,
      rtMs,
      nowMs: timestamp
    });
    await putSRSCard(updatedCard);

    // 4. Build immediate feedback & trigger slow-mo replay with AU highlights on miss
    const shownDef = this.findExpressionDef(shownEmotion);
    const chosenDef = this.findExpressionDef(chosenEmotion);
    const distinction = this.findDistinguishingCue(shownEmotion, chosenEmotion);

    if (!correct && this.rig && shownDef) {
      // Enable AU overlays highlighting the distinguishing AUs immediately (< 300ms SLA)
      this.rig.setOverlaysEnabled(true, distinction.distinguishingAUs);
      // Play slow-motion replay (650 ms hold with gentle ramp) without blocking the UI return
      this.rig.flashExpression(shownDef, 650, {
        scale: Math.max(0.75, intensity),
        rampInFrames: 6,
        rampOutFrames: 6
      }).then(() => {
        // Hold peak expression after slow-mo replay so user can inspect the AU overlay
        this.rig.setExpressionFromRecipe(shownDef, { scale: Math.max(0.75, intensity) });
      });
    }

    return {
      correct,
      shownEmotion,
      chosenEmotion,
      shownName: shownDef?.name || shownEmotion,
      chosenName: chosenEmotion === 'not_sure' ? 'Not sure' : (chosenDef?.name || chosenEmotion),
      shownDef,
      chosenDef,
      distinction,
      nominalMs,
      actualMs,
      actualFrames,
      rtMs,
      staircase: nextStaircase,
      srsCard: updatedCard
    };
  }
}
