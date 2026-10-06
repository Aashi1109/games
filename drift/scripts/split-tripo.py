"""Partition source triangles into four bodies and four held weapons.

Source coordinates/UVs remain unchanged. Ownership and closure patches are
recorded separately so the high-detail master can be audited before decimation.
"""
from pathlib import Path
import json, hashlib, struct
import importlib.util, os
import numpy as np
from PIL import Image
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from shapely import contains_xy, Polygon

repair_spec=importlib.util.spec_from_file_location('gun_repairs',Path(__file__).with_name('tripo-gun-repairs.py'))
repair_module=importlib.util.module_from_spec(repair_spec);repair_spec.loader.exec_module(repair_module)
cap_spec=importlib.util.spec_from_file_location('cap_fill',Path(__file__).with_name('tripo-cap-fill.py'))
cap_module=importlib.util.module_from_spec(cap_spec);cap_spec.loader.exec_module(cap_module)

D=Path('output/models/tripo-working'); O=Path('output/models/tripo-master');O.mkdir(exist_ok=True)
(O/'ownership').mkdir(exist_ok=True)
p=np.fromfile(D/'POSITION.bin','<f4').reshape(-1,3)
n=np.fromfile(D/'NORMAL.bin','i1').reshape(-1,3).astype('f4')/127
uv=np.fromfile(D/'TEXCOORD_0.bin','<f4').reshape(-1,2)
f=np.fromfile(D/'indices.bin','<u4').reshape(-1,3)
q=np.stack([-p[:,2],p[:,1],p[:,0]],1);cent=q[f].mean(1)
image=np.asarray(Image.open(D/'texture-0.jpg').convert('RGB'));tuv=uv[f].mean(1)
rgb=image[np.clip((tuv[:,1]*4095).astype(int),0,4095),np.clip((tuv[:,0]*4095).astype(int),0,4095)].astype(float)
warm=(rgb[:,0]-rgb[:,1]>13)&(rgb[:,1]-rgb[:,2]>6)&(rgb[:,0]>65)
palette=json.loads((D/'color'/'cap-palette.json').read_text())['samples']
configs={
 'ember':dict(z=(.27,.51),plane=(1.08,-.445,-.030),thickness=.025,polygon=[(-.442,.153),(-.418,.129),(-.398,.108),(-.389,.113),(-.362,.090),(-.328,.042),(-.310,.014),(-.292,.012),(-.278,-.024),(-.284,-.033),(-.313,-.009),(-.328,-.014),(-.354,.023),(-.375,.050),(-.381,.004),(-.394,.010),(-.388,.044),(-.419,.052),(-.425,.079),(-.423,.099),(-.465,.111)]),
 'wisp':dict(z=(.02,.27),plane=(1.19,-.222,-.046),thickness=.020,polygon=[(-.223,.148),(-.205,.123),(-.180,.099),(-.163,.095),(-.154,.101),(-.129,.072),(-.120,.049),(-.093,.014),(-.082,-.020),(-.034,-.079),(-.032,-.090),(-.046,-.098),(-.096,-.037),(-.118,-.028),(-.145,.011),(-.154,-.004),(-.170,.013),(-.158,.040),(-.183,.065),(-.197,.086),(-.231,.108)]),
 'dash':dict(z=(-.228,.02),plane=(2.30,.052,-.049),thickness=.032,polygon=[(.054,.111),(.069,.089),(.080,.087),(.091,.070),(.111,.036),(.131,.009),(.142,-.008),(.140,-.023),(.128,-.025),(.106,.009),(.095,.029),(.086,-.018),(.072,-.011),(.081,.040),(.069,.038),(.052,.059),(.039,.075)]),
 'rook':dict(z=(-.51,-.228),plane=(1.13,.306,.022),thickness=.021,polygon=[(.302,.097),(.326,.079),(.345,.075),(.351,.084),(.369,.074),(.383,.057),(.412,.031),(.441,.001),(.459,-.019),(.457,-.028),(.443,-.026),(.426,-.014),(.404,-.003),(.389,.012),(.390,-.026),(.369,-.037),(.350,-.028),(.354,.021),(.332,.039),(.318,.053),(.298,.071)])
}

# Exact position welding is only used to reason about topology; original UV
# seam vertices and quantized normals are retained in the exported surfaces.
_,weld=np.unique(p,axis=0,return_inverse=True)
wf=weld[f]
edges=np.concatenate([wf[:,[0,1]],wf[:,[1,2]],wf[:,[2,0]]]);edge_faces=np.tile(np.arange(len(f)),3)
edge_sorted=np.sort(edges,1);order=np.lexsort((edge_sorted[:,1],edge_sorted[:,0]));s=edge_sorted[order]
paired=np.all(s[1:]==s[:-1],1);a=edge_faces[order[:-1][paired]];b=edge_faces[order[1:][paired]]
adjacency=coo_matrix((np.ones(len(a)*2),(np.r_[a,b],np.r_[b,a])),shape=(len(f),len(f))).tocsr()

def retain_connected(labels,ids):
 selected=labels[a]&labels[b];aa=a[selected];bb=b[selected]
 graph=coo_matrix((np.ones(len(aa)*2),(np.r_[aa,bb],np.r_[bb,aa])),shape=(len(f),len(f))).tocsr()
 _,comp=connected_components(graph,directed=False);counts=np.bincount(comp[ids[labels[ids]]])
 keep=np.argmax(counts);return labels&(comp==keep)

def remove_specks(labels,ids,minimum=160):
 selected=labels[a]&labels[b];aa=a[selected];bb=b[selected]
 graph=coo_matrix((np.ones(len(aa)*2),(np.r_[aa,bb],np.r_[bb,aa])),shape=(len(f),len(f))).tocsr()
 _,comp=connected_components(graph,directed=False);counts=np.bincount(comp[ids[labels[ids]]],minlength=int(comp.max())+1)
 return labels&(counts[comp]>=minimum)

def glb(parts,path):
 blob=bytearray();views=[];accessors=[];meshes=[];nodes=[]
 def view(data,target=None):
  while len(blob)%4:blob.append(0)
  v={'buffer':0,'byteOffset':len(blob),'byteLength':len(data)}
  if target:v['target']=target
  views.append(v);blob.extend(data);return len(views)-1
 def acc(arr,typ,comp):
  a={'bufferView':view(arr.tobytes(),34963 if typ=='SCALAR' else 34962),'componentType':comp,'count':len(arr),'type':typ}
  if typ=='VEC3':a.update(min=arr.min(0).tolist(),max=arr.max(0).tolist())
  accessors.append(a);return len(accessors)-1
 for part in parts:
  attrs={key:acc(part[key].astype('<f4'),typ,5126) for key,typ in [('POSITION','VEC3'),('NORMAL','VEC3'),('TEXCOORD_0','VEC2')]}
  idx=acc(part['faces'].astype('<u4').ravel(),'SCALAR',5125)
  meshes.append({'name':part['id'],'primitives':[{'attributes':attrs,'indices':idx,'material':0}]})
  nodes.append({'name':part['id'],'mesh':len(meshes)-1,'extras':{'character':part['id'].split('-')[0],'part':part['id'].split('-')[1]}})
 color=D/'color'/'base-color-corrected.png'
 images=[]
 for texture in [color if color.exists() else D/'texture-0.jpg',D/'texture-1.jpg',D/'texture-2.png']:
  images.append({'bufferView':view(texture.read_bytes()),'mimeType':'image/png' if texture.suffix=='.png' else 'image/jpeg'})
 doc={'asset':{'version':'2.0','generator':'DRIFT audited source partition'},'scene':0,'scenes':[{'nodes':list(range(len(nodes)))}],'nodes':nodes,'meshes':meshes,'accessors':accessors,'bufferViews':views,'buffers':[{'byteLength':len(blob)}],'images':images,'textures':[{'source':i} for i in range(3)],'materials':[{'name':'reference-matched-source','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicRoughnessTexture':{'index':1}},'normalTexture':{'index':2}}]}
 js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*((-len(js))%4);blob+=b'\0'*((-len(blob))%4)
 path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(js)+len(blob))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(blob),0x004e4942)+blob)

def make_part(name,ids):
 orig=f[ids];used,remap=np.unique(orig,return_inverse=True);faces=remap.reshape(-1,3)
 pos=p[used].copy();norm=n[used].copy();tex=uv[used].copy()
 # Find ordered open edges after welding UV seams. Close every separation loop.
 wf2=weld[orig];es=np.concatenate([wf2[:,[0,1]],wf2[:,[1,2]],wf2[:,[2,0]]]);raw=np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]])
 keys=np.sort(es,1);_,inverse,count=np.unique(keys,axis=0,return_inverse=True,return_counts=True);boundary=es[count[inverse]==1];rawboundary=raw[count[inverse]==1]
 outgoing={};lookup={int(a):int(ra) for (a,b),(ra,rb) in zip(boundary,rawboundary)}
 for aa,bb in boundary:outgoing.setdefault(int(aa),[]).append(int(bb))
 loops=[]
 while outgoing:
  start=next(iter(outgoing));cur=start;loop=[]
  while cur in outgoing:
   loop.append(lookup[cur]);nxt=outgoing[cur].pop()
   if not outgoing[cur]:del outgoing[cur]
   cur=nxt
   if cur==start:break
  if cur!=start:raise RuntimeError(f'{name} non-loop boundary')
  loops.append(loop)
 added=[]
 patches=[];patchnorm=[];patchuv=[];nextvert=len(pos);closure_methods=[]
 for loop in loops:
  pts=pos[loop];center=pts.mean(0)
  # Flat closures are internal contact patches, separate from source surfaces.
  char,kind=name.split('-');sample=palette[char]['gun-metal' if kind=='gun' else 'glove']
  if kind=='body' and center[1]>.105:sample=palette[char]['uniform']
  puv=np.array(sample['uv']);radius=.0004
  loopw=weld[used[loop]];local={int(w):i for i,w in enumerate(loopw)}
  inside=np.isin(keys[:,0],loopw)&np.isin(keys[:,1],loopw)
  forbidden=set()
  for aa,bb in keys[inside]:
   ia,ib=sorted([local[int(aa)],local[int(bb)]])
   if ib-ia!=1 and (ia,ib)!=(0,len(loop)-1):forbidden.add((ia,ib))
  triangles=cap_module.triangulate_loop(pts,forbidden) if len(local)==len(loop) else None
  if triangles is None:
   closure_methods.append('nonplanar-fan-fallback')
   pts=np.vstack([pts,center]);triangles=np.array([[j,(j+1)%len(loop),len(loop)] for j in range(len(loop))])
  else:closure_methods.append('3d-minimum-area')
  # Follow the inverse of the source boundary winding.
  edge=(triangles==0).any(1)&(triangles==1).any(1)
  probe=triangles[np.where(edge)[0][0]] if edge.any() else None
  reverse=probe is not None and any(probe[k]==0 and probe[(k+1)%3]==1 for k in range(3))
  for ids2 in triangles:
   tri=pts[ids2[::-1] if reverse else ids2];no=np.cross(tri[1]-tri[0],tri[2]-tri[0]);no=no/(np.linalg.norm(no) or 1)
   patches.extend(tri);patchnorm.extend(np.tile(no,(3,1)));patchuv.extend(puv+np.array([[-radius,-radius],[radius,-radius],[0,radius]]));added.append([nextvert,nextvert+1,nextvert+2]);nextvert+=3
 if patches:pos=np.vstack([pos,patches]);norm=np.vstack([norm,patchnorm]);tex=np.vstack([tex,patchuv])
 if added:faces=np.vstack([faces,added])
 repair_records=[]
 if name.endswith('-gun'):
  repair=repair_module.build_gun_repairs(name.split('-')[0]);base_tri=len(faces)
  faces=np.vstack([faces,repair['faces']+len(pos)]);pos=np.vstack([pos,repair['POSITION']]);norm=np.vstack([norm,repair['NORMAL']]);tex=np.vstack([tex,repair['TEXCOORD_0']])
  repair_records=[{**r,'firstTriangle':r['firstTriangle']+base_tri} for r in repair['repairs']]
 result={'id':name,'POSITION':pos,'NORMAL':norm,'TEXCOORD_0':tex,'faces':faces}
 ids.astype('<u4').tofile(O/'ownership'/f'{name}.u32');used.astype('<u4').tofile(O/'ownership'/f'{name}-vertices.u32')
 glb([result],O/f'{name}.glb')
 return result,{'id':name,'file':str((O/f'{name}.glb').resolve()),'sourceTriangleIds':str((O/'ownership'/f'{name}.u32').resolve()),'sourceVertexIds':str((O/'ownership'/f'{name}-vertices.u32').resolve()),'sourceTriangles':len(ids),'addedTriangles':len(faces)-len(ids),'closureTriangles':len(added),'closureMethods':closure_methods,'reconstructedParts':repair_records,'boundaryLoops':list(map(len,loops))}

parts=[];reports=[];ownership=np.full(len(f),-1,np.int8)
for char,cfg in configs.items():
 charmask=(-cent[:,0]>cfg['z'][0])&(-cent[:,0]<cfg['z'][1]);charmask[1930308]=False;ids=np.where(charmask)[0]
 slope,origin,offset=cfg['plane'];distance=cent[:,2]-(slope*(cent[:,0]-origin)+offset)
 labels=charmask&contains_xy(Polygon(cfg['polygon']),cent[:,0],cent[:,1])&(abs(distance)<cfg['thickness'])
 x,y=cent[:,0],cent[:,1]
 stock=((x<-.408)&(y>.095)) if char=='ember' else ((x<-.183)&(y>.086)) if char=='wisp' else ((x<.065)&(y>.074)) if char=='dash' else ((x<.33)&(y>.067))
 labels|=charmask&stock&contains_xy(Polygon(cfg['polygon']),x,y)&(distance>-.037)&(distance<cfg['thickness']+.004)
 if char=='dash':
  magpoly=Polygon([(.083,.042),(.095,.030),(.086,-.018),(.072,-.011)])
  labels|=charmask&contains_xy(magpoly,x,y)&(cent[:,2]>-.05)&(cent[:,2]<.070)
 labels&=~warm
 if char=='ember':
  labels&=~((x>-.438)&(x<-.396)&(y<(-1.05*(x+.414)+.086)))
  labels&=~((x>-.382)&(x<-.323)&(y<(-1.05*(x+.35)+.024)))
  magpoly=Polygon([(-.377,.055),(-.370,.041),(-.380,.003),(-.395,.011),(-.389,.045)])
  labels|=charmask&contains_xy(magpoly,x,y)&(cent[:,2]>.002)&(cent[:,2]<.069)&~warm
 if char=='wisp':
  labels&=~((x>-.203)&(x<-.171)&(y<(-1.2*(x+.19)+.069)))
  labels&=~((x>-.157)&(x<-.104)&(y<(-1.2*(x+.13)+.018)))
 if char=='dash':
  labels&=~((x>.034)&(x<.094)&(y>.017)&(y<.074)&(y<(-1.4*(x-.080)+.049)))
  labels&=~((x>.087)&(x<.128)&(y<(-1.5*(x-.106)+.008)))
  magpoly=Polygon([(.085,.053),(.101,.034),(.086,-.018),(.072,-.011)])
  labels|=charmask&contains_xy(magpoly,x,y)&(cent[:,2]>.015)&(cent[:,2]<.070)&~warm
 if char=='rook':
  labels&=~((x>.306)&(x<.35)&(y<(-.7*(x-.329)+.054)))
  labels&=~((x>.395)&(x<.437)&(y<(-.8*(x-.416)+.007)))
 for _ in range(8):
  votes=adjacency@labels.astype(float);labels=charmask&(votes>=2)
 # A weapon's stock/magazine may become separate surface components when
 # the originally fused hand is removed. Retain those semantic pieces.
 labels=remove_specks(labels,ids)
 labels=charmask&~remove_specks(charmask&~labels,ids)
 if os.environ.get('TRIPO_OWNERSHIP'):
  labels=np.load(os.environ['TRIPO_OWNERSHIP'])==list(configs).index(char)*2+1
  labels=remove_specks(labels,ids)
  labels=charmask&~remove_specks(charmask&~labels,ids)
 for kind,mask in [('body',charmask&~labels),('gun',labels)]:
  selected=np.where(mask)[0];ownership[selected]=len(parts)
  part,report=make_part(f'{char}-{kind}',selected);parts.append(part);reports.append(report);print(report['id'],len(selected),'caps',report['addedTriangles'],report['boundaryLoops'],flush=True)
np.save(D/'triangle-ownership.npy',ownership)
glb(parts,O/'split-master.glb')
source=Path('output/models/tripo-review/tripo-character-lineup.glb')
manifest={'source':{'file':str(source.resolve()),'sha256':hashlib.sha256(source.read_bytes()).hexdigest()},'pieces':reports,'combinedFile':str((O/'split-master.glb').resolve()),'repairedSourceTriangleIds':[1930308],'repairReason':'Remove pre-existing dangling nonmanifold final triangle on Dash; original asset preserved.'}
(O/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
