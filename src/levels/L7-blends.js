/**
 * Level 7: Compound / Blended, Masked & Temporal Dynamics.
 * - 12 Compound / Blended Expressions with two-tag component selection.
 * - 18 Masked Micro-Flashes & Upper-Face Leakage Timelines with interactive millisecond scrubber.
 * - 4 Genuine vs. Posed Smile Onset/Apex/Offset Timing Comparisons.
 */

import { TimelinePlayer } from '../face/timeline.js';
import { CORE_EMOTIONS_7 } from '../train/staircase.js';
import { saveLevelProgress, logTrial } from '../store/db.js';

export class Level7BlendsView {
  constructor(containerEl, { rig, content, onLevelComplete }) {
    this.containerEl = containerEl;
    this.rig = rig;
    this.content = content; // { blends, expressions, aus, level7 }
    this.onLevelComplete = onLevelComplete;

    this.subtab = 'blends'; // 'blends' | 'masked' | 'timing'
    this.blendIdx = 0;
    this.selectedTags = new Set();
    this.blendFeedback = null;
    this.blendScore = 0;
    this.blendTotal = 0;

    this.maskedIdx = 0;
    this.maskedFeedback = null;
    this.scrubMs = 0;
    this.activePlayer = null;

    this.timingIdx = 0;

    this.render();
  }

  render() {
    this.containerEl.innerHTML = `
      <div class="level-view">
        <header class="level-header">
          <div>
            <span class="level-kicker">LEVEL 7 &bull; BLENDS, MASKING &amp; TEMPORAL DYNAMICS</span>
            <h2>Compound Expressions, Masked Micro-Flashes &amp; Onset Timing</h2>
            <p class="muted-text">Identify two-component facial blends, catch 100&ndash;160 ms true emotions before a social mask covers them, and compare ballistic vs. abrupt onset timing.</p>
          </div>
          <div class="segmented-tabs" role="tablist">
            <button type="button" class="seg-tab ${this.subtab === 'blends' ? 'active' : ''}" data-subtab="blends">1. Compound Blends (12)</button>
            <button type="button" class="seg-tab ${this.subtab === 'masked' ? 'active' : ''}" data-subtab="masked">2. Masked Flashes &amp; Scrub (18)</button>
            <button type="button" class="seg-tab ${this.subtab === 'timing' ? 'active' : ''}" data-subtab="timing">3. Onset / Offset Timing (4)</button>
          </div>
        </header>

        <div id="l7SubtabBody" class="level-body"></div>
      </div>
    `;

    this.containerEl.querySelectorAll('[data-subtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.subtab = btn.getAttribute('data-subtab');
        this.render();
      });
    });

    const bodyEl = this.containerEl.querySelector('#l7SubtabBody');
    if (this.subtab === 'blends') {
      this._renderBlends(bodyEl);
    } else if (this.subtab === 'masked') {
      this._renderMasked(bodyEl);
    } else {
      this._renderTiming(bodyEl);
    }
  }

  _renderBlends(bodyEl) {
    const blends = this.content.blends?.blends || [];
    const item = blends[this.blendIdx % blends.length];
    if (!item) return;

    if (this.rig && !this.blendFeedback) {
      this.rig.setOverlaysEnabled(false);
      this.rig.setExpressionFromRecipe({ aus: item.aus });
    }

    bodyEl.innerHTML = `
      <div class="drill-card">
        <div class="drill-top-bar">
          <span><strong>Compound Blend ${(this.blendIdx % blends.length) + 1} of ${blends.length}:</strong> Select the TWO component emotions</span>
          <span>Score: <strong>${this.blendScore}/${this.blendTotal}</strong></span>
        </div>

        <div class="btn-row" style="margin:12px 0;">
          <button type="button" class="btn btn-primary" id="l7FlashBlendBtn">Flash Blend (333 ms)</button>
          <button type="button" class="btn btn-secondary" id="l7HoldBlendBtn">Hold Blend on 3D Face</button>
        </div>

        <p class="muted-text">Click exactly <strong>2 component emotion tags</strong> below (${this.selectedTags.size}/2 selected):</p>
        <div class="emotion-answer-grid">
          ${CORE_EMOTIONS_7.map((em) => {
            const active = this.selectedTags.has(em);
            return `
              <button type="button" class="btn ${active ? 'btn-primary' : 'btn-secondary'} l7-tag-btn" data-tag="${em}">
                ${em.charAt(0).toUpperCase() + em.slice(1)} ${active ? '✓' : ''}
              </button>
            `;
          }).join('')}
        </div>

        <div class="btn-row" style="margin-top:14px;">
          <button type="button" class="btn btn-primary" id="l7SubmitBlendBtn" ${this.selectedTags.size !== 2 || this.blendFeedback ? 'disabled' : ''}>
            Submit 2-Emotion Blend
          </button>
        </div>

        ${this.blendFeedback ? `
          <div class="diagnostic-feedback-panel ${this.blendFeedback.correct ? 'pass' : 'miss'}" style="margin-top:14px;">
            <p><strong>${this.blendFeedback.correct ? `✓ Correct: ${item.name}` : `✗ Target Blend: ${item.name} (${item.components.join(' + ')})`}</strong></p>
            <p>${item.regionalBreakdown}</p>
            <button type="button" class="btn btn-sm btn-primary" id="l7NextBlendBtn">Next Compound Blend &rarr;</button>
          </div>
        ` : ''}
      </div>
    `;

    bodyEl.querySelector('#l7FlashBlendBtn')?.addEventListener('click', async () => {
      if (this.rig) {
        this.rig.setOverlaysEnabled(false);
        await this.rig.flashExpression({ aus: item.aus }, 333);
      }
    });

    bodyEl.querySelector('#l7HoldBlendBtn')?.addEventListener('click', () => {
      if (this.rig) {
        this.rig.setOverlaysEnabled(true);
        this.rig.setExpressionFromRecipe({ aus: item.aus });
      }
    });

    bodyEl.querySelectorAll('.l7-tag-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.blendFeedback) return;
        const tag = btn.getAttribute('data-tag');
        if (this.selectedTags.has(tag)) {
          this.selectedTags.delete(tag);
        } else if (this.selectedTags.size < 2) {
          this.selectedTags.add(tag);
        }
        this._renderBlends(bodyEl);
      });
    });

    bodyEl.querySelector('#l7SubmitBlendBtn')?.addEventListener('click', async () => {
      const targetSet = new Set(item.components || []);
      const correct = this.selectedTags.size === 2 && [...this.selectedTags].every((t) => targetSet.has(t));
      this.blendTotal++;
      if (correct) this.blendScore++;
      this.blendFeedback = { correct };
      if (this.rig) {
        this.rig.setOverlaysEnabled(true);
        this.rig.setExpressionFromRecipe({ aus: item.aus });
      }
      await logTrial({
        timestamp: Date.now(),
        level: 7,
        mode: 'blend',
        shownEmotion: item.components?.[0] || 'fear',
        chosenEmotion: [...this.selectedTags][0] || 'not_sure',
        nominalMs: 333,
        correct
      });
      if (this.blendTotal >= 6) {
        await saveLevelProgress({ levelId: 7, completed: true, bestScore: 85, updatedAt: Date.now() });
        if (this.onLevelComplete) this.onLevelComplete(7, 85);
      }
      this._renderBlends(bodyEl);
    });

    bodyEl.querySelector('#l7NextBlendBtn')?.addEventListener('click', () => {
      this.blendIdx++;
      this.selectedTags.clear();
      this.blendFeedback = null;
      this._renderBlends(bodyEl);
    });
  }

  _renderMasked(bodyEl) {
    const allMasked = [
      ...(this.content.blends?.maskedFlashes || []),
      ...(this.content.blends?.upperFaceLeaks || [])
    ];
    const item = allMasked[this.maskedIdx % allMasked.length];
    if (!item) return;

    this.activePlayer = new TimelinePlayer({
      keyframes: item.keyframes || [],
      auCatalog: this.content.aus,
      expressionsCatalog: this.content.expressions
    });

    bodyEl.innerHTML = `
      <div class="drill-card">
        <div class="drill-top-bar">
          <span><strong>Masked Flash / Upper-Face Leak ${(this.maskedIdx % allMasked.length) + 1} of ${allMasked.length}:</strong> ${item.title}</span>
          <button type="button" class="btn btn-sm btn-secondary" id="l7NextMaskedBtn">Next Masked Sequence &rarr;</button>
        </div>

        <p>${item.description}</p>

        <div class="btn-row" style="margin:12px 0;">
          <button type="button" class="btn btn-primary" id="l7PlayMaskedTimelineBtn">▶ Play Real-Time Sequence (${this.activePlayer.totalDurationMs} ms)</button>
        </div>

        <!-- Millisecond Timeline Scrubber -->
        <div class="timeline-scrubber-box">
          <label for="l7ScrubInput">
            <strong>Interactive Millisecond Scrubber:</strong>
            <span id="l7ScrubReadout">${this.scrubMs} ms / ${this.activePlayer.totalDurationMs} ms</span>
          </label>
          <input type="range" id="l7ScrubInput" min="0" max="${this.activePlayer.totalDurationMs}" step="10" value="${this.scrubMs}" />
        </div>

        <p style="margin-top:12px;"><strong>Which emotion leaked first before the mask?</strong></p>
        <div class="emotion-answer-grid">
          ${CORE_EMOTIONS_7.map((em) => `
            <button type="button" class="btn btn-secondary l7-masked-ans" data-ans="${em}">
              ${em.charAt(0).toUpperCase() + em.slice(1)}
            </button>
          `).join('')}
        </div>

        ${this.maskedFeedback ? `
          <div class="quiz-feedback ${this.maskedFeedback.correct ? 'pass' : 'miss'}" style="margin-top:14px;">
            <p><strong>${this.maskedFeedback.correct ? '✓ Caught the leak!' : `✗ Leaked Emotion: ${item.leakedEmotion}`}</strong> &mdash; ${item.explanation}</p>
          </div>
        ` : ''}
      </div>
    `;

    const scrubInput = bodyEl.querySelector('#l7ScrubInput');
    const scrubReadout = bodyEl.querySelector('#l7ScrubReadout');

    bodyEl.querySelector('#l7PlayMaskedTimelineBtn')?.addEventListener('click', async () => {
      if (!this.rig || !this.activePlayer) return;
      this.rig.setOverlaysEnabled(false);
      await this.rig.playTimeline(this.activePlayer, {
        onTick: (_state, curMs, totMs) => {
          if (scrubInput) scrubInput.value = String(Math.round(curMs));
          if (scrubReadout) scrubReadout.textContent = `${Math.round(curMs)} ms / ${totMs} ms`;
        }
      });
    });

    scrubInput?.addEventListener('input', () => {
      this.scrubMs = Number(scrubInput.value);
      if (scrubReadout) scrubReadout.textContent = `${this.scrubMs} ms / ${this.activePlayer.totalDurationMs} ms`;
      if (this.rig && this.activePlayer) {
        this.rig.setOverlaysEnabled(true);
        const state = this.activePlayer.evaluateAtMs(this.scrubMs);
        this.rig.applyResolvedState(state);
      }
    });

    bodyEl.querySelectorAll('.l7-masked-ans').forEach((btn) => {
      btn.addEventListener('click', () => {
        const chosen = btn.getAttribute('data-ans');
        this.maskedFeedback = { correct: chosen === item.leakedEmotion };
        this._renderMasked(bodyEl);
      });
    });

    bodyEl.querySelector('#l7NextMaskedBtn')?.addEventListener('click', () => {
      this.maskedIdx++;
      this.maskedFeedback = null;
      this.scrubMs = 0;
      this._renderMasked(bodyEl);
    });
  }

  _renderTiming(bodyEl) {
    const items = this.content.blends?.timingComparisons || [];
    const item = items[this.timingIdx % items.length];
    if (!item) return;

    bodyEl.innerHTML = `
      <div class="drill-card">
        <div class="drill-top-bar">
          <span><strong>Onset / Apex / Offset Timing Comparison ${(this.timingIdx % items.length) + 1} of ${items.length}:</strong> ${item.title}</span>
          <button type="button" class="btn btn-sm btn-secondary" id="l7NextTimingBtn">Next Comparison &rarr;</button>
        </div>

        <p>${item.description}</p>

        <div class="btn-row" style="margin:14px 0;">
          <button type="button" class="btn btn-primary" id="l7PlayTimingABtn">▶ Play Sequence A (${item.labelA})</button>
          <button type="button" class="btn btn-primary" id="l7PlayTimingBBtn">▶ Play Sequence B (${item.labelB})</button>
        </div>

        <div class="quiz-feedback pass">
          <strong>Temporal Signature Rule:</strong> ${item.keyTakeaway}
        </div>
      </div>
    `;

    const playKf = async (keyframes) => {
      if (!this.rig || !keyframes) return;
      const player = new TimelinePlayer({
        keyframes,
        auCatalog: this.content.aus,
        expressionsCatalog: this.content.expressions
      });
      this.rig.setOverlaysEnabled(true);
      await this.rig.playTimeline(player);
    };

    bodyEl.querySelector('#l7PlayTimingABtn')?.addEventListener('click', () => playKf(item.keyframesA));
    bodyEl.querySelector('#l7PlayTimingBBtn')?.addEventListener('click', () => playKf(item.keyframesB));
    bodyEl.querySelector('#l7NextTimingBtn')?.addEventListener('click', () => {
      this.timingIdx++;
      this._renderTiming(bodyEl);
    });
  }
}
