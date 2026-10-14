/**
 * Level 10: Real-World Calibration, Context-Swap & Live Conversation Simulation.
 * - Context-Swap Paradigm (Barrett, Mesquita & Gendron 2011): 10 pairs (20 scenes) where the
 *   EXACT same 3D facial AU configuration is shown in two contrasting situational contexts.
 * - 8 Scripted Multi-Second Conversation Simulations (`content/conversations.json`) with
 *   live dialogue subtitles, embedded micro-flashes, timeline scrubbing, and two-part questions:
 *   (1) What facial signal occurred? (2) What is the best open-ended, non-accusatory calibrated question to ask next?
 */

import { TimelinePlayer } from '../face/timeline.js';
import { renderSceneCardHTML } from '../ui/scenes.js';
import { saveLevelProgress } from '../store/db.js';

export class Level10RealWorldView {
  constructor(containerEl, { rig, content, onLevelComplete }) {
    this.containerEl = containerEl;
    this.rig = rig;
    this.content = content; // { scenes, conversations, expressions, aus, level10 }
    this.onLevelComplete = onLevelComplete;

    this.subtab = 'conversations'; // 'conversations' | 'context_swap'
    this.convIdx = 0;
    this.convStep = 'watch'; // 'watch' | 'q1' | 'q2' | 'done'
    this.convQ1Ans = null;
    this.convQ2Ans = null;
    this.activeSubtitle = '';
    this.activePlayer = null;

    this.swapIdx = 0;
    this.swapActiveSide = 'A';
    this.swapAnswered = null;

    this.render();
  }

  render() {
    this.containerEl.innerHTML = `
      <div class="level-view">
        <header class="level-header">
          <div>
            <span class="level-kicker">LEVEL 10 &bull; REAL-WORLD CALIBRATION &amp; CONVERSATIONS</span>
            <h2>Live Conversation Simulations &amp; Context-Swap Calibration</h2>
            <p class="muted-text">Spot fleeting cues during realistic dialogue, pair them with open-ended calibrated questions, and experience how context reshapes identical facial muscle configurations.</p>
          </div>
          <div class="segmented-tabs" role="tablist">
            <button type="button" class="seg-tab ${this.subtab === 'conversations' ? 'active' : ''}" data-subtab="conversations">1. Conversation Simulations (8)</button>
            <button type="button" class="seg-tab ${this.subtab === 'context_swap' ? 'active' : ''}" data-subtab="context_swap">2. Context-Swap Paradigm (10 Pairs)</button>
          </div>
        </header>

        <div id="l10SubtabBody" class="level-body"></div>
      </div>
    `;

    this.containerEl.querySelectorAll('[data-subtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.subtab = btn.getAttribute('data-subtab');
        this.render();
      });
    });

    const bodyEl = this.containerEl.querySelector('#l10SubtabBody');
    if (this.subtab === 'conversations') {
      this._renderConversations(bodyEl);
    } else {
      this._renderContextSwap(bodyEl);
    }
  }

  _renderConversations(bodyEl) {
    const convs = this.content.conversations?.conversations || [];
    const conv = convs[this.convIdx % convs.length];
    if (!conv) return;

    this.activePlayer = new TimelinePlayer({
      keyframes: conv.keyframes || [],
      auCatalog: this.content.aus,
      expressionsCatalog: this.content.expressions
    });

    bodyEl.innerHTML = `
      <div class="drill-card">
        <div class="drill-top-bar">
          <span><strong>Conversation Simulation ${(this.convIdx % convs.length) + 1} of ${convs.length}:</strong> ${conv.title}</span>
          <button type="button" class="btn btn-sm btn-secondary" id="l10NextConvBtn">Next Conversation &rarr;</button>
        </div>

        <p class="muted-text"><strong>Setting &amp; Baseline:</strong> ${conv.setting}</p>

        <div class="conversation-dialogue-banner" id="l10SubtitleBox">
          ${this.activeSubtitle || `&ldquo;${conv.dialogueLine}&rdquo;`}
        </div>

        <div class="btn-row" style="margin:12px 0;">
          <button type="button" class="btn btn-primary" id="l10PlayConvBtn">▶ Play Conversation Clip (${this.activePlayer.totalDurationMs} ms)</button>
          <button type="button" class="btn btn-secondary" id="l10JumpLeakBtn">Inspect Leaked Moment (${conv.flashTimestampMs || 1400} ms) + AU Overlay</button>
        </div>

        <!-- Two-Part Questions -->
        <div class="conv-questions-grid">
          <div class="quiz-question-card ${this.convQ1Ans ? (this.convQ1Ans === conv.signalQuestion.answer ? 'q-pass' : 'q-miss') : ''}">
            <p class="q-prompt"><strong>Part 1 (Observation):</strong> ${conv.signalQuestion.prompt}</p>
            <div class="q-options-grid">
              ${(conv.signalQuestion.options || []).map((opt) => `
                <button type="button" class="btn btn-secondary l10-q1-opt ${this.convQ1Ans === opt ? 'active' : ''}" data-opt="${opt}">${opt}</button>
              `).join('')}
            </div>
            ${this.convQ1Ans ? `<p class="q-explanation">${conv.signalQuestion.explanation}</p>` : ''}
          </div>

          <div class="quiz-question-card ${this.convQ2Ans ? (this.convQ2Ans === conv.responseQuestion.answer ? 'q-pass' : 'q-miss') : ''}">
            <p class="q-prompt"><strong>Part 2 (Calibrated Non-Accusatory Follow-Up):</strong> ${conv.responseQuestion.prompt}</p>
            <div class="q-options-grid">
              ${(conv.responseQuestion.options || []).map((opt) => `
                <button type="button" class="btn btn-secondary l10-q2-opt ${this.convQ2Ans === opt ? 'active' : ''}" data-opt="${opt}">${opt}</button>
              `).join('')}
            </div>
            ${this.convQ2Ans ? `<p class="q-explanation">${conv.responseQuestion.explanation}</p>` : ''}
          </div>
        </div>
      </div>
    `;

    bodyEl.querySelector('#l10PlayConvBtn')?.addEventListener('click', async () => {
      if (!this.rig || !this.activePlayer) return;
      if (conv.rigId) {
        await this.rig.loadRig(conv.rigId);
      }
      this.rig.setOverlaysEnabled(false);
      await this.rig.playTimeline(this.activePlayer);
    });

    bodyEl.querySelector('#l10JumpLeakBtn')?.addEventListener('click', () => {
      if (!this.rig || !this.activePlayer) return;
      const leakMs = conv.flashTimestampMs || 1400;
      const state = this.activePlayer.evaluateAtMs(leakMs);
      this.rig.setOverlaysEnabled(true);
      this.rig.applyResolvedState(state);
    });

    bodyEl.querySelectorAll('.l10-q1-opt').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.convQ1Ans = btn.getAttribute('data-opt');
        this._renderConversations(bodyEl);
      });
    });

    bodyEl.querySelectorAll('.l10-q2-opt').forEach((btn) => {
      btn.addEventListener('click', async () => {
        this.convQ2Ans = btn.getAttribute('data-opt');
        if (this.convQ1Ans && this.convQ2Ans) {
          await saveLevelProgress({ levelId: 10, completed: true, bestScore: 90, updatedAt: Date.now() });
          if (this.onLevelComplete) this.onLevelComplete(10, 90);
        }
        this._renderConversations(bodyEl);
      });
    });

    bodyEl.querySelector('#l10NextConvBtn')?.addEventListener('click', () => {
      this.convIdx++;
      this.convQ1Ans = null;
      this.convQ2Ans = null;
      this._renderConversations(bodyEl);
    });
  }

  _renderContextSwap(bodyEl) {
    const pairs = this.content.scenes?.contextSwapPairs || [];
    const pair = pairs[this.swapIdx % pairs.length];
    if (!pair) return;

    // Apply the shared identical facial recipe on the 3D head
    if (this.rig && pair.sharedFaceRecipe) {
      this.rig.setOverlaysEnabled(true);
      this.rig.setExpressionFromRecipe(pair.sharedFaceRecipe);
    }

    const activeScene = this.swapActiveSide === 'A' ? pair.contextA : pair.contextB;

    bodyEl.innerHTML = `
      <div class="drill-card">
        <div class="drill-top-bar">
          <span><strong>Context-Swap Pair ${(this.swapIdx % pairs.length) + 1} of ${pairs.length}:</strong> ${pair.title}</span>
          <button type="button" class="btn btn-sm btn-secondary" id="l10NextSwapBtn">Next Context-Swap Pair &rarr;</button>
        </div>

        <p class="muted-text">The 3D face is holding the <strong>exact same Action Unit configuration</strong> (<code>${(pair.sharedFaceRecipe?.aus || []).map((a) => `AU${a.au}`).join(' + ')}</code>) in both Context A and Context B:</p>

        <div class="btn-row" style="margin:12px 0;">
          <button type="button" class="btn ${this.swapActiveSide === 'A' ? 'btn-primary' : 'btn-secondary'}" id="l10SwapABtn">
            View Context A: ${pair.contextA?.title}
          </button>
          <button type="button" class="btn ${this.swapActiveSide === 'B' ? 'btn-primary' : 'btn-secondary'}" id="l10SwapBBtn">
            View Context B: ${pair.contextB?.title}
          </button>
        </div>

        ${renderSceneCardHTML(activeScene, {
          extraHTML: `<div class="quiz-feedback pass" style="margin-top:10px;"><strong>Inferred State in Context ${this.swapActiveSide}:</strong> ${activeScene?.inferredState}</div>`
        })}

        <div class="quiz-feedback pass" style="margin-top:14px;">
          <strong>Scientific Takeaway (Barrett, Mesquita &amp; Gendron 2011):</strong> ${pair.lesson}
        </div>
      </div>
    `;

    bodyEl.querySelector('#l10SwapABtn')?.addEventListener('click', () => {
      this.swapActiveSide = 'A';
      this._renderContextSwap(bodyEl);
    });
    bodyEl.querySelector('#l10SwapBBtn')?.addEventListener('click', () => {
      this.swapActiveSide = 'B';
      this._renderContextSwap(bodyEl);
    });
    bodyEl.querySelector('#l10NextSwapBtn')?.addEventListener('click', () => {
      this.swapIdx++;
      this.swapActiveSide = 'A';
      this._renderContextSwap(bodyEl);
    });
  }
}
