# Original-detail separate weapons

Four disconnected source surfaces were separated. Forty-eight collapsed opposite-wound duplicate faces were removed after checking that closure remained intact. Positions, UV coordinates, quantized normals, material settings and texture bytes are preserved. The source GLB remains unchanged. No caps, hole fills, transforms or optimization were applied.

Each ownership file lists original source triangle or vertex indices in exported order. `manifest.json` records sizes, checksums, topology findings and component names. Dash and Wisp each retain one collinear zero-area source triangle because deleting it alone creates an open boundary. The source-exact split is preserved under ../tripo-guns-working/source-exact-split/.

Reproduce from repository root using:

```sh
/tmp/drift-tripo-py/bin/python scripts/split-tripo-guns.py --names ember-gun dash-gun wisp-gun rook-gun
```
