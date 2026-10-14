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
import { resolveExpressionState, lerpExpressionState } from './resolver.js';
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

export const CAMERA_PRESETS = {
  front: {
    label: 'Front (0°)',
    position: [0.0, 1.595, 0.50],
    target: [0.0, 1.585, 0.0]
  },
  left34: {
    label: 'Left 3/4 (-32°)',
    position: [-0.26, 1.595, 0.43],
    target: [0.0, 1.585, 0.0]
  },
  right34: {
    label: 'Right 3/4 (+32°)',
    position: [0.26, 1.595, 0.43],
    target: [0.0, 1.585, 0.0]
  },
  eyeCloseup: {
    label: 'Upper Face / Eyes',
    position: [0.0, 1.622, 0.28],
    target: [0.0, 1.615, 0.02]
  },
  mouthCloseup: {
    label: 'Lower Face / Mouth',
    position: [0.0, 1.535, 0.29],
    target: [0.0, 1.535, 0.02]
  }
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

  async loadRig(rigId = 'riya') {
    const registry = await loadModelRegistry();
    let rigEntry = registry.rigs?.find((r) => r.id === rigId || r.rigId === rigId);

    if (rigId === 'facecap') {
      rigEntry = {
        id: 'facecap',
        rigId: 'facecap',
        label: 'FaceCap Developer Reference Rig (?rig=facecap)',
        glbUrl: 'models/dev/facecap.glb',
        manifestUrl: 'models/dev/manifest.json',
        tier: 'dev'
      };
    } else if (!rigEntry) {
      rigEntry = registry.rigs?.[0] || {
        id: 'riya',
        rigId: 'riya',
        label: 'Adult Female 01 (Primary Realistic Head)',
        glbUrl: 'models/riya/head.glb',
        wrinkleNormalUrl: 'models/riya/head_normal_wrinkle.jpg',
        sssMapUrl: 'models/riya/head_sss.jpg',
        tier: 'realistic'
      };
    }

    // Load manifest if available
    let manifest = rigEntry;
    const manifestPath = rigEntry.manifestUrl || rigEntry.glbUrl.replace(/head\.glb$/, 'manifest.json');
    try {
      const mRes = await fetch(`./${manifestPath}`);
      if (mRes.ok) {
        manifest = await mRes.json();
      }
    } catch {
      // Use rigEntry metadata fallback
    }

    this.currentRigId = rigEntry.id;
    this.currentManifest = manifest;
    this.morphAliases = manifest.aliases || {};

    // Clear previous head meshes
    for (const child of [...this.headOffsetGroup.children]) {
      if (child !== this.hotspotGroup) {
        this.headOffsetGroup.remove(child);
      }
    }
    this.morphMeshes = [];

    // Load wrinkle & SSS maps for realistic rigs
    if (rigEntry.tier !== 'dev') {
      const wrinkleUrl = manifest.wrinkleNormalUrl ? `./${manifest.wrinkleNormalUrl}` : null;
      const sssUrl = manifest.sssMapUrl ? `./${manifest.sssMapUrl}` : null;
      const [, sssTex] = await Promise.all([
        this.wrinkleController.loadWrinkleMap(wrinkleUrl),
        loadSSSMap(sssUrl)
      ]);
      this._currentSssTex = sssTex;
    } else {
      await this.wrinkleController.loadWrinkleMap(null);
      this._currentSssTex = null;
    }

    const gltf = await new Promise((resolve, reject) => {
      this.gltfLoader.load(`./${rigEntry.glbUrl}`, resolve, undefined, reject);
    });

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

    const foundMorphNames = new Set();

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
          node.material = upgradeMouthMaterial(node.material, this.wrinkleController, this._currentSssTex);
          node.renderOrder = 1;
        } else if (matName.includes('body')) {
          node.material = upgradeBodyMaterial(node.material);
          node.renderOrder = 1;
        } else {
          node.material = upgradeSkinMaterial(node.material, this.wrinkleController, this._currentSssTex);
          node.renderOrder = 1;
        }
      }

      if (node.morphTargetDictionary && node.morphTargetInfluences) {
        this.morphMeshes.push(node);
        for (const k of Object.keys(node.morphTargetDictionary)) {
          foundMorphNames.add(k);
        }
      }
    });

    this.headOffsetGroup.add(root);

    // Compute missing ARKit blendshape names and expose on window.__missing
    const missing = [];
    for (const canonicalName of CANONICAL_ARKIT_52) {
      const mappedName = this.morphAliases[canonicalName] || canonicalName;
      if (!foundMorphNames.has(canonicalName) && !foundMorphNames.has(mappedName)) {
        missing.push(canonicalName);
      }
    }
    window.__missing = missing;
    window.__rigStats = {
      rigId: this.currentRigId,
      tier: rigEntry.tier || 'realistic',
      morphCount: foundMorphNames.size,
      missingCount: missing.length,
      glbUrl: rigEntry.glbUrl
    };

    // Re-apply current expression state
    this.applyResolvedState(this.currentState);

    // Pre-compile shaders & render 3 warmup frames so the first stimulus flash drops 0 frames (Section 4.6)
    try {
      if (typeof this.renderer.compileAsync === 'function') {
        await this.renderer.compileAsync(this.scene, this.camera);
      } else {
        this.renderer.compile(this.scene, this.camera);
      }
    } catch {
      this.renderer.compile(this.scene, this.camera);
    }
    for (let i = 0; i < 3; i++) {
      this.renderer.render(this.scene, this.camera);
    }

    return manifest;
  }

  setCameraPreset(presetName = 'front') {
    const preset = CAMERA_PRESETS[presetName] || CAMERA_PRESETS.front;
    this.currentPreset = presetName;
    this.camera.position.set(...preset.position);
    this.controls.target.set(...preset.target);
    this.controls.update();
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
  setExpressionFromRecipe(recipeOrAUs, options = {}) {
    const state = resolveExpressionState(recipeOrAUs, this.auCatalog, options);
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
    const weights = state.weights || {};

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
    const peakState = recipeOrState?.weights
      ? recipeOrState
      : resolveExpressionState(recipeOrState, this.auCatalog, options);
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
    if (this._rafId) cancelAnimationFrame(this._rafId);
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this._onWindowResize) window.removeEventListener('resize', this._onWindowResize);
    if (this._onPointerDown) this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    this.scheduler.cancelFlash();
    this.renderer.dispose();
  }
}
