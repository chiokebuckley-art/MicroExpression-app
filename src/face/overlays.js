/**
 * AU Highlight Overlays (Section 5.4).
 * Anchors semi-transparent region masks to 3D head mesh vertex groups
 * (brow, lids, cheek, nose, upperLip, lipCorners, chin), projects them to
 * 2D SVG overlay coordinates each frame, pulses with active AU weights,
 * and renders anatomical labels such as "AU4 Brow lowerer".
 */

import * as THREE from 'three';

export const VERTEX_GROUP_ANCHORS_3D = {
  brow: [
    { x: -0.028, y: 1.638, z: 0.098, rx: 34, ry: 15 },
    { x: 0.028, y: 1.638, z: 0.098, rx: 34, ry: 15 }
  ],
  lids: [
    { x: -0.031, y: 1.612, z: 0.092, rx: 26, ry: 13 },
    { x: 0.031, y: 1.612, z: 0.092, rx: 26, ry: 13 }
  ],
  cheek: [
    { x: -0.044, y: 1.585, z: 0.086, rx: 26, ry: 16 },
    { x: 0.044, y: 1.585, z: 0.086, rx: 26, ry: 16 }
  ],
  nose: [
    { x: 0.0, y: 1.588, z: 0.112, rx: 22, ry: 20 }
  ],
  upperLip: [
    { x: 0.0, y: 1.548, z: 0.108, rx: 30, ry: 12 }
  ],
  lipCorners: [
    { x: -0.028, y: 1.540, z: 0.094, rx: 20, ry: 14 },
    { x: 0.028, y: 1.540, z: 0.094, rx: 20, ry: 14 }
  ],
  chin: [
    { x: 0.0, y: 1.512, z: 0.102, rx: 26, ry: 15 }
  ]
};

const ZONE_COLORS = {
  brow: '#38b6ff',
  lids: '#4cc9f0',
  cheek: '#f5c542',
  nose: '#9b5de5',
  upperLip: '#ff924c',
  lipCorners: '#f15bb5',
  chin: '#6ecb63'
};

export class AUOverlayRenderer {
  constructor(containerEl) {
    this.containerEl = containerEl;
    this.svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svgEl.setAttribute('class', 'au-overlay-svg');
    this.svgEl.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5;overflow:visible;';
    if (this.containerEl) {
      this.containerEl.appendChild(this.svgEl);
    }
    this.enabled = false;
    this.highlightFilter = null; // null = all active AUs, or Set of AU IDs
    this.auCatalog = null;
  }

  setCatalog(auCatalog) {
    this.auCatalog = auCatalog;
  }

  setEnabled(enabled, highlightAUIds = null) {
    this.enabled = Boolean(enabled);
    this.highlightFilter = Array.isArray(highlightAUIds)
      ? new Set(highlightAUIds.map(Number))
      : null;
    if (!this.enabled) {
      this.clear();
    }
  }

  clear() {
    if (this.svgEl) {
      this.svgEl.innerHTML = '';
    }
  }

  update(camera, headGroup, activeAUs = {}, timestampMs = 0) {
    if (!this.enabled || !this.svgEl || !camera || !this.containerEl) {
      return;
    }

    const rect = this.containerEl.getBoundingClientRect();
    const width = rect.width || 640;
    const height = rect.height || 480;
    this.svgEl.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const entries = Object.entries(activeAUs)
      .map(([idStr, weight]) => ({ auId: Number(idStr), weight: Number(weight) }))
      .filter((e) => e.weight > 0.08 && (!this.highlightFilter || this.highlightFilter.has(e.auId)));

    if (entries.length === 0) {
      this.svgEl.innerHTML = '';
      return;
    }

    const pulse = 0.85 + 0.15 * Math.sin(timestampMs * 0.008);
    const fragments = [];
    const usedGroups = new Map();

    for (const item of entries) {
      const def = this.auCatalog?.aus?.find((a) => Number(a.id) === item.auId);
      const vg = def?.vertexGroup || 'brow';
      const label = def ? `AU${def.id} ${def.name}` : `AU${item.auId}`;
      if (!usedGroups.has(vg)) {
        usedGroups.set(vg, { weight: item.weight, labels: [label] });
      } else {
        const g = usedGroups.get(vg);
        g.weight = Math.max(g.weight, item.weight);
        if (!g.labels.includes(label)) g.labels.push(label);
      }
    }

    let labelIdx = 0;
    for (const [vg, info] of usedGroups.entries()) {
      const anchors = VERTEX_GROUP_ANCHORS_3D[vg] || VERTEX_GROUP_ANCHORS_3D.brow;
      const color = ZONE_COLORS[vg] || '#38b6ff';
      const alpha = Math.min(0.55, (0.22 + info.weight * 0.32) * pulse);
      const strokeAlpha = Math.min(0.95, 0.55 + info.weight * 0.4);

      let firstScreenPt = null;
      for (const anc of anchors) {
        const vec = new THREE.Vector3(anc.x, anc.y, anc.z);
        if (headGroup) {
          vec.applyMatrix4(headGroup.matrixWorld);
        }
        vec.project(camera);
        const sx = (vec.x * 0.5 + 0.5) * width;
        const sy = (-vec.y * 0.5 + 0.5) * height;
        if (!firstScreenPt) firstScreenPt = { sx, sy };

        const rx = anc.rx * (0.9 + 0.2 * info.weight);
        const ry = anc.ry * (0.9 + 0.2 * info.weight);

        fragments.push(
          `<ellipse cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" ` +
          `fill="${color}" fill-opacity="${alpha.toFixed(2)}" stroke="${color}" stroke-width="2" stroke-opacity="${strokeAlpha.toFixed(2)}" />`
        );
      }

      if (firstScreenPt) {
        const tagText = `${info.labels.join(' + ')} (${Math.round(info.weight * 100)}%)`;
        const isRight = labelIdx % 2 === 0;
        const lx = isRight ? Math.min(width - 195, firstScreenPt.sx + 42) : Math.max(12, firstScreenPt.sx - 215);
        const ly = Math.max(24, Math.min(height - 28, firstScreenPt.sy - 14 + (labelIdx * 6)));
        const boxW = Math.max(150, tagText.length * 6.8 + 18);

        fragments.push(
          `<line x1="${firstScreenPt.sx.toFixed(1)}" y1="${firstScreenPt.sy.toFixed(1)}" x2="${(lx + (isRight ? 0 : boxW)).toFixed(1)}" y2="${(ly + 12).toFixed(1)}" stroke="${color}" stroke-width="1.5" stroke-dasharray="3,2" />`,
          `<g transform="translate(${lx.toFixed(1)}, ${ly.toFixed(1)})">`,
          `<rect x="0" y="0" width="${boxW.toFixed(1)}" height="24" rx="6" fill="rgba(15, 20, 28, 0.88)" stroke="${color}" stroke-width="1.5" />`,
          `<text x="9" y="16" fill="#f8fafc" font-family="system-ui, -apple-system, sans-serif" font-size="11.5" font-weight="600">${tagText}</text>`,
          `</g>`
        );
        labelIdx++;
      }
    }

    this.svgEl.innerHTML = fragments.join('');
  }
}
