"""Export the isonavi CadQuery assembly as a coloured, web sized GLB.

Run inside WSL with the venv that has cadquery and trimesh:

    wsl bash -c "cd ~/dev/isonavi/cad && ~/dev/venvs/ml/bin/python /mnt/d/COLLEGE/AUV/website/scripts/export_glb.py"

Every external part keeps the colour it has in the CAD, merged into one mesh
per material so the viewer needs only a handful of draw calls. Parts inside
the hull are skipped, nobody can see them. Normals are smooth across tessellation
bands and hard across real creases.
"""
import sys
from pathlib import Path

import numpy as np
import trimesh
from trimesh.visual.material import PBRMaterial

sys.path.insert(0, str(Path.home() / "dev/isonavi/cad"))
import isonavi_cad as C  # noqa: E402

OUT = Path("/mnt/d/COLLEGE/AUV/website/public/assets/isonavi-web.glb")
TOL, ANG = 0.9, 0.55          # tessellation tolerance (mm) and angle (rad)
CREASE = np.cos(np.radians(40.0))

# Hidden under the skin, not worth the bytes
INTERNAL = ("battery", "electronics", "esc bank", "trim ballast", "inertial unit",
            "ring frame", "rail", "aft closure", "sonar head")

# CAD colour -> (material name, metallic, roughness). Colours are the CAD ones.
ROLES = {
    "hull": (0.10, 0.34),
    "window": (0.0, 0.12),
    "accent": (0.15, 0.42),
    "dark": (0.35, 0.50),
    "metal": (0.85, 0.30),
    "anode": (0.90, 0.38),
    "weight": (0.60, 0.45),
}


def role_of(name, rgb):
    if name == "hull":
        return "hull"
    if name == "acoustic window":
        return "window"
    if name.startswith("anode"):
        return "anode"
    if name == "drop weight":
        return "weight"
    r, g, b = rgb
    if r > 0.7 and g < 0.5:
        return "accent"
    if max(rgb) < 0.3:
        return "dark"
    return "metal"


def srgb_to_linear(c):
    c = np.asarray(c, float)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def tessellate(shape):
    verts, faces = shape.tessellate(TOL, ANG)
    v = np.array([[p.x, p.y, p.z] for p in verts], float)
    f = np.array(faces, int)
    return v, f


def smooth_normals(v, f):
    """Per-corner normals: smooth across shared vertices, hard at creases."""
    fn = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
    fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)
    _, inv = np.unique(np.round(v, 3), axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    vn = np.zeros((inv.max() + 1, 3))
    for k in range(3):
        np.add.at(vn, inv[f[:, k]], fn)
    vn /= np.maximum(np.linalg.norm(vn, axis=1, keepdims=True), 1e-12)
    corner = vn[inv[f]]                                   # (n, 3, 3)
    hard = np.einsum("nkj,nj->nk", corner, fn) < CREASE   # (n, 3)
    corner[hard] = np.broadcast_to(fn[:, None, :], corner.shape)[hard]
    return corner.reshape(-1, 3), v[f].reshape(-1, 3)


def weld(pos, nrm):
    key = np.round(np.hstack([pos, nrm * 1000.0]), 3)
    _, idx, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1)
    return pos[idx], nrm[idx], inv.reshape(-1, 3)


assy = C.build()[0]
groups = {}
for ch in assy.children:
    if ch.name.startswith(INTERNAL):
        continue
    shape = ch.obj.val() if hasattr(ch.obj, "val") else ch.obj
    if shape is None:
        continue
    v, f = tessellate(shape)
    if not len(f):
        continue
    rgb = ch.color.toTuple()[:3] if ch.color else (0.7, 0.7, 0.72)
    role = role_of(ch.name, rgb)
    n, p = smooth_normals(v, f)
    g = groups.setdefault(role, {"rgb": rgb, "p": [], "n": []})
    g["p"].append(p)
    g["n"].append(n)

allp = np.concatenate([np.concatenate(g["p"]) for g in groups.values()])
lo, hi = allp.min(0), allp.max(0)
center = (lo + hi) / 2
scale = 2.0 / float((hi - lo).max())


def to_gltf(a):  # CAD is Z up, glTF is Y up
    return np.stack([a[:, 0], a[:, 2], -a[:, 1]], 1)


scene = trimesh.Scene()
total_faces = 0
for role, g in groups.items():
    pos = (np.concatenate(g["p"]) - center) * scale
    nrm = np.concatenate(g["n"])
    pos, nrm = to_gltf(pos), to_gltf(nrm)
    pos, nrm, faces = weld(pos, nrm)
    metal, rough = ROLES[role]
    lin = srgb_to_linear(g["rgb"])
    mat = PBRMaterial(name=role, baseColorFactor=[*lin, 1.0],
                      metallicFactor=metal, roughnessFactor=rough)
    mesh = trimesh.Trimesh(pos.astype(np.float32), faces.astype(np.uint32),
                           vertex_normals=nrm.astype(np.float32), process=False)
    mesh.visual = trimesh.visual.TextureVisuals(material=mat)
    scene.add_geometry(mesh, node_name=role, geom_name=role)
    total_faces += len(faces)
    print(f"{role:7s} faces {len(faces):7d} verts {len(pos):7d}")

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_bytes(scene.export(file_type="glb"))
print("faces", total_faces, "bytes", OUT.stat().st_size)
