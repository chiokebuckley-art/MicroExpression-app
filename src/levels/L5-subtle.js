/**
 * Level 5: Subtle & Partial Expressions (FACS Intensity A-E & Region Isolation).
 * - FACS Intensity Scale Explorer (A=0.15 Trace, B=0.35 Slight, C=0.55 Marked, D=0.75 Severe, E=0.95 Maximum)
 *   + Region Masking (Full Face vs. Upper Face Only vs. Lower Face Only).
 * - Partial & Low-Intensity Recognition Drill.
 * - Spot-the-Difference A/B Challenge (22 items from level5.json, including Duchenne vs. Non-Duchenne Smile).
 */

import { FACS_INTENSITY_LADDER } from '../face/auMap.js';
import { CORE_EMOTIONS_7 } from '../train/staircase.js';
import { TrainingSessionController } from '../train/session.js';
import { logTrial, saveLevelProgress } from '../store/db.js';

export class Level5SubtleView {
  constructor(containerEl, { rig, content, onLevelComplete }) {
    this.containerEl = containerEl;
    this.rig = rig;
    this.content = content; // { expressions, aus, level5 }
    this.onLevelComplete = onLevelComplete;

    this.sessionCtrl = new TrainingSessionController({
      rig,
      expressionsCatalog: content.expressions,
      auCatalog: content.aus,
      levelId: 5
    });

    this.subtab = 'explorer'; // 'explorer' | 'partial_drill' | 'spot_diff'
    this.selectedEmotion = 'fear';
    this.selectedGrade = 'B';
    this.selectedRegion = 'full';

    this.drillIdx = 0;
    this.drillScore = 0;
    this.drillTotal = 0;
    this.drillFeedback = null;

    this.spotIdx = 0;
    this.spotScore = 0;
    this.spotTotal = 0;
    this.spotFeedback = null;

    this.render();
  }

  render() {
    this.containerEl.innerHTML = `
      <div class="level-view">
        <header class="level-header">
          <div>
            <span class="level-kicker">LEVEL 5 &bull; SUBTLE &amp; PARTIAL SIGNALS</span>
            <h2>FACS Intensity A&ndash;E, Region Isolation &amp; Duchenne vs. Social Smiles</h2>
            <p class="muted-text">Real-world emotions frequently appear at low intensity (B/C) or leak in a single facial zone (upper face vs. lower face).</p>
          </div>
          <div class="segmented-tabs" role="tablist">
            <button type="button" class="seg-tab ${this.subtab === 'explorer' ? 'active' : ''}" data-subtab="explorer">1. Intensity A&ndash;E &amp; Zone Mask</button>
            <button type="button" class="seg-tab ${this.subtab === 'partial_drill' ? 'active' : ''}" data-subtab="partial_drill">2. Subtle / Zone Drill</button>
            <button type="button" class="seg-tab ${this.subtab === 'spot_diff' ? 'active' : ''}" data-subtab="spot_diff">3. Spot-the-Difference A/B (22)</button>
          </div>
        </header>

        <div id="l5SubtabBody" class="level-body"></div>
      </div>
    `;

    this.containerEl.querySelectorAll('[data-subtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.subtab = btn.getAttribute('data-subtab');
        this.render();
      });
    });

    const bodyEl = this.containerEl.querySelector('#l5SubtabBody');
    if (this.subtab === 'explorer') {
      this._renderExplorer(bodyEl);
    } else if (this.subtab === 'partial_drill') {
      this._renderPartialDrill(bodyEl);
    } else {
      this._renderSpotDiff(bodyEl);
    }
  }

  _applyExplorerState() {
    if (!this.rig) return;
    const expr = this.sessionCtrl.findExpressionDef(this.selectedEmotion);
    if (!expr) return;
    const scale = FACS_INTENSITY_LADDER[this.selectedGrade] || 0.35;

    if (this.selectedRegion === 'upper') this.rig.setCameraPreset('eyeCloseup');
    else if (this.selectedRegion === 'lower') this.rig.setCameraPreset('mouthCloseup');
    else this.rig.setCameraPreset('front');

    this.rig.setOverlaysEnabled(true);
    this.rig.setExpressionFromRecipe(expr, { scale, region: this.selectedRegion });
  }

  _renderExplorer(bodyEl) {
    this._applyExplorerState();
    const expr = this.sessionCtrl.findExpressionDef(this.selectedEmotion);
    const scale = FACS_INTENSITY_LADDER[this.selectedGrade] || 0.35;

    bodyEl.innerHTML = `
      <div class="au-encyclopedia-layout">
        <div class="au-grid-selector">
          <h4>1. Choose Emotion</h4>
          <div class="emotion-cards-stack">
            ${CORE_EMOTIONS_7.map((em) => `
              <button type="button" class="emotion-select-row ${em === this.selectedEmotion ? 'active' : ''}" data-em="${em}">
                <strong>${em.charAt(0).toUpperCase() + em.slice(1)}</strong>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="au-inspector-card">
          <h3>${expr?.name || ''} &mdash; Grade ${this.selectedGrade} (${Math.round(scale * 100)}%) &bull; Region: ${this.selectedRegion.toUpperCase()}</h3>
          <p>${expr?.diagnosticSummary || ''}</p>

          <div class="au-controls-box">
            <label><strong>2. FACS Intensity Ladder (A = Trace 15% &rarr; E = Maximum 95%):</strong></label>
            <div class="btn-row" style="margin-top:6px;">
              ${Object.entries(FACS_INTENSITY_LADDER).map(([grade, val]) => `
                <button type="button" class="btn btn-sm ${this.selectedGrade === grade ? 'btn-primary' : 'btn-secondary'} l5-grade-btn" data-grade="${grade}">
                  Grade ${grade} (${Math.round(val * 100)}%)
                </button>
              `).join('')}
            </div>

            <label style="display:block;margin-top:12px;"><strong>3. Facial Zone Isolation:</strong></label>
            <div class="btn-row" style="margin-top:6px;">
              ${[
                { id: 'full', label: 'Full Face' },
                { id: 'upper', label: 'Upper Face Only (Brows & Lids)' },
                { id: 'lower', label: 'Lower Face Only (Nose & Mouth)' }
              ].map((reg) => `
                <button type="button" class="btn btn-sm ${this.selectedRegion === reg.id ? 'btn-primary' : 'btn-secondary'} l5-reg-btn" data-reg="${reg.id}">
                  ${reg.label}
                </button>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    bodyEl.querySelectorAll('[data-em]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedEmotion = btn.getAttribute('data-em');
        this._renderExplorer(bodyEl);
      });
    });
    bodyEl.querySelectorAll('.l5-grade-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedGrade = btn.getAttribute('data-grade');
        this._renderExplorer(bodyEl);
      });
    });
    bodyEl.querySelectorAll('.l5-reg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedRegion = btn.getAttribute('data-reg');
        this._renderExplorer(bodyEl);
      });
    });
  }

  _renderPartialDrill(bodyEl) {
    const modes = [
      { region: 'upper', grade: 'C', scale: 0.55, label: 'Upper Face Only (Grade C - 55%)' },
      { region: 'lower', grade: 'C', scale: 0.55, label: 'Lower Face Only (Grade C - 55%)' },
      { region: 'full', grade: 'B', scale: 0.35, label: 'Full Face Subtle (Grade B - 35%)' }
    ];
    const mode = modes[this.drillIdx % modes.length];
    const targetEmotion = CORE_EMOTIONS_7[(this.drillIdx * 3 + 1) % CORE_EMOTIONS_7.length];
    const expr = this.sessionCtrl.findExpressionDef(targetEmotion);

    bodyEl.innerHTML = `
      <div class="drill-card">
        <div class="drill-top-bar">
          <span><strong>Subtle &amp; Partial Recognition Drill</strong> &bull; Condition: <code>${mode.label}</code></span>
          <span>Score: <strong>${this.drillScore}/${this.drillTotal}</strong></span>
        </div>

        <div class="btn-row" style="margin:12px 0;">
          <button type="button" class="btn btn-primary" id="l5PlayPartialBtn">Flash Stimulus (333 ms)</button>
          <button type="button" class="btn btn-secondary" id="l5HoldPartialBtn">Hold Subtle Stimulus</button>
        </div>

        <div class="emotion-answer-grid">
          ${CORE_EMOTIONS_7.map((em) => `
            <button type="button" class="btn btn-secondary l5-ans-btn" data-ans="${em}" ${this.drillFeedback ? 'disabled' : ''}>
              ${em.charAt(0).toUpperCase() + em.slice(1)}
            </button>
          `).join('')}
        </div>

        ${this.drillFeedback ? `
          <div class="diagnostic-feedback-panel ${this.drillFeedback.correct ? 'pass' : 'miss'}" style="margin-top:14px;">
            <p><strong>${this.drillFeedback.correct ? `✓ Correct (${this.drillFeedback.shownName})` : `✗ Shown: ${this.drillFeedback.shownName}`}</strong> &mdash; ${this.drillFeedback.distinction.explanation}</p>
            <div class="btn-row">
              <button type="button" class="btn btn-sm btn-secondary" id="l5RevealFullBtn">Reveal Full Face @ 100% + AU Overlays</button>
              <button type="button" class="btn btn-sm btn-primary" id="l5NextPartialBtn">Next Trial &rarr;</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    const playPartial = async (hold = false) => {
      if (!this.rig || !expr) return;
      if (mode.region === 'upper') this.rig.setCameraPreset('eyeCloseup');
      else if (mode.region === 'lower') this.rig.setCameraPreset('mouthCloseup');
      else this.rig.setCameraPreset('front');

      this.rig.setOverlaysEnabled(false);
      if (hold) {
        this.rig.setExpressionFromRecipe(expr, { scale: mode.scale, region: mode.region });
      } else {
        await this.rig.flashExpression(expr, 333, { scale: mode.scale, region: mode.region });
      }
    };

    bodyEl.querySelector('#l5PlayPartialBtn')?.addEventListener('click', () => playPartial(false));
    bodyEl.querySelector('#l5HoldPartialBtn')?.addEventListener('click', () => playPartial(true));

    bodyEl.querySelectorAll('.l5-ans-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const chosen = btn.getAttribute('data-ans');
        this.drillFeedback = await this.sessionCtrl.recordResponse({
          shownEmotion: targetEmotion,
          chosenEmotion: chosen,
          nominalMs: 333,
          intensity: mode.scale,
          viewAngle: mode.region,
          updateStaircase: false
        });
        this.drillTotal++;
        if (this.drillFeedback.correct) this.drillScore++;
        this._renderPartialDrill(bodyEl);
      });
    });

    bodyEl.querySelector('#l5RevealFullBtn')?.addEventListener('click', () => {
      if (this.rig && expr) {
        this.rig.setCameraPreset('front');
        this.rig.setOverlaysEnabled(true);
        this.rig.setExpressionFromRecipe(expr, { scale: 0.9, region: 'full' });
      }
    });

    bodyEl.querySelector('#l5NextPartialBtn')?.addEventListener('click', () => {
      this.drillIdx++;
      this.drillFeedback = null;
      this._renderPartialDrill(bodyEl);
      playPartial(false);
    });
  }

  _renderSpotDiff(bodyEl) {
    const items = this.content.level5?.spotDifferenceDrills || [];
    const item = items[this.spotIdx % items.length];
    if (!item) return;

    bodyEl.innerHTML = `
      <div class="drill-card">
        <div class="drill-top-bar">
          <span><strong>Spot-the-Difference A/B Challenge ${(this.spotIdx % items.length) + 1} of ${items.length}:</strong> ${item.title}</span>
          <span>Score: <strong>${this.spotScore}/${this.spotTotal}</strong></span>
        </div>

        <p>${item.question}</p>

        <div class="btn-row" style="margin:12px 0;">
          <button type="button" class="btn btn-primary" id="l5ShowABtn">Inspect Expression A (${item.labelA})</button>
          <button type="button" class="btn btn-primary" id="l5ShowBBtn">Inspect Expression B (${item.labelB})</button>
        </div>

        <div class="q-options-grid">
          ${(item.options || []).map((opt) => `
            <button type="button" class="btn btn-secondary l5-spot-opt" data-opt="${opt}" ${this.spotFeedback ? 'disabled' : ''}>${opt}</button>
          `).join('')}
        </div>

        ${this.spotFeedback ? `
          <div class="quiz-feedback ${this.spotFeedback.correct ? 'pass' : 'miss'}" style="margin-top:14px;">
            <p><strong>${this.spotFeedback.correct ? '✓ Correct!' : `✗ Answer: ${this.spotFeedback.answer}`}</strong> &mdash; ${this.spotFeedback.explanation}</p>
            <button type="button" class="btn btn-sm btn-primary" id="l5NextSpotBtn">Next A/B Challenge &rarr;</button>
          </div>
        ` : ''}
      </div>
    `;

    const showRecipe = (recipeId) => {
      if (!this.rig) return;
      const expr = this.sessionCtrl.findExpressionDef(recipeId);
      if (expr) {
        this.rig.setCameraPreset('front');
        this.rig.setOverlaysEnabled(true);
        this.rig.setExpressionFromRecipe(expr);
      }
    };

    bodyEl.querySelector('#l5ShowABtn')?.addEventListener('click', () => showRecipe(item.recipeA));
    bodyEl.querySelector('#l5ShowBBtn')?.addEventListener('click', () => showRecipe(item.recipeB));

    bodyEl.querySelectorAll('.l5-spot-opt').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (this.spotFeedback) return;
        const chosen = btn.getAttribute('data-opt');
        const correct = chosen === item.answer;
        this.spotFeedback = {correct};
        await logTrial({level:5,itemId:item.id,chosenEmotion:chosen,correct,firstTry:true,hintUsed:false});
        this.spotTotal++;
        if (correct) this.spotScore++;
        this.spotFeedback = {
          correct,
          answer: item.answer,
          explanation: item.explanation
        };
        if (this.spotTotal >= 8 && (this.spotScore / this.spotTotal) >= 0.75) {
          await saveLevelProgress({ levelId: 5, completed: true, bestScore: Math.round(100 * this.spotScore / this.spotTotal), updatedAt: Date.now() });
          if (this.onLevelComplete) this.onLevelComplete(5, Math.round(100 * this.spotScore / this.spotTotal));
        }
        this._renderSpotDiff(bodyEl);
      });
    });

    bodyEl.querySelector('#l5NextSpotBtn')?.addEventListener('click', () => {
      this.spotIdx++;
      this.spotFeedback = null;
      this._renderSpotDiff(bodyEl);
    });
  }
}
