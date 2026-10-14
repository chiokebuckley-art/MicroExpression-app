import * as THREE from 'three';

// Keep vertex references, rather than screen coordinates, so lesson arrows follow
// the same morphs and head pose as the rendered skin. Left means subject's left.
export function detectFaceLandmarks(root, meshes, aliases = {}) {
  root.updateWorldMatrix(true, true);
  const skin = [...meshes].sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count)[0];
  const box = new THREE.Box3().setFromObject(skin || root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const refs = {};
  const points = {};
  const sample = (name, shape) => {
    const candidates = [];
    for (const mesh of meshes) {
      const dict = mesh.morphTargetDictionary;
      const actual = dict[shape] !== undefined ? shape : aliases[shape];
      const morph = mesh.geometry.morphAttributes.position?.[dict[actual]];
      if (!morph) continue;
      const base = mesh.geometry.attributes.position;
      const delta = new THREE.Vector3(), v = new THREE.Vector3();
      for (let i = 0; i < morph.count; i++) {
        delta.fromBufferAttribute(morph, i);
        if (!mesh.geometry.morphTargetsRelative) delta.sub(v.fromBufferAttribute(base, i));
        const strength = delta.lengthSq();
        if (strength > 1e-12) candidates.push({ mesh, i, strength });
      }
    }
    candidates.sort((a, b) => b.strength - a.strength);
    if (!candidates.length) return null;
    refs[name] = candidates.slice(0, 20);
    return points[name] = read(name);
  };
  const read = (name) => {
    if (!refs[name]) return points[name]?.clone();
    const p = new THREE.Vector3(), v = new THREE.Vector3();
    for (const { mesh, i } of refs[name]) {
      mesh.getVertexPosition(i, v);
      p.add(v.applyMatrix4(mesh.matrixWorld));
    }
    return p.multiplyScalar(1 / refs[name].length);
  };
  const fallback = (x, y) => new THREE.Vector3(center.x + x * size.x, box.min.y + y * size.y, box.max.z);
  points.innerBrow = sample('innerBrow', 'browInnerUp') || fallback(0, .62);
  points.outerBrowL = sample('outerBrowL', 'browOuterUpLeft') || fallback(.20, .62);
  points.outerBrowR = sample('outerBrowR', 'browOuterUpRight') || fallback(-.20, .62);
  points.upperLidL = sample('upperLidL', 'eyeWideLeft') || fallback(.15, .55);
  points.upperLidR = sample('upperLidR', 'eyeWideRight') || fallback(-.15, .55);
  points.lowerLidL = sample('lowerLidL', 'eyeSquintLeft') || points.upperLidL.clone();
  points.lowerLidR = sample('lowerLidR', 'eyeSquintRight') || points.upperLidR.clone();
  points.cheekL = sample('cheekL', 'cheekSquintLeft') || fallback(.23, .45);
  points.cheekR = sample('cheekR', 'cheekSquintRight') || fallback(-.23, .45);
  points.cornerL = sample('cornerL', 'mouthDimpleLeft') || sample('cornerL', 'mouthSmileLeft') || fallback(.14, .30);
  points.cornerR = sample('cornerR', 'mouthDimpleRight') || sample('cornerR', 'mouthSmileRight') || fallback(-.14, .30);
  points.upperLipL = sample('upperLipL', 'mouthUpperUpLeft') || fallback(.06, .31);
  points.upperLipR = sample('upperLipR', 'mouthUpperUpRight') || fallback(-.06, .31);
  points.lowerLip = sample('lowerLip', 'mouthShrugLower') || fallback(0, .26);
  points.noseL = sample('noseL', 'noseSneerLeft') || fallback(.06, .42);
  points.noseR = sample('noseR', 'noseSneerRight') || fallback(-.06, .42);

  const mid = (a, b) => a.clone().add(b).multiplyScalar(.5);
  const derived = () => {
    points.browL = mid(points.innerBrow, points.outerBrowL);
    points.browR = mid(points.innerBrow, points.outerBrowR);
    points.brow = points.innerBrow.clone();
    points.eyeL = mid(points.upperLidL, points.lowerLidL);
    points.eyeR = mid(points.upperLidR, points.lowerLidR);
    points.eyeMid = mid(points.eyeL, points.eyeR);
    points.mouth = mid(points.cornerL, points.cornerR);
    const gap = Math.max(.025, points.eyeMid.y - points.mouth.y);
    points.browTop = points.brow.clone().add(new THREE.Vector3(0, gap * .55, 0));
    points.noseBridge = points.eyeMid.clone().lerp(points.mouth, .30);
    points.noseTip = points.eyeMid.clone().lerp(points.mouth, .60);
    points.chin = points.mouth.clone().add(new THREE.Vector3(0, -gap * .72, -.006));
    points.jaw = points.lowerLip.clone().lerp(points.chin, .6);
    points.faceCenter = mid(points.browTop, points.chin);
    points.faceHeight = points.browTop.y - points.chin.y;
    points.faceWidth = Math.max(points.eyeL.distanceTo(points.eyeR) * 2.15, points.cornerL.distanceTo(points.cornerR) * 1.8);
  };
  derived();
  // Static derived landmarks also follow head rotation; morph-backed anchors use
  // Mesh.getVertexPosition, including every active morph and any skinning.
  const inverse = root.matrixWorld.clone().invert();
  const local = Object.fromEntries(Object.entries(points).filter(([,v]) => v?.isVector3).map(([k,v]) => [k,v.clone().applyMatrix4(inverse)]));
  return { points, projectable(name) {
    root.updateWorldMatrix(true, true);
    if (refs[name]) return read(name);
    if (name === 'browL' || name === 'browR') return mid(read('innerBrow'), read(name === 'browL' ? 'outerBrowL' : 'outerBrowR'));
    const fixed = local[name]?.clone().applyMatrix4(root.matrixWorld);
    if (fixed && ['chin','jaw'].includes(name)) {
      const neutralLip = local.lowerLip.clone().applyMatrix4(root.matrixWorld);
      fixed.add(read('lowerLip').sub(neutralLip));
    }
    return fixed;
  } };
}
