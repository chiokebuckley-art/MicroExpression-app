/**
 * Level 9: Expressions in Context (Multi-Cue Integration & Common Misreads).
 * - 15 Contextual Scene Vignettes combining 3D facial expressions with posture SVG, setting, and speech captions.
 * - Common Non-Emotional Misreads Workshop (Concentration AU4 != Anger, Pain != Disgust, Polite AU12 != Joy, Fatigue != Sadness).
 */

import { renderSceneCardHTML } from '../ui/scenes.js';
import { logTrial, saveLevelProgress, putSRSCard } from '../store/db.js';
import { createSRSCard, updateSRSCard } from '../train/srs.js';

export class Level9ContextView {
  constructor(containerEl, { rig, content, onLevelComplete }) {
    this.containerEl = containerEl;
    this.rig = rig;
    this.content = content; // { scenes, expressions, aus, level9 }
    this.onLevelComplete = onLevelComplete;

    this.subtab = 'scenes'; // 'scenes' | 'misreads'
    this.sceneIdx = 0;
    this.sceneScore = 0;
    this.sceneTotal = 0;
    this.sceneFeedback = null;

    this.render();
  }

  render() {
    this.containerEl.innerHTML = `
      <div class="level-view">
        <header class="level-header">
          <div>
            <span class="level-kicker">LEVEL 9 &bull; MULTI-CUE CONTEXT INTEGRATION</span>
            <h2>Reading Expressions in Context &amp; Avoiding Common Misreads</h2>
            <p class="muted-text">Integrate facial Action Units with situational context, body posture, and speech, and distinguish concentration, physical pain, and fatigue from emotional looks-alikes.</p>
          </div>
          <div class="segmented-tabs" role="tablist">
            <button type="button" class="seg-tab ${this.subtab === 'scenes' ? 'active' : ''}" data-subtab="scenes">1. 15 Contextual Scene Drills</button>
            <button type="button" class="seg-tab ${this.subtab === 'misreads' ? 'active' : ''}" data-subtab="misreads">2. Common Misreads Guide</button>
          </div>
        </header>

        <div id="l9SubtabBody" class="level-body"></div>
      </div>
    `;

    this.containerEl.querySelectorAll('[data-subtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.subtab = btn.getAttribute('data-subtab');
        this.render();
      });
    });

    const bodyEl = this.containerEl.querySelector('#l9SubtabBody');
    if (this.subtab === 'scenes') {
      this._renderSceneDrill(bodyEl);
    } else {
      this._renderMisreads(bodyEl);
    }
  }

  _applySceneExpression(scene) {
    if (!this.rig || !scene) return;
    const exprId = scene.faceExpression;
    const all = [
      ...(this.content.expressions?.core || []),
      ...(this.content.expressions?.variants || []),
      ...(this.content.expressions?.social || [])
    ];
    const expr = all.find((e) => e.id === exprId);
    if (expr) {
      this.rig.setOverlaysEnabled(Boolean(this.sceneFeedback));
      this.rig.setExpressionFromRecipe(expr);
    }
  }

  _renderSceneDrill(bodyEl) {
    const scenes = this.content.scenes?.level9Scenes || [];
    const scene = scenes[this.sceneIdx % scenes.length];
    if (!scene) return;

    this._applySceneExpression(scene);

    bodyEl.innerHTML = `
      <div class="drill-card">
        <div class="drill-top-bar">
          <span><strong>Contextual Scene ${(this.sceneIdx % scenes.length) + 1} of ${scenes.length}</strong></span>
          <span>Score: <strong>${this.sceneScore}/${this.sceneTotal}</strong></span>
        </div>

        ${renderSceneCardHTML(scene)}

        <p style="margin-top:14px;"><strong>${scene.question || 'What is the most calibrated interpretation of this multi-cue signal?'}</strong></p>
        <div class="q-options-grid">
          ${(scene.options || []).map((opt) => `
            <button type="button" class="btn btn-secondary l9-scene-opt" data-opt="${opt}" ${this.sceneFeedback ? 'disabled' : ''}>${opt}</button>
          `).join('')}
        </div>

        ${this.sceneFeedback ? `
          <div class="quiz-feedback ${this.sceneFeedback.correct ? 'pass' : 'miss'}" style="margin-top:14px;">
            <p><strong>${this.sceneFeedback.correct ? '✓ Well calibrated!' : `✗ Best Synthesis: ${scene.answer}`}</strong> &mdash; ${scene.explanation}</p>
            <button type="button" class="btn btn-sm btn-primary" id="l9NextSceneBtn">Next Scene Vignette &rarr;</button>
          </div>
        ` : ''}
      </div>
    `;

    bodyEl.querySelectorAll('.l9-scene-opt').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (this.sceneFeedback) return;
        const chosen = btn.getAttribute('data-opt');
        const correct = chosen === scene.answer;
        this.sceneFeedback = {correct};
        await logTrial({level:9,itemId:scene.id,chosenEmotion:chosen,correct,firstTry:true,hintUsed:false});
        this.sceneTotal++;
        if (correct) this.sceneScore++;
        this.sceneFeedback = { correct };

        const card = createSRSCard('scene', scene.id || `scene_${this.sceneIdx}`);
        await putSRSCard(updateSRSCard(card, { correct }));

        if (this.sceneTotal >= 6 && this.sceneScore / this.sceneTotal >= .75) {
          await saveLevelProgress({ levelId: 9, completed: true, bestScore: Math.round(100 * this.sceneScore / this.sceneTotal), updatedAt: Date.now() });
          if (this.onLevelComplete) this.onLevelComplete(9, Math.round(100 * this.sceneScore / this.sceneTotal));
        }
        this._renderSceneDrill(bodyEl);
      });
    });

    bodyEl.querySelector('#l9NextSceneBtn')?.addEventListener('click', () => {
      this.sceneIdx++;
      this.sceneFeedback = null;
      this._renderSceneDrill(bodyEl);
    });
  }

  _renderMisreads(bodyEl) {
    const misreads = this.content.level9?.commonMisreads || [
      {
        title: 'Concentration / Effort (AU4 + AU7) ≠ Anger',
        recipeA: 'concentration',
        recipeB: 'anger',
        explanation: 'Mental effort or reading small print recruits AU4 (brow lowerer) and AU7 (lid tightener), but lacks AU23/AU24 lip pressing or AU5 upper-lid glare.'
      },
      {
        title: 'Physical Pain (AU4 + AU6 + AU7 + AU9/10 + AU43) ≠ Disgust',
        recipeA: 'pain',
        recipeB: 'disgust',
        explanation: 'Acute physical pain tightly squeezes the eyes shut (AU6+AU7+AU43) with horizontal mouth stretch or open jaw, whereas disgust centers on nasal/oral rejection (AU9/AU10) with open eyes.'
      },
      {
        title: 'Polite Social Smile (AU12 alone) ≠ Genuine Joy (AU6 + AU12)',
        recipeA: 'happiness_social',
        recipeB: 'happiness',
        explanation: 'A polite social smile coordinates conversation smoothly using zygomaticus major (AU12) without orbicularis oculi cheek raising (AU6).'
      }
    ];

    bodyEl.innerHTML = `
      <div class="wrinkle-guides-grid">
        ${misreads.map((m) => `
          <article class="vocab-card">
            <h4>${m.title}</h4>
            <p>${m.explanation}</p>
            <div class="btn-row" style="margin-top:10px;">
              <button type="button" class="btn btn-sm btn-primary l9-preview-expr" data-expr="${m.recipeA}">Show State A (${m.recipeA})</button>
              <button type="button" class="btn btn-sm btn-secondary l9-preview-expr" data-expr="${m.recipeB}">Compare Emotion B (${m.recipeB})</button>
            </div>
          </article>
        `).join('')}
      </div>
    `;

    bodyEl.querySelectorAll('.l9-preview-expr').forEach((btn) => {
      btn.addEventListener('click', () => {
        const exprId = btn.getAttribute('data-expr');
        const all = [
          ...(this.content.expressions?.core || []),
          ...(this.content.expressions?.variants || []),
          ...(this.content.expressions?.social || [])
        ];
        const expr = all.find((e) => e.id === exprId);
        if (this.rig && expr) {
          this.rig.setOverlaysEnabled(true);
          this.rig.setExpressionFromRecipe(expr);
        }
      });
    });
  }
}
