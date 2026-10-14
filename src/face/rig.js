/**
 * Three.js FaceRig & StimulusRenderer (Sections 4.5, 4.6, 5.3, 5.4).
 * - Loads realistic textured 3D head (`models/riya/head.glb` by default) or Rocketbox
 *   multi-identity avatars (`models/rocketbox/<id>/head.glb`).
 * - Loads `models/dev/facecap.glb` ONLY when `?rig=facecap` is in URL or explicitly selected in AU Lab.
 * - Upgrades materials to realistic PBR (subsurface wrap + terminator scatter, AU-driven wrinkle normals,
 *   IOR 1.376 clearcoat cornea, cavity-darkened mouth, alpha-tested double-sided hair/lashes).
 * - Pre-compiles shaders (`renderer.compileAsync`) and runs 3 warmup frames so the first flash drops 0 frames.
 * - Exposes `window.__missing` (0 missing ARKit channels on realistic rigs) and `window.__rigStats`.
 */

import * as THREE from 'three';
import { GLTFLoader } from '../../lib/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from '../../lib/addons/loaders/KTX2Loader.js';
import { OrbitControls } from '../../lib/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from '../../lib/addons/libs/meshopt_decoder.module.js';

import { CANONICAL_ARKIT_52, loadAUsCatalog } from './auMap.js';
import { resolveExpressionState, lerpExpressionState, applyRigGains } from './resolver.js';
import { WrinkleController } from './wrinkles.js';
import {
  loadSSSMap,
  upgradeSkinMaterial,
  upgradeEyeMaterial,
  upgradeMouthMaterial,
  upgradeHairMaterial,
  upgradeBodyMaterial,
  createFacecapDevMaterial
} from './materials.js';
import {
  createRenderer,
  setupThreePointLights,
  setupEnvironmentMap
} from './lighting.js';
import { FrameCountingScheduler } from './scheduler.js';
import { AUOverlayRenderer } from './overlays.js';

import { detectFaceLandmarks } from './landmarks.js';

export const CAMERA_PRESETS = {
  front: { label: 'Front (0°)', frame: ['browTop', 'chin'], yawDeg: 0, margin: 1.34 },
  left34: { label: 'Left 3/4 (-32°)', frame: ['browTop', 'chin'], yawDeg: -32, margin: 1.40 },
  right34: { label: 'Right 3/4 (+32°)', frame: ['browTop', 'chin'], yawDeg: 32, margin: 1.40 },
  eyeCloseup: { label: 'Upper Face / Eyes', frame: ['browTop', 'noseBridge'], yawDeg: 0, margin: 1.35 },
  mouthCloseup: { label: 'Lower Face / Mouth', frame: ['noseTip', 'chin'], yawDeg: 0, margin: 1.30 }
};

let registryCache = null;

export async function loadModelRegistry() {
  if (registryCache) return registryCache;
  try {
    const res = await fetch('./models/registry.json');
    registryCache = await res.json();
  } catch {
    registryCache = {
      defaultRig: 'riya',
      rigs: [
        {
          id: 'riya',
          rigId: 'riya',
          label: 'Adult Female 01 (Primary Realistic Head)',
          glbUrl: 'models/riya/head.glb',
          wrinkleNormalUrl: 'models/riya/head_normal_wrinkle.jpg',
          sssMapUrl: 'models/riya/head_sss.jpg',
          tier: 'realistic'
        }
      ]
    };
  }
  return registryCache;
}

export class FaceRig {
  constructor(containerEl, options = {}) {
    this.containerEl = containerEl;
    this.quality = options.quality || 'high';
    this.reducedMotion = Boolean(options.reducedMotion);

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'face-rig-canvas';
    this.canvas.style.cssText = 'width:100%;height:100%;display:block;outline:none;';
    this.containerEl.style.position = this.containerEl.style.position || 'relative';
    this.containerEl.appendChild(this.canvas);

    this.renderer = createRenderer(this.canvas, this.quality);
    this.scene = new THREE.Scene();

    // 35 deg vertical FOV (~65mm portrait lens, minimal perspective distortion per Section 4.6)
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.05, 10.0);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 0.20;
    this.controls.maxDistance = 1.15;
    this.controls.minPolarAngle = Math.PI * 0.30;
    this.controls.maxPolarAngle = Math.PI * 0.68;
    this.controls.minAzimuthAngle = -Math.PI * 0.42;
    this.controls.maxAzimuthAngle = Math.PI * 0.42;

    this.lights = setupThreePointLights(this.scene);
    this.wrinkleController = new WrinkleController();
    this.overlayRenderer = new AUOverlayRenderer(this.containerEl);
    this.scheduler = new FrameCountingScheduler();

    // Pivot at neck/head center (0, 1.56, 0) so head pitch/yaw/roll rotates cleanly in place
    this.headPivot = new THREE.Group();
    this.headPivot.name = 'HeadPivot';
    this.headPivot.position.set(0, 1.56, 0);
    this.scene.add(this.headPivot);

    this.headOffsetGroup = new THREE.Group();
    this.headOffsetGroup.name = 'HeadOffsetGroup';
    this.headOffsetGroup.position.set(0, -1.56, 0);
    this.headPivot.add(this.headOffsetGroup);

    // 3D Hotspot group for Level 2 Anatomy & Muscle Map
    this.hotspotGroup = new THREE.Group();
    this.hotspotGroup.name = 'AnatomyHotspots3D';
    this.hotspotGroup.visible = false;
    this.headOffsetGroup.add(this.hotspotGroup);
    this.raycaster = new THREE.Raycaster();
    this.onHotspotClick = null;

    this.morphMeshes = [];
    this.morphAliases = {};
    this.currentRigId = null;
    this.currentManifest = null;
    this.auCatalog = null;

    this.currentState = resolveExpressionState([], null);
    this.idleBlinksEnabled = true;
    this._lastBlinkTime = 0;
    this._rafId = null;
    this._disposed = false;

    this._loadSeq = 0;
    this._rigCache = new Map();
    this.isReady = false;
    this.ready = Promise.resolve();
    this.loadingStatus = document.createElement('div');
    this.loadingStatus.className = 'rig-loading-status';
    this.loadingStatus.setAttribute('role', 'status');
    this.loadingStatus.textContent = 'Loading face…';
    this.containerEl.append(this.loadingStatus);
    this._setupLoaders();
    this._setupResizeObserver();
    this._setupPointerRaycast();
    this.setCameraPreset('front');
  }

  _setupLoaders() {
    this.gltfLoader = new GLTFLoader();
    try {
      this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
    } catch {
      // Optional meshopt decoder
    }
    try {
      const ktx2 = new KTX2Loader();
      ktx2.setTranscoderPath('./lib/addons/libs/basis/');
      ktx2.detectSupport(this.renderer);
      this.gltfLoader.setKTX2Loader(ktx2);
      this.ktx2Loader = ktx2;
    } catch {
      // Optional KTX2 loader
    }
  }

  _setupResizeObserver() {
    const updateSize = () => {
      if (this._disposed || !this.containerEl) return;
      const rect = this.containerEl.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width || 640));
      const h = Math.max(1, Math.floor(rect.height || 480));
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
      if (this.faceLandmarks) this.setCameraPreset(this.currentPreset);
    };
    updateSize();
    this._resizeObserver = new ResizeObserver(updateSize);
    this._resizeObserver.observe(this.containerEl);
    window.addEventListener('resize', updateSize);
    this._onWindowResize = updateSize;
  }

  _setupPointerRaycast() {
    this._onPointerDown = (ev) => {
      if (!this.hotspotGroup.visible || !this.onHotspotClick) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
      const hits = this.raycaster.intersectObjects(this.hotspotGroup.children, true);
      if (hits.length > 0) {
        let obj = hits[0].object;
        while (obj && !obj.userData?.muscleId && obj.parent) {
          obj = obj.parent;
        }
        if (obj?.userData?.muscleId) {
          this.onHotspotClick(obj.userData.muscleId, obj.userData);
        }
      }
    };
    this.canvas.addEventListener('pointerdown', this._onPointerDown);
  }

  async init(initialRigId = null) {
    this.auCatalog = await loadAUsCatalog();
    this.overlayRenderer.setCatalog(this.auCatalog);
    await setupEnvironmentMap(this.renderer, this.scene);

    // Check URL query string for ?rig=facecap or ?rig=<id>
    const params = new URLSearchParams(window.location.search || '');
    const urlRig = params.get('rig');
    const targetRig = initialRigId || urlRig || 'riya';

    await this.loadRig(targetRig);
    this.startRenderLoop();
    return this;
  }

  _notifyRig() {
    window.dispatchEvent(new CustomEvent('rig:change', { detail: {
      rigId: this.currentRigId, reason: this.identityLock, cameraLocked: this.cameraLocked
    } }));
  }

  lockIdentity(reason = 'set by test') {
    this.identityLock = reason;
    this._notifyRig();
  }
  unlockIdentity() {
    this.identityLock = null;
    this._notifyRig();
  }

  // This wrapper publishes the latest promise synchronously, including when two
  // identity requests arrive before the registry fetch has completed.
  loadRig(rigId = 'riya') {
    const token = ++this._loadSeq;
    this.isReady = false;
    this.loadingStatus.textContent = 'Loading face…';
    this.loadingStatus.hidden = false;
    const pending = this._loadRig(rigId, token);
    this.ready = pending;
    return pending;
  }

  async _loadRig(rigId, token) {
    try {
      const prepared = await this.preload(rigId);
      if (this._disposed || token !== this._loadSeq) return null;
      const { root, manifest, rigEntry, morphMeshes, wrinkles, sssTex, auMap } = prepared;
      // No await in the swap: the previous, fully textured face stays rendered
      // throughout fetch, texture decode, material setup, and shader compilation.
      for (const child of [...this.headOffsetGroup.children]) {
        if (child !== this.hotspotGroup) this.headOffsetGroup.remove(child);
      }
      this.headOffsetGroup.add(root);
      this.currentRigId = rigEntry.id;
      this.currentManifest = manifest;
      this.morphAliases = prepared.aliases;
      this.morphMeshes = morphMeshes;
      this.wrinkleController = wrinkles;
      this._currentSssTex = sssTex;
      this.auMap = auMap;
      this.resetToNeutral();
      this.scene.updateMatrixWorld(true);
      this._landmarkModel = detectFaceLandmarks(root, morphMeshes, this.morphAliases);
      this.faceLandmarks = this._landmarkModel.points;
      this.setCameraPreset(this.currentPreset);
      this.lights.targetObj.position.copy(this.faceLandmarks.faceCenter);
      const found = new Set(morphMeshes.flatMap(m => Object.keys(m.morphTargetDictionary)));
      const missing = CANONICAL_ARKIT_52.filter(k => !found.has(k) && !found.has(this.morphAliases[k]));
      window.__missing = missing;
      window.__rigStats = { rigId: this.currentRigId, tier: rigEntry.tier || 'realistic',
        morphCount: found.size, missingCount: missing.length, glbUrl: rigEntry.glbUrl };
      this.renderer.render(this.scene, this.camera);
      this.isReady = true;
      this.loadingStatus.hidden = true;
      this._notifyRig();
      return manifest;
    } catch (error) {
      if (token === this._loadSeq) {
        this.isReady = Boolean(this.currentRigId);
        this.loadingStatus.textContent = 'Face could not load. Try choosing it again.';
      }
      throw error;
    }
  }

  preload(rigId = 'riya') {
    if (!this._rigCache.has(rigId)) {
      const pending = this._prepareRig(rigId).catch(error => {
        this._rigCache.delete(rigId);
        throw error;
      });
      this._rigCache.set(rigId, pending);
    }
    return this._rigCache.get(rigId);
  }

  async _prepareRig(rigId) {
    const registry = await loadModelRegistry();
    const rigEntry = rigId === 'facecap' ? {
      id: 'facecap', tier: 'dev', glbUrl: 'models/dev/facecap.glb', manifestUrl: 'models/dev/manifest.json'
    } : registry.rigs.find(r => r.id === rigId || r.rigId === rigId) || registry.rigs[0];
    const manifestUrl = rigEntry.manifestUrl || rigEntry.glbUrl.replace(/head\.glb$/, 'manifest.json');
    const [manifest, auMap] = await Promise.all([
      fetch(`./${manifestUrl}`).then(r => r.ok ? r.json() : rigEntry),
      fetch(`./${rigEntry.glbUrl.replace(/[^/]+$/, 'au-map.json')}`).then(r => r.ok ? r.json() : {})
    ]);
    const aliases = { ...(manifest.aliases || {}) };
    // Older manifests carry actual -> canonical aliases; accept both directions.
    for (const [a, b] of Object.entries({ ...aliases, ...(auMap.aliases || {}) })) {
      if (CANONICAL_ARKIT_52.includes(b)) aliases[b] = a;
      else aliases[a] = b;
    }
    const wrinkles = new WrinkleController();
    const [gltf, , sssTex] = await Promise.all([
      this.gltfLoader.loadAsync(`./${rigEntry.glbUrl}`),
      wrinkles.loadWrinkleMap(manifest.wrinkleNormalUrl ? `./${manifest.wrinkleNormalUrl}` : null),
      loadSSSMap(manifest.sssMapUrl ? `./${manifest.sssMapUrl}` : null)
    ]);
    const morphMeshes = [];
    const root = gltf.scene;
    root.name = `Rig_${rigEntry.id}`;

    if (rigEntry.tier === 'dev') {
      // Normalize Facecap developer mesh position & scale to match 1.59m eye height
      const box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      const scale = size.y > 0 ? 0.30 / size.y : 1.0;
      root.scale.setScalar(scale);
      root.position.set(-center.x * scale, 1.585 - center.y * scale, -center.z * scale);
    } else {
      // Reset any residual FBX node translation/rotation on HeadMesh and apply 0.01 cm->m scale
      // so vertices (X: [-22, 22] cm, Y: [130, 174] cm, Z: [-25, +9] cm) sit at Y=1.60m facing +Z
      root.position.set(0, 0, 0);
      root.rotation.set(0, 0, 0);
      root.scale.set(1, 1, 1);
      root.traverse((child) => {
        if (child !== root) {
          child.position.set(0, 0, 0);
          child.rotation.set(0, 0, 0);
          child.scale.set(1, 1, 1);
        }
      });
      root.scale.setScalar(0.01);
    }

    root.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = false;

      if (rigEntry.tier === 'dev') {
        node.material = createFacecapDevMaterial();
        node.renderOrder = 1;
      } else {
        const matName = (node.material?.name || '').toLowerCase();
        if (matName.includes('hair') || matName.includes('opacity')) {
          node.material = upgradeHairMaterial(node.material);
          node.renderOrder = 2; // Render alpha-tested hair/lashes after skin per Section 4.6
          node.castShadow = false;
        } else if (matName.includes('eye')) {
          node.material = upgradeEyeMaterial(node.material);
          node.renderOrder = 1;
          node.castShadow = false;
        } else if (matName.includes('mouth')) {
          node.material = upgradeMouthMaterial(node.material, wrinkles, sssTex);
          node.renderOrder = 1;
        } else if (matName.includes('body')) {
          node.material = upgradeBodyMaterial(node.material);
          node.renderOrder = 1;
        } else {
          node.material = upgradeSkinMaterial(node.material, wrinkles, sssTex);
          node.renderOrder = 1;
        }
      }

      if (node.morphTargetDictionary && node.morphTargetInfluences) {
        morphMeshes.push(node);
      }
    });


    // Wait for image decoding too; the GLTF and TextureLoader promises establish
    // image availability, and decode resolves browser-side JPEG/PNG work.
    const images = new Set();
    root.traverse(node => {
      for (const mat of Array.isArray(node.material) ? node.material : [node.material]) {
        if (mat) for (const value of Object.values(mat)) if (value?.isTexture && value.image) images.add(value.image);
      }
    });
    for (const tex of [sssTex, wrinkles.uniforms.uWrinkleNormalMap.value]) if (tex?.image) images.add(tex.image);
    await Promise.all([...images].map(image => image.decode ? image.decode() : Promise.resolve()));
    root.updateMatrixWorld(true);
    const featurePoints = detectFaceLandmarks(root, morphMeshes, aliases).points;
    wrinkles.uniforms.uFaceRegions.value.set(featurePoints.brow.y, featurePoints.eyeMid.y,
      (featurePoints.noseL.y + featurePoints.noseR.y) / 2, featurePoints.eyeL.distanceTo(featurePoints.eyeR) * .72);
    try {
      if (this.renderer.compileAsync) await this.renderer.compileAsync(root, this.camera, this.scene);
      else this.renderer.compile(root, this.camera, this.scene);
    } catch { this.renderer.compile(root, this.camera, this.scene); }
    return { root, manifest, rigEntry, morphMeshes, wrinkles, sssTex, aliases, auMap };
  }

  _disposeRoot(root, wrinkles, sssTex) {
    const textures = new Set([sssTex, wrinkles?.uniforms.uWrinkleNormalMap.value]);
    root.traverse(node => {
      node.geometry?.dispose();
      for (const mat of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!mat) continue;
        for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
        mat.dispose();
      }
    });
    textures.forEach(tex => tex?.dispose());
  }

  projectLandmark(name) {
    const p = this._landmarkModel?.projectable(name);
    if (!p) return null;
    this.camera.updateMatrixWorld(true);
    return p.project(this.camera);
  }

  setCameraPreset(presetName = 'front') {
    const preset = CAMERA_PRESETS[presetName] || CAMERA_PRESETS.front;
    this.currentPreset = CAMERA_PRESETS[presetName] ? presetName : 'front';
    const lm = this.faceLandmarks;
    if (!lm) {
      this.camera.position.set(0, 1.6, .65);
      this.controls.target.set(0, 1.6, 0);
      this.controls.update();
      return;
    }
    const top = lm[preset.frame[0]], bottom = lm[preset.frame[1]];
    const target = top.clone().add(bottom).multiplyScalar(.5);
    const height = top.distanceTo(bottom) * preset.margin;
    const width = (presetName === 'mouthCloseup' ? lm.cornerL.distanceTo(lm.cornerR) * 1.5 : lm.faceWidth) * 1.15;
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const distance = Math.max(height / (2 * tan), width / (2 * tan * this.camera.aspect)) + lm.faceHeight * .14;
    const yaw = THREE.MathUtils.degToRad(preset.yawDeg);
    this.controls.minDistance = distance * .9;
    this.controls.maxDistance = distance * 2.2;
    this.camera.near = Math.max(.005, distance * .04);
    this.camera.updateProjectionMatrix();
    // Clear OrbitControls damping left over from a prior view.
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.target.copy(target);
    this.camera.position.copy(target).add(new THREE.Vector3(Math.sin(yaw) * distance, 0, Math.cos(yaw) * distance));
    this.controls.update();
    this.controls.enableDamping = damping;
    this._notifyRig();
  }

  setQuality(quality = 'high') {
    this.quality = quality;
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : 2));
  }

  setReducedMotion(reduced) {
    this.reducedMotion = Boolean(reduced);
  }

  /**
   * Resolves an AU list or expression recipe and applies it immediately to the 3D head.
   */
  resolveExpressionState(recipeOrAUs, options = {}) {
    return resolveExpressionState(recipeOrAUs, this.auCatalog, { ...options, rigMap: this.auMap });
  }

  setExpressionFromRecipe(recipeOrAUs, options = {}) {
    const state = this.resolveExpressionState(recipeOrAUs, options);
    this.applyResolvedState(state);
    return state;
  }

  /**
   * Directly sets canonical 52 ARKit blendshape weights (used by Mirror Mode & AU Lab).
   */
  setRawBlendshapes(weightsMap = {}, wrinkleOverride = null, headPose = null) {
    const state = {
      weights: { ...weightsMap },
      activeAUs: {},
      wrinkleWeights: wrinkleOverride || {
        forehead: Math.max(weightsMap.browInnerUp || 0, weightsMap.browOuterUpLeft || 0, weightsMap.browOuterUpRight || 0),
        glabella: Math.max(weightsMap.browDownLeft || 0, weightsMap.browDownRight || 0),
        crowsFeet: Math.max(weightsMap.cheekSquintLeft || 0, weightsMap.cheekSquintRight || 0),
        nose: Math.max(weightsMap.noseSneerLeft || 0, weightsMap.noseSneerRight || 0)
      },
      headPose: headPose || { pitchDeg: 0, yawDeg: 0, rollDeg: 0 },
      gazeDown: Math.max(weightsMap.eyeLookDownLeft || 0, weightsMap.eyeLookDownRight || 0)
    };
    this.applyResolvedState(state);
  }

  /**
   * Applies a resolved expression state (weights, wrinkle uniforms, head pose) in < 1 ms.
   */
  applyResolvedState(state, extraBlink = 0) {
    if (!state) return;
    this.currentState = state;
    const weights = applyRigGains(state.weights || {}, this.auMap);

    for (const mesh of this.morphMeshes) {
      const dict = mesh.morphTargetDictionary;
      const infl = mesh.morphTargetInfluences;
      if (!dict || !infl) continue;

      // Reset all influences first
      for (let i = 0; i < infl.length; i++) {
        infl[i] = 0;
      }

      for (const canonicalName of CANONICAL_ARKIT_52) {
        let val = Number(weights[canonicalName] || 0);
        if (extraBlink > 0 && (canonicalName === 'eyeBlinkLeft' || canonicalName === 'eyeBlinkRight')) {
          val = Math.max(val, extraBlink);
        }
        if (val <= 0) continue;

        let idx = dict[canonicalName];
        if (idx === undefined) {
          const alias = this.morphAliases[canonicalName];
          if (alias !== undefined) idx = dict[alias];
        }
        if (idx !== undefined) {
          infl[idx] = val;
        }
      }
    }

    // Update AU-driven wrinkle weights
    if (state.wrinkleWeights) {
      this.wrinkleController.setWeights(state.wrinkleWeights);
    }

    // Update head pose (pitch, yaw, roll in degrees)
    const pose = state.headPose || { pitchDeg: 0, yawDeg: 0, rollDeg: 0 };
    this.headPivot.rotation.set(
      THREE.MathUtils.degToRad(pose.pitchDeg || 0),
      THREE.MathUtils.degToRad(pose.yawDeg || 0),
      THREE.MathUtils.degToRad(pose.rollDeg || 0)
    );
  }

  resetToNeutral() {
    this.scheduler.cancelFlash();
    const neutral = resolveExpressionState([], this.auCatalog);
    this.applyResolvedState(neutral);
    return neutral;
  }

  /**
   * Flashes an expression at exact frame-counted duration using the rAF scheduler (Section 5.3).
   * Never uses setTimeout or setInterval.
   */
  async flashExpression(recipeOrState, durationMs = 200, options = {}) {
    await this.ready;
    if (!this.isReady || this._disposed) return { cancelled: true };
    if (!options.assessment) durationMs = Math.max(durationMs, this.minimumFlashMs || 0);
    const presetBefore = this.currentPreset;
    const previousLock = this.cameraLocked;
    this.cameraLocked = true;
    if (!previousLock) this.setCameraPreset('front');
    this._notifyRig();
    const previousControls = this.controls.enabled;
    this.controls.enabled = false;
    const peakState = recipeOrState?.weights
      ? recipeOrState
      : this.resolveExpressionState(recipeOrState, options);
    const neutralState = resolveExpressionState([], this.auCatalog);

    const prevBlinks = this.idleBlinksEnabled;
    this.idleBlinksEnabled = false;

    try {
      const result = await this.scheduler.scheduleFlash({
        durationMs,
        reducedMotion: this.reducedMotion || Boolean(options.reducedMotion),
        preNeutralFrames: options.preNeutralFrames ?? 12,
        postNeutralFrames: options.postNeutralFrames ?? 12,
        rampInFrames: options.rampInFrames,
        rampOutFrames: options.rampOutFrames,
        onApplyFrame: (alpha, phase) => {
          if (alpha <= 0) {
            this.applyResolvedState(neutralState, 0);
          } else if (alpha >= 1) {
            this.applyResolvedState(peakState, 0);
          } else {
            const interp = lerpExpressionState(neutralState, peakState, alpha);
            this.applyResolvedState(interp, 0);
          }
          if (options.onFrame) {
            options.onFrame(alpha, phase);
          }
        }
      });
      return result;
    } finally {
      this.idleBlinksEnabled = prevBlinks;
      this.controls.enabled = previousControls;
      this.cameraLocked = previousLock;
      if (!previousLock) this.setCameraPreset(presetBefore);
      this._notifyRig();
    }
  }

  /**
   * Plays a keyframe timeline (masked flashes, onset/offset timing, conversations) via rAF.
   */
  async playTimeline(timelinePlayer, options = {}) {
    const prevBlinks = this.idleBlinksEnabled;
    this.idleBlinksEnabled = false;

    timelinePlayer.onUpdate = (state, currentMs, totalMs) => {
      this.applyResolvedState(state, 0);
      if (options.onTick) options.onTick(state, currentMs, totalMs);
    };

    return new Promise((resolve) => {
      timelinePlayer.onComplete = () => {
        this.idleBlinksEnabled = prevBlinks;
        resolve();
      };
      timelinePlayer.play(performance.now());
      this._activeTimelinePlayer = timelinePlayer;
    });
  }

  /**
   * Builds 3D clickable muscle hotspots on the head mesh for Level 2 Anatomy & Muscle Map.
   */
  setAnatomyHotspots(muscles = [], activeMuscleId = null, onClick = null) {
    this.onHotspotClick = onClick;
    for (const c of [...this.hotspotGroup.children]) {
      this.hotspotGroup.remove(c);
    }
    if (!muscles || muscles.length === 0) {
      this.hotspotGroup.visible = false;
      return;
    }
    this.hotspotGroup.visible = true;

    const sphereGeo = new THREE.SphereGeometry(0.0085, 16, 16);
    for (const m of muscles) {
      if (!m.hotspot3d) continue;
      const isSelected = m.id === activeMuscleId;
      const mat = new THREE.MeshBasicMaterial({
        color: isSelected ? 0xf5c542 : 0x38b6ff,
        transparent: true,
        opacity: isSelected ? 0.95 : 0.78
      });
      const marker = new THREE.Mesh(sphereGeo, mat);
      // Convert hotspot3d coordinates to our 1.59m head space
      const hx = m.hotspot3d.x || 0;
      const hy = 1.585 + (m.hotspot3d.y || 0);
      const hz = (m.hotspot3d.z || 0.09) - 0.03;
      marker.position.set(hx, hy, hz);
      marker.userData = { muscleId: m.id, muscle: m };
      this.hotspotGroup.add(marker);
    }
  }

  setOverlaysEnabled(enabled, highlightAUIds = null) {
    this.overlayRenderer.setEnabled(enabled, highlightAUIds);
  }

  startRenderLoop() {
    if (this._rafId) return;
    const tick = (now) => {
      if (this._disposed) return;
      this._rafId = requestAnimationFrame(tick);

      if (this._activeTimelinePlayer && this._activeTimelinePlayer.isPlaying) {
        this._activeTimelinePlayer.tick(now);
      }

      // Natural idle blink (~every 4.2s, 150ms duration) ONLY when neutral & not flashing
      let blinkWeight = 0;
      if (
        this.idleBlinksEnabled &&
        !this.scheduler.isRunning &&
        (!this._activeTimelinePlayer || !this._activeTimelinePlayer.isPlaying)
      ) {
        const hasActiveAUs = Object.keys(this.currentState?.activeAUs || {}).length > 0;
        if (!hasActiveAUs) {
          if (now - this._lastBlinkTime > 4200) {
            const elapsed = now - this._lastBlinkTime - 4200;
            if (elapsed < 150) {
              blinkWeight = Math.sin((elapsed / 150) * Math.PI);
            } else {
              this._lastBlinkTime = now;
            }
          }
        } else {
          this._lastBlinkTime = now;
        }
      }

      if (blinkWeight > 0) {
        this.applyResolvedState(this.currentState, blinkWeight);
      }

      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.overlayRenderer.update(this.camera, this.headOffsetGroup, this.currentState?.activeAUs || {}, now);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  dispose() {
    this._disposed = true;
    ++this._loadSeq;
    for (const pending of this._rigCache.values()) pending.then(p => this._disposeRoot(p.root, p.wrinkles, p.sssTex)).catch(() => {});
    this._rigCache.clear();
    if (this._rafId) cancelAnimationFrame(this._rafId);
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this._onWindowResize) window.removeEventListener('resize', this._onWindowResize);
    if (this._onPointerDown) this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    this.scheduler.cancelFlash();
    this.renderer.dispose();
  }
}
