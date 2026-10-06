"""Small closed meshes for weapon surfaces hidden by fused source hands.

These are new reconstruction triangles, not reclassified source triangles.
No files are changed when imported. ``build_gun_repairs('ember')`` returns
POSITION, NORMAL, TEXCOORD_0, and faces arrays in original Tripo coordinates.
Use each ``repairs`` range to record their provenance in the split manifest.
"""
from pathlib import Path
import json
import numpy as np


CONFIG = {
    "ember": [
        ("pistol-grip", [-.404, .092, .021], [-.411, .065, .017], .012, .015, .88),
        ("magazine-neck", [-.380, .071, .043], [-.384, .029, .033], .014, .018, .96),
    ],
    "wisp": [
        ("pistol-grip", [-.173, .085, .025], [-.181, .055, .027], .011, .015, .88),
    ],
    "dash": [
        ("pistol-grip", [.074, .081, .021], [.068, .046, .023], .010, .013, .88),
        ("magazine-neck", [.089, .045, .041], [.085, .009, .037], .012, .016, .96),
    ],
    "rook": [
        ("pistol-grip", [.338, .078, .076], [.331, .050, .073], .015, .018, .88),
    ],
}
DEFAULT_PALETTE = Path(__file__).resolve().parent.parent / "output/models/tripo-working/color/cap-palette.json"


def _to_source(q):
    """q=(front X, Y, depth) -> source=(depth, Y, -front X)."""
    return np.stack([q[..., 2], q[..., 1], -q[..., 0]], axis=-1)


def _closed_beveled_box(start, end, width, depth, end_scale, sample):
    start, end = np.asarray(start, float), np.asarray(end, float)
    axis = end - start
    length = np.linalg.norm(axis)
    if length <= 0 or min(width, depth, end_scale) <= 0:
        raise ValueError("Repair box dimensions must be positive")
    axis /= length
    u = np.cross(axis, [0, 0, 1])
    if np.linalg.norm(u) < .001:
        u = np.cross(axis, [0, 1, 0])
    u /= np.linalg.norm(u)
    v = np.cross(axis, u)
    half_width, half_depth = width / 2, depth / 2
    bevel = min(width, depth) * .13
    section = np.array([
        [-half_width + bevel, -half_depth], [half_width - bevel, -half_depth],
        [half_width, -half_depth + bevel], [half_width, half_depth - bevel],
        [half_width - bevel, half_depth], [-half_width + bevel, half_depth],
        [-half_width, half_depth - bevel], [-half_width, -half_depth + bevel],
    ])
    offsets = section[:, 0, None] * u + section[:, 1, None] * v
    points = np.vstack([start + offsets, end + offsets * end_scale, start, end])
    faces = []
    for i in range(8):
        j = (i + 1) % 8
        faces.extend([[i, j, 8 + j], [i, 8 + j, 8 + i], [16, j, i], [17, 8 + i, 8 + j]])
    faces = np.asarray(faces, np.uint32)
    center = (start + end) / 2
    # Explicit outward winding also covers the q->source coordinate conversion.
    for triangle in faces:
        vertices = points[triangle]
        normal = np.cross(vertices[1] - vertices[0], vertices[2] - vertices[0])
        if np.dot(normal, vertices.mean(0) - center) < 0:
            triangle[1], triangle[2] = triangle[2], triangle[1]
    positions = _to_source(points[faces]).reshape(-1, 3)
    triangles = positions.reshape(-1, 3, 3)
    normals = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
    normals /= np.linalg.norm(normals, axis=1, keepdims=True)
    # Use a real tiny UV triangle inside the audited neutral patch, never three
    # identical UVs: derivative-based normal mapping requires a nonzero UV area.
    uv_center = np.asarray(sample["uv"], float)
    radius = min(float(sample.get("patchHalfExtentUV", .0009765625)) * .45, .0004)
    uv_triangle = uv_center + radius * np.array([[-1, -1], [1, -1], [0, 1]])
    texcoords = np.tile(uv_triangle, (len(faces), 1))
    if not ((texcoords >= 0).all() and (texcoords <= 1).all()):
        raise ValueError("Repair texture patch lies outside the atlas")
    return {
        "POSITION": positions.astype(np.float32),
        "NORMAL": np.repeat(normals, 3, axis=0).astype(np.float32),
        "TEXCOORD_0": texcoords.astype(np.float32),
        "faces": np.arange(len(positions), dtype=np.uint32).reshape(-1, 3),
    }


def build_gun_repairs(character, palette_path=DEFAULT_PALETTE, config=None):
    """Return independently closed beveled repair parts in source placement.

    Optional config overrides one character's CONFIG entries, for root's visual
    iteration. Each entry is (name, q_start, q_end, width, depth, end_scale).
    """
    if character not in CONFIG:
        raise ValueError(f"Unknown character: {character}")
    palette = json.loads(Path(palette_path).read_text())["samples"]
    sample = palette[character]["gun-metal"]
    meshes, repairs, vertex_offset, triangle_offset = [], [], 0, 0
    for name, start, end, width, depth, end_scale in (CONFIG[character] if config is None else config):
        mesh = _closed_beveled_box(start, end, width, depth, end_scale, sample)
        mesh["faces"] += vertex_offset
        count = len(mesh["faces"])
        repairs.append({
            "id": f"{character}-{name}", "firstTriangle": triangle_offset, "triangles": count,
            "provenance": "New closed geometry reconstructing surfaces occluded by fused source hands.",
            "qStart": start, "qEnd": end, "width": width, "depth": depth,
            "endScale": end_scale, "paletteSample": f"{character}.gun-metal",
            "closedSeparateComponent": True,
        })
        meshes.append(mesh)
        vertex_offset += len(mesh["POSITION"])
        triangle_offset += count
    if not meshes:
        return {"id": f"{character}-gun-repairs", "POSITION": np.empty((0, 3), np.float32), "NORMAL": np.empty((0, 3), np.float32), "TEXCOORD_0": np.empty((0, 2), np.float32), "faces": np.empty((0, 3), np.uint32), "repairs": []}
    return {"id": f"{character}-gun-repairs", **{key: np.concatenate([mesh[key] for mesh in meshes]) for key in ["POSITION", "NORMAL", "TEXCOORD_0", "faces"]}, "repairs": repairs}


if __name__ == "__main__":
    # Read-only structural check: no source/model files are created or modified.
    for character in CONFIG:
        model = build_gun_repairs(character)
        positions, faces = model["POSITION"], model["faces"]
        _, remap = np.unique(positions, axis=0, return_inverse=True)
        welded = remap[faces]
        edges = np.concatenate([welded[:, [0, 1]], welded[:, [1, 2]], welded[:, [2, 0]]])
        _, counts = np.unique(np.sort(edges, axis=1), axis=0, return_counts=True)
        assert np.all(counts == 2), "Repair is not closed and manifold"
        points = positions[faces].astype(float)
        volume = np.einsum("ij,ij->i", points[:, 0], np.cross(points[:, 1], points[:, 2])).sum() / 6
        assert volume > 0, "Repair winding points inward"
        assert np.isfinite(positions).all() and np.isfinite(model["NORMAL"]).all()
        assert np.allclose(np.linalg.norm(model["NORMAL"], axis=1), 1)
        print(json.dumps({"character": character, "triangles": len(faces), "closedParts": len(model["repairs"]), "signedVolume": volume, "bounds": [positions.min(0).tolist(), positions.max(0).tolist()]}))
