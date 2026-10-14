/**
 * Level 3: Action Units (FACS Core 18 + Supplemental AUs).
 * - 18-AU Interactive Encyclopedia with A-E intensity ladder (0.15..0.95) & unilateral L/R toggle.
 * - Single-AU & Pair Flash Drill (36 items from level3.json).
 * - Build-the-Face AU Sandbox (12 target recipe reconstruction challenges).
 */

import { FACS_INTENSITY_LADDER } from '../face/auMap.js';
import { logTrial, saveLevelProgress, putSRSCard } from '../store/db.js';
import { createSRSCard, updateSRSCard } from '../train/srs.js';

export class Level3AUsView {
  constructor(containerEl, { rig, content, onLevelComplete }) {
    this.containerEl = containerEl;
    this.rig = rig;
    this.content = content; // { aus, level3, expressions }
    this.onLevelComplete = onLevelComplete;

    this.subtab = 'encyclopedia'; // 'encyclopedia' | 'drill' | 'builder'
    this.selectedAUId = 1;
    this.selectedLetter = 'D';
    this.selectedSide = 'both';

    this.drillIdx = 0;
    this.drillScore = 0;
    this.drillTotal = 0;
    this.drillFeedback = null;

    this.builderIdx = 0;
    this.builderSelectedAUs = new Set();
    this.builderFeedback = null;

    this.render();
  }

  render() {
    this.containerEl.innerHTML = `
      <div class="level-view">
        <header class="level-header">
          <div>
            <span class="level-kicker">LEVEL 3 &bull; FACIAL ACTION CODING SYSTEM</span>
            <h2>Action Units (Core 18 AUs, Intensity A&ndash;E &amp; Face Builder)</h2>
            <p class="muted-text">Isolate every individual Action Unit before combining them into full macro and micro-expressions.</p>
          </div>
          <div class="segmented-tabs" role="tablist">
            <button type="button" class="seg-tab ${this.subtab === 'encyclopedia' ? 'active' : ''}" data-subtab="encyclopedia">1. 18-AU Encyclopedia</button>
            <button type="button" class="seg-tab ${this.subtab === 'drill' ? 'active' : ''}" data-subtab="drill">2. AU Flash Drill (36)</button>
            <button type="button" class="seg-tab ${this.subtab === 'builder' ? 'active' : ''}" data-subtab="builder">3. Build-the-Face (12)</button>
          </div>
        </header>

        <div id="l3SubtabBody" class="level-body"></div>
      </div>
    `;

    this.containerEl.querySelectorAll('[data-subtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.subtab = btn.getAttribute('data-subtab');
        this.render();
      });
    });

    const bodyEl = this.containerEl.querySelector('#l3SubtabBody');
    if (this.subtab === 'encyclopedia') {
      this._renderEncyclopedia(bodyEl);
    } else if (this.subtab === 'drill') {
      this._renderDrill(bodyEl);
    } else {
      this._renderBuilder(bodyEl);
    }
  }

  _applyCurrentEncyclopediaAU() {
    if (!this.rig) return;
    const weight = FACS_INTENSITY_LADDER[this.selectedLetter] || 0.75;
    this.rig.setOverlaysEnabled(true, [this.selectedAUId]);
    this.rig.setExpressionFromRecipe({
      aus: [{ au: this.selectedAUId, intensity: weight, side: this.selectedSide }]
    });
  }

  _renderEncyclopedia(bodyEl) {
    const aus = this.content.aus?.aus || [];
    const current = aus.find((a) => Number(a.id) === Number(this.selectedAUId)) || aus[0];
    this._applyCurrentEncyclopediaAU();

    bodyEl.innerHTML = `
      <div class="au-encyclopedia-layout">
        <div class="au-grid-selector">
          <h4>Select Action Unit</h4>
          <div class="au-pills-grid">
            ${aus.map((a) => `
              <button type="button" class="au-select-card ${Number(a.id) === Number(this.selectedAUId) ? 'active' : ''}" data-au-id="${a.id}">
                <span class="au-code">AU${a.id}</span>
                <span class="au-name">${a.name}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="au-inspector-card">
          <div class="inspector-badge" style="background:#38b6ff;color:#0b0e14;">
            REGION: ${(current?.region || 'upper').toUpperCase()} &bull; MUSCLE: ${current?.muscle || ''}
          </div>
          <h3>AU${current?.id}: ${current?.name}</h3>
          <p>${current?.visualCues || ''}</p>

          <div class="au-controls-box">
            <div>
              <label><strong>FACS Intensity Scale (A = Trace 0.15 &rarr; E = Maximum 0.95):</strong></label>
              <div class="btn-row" style="margin-top:6px;">
                ${Object.entries(FACS_INTENSITY_LADDER).map(([letter, val]) => `
                  <button type="button" class="btn btn-sm ${this.selectedLetter === letter ? 'btn-primary' : 'btn-secondary'} au-letter-btn" data-letter="${letter}">
                    ${letter} (${Math.round(val * 100)}%)
                  </button>
                `).join('')}
              </div>
            </div>

            <div style="margin-top:12px;">
              <label><strong>Laterality (Bilateral vs. Unilateral):</strong></label>
              <div class="btn-row" style="margin-top:6px;">
                ${['both', 'left', 'right'].map((side) => `
                  <button type="button" class="btn btn-sm ${this.selectedSide === side ? 'btn-primary' : 'btn-secondary'} au-side-btn" data-side="${side}">
                    ${side === 'both' ? 'Bilateral (Both)' : `Unilateral (Subject ${side.toUpperCase()})`}
                  </button>
                `).join('')}
                <button type="button" class="btn btn-sm btn-secondary" id="auFlashDemoBtn">Flash 200 ms</button>
                <button type="button" class="btn btn-sm btn-secondary" id="auResetNeutralBtn">Neutral</button>
              </div>
            </div>
          </div>

          <div class="inspector-meta-list">
            <div><strong>Muscle Attachment:</strong> ${current?.muscleAttachment || ''}</div>
            <div><strong>Distinguishing Note:</strong> ${current?.distinctionNote || ''}</div>
            <div><strong>ARKit Blendshape Channels:</strong> ${(current?.blendshapes || []).map((b) => `${b.shape}${b.lateral ? 'L/R' : ''} (${b.weight})`).join(', ')}</div>
          </div>
        </div>
      </div>
    `;

    bodyEl.querySelectorAll('.au-select-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedAUId = Number(btn.getAttribute('data-au-id'));
        this._renderEncyclopedia(bodyEl);
      });
    });

    bodyEl.querySelectorAll('.au-letter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedLetter = btn.getAttribute('data-letter');
        this._renderEncyclopedia(bodyEl);
      });
    });

    bodyEl.querySelectorAll('.au-side-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedSide = btn.getAttribute('data-side');
        this._renderEncyclopedia(bodyEl);
      });
    });

    bodyEl.querySelector('#auFlashDemoBtn')?.addEventListener('click', async () => {
      if (!this.rig) return;
      const weight = FACS_INTENSITY_LADDER[this.selectedLetter] || 0.75;
      this.rig.setOverlaysEnabled(false);
      await this.rig.flashExpression({
        aus: [{ au: this.selectedAUId, intensity: weight, side: this.selectedSide }]
      }, 200);
    });

    bodyEl.querySelector('#auResetNeutralBtn')?.addEventListener('click', () => {
      if (this.rig) {
        this.rig.setOverlaysEnabled(false);
        this.rig.resetToNeutral();
      }
    });
  }

  _renderDrill(bodyEl) {
    const drills = this.content.level3?.auDrills || [];
    const item = drills[this.drillIdx % drills.length];
    if (!item) return;

    bodyEl.innerHTML = `
      <div class="drill-card">
        <div class="drill-top-bar">
          <span><strong>AU Identification Drill</strong> &bull; Item ${(this.drillIdx % drills.length) + 1} of ${drills.length}</span>
          <span>Score: <strong>${this.drillScore}/${this.drillTotal}</strong></span>
        </div>

        <p class="drill-prompt">${item.prompt}</p>

        <div class="btn-row" style="margin-bottom:14px;">
          <button type="button" class="btn btn-primary" id="l3PlayAUFlashBtn">Flash AU Stimulus (${item.exposureMs || 333} ms)</button>
          <button type="button" class="btn btn-secondary" id="l3HoldAUStimBtn">Hold Peak on 3D Face</button>
        </div>

        <div class="q-options-grid">
          ${(item.options || []).map((opt) => `
            <button type="button" class="btn btn-secondary l3-drill-opt" data-opt="${opt}">${opt}</button>
          `).join('')}
        </div>

        ${this.drillFeedback ? `
          <div class="quiz-feedback ${this.drillFeedback.correct ? 'pass' : 'miss'}" style="margin-top:14px;">
            <p><strong>${this.drillFeedback.correct ? '✓ Correct!' : `✗ Answer: ${this.drillFeedback.answer}`}</strong> &mdash; ${this.drillFeedback.explanation}</p>
            <button type="button" class="btn btn-sm btn-primary" id="l3NextDrillBtn">Next AU Drill &rarr;</button>
          </div>
        ` : ''}
      </div>
    `;

    const playStim = async (hold = false) => {
      if (!this.rig) return;
      const recipe = {
        aus: (item.aus || []).map((id) => ({
          au: Number(id),
          intensity: item.intensity || 0.8,
          side: item.side || 'both'
        }))
      };
      if (hold) {
        this.rig.setOverlaysEnabled(true, item.aus);
        this.rig.setExpressionFromRecipe(recipe);
      } else {
        this.rig.setOverlaysEnabled(false);
        await this.rig.flashExpression(recipe, item.exposureMs || 333);
      }
    };

    bodyEl.querySelector('#l3PlayAUFlashBtn')?.addEventListener('click', () => playStim(false));
    bodyEl.querySelector('#l3HoldAUStimBtn')?.addEventListener('click', () => playStim(true));

    bodyEl.querySelectorAll('.l3-drill-opt').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (this.drillFeedback) return;
        const chosen = btn.getAttribute('data-opt');
        const correct = chosen === item.answer;
        this.drillFeedback = {correct};
        await logTrial({level:3,itemId:item.id,chosenEmotion:chosen,correct,firstTry:true,hintUsed:false});
        this.drillTotal++;
        if (correct) this.drillScore++;
        this.drillFeedback = {
          correct,
          answer: item.answer,
          explanation: item.explanation
        };

        const card = createSRSCard('au', item.id || `au_drill_${this.drillIdx}`);
        await putSRSCard(updateSRSCard(card, { correct }));

        if (!correct) {
          playStim(true);
        }
        if (this.drillTotal >= 10 && (this.drillScore / this.drillTotal) >= 0.8) {
          await saveLevelProgress({
            levelId: 3,
            completed: true,
            bestScore: Math.round((this.drillScore / this.drillTotal) * 100),
            updatedAt: Date.now()
          });
          if (this.onLevelComplete) this.onLevelComplete(3, 85);
        }
        this._renderDrill(bodyEl);
      });
    });

    bodyEl.querySelector('#l3NextDrillBtn')?.addEventListener('click', () => {
      this.drillIdx++;
      this.drillFeedback = null;
      this._renderDrill(bodyEl);
      playStim(false);
    });
  }

  _renderBuilder(bodyEl) {
    const targets = this.content.level3?.builderTargets || [];
    const target = targets[this.builderIdx % targets.length];
    const allAUs = (this.content.aus?.aus || []).slice(0, 18);
    if (!target) return;

    bodyEl.innerHTML = `
      <div class="builder-card">
        <div class="drill-top-bar">
          <span><strong>Build-the-Face Challenge ${this.builderIdx + 1} of ${targets.length}:</strong> ${target.title}</span>
          <button type="button" class="btn btn-sm btn-secondary" id="l3NextBuilderBtn">Skip / Next Challenge &rarr;</button>
        </div>
        <p>${target.prompt}</p>

        <div class="au-pills-grid">
          ${allAUs.map((a) => {
            const active = this.builderSelectedAUs.has(Number(a.id));
            return `
              <button type="button" class="au-select-card ${active ? 'active' : ''}" data-toggle-au="${a.id}">
                <span class="au-code">AU${a.id} ${active ? '✓' : ''}</span>
                <span class="au-name">${a.name}</span>
              </button>
            `;
          }).join('')}
        </div>

        <div class="btn-row" style="margin-top:14px;">
          <button type="button" class="btn btn-primary" id="l3CheckBuilderBtn">Check Constructed Face</button>
          <button type="button" class="btn btn-secondary" id="l3ClearBuilderBtn">Reset AUs</button>
        </div>

        ${this.builderFeedback ? `
          <div class="quiz-feedback ${this.builderFeedback.pass ? 'pass' : 'miss'}" style="margin-top:12px;">
            <strong>${this.builderFeedback.pass ? '✓ Recipe Match!' : '✗ Keep tuning:'}</strong>
            <span> ${this.builderFeedback.message}</span>
          </div>
        ` : ''}
      </div>
    `;

    const applyBuilderToRig = () => {
      if (!this.rig) return;
      const aus = [...this.builderSelectedAUs].map((id) => ({ au: id, intensity: 0.85 }));
      this.rig.setOverlaysEnabled(true, [...this.builderSelectedAUs]);
      this.rig.setExpressionFromRecipe({ aus });
    };

    bodyEl.querySelectorAll('[data-toggle-au]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-toggle-au'));
        if (this.builderSelectedAUs.has(id)) this.builderSelectedAUs.delete(id);
        else this.builderSelectedAUs.add(id);
        this.builderFeedback = null;
        applyBuilderToRig();
        this._renderBuilder(bodyEl);
      });
    });

    bodyEl.querySelector('#l3ClearBuilderBtn')?.addEventListener('click', () => {
      this.builderSelectedAUs.clear();
      this.builderFeedback = null;
      applyBuilderToRig();
      this._renderBuilder(bodyEl);
    });

    bodyEl.querySelector('#l3CheckBuilderBtn')?.addEventListener('click', () => {
      const req = new Set((target.requiredAUs || []).map(Number));
      const forbidden = new Set((target.forbiddenAUs || []).map(Number));
      const missing = [...req].filter((id) => !this.builderSelectedAUs.has(id));
      const bad = [...this.builderSelectedAUs].filter((id) => forbidden.has(id));

      const pass = missing.length === 0 && bad.length === 0;
      this.builderFeedback = {
        pass,
        message: pass
          ? `${target.explanation}`
          : `Required AUs: ${[...req].map((x) => `AU${x}`).join(' + ')}. ${bad.length ? `Remove AU${bad.join(', AU')}. ` : ''}${target.explanation}`
      };
      this._renderBuilder(bodyEl);
    });

    bodyEl.querySelector('#l3NextBuilderBtn')?.addEventListener('click', () => {
      this.builderIdx = (this.builderIdx + 1) % targets.length;
      this.builderSelectedAUs.clear();
      this.builderFeedback = null;
      applyBuilderToRig();
      this._renderBuilder(bodyEl);
    });
  }
}
