/**
 * Cowen & Keltner (2017) 27-Emotion Clustered Map with Smooth Gradient Links (Section 3.3 / Level 1 & Level 8).
 * - Renders 27 emotion categories bridged by smooth dimensional gradients.
 * - Clicking any node shows its definition, nearest neighbors, dimensional profile,
 *   and a "Distinctive universal facial configuration: Yes / No" badge.
 */

export class EmotionMap27Widget {
  constructor(containerEl, map27Data, { onSelectNode = null } = {}) {
    this.containerEl = containerEl;
    this.data = map27Data;
    this.onSelectNode = onSelectNode;
    this.selectedId = map27Data?.categories?.[0]?.id || 'amusement';
    this.filterDistinctiveOnly = false;
    this.render();
  }

  render() {
    const categories = this.data?.categories || [];
    const byId = new Map(categories.map((c) => [c.id, c]));
    const selected = byId.get(this.selectedId) || categories[0];

    this.containerEl.innerHTML = `
      <div class="map27-widget-layout">
        <div class="map27-controls-bar">
          <div>
            <h4>Cowen &amp; Keltner (2017) 27-Category Semantic Space</h4>
            <p class="muted-text">Emotions form high-dimensional clusters connected by smooth gradients rather than isolated islands.</p>
          </div>
          <label class="checkbox-pill">
            <input type="checkbox" id="map27FilterDistinctive" ${this.filterDistinctiveOnly ? 'checked' : ''} />
            <span>Highlight only categories with a universal static facial signal</span>
          </label>
        </div>

        <div class="map27-main-grid">
          <div class="map27-svg-wrap">
            <svg viewBox="0 0 600 420" class="map27-svg" aria-label="27 Emotion Category Map">
              <defs id="map27Defs"></defs>
              <g id="map27LinksGroup"></g>
              <g id="map27NodesGroup"></g>
            </svg>
          </div>

          <div class="map27-inspector-card" id="map27Inspector">
            ${this._renderInspectorHTML(selected)}
          </div>
        </div>
      </div>
    `;

    const defsEl = this.containerEl.querySelector('#map27Defs');
    const linksGroup = this.containerEl.querySelector('#map27LinksGroup');
    const nodesGroup = this.containerEl.querySelector('#map27NodesGroup');

    // Project (valence, arousal) + deterministic cluster offset onto 600x420 SVG canvas
    const coords = new Map();
    categories.forEach((cat, idx) => {
      const x = 300 + (cat.valence || 0) * 235 + ((idx % 3) - 1) * 14;
      const y = 210 - (cat.arousal || 0) * 165 + ((idx % 2) * 12 - 6);
      coords.set(cat.id, {
        x: Math.max(48, Math.min(552, x)),
        y: Math.max(36, Math.min(384, y))
      });
    });

    const defsFrag = [];
    const linksFrag = [];
    const drawnPairs = new Set();

    for (const cat of categories) {
      const p1 = coords.get(cat.id);
      for (const nId of cat.neighbors || []) {
        const pairKey = [cat.id, nId].sort().join('__');
        if (drawnPairs.has(pairKey)) continue;
        const nCat = byId.get(nId);
        const p2 = coords.get(nId);
        if (!nCat || !p2) continue;
        drawnPairs.add(pairKey);

        const gradId = `grad_${pairKey}`;
        defsFrag.push(`
          <linearGradient id="${gradId}" x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="${cat.color}" stop-opacity="0.7" />
            <stop offset="100%" stop-color="${nCat.color}" stop-opacity="0.7" />
          </linearGradient>
        `);
        linksFrag.push(`
          <line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}"
            stroke="url(#${gradId})" stroke-width="2.5" />
        `);
      }
    }

    defsEl.innerHTML = defsFrag.join('');
    linksGroup.innerHTML = linksFrag.join('');

    const nodesFrag = [];
    for (const cat of categories) {
      const pt = coords.get(cat.id);
      const isSelected = cat.id === this.selectedId;
      const dimmed = this.filterDistinctiveOnly && !cat.hasDistinctiveFace;
      const r = isSelected ? 14 : (cat.hasDistinctiveFace ? 11 : 8.5);

      nodesFrag.push(`
        <g class="map27-node" data-node-id="${cat.id}" tabindex="0" role="button" aria-label="${cat.label}" style="cursor:pointer;opacity:${dimmed ? '0.28' : '1'};">
          <circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="${r}"
            fill="${cat.color}" stroke="${isSelected ? '#ffffff' : '#0b0e14'}" stroke-width="${isSelected ? '3' : '1.5'}" />
          <text x="${pt.x.toFixed(1)}" y="${(pt.y - r - 5).toFixed(1)}" text-anchor="middle"
            fill="${isSelected ? '#ffffff' : '#cbd5e1'}" font-size="${isSelected ? '11.5' : '10'}" font-weight="${isSelected ? '700' : '600'}">
            ${cat.label}
          </text>
        </g>
      `);
    }
    nodesGroup.innerHTML = nodesFrag.join('');

    this.containerEl.querySelectorAll('.map27-node').forEach((el) => {
      const selectFn = () => {
        this.selectedId = el.getAttribute('data-node-id');
        this.render();
        const cat = byId.get(this.selectedId);
        if (this.onSelectNode && cat) {
          this.onSelectNode(cat);
        }
      };
      el.addEventListener('click', selectFn);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectFn();
        }
      });
    });

    this.containerEl.querySelector('#map27FilterDistinctive')?.addEventListener('change', (e) => {
      this.filterDistinctiveOnly = e.target.checked;
      this.render();
    });
  }

  _renderInspectorHTML(cat) {
    if (!cat) return '';
    return `
      <div class="inspector-badge" style="background:${cat.color};color:#0b0e14;">
        CLUSTER: ${cat.cluster.toUpperCase()}
      </div>
      <h3>${cat.label}</h3>
      <div class="distinctive-face-badge ${cat.hasDistinctiveFace ? 'yes' : 'no'}">
        Distinctive universal facial configuration: <strong>${cat.hasDistinctiveFace ? 'Yes' : 'No (requires context / posture / voice)'}</strong>
      </div>
      <p>${cat.definition}</p>
      <div class="inspector-meta-list">
        <div><strong>Smooth Bridge Gradients:</strong> ${(cat.neighbors || []).join(', ')}</div>
        <div><strong>Valence / Arousal:</strong> V ${cat.valence >= 0 ? '+' : ''}${cat.valence}, A ${cat.arousal >= 0 ? '+' : ''}${cat.arousal}</div>
        <div><strong>Facial / Bodily Notes:</strong> ${cat.facialNotes}</div>
      </div>
    `;
  }
}
