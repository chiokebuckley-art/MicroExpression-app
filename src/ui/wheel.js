/**
 * Interactive Plutchik 8x3 Wheel + Dyads SVG Widget (Section 3.1 / Level 1).
 * - Renders 8 emotion families x 3 concentric intensity rings (24 petals) + 8 outer dyad pills.
 * - Supports Explore Mode, "Find on the Wheel" drill, and "Opposites & Dyad Blends" quiz.
 */

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad)
  };
}

function createAnnularSectorPath(cx, cy, rInner, rOuter, startAngle, endAngle) {
  const p1 = polarToCartesian(cx, cy, rOuter, endAngle);
  const p2 = polarToCartesian(cx, cy, rOuter, startAngle);
  const p3 = polarToCartesian(cx, cy, rInner, startAngle);
  const p4 = polarToCartesian(cx, cy, rInner, endAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 0 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 1 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    'Z'
  ].join(' ');
}

export class PlutchikWheelWidget {
  constructor(containerEl, plutchikData, { onSelectPetal = null, onQuizComplete = null } = {}) {
    this.containerEl = containerEl;
    this.data = plutchikData;
    this.onSelectPetal = onSelectPetal;
    this.onQuizComplete = onQuizComplete;
    this.selectedPetal = null;
    this.mode = 'explore'; // 'explore' | 'find' | 'dyads'
    this.findScore = 0;
    this.findTotal = 0;
    this.currentPrompt = null;
    this.render();
  }

  render() {
    const families = this.data?.families || [];
    const primaryDyads = this.data?.primaryDyads || [];

    this.containerEl.innerHTML = `
      <div class="wheel-widget-layout">
        <div class="wheel-controls-bar">
          <div class="segmented-tabs" role="tablist" aria-label="Plutchik Wheel Modes">
            <button type="button" class="seg-tab ${this.mode === 'explore' ? 'active' : ''}" data-wheel-mode="explore">Explore Wheel (24 States + Dyads)</button>
            <button type="button" class="seg-tab ${this.mode === 'find' ? 'active' : ''}" data-wheel-mode="find">Drill: Find on the Wheel</button>
            <button type="button" class="seg-tab ${this.mode === 'dyads' ? 'active' : ''}" data-wheel-mode="dyads">Drill: Opposites &amp; Dyads</button>
          </div>
          <div class="wheel-score-pill" id="wheelScoreStatus">
            ${this.findTotal > 0 ? `Score: <strong>${this.findScore}/${this.findTotal}</strong>` : 'Click any petal or dyad to inspect'}
          </div>
        </div>

        <div id="wheelQuizBanner" class="wheel-quiz-banner" style="display:${this.mode === 'explore' ? 'none' : 'block'};"></div>

        <div class="wheel-main-grid">
          <div class="wheel-svg-wrap">
            <svg viewBox="0 0 560 560" class="plutchik-svg" aria-label="Plutchik Emotion Wheel">
              <g id="wheelPetalsGroup"></g>
              <g id="wheelDyadsGroup"></g>
              <circle cx="280" cy="280" r="34" fill="#181c24" stroke="#343b48" stroke-width="2" />
              <text x="280" y="277" text-anchor="middle" fill="#cbd5e1" font-size="10" font-weight="600">INTENSITY</text>
              <text x="280" y="290" text-anchor="middle" fill="#94a3b8" font-size="9">Inner = High</text>
            </svg>
          </div>

          <div class="wheel-inspector-card" id="wheelInspectorCard">
            <h4>Emotion Family Inspector</h4>
            <p class="muted-text">Select any petal on the wheel (inner = intense, middle = primary, outer = mild) or any outer dyad blend.</p>
          </div>
        </div>
      </div>
    `;

    const petalsGroup = this.containerEl.querySelector('#wheelPetalsGroup');
    const dyadsGroup = this.containerEl.querySelector('#wheelDyadsGroup');
    const cx = 280;
    const cy = 280;

    // Ring radii: inner (intense) 36..102, middle (primary) 105..168, outer (mild) 171..228
    const ringRadii = [
      { key: 'inner', rIn: 36, rOut: 102, opacity: '0.95' },
      { key: 'middle', rIn: 105, rOut: 168, opacity: '0.80' },
      { key: 'outer', rIn: 171, rOut: 228, opacity: '0.62' }
    ];

    const svgFrag = [];
    for (const fam of families) {
      const startAngle = fam.angle - 21;
      const endAngle = fam.angle + 21;

      for (const ring of ringRadii) {
        const ringData = fam.rings[ring.key];
        if (!ringData) continue;
        const pathD = createAnnularSectorPath(cx, cy, ring.rIn, ring.rOut, startAngle, endAngle);
        const midR = (ring.rIn + ring.rOut) * 0.5;
        const labelPt = polarToCartesian(cx, cy, midR, fam.angle);

        svgFrag.push(`
          <g class="wheel-petal" data-family="${fam.id}" data-ring="${ring.key}" data-label="${ringData.label}" tabindex="0" role="button" aria-label="${ringData.label} (${fam.id} ${ring.key})">
            <path d="${pathD}" fill="${fam.color}" fill-opacity="${ring.opacity}" stroke="#12151c" stroke-width="2" class="petal-path" />
            <text x="${labelPt.x.toFixed(1)}" y="${labelPt.y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="#0b0e14" font-size="11" font-weight="700" pointer-events="none">
              ${ringData.label}
            </text>
          </g>
        `);
      }
    }
    petalsGroup.innerHTML = svgFrag.join('');

    // Render 8 primary dyads around the outer perimeter (between adjacent families)
    const dyadFrag = [];
    primaryDyads.forEach((dyad, idx) => {
      const angle = idx * 45 + 22.5;
      const pt = polarToCartesian(cx, cy, 256, angle);
      dyadFrag.push(`
        <g class="wheel-dyad-node" data-dyad-id="${dyad.id}" tabindex="0" role="button" aria-label="Dyad ${dyad.label}">
          <rect x="${(pt.x - 36).toFixed(1)}" y="${(pt.y - 12).toFixed(1)}" width="72" height="24" rx="12" fill="#1e2430" stroke="#475569" stroke-width="1.5" />
          <text x="${pt.x.toFixed(1)}" y="${(pt.y + 1).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="#e2e8f0" font-size="10" font-weight="600" pointer-events="none">
            ${dyad.label}
          </text>
        </g>
      `);
    });
    dyadsGroup.innerHTML = dyadFrag.join('');

    // Bind petal click/keyboard events
    this.containerEl.querySelectorAll('.wheel-petal').forEach((el) => {
      const trigger = () => {
        const famId = el.getAttribute('data-family');
        const ringKey = el.getAttribute('data-ring');
        this.handlePetalClick(famId, ringKey);
      };
      el.addEventListener('click', trigger);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          trigger();
        }
      });
    });

    // Bind dyad click events
    this.containerEl.querySelectorAll('.wheel-dyad-node').forEach((el) => {
      const trigger = () => {
        const dyadId = el.getAttribute('data-dyad-id');
        this.handleDyadClick(dyadId);
      };
      el.addEventListener('click', trigger);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          trigger();
        }
      });
    });

    // Bind mode tabs
    this.containerEl.querySelectorAll('[data-wheel-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.mode = btn.getAttribute('data-wheel-mode');
        this.render();
        if (this.mode === 'find') this.nextFindPrompt();
        if (this.mode === 'dyads') this.nextDyadQuestion();
      });
    });

    // Default select Joy middle petal in explore mode
    if (this.mode === 'explore' && families.length > 0) {
      this.inspectPetal('joy', 'middle', false);
    }
  }

  inspectPetal(famId, ringKey, notifyRig = true) {
    const fam = this.data?.families?.find((f) => f.id === famId);
    if (!fam) return;
    const ringData = fam.rings[ringKey];
    const oppFam = this.data?.families?.find((f) => f.id === fam.opposite);
    const inspector = this.containerEl.querySelector('#wheelInspectorCard');
    if (inspector && ringData) {
      inspector.innerHTML = `
        <div class="inspector-badge" style="background:${fam.color};color:#0b0e14;">
          ${fam.id.toUpperCase()} FAMILY &bull; ${ringKey.toUpperCase()} RING
        </div>
        <h3>${ringData.label}</h3>
        <p>${ringData.description}</p>
        <div class="inspector-meta-list">
          <div><strong>Intensity Scale:</strong> ${Math.round((ringData.scale || 0.7) * 100)}%</div>
          <div><strong>Polar Opposite Family:</strong> ${oppFam ? oppFam.rings.middle.label : fam.opposite}</div>
          <div><strong>Universal 3D Rig Expression:</strong> ${fam.rigExpression ? `${fam.rigExpression} (shown on 3D face)` : 'Conceptual / postural state'}</div>
        </div>
      `;
    }

    if (notifyRig && this.onSelectPetal && fam.rigExpression) {
      this.onSelectPetal({
        familyId: fam.id,
        ringKey,
        label: ringData?.label,
        rigExpression: fam.rigExpression,
        scale: ringData?.scale || 0.75
      });
    }
  }

  handlePetalClick(famId, ringKey) {
    this.inspectPetal(famId, ringKey, true);
    if (this.mode === 'find' && this.currentPrompt) {
      const fam = this.data?.families?.find((f) => f.id === famId);
      const clickedLabel = fam?.rings?.[ringKey]?.label;
      const isCorrect = clickedLabel === this.currentPrompt.label;
      this.findTotal++;
      if (isCorrect) this.findScore++;
      const banner = this.containerEl.querySelector('#wheelQuizBanner');
      if (banner) {
        banner.innerHTML = `
          <div class="quiz-feedback ${isCorrect ? 'pass' : 'miss'}">
            <strong>${isCorrect ? 'Correct!' : `Clicked ${clickedLabel} — Target was ${this.currentPrompt.label}`}</strong>
            <span> (${this.currentPrompt.description})</span>
            <button type="button" class="btn btn-sm btn-primary" id="nextWheelPromptBtn" style="margin-left:12px;">Next Target</button>
          </div>
        `;
        banner.querySelector('#nextWheelPromptBtn')?.addEventListener('click', () => this.nextFindPrompt());
      }
      const status = this.containerEl.querySelector('#wheelScoreStatus');
      if (status) status.innerHTML = `Score: <strong>${this.findScore}/${this.findTotal}</strong>`;
      if (this.onQuizComplete && this.findScore >= 5) {
        this.onQuizComplete({ mode: 'find', score: this.findScore, total: this.findTotal });
      }
    }
  }

  handleDyadClick(dyadId) {
    const allDyads = [
      ...(this.data?.primaryDyads || []),
      ...(this.data?.secondaryDyads || []),
      ...(this.data?.tertiaryDyads || [])
    ];
    const dyad = allDyads.find((d) => d.id === dyadId);
    if (!dyad) return;

    const inspector = this.containerEl.querySelector('#wheelInspectorCard');
    if (inspector) {
      inspector.innerHTML = `
        <div class="inspector-badge" style="background:#38b6ff;color:#0b0e14;">PRIMARY DYAD BLEND</div>
        <h3>${dyad.label} (${dyad.components.join(' + ')})</h3>
        <p>${dyad.description}</p>
      `;
    }
  }

  nextFindPrompt() {
    const allPetals = [];
    for (const fam of this.data?.families || []) {
      for (const rk of ['inner', 'middle', 'outer']) {
        allPetals.push({
          famId: fam.id,
          ringKey: rk,
          label: fam.rings[rk].label,
          description: fam.rings[rk].description
        });
      }
    }
    this.currentPrompt = allPetals[(this.findTotal * 7 + 3) % allPetals.length];
    const banner = this.containerEl.querySelector('#wheelQuizBanner');
    if (banner && this.currentPrompt) {
      banner.innerHTML = `
        <div class="quiz-prompt-row">
          <span>Click the petal for: <strong>${this.currentPrompt.label}</strong> &mdash; <em>"${this.currentPrompt.description}"</em></span>
        </div>
      `;
    }
  }

  nextDyadQuestion() {
    const dyads = this.data?.primaryDyads || [];
    const d = dyads[this.findTotal % dyads.length];
    if (!d) return;
    const options = dyads.slice(0, 4).map((x) => x.label);
    if (!options.includes(d.label)) options[0] = d.label;

    const banner = this.containerEl.querySelector('#wheelQuizBanner');
    if (!banner) return;
    banner.innerHTML = `
      <div class="quiz-prompt-row">
        <p style="margin:0 0 8px 0;">Which dyad results from blending <strong>${d.components[0].toUpperCase()}</strong> + <strong>${d.components[1].toUpperCase()}</strong>?</p>
        <div class="btn-row">
          ${options.map((opt) => `<button type="button" class="btn btn-sm btn-secondary dyad-opt-btn" data-ans="${opt}">${opt}</button>`).join('')}
        </div>
      </div>
    `;
    banner.querySelectorAll('.dyad-opt-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const chosen = btn.getAttribute('data-ans');
        const isCorrect = chosen === d.label;
        this.findTotal++;
        if (isCorrect) this.findScore++;
        this.handleDyadClick(d.id);
        this.nextDyadQuestion();
      });
    });
  }
}
