/**
 * Bespoke Inline SVG Scene & Body Posture Illustrations (Levels 8, 9, 10).
 * - Renders anatomical/postural silhouettes for the 9 posture keys:
 *   expanded, collapsed, slumped, lean_in, arms_crossed, face_touch, guarded, head_tilt, exhale_drop.
 * - Renders contextual scene backdrop vignettes (office, stage, clinic, cafe, transit, home) for Levels 9 & 10.
 */

const POSTURE_SVG_PATHS = {
  expanded: {
    label: 'Expanded Chest & Raised Chin (Pride / Triumph)',
    svg: `
      <circle cx="80" cy="36" r="14" fill="#38b6ff" />
      <path d="M52 72 Q80 60 108 72 L100 132 L60 132 Z" fill="#2563eb" />
      <path d="M52 72 L26 48 M108 72 L134 48" stroke="#60a5fa" stroke-width="9" stroke-linecap="round" />
      <path d="M62 24 L80 14 L98 24" fill="none" stroke="#f5c542" stroke-width="2.5" />
    `
  },
  collapsed: {
    label: 'Collapsed Shoulders & Head Down (Shame / Defeat)',
    svg: `
      <circle cx="82" cy="54" r="14" fill="#94a3b8" />
      <path d="M58 76 Q80 90 102 76 L96 134 L64 134 Z" fill="#475569" />
      <path d="M60 78 L50 118 M100 78 L110 118" stroke="#64748b" stroke-width="8" stroke-linecap="round" />
      <path d="M80 22 L80 36" stroke="#f87171" stroke-width="2.5" marker-end="url(#arrow)" />
    `
  },
  slumped: {
    label: 'Slumped Torso & Low Tone (Sadness / Exhaustion)',
    svg: `
      <circle cx="86" cy="50" r="14" fill="#64748b" />
      <path d="M56 78 Q82 88 102 80 L94 136 L62 136 Z" fill="#334155" />
      <path d="M58 82 L48 124 M100 82 L106 124" stroke="#475569" stroke-width="8" stroke-linecap="round" />
    `
  },
  lean_in: {
    label: 'Forward Lean & Engaged Orientation (Interest / Sympathy / Focus)',
    svg: `
      <circle cx="92" cy="38" r="14" fill="#38b6ff" />
      <path d="M64 68 L108 64 L96 132 L58 132 Z" fill="#1d4ed8" />
      <path d="M98 70 L126 92 M66 72 L88 98" stroke="#60a5fa" stroke-width="8" stroke-linecap="round" />
    `
  },
  arms_crossed: {
    label: 'Crossed Arms Across Torso (Closed / Cold / Evaluative)',
    svg: `
      <circle cx="80" cy="38" r="14" fill="#cbd5e1" />
      <path d="M54 70 L106 70 L98 134 L62 134 Z" fill="#334155" />
      <path d="M52 74 L104 98 M108 74 L56 98" stroke="#94a3b8" stroke-width="9" stroke-linecap="round" />
    `
  },
  face_touch: {
    label: 'Hand to Face / Neck Self-Adaptor (Embarrassment / Cognitive Load)',
    svg: `
      <circle cx="76" cy="42" r="14" fill="#f472b6" />
      <path d="M54 72 L104 72 L96 134 L60 134 Z" fill="#475569" />
      <path d="M102 74 L114 96 L88 52" fill="none" stroke="#f9a8d4" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M54 74 L46 116" stroke="#64748b" stroke-width="8" stroke-linecap="round" />
    `
  },
  guarded: {
    label: 'Guarded / Braced Upper Body (Apprehension / Pain / Startle)',
    svg: `
      <circle cx="80" cy="40" r="14" fill="#fb923c" />
      <path d="M52 66 L108 66 L96 134 L64 134 Z" fill="#7c2d12" />
      <path d="M52 68 L68 92 M108 68 L92 92" stroke="#fdba74" stroke-width="8" stroke-linecap="round" />
    `
  },
  head_tilt: {
    label: 'Lateral Head Tilt & Softened Shoulders (Coyness / Gratitude / Warmth)',
    svg: `
      <g transform="rotate(14, 80, 42)">
        <circle cx="80" cy="40" r="14" fill="#4ade80" />
      </g>
      <path d="M54 72 Q80 68 106 72 L98 134 L62 134 Z" fill="#15803d" />
      <path d="M54 74 L44 114 M106 74 L116 114" stroke="#4ade80" stroke-width="8" stroke-linecap="round" />
    `
  },
  exhale_drop: {
    label: 'Shoulder Drop on Exhale (Relief / De-escalation)',
    svg: `
      <circle cx="80" cy="42" r="14" fill="#38bdf8" />
      <path d="M54 78 Q80 74 106 78 L98 134 L62 134 Z" fill="#0369a1" />
      <path d="M54 78 L42 120 M106 78 L118 120" stroke="#7dd3fc" stroke-width="8" stroke-linecap="round" />
      <path d="M44 62 L44 74 M116 62 L116 74" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" />
    `
  }
};

export function renderPostureSVG(postureKey = 'expanded', options = {}) {
  const entry = POSTURE_SVG_PATHS[postureKey] || POSTURE_SVG_PATHS.expanded;
  const width = options.width || 160;
  const height = options.height || 150;
  return `
    <figure class="posture-svg-figure" style="margin:0;display:inline-flex;flex-direction:column;align-items:center;">
      <svg viewBox="0 0 160 150" width="${width}" height="${height}" class="posture-silhouette-svg" role="img" aria-label="${entry.label}">
        <rect x="4" y="4" width="152" height="142" rx="12" fill="#111621" stroke="#283142" stroke-width="1.5" />
        ${entry.svg}
      </svg>
      ${options.showCaption !== false ? `<figcaption class="posture-caption">${entry.label}</figcaption>` : ''}
    </figure>
  `;
}

export function renderSceneCardHTML(scene, options = {}) {
  if (!scene) return '';
  const postureKey = scene.postureSvg || 'lean_in';
  const cuesList = (scene.bodyCues || []).map((c) => `<span class="cue-pill">${c}</span>`).join('');

  return `
    <div class="scene-context-card">
      <div class="scene-card-visual">
        ${renderPostureSVG(postureKey, { width: 140, height: 132, showCaption: false })}
      </div>
      <div class="scene-card-body">
        <div class="scene-meta-badge">${scene.setting || 'Contextual Vignette'}</div>
        <h4 class="scene-title">${scene.title || 'Situational Context'}</h4>
        <p class="scene-vignette-text">${scene.vignette || scene.context || ''}</p>
        ${scene.speechCaption ? `<blockquote class="scene-speech-quote">&ldquo;${scene.speechCaption}&rdquo;</blockquote>` : ''}
        ${cuesList ? `<div class="scene-cues-row"><strong>Posture &amp; Voice Cues:</strong> ${cuesList}</div>` : ''}
        ${options.extraHTML || ''}
      </div>
    </div>
  `;
}
