import * as THREE from 'three';
import { makeMesh } from './character-geometry.js';
import { EMBER_FRAME, fromReference, triangulateReference, referenceSurface, referencePatch, worldSurface } from './reference-head-geometry.js';
import { EMBER_FACE_CONTOUR, EMBER_EYES, EMBER_FACE_LANDMARKS } from './ember-reference-face-data.js';
import { addEmberHairVolume } from './ember-hair-volume.js';
import { EMBER_PAINT } from './ember-reference-paint.js';

export const emberFaceTopology = triangulateReference(EMBER_FACE_CONTOUR, EMBER_EYES, EMBER_FACE_LANDMARKS);

// Subdivide the anatomically modeled planes for continuous vertex painting.
// Geometry depth comes from facial landmarks, independently of pixel colors.
export function paintedSurface(parts, vertices, faces) {
  const points=[];
  function subdivide(a,b,c,level=0){
    const longest=Math.max(Math.hypot(a[0]-b[0],a[1]-b[1]),Math.hypot(b[0]-c[0],b[1]-c[1]),Math.hypot(c[0]-a[0],c[1]-a[1]));
    if(longest<1 || level===7){points.push(a,b,c);return;}
    const mid=(p,q)=>p.map((v,i)=>(v+q[i])/2),ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);
    subdivide(a,ab,ca,level+1);subdivide(ab,b,bc,level+1);subdivide(ca,bc,c,level+1);subdivide(ab,bc,ca,level+1);
  }
  for(const face of faces)subdivide(...face.map(i=>vertices[i]));
  const positions=[],colors=[];
  for(const p of points){
    positions.push(...fromReference(p));
    const x=THREE.MathUtils.clamp(p[0]-EMBER_PAINT.x,0,EMBER_PAINT.width-1);
    const y=THREE.MathUtils.clamp(p[1]-EMBER_PAINT.y,0,EMBER_PAINT.height-1);
    const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(x0+1,EMBER_PAINT.width-1),y1=Math.min(y0+1,EMBER_PAINT.height-1);
    const sample=(px,py,c)=>EMBER_PAINT.rgb[(py*EMBER_PAINT.width+px)*3+c]/255;
    const rgb=[0,1,2].map(c=>THREE.MathUtils.lerp(THREE.MathUtils.lerp(sample(x0,y0,c),sample(x1,y0,c),x-x0),THREE.MathUtils.lerp(sample(x0,y1,c),sample(x1,y1,c),x-x0),y-y0));
    const color=new THREE.Color().setRGB(...rgb,THREE.SRGBColorSpace);colors.push(color.r,color.g,color.b);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();parts.push(geometry);
}

function skin(parts) {
  const topology=emberFaceTopology;
  paintedSurface(parts,topology.vertices,topology.faces);
  // Continuous jaw, temples, cranium and rear skull. Rear rows are shaped in
  // anatomical world axes, not a flat extrusion of the source silhouette.
  const front = EMBER_FACE_CONTOUR.map(p=>fromReference(p));
  const side = front.map(([x,y,z])=>[x*.92,y,y<1.61?.038:y>1.79?.036:.071]);
  const back = side.map(([x,y,z])=>[x*.65,y+(1.7-y)*.07,z+(y>1.61&&y<1.79?.049:.014)]);
  const n=front.length, vertices=[...front,...side,...back,[0,1.705,.133]], faces=[];
  for(let ring=0;ring<2;ring++)for(let i=0;i<n;i++){const j=(i+1)%n,a=ring*n;faces.push([a+i,a+j,a+n+i],[a+j,a+n+j,a+n+i]);}
  for(let i=0;i<n;i++)faces.push([2*n+i,2*n+(i+1)%n,3*n]);
  const orient = faces.map(f=>{
    const [a,b,c]=f.map(i=>new THREE.Vector3(...vertices[i]));
    const center=a.clone().add(b).add(c).multiplyScalar(1/3).sub(new THREE.Vector3(0,1.704,.015));
    return b.sub(a).cross(c.sub(a)).dot(center)<0?[...f].reverse():f;
  });
  worldSurface(parts,vertices,orient,(i)=>i>n*2?'#8f5b3d':'#9e6745');
  for(const loop of EMBER_EYES){const surface=triangulateReference(loop);paintedSurface(parts,surface.vertices,surface.faces);}
  // Visible outer ear, concha and tragus. Opposite ear sits behind the far temple.
  const earPoints=[[149,132,.036],[157,128,.046],[164,132,.057],[168,143,.057],[162,153,.048],[155,150,.038],[149,143,.028]];
  referencePatch(parts,earPoints,'#a86e49',.021);
  const earSurface=triangulateReference(earPoints.map(([x,y,d])=>[x,y,d+.0002]),[],[[158,139,.051],[161,144,.055]]);
  paintedSurface(parts,earSurface.vertices,earSurface.faces);

}

function neck(parts) {
  const rows=[[153,230,244,.103,.069],[164,220,226,.082,.068],[168,217,208,.065,.064],[171,211,189,.061,.064],[171,207,170,.064,.058]];
  const sides=16,vertices=[],front=[],rear=[];
  for(const [left,right,y,f,b] of rows)for(let i=0;i<sides;i++){
    const angle=i/sides*Math.PI*2,c=Math.cos(angle);
    vertices.push([(left+right)/2+(right-left)/2*Math.sin(angle),y,c*(c>=0?f:b)]);
  }
  for(let row=0;row<rows.length-1;row++)for(let i=0;i<sides;i++){
    const a=row*sides+i,b=row*sides+(i+1)%sides;
    const faces=[[a,b,a+sides],[b,b+sides,a+sides]];
    (Math.cos((i+.5)/sides*Math.PI*2)>0?front:rear).push(...faces);
  }
  for(let i=1;i<sides-1;i++){rear.push([0,i+1,i]);const start=(rows.length-1)*sides;rear.push([start,start+i,start+i+1]);}
  // Front triangles are oriented toward the reference camera for vertex paint.
  const orient=front.map(f=>{
    const [a,b,c]=f.map(i=>vertices[i]);return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])>0?[...f].reverse():f;
  });
  paintedSurface(parts,vertices,orient);
  worldSurface(parts,vertices.map(p=>fromReference(p)),rear,'#95613f');
}

export function makeEmberHead() {
  const parts=[];skin(parts);neck(parts);addEmberHairVolume(parts);
  const head=makeMesh(parts,'character-head',[0,1.49,0]);
  head.material.dispose();
  head.material=new THREE.MeshBasicMaterial({vertexColors:true});
  return head;
}
