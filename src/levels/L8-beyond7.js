/**
 * Level 8: Beyond the 7 — Extended & Self-Conscious States (Keltner / Cowen & Keltner).
 * - 12 Social, Self-Conscious & Cognitive States (Embarrassment, Shame, Pride, Amusement,
 *   Interest, Relief, Sympathy, Pain, Concentration, Skepticism, Coyness, Triumph).
 * - Pairs 3D Head Pitch/Yaw/Roll + Gaze + AU recipes with SVG Body Posture silhouettes.
 */

import { renderPostureSVG } from '../ui/scenes.js';
import { saveLevelProgress } from '../store/db.js';

export class Level8Beyond7View {
  constructor(containerEl, { rig, content, onLevelComplete }) {
    this.containerEl = containerEl;
    this.rig = rig;
    this.content = content; // { emotions27, expressions, aus, level8 }
    this.onLevelComplete = onLevelComplete;

    this.subtab = 'explorer'; // 'explorer' | 'drill'
    this.selectedIdx = 0;
    this.drillIdx = 0;
    this.drillScore = 0;
    this.drillTotal = 0;
    this.drillFeedback = null;

    this.render();
  }

  render() {
    this.containerEl.innerHTML = `
      <div class="level-view">
        <header class="level-header">
          <div>
            <span class="level-kicker">LEVEL 8 &bull; BEYOND THE 7 UNIVERSAL EMOTIONS</span>
            <h2>Self-Conscious, Social &amp; Multi-Modal States (Head Pose + Gaze + Posture)</h2>
            <p class="muted-text">States like Embarrassment, Shame, Pride, Interest, and Relief cannot be read from static facial muscles alone &mdash; they require head pitch/tilt, gaze direction, and body posture.</p>
          </div>
          <div class="segmented-tabs" role="tablist">
            <button type="button" class="seg-tab ${this.subtab === 'explorer' ? 'active' : ''}" data-subtab="explorer">1. 12 Social States Atlas</button>
            <button type="button" class="seg-tab ${this.subtab === 'drill' ? 'active' : ''}" data-subtab="drill">2. Multi-Modal Recognition Drill</button>
          </div>
        </header>

        <div id="l8SubtabBody" class="level-body"></div>
      </div>
    `;

    this.containerEl.querySelectorAll('[data-subtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.subtab = btn.getAttribute('data-subtab');
        this.render();
      });
    });

    const bodyEl = this.containerEl.querySelector('#l8SubtabBody');
    if (this.subtab === 'explorer') {
      this._renderExplorer(bodyEl);
    } else {
      this._renderDrill(bodyEl);
    }
  }

  _applySocialItemToRig(item) {
    if (!this.rig || !item) return;
    this.rig.setOverlaysEnabled(true);
    this.rig.setExpressionFromRecipe({
      aus: item.aus || [],
      extras: item.extras || {}
    });
  }

  _renderExplorer(bodyEl) {
    const items = this.content.emotions27?.socialSelfConsciousItems || [];
    const current = items[this.selectedIdx % items.length] || items[0];
    this._applySocialItemToRig(current);

    bodyEl.innerHTML = `
      <div class="atlas-grid-layout">
        <div class="atlas-selector-card">
          <h4>12 Social &amp; Self-Conscious States</h4>
          <div class="emotion-cards-stack">
            ${items.map((it, idx) => `
              <button type="button" class="emotion-select-row ${idx === (this.selectedIdx % items.length) ? 'active' : ''}" data-idx="${idx}">
                <strong>${it.name}</strong>
                <span class="au-formula-badge">${it.postureSvg}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="atlas-inspector-card">
          <div class="l8-inspector-split">
            <div>
              <h3>${current?.name || ''}</h3>
              <p>${current?.description || ''}</p>
              <div class="inspector-meta-list">
                <div><strong>Facial AUs:</strong> ${(current?.aus || []).map((a) => `AU${a.au}`).join(' + ') || 'Minimal / variable'}</div>
                <div><strong>Head &amp; Gaze Pose:</strong> Pitch ${current?.extras?.headPitch || 0}&deg;, Yaw ${current?.extras?.headYaw || 0}&deg;, Roll ${current?.extras?.headRoll || 0}&deg;, Gaze Down ${Math.round((current?.extras?.gazeDown || 0) * 100)}%</div>
                <div><strong>Key Distinction:</strong> ${current?.distinction || ''}</div>
              </div>
            </div>
            <div class="l8-posture-box">
              ${renderPostureSVG(current?.postureSvg || 'expanded')}
            </div>
          </div>
        </div>
      </div>
    `;

    bodyEl.querySelectorAll('[data-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedIdx = Number(btn.getAttribute('data-idx'));
        this._renderExplorer(bodyEl);
      });
    });
  }

  _renderDrill(bodyEl) {
    const items = this.content.emotions27?.socialSelfConsciousItems || [];
    const item = items[this.drillIdx % items.length];
    if (!item) return;

    this._applySocialItemToRig(item);
    const options = items.slice(0, 6).map((x) => x.name);
    if (!options.includes(item.name)) options[0] = item.name;

    bodyEl.innerHTML = `
      <div class="drill-card">
        <div class="drill-top-bar">
          <span><strong>Multi-Modal State Identification ${(this.drillIdx % items.length) + 1} of ${items.length}</strong></span>
          <span>Score: <strong>${this.drillScore}/${this.drillTotal}</strong></span>
        </div>

        <div class="l8-drill-cue-row" style="display:flex;gap:18px;align-items:center;margin:12px 0;">
          ${renderPostureSVG(item.postureSvg, { width: 130, height: 125, showCaption: true })}
          <div>
            <p><strong>Observed Multi-Modal Pattern:</strong> ${item.description}</p>
            <p class="muted-text">Inspect both the 3D head orientation/gaze and the body posture silhouette.</p>
          </div>
        </div>

        <div class="q-options-grid">
          ${options.map((opt) => `
            <button type="button" class="btn btn-secondary l8-drill-opt" data-opt="${opt}" ${this.drillFeedback ? 'disabled' : ''}>${opt}</button>
          `).join('')}
        </div>

        ${this.drillFeedback ? `
          <div class="quiz-feedback ${this.drillFeedback.correct ? 'pass' : 'miss'}" style="margin-top:14px;">
            <p><strong>${this.drillFeedback.correct ? '✓ Correct!' : `✗ Target State: ${item.name}`}</strong> &mdash; ${item.distinction}</p>
            <button type="button" class="btn btn-sm btn-primary" id="l8NextDrillBtn">Next State &rarr;</button>
          </div>
        ` : ''}
      </div>
    `;

    bodyEl.querySelectorAll('.l8-drill-opt').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const chosen = btn.getAttribute('data-opt');
        const correct = chosen === item.name;
        this.drillTotal++;
        if (correct) this.drillScore++;
        this.drillFeedback = { correct };
        if (this.drillTotal >= 6) {
          await saveLevelProgress({ levelId: 8, completed: true, bestScore: 85, updatedAt: Date.now() });
          if (this.onLevelComplete) this.onLevelComplete(8, 85);
        }
        this._renderDrill(bodyEl);
      });
    });

    bodyEl.querySelector('#l8NextDrillBtn')?.addEventListener('click', () => {
      this.drillIdx++;
      this.drillFeedback = null;
      this._renderDrill(bodyEl);
    });
  }
}
