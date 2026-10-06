import * as THREE from 'three';

// The image is a modeling guide only. Vertices carry anatomical depth and form
// closed, turnable volumes; no reference bitmap is loaded into the model.
export const EMBER_FRAME = {
  origin: new THREE.Vector3(0, 1.67, 0),
  anchor: [196, 130],
  scale: 465,
  toward: new THREE.Vector3(.4, .08, -1).normalize(),
  right: new THREE.Vector3(-1, 0, -.4).normalize(),
};
EMBER_FRAME.up = new THREE.Vector3().crossVectors(EMBER_FRAME.toward, EMBER_FRAME.right).normalize();

export function fromReference([x, y, depth], frame = EMBER_FRAME) {
  return frame.origin.clone()
    .addScaledVector(frame.right, (x - frame.anchor[0]) / frame.scale)
    .addScaledVector(frame.up, (frame.anchor[1] - y) / frame.scale)
    .addScaledVector(frame.toward, depth).toArray();
}

const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

export function triangulateReference(contour, holes = [], landmarks = []) {
  const vertices = [...contour, ...holes.flat()];
  const faces = THREE.ShapeUtils.triangulateShape(contour.map(p => new THREE.Vector2(...p)), holes.map(loop => loop.map(p => new THREE.Vector2(...p))));
  for (const point of landmarks) {
    if (vertices.some(p => Math.hypot(p[0] - point[0], p[1] - point[1]) < .01)) continue;
    const index = faces.findIndex(face => {
      const p = face.map(i => vertices[i]);
      const signs = [cross(p[0],p[1],point),cross(p[1],p[2],point),cross(p[2],p[0],point)];
      return signs.every(v => v > .001) || signs.every(v => v < -.001);
    });
    if (index < 0) continue;
    const [a,b,c] = faces[index], n = vertices.length;
    vertices.push(point); faces.splice(index, 1, [a,b,n],[b,c,n],[c,a,n]);
  }
  for (let pass = 0; pass < 15; pass++) {
    const edges = new Map(), used = new Set();
    faces.forEach((face,index) => face.forEach((a,i) => {
      const b = face[(i+1)%3], c = face[(i+2)%3], key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const list = edges.get(key) || []; list.push({index,a,b,c}); edges.set(key,list);
    }));
    let changed = false;
    for (const pair of edges.values()) {
      if (pair.length !== 2) continue;
      const [f,g] = pair;
      if (used.has(f.index) || used.has(g.index)) continue;
      const {a,b,c} = f, d = g.c, pa = vertices[a], pb = vertices[b], pc = vertices[c], pd = vertices[d];
      if (cross(pa,pb,pc)*cross(pa,pb,pd)>=0 || cross(pc,pd,pa)*cross(pc,pd,pb)>=0) continue;
      const angle = (p,q,r) => Math.acos(THREE.MathUtils.clamp(((p[0]-q[0])*(r[0]-q[0])+(p[1]-q[1])*(r[1]-q[1])) / (Math.hypot(p[0]-q[0],p[1]-q[1])*Math.hypot(r[0]-q[0],r[1]-q[1])), -1, 1));
      if (angle(pa,pc,pb)+angle(pa,pd,pb)<=Math.PI+.0001) continue;
      faces[f.index]=[c,d,a]; faces[g.index]=[d,c,b]; used.add(f.index); used.add(g.index); changed=true;
    }
    if (!changed) break;
  }
  return {vertices, faces:faces.map(face => cross(...face.map(i => vertices[i])) > 0 ? [...face].reverse() : face)};
}

export function worldSurface(parts, vertices, faces, color, outward = null) {
  const positions = [], colors = [];
  faces.forEach((sourceFace, index) => {
    const face = [...sourceFace];
    const pts = face.map(i => new THREE.Vector3(...vertices[i]));
    const normal = pts[1].clone().sub(pts[0]).cross(pts[2].clone().sub(pts[0]));
    if (normal.lengthSq() < 1e-16) return;
    if (outward && normal.dot(outward) < 0) face.reverse();
    const tint = new THREE.Color(typeof color === 'function' ? color(index, sourceFace) : color);
    for (const i of face) { positions.push(...vertices[i]); colors.push(tint.r,tint.g,tint.b); }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals(); parts.push(geometry); return geometry;
}

export function referenceSurface(parts, vertices, faces, color) {
  return worldSurface(parts, vertices.map(p => fromReference(p)), faces, color, EMBER_FRAME.toward);
}

// Closed shallow sculpted features (lids, brows and lip rims) follow the face,
// while skull and hair shells below provide the full head volume.
export function referencePatch(parts, points, color, thickness = .001) {
  const front = triangulateReference(points);
  referenceSurface(parts, front.vertices, front.faces, color);
  if (thickness <= 0) return;
  const n=points.length, verts=[...points,...points.map(([x,y,d])=>[x,y,d-thickness])].map(p=>fromReference(p));
  const faces = front.faces.map(f=>[...f].reverse().map(i=>i+n));
  const clockwise = points.reduce((s,a,i)=>{const b=points[(i+1)%n];return s+a[0]*b[1]-b[0]*a[1];},0)>0;
  for(let i=0;i<n;i++){const j=(i+1)%n; const edge=[[i,j,i+n],[j,j+n,i+n]]; if(!clockwise)edge.forEach(f=>f.reverse()); faces.push(...edge);}
  worldSurface(parts,verts,faces,color);
}
