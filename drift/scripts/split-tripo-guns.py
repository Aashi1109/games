"""Separate the four disconnected new weapon surfaces without changing geometry.

The source GLB and all source arrays/images are read-only. Original triangle IDs,
vertex IDs, texture bytes, float32 positions/UVs and quantized normals are retained.
Only closure-safe opposite-wound duplicate pairs are omitted and audited.
No cuts, caps, transform baking, resampling, or optimization are applied.
"""
from pathlib import Path
import argparse
import copy
import hashlib
import json
import struct

import numpy as np
from PIL import Image
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / 'output/models/tripo-guns-working'
O = ROOT / 'output/models/tripo-guns-master'
SOURCE = ROOT / 'output/models/tripo-guns-review/tripo-guns-original.glb'
EXPECTED_SOURCE_SHA = 'ab226246542629439f484e21b0f3e3fc795272becb23bacb58871d52b1d93c97'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def topology(positions, faces):
    _, weld = np.unique(positions, axis=0, return_inverse=True)
    wf = weld[faces]
    edges = np.concatenate([wf[:, [0, 1]], wf[:, [1, 2]], wf[:, [2, 0]]])
    keys, inverse, count = np.unique(np.sort(edges, axis=1), axis=0,
                                     return_inverse=True, return_counts=True)
    directions = np.where(edges[:, 0] < edges[:, 1], 1, -1)
    winding = np.bincount(inverse, weights=directions)
    corners = positions[faces].astype(np.float64)
    area2 = np.linalg.norm(np.cross(corners[:, 1]-corners[:, 0],
                                    corners[:, 2]-corners[:, 0]), axis=1)
    _, duplicates = np.unique(np.sort(wf, axis=1), axis=0, return_counts=True)
    return {
        'weldedVertices': int(weld.max()) + 1,
        'edges': len(keys),
        'boundaryEdges': int((count == 1).sum()),
        'nonmanifoldEdges': int((count > 2).sum()),
        'inconsistentWindingEdges': int(((count == 2) & (winding != 0)).sum()),
        'zeroAreaTriangles': int((area2 == 0).sum()),
        'duplicatePositionTriangles': int(np.maximum(duplicates - 1, 0).sum()),
        'checked': 'Exact-position-welded edge incidence, winding, triangle area and duplicates.',
    }


def export_glb(parts, path, metadata):
    blob = bytearray()
    views, accessors, meshes, nodes = [], [], [], []

    def view(data, target=None, stride=None):
        blob.extend(b'\0' * (-len(blob) % 4))
        entry = {'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data)}
        if target is not None:
            entry['target'] = target
        if stride is not None:
            entry['byteStride'] = stride
        views.append(entry)
        blob.extend(data)
        return len(views)-1

    def accessor(array, kind, component_type, normalized=False):
        packed = array
        stride = None
        if kind == 'VEC3' and component_type == 5120:
            # glTF vertex attributes have 4-byte alignment; padding is not data.
            packed = np.zeros((len(array), 4), dtype=np.int8)
            packed[:, :3] = array
            stride = 4
        entry = {'bufferView': view(packed.tobytes(),
                                   34963 if kind == 'SCALAR' else 34962, stride),
                 'componentType': component_type, 'count': len(array), 'type': kind}
        if normalized:
            entry['normalized'] = True
        if kind == 'VEC3' and component_type == 5126:
            entry.update(min=array.min(0).tolist(), max=array.max(0).tolist())
        accessors.append(entry)
        return len(accessors)-1

    for part in parts:
        attrs = {
            'POSITION': accessor(part['POSITION'], 'VEC3', 5126),
            'NORMAL': accessor(part['NORMAL'], 'VEC3', 5120, True),
            'TEXCOORD_0': accessor(part['TEXCOORD_0'], 'VEC2', 5126),
        }
        index = accessor(part['faces'].ravel(), 'SCALAR', 5125)
        meshes.append({'name': part['name'], 'primitives': [
            {'attributes': attrs, 'indices': index, 'material': 0}]})
        nodes.append({'name': part['name'], 'mesh': len(meshes)-1,
                      'extras': {'sourceComponentId': part['componentId'],
                                 'part': 'gun', 'sourceCoordinatesPreserved': True}})
    images = []
    for i, source_image in enumerate(metadata['images']):
        suffix = '.png' if source_image['mimeType'] == 'image/png' else '.jpg'
        entry = copy.deepcopy(source_image)
        entry['bufferView'] = view((D / f'texture-{i}{suffix}').read_bytes())
        images.append(entry)
    doc = {'asset': {'version': '2.0', 'generator': 'DRIFT exact connected-component weapon split'},
           'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}],
           'nodes': nodes, 'meshes': meshes, 'accessors': accessors,
           'bufferViews': views, 'buffers': [{'byteLength': len(blob)}],
           'images': images, 'textures': metadata['textures'],
           'materials': metadata['materials'],
           'extensionsUsed': ['KHR_mesh_quantization'],
           'extensionsRequired': ['KHR_mesh_quantization']}
    if metadata['source'].get('samplers'):
        doc['samplers'] = metadata['source']['samplers']
    text = json.dumps(doc, separators=(',', ':')).encode()
    text += b' ' * (-len(text) % 4)
    blob.extend(b'\0' * (-len(blob) % 4))
    data = (struct.pack('<III', 0x46546C67, 2, 28+len(text)+len(blob)) +
            struct.pack('<II', len(text), 0x4E4F534A) + text +
            struct.pack('<II', len(blob), 0x004E4942) + blob)
    path.write_bytes(data)
    return {'bytes': len(data), 'sha256': sha(data)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--names', nargs=4, default=['ember-gun', 'dash-gun', 'wisp-gun', 'rook-gun'],
                        help='Names ordered by source connected component IDs 0,1,2,3.')
    args = parser.parse_args()
    if len(set(args.names)) != 4 or any(not s.replace('-', '').isalnum() for s in args.names):
        raise ValueError('Four unique alphanumeric/hyphen names required.')
    source_bytes = SOURCE.read_bytes()
    assert sha(source_bytes) == EXPECTED_SOURCE_SHA, 'Source GLB checksum changed.'
    metadata = json.loads((D / 'decoded.json').read_text())
    p = np.fromfile(D / 'POSITION.bin', '<f4').reshape(-1, 3)
    n = np.fromfile(D / 'NORMAL.bin', 'i1').reshape(-1, 3)
    uv = np.fromfile(D / 'TEXCOORD_0.bin', '<f4').reshape(-1, 2)
    f = np.fromfile(D / 'indices.bin', '<u4').reshape(-1, 3)
    assert len(p) == len(n) == len(uv) and f.max() < len(p)
    assert np.isfinite(p).all() and np.isfinite(uv).all()
    _, weld = np.unique(p, axis=0, return_inverse=True)
    wf = weld[f]
    edges = np.concatenate([wf[:, [0, 1]], wf[:, [1, 2]], wf[:, [2, 0]]])
    edge_faces = np.tile(np.arange(len(f)), 3)
    keys = np.sort(edges, axis=1)
    order = np.lexsort((keys[:, 1], keys[:, 0]))
    sorted_keys = keys[order]
    matched = np.all(sorted_keys[1:] == sorted_keys[:-1], axis=1)
    a = edge_faces[order[:-1][matched]]
    b = edge_faces[order[1:][matched]]
    graph = coo_matrix((np.ones(len(a)*2), (np.r_[a,b], np.r_[b,a])),
                       shape=(len(f),len(f))).tocsr()
    count, labels = connected_components(graph, directed=False)
    assert count == 4, f'Expected exactly four connected surfaces; found {count}.'
    O.mkdir(exist_ok=True)
    (O / 'ownership').mkdir(exist_ok=True)
    np.save(O / 'ownership/triangle-ownership.npy', labels.astype(np.int8))
    parts, reports = [], []
    omissions = []
    audited_labels = labels.astype(np.int8)
    for component, name in enumerate(args.names):
        ids = np.flatnonzero(labels == component).astype('<u4')
        original_ids = ids.copy()
        used, remap = np.unique(f[ids], return_inverse=True)
        original_faces = remap.reshape(-1,3).astype('<u4')
        before = topology(p[used], original_faces)
        local_wf = weld[f[ids]]
        _, inverse, multiplicity = np.unique(np.sort(local_wf, axis=1), axis=0,
                                             return_inverse=True, return_counts=True)
        parity = ((local_wf[:,0] > local_wf[:,1]).astype(int) +
                  (local_wf[:,0] > local_wf[:,2]).astype(int) +
                  (local_wf[:,1] > local_wf[:,2]).astype(int)) % 2
        orientation_sum = np.bincount(inverse, weights=np.where(parity == 0, 1, -1))
        pair = (multiplicity[inverse] == 2) & (orientation_sum[inverse] == 0)
        proposed = ids[~pair]
        test_used, test_remap = np.unique(f[proposed], return_inverse=True)
        after = topology(p[test_used], test_remap.reshape(-1,3))
        if pair.any():
            assert after['boundaryEdges'] == 0 and after['nonmanifoldEdges'] == 0, 'Pair cleanup would break closure.'
            for source_id in ids[pair]:
                omissions.append({'sourceTriangleId': int(source_id), 'part': name,
                                  'reason': 'Collapsed opposite-wound duplicate pair; both faces removed with closure preserved.'})
            audited_labels[ids[pair]] = -1
            ids = proposed
        used, remap = np.unique(f[ids], return_inverse=True)
        faces = remap.reshape(-1,3).astype('<u4')
        corners = p[f[ids]].astype(np.float64)
        zero_area = np.linalg.norm(np.cross(corners[:,1]-corners[:,0], corners[:,2]-corners[:,0]), axis=1) == 0
        part = {'name': name, 'componentId': component,
                'POSITION': p[used], 'NORMAL': n[used], 'TEXCOORD_0': uv[used],
                'faces': faces}
        assert np.array_equal(used[faces], f[ids])
        parts.append(part)
        ids.tofile(O / f'ownership/{name}-triangles.u32')
        used.astype('<u4').tofile(O / f'ownership/{name}-vertices.u32')
        record = export_glb([part], O / f'{name}.glb', metadata)
        report = {'name': name, 'sourceComponentId': component,
                  'file': f'{name}.glb', 'sourceTriangles': len(ids),
                  'sourceVertices': len(used), 'originalSourceTriangles':len(original_ids),
                  'addedTriangles': 0, 'removedTriangles': int(pair.sum()),
                  'omittedSourceTriangleIds': original_ids[pair].tolist(),
                  'retainedZeroAreaSourceTriangleIds':ids[zero_area].tolist(),
                  'retainedZeroAreaReason':'Removing the collinear source face alone opens three boundary edges.' if zero_area.any() else None,
                  'sourceTopologyBeforeCleanup':before,
                  'min': part['POSITION'].min(0).tolist(),
                  'max': part['POSITION'].max(0).tolist(),
                  'sourceTriangleIds': f'ownership/{name}-triangles.u32',
                  'sourceVertexIds': f'ownership/{name}-vertices.u32',
                  'topology': topology(part['POSITION'], faces), **record}
        reports.append(report)
        print(json.dumps(report), flush=True)
    assert sum(r['sourceTriangles'] for r in reports) + len(omissions) == len(f)
    np.save(O / 'ownership/triangle-ownership.npy', audited_labels)
    (O / 'ownership/omitted-source-triangles.json').write_text(json.dumps(omissions,indent=2)+'\n')
    combined = export_glb(parts, O / 'guns-master.glb', metadata)
    texture_report = []
    for i, source_image in enumerate(metadata['images']):
        suffix = '.png' if source_image['mimeType'] == 'image/png' else '.jpg'
        path = D / f'texture-{i}{suffix}'
        texture_report.append({'index':i, 'bytes':path.stat().st_size,
                               'sha256':sha(path.read_bytes()),
                               'size':list(Image.open(path).size)})
    manifest = {'status':'EXACT_COMPONENT_SPLIT_REQUIRES_INDEPENDENT_RENDERED_REVIEW',
                'source': {'file': str(SOURCE.relative_to(ROOT)),
                           'sha256': EXPECTED_SOURCE_SHA, 'bytes': len(source_bytes),
                           'triangles':len(f), 'vertices':len(p)},
                'operation': 'Welded-edge component partition plus closure-safe removal of both faces of collapsed opposite-wound duplicate pairs.',
                'sourceCoordinatesPreserved':True, 'sourceNormalBytesPreserved':True,
                'sourceUVBytesPreserved':True, 'textureBytesPreserved':True,
                'allSourceTrianglesAccountedForExactlyOnce':True,
                'addedTriangles':0, 'removedTriangles':len(omissions),
                'omittedSourceTriangles':'ownership/omitted-source-triangles.json',
                'componentIdOrder':args.names,
                'parts':reports, 'textures':texture_report,
                'combined':{'file':'guns-master.glb',**combined}}
    (O / 'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    (O / 'README.md').write_text(
        '# Original-detail separate weapons\n\n'
        'Four disconnected source surfaces were separated. Forty-eight collapsed opposite-wound duplicate faces were removed after checking that closure remained intact. '
        'Positions, UV coordinates, quantized normals, material settings and texture bytes are preserved. '
        'The source GLB remains unchanged. No caps, hole fills, transforms or optimization were applied.\n\n'
        'Each ownership file lists original source triangle or vertex indices in exported order. '
        '`manifest.json` records sizes, checksums, topology findings and component names. '
        'Dash and Wisp each retain one collinear zero-area source triangle because deleting it alone creates an open boundary. The source-exact split is preserved under ../tripo-guns-working/source-exact-split/.\n\n'
        'Reproduce from repository root using:\n\n'
        '```sh\n/tmp/drift-tripo-py/bin/python scripts/split-tripo-guns.py --names '+
        ' '.join(args.names)+'\n```\n')


if __name__ == '__main__':
    main()
