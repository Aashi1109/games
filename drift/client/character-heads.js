import * as THREE from 'three';
import { makeMesh } from './character-geometry.js';

const PIVOT = [0, 1.49, 0];
const UP = new THREE.Vector3(0, 1, 0);
const FRONT = new THREE.Vector3(0, 0, -1);
const clamp = THREE.MathUtils.clamp;
const gaussian = (value, center, radius) => Math.exp(-(((value - center) / radius) ** 2));

// These are anatomical sections, not subdivisions of a primitive skull. The
// changing mandible, cheek, temple and forehead widths define the silhouette.
const SECTIONS = [
  [1.548, .041, -.088, .049], [1.556, .054, -.094, .069],
  [1.568, .067, -.098, .086], [1.578, .081, -.100, .098],
  [1.588, .091, -.104, .106], [1.597, .098, -.103, .110],
  [1.607, .102, -.100, .111], [1.617, .105, -.099, .112],
  [1.627, .108, -.098, .113], [1.637, .110, -.097, .114],
  [1.645, .111, -.097, .115], [1.652, .110, -.096, .114],
  [1.660, .109, -.094, .114], [1.667, .108, -.094, .114],
  [1.677, .108, -.098, .114], [1.689, .108, -.102, .113],
  [1.710, .107, -.101, .111], [1.737, .107, -.096, .108],
  [1.760, .104, -.087, .103], [1.774, .098, -.071, .097],
  [1.787, .088, -.052, .085], [1.799, .067, -.027, .064],
  [1.806, .036, .000, .035],
];


const PROFILES = {
  assault: { width: 1.00, jaw: .99, chin: 1.13, nose: .92, lips: '#975e47', hair: '#403531', beard: null, eye: '#664c32' },
  sniper: { width: .94, jaw: 1.20, chin: 1.36, nose: 1.03, lips: '#865d48', hair: '#443b34', beard: '#59534c', eye: '#544d3e' },
  scout: { width: 1.00, jaw: 1.08, chin: 1.16, nose: 1.01, lips: '#9e694b', hair: '#49392e', beard: '#74553c', eye: '#725435' },
  heavy: { width: 1.10, jaw: 1.13, chin: 1.26, nose: 1.10, lips: '#62402e', hair: '#302a26', beard: '#38322e', eye: '#352c23' },
};

function addSurface(parts, vertices, faces, color, smooth = 0) {
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3));
  const a32 = new THREE.Vector3(), b32 = new THREE.Vector3(), c32 = new THREE.Vector3();
  const position=indexed.attributes.position;
  const validFaces=faces.filter(([a,b,c])=>{
    a32.fromBufferAttribute(position,a);b32.fromBufferAttribute(position,b);c32.fromBufferAttribute(position,c);
    return b32.sub(a32).cross(c32.sub(a32)).lengthSq()>1e-22;
  });
  indexed.setIndex(validFaces.flat());
  indexed.computeVertexNormals();
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  const p = geometry.attributes.position;
  const n = geometry.attributes.normal;
  const colors = new Float32Array(p.count * 3);
  const tint = typeof color === 'function' ? null : new THREE.Color(color);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const flat = new THREE.Vector3(), normal = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    flat.crossVectors(b.sub(a), c.sub(a)).normalize();
    for (let j = i; j < i + 3; j += 1) {
      const blend = typeof smooth === 'function' ? smooth(p.getX(j), p.getY(j)) : smooth;
      normal.fromBufferAttribute(n, j).multiplyScalar(blend).addScaledVector(flat, 1 - blend).normalize();
      n.setXYZ(j, normal.x, normal.y, normal.z);
      const shade = tint || (color.flat ? color((p.getX(i)+p.getX(i+1)+p.getX(i+2))/3, (p.getY(i)+p.getY(i+1)+p.getY(i+2))/3, (p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3) : color(p.getX(j), p.getY(j), p.getZ(j)));
      colors[j * 3] = shade.r; colors[j * 3 + 1] = shade.g; colors[j * 3 + 2] = shade.b;
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  parts.push(geometry);
  return geometry;
}

function sectionAt(y) {
  if (y <= SECTIONS[0][0]) return SECTIONS[0];
  for (let i = 1; i < SECTIONS.length; i += 1) {
    if (y <= SECTIONS[i][0]) {
      const lower = SECTIONS[i - 1], upper = SECTIONS[i];
      const t = (y - lower[0]) / (upper[0] - lower[0]);
      return lower.map((v, j) => v + (upper[j] - v) * t);
    }
  }
  return SECTIONS.at(-1);
}

function makeFaceDefinition(id, style) {
  const profile = { ...PROFILES[id], id, offset: { assault:.032, sniper:.014, scout:.020, heavy:.006 }[id] };
  const widthAt = (y) => {
    const jaw = 1 + (profile.jaw - 1) * clamp((1.635 - y) / .065, 0, 1);
    const chin = 1 + (profile.chin - 1) * clamp((1.580 - y) / .032, 0, 1);
    if (id !== 'assault' && y < 1.660) {
      const corner=.078*(1+(profile.jaw-1)*.25);
      const width=y<1.580?THREE.MathUtils.lerp(.043*profile.chin,corner,clamp((y-1.548)/.032,0,1)):THREE.MathUtils.lerp(corner,.109,(y-1.580)/.080);
      return width*profile.width;
    }
    return sectionAt(y)[1] * profile.width * jaw * chin;
  };
  const zAt = (x, y) => {
    const row = sectionAt(y);
    const featureY = y + profile.offset;
    const u = clamp(Math.abs(x) / widthAt(y), 0, 1);
    let z = row[2] + (u < .30 ? .003 * (u / .30) ** 2 : u < .72 ? .003 + (u - .30) * .072 : .03324 + (u - .72) * .16);
    // Orbital sockets sit behind the cheekbone and brow ridge. Central nose
    // planes grow continuously out of this surface rather than sitting on it.
    z += .012 * gaussian(Math.abs(x), .045 * profile.width, .031) * gaussian(featureY, 1.700, .018);
    z -= .010 * gaussian(Math.abs(x), .045 * profile.width, .038) * gaussian(featureY, 1.724, .014);
    z -= .004 * Math.max(0, 1 - Math.abs(Math.abs(x) - .071 * profile.width) / .026) * Math.max(0, 1 - Math.abs(featureY - 1.676) / .027);
    z += .002 * gaussian(Math.abs(x), .075 * profile.width, .022) * gaussian(featureY, 1.626, .023);
    z += .006 * gaussian(Math.abs(x), .035, .009) * gaussian(featureY, 1.646, .029);
    z -= profile.nose * .034 * gaussian(x, 0, .010) * gaussian(featureY, 1.690, .050);
    z -= profile.nose * .012 * gaussian(x, 0, .014) * gaussian(featureY, 1.666, .014);
    z -= .011 * gaussian(Math.abs(x), .015 * profile.nose, .007) * gaussian(featureY, 1.661, .009);
    z -= .002 * gaussian(x, 0, .024) * gaussian(featureY, 1.628, .012);
    
    return z;
  };
  const skin = new THREE.Color(style.skin);
  const shadow = new THREE.Color(style.shadow);
  const colorAt = (x, y, z) => {
    const tint = skin.clone();
    if(id!=='assault'&&z>.006&&y>=1.660)return new THREE.Color(profile.hair);
    const featureY = y + profile.offset;
    const side = Math.abs(x) / profile.width;
    const socket = gaussian(side, .046, .030) * gaussian(featureY, 1.700, .018);
    const hollow = gaussian(side, .082, .024) * gaussian(featureY, 1.622, .030);
    tint.lerp(shadow, socket * .11 + hollow * .08);
    return tint;
  };
  colorAt.flat = true;
  return { profile, widthAt, zAt, colorAt, skin, id };
}

function forwardFaces(vertices, faces) {
  return faces.map((face) => {
    const [a, b, c] = face.map((i) => vertices[i]);
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0 ? [...face].reverse() : face;
  });
}

function eyeOutline(side, profile) {
  return [[.024,1.668],[.033,1.672],[.044,1.674],[.057,1.674],[.068,1.672],[.072,1.669],
    [.063,1.665],[.051,1.664],[.039,1.664],[.029,1.666]].map(([x,y]) => [x*side*profile.width*(profile.id==='sniper'?.82:1),(profile.id==='heavy'?1.669+(y-1.669)*.78+.004:y)+.032-profile.offset]);
}

// Start with the face outline and two constrained eye openings, then insert
// anatomical landmarks. Local edge flips create broad oblique planes instead
// of horizontal latitude bands around the cheeks and jaw.
function triangulateLandmarks(contour, holes, landmarks) {
  const vertices = [...contour, ...holes.flat()];
  const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const faces = THREE.ShapeUtils.triangulateShape(contour.map(p=>new THREE.Vector2(...p)),holes.map(loop=>loop.map(p=>new THREE.Vector2(...p))));
  for (const point of landmarks) {
    if (vertices.some(p=>Math.hypot(p[0]-point[0],p[1]-point[1])<.0001)) continue;
    const index = faces.findIndex(face=>{
      const p=face.map(i=>vertices[i]), signs=[cross(p[0],p[1],point),cross(p[1],p[2],point),cross(p[2],p[0],point)];
      return signs.every(v=>v>1e-10)||signs.every(v=>v< -1e-10);
    });
    if(index<0)continue;
    const [a,b,c]=faces[index],n=vertices.length;
    vertices.push(point); faces.splice(index,1,[a,b,n],[b,c,n],[c,a,n]);
  }
  for(let pass=0;pass<9;pass++) {
    const edges=new Map();
    faces.forEach((face,index)=>face.forEach((a,i)=>{
      const b=face[(i+1)%3],c=face[(i+2)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;
      const entries=edges.get(key)||[];entries.push({index,a,b,c});edges.set(key,entries);
    }));
    const used=new Set();let changed=false;
    for(const entries of edges.values()) {
      if(entries.length!==2)continue;
      const [first,second]=entries;
      if(used.has(first.index)||used.has(second.index))continue;
      const {a,b,c}=first,d=second.c,pa=vertices[a],pb=vertices[b],pc=vertices[c],pd=vertices[d];
      if(cross(pa,pb,pc)*cross(pa,pb,pd)>=0||cross(pc,pd,pa)*cross(pc,pd,pb)>=0)continue;
      const angle=(p,q,r)=>Math.acos(clamp(((p[0]-q[0])*(r[0]-q[0])+(p[1]-q[1])*(r[1]-q[1]))/(Math.hypot(p[0]-q[0],p[1]-q[1])*Math.hypot(r[0]-q[0],r[1]-q[1])),-1,1));
      if(angle(pa,pc,pb)+angle(pa,pd,pb)<=Math.PI+.001)continue;
      faces[first.index]=[c,d,a];faces[second.index]=[d,c,b];used.add(first.index);used.add(second.index);changed=true;
    }
    if(!changed)break;
  }
  return {vertices,faces};
}

function sculptSkull(parts, definition) {
  const { widthAt, zAt, colorAt, profile, id } = definition;
  const jawRise = y => .031*clamp((1.605-y)/.057,0,1);
  const contour = SECTIONS.map(([y])=>[-widthAt(y),y+jawRise(y)]);
  contour.push([0,1.812]);
  contour.push(...[...SECTIONS].reverse().map(([y])=>[widthAt(y),y+jawRise(y)]));
  const chinY=id==='assault'?1.548:id==='sniper'?1.560:id==='heavy'?1.555:1.552;
  const chinWidth=id==='assault'?.028:id==='heavy'?.046:.041;
  contour.push([chinWidth,chinY],[-chinWidth,chinY]);
  const holes=[eyeOutline(-1,profile),eyeOutline(1,profile)];
  const landmarks=[];
  for(const side of [-1,1]) {
    const points=[
      [.024,1.554],[.054,1.569],[.073,1.587],[.045,1.585],[.018,1.579],
      [.089,1.610],[.066,1.607],[.041,1.608],[.025,1.596],
      [.092,1.634],[.072,1.643],[.051,1.633],[.034,1.625],
      [.089,1.657],[.075,1.655],[.051,1.651],[.031,1.653],
      [.083,1.684],[.064,1.688],[.042,1.690],[.021,1.684],
      [.073,1.714],[.043,1.715],[.008,1.712],[.083,1.742],[.039,1.746],
      [.075,1.770],[.035,1.786],[.025,1.800],
    ];
    if(id!=='assault')points.push([.028,1.609],[.046,1.619],[.071,1.637],[.089,1.671],[.096,1.689]);
    landmarks.push(...points.map(([x,y])=>[side*x*profile.width,y]));
    for(const y of [1.612,1.621,1.629,1.636,1.648,1.659,1.674,1.691]) {
      landmarks.push([side*.008,y],[side*.019,y]);
    }
  }
  for(const y of [1.552,1.568,1.581,1.590,1.597,1.607,1.618,1.625,1.632,1.642,1.654,1.668,1.683,1.701,1.730,1.759,1.789,1.806])landmarks.push([0,y]);
  const front=triangulateLandmarks(contour,holes,landmarks);
  const vertices=front.vertices.map(([x,y])=>[x,y,zAt(x,y)]);
  definition.faceGeometry = addSurface(parts,vertices,forwardFaces(vertices,front.faces),colorAt,(x,y)=>y<1.610?.48:Math.abs(x)>.038&&y<1.675?.48:.70);
  definition.surfaceZ=(x,y)=>{const p=definition.faceGeometry.attributes.position;let closest=Infinity;for(let i=0;i<p.count;i+=3){const ax=p.getX(i),ay=p.getY(i),bx=p.getX(i+1),by=p.getY(i+1),cx=p.getX(i+2),cy=p.getY(i+2),det=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);if(Math.abs(det)<1e-12)continue;const u=((x-ax)*(cy-ay)-(y-ay)*(cx-ax))/det,v=((bx-ax)*(y-ay)-(by-ay)*(x-ax))/det;if(u>=-.00001&&v>=-.00001&&u+v<=1.00001)closest=Math.min(closest,p.getZ(i)*(1-u-v)+p.getZ(i+1)*u+p.getZ(i+2)*v);}return Number.isFinite(closest)?closest:zAt(x,y);};
  // Occipital shape joins the same temple/jaw boundary, with enough sections
  // to remain a skull rather than a vertical tube at the back of the ears.
  const back = [];
  const backFaces = [];
  const around = 18;
  for (let r = 0; r < SECTIONS.length; r += 1) {
    const [y, , , depth] = SECTIONS[r];
    const width = widthAt(y);
    const jawRise = .031 * clamp((1.605 - y) / .057, 0, 1);
    const sideZ = zAt(width, y + jawRise);
    for (let i = 0; i <= around; i += 1) {
      const angle = i / around * Math.PI;
      back.push([width * Math.cos(angle), y + jawRise * (1 + .25 * Math.sin(angle)), sideZ + (depth - sideZ) * Math.sin(angle)]);
    }
  }
  for (let r = 0; r < SECTIONS.length - 1; r += 1) {
    for (let i = 0; i < around; i += 1) {
      const a = r * (around + 1) + i;
      backFaces.push([a, a + 1, a + around + 1], [a + 1, a + around + 2, a + around + 1]);
    }
  }
  addSurface(parts, back, backFaces.map(face => face.reverse()), colorAt, .7);
  // Crown and underside are closed; the neck intersects the underside.
  const crown = [[-widthAt(1.806),1.806,zAt(-widthAt(1.806),1.806)],[widthAt(1.806),1.806,zAt(widthAt(1.806),1.806)],...back.slice(-(around + 1)).slice(1,-1)];
  const center = [0, 1.812, .026];
  const capVertices = [...crown, center];
  const capFaces = crown.map((_, i) => [i, crown.length, (i + 1) % crown.length]);
  addSurface(parts, capVertices, capFaces, colorAt, .6);
  // Seal the mandible to the rear skull. The inner fan intersects the neck;
  // the front corners follow the same flat chin boundary as the face.
  const lowest=SECTIONS[0][0],edgeY=lowest+jawRise(lowest),edgeX=widthAt(lowest);
  const underside=[[-edgeX,edgeY,zAt(-edgeX,edgeY)],[-chinWidth,chinY,zAt(-chinWidth,chinY)],
    [chinWidth,chinY,zAt(chinWidth,chinY)],[edgeX,edgeY,zAt(edgeX,edgeY)],...back.slice(1,around)];
  const bottomCenter=underside.length;
  underside.push([0,1.575,.018]);
  addSurface(parts,underside,Array.from({length:bottomCenter},(_,i)=>[i,(i+1)%bottomCenter,bottomCenter]),colorAt,.45);
  return vertices;
}

function ellipsePatch(parts, cx, cy, rx, ry, zAt, color, sides = 16, rise = .001) {
  const vertices = [[cx, cy, zAt(cx, cy) - rise]];
  for (let i = 0; i < sides; i += 1) {
    const a = i / sides * Math.PI * 2;
    const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
    vertices.push([x, y, zAt(x, y) - rise]);
  }
  const faces = Array.from({ length: sides }, (_, i) => [0, (i + 1) % sides + 1, i + 1]);
  addSurface(parts, vertices, faces, color, .85);
}

function faceStrip(parts, points, widths, definition, color, lift = .0012, smooth = .45) {
  if (definition.faceGeometry) {
    const shift = definition.featureShift || 0;
    const edge = (sign) => points.map(([x, y], i) => [x, y + shift + sign * (Array.isArray(widths) ? widths[i] : widths) / 2]);
    const first = parts.length;
    projectedFaceRegion(parts, definition, [...edge(1), ...edge(-1).reverse()], [], color, Math.min(lift, .00065));
    if (shift) for (const geometry of parts.slice(first)) geometry.translate(0, -shift, 0);
    return;
  }
  const vertices = [];
  for (let i = 0; i < points.length; i += 1) {
    const [x, y] = points[i], half = (Array.isArray(widths) ? widths[i] : widths) / 2;
    for (const yy of [y - half, y + half]) vertices.push([x, yy, (definition.surfaceZ||definition.zAt)(x, yy) - lift]);
  }
  const faces = [];
  for (let i = 0; i < points.length - 1; i += 1) faces.push([i * 2, i * 2 + 1, i * 2 + 2], [i * 2 + 1, i * 2 + 3, i * 2 + 2]);
  addSurface(parts, vertices, forwardFaces(vertices, faces), color, smooth);
}

function eyes(parts, skull, definition, style, id) {
  const { zAt, profile } = definition;
  const shift = .032 - profile.offset + (id==='heavy'?.004:0);
  for (const side of [-1, 1]) {
    const shape=eyeOutline(side,profile);
    const opening=shape.map(([x,y])=>[x,y,zAt(x,y)-.002]);
    const eyeCenter = [side * .047 * profile.width * (id==='sniper'?.82:1), (1.6690+shift), zAt(side * .047 * profile.width * (id==='sniper'?.82:1), (1.6690+shift)) - .004];
    const globe = [...opening, eyeCenter];
    const eyeFaces = opening.map((_, i) => [i, (i + 1) % opening.length, opening.length]);
    addSurface(parts, globe, forwardFaces(globe, eyeFaces), id==='heavy'?'#978d7a':'#b9b2a0', .85);
    const eyeZ = (x, y) => zAt(x, y) - .0042;
    ellipsePatch(parts, eyeCenter[0] - side * .002, (1.6690+shift), .0052, id==='heavy'?.0042:.0052, eyeZ, profile.eye, 14, .0006);
    ellipsePatch(parts, eyeCenter[0] - side * .002, (1.6690+shift), .0026, id==='heavy'?.0028:.0040, eyeZ, '#1e211f', 10, .0011);
    const upper = shape.slice(0, 6);
    const lower = [shape[0], ...shape.slice(6).reverse(), shape[5]];
    faceStrip(parts, upper, [.0013, .0021, .0025, .0027, .0025, .0012], definition, '#59402f', .0026);
    faceStrip(parts, lower, .0015, definition, style.shadow, .0024);
    // A three-dimensional raised brow follows the orbital ridge. Its color
    // and taper support a stern adult expression without huge black eyebrows.
    const brow = [[.018,(1.680+shift)],[.031,(1.685+shift)],[.046,(1.689+shift)],[.062,(1.693+shift)],[.077,(1.695+shift)],[.084,(1.692+shift)]];
    faceStrip(parts, brow.map(([x, y]) => [side * x * profile.width, y]), id === 'assault' ? [.004, .008, .010, .0085, .005, .001] : [.004, .008, .010, .0085, .005, .001], definition, profile.hair, .0028, .25);
    // Lower lid volume and a restrained nasolabial crease catch the studio key.
    faceStrip(parts, [[.035, (1.6570+shift)], [.052, (1.6540+shift)], [.068, (1.6580+shift)]].map(([x, y]) => [x * side * profile.width, y]), [.001, .0023, .001], definition, new THREE.Color(style.skin).lerp(new THREE.Color(style.shadow), .17), .0006);
  }
}

function noseAndMouth(parts, definition, style, id) {
  const shift = .032 - definition.profile.offset;
  const source = definition;
  definition = { ...source, featureShift: shift, zAt: (x,y) => (source.surfaceZ||source.zAt)(x,y+shift), surfaceZ: (x,y) => (source.surfaceZ||source.zAt)(x,y+shift) };
  const first = parts.length;
  const { profile, zAt } = definition;
  for (const side of [-1, 1]) {
    ellipsePatch(parts, side * .0125 * profile.nose, 1.6255, .0045, .0018, zAt, '#714c36', 10, .001);
    faceStrip(parts, [[side * .022, 1.6250], [side * .027, 1.6110], [side * .034, 1.6000]], [.001, .0016, .0005], definition, new THREE.Color(style.skin).lerp(new THREE.Color(style.shadow), .30), .0007);
  }
  const lip = new THREE.Color(profile.lips);
  const lipRows = [
    [[-.029, 1.5940], [-.020, 1.5970], [-.009, 1.6000], [0, 1.5975], [.009, 1.6000], [.020, 1.5970], [.029, 1.5940]],
    [[-.029, 1.5930], [-.020, 1.5930], [-.009, 1.5935], [0, 1.5937], [.009, 1.5935], [.020, 1.5930], [.029, 1.5930]],
    [[-.028, 1.5920], [-.020, 1.5880], [-.009, 1.5865], [0, 1.5860], [.009, 1.5865], [.020, 1.5880], [.028, 1.5920]],
  ];
  if(id!=='assault')for(const row of lipRows)for(const point of row){point[0]*=.72;point[1]=1.593+(point[1]-1.593)*.65-.010+(id==='heavy'?.010:0);}
  const vertices = lipRows.flatMap((row, r) => row.map(([x, y]) => [x, y, zAt(x, y) - (r === 1 ? .0015 : .0008)]));
  const faces = [];
  for (let r = 0; r < 2; r += 1) for (let c = 0; c < 6; c += 1) {
    const a = r * 7 + c;
    faces.push([a, a + 1, a + 7], [a + 1, a + 8, a + 7]);
  }
  addSurface(parts, vertices, forwardFaces(vertices, faces), (x, y) => y < 1.5930 ? lip.clone().lerp(new THREE.Color(style.skin), .27) : lip, .65);
  faceStrip(parts, lipRows[1], [.0006, .0014, .0015, .0015, .0015, .0014, .0006], definition, '#654531', id==='assault'?.0043:.0022, .55);
  if (id !== 'assault') {
    const beard = PROFILES[id].beard;
    for (const side of [-1, 1]) {
      faceStrip(parts, [[side * .002, 1.6130], [side * .012, 1.6140], [side * .023, 1.6080], [side * .030, 1.6020]], [.004, .007, .006, .002], definition, id === 'scout' ? '#956847' : beard, .001, .6);
    }
    faceStrip(parts, [[-.009, 1.5750], [0, 1.5730], [.009, 1.5750]], [.001, .006, .001], definition, beard, .0007);
  }
  for(const geometry of parts.slice(first)) geometry.translate(0,shift,0);
}

// Clip a sharp beard boundary to the actual facial triangles, retaining their
// normals. The beard is a colored region of the jaw, never a floating slab.
function beardSurface(parts, definition, paint = null) {
  const { id, profile, faceGeometry: surface }=definition;
  if(id==='assault')return;
  const shift=.032-profile.offset;
  const side=[ [0,1.520],[.160,1.520],[.160,1.694],
    [.094,1.690],[.085,1.659],[.080,1.632],[.060,1.614],[.040,1.632],[.018,1.641],[0,1.635] ];
  let contour=[...side,...side.slice(1,-1).reverse().map(([x,y])=>[-x,y])].map(([x,y])=>[x*profile.width,y+shift*.3]);
  let mouth=[[-.025,1.595],[-.024,1.580],[-.012,1.575],[.012,1.575],[.024,1.580],[.025,1.595]].map(([x,y])=>[x*profile.width,y+shift+(id==='heavy'?.010:0)]);
  if(paint){contour=paint.contour;mouth=[];}
  const beard=new THREE.Color(paint?.color||profile.beard);
  if(id==='scout')beard.lerp(definition.skin,.58);
  projectedFaceRegion(parts, definition, contour, mouth, beard);
}

function projectedFaceRegion(parts, definition, contour, mouth, color, lift=.0005) {
  const surface=definition.faceGeometry;
  const regions=THREE.ShapeUtils.triangulateShape(contour.map(p=>new THREE.Vector2(...p)),mouth.length?[mouth.map(p=>new THREE.Vector2(...p))]:[]);
  const all=[...contour,...mouth],p=surface.attributes.position,n=surface.attributes.normal;
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  for(let t=0;t<p.count;t+=3){
    const tri=[0,1,2].map(i=>[p.getX(t+i),p.getY(t+i),p.getZ(t+i)]);
    const signed=cross(tri[0],tri[1],tri[2]);if(Math.abs(signed)<1e-12)continue;
    for(const region of regions){
      let polygon=region.map(i=>all[i]);
      for(let e=0;e<3&&polygon.length;e++){
        const a=tri[e],b=tri[(e+1)%3],clipped=[];
        for(let i=0;i<polygon.length;i++){
          const v=polygon[i],w=polygon[(i+1)%polygon.length],dv=cross(a,b,v),dw=cross(a,b,w);
          if(dv*signed>=-1e-13)clipped.push(v);
          if((dv<0)!==(dw<0)){const ratio=dv/(dv-dw);clipped.push([v[0]+(w[0]-v[0])*ratio,v[1]+(w[1]-v[1])*ratio]);}
        }polygon=clipped;
      }
      if(polygon.length<3)continue;
      const [a,b,c]=tri;
      const positions=polygon.map(([x,y])=>{
        const u=((x-a[0])*(c[1]-a[1])-(c[0]-a[0])*(y-a[1]))/signed;
        const v=((b[0]-a[0])*(y-a[1])-(x-a[0])*(b[1]-a[1]))/signed;
        return [x,y,a[2]+u*(b[2]-a[2])+v*(c[2]-a[2])-lift];
      });
      const faces=[];
      for(let i=1;i<positions.length-1;i++)if(Math.abs(cross(positions[0],positions[i],positions[i+1]))>1e-12)faces.push([0,i,i+1]);
      if(!faces.length)continue;
      const geometry=addSurface(parts,positions,forwardFaces(positions,faces),color,.5);
      const gp=geometry.attributes.position,gn=geometry.attributes.normal;
      for(let i=0;i<gp.count;i++){
        const x=gp.getX(i),y=gp.getY(i),u=((x-a[0])*(c[1]-a[1])-(c[0]-a[0])*(y-a[1]))/signed,v=((b[0]-a[0])*(y-a[1])-(x-a[0])*(b[1]-a[1]))/signed;
        const normal=new THREE.Vector3().fromBufferAttribute(n,t).multiplyScalar(1-u-v).addScaledVector(new THREE.Vector3().fromBufferAttribute(n,t+1),u).addScaledVector(new THREE.Vector3().fromBufferAttribute(n,t+2),v).normalize();
        gn.setXYZ(i,normal.x,normal.y,normal.z);
      }
    }
  }
}

function ears(parts, definition, style) {
  for (const side of [-1, 1]) {
    const vertices = [], faces = [];
    const centerX = .102 * definition.profile.width * side;
    const centerY = 1.682;
    const rings = [[1, .003], [.80, -.006], [.53, .001], [.20, -.001]];
    const segments = 14;
    for (const [radius, depth] of rings) {
      for (let i = 0; i < segments; i += 1) {
        const a = i / segments * Math.PI * 2;
        const yy = Math.sin(a);
        vertices.push([centerX + side * (.007 + Math.cos(a) * .013 * radius * (yy < 0 ? .75 : 1)), centerY + yy * .022 * radius, .014 + depth + Math.cos(a) * .009 * radius]);
      }
    }
    for (let r = 0; r < rings.length - 1; r += 1) for (let i = 0; i < segments; i += 1) {
      const a = r * segments + i, b = r * segments + (i + 1) % segments;
      faces.push([a, b, a + segments], [b, b + segments, a + segments]);
    }
    const last = (rings.length - 1) * segments;
    for (let i = 1; i < segments - 1; i += 1) faces.push([last, last + i, last + i + 1]);
    addSurface(parts, vertices, forwardFaces(vertices, faces), (x, y, z) => new THREE.Color(style.skin).lerp(new THREE.Color(style.shadow), z > -.001 ? .22 : 0), .7);
    // The rear surface and earlobe make a real ear silhouette in a side view.
    const back = vertices.slice(0, segments).map(([x, y, z]) => [x - side * .006, y, z + .015]);
    const rim = [...vertices.slice(0, segments), ...back];
    const rimFaces = [];
    for (let i = 0; i < segments; i += 1) {
      const j = (i + 1) % segments;
      rimFaces.push([i, j, i + segments], [j, j + segments, i + segments]);
    }
    for (let i = 1; i < segments - 1; i += 1) rimFaces.push([segments, segments + i, segments + i + 1]);
    if (side < 0) rimFaces.forEach((face) => face.reverse());
    addSurface(parts, rim, rimFaces, style.skin, .65);
  }
}

function hairMass(parts, sections, color, segments = 24, smooth = .25) {
  const vertices = [], faces = [];
  for (const [x, y, z, width, depth] of sections) {
    for (let i = 0; i < segments; i += 1) {
      const a = i / segments * Math.PI * 2;
      vertices.push([x + Math.sin(a) * width / 2, y, z - Math.cos(a) * depth / 2]);
    }
  }
  for (let r = 0; r < sections.length - 1; r += 1) for (let i = 0; i < segments; i += 1) {
    const a = r * segments + i, b = r * segments + (i + 1) % segments;
    faces.push([a, a + segments, b], [b, a + segments, b + segments]);
  }
  for (let i = 1; i < segments - 1; i += 1) {
    faces.push([0, i, i + 1]);
    const end = (sections.length - 1) * segments;
    faces.push([end, end + i + 1, end + i]);
  }
  return addSurface(parts, vertices, faces, color, smooth);
}

// A curved lock has a full elliptical cross-section along its path. These
// tapered, connected volumes create a hairstyle in profile and from behind.
function hairLock(parts, points, width, depth, color, samples = 8, sides = 7) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)), false, 'centripetal');
  const vertices = [], faces = [];
  for (let r = 0; r <= samples; r += 1) {
    const t = r / samples;
    const center = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    const across = new THREE.Vector3().crossVectors(FRONT, tangent).normalize();
    if (across.lengthSq() < .01) across.set(1, 0, 0);
    const outward = new THREE.Vector3().crossVectors(tangent, across).normalize();
    const taper = .40 + .60 * Math.sin(Math.PI * (.08 + t * .84));
    const tip = r === samples ? .08 : taper;
    for (let i = 0; i < sides; i += 1) {
      const a = i / sides * Math.PI * 2;
      vertices.push(center.clone().addScaledVector(across, Math.cos(a) * width * tip / 2).addScaledVector(outward, Math.sin(a) * depth * tip / 2).toArray());
    }
  }
  for (let r = 0; r < samples; r += 1) for (let i = 0; i < sides; i += 1) {
    const a = r * sides + i, b = r * sides + (i + 1) % sides;
    faces.push([a, b, a + sides], [b, b + sides, a + sides]);
  }
  for (let i = 1; i < sides - 1; i += 1) {
    faces.push([0, i + 1, i]);
    const end = samples * sides;
    faces.push([end, end + i, end + i + 1]);
  }
  addSurface(parts, vertices, faces, color, .15);
}

function scalpCap(parts, id, color) {
  const vertices = [], faces = [];
  const segments = 28, levels = 7;
  const top = id === 'assault' ? 1.823 : id === 'scout' ? 1.815 : id==='sniper' ? 1.791 : 1.810;
  for (let r = 0; r <= levels; r += 1) {
    const t = r / levels;
    for (let i = 0; i < segments; i += 1) {
      const a = i / segments * Math.PI * 2;
      const front = Math.max(0, Math.cos(a));
      const side = Math.sin(a);
      let bottom = 1.704 + .057 * front;
      if (id === 'assault') bottom = 1.600 + .144 * front - .027 * Math.max(0, side);
      if (id === 'sniper') bottom = 1.722 + .024 * front;
      if (id === 'heavy') bottom = 1.709 + .048 * front - .022 * Math.abs(side);
      const radius = Math.sqrt(t * (2 - t));
      const width = id === 'heavy' ? .127 : id === 'assault' ? .128 : .116;
      const curl = id === 'assault' ? 1 - .10 * t ** 5 : 1;
      vertices.push([Math.sin(a) * width * radius * curl + (id === 'assault' ? .009 * (1 - t) : 0), top + (bottom - top) * t, .018 - Math.cos(a) * .130 * radius]);
    }
  }
  for (let r = 0; r < levels; r += 1) for (let i = 0; i < segments; i += 1) {
    const a = r * segments + i, b = r * segments + (i + 1) % segments;
    if (r > 0) faces.push([a, b, a + segments]);
    faces.push([b, b + segments, a + segments]);
  }
  addSurface(parts, vertices, faces, color, .28);
}

function emberHair(parts, color) {
  scalpCap(parts, 'assault', color);
  hairMass(parts,[[0,1.729,.036,.246,.235],[.005,1.756,.025,.267,.265],[0,1.786,.024,.254,.256],[.005,1.808,.025,.181,.192],[.005,1.821,.029,.086,.096]],color,20,.16);
  const variations = ['#463a35', '#4d3f38', '#3b312e', '#423632'];
  const locks = [
    [[-.079,1.776,-.066],[-.035,1.805,-.087],[.032,1.778,-.111],[.083,1.723,-.103],[.115,1.661,-.037]],
    [[-.069,1.802,-.008],[-.008,1.824,-.046],[.065,1.789,-.077],[.109,1.713,-.049],[.122,1.639,.003]],
    [[-.093,1.772,-.031],[-.055,1.814,-.050],[.010,1.818,-.041],[.078,1.776,-.026],[.130,1.682,.023],[.115,1.612,.035]],
    [[-.101,1.769,.009],[-.124,1.720,.021],[-.114,1.654,.032],[-.092,1.624,.028]],
    [[.072,1.781,.077],[.130,1.736,.068],[.132,1.650,.066],[.109,1.592,.073]],
    [[-.064,1.783,.097],[-.112,1.711,.096],[-.094,1.631,.108],[-.070,1.589,.099]],
    [[.001,1.790,.123],[.035,1.704,.144],[.049,1.636,.131],[.023,1.591,.123]],
    [[.052,1.772,.121],[.085,1.702,.131],[.078,1.617,.125],[.062,1.574,.113]],
  ];
  locks.forEach((points, i) => hairLock(parts, points, i === 0 ? .102 : i < 3 ? .072 : .056, i < 3 ? .027 : .034, variations[i % variations.length], i < 3 ? 7 : 6, 5));
}

function goggles(parts) {
  const strap = '#2b2a28';
  hairMass(parts, [[0,1.742,.010,.246,.236],[0,1.758,.010,.247,.237]], strap, 24);
  for (const side of [-1, 1]) {
    const center = new THREE.Vector3(side * .055, 1.754, -.103);
    const vertices = [], faces = [];
    const rings = [[.046,.040,.005],[.047,.040,-.006],[.037,.030,-.014],[.034,.027,-.012]];
    for (const [rx, ry, z] of rings) for (let i = 0; i < 8; i += 1) {
      const a = (i + .5) / 8 * Math.PI * 2;
      const point = new THREE.Vector3(Math.cos(a) * rx, Math.sin(a) * ry, z).applyAxisAngle(UP, -side * .28).add(center);
      vertices.push(point.toArray());
    }
    for (let r = 0; r < rings.length - 1; r += 1) for (let i = 0; i < 8; i += 1) {
      const a = r * 8 + i, b = r * 8 + (i + 1) % 8;
      faces.push([a, a + 8, b], [b, a + 8, b + 8]);
    }
    addSurface(parts, vertices, faces, strap, .25);
    const lens = vertices.slice(-8);
    const lensFaces = [];
    for (let i = 1; i < 7; i += 1) lensFaces.push([0,i+1,i]);
    addSurface(parts, lens, forwardFaces(lens, lensFaces), (x,y) => new THREE.Color(y > 1.76 ? '#c6c5b9' : '#969f9d'), .15);
  }
  hairLock(parts, [[-.011,1.753,-.111],[0,1.758,-.117],[.011,1.753,-.111]], .014, .015, strap, 3, 6);
}

function maleHair(parts, id, profile) {
  if(id==='scout'){scalpCap(parts,id,profile.hair);hairMass(parts,[[0,1.741,.018,.235,.242],[0,1.776,.020,.247,.254],[0,1.808,.023,.215,.226],[0,1.826,.026,.090,.110]],profile.hair,14,.12);}

  if (id === 'sniper') {
    // A fitted band and a broad cloth crown, tilted down over one temple.
    hairMass(parts,[[0,1.739,.018,.219,.221],[0,1.767,.020,.208,.205],[0,1.789,.022,.125,.139]],'#43536a',16,.15);
    hairMass(parts, [[0,1.734,.020,.227,.214],[0,1.746,.020,.229,.216]], '#303b49', 24, .4);
    const beret = hairMass(parts, [[0,1.754,.018,.223,.212],[.033,1.767,.024,.292,.250],[.012,1.802,.025,.272,.248],[-.012,1.824,.026,.226,.212],[-.006,1.827,.028,.130,.135]], '#4e5f77', 10, .12);
    beret.translate(0,-1.776,0); beret.rotateZ(-.27); beret.translate(0,1.776,0);
    const bp=beret.attributes.position;for(let i=0;i<bp.count;i++)bp.setY(i,1.73+(bp.getY(i)-1.73)*.82-.018);beret.computeVertexNormals();
    const projectBadge = (x,y) => {
      const p=beret.attributes.position;let closest=Infinity;
      for(let i=0;i<p.count;i+=3){
        const ax=p.getX(i),ay=p.getY(i),bx=p.getX(i+1),by=p.getY(i+1),cx=p.getX(i+2),cy=p.getY(i+2);
        const det=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);if(Math.abs(det)<1e-12)continue;
        const u=((x-ax)*(cy-ay)-(y-ay)*(cx-ax))/det,v=((bx-ax)*(y-ay)-(by-ay)*(x-ax))/det;
        if(u>=0&&v>=0&&u+v<=1)closest=Math.min(closest,p.getZ(i)*(1-u-v)+p.getZ(i+1)*u+p.getZ(i+2)*v);
      }
      return [x,y,closest-.001];
    };
    const badge=[[-.061,1.766],[-.052,1.7665],[-.043,1.767],[-.043,1.780],[-.043,1.792],[-.0505,1.7945],[-.058,1.797],[-.0595,1.7815],[-.052,1.782]].map(([x,y])=>{const p=projectBadge(x,y);p[2]-=.002;return p;});
    if(badge.every(p=>p.every(Number.isFinite)))addSurface(parts,badge,forwardFaces(badge,Array.from({length:8},(_,i)=>[i,(i+1)%8,8])),'#c1a566',0);
  } else if (id === 'scout') {
    const locks = [
      [[-.084,1.761,-.036],[-.073,1.809,-.033],[-.096,1.837,-.025]],
      [[-.046,1.782,-.052],[-.036,1.832,-.039],[-.059,1.851,-.023]],
      [[-.008,1.788,-.044],[.020,1.834,-.025],[.008,1.850,-.008]],
      [[.042,1.780,-.019],[.066,1.820,.003],[.092,1.820,.025]],
      [[-.068,1.788,.040],[-.054,1.822,.073],[-.077,1.840,.086]],
      [[.001,1.790,.061],[.020,1.826,.090],[.006,1.845,.102]],
      [[.069,1.770,.062],[.093,1.796,.086],[.113,1.798,.103]],
    ];
    locks.forEach((points,i)=>{const vertices=[];for(let r=0;r<2;r++){const [x,y,z]=points[r],w=r===0?.032:.024,d=r===0?.026:.018;vertices.push([x-w,y,z-d],[x+w,y,z-d],[x+w,y,z+d],[x-w,y,z+d]);}vertices.push(points[2]);const faces=[[0,3,2],[0,2,1]];for(let j=0;j<4;j++){const next=(j+1)%4;faces.push([j,j+4,next],[next,j+4,next+4],[j+4,8,next+4]);}addSurface(parts,vertices,faces,i%2?'#514034':profile.hair,0);});
    goggles(parts);
  }
}

/** A single articulated adult head. Its origin remains the existing neck pivot. */
export function makeHead(id, style) {
  const parts = [];
  const definition = makeFaceDefinition(id, style);
  const skull = sculptSkull(parts, definition);
  eyes(parts, skull, definition, style, id);
  beardSurface(parts, definition);
  if(id==='heavy')beardSurface(parts,definition,{color:definition.profile.hair,contour:[[-.15,1.728],[-.106,1.722],[-.095,1.734],[-.081,1.745],[-.052,1.751],[.052,1.751],[.081,1.745],[.095,1.734],[.106,1.722],[.15,1.728],[.15,1.84],[-.15,1.84]]});
  noseAndMouth(parts, definition, style, id);
  ears(parts, definition, style);
  if(id==='sniper')for(const geometry of parts){const positions=geometry.attributes.position,normals=geometry.attributes.normal;for(let i=0;i<positions.count;i++){const y=positions.getY(i);if(y>1.720){positions.setY(i,1.720+(y-1.720)*.72);const normal=new THREE.Vector3(normals.getX(i),normals.getY(i)/.72,normals.getZ(i)).normalize();normals.setXYZ(i,normal.x,normal.y,normal.z);}}}
  const hairStart = parts.length;
  if (id === 'assault') emberHair(parts, definition.profile.hair);
  else maleHair(parts, id, definition.profile);
  if (id === 'assault') {
    for (const geometry of parts.slice(hairStart + 2)) {
      const positions = geometry.attributes.position;
      for (let i = 0; i < positions.count; i += 1) {
        const y = positions.getY(i);
        if (y > 1.760) positions.setY(i, 1.760 + (y - 1.760) * .69);
      }
      geometry.computeVertexNormals();
    }
  }
  if(id==='scout')for(const geometry of parts.slice(hairStart)){const positions=geometry.attributes.position;for(let i=0;i<positions.count;i++){const y=positions.getY(i);if(y>1.770)positions.setY(i,1.770+(y-1.770)*.78);}geometry.computeVertexNormals();}
  if(id==='sniper')for(const geometry of parts)geometry.scale(.88,1,1);
  if(id==='heavy')for(const geometry of parts)geometry.scale(.90,1,1);
  if(id==='scout')for(const geometry of parts){geometry.translate(0,-1.54,0);geometry.scale(1,.9,1);geometry.translate(0,1.516,0);}
  for(const geometry of parts){const p=geometry.attributes.position,n=geometry.attributes.normal;for(let i=0;i<p.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2),face=new THREE.Vector3().crossVectors(b.sub(a),c.sub(a)).normalize();for(let j=i;j<i+3;j++){const normal=new THREE.Vector3().fromBufferAttribute(n,j);if(normal.dot(face)<.05)n.setXYZ(j,face.x,face.y,face.z);}}}
  const mesh = makeMesh(parts, 'character-head', PIVOT);
  mesh.material.flatShading = false;
  mesh.rotation.y = id === 'assault' ? .23 : id === 'scout' ? .24 : id==='sniper'?.27:.22;
  return mesh;
}
