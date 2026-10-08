import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {Matrix4,Quaternion,Vector3} from 'three';
import {loadGLB,audit,triangleDataSha256} from './validate-tripo.mjs';
const reportPath=resolve(process.argv[2]??'output/models/tripo-optimized/optimization-report.json');
const outputPath=resolve(process.argv[3]??'output/models/tripo-optimized/independent-validation.json');
const run=JSON.parse(await readFile(reportPath,'utf8')),failures=[];
const bodyBaseline=JSON.parse(await readFile(resolve('output/models/tripo-characters-master/validation.json'),'utf8'));
const pointKey=point=>point.map(n=>n.toFixed(6)).join(',');
const edgeKey=defect=>defect.endpoints.map(pointKey).sort().join('|');
const check=(ok,message)=>{if(!ok)failures.push(message);};
const hash=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
const matrix=node=>node.matrix?new Matrix4().fromArray(node.matrix):new Matrix4().compose(new Vector3(...(node.translation??[0,0,0])),new Quaternion(...(node.rotation??[0,0,0,1])),new Vector3(...(node.scale??[1,1,1])));
const textureBindings=model=>{
 const m=model.json.materials[0],p=m.pbrMetallicRoughness??{};
 const resolveTexture=t=>t?{...t,index:undefined,image:model.embeddedImages[model.json.textures[t.index].source]}:null;
 return JSON.stringify({base:resolveTexture(p.baseColorTexture),orm:resolveTexture(p.metallicRoughnessTexture),normal:resolveTexture(m.normalTexture),occlusion:resolveTexture(m.occlusionTexture),baseColorFactor:p.baseColorFactor??[1,1,1,1],metallic:p.metallicFactor??1,roughness:p.roughnessFactor??1,doubleSided:m.doubleSided??false});
};
const protectedFiles=[];
for(const p of run.protectedFiles){const sha256=await hash(p.path);check(sha256===p.beforeSha256&&sha256===p.afterSha256,`Protected file changed: ${p.path}`);protectedFiles.push({path:p.path,sha256,unchanged:sha256===p.beforeSha256});}
const assets=[];
for(const asset of run.assets){
 const model=await loadGLB(asset.optimized,true),copySha=await hash(asset.copy),sourceSha=await hash(asset.source);
 check(model.sha256===asset.optimizedSha256,`Optimized report hash mismatch: ${asset.optimized}`);
 check(copySha===asset.sourceSha256&&sourceSha===copySha,`Source copy mismatch: ${asset.copy}`);
 check(model.primitives.length===4,`Combined primitive count: ${asset.optimized}`);
 const combinedNames=model.primitives.map(p=>p.name).sort(),expectedNames=asset.pieces.map(p=>p.name).sort();
 check(JSON.stringify(combinedNames)===JSON.stringify(expectedNames),`Named part mismatch: ${asset.optimized}`);
 const pieces=[];
 for(const part of asset.pieces){
  const primitive=model.primitives.find(p=>p.name===part.name), combinedAudit=audit({...model,...primitive});
  const single=await loadGLB(part.standaloneGLB),singleAudit=audit(single);
  check(single.primitives[0].name===part.name,`Standalone name mismatch: ${part.name}`);
  check(combinedAudit.triangles===part.triangles&&singleAudit.triangles===part.triangles,`Triangle count mismatch: ${part.name}`);
  check(triangleDataSha256(primitive)===triangleDataSha256(single),`Standalone indices/positions/UV data differs: ${part.name}`);
  check(textureBindings(model)===textureBindings(single),`Standalone material binding/image mismatch: ${part.name}`);
  const combinedIndex=model.json.meshes.findIndex(m=>m.name===part.name),combinedNode=model.json.nodes.find(n=>n.mesh===combinedIndex),singleNode=single.json.nodes.find(n=>n.mesh===0);
  const baseline=bodyBaseline.pieces.find(p=>p.id===part.name);
  const baselineWinding=new Set((baseline?.topologyDefects??[]).filter(d=>d.count===2&&d.orientation!==0).map(edgeKey));
  const windingDefects=combinedAudit.topologyDefects.filter(d=>d.count===2&&d.orientation!==0).map(d=>({...d,endpoints:d.endpoints.map(p=>new Vector3(...p).applyMatrix4(matrix(combinedNode)).toArray())}));
  const newWindingEdges=windingDefects.filter(d=>!baselineWinding.has(edgeKey(d))).length;
  check(newWindingEdges===0,`${part.name}: ${newWindingEdges} new winding defects against preserved master source coordinates`);
  const expectedTransform=new Matrix4().fromArray(part.sourceToLocalMatrixColumnMajor).multiply(matrix(combinedNode)),actualTransform=matrix(singleNode);
  const transformError=Math.max(...expectedTransform.elements.map((v,i)=>Math.abs(v-actualTransform.elements[i])));
  check(transformError<1e-5,`Standalone normalization transform mismatch: ${part.name} (${transformError})`);
  for(const [label,a] of [['combined',combinedAudit],['standalone',singleAudit]]){
   check(a.nonfinite===0&&a.invalidIndices===0&&a.degenerateTriangles===0&&a.zeroNormals===0,`${part.name} ${label}: invalid geometry`);
   check(a.openEdges===0&&a.nonmanifoldEdges===0,`${part.name} ${label}: ${a.openEdges} open, ${a.nonmanifoldEdges} nonmanifold edges`);
   check(a.images===3&&a.skins===0&&a.animations===0,`${part.name} ${label}: unexpected maps/rig/animation`);
  }
  const compact=a=>({triangles:a.triangles,openEdges:a.openEdges,nonmanifoldEdges:a.nonmanifoldEdges,inconsistentWindingEdges:a.inconsistentWindingEdges,degenerateTriangles:a.degenerateTriangles,connectedComponents:a.connectedComponents});
  pieces.push({name:part.name,path:part.standaloneGLB,sha256:single.sha256,combined:compact(combinedAudit),standalone:compact(singleAudit),matchedGeometryUVs:triangleDataSha256(primitive)===triangleDataSha256(single),matchedMaterialBindings:textureBindings(model)===textureBindings(single),transformError,newWindingEdges,baselineWindingEdges:baselineWinding.size});
 }
 assets.push({path:asset.optimized,sha256:model.sha256,source:asset.source,sourceSha256:sourceSha,copy:asset.copy,copySha256:copySha,pieces});
}
const report={status:failures.length?'failed':'passed',validatedAt:new Date().toISOString(),optimizationReport:reportPath,protectedFiles,assets,failures,renderedReviewRequired:true};
await writeFile(outputPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,failures,report:outputPath}));
