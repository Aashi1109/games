import * as THREE from 'three';
import { stroke, makeMesh, triangles, colored } from './character-geometry.js';
import { makeHead } from './character-heads.js';
import { makeEmberHead, paintedSurface } from './ember-head.js';
import { createWeaponModel } from './weapon-models.js';
import { fitEmberWeapon } from './ember-weapon-fit.js';

const PALETTES = {
  assault: { name: 'Ember', skin: '#c18b61', shadow: '#946246', hair: '#302b2b', cloth: '#ca6437', dark: '#404044', armor: '#515257', accent: '#e28643', shoulder: 0.188, bulk: 1, chest: 0.403, waist: 0.318, hips: 0.348, thigh: 0.199, calf: 0.159, sleeve: 0.163, forearm: 0.104, stance: [-0.258, 0.308], step: [0.032, -0.028] },
  sniper: { name: 'Wisp', skin: '#c29872', shadow: '#986e50', hair: '#403b38', cloth: '#45596f', dark: '#3b4659', armor: '#364354', accent: '#bc9b55', shoulder: 0.186, bulk: 1.05, chest: 0.409, waist: 0.338, hips: 0.355, thigh: 0.213, calf: 0.174, sleeve: 0.16, forearm: 0.12, stance: [-0.229, 0.291], step: [0.045, -0.038] },
  scout: { name: 'Dash', skin: '#c89263', shadow: '#a16e48', hair: '#42342c', cloth: '#37393b', dark: '#41413f', armor: '#39616a', accent: '#bf974e', shoulder: 0.205, bulk: 1.03, chest: 0.419, waist: 0.322, hips: 0.345, thigh: 0.215, calf: 0.173, sleeve: 0.169, forearm: 0.129, stance: [-0.283, 0.312], step: [-0.015, 0.057] },
  heavy: { name: 'Rook', skin: '#805438', shadow: '#63402d', hair: '#2c2926', cloth: '#353734', dark: '#40413b', armor: '#68704c', accent: '#8b9063', shoulder: 0.254, bulk: 1.2, chest: 0.506, waist: 0.34, hips: 0.418, thigh: 0.265, calf: 0.212, sleeve: 0.219, forearm: 0.162, stance: [-0.283, 0.285], step: [-0.019, 0.033] },
};

const point = (x, y, z) => new THREE.Vector3(x, y, z);
const STANCES = {
  Ember: { shift: 0.035, knees: [0.51, 0.58], heights: [0.553, 0.566], toes: [0.42, -1.02] },
  Wisp: { shift: -0.028, knees: [0.95, 0.48], heights: [0.537, 0.517], toes: [-0.18, -0.96] },
  Dash: { shift: -0.019, knees: [0.65, 1.37], heights: [0.536, 0.508], toes: [0.08, -0.88] },
  Rook: { shift: 0.023, knees: [0.55, 0.95], heights: [0.535, 0.522], toes: [0.65, -0.32] },
};

// Ember uses the same orthographic reference frame as her reconstructed head.
// Screen-space landmarks set the pose; depth remains actual closed 3D geometry.
const EMBER_D = new THREE.Vector3(.4,.08,-1).normalize();
const EMBER_R = new THREE.Vector3(-1,0,-.4).normalize();
const EMBER_U = new THREE.Vector3().crossVectors(EMBER_D,EMBER_R);
function emberPoint(x,y,depth=0) {
  return point(0,1.67,0).addScaledVector(EMBER_R,(x-196)/465).addScaledVector(EMBER_U,(130-y)/465).addScaledVector(EMBER_D,depth);
}

function referenceLoft(parts,sections,color,{sides=12,open=0,thickness=0}={}) {
  const vertices=[],faces=[],count=open?sides+1:sides,layers=thickness?2:1;
  for(let layer=0;layer<layers;layer++) for(const [left,right,y,front,back,slant=0,frontDrop=0] of sections) {
    const center=(left+right)/2,half=(right-left)/2-layer*thickness*465;
    for(let i=0;i<count;i++){
      const angle=open?open+(Math.PI*2-open*2)*i/sides:i/sides*Math.PI*2;
      const c=Math.cos(angle),s=Math.sin(angle),depth=c*(c>0?front-layer*thickness:back-layer*thickness);
      vertices.push(emberPoint(center+half*s,y+slant*s+frontDrop*Math.max(0,c)**2,depth).toArray());
    }
  }
  const length=sections.length*count;
  for(let layer=0;layer<layers;layer++) for(let r=0;r<sections.length-1;r++) for(let i=0;i<sides;i++){
    const a=layer*length+r*count+i,b=layer*length+r*count+(i+1)%count;
    const pair=[[a,b,a+count],[b,b+count,a+count]];
    if(layer)pair.forEach(f=>f.reverse());faces.push(...pair);
  }
  if(thickness){
    for(const r of [0,sections.length-1])for(let i=0;i<sides;i++){
      const a=r*count+i,b=r*count+(i+1)%count,pair=[[a,b+length,b],[a,a+length,b+length]];
      if(r===0)pair.forEach(f=>f.reverse());faces.push(...pair);
    }
    if(open)for(let r=0;r<sections.length-1;r++)for(const i of [0,sides]){
      const a=r*count+i,b=a+count,pair=[[a,b,a+length],[b,b+length,a+length]];
      if(i===sides)pair.forEach(f=>f.reverse());faces.push(...pair);
    }
  }else if(!open){
    for(let i=1;i<sides-1;i++)faces.push([0,i+1,i],[length-count,length-count+i,length-count+i+1]);
  }
  triangles(parts,vertices,faces,color);
}

function referencePanel(parts,outline,depth,color,thickness=.008,paint=false) {
  if(typeof depth==='function'){
    // Follow the curved garment between its corners. A flat chord would cut
    // through the torso and expose fragments of its underlying shell.
    const topology=THREE.ShapeUtils.triangulateShape(outline.map(([x,y])=>new THREE.Vector2(x,-y)),[]);
    const vertices=[],faces=[],paintVertices=[],paintFaces=[];
    const add=(a,b,c)=>{
      const longest=Math.max(Math.hypot(a[0]-b[0],a[1]-b[1]),Math.hypot(b[0]-c[0],b[1]-c[1]),Math.hypot(c[0]-a[0],c[1]-a[1]));
      if(longest>7){const mid=(p,q)=>[(p[0]+q[0])/2,(p[1]+q[1])/2,((p[2]||0)+(q[2]||0))/2],ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);add(a,ab,ca);add(ab,b,bc);add(ca,bc,c);add(ab,bc,ca);return;}
      const start=vertices.length;
      for(const layer of [0,thickness])for(const [x,y,d=0] of [a,b,c])vertices.push(emberPoint(x,y,depth(x,y)+d-layer).toArray());
      if(paint){const p=paintVertices.length;for(const [x,y,d=0] of [a,b,c])paintVertices.push([x,y,depth(x,y)+d]);paintFaces.push([p,p+1,p+2]);}
      else faces.push([start,start+1,start+2]);
      faces.push([start+3,start+5,start+4]);
    };
    for(const face of topology)add(...face.map(i=>outline[i]));
    for(let i=0;i<outline.length;i++){
      const a=outline[i],b=outline[(i+1)%outline.length],steps=Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1])/5);
      for(let j=0;j<steps;j++){
        const p=[a[0]+(b[0]-a[0])*j/steps,a[1]+(b[1]-a[1])*j/steps],q=[a[0]+(b[0]-a[0])*(j+1)/steps,a[1]+(b[1]-a[1])*(j+1)/steps],start=vertices.length;
        for(const [x,y] of [p,q])for(const layer of [0,thickness])vertices.push(emberPoint(x,y,depth(x,y)-layer).toArray());
        faces.push([start,start+2,start+1],[start+2,start+3,start+1]);
      }
    }
    triangles(parts,vertices,faces,color);if(paint)paintedSurface(parts,paintVertices,paintFaces);return;
  }
  const n=outline.length,front=outline.map(([x,y,d=0])=>emberPoint(x,y,(typeof depth==='function'?depth(x,y):depth)+d).toArray());
  const back=front.map(p=>new THREE.Vector3(...p).addScaledVector(EMBER_D,-thickness).toArray());
  const flat=outline.map(([x,y])=>new THREE.Vector2(x,-y));
  const cap=THREE.ShapeUtils.triangulateShape(flat,[]),vertices=[...front,...back],faces=[];
  for(const tri of cap){
    const normal=new THREE.Vector3().subVectors(new THREE.Vector3(...front[tri[1]]),new THREE.Vector3(...front[tri[0]])).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...front[tri[2]]),new THREE.Vector3(...front[tri[0]])));
    const f=normal.dot(EMBER_D)>0?tri:[...tri].reverse();
    if(paint)paintedSurface(parts,outline.map(([x,y,d=0])=>[x,y,depth+d]),[f]);else faces.push(f);
    faces.push([...f].reverse().map(i=>i+n));
  }
  const area=flat.reduce((sum,a,i)=>{const b=flat[(i+1)%n];return sum+a.x*b.y-b.x*a.y;},0);
  for(let i=0;i<n;i++){const j=(i+1)%n,pair=[[i,i+n,j],[j,i+n,j+n]];if(area<0)pair.forEach(f=>f.reverse());faces.push(...pair);}
  triangles(parts,vertices,faces,color);
}

function makeEmberTorso(style) {
  const parts=[];
  const jacketProfile=[[102,253,349,.139],[101,263,323,.145],[98,276,275,.151],[116,280,236,.123],[138,255,213,.086]];
  const jacketSurface=(offset=0)=>(x,y)=>{
    let a=jacketProfile[0],b=a;
    for(let i=1;i<jacketProfile.length;i++){b=jacketProfile[i];if(y>=b[2])break;a=b;}
    const t=a===b?0:THREE.MathUtils.clamp((a[2]-y)/(a[2]-b[2]),0,1);
    const left=THREE.MathUtils.lerp(a[0],b[0],t),right=THREE.MathUtils.lerp(a[1],b[1],t),radius=THREE.MathUtils.lerp(a[3],b[3],t);
    const q=(x-(left+right)/2)/((right-left)/2);
    return Math.sqrt(Math.max(.02,1-q*q))*radius+offset;
  };
  referenceLoft(parts,[[123,224,476,.105,.10],[101,246,433,.119,.112],[107,239,396,.112,.107],[118,231,361,.106,.102],[106,255,318,.126,.11],[101,265,274,.139,.114],[120,267,235,.119,.092],[154,224,213,.084,.079,0,27]],style.dark,{sides:12});
  // One open garment shell; the lapels and hems are continuations of its edges.
  referenceLoft(parts,[[102,253,349,.139,.121,-5],[101,263,323,.145,.124,-4],[98,276,275,.151,.126,-3],[116,280,236,.123,.105,3],[138,255,213,.086,.084,4]],style.cloth,{sides:16,open:.53,thickness:.012});
  referencePanel(parts,[[162,232],[151,250],[134,277],[142,319],[151,349],[210,352],[220,319],[218,270],[209,235],[196,239],[176,240]],jacketSurface(.002),'#48474d',.018);
  referencePanel(parts,[[145,268],[217,268],[219,287],[140,285]],jacketSurface(.006),'#555259',.005);
  referencePanel(parts,[[143,315],[219,317],[217,331],[147,329]],jacketSurface(.006),'#3d3c42',.005);
  referencePanel(parts,[[136,218],[162,227],[149,258],[136,297],[140,344],[112,351],[103,318],[105,277]],jacketSurface(.006),'#b95831',.014);
  referencePanel(parts,[[217,220],[243,210],[266,232],[258,290],[251,342],[223,344],[220,291]],jacketSurface(.006),'#c45e34',.015);
  referencePanel(parts,[[225,254],[259,248],[256,283],[222,289]],jacketSurface(.009),'#cb6738',.005);
  referencePanel(parts,[[105,289],[140,279],[137,313],[107,323]],jacketSurface(.009),'#c56a3c',.005);
  referencePanel(parts,[[222,344],[251,344],[247,369],[218,368]],.139,'#ad754e',.018);
  referenceLoft(parts,[[154,228,216,.091,.089],[147,231,194,.085,.085]],'#b95831',{sides:14,open:.86,thickness:.008});
  referencePanel(parts,[[138,196,-.055],[154,188,-.04],[164,220,.076],[153,241,.106],[145,219,.022]],0,'#c9693b',.012,true);
  referencePanel(parts,[[221,211,.057],[224,187,-.016],[248,183,-.055],[237,216,.018],[219,243,.11]],0,'#bd592f',.012,true);
  referencePanel(parts,[[224,187,-.011],[248,183,-.05],[246,190,-.039],[224,198,.015]],0,'#d47943',.005,true);
  referencePanel(parts,[[125,207],[141,211],[136,234],[113,241],[114,222]],((x,y)=>Math.max(.09,jacketSurface(.023)(x,y))),'#6b6359',.02,true);
  referencePanel(parts,[[241,207],[272,211],[263,242],[237,235]],((x,y)=>Math.max(.09,jacketSurface(.023)(x,y))),'#70695e',.022,true);
  referencePanel(parts,[[114,225],[138,221],[136,234],[113,241]],((x,y)=>Math.max(.098,jacketSurface(.03)(x,y))),'#8a8073',.008,true);
  referencePanel(parts,[[240,225],[266,228],[263,242],[237,235]],((x,y)=>Math.max(.098,jacketSurface(.03)(x,y))),'#857c70',.008,true);
  referenceLoft(parts,[[104,244,414,.127,.116],[104,244,395,.127,.116]],'#34372f',{sides:12});
  referencePanel(parts,[[162,397],[183,396],[184,412],[163,414]],.14,'#716b5c',.01);
  for(const [x,y] of [[125,419],[219,406]]){
    const p=emberPoint(x,y,.14);softBox(parts,p.toArray(),[.062,.106,.053],'#353832',.006);
  }
  const puckCenter=emberPoint(100,419,.135);
  const puckNormal=EMBER_D.clone().multiplyScalar(.68).addScaledVector(EMBER_R,.73).normalize();
  for(const [radius,depth,color,offset] of [[.056,.023,'#303735',0],[.046,.007,'#92502d',.015],[.038,.008,'#cf773a',.02]]){
    const g=colored(new THREE.CylinderGeometry(radius,radius,depth,12),color);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(point(0,1,0),puckNormal));g.translate(...puckCenter.clone().addScaledVector(puckNormal,offset).toArray());parts.push(g);
  }
  const torso=makeMesh(parts,'character-torso');
  torso.material.dispose();torso.material=new THREE.MeshBasicMaterial({vertexColors:true});
  return torso;
}

// A closed cut-cloth panel: its outlined front is the visible lapel or armor face.
function panel(parts, outline, thickness, color) {
  const vertices = [...outline, ...outline.map(([x, y, z]) => [x, y, z + thickness])];
  const faces = [];
  const n = outline.length;
  const area = outline.reduce((sum, a, i) => {
    const b = outline[(i + 1) % n];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0);
  for (let i = 1; i < n - 1; i++) faces.push([0, i + 1, i], [n, n + i, n + i + 1]);
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    faces.push([i, next, n + i], [next, n + next, n + i]);
  }
  if (area < 0) faces.forEach((face) => face.reverse());
  triangles(parts, vertices, faces, color);
}

function beveledPanel(parts, outline, frontZ, depth, color, inset = .012) {
  const n = outline.length;
  const centerX = outline.reduce((sum, [x]) => sum + x, 0) / n;
  const centerY = outline.reduce((sum, [, y]) => sum + y, 0) / n;
  const outer = outline.map(([x,y]) => [x,y,frontZ + inset]);
  const front = outline.map(([x,y]) => [centerX + (x - centerX) * .91, centerY + (y - centerY) * .94, frontZ]);
  const back = outline.map(([x,y]) => [x,y,frontZ + depth]);
  const vertices = [...outer, ...front, ...back];
  const faces = [];
  const capFaces = THREE.ShapeUtils.triangulateShape(outline.map(([x,y]) => new THREE.Vector2(x,y)), []);
  for (const face of capFaces) {
    const [a,b,c] = face.map(i => outline[i]);
    const ccw = (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]) > 0 ? face : [...face].reverse();
    faces.push([...ccw].reverse().map(i => n+i), ccw.map(i => n*2+i));
  }
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    faces.push([next, i, n + i], [next, n + i, n + next]);
    faces.push([i, next, n * 2 + next], [i, n * 2 + next, n * 2 + i]);
  }
  triangles(parts, vertices, faces, color);
}

// Each cross-section is an authored garment/anatomy contour. Uneven radial
// offsets describe tension folds; they are not a subdivision of a primitive.
function tailoredLoft(parts, sections, color, { sides = 16, follow = false, phase = 0, open = 0, thickness = 0, shape = null } = {}) {
  const vertices = [], faces = [];
  const up = point(0, 1, 0);
  const centers = sections.map(s => point(...s.slice(0, 3)));
  const count = open ? sides + 1 : sides;
  const layers = thickness ? 2 : 1;
  for (let layer = 0; layer < layers; layer++) {
    sections.forEach(([x,y,z,width,depth,fold = 0,slant = 0], ring) => {
      const tangent = centers[Math.min(ring + 1, centers.length - 1)].clone().sub(centers[Math.max(ring - 1, 0)]).normalize();
      const turn = new THREE.Quaternion().setFromUnitVectors(up,tangent);
      for (let side = 0; side < count; side++) {
        const angle = open ? open + (Math.PI * 2 - 2 * open) * side / sides : Math.PI * 2 * side / sides;
        const wave = Math.sin(angle * 3 + phase + ring * .83) * .7 + Math.cos(angle * 5 - ring * .61) * .3;
        const radius = 1 + fold * wave;
        const w = width - layer * thickness * 2, d = depth - layer * thickness * 2;
        // Slightly squared fabric panels have broad fronts and curved side seams.
        const sx = Math.sin(angle), cz = -Math.cos(angle);
        const section = point(Math.sign(sx) * Math.abs(sx) ** .87 * w * .5 * radius, slant * sx + fold * .009 * Math.sin(angle * 2 + ring), Math.sign(cz) * Math.abs(cz) ** .92 * d * .5 * radius);
        if (shape) shape(section, angle, ring, sections.length);
        if (follow) section.applyQuaternion(turn);
        vertices.push([x + section.x, y + section.y, z + section.z]);
      }
    });
  }
  const ringCount = sections.length, layerSize = ringCount * count;
  for (let layer = 0; layer < layers; layer++) for (let r = 0; r < ringCount - 1; r++) for (let s = 0; s < sides; s++) {
    const a = layer * layerSize + r * count + s, b = layer * layerSize + r * count + (s + 1) % count;
    const pair = [[a,a + count,b],[b,a + count,b + count]];
    if (layer) pair.forEach(face => face.reverse());
    faces.push(...pair);
  }
  if (thickness) {
    for (const r of [0,ringCount - 1]) for (let s = 0; s < sides; s++) {
      const a = r * count + s, b = r * count + (s + 1) % count;
      const pair = [[a,b,b + layerSize],[a,b + layerSize,a + layerSize]];
      if (r === 0) pair.forEach(face => face.reverse());
      faces.push(...pair);
    }
    if (open) for (let r = 0; r < ringCount - 1; r++) for (const s of [0,sides]) {
      const a = r * count + s, b = a + count;
      const pair = [[a,a + layerSize,b],[b,a + layerSize,b + layerSize]];
      if (s === sides) pair.forEach(face => face.reverse());
      faces.push(...pair);
    }
  } else if (!open) {
    for (let s = 1; s < sides - 1; s++) faces.push([0,s,s + 1],[(ringCount - 1) * count,(ringCount - 1) * count + s + 1,(ringCount - 1) * count + s]);
  }
  return triangles(parts, vertices, faces, color);
}

function shapedLimb(parts,start,end,sections,color,options = {}) {
  return tailoredLoft(parts, sections.map(([t,w,d,fold=0,slant=0]) => [...start.clone().lerp(end,t).toArray(),w,d,fold,slant]),color,{follow:true,...options});
}

function softBox(parts,position,size,color,bevel=.008) {
  const [w,h,d] = size, [x,y,z] = position;
  const outline = [[x-w/2+bevel,y-h/2],[x-w/2,y-h/2+bevel],[x-w/2,y+h/2-bevel],[x-w/2+bevel,y+h/2],[x+w/2-bevel,y+h/2],[x+w/2,y+h/2-bevel],[x+w/2,y-h/2+bevel],[x+w/2-bevel,y-h/2]];
  beveledPanel(parts,outline,z-d/2,d,color,bevel*.5);
}

function makeTorso(id, style) {
  if(id==='assault')return makeEmberTorso(style);
  const parts = [], heavy = id === 'heavy', ember = id === 'assault', wisp = id === 'sniper';
  const shift = STANCES[style.name].shift;
  const chest = style.chest*(ember?.955:1), depth = heavy ? .326 : .273;
  const core = id === 'scout' ? '#36393a' : ember ? '#44454b' : style.cloth;
  // The pelvis, waist, rib cage and shoulder yoke are one connected volume.
  tailoredLoft(parts,[
    [shift,.94,.022,style.hips*.91,depth*.8,.035],
    [shift,1.015,.017,style.hips,depth*.92,.025],
    [shift*.84,1.085,.01,style.waist,depth*.81,.02],
    [shift*.66,1.16,.006,style.waist*.99,depth*.82,.02],
    [shift*.42,1.255,.006,chest*.91,depth*.94,.016],
    [shift*.2,1.345,.008,chest,depth,.013],
    [0,1.403,.01,chest*.98,depth*.94,.012],
    [0,1.455,.017,chest*.88,depth*.77,0],
    [0,1.492,.021,heavy?.213:.177,depth*.57,0],
  ],core,{sides:20,shape:(v,angle,ring,total)=>{
    if (Math.cos(angle)>0 && (ember||id==='scout')) {
      if(ring===total-1) v.y-=.046*Math.cos(angle)**2;
      else if(ring===total-2) v.y-=.018*Math.cos(angle)**2;
    }
  }});
  // Broad clavicle surface narrows into the neck; no cylindrical peg above a flat chest.
  tailoredLoft(parts,[[0,1.407,-.001,heavy?.277:.233,.177],[0,1.465,.008,heavy?.242:.205,.158],[0,1.51,.011,heavy?.16:ember?.128:.142,ember?.128:.143],[0,1.565,.012,heavy?.149:ember?.116:.14,ember?.121:.137],[0,1.65,.017,heavy?.151:ember?.114:.141,ember?.119:.128]],style.skin,{sides:14});
  if (ember) {
    // A continuous open shell follows the back, side seams and both jacket fronts.
    tailoredLoft(parts,[
      [shift*.6,1.19,.012,.338,.292,.035,-.01],
      [shift*.5,1.202,.01,.341,.294,.02,-.009],
      [shift*.32,1.235,.01,.357,.302,.045,-.008],
      [shift*.18,1.282,.012,.379,.307,.018,-.006],
      [0,1.342,.014,.389,.309,.025,-.005],
      [0,1.405,.017,.39,.285,.014,-.008],
      [0,1.449,.022,.365,.243,.012,-.012],
      [0,1.476,.027,.304,.189,0,-.008],
    ],style.cloth,{sides:24,open:.58,thickness:.012,phase:.8});
    tailoredLoft(parts,[[0,1.473,.029,.196,.162],[0,1.511,.033,.229,.174],[0,1.543,.031,.239,.163]],'#bd5d32',{sides:18,open:.72,thickness:.008,shape:(v,angle,ring)=>{if(ring===2)v.y+=.009*Math.max(0,-Math.cos(angle));}});
    for(const side of [-1,1]) {
      // The jacket front turns forward from the side seam, clear of the tank top.
      panel(parts,[[side*.097,1.43,-.156],[side*.154,1.461,-.119],[side*.188,1.4,-.102],[side*.19,1.324,-.106],[side*.175,1.202,-.139],[side*.101,1.194,-.159],[side*.106,1.301,-.165]],.015,side<0?'#c76336':'#ce693a');
      panel(parts,[[side*.11,1.301,-.168],[side*.17,1.316,-.14],[side*.177,1.276,-.142],[side*.106,1.269,-.166]],.004,side<0?'#b5572e':'#bc5c31');
      // A tapered turned-out lapel grows from the wrapping rear collar.
      panel(parts,[[side*.083,1.436,-.153],[side*.055,1.495,-.113],[side*.133,1.544,-.054],[side*.12,1.478,-.137]],.008,'#a54f2a');
      panel(parts,[[side*.088,1.443,-.16],[side*.077,1.493,-.122],[side*.145,1.548,-.061],[side*.123,1.48,-.142]],.006,'#cf6c3b');
      stroke(parts,[side*.179,1.458,-.089],[side*.157,1.405,-.14],.052,.027,'#6c6458',4);
      softBox(parts,[side*.16,1.439,-.119],[.05,.024,.012],'#928578',.004);
      panel(parts,[[side*.117,1.187,-.146],[side*.164,1.235,-.132],[side*.171,1.175,-.136]],.003,'#bc5b30');
    }
    // The fitted shirt's broad courses wrap the chest instead of floating as boxes.
    tailoredLoft(parts,[[shift*.45,1.16,-.071,.227,.145],[shift*.25,1.25,-.076,.274,.152],[0,1.337,-.075,.289,.148],[0,1.446,-.074,.246,.128]],'#4d4c52',{sides:16});
    panel(parts,[[-.132,1.316,-.149],[-.134,1.29,-.15],[.134,1.29,-.15],[.132,1.316,-.149]],.004,'#59575e');
    panel(parts,[[-.12,1.223,-.151],[-.123,1.202,-.149],[.123,1.202,-.149],[.12,1.223,-.151]],.004,'#3e3e44');
  } else if(wisp) {
    tailoredLoft(parts,[[shift,.975,.019,.332,.284,.04],[shift,1.024,.014,.353,.289,.04],[shift*.6,1.091,.01,.36,.289,.02],[shift*.4,1.162,.011,.361,.294,.025],[0,1.262,.013,.413,.303,.015],[0,1.385,.02,.432,.294,.012],[0,1.456,.025,.4,.254,0],[0,1.48,.032,.275,.174,0]],style.cloth,{sides:24,open:.16,thickness:.01,shape:(v,angle,ring)=>{if(ring===0)v.y+=.047*Math.max(0,Math.cos(angle))**4;}});
    tailoredLoft(parts,[[0,1.448,.031,.27,.188],[0,1.511,.035,.264,.183],[0,1.57,.033,.258,.174]],'#374960',{sides:18,open:.69,thickness:.012,shape:(v,angle,ring)=>{if(ring===2)v.y+=.008*Math.sin(angle);}});
    for(const side of [-1,1]) {
      if(side<0) {
        panel(parts,[[-.025,1.439,-.16],[-.03,1.551,-.111],[-.128,1.575,-.05],[-.151,1.512,-.044],[-.102,1.446,-.143]],.017,'#4b607a');
        panel(parts,[[-.031,1.552,-.113],[-.128,1.575,-.052],[-.126,1.56,-.06],[-.031,1.536,-.118]],.006,'#61748a');
      } else {
        panel(parts,[[.058,1.444,-.15],[.066,1.529,-.049],[.118,1.574,.003],[.158,1.539,-.016],[.116,1.455,-.127]],.014,'#42556f');
      }
      panel(parts,[[side*.027,1.334,-.153],[side*.182,1.331,-.128],[side*.173,1.273,-.142],[side*.027,1.282,-.16]],.012,'#536981');
      panel(parts,[[side*.025,1.246,-.16],[side*.176,1.254,-.138],[side*.16,1.235,-.147],[side*.025,1.229,-.155]],.007,'#40556f');
    }
    tailoredLoft(parts,[[0,1.395,.003,.249,.207],[0,1.465,.008,.216,.176],[0,1.544,.012,.151,.147]],'#2d333c',{sides:16});
    stroke(parts,[.007,1.439,-.15],[shift+.007,1.03,-.141],.014,.012,'#293440',4);
  } else {
    const width=heavy?.447:.377, front=heavy?-.186:-.166;
    const outline=[[-width*.39,1.432],[-width*.5,1.351],[-width*.47,1.226],[-width*.36,1.122],[width*.36,1.122],[width*.47,1.226],[width*.5,1.351],[width*.39,1.432], [width*.23,1.427],[width*.15,1.393],[-width*.15,1.393],[-width*.23,1.427]];
    if(heavy)for(const point of outline)if(point[1]>=1.393)point[1]+=.04;
    beveledPanel(parts,outline,front-.009,.059,style.armor,.012);
    panel(parts,[[-width*.444,1.325,front-.011],[-width*.427,1.275,front-.011],[width*.427,1.275,front-.011],[width*.444,1.325,front-.011]],.003,heavy?'#727852':'#416b74');
    panel(parts,[[-width*.428,1.263,front-.011],[-width*.403,1.214,front-.011],[width*.403,1.214,front-.011],[width*.428,1.263,front-.011]],.003,heavy?'#656b4d':'#385d66');
    for(const side of [-1,1]) {
      panel(parts,[[side*(heavy?.123:.105),1.484,-.045],[side*(heavy?.213:.184),1.452,-.055],[side*(heavy?.205:.166),1.359,front-.019],[side*(heavy?.128:.105),1.366,front-.019]],.045,style.armor);
      softBox(parts,[side*(heavy?.166:.135),1.366,front-.026],[heavy?.07:.049,.041,.023],'#383d3b',.004);
    }
    if(heavy) {
      softBox(parts,[0,1.144,-.177],[.313,.1,.051],'#585f43',.012);
      for(const x of [-.095,0,.095]) softBox(parts,[x,1.067,-.166],[.084,.092,.055],'#656c4b',.005);
    }
  }
  if(ember||wisp) for(const side of [-1,1]) {
    const x=style.chest*(wisp?.38:.405);
    stroke(parts,[side*x,1.466,-.092],[side*x*.91,1.259,-.149],wisp?.053:.04,.022,wisp?'#5d605e':'#575650',4);
    for(const y of wisp?[1.416,1.355,1.29]:[1.44]) softBox(parts,[side*x*.96,y,-.121-(1.416-y)*.15],[wisp?.059:.045,.023,.011],wisp?'#777973':'#898077',.003);
  }
  const beltY=1.085;
  tailoredLoft(parts,[[shift,beltY-.026,.008,style.hips*1.065,depth*.96],[shift,beltY+.025,.008,style.hips*1.065,depth*.96]],'#3b3d35',{sides:20});
  softBox(parts,[shift+.009,beltY,-depth*.485],[.061,.041,.021],'#7a7563',.004);
  for(const side of [-1,1]) {
    const x=shift+side*style.hips*.465;
    softBox(parts,[x,beltY-.015,-.046],[.091,.149,.115],'#373a32',.01);
    softBox(parts,[x,beltY+.037,-.108],[.09,.035,.018],'#474a40',.004);
  }
  if(ember) {
    const puck=colored(new THREE.CylinderGeometry(.059,.063,.037,16),'#343939');
    puck.rotateX(Math.PI/2);puck.rotateY(.2);puck.translate(shift+.186,1.09,-.091);parts.push(puck);
    const rim=colored(new THREE.CylinderGeometry(.047,.049,.008,16),'#9a532b');
    rim.rotateX(Math.PI/2);rim.rotateY(.2);rim.translate(shift+.191,1.09,-.115);parts.push(rim);
    const center=colored(new THREE.CylinderGeometry(.041,.043,.009,16),'#d47b3b');
    center.rotateX(Math.PI/2);center.rotateY(.2);center.translate(shift+.192,1.09,-.121);parts.push(center);
  }
  return makeMesh(parts,'character-torso');
}

function addGripHand(parts,hand,orientation,side,fingerColor) {
  const pieces=[];
  const finger=(points,width,color)=>{
    tailoredLoft(pieces,points.map(([x,y,z],i)=>[x,y,z,width*(i===0?.83:i===points.length-1?.72:1),width*.85]),color,{sides:8,follow:true});
  };
  if(side>0){
    tailoredLoft(pieces,[[.03,-.037,.012,.031,.043],[.04,-.022,.009,.04,.058],[.042,.008,.006,.043,.061],[.034,.03,.002,.038,.052]],'#393e43',{sides:12});
    // Three independently curled fingers leave narrow valleys between knuckles.
    for(const [y,width] of [[-.032,.017],[-.012,.019],[.009,.019]]){
      finger([[.044,y,.003],[.05,y,-.019],[.035,y,-.04],[.008,y,-.044]],width,'#454a50');
      finger([[.008,y,-.044],[-.012,y,-.037],[-.019,y,-.02]],width*.88,fingerColor);
    }
    // Extended index sits above the curl on the guard; the thumb opposes it.
    finger([[.037,.026,.004],[.049,.036,-.016],[.036,.041,-.038],[.004,.037,-.05]],.017,'#454a50');
    finger([[.004,.037,-.05],[-.015,.031,-.046]],.014,fingerColor);
    finger([[.045,.015,.034],[.032,.037,.035],[.011,.045,.02],[-.001,.039,.001]],.025,'#45494d');
    finger([[.011,.045,.02],[-.001,.039,.001],[-.001,.029,-.011]],.022,fingerColor);
    softBox(pieces,[.061,-.002,.004],[.008,.045,.043],'#50555a',.003);
  }else{
    tailoredLoft(pieces,[[0,-.047,.006,.055,.066],[0,-.033,.004,.078,.079],[0,-.015,.004,.076,.077],[0,-.005,.002,.062,.067]],'#393e43',{sides:12});
    for(const [z,width] of [[-.032,.017],[-.011,.019],[.012,.019],[.034,.017]]){
      finger([[.03,-.028,z],[.048,-.015,z],[.052,.009,z],[.043,.03,z]],width,'#44494e');
      finger([[.043,.03,z],[.026,.044,z],[.008,.038,z]],width*.9,fingerColor);
    }
    finger([[-.031,-.026,.021],[-.047,-.009,.025],[-.046,.01,.017],[-.032,.025,-.007]],.026,'#44494e');
    finger([[-.032,.025,-.007],[-.02,.028,-.023]],.023,fingerColor);
    softBox(pieces,[0,-.047,.003],[.05,.007,.057],'#51565b',.003);
  }
  for(const geometry of pieces){geometry.applyQuaternion(orientation);geometry.translate(...hand.toArray());parts.push(geometry);}
}

function makeArm(id, style, side, hand, armed, weaponQuaternion) {
  const parts=[], ember=id==='assault', wisp=id==='sniper', heavy=id==='heavy';
  const shoulder=ember?emberPoint(side>0?128:278,side>0?225:237,0):point(side*style.shoulder,(id==='scout'?1.459:heavy?1.474:1.453)-(heavy&&side<0?.033:0),.015);
  const elbow=armed?(ember?emberPoint(side>0?51:300,side>0?337:369,.025):point(side<0?-(style.shoulder+.074):(heavy?.374:wisp?.315:.34),side<0?1.117:heavy?1.177:1.22,side<0?(heavy?-.14:-.087):-.016)):point(side*(style.shoulder+.042),1.108,.012);
  const wrist=ember&&armed?emberPoint(side>0?104:267,side>0?352:426,side>0?.20:.30):hand.clone().lerp(elbow,.16), upper=(ember?.133:style.sleeve)*(heavy?1:.94);
  const short=!ember&&!wisp;
  if(short){
    shapedLimb(parts,shoulder,elbow,[[-.11,upper*.37,upper*.48],[.025,upper*.66,upper*.77],[.16,upper*.92,upper*.97],[.3,upper,upper],[.44,upper*.98,upper*.95,.025],[.5,upper*.92,upper*.94,.035],[.53,upper*.94,upper*.96,.015]],style.cloth,{sides:16,phase:side*.7});
    shapedLimb(parts,shoulder,elbow,[[.45,upper*.83,upper*.83],[.58,upper*.9,upper*.9],[.73,upper*.91,upper*.92],[.89,upper*.75,upper*.8],[1.04,upper*.66,upper*.72]],style.skin,{sides:16,shape:(v,ang,r)=>{if(r===2&&Math.cos(ang)>.2)v.z-=.008;}});
  }else{
    shapedLimb(parts,shoulder,elbow,[[-.11,upper*.29,upper*.46],[.015,upper*.57,upper*.69],[.1,upper*.79,upper*.88],[.24,upper,upper*.98,.014],[.38,upper*.98,upper*.99,.025],[.52,upper*.89,upper*.95,.012],[.64,upper*.83,upper*.88,.04],[.7,upper*.89,upper*.91,.065],[.755,upper*.83,upper*.86,.02],[.85,upper*.89,upper*.9,.055],[.92,upper*.79,upper*.85,.025],[1.08,upper*.73,upper*.8,.03]],style.cloth,{sides:18,phase:side*.9});
  }
  const fore=style.forearm*(ember?.73:1);
  shapedLimb(parts,elbow,wrist,[[-.14,fore*.88,fore*.95],[-.025,fore*.98,fore*1.01],[.15,fore*1.075,fore*1.07],[.3,fore*1.04,fore*1.04],[.48,fore*.93,fore*.97],[.68,fore*.8,fore*.89],[.84,fore*.69,fore*.79],[1.035,(ember?.061:.073)*Math.sqrt(style.bulk),(ember?.063:.077)*Math.sqrt(style.bulk)]],wisp?style.cloth:style.skin,{sides:ember?14:18,phase:side,shape:(v,angle,ring)=>{if(ring===2&&Math.cos(angle)>.2)v.z-=.006;}});
  if(ember){
    // Rolled sleeve has a thick folded rim, an inset cloth layer and crease planes.
    shapedLimb(parts,elbow,wrist,[[-.155,.119,.14,.06],[-.06,.133,.15,.07],[.035,.138,.151,.04],[.14,.135,.144,.035],[.155,.125,.136,.015]],'#b85b31',{sides:18,phase:side*.8});
    shapedLimb(parts,elbow,wrist,[[.075,.139,.151,.035],[.11,.141,.153,.025],[.153,.135,.145,.022],[.18,.126,.137,.012]],'#d77440',{sides:18,thickness:.009,phase:side*.8});
    const crease=elbow.clone().lerp(wrist,-.025);
    panel(parts,[[crease.x-.063,crease.y+.021,crease.z-.078],[crease.x+.044,crease.y+.039,crease.z-.081],[crease.x+.051,crease.y+.018,crease.z-.079],[crease.x-.05,crease.y+.01,crease.z-.08]],.005,'#a6502c');
  }else if(wisp){
    shapedLimb(parts,elbow,wrist,[[.015,fore*1.07,fore*1.12,.035],[.12,fore*1.09,fore*1.14,.045],[.23,fore,fore*1.09,.024],[.62,fore*.84,fore*.94,.02],[.69,fore*.91,fore*.97,.07],[.76,fore*.82,fore*.9,.025],[.9,fore*.77,fore*.88,.035]],style.cloth,{sides:18,phase:side});
    shapedLimb(parts,elbow,wrist,[[.86,.095,.105],[.91,.1,.11],[1.03,.093,.105]],'#394b62',{sides:14});
    if(side<0){const badge=shoulder.clone().lerp(elbow,.38);softBox(parts,[badge.x-.056,badge.y,badge.z-.07],[.038,.11,.035],'#5c626e',.007);}
  }
  if(heavy&&side>0){
    const capStart=shoulder.clone().add(point(.027,.025,-.008));
    const capEnd=shoulder.clone().lerp(elbow,.57).add(point(.035,0,-.006));
    shapedLimb(parts,capStart,capEnd,[[0,.103,.149],[.25,.195,.225],[.61,.244,.24],[1,.193,.186]],style.armor,{sides:10,phase:.3,shape:(v,angle,ring)=>{
      if(Math.sin(angle)<-.15)v.x*=.77;
      if(Math.cos(angle)>.2&&ring>1)v.z-=.009;
      if(ring>1)v.y+=.036*Math.max(0,Math.sin(angle));
    }});
    shapedLimb(parts,capStart,capEnd,[[.94,.217,.207],[1.04,.192,.18]],'#596143',{sides:10,shape:(v,angle)=>{v.y+=.036*Math.max(0,Math.sin(angle));}});
  }else if(id==='scout'&&side<0){
    const pad=[],w=.143;
    const outline=[[-w*.43,.084],[-w*.55,-.05],[-w*.39,-.119],[w*.37,-.119],[w*.55,-.055],[w*.46,.035],[w*.15,.104]];
    beveledPanel(pad,outline,-.118,.142,style.accent,.015);
    panel(pad,[[-w*.43,.066,-.12],[-w*.35,.092,-.12],[w*.12,.111,-.101],[w*.43,.033,-.129]],.022,'#cfaa5e');
    for(const geometry of pad){geometry.rotateZ(side*.27);geometry.translate(shoulder.x+side*.025,shoulder.y-.069,shoulder.z-.021);parts.push(geometry);}
  }
  if(heavy&&side>0){
    const start=elbow.clone().lerp(wrist,.28),end=elbow.clone().lerp(wrist,.82);
    shapedLimb(parts,start,end,[[0,.17,.178],[.12,.179,.186],[.47,.163,.173],[.86,.125,.141],[1,.116,.133]],style.armor,{sides:12});
    shapedLimb(parts,start,end,[[.74,.128,.145],[.84,.129,.145]],'#424739',{sides:12});
  }
  const gloveStart=wrist.clone().lerp(elbow,.08),gloveEnd=hand.clone().lerp(wrist,.16);
  shapedLimb(parts,gloveStart,gloveEnd,[[0,.084,.09],[.13,.089,.095],[.24,.087,.094],[.78,.081,.086],[1,.075,.08]],'#373c42',{sides:14});
  if(armed)addGripHand(parts,hand,weaponQuaternion,side,wisp?'#4c5055':style.skin);
  else{
    const fingers=hand.clone().add(point(0,-.063,-.013));
    shapedLimb(parts,hand,fingers,[[0,.081,.082],[.37,.088,.077],[.78,.08,.067],[1,.068,.053]],'#414449',{sides:14});
    stroke(parts,[hand.x-side*.037,hand.y+.008,hand.z-.015],[hand.x-side*.041,hand.y-.047,hand.z-.025],.026,.03,'#414449',8);
  }
  const mesh=makeMesh(parts,side<0?'character-left-arm':'character-right-arm',shoulder.toArray());
  const marker=new THREE.Object3D();marker.name=side<0?'support-hand':'trigger-hand';marker.position.copy(hand).sub(shoulder);mesh.add(marker);
  return {mesh,marker};
}

function bootShell(parts,rings,color) {
  const outline=[[0,-1],[.58,-.98],[.88,-.8],[1,-.48],[.92,.11],[.78,.75],[.49,1],[-.49,1],[-.78,.75],[-.92,.11],[-1,-.48],[-.88,-.8],[-.58,-.98]];
  const vertices=[],faces=[],n=outline.length;
  for(const [y,w,d,z=0,frontLift=0] of rings)for(const [x,q] of outline)vertices.push([x*w*.5,y+Math.max(0,-q)*frontLift,q*d*.5+z]);
  for(let r=0;r<rings.length-1;r++)for(let i=0;i<n;i++){
    const a=r*n+i,b=r*n+(i+1)%n;faces.push([a,a+n,b],[b,a+n,b+n]);
  }
  for(let i=1;i<n-1;i++)faces.push([0,i,i+1],[(rings.length-1)*n,(rings.length-1)*n+i+1,(rings.length-1)*n+i]);
  triangles(parts,vertices,faces,color);
}

function makeLeg(style,side) {
  const parts=[],index=side<0?0:1,stance=STANCES[style.name];
  const ember=style.name==='Ember',heavy=style.name==='Rook',dash=style.name==='Dash';
  const hip=side*style.hips*.31+stance.shift,ankleAnchor=style.stance[index]*(heavy?.9:.95),baseStep=style.step[index],step=baseStep+(ember&&side>0?.26:0);
  const knee=hip+(ankleAnchor-hip)*stance.knees[index],kneeY=stance.heights[index],kneeZ=baseStep*.46-.017;
  // Dash plants both feet slightly to his left beneath unchanged knee anchors.
  const ankle=ankleAnchor-(dash?.065:0)-(ember&&side>0?.104:0);
  const thighX=(y)=>knee+(hip-knee)*THREE.MathUtils.clamp((y-kneeY)/(.96-kneeY),0,1);
  const thigh=style.thigh,calf=style.calf*(ember?.94:1);
  const legSections=ember?[
    [ankle,.249,step+.008,calf*.72,calf*.82],
    [ankle,.287,step+.009,calf*.8,calf*.86],
    [ankle+(knee-ankle)*.40,.365,step*.81+.012,calf*.99,calf*.98],
    [ankle+(knee-ankle)*.79,.439,step*.52+.006,calf*.9,calf*.92],
    [knee,kneeY-.025,kneeZ,calf*.78,calf*.87],
    [knee,kneeY+.047,kneeZ+.008,thigh*.66,thigh*.72],
    [thighX(.689),.689,.018,thigh*.84,thigh*.89],
    [thighX(.818),.818,.018,thigh,thigh*.98],
    [hip,.933,.019,thigh*.95,thigh*.94],
    [hip,.999,.016,thigh*.92,thigh*.92],
  ]:[
    [ankle,.246,step+.008,calf*.71,calf*.78],
    [ankle,.277,step+.007,calf*.86,calf*.9,.025],
    [ankle+(knee-ankle)*.2,.305,step+.013,calf*(dash?1.06:1),calf*1.03,.025],
    [ankle+(knee-ankle)*.49,.37,step*.8+.019,calf*1.06,calf*1.08],
    [ankle+(knee-ankle)*.83,.455,step*.51+.006,calf*.95,calf*.97],
    [knee,kneeY-.012,kneeZ,calf*.82,calf*.91],
    [thighX(kneeY+.058),kneeY+.058,kneeZ+.01,thigh*.75,thigh*.8],
    [thighX(.69),.69,step*.24+.017,thigh*.87,thigh*.94],
    [thighX(.825),.825,.021,thigh,thigh*1.025],
    [hip,.945,.019,thigh*.96,thigh*.96],
    [hip,.999,.016,thigh*.92,thigh*.92],
  ];
  if(ember&&side>0){legSections[2][0]-=.02184;legSections[3][0]-=.03224;}
  const trouserColor=ember?'#4b474c':style.dark;
  tailoredLoft(parts,legSections,trouserColor,{sides:10,phase:side*.95});
  const padWidth=calf*(ember?.82:heavy?.75:.78),padZ=kneeZ-calf*.5;
  const shield=[[knee-padWidth*.31,kneeY+.081],[knee-padWidth*.49,kneeY+.054],[knee-padWidth*.5,kneeY-.038],[knee-padWidth*.28,kneeY-.082],[knee+padWidth*.3,kneeY-.078],[knee+padWidth*.49,kneeY-.042],[knee+padWidth*.49,kneeY+.056],[knee+padWidth*.29,kneeY+.082]];
  const guard=[];beveledPanel(guard,shield,padZ-.025,.046,heavy||style.name==='Dash'?'#696c50':ember?'#3d3c42':'#4b4b50',.014);
  // Central knee face has a subtle bend; the bevel carries the edge highlights.
  for(const geometry of guard){geometry.translate(-knee,-kneeY,0);if(ember)geometry.scale(.92,.8,1);geometry.rotateZ(Math.atan2(knee-hip,.96-kneeY)*.5);geometry.rotateX(-.08);geometry.translate(knee,kneeY,0);parts.push(geometry);}
  for(const y of [kneeY-.045,kneeY+.04])tailoredLoft(parts,[[knee,y-.01,kneeZ+.011,calf*.96,calf*.99],[knee,y+.01,kneeZ+.011,calf*.96,calf*.99]],'#373b38',{sides:14});
  // Cargo pocket wraps the outer thigh and has an overlapping bevelled flap.
  const pocket=[],pocketX=side*(thigh*(dash?.41:.47));
  softBox(pocket,[pocketX,-.015,-.004],[.089,.204,.15],'#303532',.012);
  softBox(pocket,[pocketX,.072,-.079],[.094,.05,.022],'#42473f',.005);
  softBox(pocket,[pocketX,.036,-.092],[.025,.028,.012],'#282d2b',.003);
  const pocketY=dash?.797:.827;
  for(const geometry of pocket){
    if((side>0||style.name==='Dash')&&!ember){geometry.rotateY(side*.14);geometry.rotateZ(dash?Math.atan2(knee-hip,.96-kneeY)*.25:side*.06);geometry.translate(dash?thighX(pocketY):hip,pocketY,.002);parts.push(geometry);}
    else geometry.dispose();
  }
  if(ember&&side>0){
    referencePanel(parts,[[63,468],[89,472],[85,514],[75,567],[54,563],[55,511]],.031,'#343337',.05);
    referencePanel(parts,[[63,468],[89,472],[87,486],[59,483]],.041,'#49474b',.008);
    referencePanel(parts,[[58,490],[65,488],[66,555],[55,557]],.035,'#28292c',.006);
  }
  if(side>0||style.name==='Dash') {
    const y=.785,x=dash?thighX(y):knee+(hip-knee)*.82;
    tailoredLoft(parts,[[x,y-.013,.021,thigh*1.025,thigh*1.087],[x,y+.013,.021,thigh*1.025,thigh*1.087]],'#353936',{sides:18});
  }
  tailoredLoft(parts,[[ankle,.24,step+.008,calf*.7,calf*.78,.015],[ankle,.255,step+.008,calf*.78,calf*.85,.02],[ankle,.281,step+.007,calf*.77,calf*.85,.035]],trouserColor,{sides:16});
  const boots=[],w=heavy?.19:ember?.145:.164;
  bootShell(boots,[[0,w*.94,.284,-.036],[.012,w,.292,-.037],[.032,w,.293,-.037],[.041,w*.94,.282,-.037]],'#292c30');
  bootShell(boots,[[.032,w*.94,.277,-.035],[.072,w*.92,.266,-.035,.003],[.097,w*.86,.24,-.023,.007],[.122,w*.77,.176,.001,.007],[.157,w*.69,.147,.017,0],[.203,w*.66,.131,.023,0],[.246,w*.66,.129,.022,0],[.257,w*.67,.132,.022,0]],'#36393d');
  // Toe cap, heel counter and raised tongue create an actual boot profile.
  bootShell(boots,[[.044,w*.95,.131,-.112],[.07,w*.935,.132,-.111],[.088,w*.86,.118,-.11]],'#414449');
  softBox(boots,[0,.065,.091],[w*.67,.103,.021],'#2e3236',.008);
  stroke(boots,[0,.111,-.094],[0,.217,-.053],w*.54,.014,'#4a4d52',4);
  for(const [y,width,depth,z] of [[.148,w*.76,.17,.006],[.23,w*.68,.139,.021]]){
    bootShell(boots,[[y-.012,width,depth,z],[y+.012,width*.98,depth*.98,z]],'#45494d');
    softBox(boots,[side*width*.3,y,z-depth*.465],[.014,.023,.01],'#303438',.002);
  }
  for(const geometry of boots){
    const position=geometry.attributes.position;
    for(let i=0;i<position.count;i++){
      const y=position.getY(i);
      {
        const fit=1-(ember?.23:heavy?.1:.14)*THREE.MathUtils.clamp((.205-y)/.105,0,1);
        position.setX(i,position.getX(i)*fit);
        position.setZ(i,.022+(position.getZ(i)-.022)*fit);
      }
      position.setY(i,y<=.115?y*(ember?.73:.78):y-(ember?.03105:.0253)*THREE.MathUtils.clamp((.25-y)/.135,0,1));
    }
    geometry.computeVertexNormals();geometry.rotateY(stance.toes[index]);geometry.translate(ankle,0,step);parts.push(geometry);
  }
  return makeMesh(parts,side<0?'character-left-leg':'character-right-leg',[hip,.94,0]);
}

/** A standalone adult fighter, facing -Z, with feet on y=0. */
export function createCharacterModel(classId = 'assault', { armed = true } = {}) {
  const id = Object.hasOwn(PALETTES, classId) ? classId : 'assault';
  const style = PALETTES[id];
  const group = new THREE.Group();
  group.name = `${style.name} / character-model`;
  group.userData.classId = id;
  group.userData.characterName = style.name;
  const torso = makeTorso(id, style);
  const head = id === 'assault' ? makeEmberHead(style) : makeHead(id, style);
  const legs = [-1, 1].map((side) => makeLeg(style, side));
  group.add(torso, head, ...legs);
  let weapon = null;
  let triggerHand = point(style.shoulder + 0.039, 0.883, -0.026);
  let supportHand = point(-style.shoulder - 0.039, 0.883, -0.026);
  if (armed) {
    weapon = createWeaponModel(id);
    weapon.scale.setScalar(id === 'assault' ? 0.78 : id === 'sniper' ? 0.70 : id === 'scout' ? 1.12 : 0.9);
    weapon.rotation.set(id === 'scout' ? -0.8 : id === 'heavy' ? -0.49 : id === 'sniper' ? -0.81 : -0.85, 1.0, 0, 'YXZ');
    weapon.updateMatrixWorld(true);
    const grip = weapon.getObjectByName('grip');
    const support = weapon.getObjectByName('support-grip');
    triggerHand = point(id === 'assault' || id === 'sniper' ? .18 : .12, id === 'heavy' ? 1.064 : id === 'scout' ? 1.10 : id === 'sniper' ? 1.15 : 1.14, -0.17);
    const gripPosition = grip.getWorldPosition(new THREE.Vector3());
    weapon.position.copy(triggerHand).sub(gripPosition);
    weapon.updateMatrixWorld(true);
    if(id==='assault'){fitEmberWeapon(weapon);triggerHand=grip.getWorldPosition(new THREE.Vector3());}
    supportHand = support.getWorldPosition(new THREE.Vector3());
    group.add(weapon);
  }
  const leftArm = makeArm(id, style, -1, supportHand, armed, weapon?.quaternion);
  const rightArm = makeArm(id, style, 1, triggerHand, armed, weapon?.quaternion);
  group.add(leftArm.mesh, rightArm.mesh);
  Object.defineProperty(group.userData, 'rig', {
    value: { torso, head, arms: [leftArm.mesh, rightArm.mesh], legs, weapon, triggerHand: rightArm.marker, supportHand: leftArm.marker },
    enumerable: false,
  });
  group.userData.character = { classId: id, name: style.name };
  return group;
}
