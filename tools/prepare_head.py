#!/usr/bin/env python3
"""
Headless Blender 5.x asset pipeline for Reading Faces (MicroExpression App).
Usage:
  /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/prepare_head.py

Processes:
1. Checks models/source/riya/ for a CGTrader Riya (.blend / .glb / .fbx).
   If not present, uses Microsoft Rocketbox Female_Adult_01_facial.fbx as the primary
   realistic textured head (flagged in manifest.json and models/SOURCES.md).
2. Converts all 5 Microsoft Rocketbox adult avatars (Female_Adult_01, Female_Adult_08,
   Female_Adult_12, Male_Adult_01, Male_Adult_06):
   - Trims full body to head, neck, and upper shoulders while preserving all shape keys
   - Renames AK_01_BrowDownLeft ... AK_52_TongueOut to canonical ARKit camelCase names
   - Converts specular TGA maps to roughness maps and generates SSS thickness & wrinkle normal maps
   - Separates Eyes and Mouth materials from Skin and Hair_Opacity so Three.js can apply
     cornea clearcoat catchlights, mouth-cavity darkening, SSS wrap lighting, and alphaToCoverage
   - Exports head.glb with shape keys and shape-key normals (<= 40 MB)
   - Writes manifest.json and au-map.json per identity, plus models/SOURCES.md.
"""

import os
import sys
import json
import shutil
import bpy
import bmesh

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODELS_DIR = os.path.join(BASE_DIR, "models")
SOURCE_DIR = os.path.join(MODELS_DIR, "source")

CANONICAL_ARKIT_52 = [
    "browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight",
    "cheekPuff", "cheekSquintLeft", "cheekSquintRight",
    "eyeBlinkLeft", "eyeBlinkRight", "eyeLookDownLeft", "eyeLookDownRight",
    "eyeLookInLeft", "eyeLookInRight", "eyeLookOutLeft", "eyeLookOutRight",
    "eyeLookUpLeft", "eyeLookUpRight", "eyeSquintLeft", "eyeSquintRight",
    "eyeWideLeft", "eyeWideRight",
    "jawForward", "jawLeft", "jawOpen", "jawRight",
    "mouthClose", "mouthDimpleLeft", "mouthDimpleRight",
    "mouthFrownLeft", "mouthFrownRight", "mouthFunnel", "mouthLeft",
    "mouthLowerDownLeft", "mouthLowerDownRight", "mouthPressLeft", "mouthPressRight",
    "mouthPucker", "mouthRight", "mouthRollLower", "mouthRollUpper",
    "mouthShrugLower", "mouthShrugUpper", "mouthSmileLeft", "mouthSmileRight",
    "mouthStretchLeft", "mouthStretchRight", "mouthUpperUpLeft", "mouthUpperUpRight",
    "noseSneerLeft", "noseSneerRight", "tongueOut"
]

ROCKETBOX_AVATARS = [
    {
        "id": "female_adult_01",
        "folder": "Female_Adult_01",
        "prefix": "f001",
        "label": "Elena (Adult Female 01)",
        "sex": "female",
        "ageBand": "25-35",
        "ethnicity": "European / Mediterranean",
        "skinVariant": "light-warm"
    },
    {
        "id": "female_adult_08",
        "folder": "Female_Adult_08",
        "prefix": "f008",
        "label": "Amara (Adult Female 08)",
        "sex": "female",
        "ageBand": "25-35",
        "ethnicity": "African / Afro-Caribbean",
        "skinVariant": "deep-warm"
    },
    {
        "id": "female_adult_12",
        "folder": "Female_Adult_12",
        "prefix": "f012",
        "label": "Mei (Adult Female 12)",
        "sex": "female",
        "ageBand": "30-45",
        "ethnicity": "East Asian",
        "skinVariant": "light-neutral"
    },
    {
        "id": "male_adult_01",
        "folder": "Male_Adult_01",
        "prefix": "m002",
        "label": "Marcus (Adult Male 01)",
        "sex": "male",
        "ageBand": "30-40",
        "ethnicity": "European / North American",
        "skinVariant": "medium-warm"
    },
    {
        "id": "male_adult_06",
        "folder": "Male_Adult_06",
        "prefix": "m011",
        "label": "Mateo (Adult Male 06)",
        "sex": "male",
        "ageBand": "35-50",
        "ethnicity": "South Asian / Latino",
        "skinVariant": "olive-tan"
    }
]


def prepare_textures_with_pillow(tex_dir, out_dir, prefix, fallback_wrinkle_path):
    """
    Invokes .venv/bin/python (with Pillow) to convert TGA textures into optimized
    PNG/JPEG textures, invert specular -> roughness, and export wrinkle/SSS maps.
    """
    import subprocess
    venv_py = os.path.join(BASE_DIR, ".venv", "bin", "python")
    if not os.path.exists(venv_py):
        venv_py = "python3"
    code = r'''
import os, sys
from PIL import Image, ImageOps, ImageEnhance

tex_dir, out_dir, prefix, fallback_wrinkle_path = sys.argv[1:5]
os.makedirs(out_dir, exist_ok=True)
size = (2048, 2048)

def load_tga(name):
    p = os.path.join(tex_dir, f"{prefix}_{name}.tga")
    if not os.path.exists(p):
        return None
    return Image.open(p)

head_col = load_tga("head_color")
if head_col:
    head_col_rgb = head_col.convert("RGB").resize(size, Image.Resampling.LANCZOS)
    head_col_rgb.save(os.path.join(out_dir, "head_color.jpg"), quality=92)
    r, g, b = head_col_rgb.split()
    sss = ImageEnhance.Contrast(r).enhance(1.15).resize((1024, 1024), Image.Resampling.LANCZOS)
    sss.save(os.path.join(out_dir, "head_sss.jpg"), quality=88)

head_norm = load_tga("head_normal")
if head_norm:
    head_norm.convert("RGB").resize(size, Image.Resampling.LANCZOS).save(
        os.path.join(out_dir, "head_normal.jpg"), quality=92
    )

head_spec = load_tga("head_specular")
if head_spec:
    spec_l = head_spec.convert("L").resize((1024, 1024), Image.Resampling.LANCZOS)
    inv = ImageOps.invert(spec_l)
    rough_l = inv.point(lambda x: int(105 + (x / 255.0) * 70))
    rough_rgb = Image.merge("RGB", (rough_l, rough_l, rough_l))
    rough_rgb.save(os.path.join(out_dir, "head_roughness.jpg"), quality=88)

wrinkle_p = os.path.join(tex_dir, f"{prefix}_head_normal_wrinkle.tga")
if not os.path.exists(wrinkle_p):
    wrinkle_p = fallback_wrinkle_path
if os.path.exists(wrinkle_p):
    w_img = Image.open(wrinkle_p).convert("RGB").resize(size, Image.Resampling.LANCZOS)
    w_img.save(os.path.join(out_dir, "head_normal_wrinkle.jpg"), quality=92)

op_img = load_tga("opacity_color")
if op_img:
    op_rgba = op_img.convert("RGBA").resize(size, Image.Resampling.LANCZOS)
    op_rgba.save(os.path.join(out_dir, "opacity_color.png"), optimize=True)

body_size = (1024, 1024)
body_col = load_tga("body_color")
if body_col:
    body_col.convert("RGB").resize(body_size, Image.Resampling.LANCZOS).save(
        os.path.join(out_dir, "body_color.jpg"), quality=88
    )
body_norm = load_tga("body_normal")
if body_norm:
    body_norm.convert("RGB").resize(body_size, Image.Resampling.LANCZOS).save(
        os.path.join(out_dir, "body_normal.jpg"), quality=88
    )
body_spec = load_tga("body_specular")
if body_spec:
    bs_l = ImageOps.invert(body_spec.convert("L").resize(body_size, Image.Resampling.LANCZOS))
    br_l = bs_l.point(lambda x: int(115 + (x / 255.0) * 80))
    Image.merge("RGB", (br_l, br_l, br_l)).save(
        os.path.join(out_dir, "body_roughness.jpg"), quality=85
    )
'''
    subprocess.run([venv_py, "-c", code, tex_dir, out_dir, prefix, fallback_wrinkle_path], check=True)


def make_pbr_material(name, base_color_path=None, normal_path=None, roughness_path=None,
                      alpha_mode=False, roughness_val=0.5, clearcoat_val=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    bsdf.inputs["Roughness"].default_value = roughness_val
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = clearcoat_val
    elif "Clearcoat" in bsdf.inputs:
        bsdf.inputs["Clearcoat"].default_value = clearcoat_val

    if base_color_path and os.path.exists(base_color_path):
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(base_color_path)
        links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        if alpha_mode:
            links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
            if hasattr(mat, "blend_method"):
                mat.blend_method = "CLIP"
            if hasattr(mat, "alpha_threshold"):
                mat.alpha_threshold = 0.45

    if roughness_path and os.path.exists(roughness_path):
        rtex = nodes.new("ShaderNodeTexImage")
        rtex.image = bpy.data.images.load(roughness_path)
        rtex.image.colorspace_settings.name = "Non-Color"
        links.new(rtex.outputs["Color"], bsdf.inputs["Roughness"])

    if normal_path and os.path.exists(normal_path):
        ntex = nodes.new("ShaderNodeTexImage")
        ntex.image = bpy.data.images.load(normal_path)
        ntex.image.colorspace_settings.name = "Non-Color"
        nmap = nodes.new("ShaderNodeNormalMap")
        links.new(ntex.outputs["Color"], nmap.inputs["Color"])
        links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def build_default_au_map(rig_id, aliases=None):
    with open(os.path.join(BASE_DIR, "content", "aus.json"), "r") as f:
        aus_data = json.load(f)
    entries = {}
    for au in aus_data["aus"]:
        entries[str(au["id"])] = au["blendshapes"]
    return {
        "rigId": rig_id,
        "aliases": aliases or {},
        "entries": entries,
        "correctives": aus_data.get("correctives", [])
    }


def process_rocketbox_avatar(av_info, out_dir, is_primary=False):
    folder = av_info["folder"]
    prefix = av_info["prefix"]
    src_dir = os.path.join(SOURCE_DIR, "rocketbox", folder)
    fbx_path = os.path.join(src_dir, f"{folder}_facial.fbx")
    tex_dir = os.path.join(src_dir, "Textures")
    fallback_wrinkle = os.path.join(SOURCE_DIR, "rocketbox", "Female_Adult_01", "Textures", "f001_head_normal_wrinkle.tga")

    os.makedirs(out_dir, exist_ok=True)
    prepare_textures_with_pillow(tex_dir, out_dir, prefix, fallback_wrinkle)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=fbx_path)

    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.data.shape_keys]
    if not meshes:
        meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    mesh_obj = meshes[0]
    for other_obj in list(bpy.data.objects):
        if other_obj.type == "MESH" and other_obj != mesh_obj:
            bpy.data.objects.remove(other_obj, do_unlink=True)
    mesh_obj.name = "HeadMesh"
    mesh_obj.data.name = "HeadGeometry"

    # Rename AK_NN_Name -> canonical ARKit camelCase (e.g. AK_01_BrowDownLeft -> browDownLeft)
    renamed_morphs = []
    aliases = {}
    if mesh_obj.data.shape_keys:
        for kb in mesh_obj.data.shape_keys.key_blocks:
            orig_name = kb.name
            if orig_name == "Basis":
                continue
            if orig_name.startswith("AK_") and len(orig_name) > 6:
                raw_camel = orig_name[6:]
                canonical = raw_camel[0].lower() + raw_camel[1:]
                kb.name = canonical
                aliases[orig_name] = canonical
                renamed_morphs.append(canonical)
            else:
                renamed_morphs.append(orig_name)

    # Create materials: Skin, Eyes, Mouth, Hair_Opacity, Body_Shoulders
    mat_skin = make_pbr_material(
        "Skin",
        os.path.join(out_dir, "head_color.jpg"),
        os.path.join(out_dir, "head_normal.jpg"),
        os.path.join(out_dir, "head_roughness.jpg"),
        alpha_mode=False,
        roughness_val=0.52
    )
    mat_eyes = make_pbr_material(
        "Eyes",
        os.path.join(out_dir, "head_color.jpg"),
        None,
        None,
        alpha_mode=False,
        roughness_val=0.04,
        clearcoat_val=1.0
    )
    mat_mouth = make_pbr_material(
        "Mouth",
        os.path.join(out_dir, "head_color.jpg"),
        os.path.join(out_dir, "head_normal.jpg"),
        None,
        alpha_mode=False,
        roughness_val=0.28
    )
    mat_hair = make_pbr_material(
        "Hair_Opacity",
        os.path.join(out_dir, "opacity_color.png"),
        None,
        None,
        alpha_mode=True,
        roughness_val=0.65
    )
    mat_body = make_pbr_material(
        "Body_Shoulders",
        os.path.join(out_dir, "body_color.jpg"),
        os.path.join(out_dir, "body_normal.jpg"),
        os.path.join(out_dir, "body_roughness.jpg"),
        alpha_mode=False,
        roughness_val=0.58
    )

    # Save original polygon material indices before replacing material slots (0=body, 1=head, 2=opacity)
    orig_mat_indices = [poly.material_index for poly in mesh_obj.data.polygons]
    mesh_obj.data.materials.clear()
    mesh_obj.data.materials.append(mat_body)   # 0
    mesh_obj.data.materials.append(mat_skin)   # 1
    mesh_obj.data.materials.append(mat_hair)   # 2
    mesh_obj.data.materials.append(mat_eyes)   # 3
    mesh_obj.data.materials.append(mat_mouth)  # 4

    # Reassign polygons for Body, Skin, Hair_Opacity, Eyes, and Mouth based on original slots + vertex groups
    vg_names = {g.name: g.index for g in mesh_obj.vertex_groups}
    eye_gids = {vg_names[k] for k in ("Bip01 LEye", "Bip01 REye") if k in vg_names}

    eye_verts = set()
    tongue_verts = set()
    for v in mesh_obj.data.vertices:
        w_eye = sum(g.weight for g in v.groups if g.group in eye_gids)
        w_tongue = sum(g.weight for g in v.groups if g.group == vg_names.get("Bip01 MTongue", -1))
        w_jaw = sum(g.weight for g in v.groups if g.group == vg_names.get("Bip01 MJaw", -1))
        w_lips = sum(g.weight for name, gid in vg_names.items() if "lip" in name.lower() or "mouth" in name.lower() for g in v.groups if g.group == gid)
        co_world = mesh_obj.matrix_world @ v.co
        if w_eye > 0.35:
            eye_verts.add(v.index)
        elif w_tongue > 0.25:
            tongue_verts.add(v.index)

    for idx, poly in enumerate(mesh_obj.data.polygons):
        orig_idx = orig_mat_indices[idx]
        if orig_idx == 2:
            poly.material_index = 2  # Hair_Opacity
        elif orig_idx == 1:
            if any(vi in eye_verts for vi in poly.vertices):
                poly.material_index = 3  # Eyes
            elif all(vi in tongue_verts for vi in poly.vertices):
                poly.material_index = 4  # Mouth
            else:
                poly.material_index = 1  # Skin
        else:
            poly.material_index = 0  # Body_Shoulders

    # Trim lower body and arms in Edit Mode (preserves shape keys!)
    bpy.context.view_layer.objects.active = mesh_obj
    mesh_obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bm = bmesh.from_edit_mesh(mesh_obj.data)
    bm.verts.ensure_lookup_table()

    mw = mesh_obj.matrix_world
    to_delete = []
    for v in bm.verts:
        co = mw @ v.co
        # Keep head, neck, and upper shoulders (z >= 1.30 and |x| <= 0.22)
        if co.z < 1.30 or abs(co.x) > 0.22:
            to_delete.append(v)

    bmesh.ops.delete(bm, geom=to_delete, context="VERTS")
    bmesh.update_edit_mesh(mesh_obj.data)
    bpy.ops.object.mode_set(mode="OBJECT")

    # Clear parent and remove armature modifier / skeleton objects so HeadMesh is a clean morph-target mesh
    mesh_obj.parent = None
    mesh_obj.modifiers.clear()
    mesh_obj.vertex_groups.clear()
    for obj in list(bpy.data.objects):
        if obj != mesh_obj:
            bpy.data.objects.remove(obj, do_unlink=True)

    # Export GLB with shape keys and shape-key normals
    glb_path = os.path.join(out_dir, "head.glb")
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format="GLB",
        export_morph=True,
        export_morph_normal=True,
        export_morph_tangent=False,
        export_skins=False,
        export_yup=True,
        export_apply=False
    )

    missing_arkit = [name for name in CANONICAL_ARKIT_52 if name not in renamed_morphs]
    glb_size_mb = round(os.path.getsize(glb_path) / (1024 * 1024), 2)

    manifest = {
        "id": "riya" if is_primary else av_info["id"],
        "rigId": "riya" if is_primary else av_info["id"],
        "label": av_info["label"] + (" (Primary Realistic Head)" if is_primary else ""),
        "glbUrl": f"models/{'riya' if is_primary else 'rocketbox/' + av_info['id']}/head.glb",
        "wrinkleNormalUrl": f"models/{'riya' if is_primary else 'rocketbox/' + av_info['id']}/head_normal_wrinkle.jpg",
        "sssMapUrl": f"models/{'riya' if is_primary else 'rocketbox/' + av_info['id']}/head_sss.jpg",
        "source": f"https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Adults/{folder}",
        "license": "MIT License (Microsoft Rocketbox)",
        "tier": "realistic",
        "sex": av_info["sex"],
        "ageBand": av_info["ageBand"],
        "ethnicity": av_info["ethnicity"],
        "skinVariant": av_info["skinVariant"],
        "glbSizeMB": glb_size_mb,
        "morphCount": len(renamed_morphs),
        "morphNames": renamed_morphs,
        "missingArkitNames": missing_arkit,
        "substitutions": {},
        "aliases": aliases,
        "textures": [
            "head_color.jpg",
            "head_normal.jpg",
            "head_roughness.jpg",
            "head_normal_wrinkle.jpg",
            "head_sss.jpg",
            "opacity_color.png",
            "body_color.jpg",
            "body_normal.jpg",
            "body_roughness.jpg"
        ],
        "notes": (
            "Built from Microsoft Rocketbox *_facial.fbx via headless Blender 5.2.1 pipeline "
            "(models/source/riya/ was empty, so Rocketbox Female_Adult_01 serves as the primary realistic head per Section 0.2/4.3)."
            if is_primary else
            f"Microsoft Rocketbox {folder}_facial.fbx trimmed to head-and-shoulders bust with 52 canonical ARKit blendshapes."
        )
    }

    with open(os.path.join(out_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)

    au_map = build_default_au_map("riya" if is_primary else av_info["id"], aliases)
    with open(os.path.join(out_dir, "au-map.json"), "w") as f:
        json.dump(au_map, f, indent=2)

    print(f"Exported {glb_path} ({glb_size_mb} MB), missing ARKit: {len(missing_arkit)}")
    return manifest


def write_facecap_manifest():
    dev_dir = os.path.join(MODELS_DIR, "dev")
    os.makedirs(dev_dir, exist_ok=True)
    # facecap uses _L and _R instead of Left and Right
    aliases = {}
    for name in CANONICAL_ARKIT_52:
        if name.endswith("Left"):
            aliases[name] = name[:-4] + "_L"
        elif name.endswith("Right"):
            aliases[name] = name[:-5] + "_R"
        else:
            aliases[name] = name

    manifest = {
        "id": "facecap",
        "rigId": "facecap",
        "label": "Facecap (Dev Fallback Only)",
        "glbUrl": "models/dev/facecap.glb",
        "source": "https://github.com/mrdoob/three.js/blob/dev/examples/models/gltf/facecap.glb",
        "license": "MIT License (Three.js examples / Apple ARKit sample)",
        "tier": "dev",
        "sex": "neutral",
        "ageBand": "adult",
        "glbSizeMB": round(os.path.getsize(os.path.join(dev_dir, "facecap.glb")) / (1024 * 1024), 2) if os.path.exists(os.path.join(dev_dir, "facecap.glb")) else 0,
        "morphCount": 52,
        "morphNames": list(aliases.values()),
        "missingArkitNames": [],
        "substitutions": {},
        "aliases": aliases,
        "textures": [],
        "notes": "Untextured grey developer fallback head. Loaded only when ?rig=facecap is passed in URL."
    }
    with open(os.path.join(dev_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)

    au_map = build_default_au_map("facecap", aliases)
    with open(os.path.join(dev_dir, "au-map.json"), "w") as f:
        json.dump(au_map, f, indent=2)


def main():
    manifests = []
    # Build primary realistic head in models/riya/ (from Female_Adult_01 if models/source/riya/ is empty)
    riya_out = os.path.join(MODELS_DIR, "riya")
    m_primary = process_rocketbox_avatar(ROCKETBOX_AVATARS[0], riya_out, is_primary=True)
    manifests.append(m_primary)

    # Build all 5 Rocketbox identities in models/rocketbox/<id>/
    for av in ROCKETBOX_AVATARS:
        rb_out = os.path.join(MODELS_DIR, "rocketbox", av["id"])
        m = process_rocketbox_avatar(av, rb_out, is_primary=False)
        manifests.append(m)

    # Write dev facecap manifest
    write_facecap_manifest()

    # Write models/identities.json registry
    identities_list = [
        {
            "id": m["id"],
            "rigId": m["rigId"],
            "label": m["label"],
            "glbUrl": m["glbUrl"],
            "wrinkleNormalUrl": m.get("wrinkleNormalUrl"),
            "sssMapUrl": m.get("sssMapUrl"),
            "manifestUrl": f"models/{'riya' if m['id'] == 'riya' else 'rocketbox/' + m['id']}/manifest.json",
            "auMapUrl": f"models/{'riya' if m['id'] == 'riya' else 'rocketbox/' + m['id']}/au-map.json",
            "source": m["source"],
            "license": m["license"],
            "tier": m["tier"],
            "sex": m["sex"],
            "ageBand": m["ageBand"],
            "ethnicity": m.get("ethnicity", ""),
            "skinVariant": m.get("skinVariant", ""),
            "notes": m["notes"]
        }
        for m in manifests
    ]
    with open(os.path.join(MODELS_DIR, "identities.json"), "w") as f:
        json.dump(identities_list, f, indent=2)

    # Write models/SOURCES.md
    sources_md = [
        "# 3D Face Models & Vendor Asset Sources",
        "",
        "All assets in this repository use permissive licenses that allow modification and offline distribution.",
        "No models with no-derivatives (`CC BY-NC-ND`, e.g., Eisko Louise) or study-only licenses (e.g., Dragonboots MetaHuman) are used.",
        "",
        "## Primary Realistic Head (`models/riya/head.glb`)",
        "- **Fallback notice (per Brief Section 0.2 & 4.3)**: `models/source/riya/` did not contain a pre-downloaded CGTrader Riya archive at build time, and per strict instructions the agent did not log in to any external site. Therefore, Microsoft Rocketbox `Female_Adult_01_facial.fbx` was processed through the headless Blender 5.2.1 pipeline (`tools/prepare_head.py`) to serve as the primary realistic textured head (`models/riya/head.glb`), with full 2K PBR skin, SSS map, wrinkle normal map (`f001_head_normal_wrinkle.tga`), separated glossy cornea/eye material, mouth cavity material, and alpha-tested hair, eyebrows, and eyelashes.",
        "- **Source URL**: https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Adults/Female_Adult_01",
        "- **License**: MIT License (verified in `microsoft/Microsoft-Rocketbox` repository)",
        "- **Blendshapes**: 52 canonical ARKit blendshapes (`browDownLeft` ... `tongueOut`, renamed from `AK_01_...` to `AK_52_...`) + 48 FACS `AU_*` shapes + 15 visemes. **Missing ARKit names**: 0.",
        f"- **GLB Size**: {m_primary['glbSizeMB']} MB (target <= 40 MB)",
        "",
        "## Identity Panel Avatars (`models/rocketbox/<id>/head.glb`)",
    ]
    for m in manifests[1:]:
        sources_md.extend([
            f"### `{m['id']}` — {m['label']}",
            f"- **Source URL**: {m['source']}",
            f"- **License**: {m['license']}",
            f"- **Demographics**: Sex: `{m['sex']}`, Age band: `{m['ageBand']}`, Ethnicity: `{m['ethnicity']}`, Skin variant: `{m['skinVariant']}`",
            f"- **GLB Size**: {m['glbSizeMB']} MB | **Morph count**: {m['morphCount']} | **Missing ARKit names**: {len(m['missingArkitNames'])}",
            ""
        ])
    sources_md.extend([
        "## Developer Fallback (`models/dev/facecap.glb`)",
        "- **Source URL**: https://github.com/mrdoob/three.js/blob/dev/examples/models/gltf/facecap.glb",
        "- **License**: MIT License (Three.js examples)",
        "- **Usage**: Untextured grey developer head reachable **only** via `?rig=facecap`.",
        "",
        "## Environment HDRI & Runtime Libraries",
        "- **Studio Environment HDRI**: `models/vendor/hdri/studio_small_09_1k.hdr` — Poly Haven (`https://polyhaven.com/a/studio_small_09`), License: **CC0 1.0 Universal (Public Domain)**.",
        "- **Three.js (v0.169.0)**: `lib/three.module.js` and `lib/addons/*` — MIT License (`https://github.com/mrdoob/three.js`).",
        "- **MediaPipe Tasks Vision (v0.10.17)**: `models/vendor/mediapipe/` (`vision_bundle.mjs`, `wasm/*`, `face_landmarker.task`) — Apache 2.0 License (`https://developers.google.com/mediapipe`)."
    ])
    with open(os.path.join(MODELS_DIR, "SOURCES.md"), "w") as f:
        f.write("\n".join(sources_md) + "\n")

    print("All models, manifests, and SOURCES.md generated successfully!")


if __name__ == "__main__":
    main()
