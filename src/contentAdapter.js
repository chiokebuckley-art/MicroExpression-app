/**
 * Content Schema Adapter & Normalizer.
 * Ensures all JSON files (`expressions.json`, `plutchik.json`, `va.json`, `emotions27.json`,
 * `anatomy.json`, `blends.json`, `ethics.json`, `scenes.json`, `conversations.json`, `level1..10.json`)
 * expose consistent property aliases across all UI widgets and curriculum level modules.
 */

const CORE_7_IDS = new Set([
  'happiness',
  'sadness',
  'anger',
  'fear',
  'disgust',
  'surprise',
  'contempt'
]);

const SOCIAL_IDS = new Set([
  'pain',
  'concentration',
  'skepticism',
  'embarrassment',
  'shame',
  'pride'
]);

const PLUTCHIK_RIG_MAP = {
  joy: 'happiness',
  sadness: 'sadness',
  anger: 'anger',
  fear: 'fear',
  disgust: 'disgust',
  surprise: 'surprise',
  trust: 'happiness_amusement_low',
  anticipation: 'concentration'
};

export function normalizeAllContent(content) {
  if (!content) return content;

  // 1. Normalize expressions.json: populate .core, .variants, .social from .recipes
  if (content.expressions) {
    const recipes = content.expressions.recipes || [];
    for (const r of recipes) {
      r.name = r.name || r.label || r.id;
      r.diagnosticSummary = r.diagnosticSummary || (r.keyCues || []).join(' • ');
      r.upperFaceCues = r.upperFaceCues || (r.keyCues || [])[0] || 'Observe brow and eyelid Action Units.';
      r.lowerFaceCues = r.lowerFaceCues || (r.keyCues || []).slice(1).join(' • ') || 'Observe mouth, nose, and chin Action Units.';
    }
    if (!content.expressions.core) {
      content.expressions.core = recipes.filter((r) => CORE_7_IDS.has(r.id));
    }
    if (!content.expressions.variants) {
      content.expressions.variants = recipes.filter(
        (r) => !CORE_7_IDS.has(r.id) && !SOCIAL_IDS.has(r.id) && r.id !== 'neutral'
      );
    }
    if (!content.expressions.social) {
      content.expressions.social = recipes.filter((r) => SOCIAL_IDS.has(r.id));
    }
    for (const p of content.expressions.confusablePairs || []) {
      p.pair = p.pair || [p.left, p.right];
      p.distinguishingAUs = p.distinguishingAUs || p.highlightAUs || [];
      p.keyDistinction = p.keyDistinction || p.explanation || p.keyCue || '';
    }
  }

  // 2. Normalize plutchik.json: populate .families from .petals
  if (content.plutchik) {
    const petals = content.plutchik.petals || [];
    if (!content.plutchik.families) {
      content.plutchik.families = petals.map((p) => ({
        id: p.id,
        angle: p.angleDeg ?? 0,
        color: p.color,
        opposite: (p.opposite || '').toLowerCase(),
        rigExpression: PLUTCHIK_RIG_MAP[p.id] || 'happiness',
        rings: {
          inner: {
            label: p.intense,
            scale: 0.95,
            description: p.definitions?.[p.intense] || `${p.intense} (High intensity ${p.primary})`
          },
          middle: {
            label: p.basic || p.primary,
            scale: 0.75,
            description: p.definitions?.[p.basic || p.primary] || `${p.primary} (Primary ring)`
          },
          outer: {
            label: p.mild,
            scale: 0.40,
            description: p.definitions?.[p.mild] || `${p.mild} (Mild intensity ${p.primary})`
          }
        }
      }));
    }
    for (const d of content.plutchik.primaryDyads || []) {
      d.description = d.description || d.definition || '';
    }
    for (const c of content.plutchik.vocabularyCards || []) {
      c.family = c.family || (c.category || 'general').toLowerCase().replace('plutchik ', '');
      c.intensity = c.intensity || c.category || 'Core';
      c.definition = c.definition || c.prompt || '';
      c.bodySignal = c.bodySignal || 'Context & posture dependent';
      c.confusableWith = c.confusableWith || (c.options || []).filter((o) => o !== c.term).join(', ');
    }
  }

  // 3. Normalize va.json
  if (content.va) {
    content.va.toleranceRadius = content.va.toleranceRadius || content.va.tolerance || 0.25;
  }

  // 4. Normalize emotions27.json & level1 quiz
  if (content.emotions27) {
    for (const cat of content.emotions27.categories || []) {
      cat.facialNotes = cat.facialNotes || cat.exampleScene || '';
    }
    const recipesById = new Map((content.expressions?.recipes || []).map((r) => [r.id, r]));
    content.emotions27.socialSelfConsciousItems = (
      content.emotions27.socialSelfConsciousItems ||
      content.emotions27.socialAndSelfConsciousItems ||
      []
    ).map((item) => {
      const rec = recipesById.get(item.recipeId) || {};
      return {
        ...item,
        name: item.name || item.emotion,
        postureSvg: item.postureSvg || item.posture || 'expanded',
        description: item.description || item.cues || '',
        distinction: item.distinction || item.explanation || '',
        aus: item.aus || rec.aus || [],
        extras: item.extras || rec.extras || {}
      };
    });
  }

  if (content.level1 && !content.level1.quiz) {
    const vCards = (content.plutchik?.vocabularyCards || []).slice(0, 12);
    content.level1.quiz = vCards.map((vc) => ({
      id: vc.id,
      question: `Which emotion term best matches: "${vc.prompt}"?`,
      options: vc.options || [vc.term, 'Joy', 'Fear', 'Sadness'],
      answer: vc.term,
      explanation: `${vc.term} (${vc.category}): ${vc.prompt}`
    }));
  }

  // 5. Normalize anatomy.json
  if (content.anatomy) {
    for (const z of content.anatomy.zones || []) {
      z.name = z.name || z.label;
    }
    for (const m of content.anatomy.muscles || []) {
      // Extract numeric AU IDs from strings like "AU1 (Medial)"
      const numericAUs = [];
      for (const raw of m.aus || []) {
        if (typeof raw === 'number') numericAUs.push(raw);
        else {
          const match = String(raw).match(/(\d+)/);
          if (match) numericAUs.push(Number(match[1]));
        }
      }
      m.aus = numericAUs.length > 0 ? numericAUs : [1];
      m.svgCoords = m.svgCoords || m.svgRegion?.front || { cx: 140, cy: 120 };
      // Normalize hotspot3d y so rig.js (which adds 1.585) places it cleanly
      if (m.hotspot3d && m.hotspot3d.y > 1.0) {
        m.hotspot3d = {
          x: m.hotspot3d.x,
          y: m.hotspot3d.y - 1.585,
          z: m.hotspot3d.z
        };
      }
      m.attachment = m.attachment || `Zone: ${m.zone}`;
      m.mechanicalAction = m.mechanicalAction || m.function || '';
      m.wrinkleCreated = m.wrinkleCreated || `Pulls ${m.vertexGroup} skin perpendicular to muscle fibers.`;
      m.emotionalRole = m.emotionalRole || (m.emotions || []).join(', ');
    }
    content.anatomy.wrinkleGuides = (content.anatomy.wrinkleGuides || content.anatomy.wrinkles || []).map((w) => ({
      ...w,
      region: w.region || w.name,
      direction: w.direction || `Driven by ${w.muscle}`,
      appearance: w.appearance || w.description,
      baselineCaution: w.baselineCaution || 'Compare against neutral resting skin before coding low-intensity traces.'
    }));

    const musclesById = new Map((content.anatomy.muscles || []).map((m) => [m.id, m]));
    const allMuscleNames = (content.anatomy.muscles || []).slice(0, 4).map((m) => m.name);
    content.anatomy.quiz = (content.anatomy.quiz || content.anatomy.quizItems || []).map((q) => {
      const targetM = musclesById.get(q.targetMuscleId);
      const ans = q.answer || targetM?.name || allMuscleNames[0];
      const opts = q.options || [
        ans,
        ...(content.anatomy.muscles || [])
          .map((m) => m.name)
          .filter((n) => n !== ans)
          .slice(0, 3)
      ];
      return {
        id: q.id,
        question: q.question || q.prompt,
        options: opts,
        answer: ans,
        explanation: q.explanation || `${ans}: ${targetM?.function || ''}`
      };
    });
  }

  // 6. Normalize level3.json
  if (content.level3) {
    const auNameMap = new Map((content.aus?.aus || []).map((a) => [Number(a.id), `AU${a.id} ${a.name}`]));
    content.level3.auDrills = (content.level3.auDrills || content.level3.whichAuItems || []).map((item) => {
      const ansLabel = auNameMap.get(Number(item.answer || item.au)) || `AU${item.au}`;
      const uniqOpts = [...new Set([Number(item.au), ...(item.options || []), 1, 4, 6, 12])].slice(0, 4);
      return {
        ...item,
        aus: [Number(item.au)],
        exposureMs: 333,
        options: uniqOpts.map((id) => auNameMap.get(Number(id)) || `AU${id}`),
        answer: ansLabel,
        explanation: item.explanation || `${ansLabel} activated at intensity ${item.intensity}.`
      };
    });
    content.level3.builderTargets = (content.level3.builderTargets || []).map((t) => ({
      ...t,
      title: t.title || t.label,
      prompt: t.prompt || t.hint,
      requiredAUs: t.requiredAUs || t.targetAUs || [],
      forbiddenAUs: t.forbiddenAUs || [],
      explanation: t.explanation || t.hint || ''
    }));
  }

  // 7. Normalize level5.json & level6.json
  if (content.level5) {
    content.level5.spotDifferenceDrills = (content.level5.spotDifferenceDrills || content.level5.spotDifferenceItems || []).map((it) => ({
      ...it,
      title: it.title || `${it.emotion.toUpperCase()} (${it.region}, ${Math.round((it.scale || 0.35) * 100)}%)`,
      question: it.question || it.prompt,
      labelA: 'Neutral Baseline',
      labelB: `Subtle Stimulus (${Math.round((it.scale || 0.35) * 100)}%)`,
      recipeA: 'neutral',
      recipeB: it.recipeId || it.emotion,
      options: ['happiness', 'sadness', 'anger', 'fear', 'disgust', 'surprise', 'contempt'],
      answer: it.emotion,
      explanation: `Recipe ${it.recipeId} at ${Math.round((it.scale || 0.35) * 100)}% scale in ${it.region} region.`
    }));
  }

  if (content.level6) {
    const pairsMap = new Map((content.expressions?.confusablePairs || []).map((p) => [p.id, p]));
    content.level6.confusablePairDrills = (content.level6.confusablePairDrills || content.level6.drillItems || []).map((d) => {
      const pInfo = pairsMap.get(d.pairId) || {};
      const shown = d.targetRecipeId === 'happiness_social' ? 'happiness' : d.targetRecipeId;
      return {
        ...d,
        pair: d.options || pInfo.pair || ['fear', 'surprise'],
        shownEmotion: shown,
        exposureMs: 133,
        prompt: `Distinguish ${pInfo.title || d.pairId}: Which expression flashed?`,
        keyCue: pInfo.explanation || pInfo.keyCue || ''
      };
    });
  }

  // 8. Normalize blends.json
  if (content.blends) {
    for (const b of content.blends.blends || []) {
      b.name = b.name || b.label;
      b.regionalBreakdown = b.regionalBreakdown || b.notes || (b.keyCues || []).join(' • ');
    }
    for (const m of [...(content.blends.maskedFlashes || []), ...(content.blends.upperFaceLeaks || [])]) {
      m.title = m.title || m.label;
      m.description = m.description || m.explanation;
      m.keyframes = m.keyframes || m.keys || [];
      m.leakedEmotion = m.leakedEmotion || m.targetState?.hidden || 'fear';
    }
    const timingList = content.blends. smileTiming || [];
    if (!content.blends.timingComparisons && timingList.length >= 2) {
      content.blends.timingComparisons = [
        {
          id: 'timing_comp_1',
          title: 'Ballistic Genuine Duchenne Smile vs. Abrupt Posed Social Smile',
          description: 'Compare smooth 500 ms ballistic onset with cheek raise (AU6+12) against an abrupt 80 ms step-onset posed smile (AU12 alone).',
          labelA: timingList[0]?.label || 'Genuine Duchenne Onset',
          labelB: timingList[1]?.label || 'Abrupt Posed Onset',
          keyframesA: timingList[0]?.keys || [],
          keyframesB: timingList[1]?.keys || [],
          keyTakeaway: timingList[0]?.explanation || 'Genuine smiles ramp smoothly across 400-700 ms with synchronized AU6+AU12; posed smiles often snap on and off abruptly.'
        }
      ];
    }
  }

  // 9. Normalize ethics.json
  if (content.ethics) {
    for (const c of content.ethics.cards || []) {
      c.citation = c.citation || c.summary || 'FACS & Affective Science Literature';
    }
    for (const q of content.ethics.quiz || []) {
      if (q.answer === undefined && typeof q.correctIndex === 'number') {
        q.answer = q.options?.[q.correctIndex];
      }
    }
  }

  // 10. Normalize scenes.json & conversations.json
  if (content.scenes) {
    for (const sc of content.scenes.level9Scenes || []) {
      sc.title = sc.title || `Scene ${sc.id}`;
      sc.vignette = sc.vignette || sc.caption;
      sc.postureSvg = sc.postureSvg || sc.posture || 'lean_in';
      sc.faceExpression = sc.faceExpression || sc.recipeId || 'pride';
      sc.answer = sc.answer || sc.best;
    }
    const recipesById = new Map((content.expressions?.recipes || []).map((r) => [r.id, r]));
    content.scenes.contextSwapPairs = (content.scenes.contextSwapPairs || content.scenes.level10ContextSwaps || []).map((sw) => {
      const rec = recipesById.get(sw.recipeId) || { id: sw.recipeId, aus: [{ au: 4, intensity: 0.8 }, { au: 7, intensity: 0.7 }] };
      return {
        ...sw,
        sharedFaceRecipe: rec,
        contextA: {
          ...(sw.sceneA || {}),
          title: sw.sceneA?.setting || 'Context A',
          vignette: sw.sceneA?.caption || '',
          postureSvg: sw.sceneA?.posture || 'lean_in',
          inferredState: sw.sceneA?.best || ''
        },
        contextB: {
          ...(sw.sceneB || {}),
          title: sw.sceneB?.setting || 'Context B',
          vignette: sw.sceneB?.caption || '',
          postureSvg: sw.sceneB?.posture || 'guarded',
          inferredState: sw.sceneB?.best || ''
        },
        lesson: sw.sceneA?.explanation || 'Identical facial Action Units take on different situational meanings depending on context and posture.'
      };
    });
  }

  if (content.conversations) {
    for (const c of content.conversations.conversations || []) {
      c.keyframes = c.keyframes || c.timeline?.keys || [];
      c.dialogueLine = c.dialogueLine || (c.script || []).map((s) => `${s.speaker}: "${s.text}"`).join(' — ');
      const flashKey = (c.keyframes || []).find((k) => k.ease === 'step' && k.recipeId !== 'neutral' && k.recipeId !== 'happiness_social');
      c.flashTimestampMs = flashKey ? flashKey.tMs + 40 : 3150;
      c.signalQuestion = c.signalQuestion || {
        prompt: 'Which expression pattern briefly appeared during the exchange?',
        options: c.emotionOptions || ['fear', 'anger', 'disgust', 'sadness'],
        answer: c.bestEmotion,
        explanation: c.ethicsReflection || ''
      };
      c.responseQuestion = c.responseQuestion || {
        prompt: c.followUp?.prompt || 'What is the most constructive, non-accusatory question to ask next?',
        options: c.followUp?.options || [],
        answer: c.followUp?.best || c.followUp?.options?.[0],
        explanation: c.ethicsReflection || ''
      };
    }
  }

  return content;
}
