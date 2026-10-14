/**
 * Level 4: The 7 Universal Expressions (Full View).
 * - Interactive 7-Emotion Atlas + Variant Contrast (Duchenne vs Social Smile, Fear vs Surprise, etc.).
 * - Full-View Recognition Drill with keyboard shortcuts (1-7, ? = Not sure, Space = Replay),
 *   trial logging to IndexedDB, and immediate slow-motion replay + AU highlight + Contrast View on a miss.
 */

import { TrainingSessionController } from '../train/session.js';
import { CORE_EMOTIONS_7 } from '../train/staircase.js';
import { CAMERA_PRESETS } from '../face/rig.js';
import { saveLevelProgress } from '../store/db.js';

export class Level4Core7View {
  constructor(containerEl, { rig, content, onLevelComplete }) {
    this.containerEl = containerEl;
    this.rig = rig;
    this.content = content; // { expressions, aus, level4 }
    this.onLevelComplete = onLevelComplete;

    this.sessionCtrl = new TrainingSessionController({
      rig,
      expressionsCatalog: content.expressions,
      auCatalog: content.aus,
      levelId: 4
    });

    this.subtab = 'atlas'; // 'atlas' | 'drill'
    this.selectedEmotionId = 'happiness';
    this.compareEmotionId = 'happiness_social';
    this.overlaysOn = true;

    this.drillQueue = this._buildDrillQueue();
    this.drillIdx = 0;
    this.drillScore = 0;
    this.drillTotal = 0;
    this.lastFlashResult = null;
    this.trialStartTime = 0;
    this.feedback = null;

    this._onKeyDown = (e) => this._handleKeyDown(e);
    window.addEventListener('keydown', this._onKeyDown);
    this.render();
  }

  _buildDrillQueue() {
    const core = this.content.expressions?.core || [];
    const queue = [];
    const angles = ['front', 'left34', 'right34'];
    for (let round = 0; round < 3; round++) {
      for (const expr of core) {
        queue.push({
          emotion: expr.id,
          nominalMs: 500,
          intensity: 0.9,
          viewAngle: angles[round % angles.length]
        });
      }
    }
    return queue;
  }

  _handleKeyDown(e) {
    if (this.subtab !== 'drill') return;
    if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;

    if (e.code === 'Space') {
      e.preventDefault();
      this._playCurrentDrillStimulus();
      return;
    }

    if (this.feedback) {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._advanceDrill();
      }
      return;
    }

    const num = Number(e.key);
    if (num >= 1 && num <= 7) {
      e.preventDefault();
      const chosen = CORE_EMOTIONS_7[num - 1];
      this._submitDrillAnswer(chosen);
    } else if (e.key === '?' || e.key === '/') {
      e.preventDefault();
      this._submitDrillAnswer('not_sure');
    }
  }

  render() {
    this.containerEl.innerHTML = `
      <div class="level-view">
        <header class="level-header">
          <div>
            <span class="level-kicker">LEVEL 4 &bull; MACRO-EXPRESSIONS</span>
            <h2>The 7 Universal Expressions (Full-View Atlas &amp; Recognition)</h2>
            <p class="muted-text">Study each universal configuration across upper, mid, and lower face zones, then test recognition across front and 3/4 angles.</p>
          </div>
          <div class="segmented-tabs" role="tablist">
            <button type="button" class="seg-tab ${this.subtab === 'atlas' ? 'active' : ''}" data-subtab="atlas">1. 7-Emotion Atlas &amp; Contrast</button>
            <button type="button" class="seg-tab ${this.subtab === 'drill' ? 'active' : ''}" data-subtab="drill">2. Recognition Drill (Keys 1&ndash;7)</button>
          </div>
        </header>

        <div id="l4SubtabBody" class="level-body"></div>
      </div>
    `;

    this.containerEl.querySelectorAll('[data-subtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.subtab = btn.getAttribute('data-subtab');
        this.render();
        if (this.subtab === 'drill') {
          this._playCurrentDrillStimulus();
        }
      });
    });

    const bodyEl = this.containerEl.querySelector('#l4SubtabBody');
    if (this.subtab === 'atlas') {
      this._renderAtlas(bodyEl);
    } else {
      this._renderDrill(bodyEl);
    }
  }

  _getAllExpressions() {
    return [
      ...(this.content.expressions?.core || []),
      ...(this.content.expressions?.variants || [])
    ];
  }

  _renderAtlas(bodyEl) {
    const allExprs = this._getAllExpressions();
    const current = allExprs.find((e) => e.id === this.selectedEmotionId) || allExprs[0];
    const compare = allExprs.find((e) => e.id === this.compareEmotionId) || allExprs[1];

    if (this.rig && current) {
      const auIds = (current.aus || []).map((a) => Number(a.au));
      this.rig.setOverlaysEnabled(this.overlaysOn, auIds);
      this.rig.setExpressionFromRecipe(current);
    }

    bodyEl.innerHTML = `
      <div class="atlas-grid-layout">
        <div class="atlas-selector-card">
          <h4>Core 7 Universal Emotions &amp; Diagnostic Variants</h4>
          <div class="emotion-cards-stack">
            ${allExprs.map((e) => `
              <button type="button" class="emotion-select-row ${e.id === current?.id ? 'active' : ''}" data-expr-id="${e.id}">
                <strong>${e.name}</strong>
                <span class="au-formula-badge">${(e.aus || []).map((a) => `AU${a.au}${a.side && a.side !== 'both' ? `(${a.side[0].toUpperCase()})` : ''}`).join(' + ')}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="atlas-inspector-card">
          <div class="atlas-toolbar">
            <label class="checkbox-pill">
              <input type="checkbox" id="l4ToggleOverlays" ${this.overlaysOn ? 'checked' : ''} />
              <span>Show 3D AU Highlight Overlays</span>
            </label>
            <div class="btn-row">
              ${Object.entries(CAMERA_PRESETS).map(([key, p]) => `
                <button type="button" class="btn btn-sm ${this.rig?.currentPreset === key ? 'btn-primary' : 'btn-secondary'} cam-preset-btn" data-preset="${key}">
                  ${p.label}
                </button>
              `).join('')}
            </div>
          </div>

          <h3>${current?.name || ''}</h3>
          <p class="diagnostic-lead">${current?.diagnosticSummary || ''}</p>

          <div class="zone-cues-grid">
            <div class="zone-cue-box">
              <strong>Upper Face (Brows / Lids)</strong>
              <p>${current?.upperFaceCues || 'See active AUs.'}</p>
            </div>
            <div class="zone-cue-box">
              <strong>Lower Face (Nose / Mouth / Chin)</strong>
              <p>${current?.lowerFaceCues || 'See active AUs.'}</p>
            </div>
          </div>

          <!-- 1-Click Contrast Switcher -->
          <div class="contrast-switcher-box">
            <div class="contrast-header">
              <strong>1-Click Contrast Comparison:</strong>
              <select id="l4CompareSelect">
                ${allExprs.map((e) => `<option value="${e.id}" ${e.id === this.compareEmotionId ? 'selected' : ''}>Compare with: ${e.name}</option>`).join('')}
              </select>
            </div>
            <div class="btn-row" style="margin-top:8px;">
              <button type="button" class="btn btn-sm btn-primary" id="l4ShowPrimaryBtn">Show A: ${current?.name}</button>
              <button type="button" class="btn btn-sm btn-secondary" id="l4ShowCompareBtn">Show B: ${compare?.name}</button>
              <button type="button" class="btn btn-sm btn-secondary" id="l4ShowNeutralBtn">Hold Neutral</button>
            </div>
          </div>
        </div>
      </div>
    `;

    bodyEl.querySelectorAll('.emotion-select-row').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedEmotionId = btn.getAttribute('data-expr-id');
        this._renderAtlas(bodyEl);
      });
    });

    bodyEl.querySelector('#l4ToggleOverlays')?.addEventListener('change', (e) => {
      this.overlaysOn = e.target.checked;
      this._renderAtlas(bodyEl);
    });

    bodyEl.querySelectorAll('.cam-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = btn.getAttribute('data-preset');
        if (this.rig) this.rig.setCameraPreset(preset);
        this._renderAtlas(bodyEl);
      });
    });

    bodyEl.querySelector('#l4CompareSelect')?.addEventListener('change', (e) => {
      this.compareEmotionId = e.target.value;
      this._renderAtlas(bodyEl);
    });

    bodyEl.querySelector('#l4ShowPrimaryBtn')?.addEventListener('click', () => {
      if (this.rig && current) {
        this.rig.setOverlaysEnabled(this.overlaysOn, (current.aus || []).map((a) => Number(a.au)));
        this.rig.setExpressionFromRecipe(current);
      }
    });

    bodyEl.querySelector('#l4ShowCompareBtn')?.addEventListener('click', () => {
      if (this.rig && compare) {
        this.rig.setOverlaysEnabled(this.overlaysOn, (compare.aus || []).map((a) => Number(a.au)));
        this.rig.setExpressionFromRecipe(compare);
      }
    });

    bodyEl.querySelector('#l4ShowNeutralBtn')?.addEventListener('click', () => {
      if (this.rig) {
        this.rig.setOverlaysEnabled(false);
        this.rig.resetToNeutral();
      }
    });
  }

  async _playCurrentDrillStimulus() {
    const item = this.drillQueue[this.drillIdx % this.drillQueue.length];
    if (!item || !this.rig) return;
    const expr = this.sessionCtrl.findExpressionDef(item.emotion);
    if (!expr) return;

    this.rig.setCameraPreset(item.viewAngle || 'front');
    this.rig.setOverlaysEnabled(false);
    this.trialStartTime = performance.now();
    this.lastFlashResult = await this.rig.flashExpression(expr, item.nominalMs, {
      scale: item.intensity || 0.9
    });
  }

  async _submitDrillAnswer(chosenEmotion) {
    if (this.feedback || this.submitting) return;
    this.submitting=true;
    const item = this.drillQueue[this.drillIdx % this.drillQueue.length];
    const rtMs = Math.max(50, Math.round(performance.now() - (this.trialStartTime || performance.now())));

    this.feedback = await this.sessionCtrl.recordResponse({
      shownEmotion: item.emotion,
      chosenEmotion,
      nominalMs: item.nominalMs,
      actualMs: this.lastFlashResult?.actualMs || item.nominalMs,
      actualFrames: this.lastFlashResult?.actualFrames || 30,
      intensity: item.intensity,
      rigId: this.rig?.currentRigId || 'riya',
      viewAngle: item.viewAngle || 'front',
      rtMs,
      cardKind: 'emotion',
      updateStaircase: false
    });

    this.submitting=false;
    this.drillTotal++;
    if (this.feedback.correct) this.drillScore++;

    if (this.drillTotal >= 10 && (this.drillScore / this.drillTotal) >= 0.85) {
      await saveLevelProgress({
        levelId: 4,
        completed: true,
        bestScore: Math.round((this.drillScore / this.drillTotal) * 100),
        updatedAt: Date.now()
      });
      if (this.onLevelComplete) this.onLevelComplete(4, Math.round((this.drillScore / this.drillTotal) * 100));
    }

    const bodyEl = this.containerEl.querySelector('#l4SubtabBody');
    if (bodyEl) this._renderDrill(bodyEl);
  }

  _advanceDrill() {
    this.drillIdx++;
    this.feedback = null;
    const bodyEl = this.containerEl.querySelector('#l4SubtabBody');
    if (bodyEl) this._renderDrill(bodyEl);
    this._playCurrentDrillStimulus();
  }

  _renderDrill(bodyEl) {
    const item = this.drillQueue[this.drillIdx % this.drillQueue.length];
    const fb = this.feedback;

    bodyEl.innerHTML = `
      <div class="drill-card">
        <div class="drill-top-bar">
          <span><strong>Level 4 Recognition Trial ${(this.drillIdx % this.drillQueue.length) + 1}</strong> &bull; View: <code>${item.viewAngle}</code></span>
          <span>Accuracy: <strong>${this.drillScore}/${this.drillTotal}</strong> (${this.drillTotal ? Math.round((this.drillScore / this.drillTotal) * 100) : 0}%)</span>
        </div>

        <div class="btn-row" style="margin:12px 0;">
          <button type="button" class="btn btn-primary" id="l4ReplayFlashBtn">Replay Stimulus (Space)</button>
          <span class="muted-text">Use keys <strong>1&ndash;7</strong> to answer, <strong>?</strong> for Not sure, <strong>Space</strong> to replay.</span>
        </div>

        <div class="emotion-answer-grid" role="group" aria-label="7 Universal Emotions Answer Buttons">
          ${CORE_EMOTIONS_7.map((em, idx) => `
            <button type="button" class="btn btn-secondary emotion-ans-btn" data-ans="${em}" ${fb ? 'disabled' : ''}>
              <span class="key-hint">${idx + 1}</span> ${em.charAt(0).toUpperCase() + em.slice(1)}
            </button>
          `).join('')}
          <button type="button" class="btn btn-secondary emotion-ans-btn not-sure-btn" data-ans="not_sure" ${fb ? 'disabled' : ''}>
            <span class="key-hint">?</span> Not sure
          </button>
        </div>

        ${fb ? `
          <div class="diagnostic-feedback-panel ${fb.correct ? 'pass' : 'miss'}" data-testid="trial-feedback">
            <div class="fb-header">
              <strong>${fb.correct ? `✓ Correct: ${fb.shownName}` : `✗ Shown: ${fb.shownName} — You chose: ${fb.chosenName}`}</strong>
              <span>RT: ${fb.rtMs} ms</span>
            </div>
            <p><strong>Diagnostic Distinction (${fb.distinction.pairTitle}):</strong> ${fb.distinction.explanation}</p>
            <div class="btn-row">
              <button type="button" class="btn btn-sm btn-secondary" id="l4ShowShownContrastBtn">Inspect Shown (${fb.shownName}) + AU Overlay</button>
              ${!fb.correct && fb.chosenDef ? `
                <button type="button" class="btn btn-sm btn-secondary" id="l4ShowChosenContrastBtn">Compare Chosen (${fb.chosenName})</button>
              ` : ''}
              <button type="button" class="btn btn-sm btn-primary" id="l4NextTrialBtn">Next Trial (Enter) &rarr;</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    bodyEl.querySelector('#l4ReplayFlashBtn')?.addEventListener('click', () => this._playCurrentDrillStimulus());
    bodyEl.querySelectorAll('.emotion-ans-btn').forEach((btn) => {
      btn.addEventListener('click', () => this._submitDrillAnswer(btn.getAttribute('data-ans')));
    });

    bodyEl.querySelector('#l4ShowShownContrastBtn')?.addEventListener('click', () => {
      if (this.rig && fb?.shownDef) {
        this.rig.setOverlaysEnabled(true, fb.distinction.distinguishingAUs);
        this.rig.setExpressionFromRecipe(fb.shownDef);
      }
    });

    bodyEl.querySelector('#l4ShowChosenContrastBtn')?.addEventListener('click', () => {
      if (this.rig && fb?.chosenDef) {
        this.rig.setOverlaysEnabled(true, (fb.chosenDef.aus || []).map((a) => Number(a.au)));
        this.rig.setExpressionFromRecipe(fb.chosenDef);
      }
    });

    bodyEl.querySelector('#l4NextTrialBtn')?.addEventListener('click', () => this._advanceDrill());
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
  }
}
