import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {MeshoptDecoder} from '../node_modules/three/examples/jsm/libs/meshopt_decoder.module.js';
const dir=process.argv[3]??'output/models/tripo-working';await mkdir(dir,{recursive:true});
const file=await readFile(process.argv[2]??'output/models/tripo-review/tripo-character-lineup.glb');
const len=file.readUInt32LE(12),doc=JSON.parse(file.subarray(20,20+len));
const bin=file.subarray(28+len);await MeshoptDecoder.ready;
const views=doc.bufferViews.map(view=>{
 const e=view.extensions?.EXT_meshopt_compression;
 if(!e)return bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
 const data=new Uint8Array(e.count*e.byteStride);MeshoptDecoder.decodeGltfBuffer(data,e.count,e.byteStride,bin.subarray(e.byteOffset,e.byteOffset+e.byteLength),e.mode,e.filter);return Buffer.from(data);
});
const info={};const prim=doc.meshes[0].primitives[0];
for(const [name,id] of Object.entries({...prim.attributes,indices:prim.indices})){
 const a=doc.accessors[id],v=doc.bufferViews[a.bufferView];const size={5126:4,5125:4,5123:2,5122:2,5121:1,5120:1}[a.componentType],components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
 const packed=Buffer.alloc(a.count*size*components),source=views[a.bufferView],stride=v.byteStride??size*components;
 for(let i=0;i<a.count;i++)source.copy(packed,i*size*components,(a.byteOffset??0)+i*stride,(a.byteOffset??0)+i*stride+size*components);
 await writeFile(`${dir}/${name}.bin`,packed);info[name]={...a,file:`${name}.bin`,components};
}
for(let i=0;i<doc.images.length;i++){const ext=doc.images[i].mimeType==='image/png'?'png':'jpg';await writeFile(`${dir}/texture-${i}.${ext}`,views[doc.images[i].bufferView]);}
await writeFile(`${dir}/decoded.json`,JSON.stringify({attributes:info,materials:doc.materials,textures:doc.textures,images:doc.images,source:doc},null,2));
console.log(JSON.stringify(info,null,2));
