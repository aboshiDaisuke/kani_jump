"""カニジャンプ 3D 素材ビルドスクリプト

Blender をバックグラウンドで起動し、ゲームで使う 3D モデル (glb) を生成する。
(2D 画像は art/gen.sh で Codex に生成させる)

    blender -b -P blender/build_assets.py -- <モデル出力先>

座標系: Blender は Z が上、-Y が「正面」。glTF 書き出し時に Y が上へ変換され、
Blender の -Y は three.js の +Z (カメラ側) になる。
"""

import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
MODEL_DIR = os.path.abspath(argv[0] if len(argv) > 0 else "src/models")
os.makedirs(MODEL_DIR, exist_ok=True)


# ---------------------------------------------------------------------------
# 共通ヘルパー
# ---------------------------------------------------------------------------

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_mat(name, color, rough=0.5, metal=0.0, emit=None, emit_strength=0.0, sheen=0.0):
    """Principled BSDF マテリアルを作る (color はリニア RGB)。"""
    m = bpy.data.materials.new(name)
    if m.node_tree is None:
        m.use_nodes = True
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        out = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None)
        if out is None:
            out = nt.nodes.new("ShaderNodeOutputMaterial")
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit is not None:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    if sheen > 0:
        # 毛糸・フェルトのような布の光沢 (glTF では KHR_materials_sheen になる)
        bsdf.inputs["Sheen Weight"].default_value = sheen
        bsdf.inputs["Sheen Roughness"].default_value = 0.5
        bsdf.inputs["Sheen Tint"].default_value = (1.0, 1.0, 1.0, 1.0)
    m.diffuse_color = (*color, 1.0)
    return m


def _finish(obj, name, material, smooth, parent):
    obj.name = name
    obj.data.name = name
    if material is not None:
        obj.data.materials.append(material)
    if smooth:
        bpy.ops.object.shade_smooth()
    if parent is not None:
        set_parent(obj, parent)
    return obj


def set_parent(obj, parent):
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world


def empty(name, loc=(0, 0, 0), parent=None):
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=loc)
    o = bpy.context.active_object
    o.name = name
    if parent is not None:
        bpy.context.view_layer.update()
        set_parent(o, parent)
    return o


def sphere(name, loc, scale, material, parent=None, rot=(0, 0, 0), segs=32, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=1.0, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = scale
    return _finish(o, name, material, True, parent)


def box(name, loc, half, material, parent=None, bevel=0.0, smooth=False):
    bpy.ops.mesh.primitive_cube_add(size=2.0, location=loc)
    o = bpy.context.active_object
    o.scale = half
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = o.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        mod.limit_method = "ANGLE"
        smooth = True
    o = _finish(o, name, material, smooth, parent)
    if bevel > 0:
        # ベベル部分だけ滑らかにして平面はフラットに見せる
        try:
            bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
        except Exception:
            pass
    return o


def rod(name, p1, p2, radius, material, parent=None, verts=16):
    """p1 から p2 へ伸びる円柱。"""
    p1, p2 = Vector(p1), Vector(p2)
    d = p2 - p1
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=d.length, location=(p1 + p2) / 2)
    o = bpy.context.active_object
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = d.to_track_quat("Z", "Y")
    return _finish(o, name, material, True, parent)


def wheel(name, loc, radius, width, tire_mat, hub_mat, parent=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=width, location=loc, rotation=(0, math.pi / 2, 0))
    t = _finish(bpy.context.active_object, name, tire_mat, True, parent)
    side = 1 if loc[0] > 0 else -1
    hub_loc = (loc[0] + side * (width / 2), loc[1], loc[2])
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=radius * 0.55, depth=0.04, location=hub_loc, rotation=(0, math.pi / 2, 0))
    _finish(bpy.context.active_object, name + "Hub", hub_mat, False, parent)
    return t


def export_glb(filename):
    bpy.context.view_layer.update()
    path = os.path.join(MODEL_DIR, filename)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
    )
    print(f"[kani] exported {path}")


# ---------------------------------------------------------------------------
# カニ (Flutter 版の「カニ 1 号」= 毛糸のポンポン + フェルトのハサミと脚 + 動く目)
# ---------------------------------------------------------------------------

BODY_R = 0.62
BODY_C = Vector((0, 0, BODY_R))


def apply_modifiers(obj):
    bpy.context.view_layer.objects.active = obj
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def chaikin(points, iterations=3):
    """閉じた折れ線の角を削って丸める (はさみで切ったフェルトの丸み)。"""
    for _ in range(iterations):
        out = []
        for i, p in enumerate(points):
            q = points[(i + 1) % len(points)]
            out.append((0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]))
            out.append((0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]))
        points = out
    return points


def flat_piece(name, outline, pivot, angle, side, thickness, material, parent, size=1.0):
    """2D の輪郭 (u: 外向き, v: 上向き) から、正面を向いた平たいフェルトの部品を作る。

    pivot を根元にして angle (度) だけ上に傾け、side=-1 なら左右反転する。
    """
    a = math.radians(angle)
    verts = []
    for u, v in chaikin([(u * size, v * size) for u, v in outline]):
        x = u * math.cos(a) - v * math.sin(a)
        z = u * math.sin(a) + v * math.cos(a)
        verts.append((pivot[0] + side * x, pivot[1], pivot[2] + z))
    if side < 0:
        verts.reverse()  # 反転すると面の向きが裏返るので並びを逆にする
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], [list(range(len(verts)))])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    sol = obj.modifiers.new("Solidify", "SOLIDIFY")
    sol.thickness = thickness
    sol.offset = 0.0
    bev = obj.modifiers.new("Bevel", "BEVEL")
    bev.width = thickness * 0.35
    bev.segments = 2
    mesh.materials.append(material)
    apply_modifiers(obj)
    set_parent(obj, parent)
    return obj


def build_kani():
    yarn = make_mat("Yarn", (0.72, 0.62, 0.26), rough=1.0, sheen=1.0)
    felt_red = make_mat("FeltRed", (0.3, 0.004, 0.008), rough=1.0, sheen=0.5)
    felt_white = make_mat("FeltWhite", (0.86, 0.85, 0.8), rough=1.0, sheen=0.6)
    eye_white = make_mat("EyeWhite", (0.86, 0.86, 0.86), rough=0.35)
    eye_dome = make_mat("EyeDome", (0.9, 0.92, 0.95), rough=0.03)  # ゲーム側で半透明にする
    pupil = make_mat("Pupil", (0.006, 0.006, 0.008), rough=0.25)

    root = empty("Kani")

    # --- 体: 毛糸のポンポン (細かいデコボコ + ゆるいふくらみ) ---
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=5, radius=BODY_R, location=BODY_C)
    body = bpy.context.active_object
    lumps = bpy.data.textures.new("YarnLumps", "CLOUDS")
    lumps.noise_scale = 0.22
    fuzz = bpy.data.textures.new("YarnFuzz", "CLOUDS")
    fuzz.noise_scale = 0.03
    fuzz.noise_depth = 2
    for tex, strength in ((lumps, 0.05), (fuzz, 0.02)):
        d = body.modifiers.new(tex.name, "DISPLACE")
        d.texture = tex
        d.strength = strength
        d.mid_level = 0.5
    body.scale = (1.0, 1.0, 1.04)
    apply_modifiers(body)
    _finish(body, "Body", yarn, True, root)

    # --- 動く目 (目玉シール): 白い台紙 + 透明なドーム + 中で転がる黒目 ---
    # 黒目は PupilPosX / PupilNegX を軸にした別部品にして、ゲーム側で転がす
    face = Vector((0, -1, 0.75)).normalized()  # 目の向き (正面やや上)
    q = face.to_track_quat("Z", "Y")
    for sx, label in ((-1, "PupilNegX"), (1, "PupilPosX")):
        d = Vector((sx * 0.22, -0.16, 0.96)).normalized()
        c = BODY_C + d * (BODY_R + 0.15)  # 毛の外側に乗せる (埋もれると黒目が見えない)
        for name, mat, scale in ((f"EyeBase{sx:+d}", eye_white, (0.155, 0.155, 0.045)),
                                 (f"EyeDome{sx:+d}", eye_dome, (0.162, 0.162, 0.1))):
            bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1.0, location=c)
            e = bpy.context.active_object
            e.rotation_mode = "QUATERNION"
            e.rotation_quaternion = q
            e.scale = scale
            _finish(e, name, mat, True, root)
        pivot = empty(label, c, root)
        pivot.rotation_mode = "QUATERNION"
        pivot.rotation_quaternion = q
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1.0, location=c + face * 0.05)
        pp = bpy.context.active_object
        pp.rotation_mode = "QUATERNION"
        pp.rotation_quaternion = q
        pp.scale = (0.1, 0.1, 0.016)
        _finish(pp, f"Pupil{sx:+d}", pupil, True, None)
        bpy.context.view_layer.update()
        set_parent(pp, pivot)

    # --- 口: 白いフェルトの弧。体の丸みに沿わせて貼る ---
    r_mid, n = 0.78, 32
    zc = BODY_C.z + 0.17 + r_mid  # 弧のいちばん下が体の中心より少し上に来る
    verts = []
    for i in range(n + 1):
        k = i / n
        th = math.radians(236 + 68 * k)  # 大きな円の下側だけ = 浅いにっこり口
        half = 0.064 * (1 - 0.5 * (2 * k - 1) ** 4)  # 端だけ少し細く
        for r in (r_mid + half, r_mid - half):
            verts.append((r * math.cos(th), -1.2, zc + r * math.sin(th)))
    faces = [(2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1) for i in range(n)]
    mesh = bpy.data.meshes.new("Smile")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    smile = bpy.data.objects.new("Smile", mesh)
    bpy.context.scene.collection.objects.link(smile)
    # 毛のデコボコの外側にある、なめらかな仮の球へ投影する
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=BODY_R + 0.1, location=BODY_C)
    proxy = bpy.context.active_object
    sw = smile.modifiers.new("Wrap", "SHRINKWRAP")
    sw.target = proxy
    sw.wrap_method = "PROJECT"
    sw.use_project_y = True
    sw.use_negative_direction = True
    sw.use_positive_direction = True
    sub = smile.modifiers.new("Subdiv", "SUBSURF")
    sub.levels = 1
    sol = smile.modifiers.new("Solidify", "SOLIDIFY")
    sol.thickness = 0.03
    sol.offset = 0.0
    smile.data.materials.append(felt_white)
    apply_modifiers(smile)
    bpy.data.objects.remove(proxy, do_unlink=True)
    bpy.context.view_layer.objects.active = smile
    smile.select_set(True)
    bpy.ops.object.shade_smooth()
    set_parent(smile, root)

    # --- 脚: 3 本指のフェルト (下の左右) ---
    leg = [(0.0, 0.16), (0.36, 0.18), (0.68, 0.34), (0.76, 0.28), (0.52, 0.09), (0.82, 0.06),
           (0.82, -0.05), (0.52, -0.08), (0.7, -0.27), (0.62, -0.33), (0.34, -0.17), (0.0, -0.16)]
    for sx in (-1, 1):
        flat_piece(f"Leg{sx:+d}", leg, (sx * 0.5, 0.18, BODY_C.z - 0.14), -20, sx, 0.05, felt_red, root, size=0.85)

    # --- ハサミ: V 字の切れこみのあるフェルト (上の左右)。肩を軸に動かせるようにする ---
    claw = [(0.0, -0.14), (0.3, -0.22), (0.58, -0.24), (0.8, -0.17), (0.94, -0.06),
            (0.96, 0.03), (0.6, 0.08), (0.86, 0.22), (0.84, 0.32), (0.68, 0.38),
            (0.48, 0.35), (0.28, 0.25), (0.0, 0.14)]
    for sx, label in ((1, "ClawPosX"), (-1, "ClawNegX")):
        shoulder = (sx * 0.48, 0.18, BODY_C.z + 0.26)
        pivot = empty(label, shoulder, root)
        flat_piece(f"Claw{sx:+d}", claw, shoulder, 24, sx, 0.055, felt_red, pivot, size=0.85)

    return root


# ---------------------------------------------------------------------------
# 車
# ---------------------------------------------------------------------------

def vehicle_mats():
    return dict(
        paint=make_mat("Paint", (0.9, 0.9, 0.9), rough=0.3, metal=0.1),
        glass=make_mat("Glass", (0.02, 0.05, 0.09), rough=0.08, metal=0.3),
        tire=make_mat("Tire", (0.015, 0.015, 0.015), rough=0.9),
        hub=make_mat("Hub", (0.6, 0.6, 0.62), rough=0.3, metal=0.8),
        trim=make_mat("Trim", (0.04, 0.04, 0.045), rough=0.6),
        head=make_mat("Headlight", (1.0, 0.95, 0.7), rough=0.2, emit=(1.0, 0.92, 0.65), emit_strength=4.0),
        tail=make_mat("Taillight", (0.8, 0.02, 0.02), rough=0.3, emit=(1.0, 0.05, 0.03), emit_strength=2.0),
    )


def build_car():
    """乗用車 (全長 3.4 / 全幅 1.7 / 全高 約 1.35)。正面は -Y。"""
    m = vehicle_mats()
    root = empty("Car")
    box("CarBody", (0, 0, 0.56), (0.85, 1.7, 0.34), m["paint"], root, bevel=0.14)
    box("CarCabin", (0, 0.18, 1.08), (0.72, 0.92, 0.27), m["paint"], root, bevel=0.12)
    box("Windshield", (0, -0.75, 1.08), (0.64, 0.015, 0.2), m["glass"], root)
    box("RearWindow", (0, 1.11, 1.08), (0.62, 0.015, 0.19), m["glass"], root)
    for sx in (-1, 1):
        box(f"SideWindow{sx:+d}", (sx * 0.725, 0.18, 1.08), (0.015, 0.78, 0.18), m["glass"], root)
        box(f"Headlight{sx:+d}", (sx * 0.56, -1.705, 0.66), (0.18, 0.02, 0.08), m["head"], root)
        box(f"Taillight{sx:+d}", (sx * 0.6, 1.705, 0.68), (0.15, 0.02, 0.07), m["tail"], root)
        for sy in (-1, 1):
            wheel(f"Wheel{sx:+d}{sy:+d}", (sx * 0.78, sy * 1.08, 0.32), 0.32, 0.26, m["tire"], m["hub"], root)
    box("BumperF", (0, -1.72, 0.32), (0.86, 0.06, 0.1), m["trim"], root)
    box("BumperR", (0, 1.72, 0.32), (0.86, 0.06, 0.1), m["trim"], root)
    box("Grille", (0, -1.71, 0.52), (0.3, 0.02, 0.07), m["trim"], root)
    return root


def build_truck():
    """トラック (全長 5.6 / 全幅 1.9 / 全高 3.2)。ジャンプでは越えられない。"""
    m = vehicle_mats()
    cargo = make_mat("Cargo", (0.85, 0.86, 0.88), rough=0.5, metal=0.2)
    stripe = make_mat("Paint", (0.9, 0.9, 0.9), rough=0.3, metal=0.1)  # 荷台のライン (車体色)
    root = empty("Truck")
    box("Chassis", (0, 0.2, 0.55), (0.9, 2.7, 0.14), m["trim"], root)
    box("Cab", (0, -2.0, 1.32), (0.95, 0.78, 0.86), m["paint"], root, bevel=0.15)
    box("TruckWindshield", (0, -2.785, 1.62), (0.82, 0.015, 0.36), m["glass"], root)
    for sx in (-1, 1):
        box(f"CabWindow{sx:+d}", (sx * 0.955, -2.15, 1.62), (0.015, 0.45, 0.3), m["glass"], root)
        box(f"TruckHead{sx:+d}", (sx * 0.66, -2.785, 0.82), (0.2, 0.02, 0.1), m["head"], root)
        box(f"TruckTail{sx:+d}", (sx * 0.8, 2.905, 0.75), (0.12, 0.02, 0.1), m["tail"], root)
        for i, y in enumerate((-2.05, 1.2, 2.2)):
            wheel(f"TWheel{sx:+d}{i}", (sx * 0.84, y, 0.42), 0.42, 0.32, m["tire"], m["hub"], root)
    box("Cargo", (0, 0.95, 1.95), (0.98, 1.95, 1.25), cargo, root, bevel=0.06)
    for sx in (-1, 1):
        box(f"CargoStripe{sx:+d}", (sx * 0.99, 0.95, 1.55), (0.012, 1.9, 0.14), stripe, root)
    box("TruckBumper", (0, -2.82, 0.48), (0.96, 0.06, 0.13), m["trim"], root)
    return root


# ---------------------------------------------------------------------------
# ★ (ボーナスアイテム)
# ---------------------------------------------------------------------------

def build_star():
    gold = make_mat("Gold", (1.0, 0.62, 0.05), rough=0.25, metal=0.6, emit=(1.0, 0.55, 0.05), emit_strength=0.6)
    outer, inner, thick = 0.55, 0.25, 0.2
    ring = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        r = outer if i % 2 == 0 else inner
        ring.append((r * math.cos(a), 0.0, r * math.sin(a)))
    verts = ring + [(0, -thick, 0), (0, thick, 0)]
    front, back = 10, 11
    faces = []
    for i in range(10):
        j = (i + 1) % 10
        faces.append((front, j, i))
        faces.append((back, i, j))
    mesh = bpy.data.meshes.new("Star")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Star", mesh)
    bpy.context.scene.collection.objects.link(obj)
    mesh.materials.append(gold)
    return obj


# ---------------------------------------------------------------------------
# ステージ (横断歩道のある 3 車線道路と街並み)
# ---------------------------------------------------------------------------

def build_stage():
    asphalt = make_mat("Asphalt", (0.035, 0.037, 0.042), rough=0.95)
    paint = make_mat("RoadPaint", (0.85, 0.85, 0.82), rough=0.7)
    yellow = make_mat("RoadYellow", (0.9, 0.55, 0.02), rough=0.7)
    walk = make_mat("Sidewalk", (0.38, 0.36, 0.34), rough=0.9)
    curb = make_mat("Curb", (0.6, 0.6, 0.58), rough=0.9)
    grass = make_mat("Grass", (0.12, 0.35, 0.06), rough=1.0)
    trunk = make_mat("Trunk", (0.18, 0.08, 0.03), rough=0.9)
    leaf = make_mat("Leaf", (0.06, 0.32, 0.06), rough=0.8)
    pole = make_mat("Pole", (0.25, 0.26, 0.28), rough=0.5, metal=0.6)
    lamp = make_mat("Lamp", (1.0, 0.9, 0.6), rough=0.3, emit=(1.0, 0.85, 0.5), emit_strength=3.0)
    window = make_mat("Window", (0.15, 0.2, 0.28), rough=0.2, emit=(1.0, 0.8, 0.45), emit_strength=0.25)
    building_colors = [
        (0.75, 0.55, 0.38), (0.55, 0.62, 0.72), (0.85, 0.82, 0.74), (0.62, 0.38, 0.32),
        (0.45, 0.55, 0.45), (0.9, 0.7, 0.5), (0.5, 0.48, 0.55),
    ]
    bmats = [make_mat(f"Building{i}", c, rough=0.85) for i, c in enumerate(building_colors)]

    root = empty("Stage")
    near, far = -14.0, 150.0  # Y 範囲 (Blender)。+Y が奥
    length = far - near
    mid = (near + far) / 2
    road_half = 3.6

    box("Ground", (0, mid, -0.06), (40, length / 2, 0.05), grass, root)
    box("Road", (0, mid, 0.0), (road_half, length / 2, 0.01), asphalt, root)
    for sx in (-1, 1):
        box(f"Sidewalk{sx:+d}", (sx * (road_half + 1.8), mid, 0.08), (1.8, length / 2, 0.08), walk, root)
        box(f"Curb{sx:+d}", (sx * (road_half + 0.08), mid, 0.09), (0.08, length / 2, 0.09), curb, root)
        # 外側線
        box(f"EdgeLine{sx:+d}", (sx * (road_half - 0.25), mid, 0.012), (0.06, length / 2, 0.005), paint, root)

    # 横断歩道 (Y = -1.6 .. 1.6)
    x = -road_half + 0.45
    i = 0
    while x < road_half - 0.3:
        box(f"Zebra{i}", (x, 0, 0.013), (0.22, 1.6, 0.005), paint, root)
        x += 0.75
        i += 1
    box("StopLine", (0, 3.1, 0.013), (road_half - 0.1, 0.12, 0.005), paint, root)

    # 車線区分 (破線)
    y = 4.0
    k = 0
    while y < far:
        for lx in (-1.2, 1.2):
            box(f"Dash{k}", (lx, y + 1.5, 0.012), (0.06, 1.5, 0.005), paint, root)
            k += 1
        y += 6.0
    box("CenterBehind", (0, -8, 0.012), (0.08, 6, 0.005), yellow, root)

    # 建物・木・街灯 (擬似乱数で毎回同じ配置にする)
    seed = [7]

    def rnd():
        seed[0] = (seed[0] * 1103515245 + 12345) % (2 ** 31)
        return seed[0] / (2 ** 31)

    n = 0
    for sx in (-1, 1):
        y = 6.0
        while y < far - 4:
            w = 3.0 + rnd() * 3.0
            h = 4.0 + rnd() * 14.0
            d = 3.0 + rnd() * 2.0
            bx = sx * (road_half + 3.6 + d)
            mat = bmats[int(rnd() * len(bmats))]
            box(f"Building{n}", (bx, y + w / 2, h / 2), (d, w / 2, h / 2), mat, root)
            # 道路側の窓
            face_x = bx - sx * (d + 0.02)
            rows = int(h // 2.4)
            for r in range(rows):
                box(f"Win{n}_{r}", (face_x, y + w / 2, 1.6 + r * 2.4), (0.02, w / 2 - 0.5, 0.45), window, root)
            n += 1
            y += w + 0.6 + rnd() * 1.5

        # 木と街灯は手前側にも置く
        y = -10.0
        t = 0
        while y < far - 4:
            tx = sx * (road_half + 2.6)
            if t % 3 == 2:
                rod(f"LampPole{sx:+d}{t}", (tx, y, 0.1), (tx, y, 4.6), 0.07, pole, root, verts=10)
                rod(f"LampArm{sx:+d}{t}", (tx, y, 4.6), (tx - sx * 1.0, y, 4.75), 0.05, pole, root, verts=8)
                box(f"Lamp{sx:+d}{t}", (tx - sx * 1.05, y, 4.68), (0.25, 0.14, 0.06), lamp, root)
            else:
                rod(f"Trunk{sx:+d}{t}", (tx, y, 0.1), (tx, y, 1.5), 0.12, trunk, root, verts=8)
                bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.95, location=(tx, y, 2.1))
                _finish(bpy.context.active_object, f"Leaf{sx:+d}{t}", leaf, False, root)
            y += 7.0
            t += 1
    return root


# ---------------------------------------------------------------------------
# 実行
# ---------------------------------------------------------------------------

reset_scene()
build_kani()
export_glb("kani.glb")

reset_scene()
build_car()
export_glb("car.glb")

reset_scene()
build_truck()
export_glb("truck.glb")

reset_scene()
build_star()
export_glb("star.glb")

reset_scene()
build_stage()
export_glb("stage.glb")

print("[kani] done")
