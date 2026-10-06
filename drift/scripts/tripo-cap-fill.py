"""Minimum-area triangulation of an ordered 3D contact-hole boundary.

No center vertex or projection is introduced. Every original boundary vertex
survives. Returned faces traverse the boundary in the reverse of input order,
so they can close a loop whose order follows the source surface winding.
"""
import numpy as np


def triangulate_loop(points, forbidden_edges=()):
    """Return (N-2, 3) local vertex indices, or None when no valid fill exists.

    ``forbidden_edges`` contains unordered local-index pairs already used as
    non-boundary edges by the source piece. Such diagonals cannot appear in the
    result. Adjacent boundary vertices must be distinct and finite. The DP
    minimizes actual 3D triangle area plus a small squared-edge-length penalty;
    it does not claim a unique anatomical reconstruction of a hidden surface.

    Complexity O(N^3) time / O(N^2) storage; NumPy batches all intervals of the
    same length, including their possible split vertices. Tested through N=500.
    """
    points = np.asarray(points, dtype=np.float64)
    if points.ndim != 2 or points.shape[1] != 3:
        raise ValueError("points must be an N by 3 array")
    n = len(points)
    if n < 3:
        return None
    if not np.isfinite(points).all():
        raise ValueError("Boundary coordinates must be finite")
    extent = float(np.linalg.norm(np.ptp(points, axis=0)))
    if extent <= 0:
        return None
    # Translation/scale normalization avoids thresholds depending on GLB units.
    p = (points - points.mean(axis=0)) / extent
    differences = p[:, None, :] - p[None, :, :]
    lengths_sq = np.einsum("ijk,ijk->ij", differences, differences)
    if np.any(lengths_sq[np.arange(n), np.roll(np.arange(n), -1)] <= 1e-24):
        return None
    allowed = np.ones((n, n), dtype=bool)
    np.fill_diagonal(allowed, False)
    for edge in forbidden_edges:
        if len(edge) != 2:
            raise ValueError("Each forbidden edge must have two local indices")
        a, b = map(int, edge)
        if not (0 <= a < n and 0 <= b < n):
            raise ValueError("Forbidden edge index outside the boundary")
        allowed[a, b] = allowed[b, a] = False
    if not np.all(allowed[np.arange(n), np.roll(np.arange(n), -1)]):
        return None

    cost = np.full((n, n), np.inf, dtype=np.float64)
    split = np.full((n, n), -1, dtype=np.int32)
    cost[np.arange(n - 1), np.arange(1, n)] = 0
    for length in range(2, n):
        i = np.arange(n - length)[:, None]
        j = i + length
        k = i + np.arange(1, length)[None, :]
        cross = np.cross(p[k] - p[i], p[j] - p[i])
        area = .5 * np.linalg.norm(cross, axis=2)
        edge_penalty = .015 * (lengths_sq[i, k] + lengths_sq[k, j] + lengths_sq[i, j])
        candidates = cost[i, k] + cost[k, j] + area + edge_penalty
        possible = allowed[i, k] & allowed[k, j] & allowed[i, j] & (area > 1e-18)
        candidates[~possible] = np.inf
        best = np.argmin(candidates, axis=1)
        rows = np.arange(n - length)
        values = candidates[rows, best]
        cost[rows, rows + length] = values
        split[rows, rows + length] = np.where(np.isfinite(values), k[rows, best], -1)
    if not np.isfinite(cost[0, n - 1]):
        return None

    faces, stack = [], [(0, n - 1)]
    while stack:
        i, j = stack.pop()
        if j - i < 2:
            continue
        k = int(split[i, j])
        if k < 0:
            return None
        faces.append((i, j, k))  # Reverse input boundary traversal.
        stack.extend([(i, k), (k, j)])
    result = np.asarray(faces, dtype=np.int32)
    if len(result) != n - 2 or len(np.unique(result)) != n:
        raise AssertionError("Triangulation lost boundary vertices")
    return result


if __name__ == "__main__":
    import time

    def check(points, forbidden=()):
        faces = triangulate_loop(points, forbidden)
        assert faces is not None and len(faces) == len(points) - 2
        edges = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
        unique, counts = np.unique(np.sort(edges, axis=1), axis=0, return_counts=True)
        boundary = {tuple(sorted((i, (i + 1) % len(points)))) for i in range(len(points))}
        forbidden = {tuple(sorted(edge)) for edge in forbidden}
        for edge, count in zip(unique, counts):
            assert count == (1 if tuple(edge) in boundary else 2)
            assert tuple(edge) not in forbidden
        directed = {tuple(edge) for edge in edges}
        assert all(((i + 1) % len(points), i) in directed for i in range(len(points)))
        return faces

    square = np.array([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], float)
    check(square, {(0, 2)})
    assert triangulate_loop(square, {(0, 2), (1, 3)}) is None
    concave = np.array([[0, 0, 0], [2, 0, 0], [2, 2, 0], [1, .8, 0], [0, 2, 0]])
    check(concave)
    theta = np.linspace(0, 2 * np.pi, 500, endpoint=False)
    nonplanar = np.column_stack([np.cos(theta), np.sin(theta), .13 * np.sin(3 * theta)])
    started = time.perf_counter()
    check(nonplanar, {(0, 10), (200, 205)})
    print(f"Passed: reverse boundary winding, all vertices, prohibited diagonals, closed edge incidence; N=500 in {time.perf_counter() - started:.2f}s")
