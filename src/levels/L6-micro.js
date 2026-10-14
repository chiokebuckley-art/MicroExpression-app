/**
 * Level 6: Micro-Expression Speed Training & Confusable Pair Drills.
 * - Adaptive 3-Down / 1-Up Exposure Staircase ([500, 333, 200, 133, 100, 67, 50, 40] ms)
 *   driven strictly by FrameCountingScheduler (requestAnimationFrame frame-counting).
 * - Displays exact exposure telemetry: nominal ms, actual frames, actual ms, and measured Hz.
 * - Confusable Pair Discrimination Drills (30 items across the 5 high-confusion pairs,
 *   plus direct pair drill launch from the Confusion Matrix Dashboard).
 */

import { TrainingSessionController } from '../train/session.js';
import { CORE_EMOTIONS_7, EXPOSURE_LADDER_MS } from '../train/staircase.js';
import { saveLevelProgress } from '../store/db.js';

export class Level6MicroView {
  constructor(containerEl, { rig, content, initialPair = null, onLevelComplete }) {
    this.containerEl = containerEl;
    this.rig = rig;
    this.content = content; // { expressions, aus, level6 }
    this.onLevelComplete = onLevelComplete;

    this.sessionCtrl = new TrainingSessionController({
      rig,
      expressionsCatalog: content.expressions,
      auCatalog: content.aus,
      levelId: 6
    });

    this.subtab = initialPair ? 'pairs' : 'staircase'; // 'staircase' | 'pairs'
    this.activePairFilter = initialPair; // e.g. ['fear', 'surprise']
    this.manualSpeedOverrideMs = null; // null = adaptive 3-down/1-up staircase

    this.trialIndex = 0;
    this.currentEmotion = CORE_EMOTIONS_7[0];
    this.lastFlashTelemetry = {
      nominalMs: 200,
      actualFrames: 12,
      actualMs: 200.0,
      fps: 60
    };
    this.trialStartTime = 0;
    this.feedback = null;

    this.pairDrillIdx = 0;
    this.pairScore = 0;
    this.pairTotal = 0;
    this.pairFeedback = null;

    this._onKeyDown = (e) => this._handleKeyDown(e);
    window.addEventListener('keydown', this._onKeyDown);

    this.sessionCtrl.initSession().then(() => {
      this._pickNextStaircaseEmotion();
      this.render();
    });
  }

  _pickNextStaircaseEmotion() {
    this.currentEmotion = CORE_EMOTIONS_7[this.trialIndex % CORE_EMOTIONS_7.length];
  }

  _handleKeyDown(e) {
    if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;

    if (this.subtab === 'staircase') {
      if (e.code === 'Space') {
        e.preventDefault();
        this._triggerFlash();
        return;
      }
      if (this.feedback) {
        if (e.key === 'Enter') {
          e.preventDefault();
          this._nextStaircaseTrial();
        }
        return;
      }
      const num = Number(e.key);
      if (num >= 1 && num <= 7) {
        e.preventDefault();
        this._submitStaircaseAnswer(CORE_EMOTIONS_7[num - 1]);
      } else if (e.key === '?' || e.key === '/') {
        e.preventDefault();
        this._submitStaircaseAnswer('not_sure');
      }
    }
  }

  render() {
    this.containerEl.innerHTML = `
      <div class="level-view">
        <header class="level-header">
          <div>
            <span class="level-kicker">LEVEL 6 &bull; MICRO-EXPRESSION SPEED &amp; CONFUSABLE PAIRS</span>
            <h2>Sub-200 ms Frame-Counted Flash Training &amp; Pair Discrimination</h2>
            <p class="muted-text">Adaptive 3-down / 1-up exposure staircase over [500, 333, 200, 133, 100, 67, 50, 40] ms plus targeted drills on the 5 most confusable emotion pairs.</p>
          </div>
          <div class="segmented-tabs" role="tablist">
            <button type="button" class="seg-tab ${this.subtab === 'staircase' ? 'active' : ''}" data-subtab="staircase">1. Adaptive Speed Staircase</button>
            <button type="button" class="seg-tab ${this.subtab === 'pairs' ? 'active' : ''}" data-subtab="pairs">2. Confusable Pair Drills (30)</button>
          </div>
        </header>

        <div id="l6SubtabBody" class="level-body"></div>
      </div>
    `;

    this.containerEl.querySelectorAll('[data-subtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.subtab = btn.getAttribute('data-subtab');
        this.render();
      });
    });

    const bodyEl = this.containerEl.querySelector('#l6SubtabBody');
    if (this.subtab === 'staircase') {
      this._renderStaircaseView(bodyEl);
    } else {
      this._renderPairsView(bodyEl);
    }
  }

  async _triggerFlash() {
    if (!this.rig) return;
    const st = this.sessionCtrl.getStaircaseForEmotion(this.currentEmotion);
    const nominalMs = this.manualSpeedOverrideMs || st.currentMs || 200;
    const expr = this.sessionCtrl.findExpressionDef(this.currentEmotion);
    if (!expr) return;

    this.rig.setOverlaysEnabled(false);
    this.trialStartTime = performance.now();
    const res = await this.rig.flashExpression(expr, nominalMs, { scale: 0.92 });
    this.lastFlashTelemetry = res;

    const telEl = this.containerEl.querySelector('[data-testid="exposure-telemetry"]');
    if (telEl) {
      telEl.innerHTML = `
        Nominal: <strong>${res.nominalMs} ms</strong> &bull;
        Actual: <strong>${res.actualFrames} frames (${res.actualMs} ms)</strong> &bull;
        Display: <strong>${res.fps} Hz</strong>
      `;
    }
  }

  async _submitStaircaseAnswer(chosenEmotion) {
    if (this.feedback || this.submitting || !this.lastFlashTelemetry) return;
    this.submitting = true;
    const st = this.sessionCtrl.getStaircaseForEmotion(this.currentEmotion);
    const nominalMs = this.manualSpeedOverrideMs || st.currentMs || 200;
    const rtMs = Math.max(40, Math.round(performance.now() - (this.trialStartTime || performance.now())));

    this.feedback = await this.sessionCtrl.recordResponse({
      shownEmotion: this.currentEmotion,
      chosenEmotion,
      nominalMs,
      actualMs: this.lastFlashTelemetry?.actualMs || nominalMs,
      actualFrames: this.lastFlashTelemetry?.actualFrames || 12,
      intensity: 0.92,
      rigId: this.rig?.currentRigId || 'riya',
      viewAngle: this.rig?.currentPreset || 'front',
      rtMs,
      cardKind: 'emotion',
      updateStaircase: !this.manualSpeedOverrideMs
    });

    this.submitting = false;
    this.answeredCount = (this.answeredCount || 0) + 1;
    this.correctCount = (this.correctCount || 0) + Number(this.feedback.correct);
    const score = Math.round(100 * this.correctCount / this.answeredCount);
    if (this.answeredCount >= 15 && score >= 75) {
      await saveLevelProgress({ levelId: 6, completed: true, bestScore: score, updatedAt: Date.now() });
      if (this.onLevelComplete) this.onLevelComplete(6, score);
    }

    const bodyEl = this.containerEl.querySelector('#l6SubtabBody');
    if (bodyEl) this._renderStaircaseView(bodyEl);
  }

  _nextStaircaseTrial() {
    this.trialIndex++;
    this.feedback = null;
    this._pickNextStaircaseEmotion();
    const bodyEl = this.containerEl.querySelector('#l6SubtabBody');
    if (bodyEl) this._renderStaircaseView(bodyEl);
    this._triggerFlash();
  }

  _renderStaircaseView(bodyEl) {
    const st = this.sessionCtrl.getStaircaseForEmotion(this.currentEmotion);
    const activeNominalMs = this.manualSpeedOverrideMs || st.currentMs || 200;
    const tel = this.lastFlashTelemetry;
    const fb = this.feedback;

    bodyEl.innerHTML = `
      <div class="drill-card">
        <div class="drill-top-bar">
          <div>
            <strong>Adaptive Speed Trial #${this.trialIndex + 1}</strong>
            <span class="telemetry-pill" data-testid="exposure-telemetry">
              Nominal: <strong>${tel.nominalMs} ms</strong> &bull;
              Actual: <strong>${tel.actualFrames} frames (${tel.actualMs} ms)</strong> &bull;
              Display: <strong>${tel.fps} Hz</strong>
            </span>
          </div>
          <label>Speed Mode:
            <select id="l6SpeedModeSelect">
              <option value="adaptive" ${!this.manualSpeedOverrideMs ? 'selected' : ''}>Adaptive 3-Down/1-Up Staircase (${st.currentMs} ms)</option>
              ${EXPOSURE_LADDER_MS.map((ms) => `
                <option value="${ms}" ${this.manualSpeedOverrideMs === ms ? 'selected' : ''}>Fixed ${ms} ms</option>
              `).join('')}
            </select>
          </label>
        </div>

        <div class="btn-row" style="margin:12px 0;">
          <button type="button" class="btn btn-primary" id="l6FlashBtn" data-testid="flash-stimulus-btn">
            Flash Micro-Expression (${activeNominalMs} ms / Space)
          </button>
          <span class="muted-text">Keys <strong>1&ndash;7</strong> to classify, <strong>?</strong> for Not sure, <strong>Space</strong> to flash again.</span>
        </div>

        <div class="emotion-answer-grid">
          ${CORE_EMOTIONS_7.map((em, idx) => `
            <button type="button" class="btn btn-secondary l6-ans-btn" data-ans="${em}" ${fb ? 'disabled' : ''}>
              <span class="key-hint">${idx + 1}</span> ${em.charAt(0).toUpperCase() + em.slice(1)}
            </button>
          `).join('')}
          <button type="button" class="btn btn-secondary l6-ans-btn not-sure-btn" data-ans="not_sure" ${fb ? 'disabled' : ''}>
            <span class="key-hint">?</span> Not sure
          </button>
        </div>

        ${fb ? `
          <div class="diagnostic-feedback-panel ${fb.correct ? 'pass' : 'miss'}" data-testid="trial-feedback">
            <div class="fb-header">
              <strong>${fb.correct ? `✓ Correct: ${fb.shownName}` : `✗ Shown: ${fb.shownName} — You chose: ${fb.chosenName}`}</strong>
              <span>Threshold (${fb.shownName}): <strong>${fb.staircase?.thresholdMs ?? activeNominalMs} ms</strong> &bull; RT: ${fb.rtMs} ms</span>
            </div>
            <p><strong>Key Diagnostic Cue (${fb.distinction.pairTitle}):</strong> ${fb.distinction.explanation}</p>
            <div class="btn-row">
              <button type="button" class="btn btn-sm btn-secondary" id="l6SlowMoReplayBtn">Slow-Mo Replay (650 ms) + AU Overlay</button>
              <button type="button" class="btn btn-sm btn-secondary" id="l6ContrastShownBtn">Hold Shown (${fb.shownName})</button>
              ${!fb.correct && fb.chosenDef ? `
                <button type="button" class="btn btn-sm btn-secondary" id="l6ContrastChosenBtn">Compare Chosen (${fb.chosenName})</button>
              ` : ''}
              <button type="button" class="btn btn-sm btn-primary" id="l6NextBtn">Next Flash (Enter) &rarr;</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    bodyEl.querySelector('#l6SpeedModeSelect')?.addEventListener('change', (e) => {
      const v = e.target.value;
      this.manualSpeedOverrideMs = v === 'adaptive' ? null : Number(v);
      this._renderStaircaseView(bodyEl);
    });

    bodyEl.querySelector('#l6FlashBtn')?.addEventListener('click', () => this._triggerFlash());
    bodyEl.querySelectorAll('.l6-ans-btn').forEach((btn) => {
      btn.addEventListener('click', () => this._submitStaircaseAnswer(btn.getAttribute('data-ans')));
    });

    bodyEl.querySelector('#l6SlowMoReplayBtn')?.addEventListener('click', async () => {
      if (this.rig && fb?.shownDef) {
        this.rig.setOverlaysEnabled(true, fb.distinction.distinguishingAUs);
        await this.rig.flashExpression(fb.shownDef, 650, { scale: 0.9, rampInFrames: 6, rampOutFrames: 6 });
        this.rig.setExpressionFromRecipe(fb.shownDef);
      }
    });

    bodyEl.querySelector('#l6ContrastShownBtn')?.addEventListener('click', () => {
      if (this.rig && fb?.shownDef) {
        this.rig.setOverlaysEnabled(true, fb.distinction.distinguishingAUs);
        this.rig.setExpressionFromRecipe(fb.shownDef);
      }
    });

    bodyEl.querySelector('#l6ContrastChosenBtn')?.addEventListener('click', () => {
      if (this.rig && fb?.chosenDef) {
        this.rig.setOverlaysEnabled(true, (fb.chosenDef.aus || []).map((a) => Number(a.au)));
        this.rig.setExpressionFromRecipe(fb.chosenDef);
      }
    });

    bodyEl.querySelector('#l6NextBtn')?.addEventListener('click', () => this._nextStaircaseTrial());
  }

  _renderPairsView(bodyEl) {
    const allDrills = this.content.level6?.confusablePairDrills || [];
    const filtered = this.activePairFilter
      ? allDrills.filter((d) =>
          (d.pair[0] === this.activePairFilter[0] && d.pair[1] === this.activePairFilter[1]) ||
          (d.pair[0] === this.activePairFilter[1] && d.pair[1] === this.activePairFilter[0])
        )
      : allDrills;

    const list = filtered.length > 0 ? filtered : allDrills;
    const item = list[this.pairDrillIdx % list.length];
    if (!item) return;

    bodyEl.innerHTML = `
      <div class="drill-card">
        <div class="drill-top-bar">
          <div>
            <strong>Confusable Pair Discrimination Drill</strong>
            ${this.activePairFilter ? `<span class="cue-pill">Targeted Pair: ${this.activePairFilter.join(' vs. ')}</span>` : ''}
          </div>
          <div class="btn-row">
            ${this.activePairFilter ? `<button type="button" class="btn btn-sm btn-secondary" id="l6ClearPairFilterBtn">Show All 5 Pairs (30 Items)</button>` : ''}
            <span>Score: <strong>${this.pairScore}/${this.pairTotal}</strong></span>
          </div>
        </div>

        <p class="drill-prompt">${item.prompt}</p>

        <div class="btn-row" style="margin:12px 0;">
          <button type="button" class="btn btn-primary" id="l6PlayPairFlashBtn">Flash Target (${item.exposureMs || 133} ms)</button>
          <button type="button" class="btn btn-secondary" id="l6HoldPairTargetBtn">Hold Target + AU Overlay</button>
        </div>

        <div class="q-options-grid">
          ${(item.pair || []).map((em) => `
            <button type="button" class="btn btn-secondary l6-pair-opt" data-ans="${em}" ${this.pairFeedback ? 'disabled' : ''}>
              ${em.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </button>
          `).join('')}
        </div>

        ${this.pairFeedback ? `
          <div class="quiz-feedback ${this.pairFeedback.correct ? 'pass' : 'miss'}" style="margin-top:14px;">
            <p><strong>${this.pairFeedback.correct ? '✓ Correct!' : `✗ Shown: ${item.shownEmotion}`}</strong> &mdash; ${item.keyCue}</p>
            <button type="button" class="btn btn-sm btn-primary" id="l6NextPairBtn">Next Pair Trial &rarr;</button>
          </div>
        ` : ''}
      </div>
    `;

    const playPairStim = async (hold = false) => {
      if (!this.rig) return;
      const expr = this.sessionCtrl.findExpressionDef(item.shownEmotion);
      if (!expr) return;
      if (hold) {
        this.rig.setOverlaysEnabled(true);
        this.rig.setExpressionFromRecipe(expr);
      } else {
        this.rig.setOverlaysEnabled(false);
        await this.rig.flashExpression(expr, item.exposureMs || 133);
      }
    };

    bodyEl.querySelector('#l6ClearPairFilterBtn')?.addEventListener('click', () => {
      this.activePairFilter = null;
      this.pairDrillIdx = 0;
      this._renderPairsView(bodyEl);
    });

    bodyEl.querySelector('#l6PlayPairFlashBtn')?.addEventListener('click', () => playPairStim(false));
    bodyEl.querySelector('#l6HoldPairTargetBtn')?.addEventListener('click', () => playPairStim(true));

    bodyEl.querySelectorAll('.l6-pair-opt').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const chosen = btn.getAttribute('data-ans');
        const correct = chosen === item.shownEmotion;
        this.pairTotal++;
        if (correct) this.pairScore++;
        this.pairFeedback = { correct };
        await this.sessionCtrl.recordResponse({
          shownEmotion: item.shownEmotion,
          chosenEmotion: chosen,
          nominalMs: item.exposureMs || 133,
          cardKind: 'pair',
          cardId: item.id,
          updateStaircase: false
        });
        this._renderPairsView(bodyEl);
      });
    });

    bodyEl.querySelector('#l6NextPairBtn')?.addEventListener('click', () => {
      this.pairDrillIdx++;
      this.pairFeedback = null;
      this._renderPairsView(bodyEl);
      playPairStim(false);
    });
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
  }
}
