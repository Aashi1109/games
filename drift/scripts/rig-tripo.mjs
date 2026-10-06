/** Rig the approved optimized character COPY. No baseline or texture is modified. */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'output/models/tripo-optimized/characters-master.glb');
const output = path.join(root, 'output/models/tripo-optimized/characters-rigged.glb');
const tools = createRequire('/private/tmp/drift-tripo-tools/package.json');
const load = (name) => import(pathToFileURL(tools.resolve(name)).href);
const [{ NodeIO }, { ALL_EXTENSIONS, EXTMeshoptCompression }, { MeshoptDecoder, MeshoptEncoder }] = await Promise.all([
  load('@gltf-transform/core'), load('@gltf-transform/extensions'), load('meshoptimizer'),
]);
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const sourceBytes = await readFile(source);
const hash = (data) => createHash('sha256').update(data).digest('hex');
const sourceSha256 = hash(sourceBytes);
// Contact-ring indices below belong to this immutable optimized baseline.
if(sourceSha256!=='eef2ba827e70838bf1c95d386088795c9b03e5d84023e61f4b281f5cfbda9f9c')throw new Error('Refit contact rings for the changed source asset before rigging.');
const document = await io.read(source);
const scene = document.getRoot().getDefaultScene();
const buffer = document.getRoot().listBuffers()[0];
const vadd = (a,b) => a.map((x,i)=>x+b[i]);
const vsub = (a,b) => a.map((x,i)=>x-b[i]);
const vmul = (a,s) => a.map(x=>x*s);
const length = (a) => Math.hypot(...a);
const distance = (a,b) => length(vsub(a,b));
const mix = (a,b,t) => a.map((x,i)=>x*(1-t)+b[i]*t);
const unit = (a) => vmul(a,1/(length(a)||1));

// Landmarks fitted to the actual source front/side projections, in q=(-Z,Y,X).
// Hand landmarks are wrist pivots, not the ends of the fingers.
const landmarks = {
  ember: {
    Hips:[-.384,-.019,-.025], Spine:[-.384,.054,-.020], Chest:[-.384,.132,-.026], Neck:[-.378,.186,-.027], Head:[-.373,.224,-.022],
    RightShoulder:[-.414,.160,-.040], RightUpperArm:[-.433,.151,-.035], RightForeArm:[-.472,.086,-.020], RightHand:[-.418,.074,.023],
    LeftShoulder:[-.351,.160,-.020], LeftUpperArm:[-.330,.149,-.019], LeftForeArm:[-.316,.064,.014], LeftHand:[-.333,.020,.071],
    RightUpperLeg:[-.421,-.025,-.026], RightLowerLeg:[-.438,-.121,-.017], RightFoot:[-.450,-.241,-.036],
    LeftUpperLeg:[-.356,-.023,-.017], LeftLowerLeg:[-.340,-.120,-.002], LeftFoot:[-.323,-.238,.003],
  },
  wisp: {
    Hips:[-.161,-.020,-.062], Spine:[-.157,.052,-.068], Chest:[-.154,.137,-.073], Neck:[-.140,.199,-.055], Head:[-.130,.236,-.056],
    RightShoulder:[-.192,.171,-.073], RightUpperArm:[-.221,.154,-.093], RightForeArm:[-.248,.080,-.086], RightHand:[-.204,.073,-.035],
    LeftShoulder:[-.118,.167,-.063], LeftUpperArm:[-.082,.154,-.050], LeftForeArm:[-.061,.071,-.021], LeftHand:[-.109,.012,.048],
    RightUpperLeg:[-.192,-.025,-.070], RightLowerLeg:[-.203,-.117,-.100], RightFoot:[-.220,-.237,-.116],
    LeftUpperLeg:[-.125,-.026,-.037], LeftLowerLeg:[-.098,-.108,-.012], LeftFoot:[-.076,-.235,-.004],
  },
  dash: {
    Hips:[.118,-.023,-.082], Spine:[.116,.046,-.074], Chest:[.111,.133,-.066], Neck:[.113,.180,-.054], Head:[.117,.216,-.040],
    RightShoulder:[.076,.163,-.080], RightUpperArm:[.046,.145,-.091], RightForeArm:[.009,.071,-.098], RightHand:[.055,.047,-.031],
    LeftShoulder:[.146,.161,-.055], LeftUpperArm:[.167,.143,-.046], LeftForeArm:[.186,.050,-.015], LeftHand:[.125,.009,.054],
    RightUpperLeg:[.080,-.032,-.092], RightLowerLeg:[.045,-.124,-.132], RightFoot:[.058,-.239,-.166],
    LeftUpperLeg:[.149,-.035,-.059], LeftLowerLeg:[.182,-.110,-.002], LeftFoot:[.194,-.240,-.002],
  },
  rook: {
    Hips:[.372,-.023,-.012], Spine:[.368,.063,-.015], Chest:[.367,.149,-.020], Neck:[.374,.209,-.019], Head:[.376,.245,-.012],
    RightShoulder:[.322,.181,-.026], RightUpperArm:[.290,.156,-.029], RightForeArm:[.278,.074,.020], RightHand:[.326,.045,.056],
    LeftShoulder:[.416,.172,-.010], LeftUpperArm:[.445,.151,-.001], LeftForeArm:[.453,.066,.025], LeftHand:[.437,.020,.041],
    RightUpperLeg:[.333,-.030,-.029], RightLowerLeg:[.300,-.117,-.030], RightFoot:[.295,-.240,-.048],
    LeftUpperLeg:[.411,-.025,-.005], LeftLowerLeg:[.431,-.125,-.010], LeftFoot:[.460,-.237,-.015],
  },
};
const parent = {
  Hips:null, Spine:'Hips', Chest:'Spine', Neck:'Chest', Head:'Neck',
  LeftShoulder:'Chest', LeftUpperArm:'LeftShoulder', LeftForeArm:'LeftUpperArm', LeftHand:'LeftForeArm',
  RightShoulder:'Chest', RightUpperArm:'RightShoulder', RightForeArm:'RightUpperArm', RightHand:'RightForeArm',
  LeftUpperLeg:'Hips', LeftLowerLeg:'LeftUpperLeg', LeftFoot:'LeftLowerLeg',
  RightUpperLeg:'Hips', RightLowerLeg:'RightUpperLeg', RightFoot:'RightLowerLeg',
};
const names = Object.keys(parent);
const segmentEnd = { Hips:'Spine', Spine:'Chest', Chest:'Neck', Neck:'Head',
  LeftShoulder:'LeftUpperArm', RightShoulder:'RightUpperArm',
  LeftUpperArm:'LeftForeArm', RightUpperArm:'RightForeArm',
  LeftForeArm:'LeftHand', RightForeArm:'RightHand',
  LeftUpperLeg:'LeftLowerLeg', RightUpperLeg:'RightLowerLeg',
  LeftLowerLeg:'LeftFoot', RightLowerLeg:'RightFoot' };
class Heap {
  data=[];
  push(item) { const a=this.data; a.push(item); let i=a.length-1; while(i){const p=(i-1)>>1;if(a[p][0]<=item[0])break;a[i]=a[p];i=p;}a[i]=item; }
  pop() { const a=this.data, top=a[0], last=a.pop();if(a.length){let i=0;while(true){let j=i*2+1;if(j>=a.length)break;if(j+1<a.length&&a[j+1][0]<a[j][0])j++;if(a[j][0]>=last[0])break;a[i]=a[j];i=j;}a[i]=last;}return top; }
}
function distanceToSegment(point,a,b) {
  const ab=vsub(b,a), ap=vsub(point,a), t=Math.max(0,Math.min(1,ap.reduce((s,x,i)=>s+x*ab[i],0)/(ab.reduce((s,x)=>s+x*x,0)||1)));
  return distance(point,mix(a,b,t));
}
function graphFor(positions, indices, groups=null) {
  const unique=[], weld=new Uint32Array(positions.length), lookup=new Map();
  for(let i=0;i<positions.length;i++) { const key=positions[i].join(',')+':'+(groups?.[i]??0);let v=lookup.get(key);if(v===undefined){v=unique.length;lookup.set(key,v);unique.push(positions[i]);}weld[i]=v; }
  const edges=unique.map(()=>new Map());
  for(let i=0;i<indices.length;i+=3)for(let j=0;j<3;j++){const a=weld[indices[i+j]],b=weld[indices[i+(j+1)%3]];if(a===b)continue;const d=distance(unique[a],unique[b]);edges[a].set(b,d);edges[b].set(a,d);}
  return {positions:unique,weld,edges};
}
function shortestPaths(graph, seeds) {
  const d=new Float64Array(graph.positions.length).fill(Infinity), heap=new Heap();
  for(const [v,cost] of seeds){if(cost<d[v]){d[v]=cost;heap.push([cost,v]);}}
  while(heap.data.length){const [cost,v]=heap.pop();if(cost!==d[v])continue;for(const [to,step] of graph.edges[v]){const next=cost+step;if(next<d[to]){d[to]=next;heap.push([next,to]);}}}
  return d;
}
function skinWeights(q, indices, joints, character, groups=null, leftArmRegion=null) {
  const graph=graphFor(q,indices,groups), points=graph.positions, center=joints.Hips[0];
  const segments=names.map(name=>{
    const a=joints[name];let b=segmentEnd[name]?joints[segmentEnd[name]]:null;
    if(name==='Head') b=vadd(a,[0,.035,0]);
    if(name.endsWith('Hand')) b=vadd(a,vmul(unit(vsub(a,joints[name.replace('Hand','ForeArm')])),.024));
    if(name.endsWith('Foot')) b=vadd(a,[0,-.014,.027]);
    return [a,b];
  });
  const euclidean=segments.map(([a,b])=>Float64Array.from(points,p=>distanceToSegment(p,a,b)));
  const handIndices=names.map((n,i)=>n.includes('Arm')||n.includes('Hand')?i:-1).filter(i=>i>=0);
  const torsoHalfWidth={ember:.048,wisp:.054,dash:.049,rook:.060}[character];
  const torsoDepthRadius={ember:.040,wisp:.055,dash:.062,rook:.075}[character];
  function inTorso(p) {
    if(p[1]<joints.Hips[1]+.009||p[1]>joints.Neck[1]-.014)return false;
    const t=Math.max(0,Math.min(1,(p[1]-joints.Hips[1])/(joints.Chest[1]-joints.Hips[1])));
    const axial=mix(joints.Hips,joints.Chest,t);
    return Math.abs(p[0]-axial[0])<torsoHalfWidth && p[2]<axial[2]+torsoDepthRadius;
  }
  const leftArmSurface=leftArmRegion?new Uint8Array(points.length):null;
  if(leftArmRegion)for(let i=0;i<q.length;i++)if(leftArmRegion[i])leftArmSurface[graph.weld[i]]=1;
  const boneSeeds=[];
  const geodesic=segments.map(([a,b],bone)=>{
    const name=names[bone], arm=/Shoulder|Arm|Hand/.test(name), leg=/Leg|Foot/.test(name), seeds=new Map();
    // Nearest surface rings at several locations along each fitted bone provide
    // topology-aware weights. UV seams are welded only for distance reasoning.
    for(const t of [.15,.35,.55,.75,.90]){
      const sample=mix(a,b,t), candidates=[];
      for(let i=0;i<points.length;i++){
        const p=points[i];
        if(arm&&inTorso(p))continue;
        if(arm&&name.startsWith('Left')&&leftArmSurface&&p[1]<.090&&!leftArmSurface[i])continue;
        if(arm && (p[1]<joints[name.startsWith('Left')?'LeftHand':'RightHand'][1]-.032 || p[1]>joints.Chest[1]+.070))continue;
        if(leg && p[1]>joints.Hips[1]+.014)continue;
        if(name==='Head'&&p[1]<joints.Neck[1]+.012)continue;
        if(['Hips','Spine','Chest','Neck'].includes(name)){
          if(p[1]<joints.Hips[1]-.028||p[1]>joints.Head[1]-.005)continue;
          const armDistance=Math.min(...handIndices.map(k=>euclidean[k][i]));
          if(armDistance+0.007<euclidean[bone][i])continue;
        }
        // Prevent a seed on the opposite limb across a narrow air gap.
        if(name.startsWith('Right')&&p[0]>center+.012)continue;
        if(name.startsWith('Left')&&p[0]<center-.012)continue;
        candidates.push([distance(p,sample),i]);
      }
      candidates.sort((x,y)=>x[0]-y[0]);
      for(const [d,i] of candidates.slice(0,12)) seeds.set(i,Math.min(seeds.get(i)??Infinity,euclidean[bone][i]));
    }
    if(!seeds.size)throw new Error(`No seeds for ${name}`);
    boneSeeds.push({bone:name,count:seeds.size});
    return shortestPaths(graph,seeds);
  });
  // Flood the connected distal-arm surface after an elbow-level cross-section.
  // This captures every UV copy and closure vertex of a palm, even when the
  // bent hand crosses the body's center plane. The two source cuff contacts
  // are separated first, so the flood cannot reach the waist through a glove.
  const armCuts={
    ember:{Right:{y:.101},Left:{y:.079}},
    wisp:{Right:{y:.117},Left:{y:.086}},
    dash:{Right:{y:.108},Left:{y:.065}},
    rook:{Right:{y:.115},Left:{y:.081}},
  }[character];
  const regions=['Right','Left'].map(side=>{
    const cut=armCuts[side], allowed=points.map(p=>p[1]<cut.y&&(cut.z===undefined||p[2]>cut.z));
    const wrist=joints[side+'Hand'],elbow=joints[side+'ForeArm'];
    const palm=vadd(wrist,vmul(unit(vsub(wrist,elbow)),.012));
    let seed=-1,best=Infinity;
    for(let i=0;i<points.length;i++)if(allowed[i]){const d=distance(points[i],palm);if(d<best){best=d;seed=i;}}
    const included=new Uint8Array(points.length),queue=[seed];included[seed]=1;
    for(let cursor=0;cursor<queue.length;cursor++)for(const [neighbor] of graph.edges[queue[cursor]])if(allowed[neighbor]&&!included[neighbor]){included[neighbor]=1;queue.push(neighbor);}
    if(queue.length<100||queue.length>points.length*.20)throw new Error(`Unsafe arm component ${character} ${side}: ${queue.length}`);
    const distances=shortestPaths(graph,queue.map(i=>[i,0]));
    const bones=names.map((n,i)=>n.startsWith(side)&&/Shoulder|Arm|Hand/.test(n)?i:-1).filter(i=>i>=0);
    return {side,distances,bones,coreVertices:queue.length};
  });
  const jointsArray=new Uint8Array(q.length*4),weights=new Uint8Array(q.length*4),dominant=new Uint8Array(q.length);
  const ownership=Object.fromEntries(names.map(n=>[n,0]));
  for(let vertex=0;vertex<q.length;vertex++){
    const v=graph.weld[vertex], p=q[vertex];
    const scores=names.map((name,bone)=>{
      let d=Number.isFinite(geodesic[bone][v])?geodesic[bone][v]:euclidean[bone][v]+0.25;
      const armBone=/Shoulder|Arm|Hand/.test(name);
      // Continuous anatomical costs, never a hard per-vertex ownership plane.
      // Abrupt infinity gates create a skinning tear across otherwise tiny edges.
      if(armBone){
        if(name.startsWith('Left')&&leftArmSurface&&!leftArmSurface[v])d+=.18*Math.max(0,Math.min(1,(.120-p[1])/.030));
        const t=Math.max(0,Math.min(1,(p[1]-joints.Hips[1])/(joints.Chest[1]-joints.Hips[1]))),axis=mix(joints.Hips,joints.Chest,t);
        const margin=Math.min(torsoHalfWidth-Math.abs(p[0]-axis[0]),axis[2]+torsoDepthRadius-p[2],p[1]-(joints.Hips[1]+.009),(joints.Neck[1]-.014)-p[1]);
        const u=Math.max(0,Math.min(1,margin/.025));d+=.12*u*u*(3-2*u);
        d+=Math.max(0,joints.Hips[1]-.022-p[1])*4;
      }
      if(/Leg|Foot/.test(name))d+=Math.max(0,p[1]-(joints.Hips[1]+.025))*4;
      if(name==='Head')d+=Math.max(0,joints.Neck[1]-.019-p[1])*4;
      if(name==='Neck')d+=Math.max(0,joints.Chest[1]+.012-p[1])*3;
      if(name.startsWith('Right'))d+=Math.max(0,p[0]-center-.015)*2;
      if(name.startsWith('Left'))d+=Math.max(0,center-.015-p[0])*2;
      return [d,bone];
    }).sort((a,b)=>a[0]-b[0]).slice(0,4);
    if(!Number.isFinite(scores[0][0]))throw new Error('Unweighted vertex');
    // Surface distances yield smooth local joint transitions, without broad
    // Euclidean influence through the torso or between folded arms and chest.
    const values=scores.map(([d])=>Number.isFinite(d)?Math.exp(-Math.pow((d-scores[0][0])/.025,2)):0);
    const total=values.reduce((a,b)=>a+b,0);
    const blend=new Float64Array(names.length);
    scores.forEach((entry,i)=>{blend[entry[1]]=values[i]/total;});
    for(const region of regions){
      const d=region.distances[v];
      if(region.side==='Left'&&leftArmSurface&&!leftArmSurface[v]&&p[1]<.090)continue;
      if(d>=.050)continue;
      const t=Math.max(0,Math.min(1,(d-.012)/.038));
      const alpha=1-t*t*(3-2*t);
      const costs=region.bones.map(b=>Number.isFinite(geodesic[b][v])?geodesic[b][v]:euclidean[b][v]);
      const min=Math.min(...costs),arm=costs.map(d=>Math.exp(-Math.pow((d-min)/.025,2))),sum=arm.reduce((a,b)=>a+b,0);
      for(let b=0;b<blend.length;b++)blend[b]*=1-alpha;
      region.bones.forEach((b,i)=>{blend[b]+=alpha*arm[i]/sum;});
    }
    const strongest=Array.from(blend,(w,b)=>[w,b]).sort((a,b)=>b[0]-a[0]).slice(0,4);
    const sum=strongest.reduce((a,b)=>a+b[0],0),quantized=strongest.map(([w])=>Math.round(w/sum*255));
    quantized[0]+=255-quantized.reduce((a,b)=>a+b,0);
    for(let k=0;k<4;k++){jointsArray[vertex*4+k]=strongest[k][1];weights[vertex*4+k]=quantized[k];}
    dominant[vertex]=strongest[0][1];ownership[names[dominant[vertex]]]++;
  }
  // Relax weights on the welded surface, including closure faces. This removes
  // per-vertex ownership seams without letting nearby but disconnected surfaces
  // influence one another. Finger cores and the face remain stable.
  let field=new Float32Array(points.length*names.length),next=new Float32Array(field.length);
  const seen=new Uint8Array(points.length),fixed=new Uint8Array(points.length);
  for(let i=0;i<q.length;i++){
    const v=graph.weld[i];if(seen[v])continue;seen[v]=1;
    for(let k=0;k<4;k++)field[v*names.length+jointsArray[i*4+k]]=weights[i*4+k]/255;
    fixed[v]=points[v][1]>joints.Neck[1]+.02?1:0;
    for(const region of regions)if(region.distances[v]===0&&field[v*names.length+names.indexOf(region.side+'Hand')]>.85)fixed[v]=1;
  }
  for(let iteration=0;iteration<28;iteration++){
    for(let v=0;v<points.length;v++){
      const base=v*names.length;
      if(fixed[v]||!graph.edges[v].size){next.set(field.subarray(base,base+names.length),base);continue;}
      let total=0;const average=new Float64Array(names.length);
      for(const [neighbor,d] of graph.edges[v]){const factor=1/Math.max(d,.001);total+=factor;const other=neighbor*names.length;for(let b=0;b<names.length;b++)average[b]+=factor*field[other+b];}
      for(let b=0;b<names.length;b++)next[base+b]=.35*field[base+b]+.65*average[b]/total;
    }
    [field,next]=[next,field];
  }
  for(const key of names)ownership[key]=0;
  for(let i=0;i<q.length;i++){
    const base=graph.weld[i]*names.length,strongest=names.map((_,b)=>[field[base+b],b]).sort((a,b)=>b[0]-a[0]).slice(0,4);
    const sum=strongest.reduce((a,b)=>a+b[0],0),quantized=strongest.map(([w])=>Math.round(w/sum*255));quantized[0]+=255-quantized.reduce((a,b)=>a+b,0);
    for(let k=0;k<4;k++){jointsArray[i*4+k]=strongest[k][1];weights[i*4+k]=quantized[k];}
    dominant[i]=strongest[0][1];ownership[names[dominant[i]]]++;
  }
  return {jointsArray,weights,dominant,ownership,boneSeeds};
}
// Fitted source contact rings join Wisp/Rook's folded cuffs to their waists.
// Split only the hidden 33/26-edge contacts and close both sides. Every original
// triangle survives. The second loop identifies the arm side and is not cut.
const rookContact = {"armSeedFace":27436,"boundaryLoops":[[12633,12616,12605,12603,12604,17949,12600,12599,16150,16157,16160,17145,17141,16088,16087,16091,16092,16095,16097,16099,16100,16980,16979,16977,12637,12635],[15519,15517,15516,15515,16196,16198,15711,15710,15713,15729,15731,15732,15759,15758,15757,15762,15817,15936,15939,15950,15941,15812,15796,15795,15787,15792,15959,15802,15976,15978,16022,16023,16018,16003,16004,16251,16258,16259,16263,16268,16269,16279,16371,16370,16360,16350,16347,15619,15614,15520]],"contactLoop":0,"capFaces":[[0,25,24],[0,24,1],[1,24,21],[21,24,22],[22,24,23],[1,21,5],[5,21,17],[17,21,19],[19,21,20],[17,19,18],[5,17,12],[12,17,14],[14,17,15],[15,17,16],[12,14,13],[5,12,7],[7,12,10],[10,12,11],[7,10,9],[7,9,8],[5,7,6],[1,5,3],[3,5,4],[1,3,2]]};
const wispContact = {"armSeedFace":24607,"boundaryLoops":[[10828,10829,10833,10842,10841,10845,10848,10849,10801,10800,16084,16085,10890,10899,10900,10901,10903,16614,16613,16612,16609,16605,16603,16575,16577,14734,14737,14738,14750,14794,14815,14814,14813],[11349,11348,11350,11339,17120,17118,17116,17114,17078,17082,17110,17108,15183,15181,15179,15192,15193,15196,15214,15213,15212,15211,15203,15145,15131,15132,15123,15121,15073,15072,15036,15037,15030,15039,15040,15041,15043,15045,15046,15047,15048,15050,15053,14887,17185,17198,17200,17213,17206,17209]],"contactLoop":0,"capFaces":[[0,32,1],[1,32,30],[30,32,31],[1,30,29],[1,29,2],[2,29,27],[27,29,28],[2,27,16],[16,27,26],[16,26,18],[18,26,24],[24,26,25],[18,24,21],[21,24,22],[22,24,23],[18,21,20],[18,20,19],[16,18,17],[2,16,11],[11,16,15],[11,15,12],[12,15,14],[12,14,13],[2,11,3],[3,11,9],[9,11,10],[3,9,4],[4,9,6],[6,9,8],[6,8,7],[4,6,5]]};
function separateCuff(primitive, q, character) {
  if(!['rook','wisp'].includes(character))return {q,groups:null,repair:null};
  const contact=character==='rook'?rookContact:wispContact,expectedFaces=character==='rook'?3066:3985;
  const graph=graphFor(q,primitive.getIndices().getArray()),index=Array.from(primitive.getIndices().getArray()),faces=index.length/3;
  const key=(a,b)=>a<b?`${a},${b}`:`${b},${a}`;
  const barriers=new Set();
  for(const loop of contact.boundaryLoops)for(let i=0;i<loop.length;i++)barriers.add(key(graph.weld[loop[i]],graph.weld[loop[(i+1)%loop.length]]));
  const edgeFaces=new Map(),adj=Array.from({length:faces},()=>[]);
  for(let f=0;f<faces;f++)for(let j=0;j<3;j++){
    const a=graph.weld[index[f*3+j]],b=graph.weld[index[f*3+(j+1)%3]],k=key(a,b);if(barriers.has(k))continue;
    if(edgeFaces.has(k)){const other=edgeFaces.get(k);adj[f].push(other);adj[other].push(f);}else edgeFaces.set(k,f);
  }
  const removedSourceFaceIds=[];
  if(character==='wisp'){
    const seen=new Uint8Array(faces),scrap=[15875];seen[15875]=1;
    for(let at=0;at<scrap.length;at++)for(const next of adj[scrap[at]])if(!seen[next]){seen[next]=1;scrap.push(next);}
    if(scrap.length!==206)throw new Error('Wisp detached source scrap changed');
    removedSourceFaceIds.push(...scrap.sort((a,b)=>a-b));
  }
  const arm=new Uint8Array(faces),queue=[contact.armSeedFace];arm[queue[0]]=1;
  for(let at=0;at<queue.length;at++)for(const next of adj[queue[at]])if(!arm[next]){arm[next]=1;queue.push(next);}
  if(queue.length!==expectedFaces)throw new Error(`Source contact segmentation changed: ${queue.length}`);
  const loop=contact.boundaryLoops[contact.contactLoop],ring=new Set(loop.map(v=>graph.weld[v]));
  const attributes=Object.fromEntries(primitive.listSemantics().map(semantic=>{const a=primitive.getAttribute(semantic);return [semantic,{accessor:a,values:Array.from(a.getArray()),size:a.getElementSize(),type:a.getArray().constructor}];}));
  const groups=Array(q.length).fill(0),cloneMap=new Map();
  const append=(original,group)=>{
    const next=q.length;q.push([...q[original]]);groups.push(group);
    for(const data of Object.values(attributes))data.values.push(...data.values.slice(original*data.size,(original+1)*data.size));
    return next;
  };
  for(let f=0;f<faces;f++)if(arm[f])for(let j=0;j<3;j++){
    const at=f*3+j,v=index[at];if(!ring.has(graph.weld[v]))continue;
    if(!cloneMap.has(v))cloneMap.set(v,append(v,1));index[at]=cloneMap.get(v);
  }
  const caps=[loop.map(v=>append(v,1)),loop.map(v=>append(v,0))];
  for(let side=0;side<2;side++)for(const tri of contact.capFaces){
    const face=(side===0?tri:[tri[0],tri[2],tri[1]]).map(v=>caps[side][v]);index.push(...face);
  }
  // Flat dark contact material from the boundary, with no atlas interpolation.
  const uv=attributes.TEXCOORD_0,uvSample=uv.values.slice(loop[0]*uv.size,(loop[0]+1)*uv.size);
  for(const list of caps)for(const v of list)for(let j=0;j<uv.size;j++)uv.values[v*uv.size+j]=uvSample[j];
  for(const data of Object.values(attributes))data.accessor.setArray(new data.type(data.values));
  const removed=new Set(removedSourceFaceIds),retained=index.filter((_,i)=>!removed.has(Math.floor(i/3)));
  primitive.getIndices().setArray(new Uint32Array(retained));
  const leftArmRegion=new Uint8Array(q.length);for(let f=0;f<faces;f++)if(arm[f])for(let j=0;j<3;j++)leftArmRegion[index[f*3+j]]=1;for(const v of caps[0])leftArmRegion[v]=1;
  return {q,groups,leftArmRegion,repair:{kind:'separated fused left cuff-to-waist contact',sourceTriangles:faces,removedSourceTriangles:removedSourceFaceIds.length,removedSourceFaceIds,removalReason:removedSourceFaceIds.length?'disconnected source rifle/contact scrap visibly hanging below cuff':null,addedClosureTriangles:contact.capFaces.length*2,duplicatedContactVertices:cloneMap.size,addedCapVertices:loop.length*2,armFaces:queue.length}};
}

const report={sourceSha256,output,characters:[]};
for(const node of [...scene.listChildren()]){
  if(!node.getMesh())continue;
  const name=node.getName().split('-')[0], qj=structuredClone(landmarks[name]);
  if(!qj)throw new Error(`Unknown character ${name}`);
  const primitive=node.getMesh().listPrimitives()[0], sourcePositionAccessor=primitive.getAttribute('POSITION');
  let sourcePosition=sourcePositionAccessor.getArray();
  const q=Array.from({length:sourcePosition.length/3},(_,i)=>[-sourcePosition[i*3+2],sourcePosition[i*3+1],sourcePosition[i*3]]);
  const separated=separateCuff(primitive,q,name);sourcePosition=sourcePositionAccessor.getArray();
  const ymin=Math.min(...q.map(p=>p[1])),ymax=Math.max(...q.map(p=>p[1])),scale=1.8/(ymax-ymin),center=qj.Hips;
  const normalize=p=>[(center[0]-p[0])*scale,(p[1]-ymin)*scale,(center[2]-p[2])*scale];
  const rigPositions=new Float32Array(sourcePosition.length);
  q.forEach((p,i)=>rigPositions.set(normalize(p),i*3));
  const normalAccessor=primitive.getAttribute('NORMAL'),normal=new Float32Array(normalAccessor.getCount()*3),temp=[0,0,0];
  for(let i=0;i<normalAccessor.getCount();i++){normalAccessor.getElement(i,temp);normal.set([temp[2],temp[1],-temp[0]],i*3);}
  primitive.setAttribute('POSITION',document.createAccessor(`${name}-positions`).setType('VEC3').setArray(rigPositions).setBuffer(buffer));
  primitive.setAttribute('NORMAL',document.createAccessor(`${name}-normals`).setType('VEC3').setArray(normal).setBuffer(buffer));
  sourcePositionAccessor.dispose();normalAccessor.dispose();
  const fitted=skinWeights(q,primitive.getIndices().getArray(),qj,name,separated.groups,separated.leftArmRegion);
  primitive.setAttribute('JOINTS_0',document.createAccessor(`${name}-joints`).setType('VEC4').setArray(fitted.jointsArray).setBuffer(buffer));
  primitive.setAttribute('WEIGHTS_0',document.createAccessor(`${name}-weights`).setType('VEC4').setArray(fitted.weights).setNormalized(true).setBuffer(buffer));
  const group=document.createNode(name),bones=Object.fromEntries(names.map(n=>[n,document.createNode(`${name}_${n}`)]));
  scene.removeChild(node);scene.addChild(group);group.addChild(node);node.setTranslation([0,0,0]).setRotation([0,0,0,1]).setScale([1,1,1]);
  const rest=Object.fromEntries(names.map(n=>[n,normalize(qj[n])]));
  for(const bone of names){const p=parent[bone];(p?bones[p]:group).addChild(bones[bone]);bones[bone].setTranslation(p?vsub(rest[bone],rest[p]):rest[bone]);}
  const inverse=new Float32Array(names.length*16);
  names.forEach((bone,i)=>{const a=i*16,p=rest[bone];inverse[a]=inverse[a+5]=inverse[a+10]=inverse[a+15]=1;inverse[a+12]=-p[0];inverse[a+13]=-p[1];inverse[a+14]=-p[2];});
  const skin=document.createSkin(`${name}-skeleton`).setSkeleton(bones.Hips).setInverseBindMatrices(document.createAccessor(`${name}-inverse-bind`).setType('MAT4').setArray(inverse).setBuffer(buffer));
  names.forEach(n=>skin.addJoint(bones[n]));node.setSkin(skin);
  const sourceToRig=[0,0,-scale,0, 0,scale,0,0, scale,0,0,0, center[0]*scale,-ymin*scale,center[2]*scale,1];
  const grip={};
  for(const side of ['Right','Left']){const wrist=qj[`${side}Hand`],elbow=qj[`${side}ForeArm`],palm=vadd(wrist,vmul(unit(vsub(wrist,elbow)),.017));grip[`${side}Hand`]={joint:rest[`${side}Hand`],palmCenter:normalize(palm),localPalmOffset:vsub(normalize(palm),rest[`${side}Hand`])};}
  group.setExtras({character:name,rigVersion:1,height:1.8,forward:[0,0,-1],bonePrefix:`${name}_`,sourceSha256,sourceToRig,restJointPositions:rest,handGrips:grip,restRotationBasis:'identity; local XYZ initially equals character XYZ',weights:'surface geodesic; four normalized influences',geometryRepair:separated.repair});
  report.characters.push({name,geometryRepair:separated.repair,vertices:q.length,triangles:primitive.getIndices().getCount()/3,scale,sourceToRig,restJointPositions:rest,handGrips:grip,dominantBoneVertices:fitted.ownership,seedCounts:fitted.boneSeeds});
  await mkdir('/private/tmp/tripo-rig',{recursive:true});
  await writeFile(`/private/tmp/tripo-rig/${name}-weights.json`,JSON.stringify({q,joints:qj,dominant:Array.from(fitted.dominant),bones:names}));
}
// Encode losslessly; do not requantize POSITION or recompress original textures.
document.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.FILTER});
await io.write(output,document);
const reloaded=await io.read(output);let maxRestError=0,maxWeightError=0;
for(const node of reloaded.getRoot().listNodes()){
  if(!node.getSkin())continue;
  const skin=node.getSkin(),bones=skin.listJoints(),ibm=skin.getInverseBindMatrices(),p=node.getMesh().listPrimitives()[0],positions=p.getAttribute('POSITION'),weights=p.getAttribute('WEIGHTS_0'),joints=p.getAttribute('JOINTS_0');
  for(let i=0;i<positions.getCount();i++){
    const v=positions.getElement(i,[0,0,0]),w=weights.getElement(i,[0,0,0,0]),j=joints.getElement(i,[0,0,0,0]),bound=[0,0,0];
    maxWeightError=Math.max(maxWeightError,Math.abs(w.reduce((a,b)=>a+b,0)-1));
    for(let k=0;k<4;k++){const inv=ibm.getElement(j[k],Array(16)),world=bones[j[k]].getWorldMatrix();for(let axis=0;axis<3;axis++)bound[axis]+=w[k]*(v[axis]+inv[12+axis]+world[12+axis]);}
    maxRestError=Math.max(maxRestError,distance(v,bound));
  }
}
if(maxRestError>2e-6||maxWeightError>2e-6)throw new Error(`Binding validation failed: ${maxRestError},${maxWeightError}`);
if(hash(await readFile(source))!==sourceSha256)throw new Error('Optimized baseline changed.');
report.validation={maxRestError,maxWeightError,sourceUnchanged:true,skinCount:reloaded.getRoot().listSkins().length};
report.bytes=(await readFile(output)).length;report.sha256=hash(await readFile(output));
await writeFile('/private/tmp/tripo-rig/report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
