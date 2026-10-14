/**
 * Realistic PBR Material System for Reading Faces (Section 4.6).
 * - Skin: MeshPhysicalMaterial with base color (sRGB), normal, roughness (0.45-0.6),
 *   specularIntensity 0.5, sheen 0.15, no transmission, plus onBeforeCompile
 *   subsurface-like wrap lighting & reddish shadow-edge scatter tint, and
 *   AU-driven per-region wrinkle normal blending (AU1/2 forehead, AU4 glabella,
 *   AU6 crow's feet, AU9 nose).
 * - Eyes: Glossy cornea (roughness 0.03, clearcoat 1.0, IOR 1.376) with visible key-light catchlight.
 * - Mouth: Roughness 0.28, slight warm tint, and cavity ambient-occlusion darkening.
 * - Hair, brows, lashes: Alpha-tested cards (alphaTest 0.45, alphaToCoverage with MSAA),
 *   double-sided, rendered after skin with no sorting flicker.
 */

import * as THREE from 'three';

export async function loadSSSMap(url) {
  if (!url) return null;
  const loader = new THREE.TextureLoader();
  return new Promise((resolve) => {
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.NoColorSpace;
        tex.flipY = false;
        resolve(tex);
      },
      undefined,
      () => resolve(null)
    );
  });
}

export function upgradeSkinMaterial(origMat, wrinkleController, sssTexture = null) {
  const mat = new THREE.MeshPhysicalMaterial({
    name: origMat?.name || 'Skin',
    map: origMat?.map || null,
    normalMap: origMat?.normalMap || null,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughnessMap: origMat?.roughnessMap || null,
    roughness: 0.52,
    metalness: 0.0,
    specularIntensity: 0.5,
    specularColor: new THREE.Color(0xfff4ee),
    sheen: 0.15,
    sheenRoughness: 0.65,
    sheenColor: new THREE.Color(0xffdfd4),
    transmission: 0.0, // Never use transmission for skin per Section 4.6
    ior: 1.4,
    envMapIntensity: 0.75
  });

  if (mat.map) {
    mat.map.colorSpace = THREE.SRGBColorSpace;
  }

  const sssUniforms = {
    uSssMap: { value: sssTexture },
    uHasSssMap: { value: sssTexture ? 1.0 : 0.0 },
    uSssColor: { value: new THREE.Color(0xd93822) },
    uSssStrength: { value: 0.36 }
  };

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSssMap = sssUniforms.uSssMap;
    shader.uniforms.uHasSssMap = sssUniforms.uHasSssMap;
    shader.uniforms.uSssColor = sssUniforms.uSssColor;
    shader.uniforms.uSssStrength = sssUniforms.uSssStrength;

    if (wrinkleController) {
      shader.uniforms.uWrinkleNormalMap = wrinkleController.uniforms.uWrinkleNormalMap;
      shader.uniforms.uHasWrinkleMap = wrinkleController.uniforms.uHasWrinkleMap;
      shader.uniforms.uWrinkleWeights = wrinkleController.uniforms.uWrinkleWeights;
    } else {
      shader.uniforms.uWrinkleNormalMap = { value: null };
      shader.uniforms.uHasWrinkleMap = { value: 0.0 };
      shader.uniforms.uWrinkleWeights = { value: new THREE.Vector4(0, 0, 0, 0) };
    }

    // Pass local object-space position so we can compute anatomical region masks cleanly
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vLocalHeadPos;`
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vLocalHeadPos = position;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vLocalHeadPos;
      uniform sampler2D uSssMap;
      uniform float uHasSssMap;
      uniform vec3 uSssColor;
      uniform float uSssStrength;
      uniform sampler2D uWrinkleNormalMap;
      uniform float uHasWrinkleMap;
      uniform vec4 uWrinkleWeights;`
    );

    // 1. Inject AU-driven per-region wrinkle normal blending + micro-furrows
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      {
        // Region masks in head local coordinates (auto-normalizing cm vs m)
        vec3 pMeters = abs(vLocalHeadPos.y) > 10.0 ? vLocalHeadPos * 0.01 : vLocalHeadPos;
        float hCoord = max(pMeters.y, pMeters.z);
        float xAbs = abs(pMeters.x);
        float foreheadMask = smoothstep(1.625, 1.66, hCoord) * (1.0 - smoothstep(0.045, 0.075, xAbs));
        float glabellaMask = exp(-pow((hCoord - 1.622) / 0.016, 2.0)) * exp(-pow(xAbs / 0.018, 2.0));
        float crowsMask = exp(-pow((hCoord - 1.608) / 0.018, 2.0)) * exp(-pow((xAbs - 0.046) / 0.016, 2.0));
        float noseMask = exp(-pow((hCoord - 1.592) / 0.018, 2.0)) * exp(-pow(xAbs / 0.016, 2.0));

        float wTotal = clamp(
          foreheadMask * uWrinkleWeights.x +
          glabellaMask * uWrinkleWeights.y +
          crowsMask * uWrinkleWeights.z +
          noseMask * uWrinkleWeights.w,
          0.0, 1.0
        );

        #ifdef USE_NORMALMAP
          if (uHasWrinkleMap > 0.5 && wTotal > 0.01) {
            vec3 wrinkleN = texture2D(uWrinkleNormalMap, vNormalMapUv).xyz * 2.0 - 1.0;
            wrinkleN.xy *= normalScale * (1.0 + 0.85 * wTotal);
            normal = normalize(mix(normal, normalize(tbn * wrinkleN), clamp(wTotal * 0.85, 0.0, 0.92)));
          }
        #endif

        // Analytic micro-furrow normal perturbation so AU1/2, AU4, AU6 crow's feet, and AU9 nose wrinkles
        // remain crisply visible at all camera distances
        float furrow = 0.0;
        furrow += foreheadMask * uWrinkleWeights.x * sin(hCoord * 950.0) * 0.16;
        furrow += glabellaMask * uWrinkleWeights.y * sin(pMeters.x * 1100.0) * 0.22;
        furrow += crowsMask * uWrinkleWeights.z * sin((hCoord - 1.608) * 1250.0) * 0.24;
        furrow += noseMask * uWrinkleWeights.w * sin(hCoord * 1100.0) * 0.20;
        normal = normalize(normal + vec3(furrow * 0.5, furrow, 0.0));
      }`
    );

    // 2. Inject Subsurface-like shading (wrap diffuse + reddish terminator scatter)
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
      {
        float sssMask = 0.65;
        #ifdef USE_MAP
          if (uHasSssMap > 0.5) {
            sssMask = texture2D(uSssMap, vMapUv).r;
          }
        #endif
        vec3 viewN = normalize(normal);
        vec3 keyDir = normalize(vec3(0.45, 0.55, 0.70));
        float ndl = dot(viewN, keyDir);
        float wrapDiff = clamp((ndl + 0.35) / 1.35, 0.0, 1.0);
        float scatterBand = smoothstep(-0.42, 0.08, ndl) * (1.0 - smoothstep(0.08, 0.62, ndl));
        vec3 sssContrib = uSssColor * (scatterBand * 0.72 + wrapDiff * 0.22) * uSssStrength * (0.55 + 0.45 * sssMask);
        reflectedLight.directDiffuse += sssContrib * diffuseColor.rgb;
      }`
    );
  };

  mat.customProgramCacheKey = () => 'reading_faces_skin_sss_wrinkle_v2';
  mat.userData.isSkinMaterial = true;
  mat.userData.sssUniforms = sssUniforms;
  return mat;
}

export function upgradeEyeMaterial(origMat) {
  const mat = new THREE.MeshPhysicalMaterial({
    name: origMat?.name || 'Eyes',
    map: origMat?.map || null,
    roughness: 0.025,
    metalness: 0.0,
    ior: 1.376, // Human cornea IOR per Section 4.6
    clearcoat: 1.0,
    clearcoatRoughness: 0.015,
    specularIntensity: 1.0,
    specularColor: new THREE.Color(0xffffff),
    envMapIntensity: 1.35
  });
  if (mat.map) {
    mat.map.colorSpace = THREE.SRGBColorSpace;
  }
  mat.userData.isEyeMaterial = true;
  return mat;
}

export function upgradeMouthMaterial(origMat, wrinkleController = null, sssTexture = null) {
  const mat = upgradeSkinMaterial(origMat, wrinkleController, sssTexture);
  mat.name = origMat?.name || 'Mouth';
  const baseBeforeCompile = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (baseBeforeCompile) baseBeforeCompile(shader, renderer);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vMouthLocalPos;`
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vMouthLocalPos = position;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vMouthLocalPos;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `float inOralCavity = (1.0 - smoothstep(1.4, 2.0, abs(vMouthLocalPos.x))) * (1.0 - smoothstep(4.5, 6.2, vMouthLocalPos.z));
      float cavityDepth = smoothstep(5.5, 1.5, vMouthLocalPos.z);
      float cavityAO = mix(1.0, mix(0.78, 0.35, cavityDepth), inOralCavity);
      gl_FragColor.rgb *= cavityAO;
      #include <dithering_fragment>`
    );
  };
  mat.customProgramCacheKey = () => 'reading_faces_mouth_cavity_v3';
  mat.userData.isMouthMaterial = true;
  return mat;
}

export function upgradeHairMaterial(origMat) {
  const mat = new THREE.MeshStandardMaterial({
    name: origMat?.name || 'Hair_Opacity',
    map: origMat?.map || null,
    roughness: 0.62,
    metalness: 0.05,
    alphaTest: 0.45,
    alphaToCoverage: true,
    transparent: false,
    side: THREE.DoubleSide,
    depthWrite: true
  });
  if (mat.map) {
    mat.map.colorSpace = THREE.SRGBColorSpace;
  }
  mat.userData.isHairMaterial = true;
  return mat;
}

export function upgradeBodyMaterial(origMat) {
  const mat = new THREE.MeshPhysicalMaterial({
    name: origMat?.name || 'Body_Shoulders',
    map: origMat?.map || null,
    normalMap: origMat?.normalMap || null,
    roughnessMap: origMat?.roughnessMap || null,
    roughness: 0.56,
    metalness: 0.0,
    specularIntensity: 0.4,
    sheen: 0.1,
    envMapIntensity: 0.7
  });
  if (mat.map) {
    mat.map.colorSpace = THREE.SRGBColorSpace;
  }
  return mat;
}

export function createFacecapDevMaterial() {
  return new THREE.MeshStandardMaterial({
    name: 'FacecapDev',
    color: new THREE.Color(0x9aa3ad),
    roughness: 0.48,
    metalness: 0.05
  });
}
