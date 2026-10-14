/**
 * 2D Valence-Arousal Drag-and-Drop Plane + Dominance Slider (Section 3.2 / Level 1).
 * - Uses Pointer Events (pointerdown, pointermove, pointerup) so dragging works on mouse and touch.
 * - Scores dropped tokens within Euclidean distance <= 0.25 of canonical Russell (1980) coordinates.
 * - Demonstrates why Fear and Anger share the High-Arousal Unpleasant quadrant yet separate on Dominance.
 */

export class ValenceArousalGridWidget {
  constructor(containerEl, vaData, { onComplete = null } = {}) {
    this.containerEl = containerEl;
    this.vaData = vaData;
    this.onComplete = onComplete;
    this.tolerance = vaData?.toleranceRadius || 0.25;

    // Pick 8 representative tokens for the interactive drag-and-drop challenge, plus allow browsing all 37
    this.activeTokens = (vaData?.tokens || []).slice(0, 10);
    this.placedPositions = new Map(); // id -> { valence, arousal, dominance }
    this.selectedTokenId = this.activeTokens[0]?.id || 'fear';
    this.checked = false;

    this.render();
  }

  render() {
    const selectedToken = (this.vaData?.tokens || []).find((t) => t.id === this.selectedTokenId) || this.activeTokens[0];
    const currentPlacement = this.placedPositions.get(this.selectedTokenId) || {
      valence: selectedToken?.valence ?? 0,
      arousal: selectedToken?.arousal ?? 0,
      dominance: selectedToken?.dominance ?? 0
    };

    this.containerEl.innerHTML = `
      <div class="va-widget-layout">
        <div class="va-header-row">
          <div>
            <h4>Valence &times; Arousal 2D Affective Space (+ Dominance)</h4>
            <p class="muted-text">Drag emotion chips onto the 2D plane (or click a chip and click the grid). Target tolerance radius: <strong>&le; ${this.tolerance}</strong>.</p>
          </div>
          <div class="btn-row">
            <button type="button" class="btn btn-sm btn-secondary" id="vaAutoPlaceDemoBtn">Snap Sample Set</button>
            <button type="button" class="btn btn-sm btn-primary" id="vaCheckBtn">Check Placements</button>
          </div>
        </div>

        <div class="va-main-grid">
          <div class="va-plane-container" id="vaPlaneBox">
            <svg viewBox="0 0 440 440" class="va-plane-svg" id="vaPlaneSvg">
              <rect x="20" y="20" width="400" height="400" rx="10" fill="#131822" stroke="#2e3646" stroke-width="2" />
              <!-- Quadrant grid lines -->
              <line x1="220" y1="20" x2="220" y2="420" stroke="#3b4458" stroke-width="1.5" stroke-dasharray="4 4" />
              <line x1="20" y1="220" x2="420" y2="220" stroke="#3b4458" stroke-width="1.5" stroke-dasharray="4 4" />
              <!-- Axis labels -->
              <text x="220" y="14" text-anchor="middle" fill="#94a3b8" font-size="11" font-weight="600">+1.0 High Arousal (Activated / Alert)</text>
              <text x="220" y="436" text-anchor="middle" fill="#94a3b8" font-size="11" font-weight="600">-1.0 Low Arousal (Deactivated / Calm)</text>
              <text x="28" y="212" text-anchor="start" fill="#f87171" font-size="10" font-weight="600">-1.0 Unpleasant</text>
              <text x="412" y="212" text-anchor="end" fill="#4ade80" font-size="10" font-weight="600">+1.0 Pleasant</text>

              <!-- Quadrant watermarks -->
              <text x="120" y="52" text-anchor="middle" fill="#475569" font-size="10">High-Energy Unpleasant (Fear, Anger)</text>
              <text x="320" y="52" text-anchor="middle" fill="#475569" font-size="10">High-Energy Pleasant (Elated, Excited)</text>
              <text x="120" y="400" text-anchor="middle" fill="#475569" font-size="10">Low-Energy Unpleasant (Sad, Bored)</text>
              <text x="320" y="400" text-anchor="middle" fill="#475569" font-size="10">Low-Energy Pleasant (Serene, Calm)</text>

              <g id="vaTargetRingsGroup"></g>
              <g id="vaTokensSvgGroup"></g>
            </svg>
          </div>

          <div class="va-sidebar-card">
            <h5>Emotion Tokens (${this.placedPositions.size}/${this.activeTokens.length} placed)</h5>
            <div class="va-token-bank" id="vaTokenBank">
              ${this.activeTokens.map((t) => {
                const isPlaced = this.placedPositions.has(t.id);
                const isSelected = t.id === this.selectedTokenId;
                return `
                  <button type="button" class="va-token-chip ${isSelected ? 'selected' : ''} ${isPlaced ? 'placed' : ''}" data-token-id="${t.id}">
                    ${t.label} ${isPlaced ? '✓' : ''}
                  </button>
                `;
              }).join('')}
            </div>

            <div class="va-dominance-box">
              <label for="vaDominanceSlider">
                <strong>3rd Dimension: Dominance (Control)</strong>
                <span id="vaDominanceVal">${Number(currentPlacement.dominance).toFixed(2)}</span>
              </label>
              <input type="range" id="vaDominanceSlider" min="-1" max="1" step="0.05" value="${currentPlacement.dominance}" />
              <div class="va-dom-scale-labels">
                <span>-1.0 Low control (Fear, Terrified)</span>
                <span>+1.0 High control (Anger, Proud)</span>
              </div>
              <p class="va-teaching-callout">
                <strong>Why Dominance matters:</strong> <em>Fear</em> (-0.75 V, +0.80 A, <strong>-0.65 D</strong>) and <em>Anger</em> (-0.65 V, +0.80 A, <strong>+0.75 D</strong>) sit right next to each other in 2D Valence-Arousal space, but opposite on Dominance!
              </p>
            </div>

            <div id="vaScoreSummary" class="va-score-summary"></div>
          </div>
        </div>
      </div>
    `;

    this._renderPlottedTokens();
    this._bindInteractions();
  }

  _vaToSvg(valence, arousal) {
    // Map [-1, 1] -> [20, 420]
    const x = 220 + valence * 200;
    const y = 220 - arousal * 200;
    return { x, y };
  }

  _svgToVa(x, y) {
    const valence = Math.max(-1, Math.min(1, (x - 220) / 200));
    const arousal = Math.max(-1, Math.min(1, (220 - y) / 200));
    return {
      valence: Math.round(valence * 100) / 100,
      arousal: Math.round(arousal * 100) / 100
    };
  }

  _renderPlottedTokens() {
    const group = this.containerEl.querySelector('#vaTokensSvgGroup');
    const targetGroup = this.containerEl.querySelector('#vaTargetRingsGroup');
    if (!group || !targetGroup) return;

    const tokenFrags = [];
    const targetFrags = [];

    for (const t of this.activeTokens) {
      const pos = this.placedPositions.get(t.id);
      if (!pos) continue;
      const pt = this._vaToSvg(pos.valence, pos.arousal);
      const targetPt = this._vaToSvg(t.valence, t.arousal);
      const dist = Math.hypot(pos.valence - t.valence, pos.arousal - t.arousal);
      const isPass = dist <= this.tolerance;

      if (this.checked) {
        const rPx = this.tolerance * 200;
        targetFrags.push(`
          <circle cx="${targetPt.x.toFixed(1)}" cy="${targetPt.y.toFixed(1)}" r="${rPx.toFixed(1)}"
            fill="none" stroke="${isPass ? '#4ade80' : '#f87171'}" stroke-width="1" stroke-dasharray="3 3" opacity="0.65" />
          <line x1="${pt.x.toFixed(1)}" y1="${pt.y.toFixed(1)}" x2="${targetPt.x.toFixed(1)}" y2="${targetPt.y.toFixed(1)}"
            stroke="${isPass ? '#4ade80' : '#f87171'}" stroke-width="1.5" />
        `);
      }

      const fillColor = this.checked ? (isPass ? '#22c55e' : '#ef4444') : (t.id === this.selectedTokenId ? '#38b6ff' : '#f5c542');
      tokenFrags.push(`
        <g class="va-plotted-node" data-token-id="${t.id}" style="cursor:grab;">
          <circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="10" fill="${fillColor}" stroke="#0b0e14" stroke-width="2" />
          <text x="${pt.x.toFixed(1)}" y="${(pt.y - 14).toFixed(1)}" text-anchor="middle" fill="#f8fafc" font-size="11" font-weight="700">
            ${t.label}
          </text>
        </g>
      `);
    }

    targetGroup.innerHTML = targetFrags.join('');
    group.innerHTML = tokenFrags.join('');
  }

  _bindInteractions() {
    const svg = this.containerEl.querySelector('#vaPlaneSvg');
    let draggingTokenId = null;

    const clientToSvgCoords = (clientX, clientY) => {
      const rect = svg.getBoundingClientRect();
      const sx = ((clientX - rect.left) / rect.width) * 440;
      const sy = ((clientY - rect.top) / rect.height) * 440;
      return this._svgToVa(sx, sy);
    };

    // Bank chip selection
    this.containerEl.querySelectorAll('.va-token-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedTokenId = btn.getAttribute('data-token-id');
        this.render();
      });
    });

    // Pointer down on SVG plane or plotted node
    svg.addEventListener('pointerdown', (e) => {
      const nodeEl = e.target.closest('.va-plotted-node');
      if (nodeEl) {
        draggingTokenId = nodeEl.getAttribute('data-token-id');
        this.selectedTokenId = draggingTokenId;
      } else if (this.selectedTokenId) {
        draggingTokenId = this.selectedTokenId;
      }
      if (!draggingTokenId) return;

      const va = clientToSvgCoords(e.clientX, e.clientY);
      const tok = this.activeTokens.find((t) => t.id === draggingTokenId);
      const prev = this.placedPositions.get(draggingTokenId);
      this.placedPositions.set(draggingTokenId, {
        valence: va.valence,
        arousal: va.arousal,
        dominance: prev?.dominance ?? tok?.dominance ?? 0
      });
      this.checked = false;
      this._renderPlottedTokens();
      svg.setPointerCapture(e.pointerId);
    });

    svg.addEventListener('pointermove', (e) => {
      if (!draggingTokenId) return;
      const va = clientToSvgCoords(e.clientX, e.clientY);
      const prev = this.placedPositions.get(draggingTokenId) || { dominance: 0 };
      this.placedPositions.set(draggingTokenId, {
        ...prev,
        valence: va.valence,
        arousal: va.arousal
      });
      this._renderPlottedTokens();
    });

    svg.addEventListener('pointerup', () => {
      if (draggingTokenId) {
        draggingTokenId = null;
        this.render();
      }
    });

    // Dominance slider
    const domSlider = this.containerEl.querySelector('#vaDominanceSlider');
    const domVal = this.containerEl.querySelector('#vaDominanceVal');
    if (domSlider) {
      domSlider.addEventListener('input', () => {
        const v = Number(domSlider.value);
        if (domVal) domVal.textContent = v.toFixed(2);
        const tok = this.activeTokens.find((t) => t.id === this.selectedTokenId);
        const prev = this.placedPositions.get(this.selectedTokenId) || {
          valence: tok?.valence ?? 0,
          arousal: tok?.arousal ?? 0
        };
        this.placedPositions.set(this.selectedTokenId, {
          ...prev,
          dominance: v
        });
      });
    }

    // Auto-place sample set button
    this.containerEl.querySelector('#vaAutoPlaceDemoBtn')?.addEventListener('click', () => {
      for (const t of this.activeTokens) {
        this.placedPositions.set(t.id, {
          valence: t.valence,
          arousal: t.arousal,
          dominance: t.dominance
        });
      }
      this.checked = true;
      this.render();
      this._updateScoreBanner();
    });

    // Check button
    this.containerEl.querySelector('#vaCheckBtn')?.addEventListener('click', () => {
      this.checked = true;
      this._renderPlottedTokens();
      this._updateScoreBanner();
    });
  }

  _updateScoreBanner() {
    let passCount = 0;
    for (const t of this.activeTokens) {
      const pos = this.placedPositions.get(t.id);
      if (!pos) continue;
      const dist = Math.hypot(pos.valence - t.valence, pos.arousal - t.arousal);
      if (dist <= this.tolerance) passCount++;
    }
    const summaryEl = this.containerEl.querySelector('#vaScoreSummary');
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="quiz-feedback ${passCount >= 6 ? 'pass' : 'miss'}">
          <strong>${passCount} / ${this.activeTokens.length}</strong> tokens within ${this.tolerance} Euclidean distance.
        </div>
      `;
    }
    if (this.onComplete && passCount >= 6) {
      this.onComplete({ passCount, total: this.activeTokens.length });
    }
  }
}
