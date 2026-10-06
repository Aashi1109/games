"""Experimental graph-cut ownership refinement. Never overwrites split masters.

Usage: /tmp/drift-tripo-py/bin/python scripts/tripo-cut-refine.py
Candidate must be visually reviewed; topology alone cannot infer fused hands.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import maximum_flow, breadth_first_order, connected_components
from scipy.spatial import cKDTree
from shapely import contains_xy, Polygon

D=Path('output/models/tripo-working'); O=D/'color'/'cut-candidate';O.mkdir(exist_ok=True)
p=np.fromfile(D/'POSITION.bin','<f4').reshape(-1,3)
f=np.fromfile(D/'indices.bin','<u4').reshape(-1,3)
uv=np.fromfile(D/'TEXCOORD_0.bin','<f4').reshape(-1,2)
initial=np.load(D/'triangle-ownership.npy')
cent=p[f].mean(1)
image=np.asarray(Image.open(D/'color'/'base-color-corrected.png'))
tuv=uv[f].mean(1);rgb=image[np.clip((tuv[:,1]*4095).astype(int),0,4095),np.clip((tuv[:,0]*4095).astype(int),0,4095)].astype(float)
_,weld=np.unique(p,axis=0,return_inverse=True);wf=weld[f]
e=np.concatenate([wf[:,[0,1]],wf[:,[1,2]],wf[:,[2,0]]]);efs=np.tile(np.arange(len(f)),3)
keys=np.sort(e,1);order=np.lexsort((keys[:,1],keys[:,0]));s=keys[order];paired=np.all(s[1:]==s[:-1],axis=1);a=efs[order[:-1][paired]];b=efs[order[1:][paired]]
fn=np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]]);fn/=np.maximum(np.linalg.norm(fn,axis=1)[:,None],1e-20)
angle=np.arccos(np.clip(np.einsum('ij,ij->i',fn[a],fn[b]),-1,1));color=np.linalg.norm(rgb[a]-rgb[b],axis=1)
# Short cuts at concave/convex creases and palette discontinuities cost less.
cap=np.maximum(1,np.rint(1000*(.10+.90*np.exp(-angle/.30))*(.20+.80*np.exp(-color/35)))).astype(np.int64)
output=initial.copy(); reports=[]
for ch,name in enumerate(['ember','wisp','dash','rook']):
 ids=np.where((initial//2)==ch)[0];local=np.full(len(f),-1,np.int32);local[ids]=np.arange(len(ids));nc=len(ids)
 edges=(local[a]>=0)&(local[b]>=0);aa=local[a[edges]];bb=local[b[edges]];cc=cap[edges]
 adj=coo_matrix((np.ones(len(aa)*2),(np.r_[aa,bb],np.r_[bb,aa])),shape=(nc,nc)).tocsr()
 gun=initial[ids]==ch*2+1;fg=gun.copy()
 # Only stable interiors become hard seeds. Current seam can move both ways.
 for _ in range(10):fg&=(adj@fg.astype(np.int8))>=3
 if not fg.any():raise RuntimeError(f'{name}: no foreground seed')
 manualfg=np.zeros(nc,bool)
 if name=='ember':
  xx=-cent[ids,2];yy=cent[ids,1];zz=cent[ids,0]
  manualfg=(xx>-.390)&(xx<-.381)&(yy>.016)&(yy<.031)&(zz>.007)&(zz<.055)
  manualfg&=(rgb[ids].max(1)-rgb[ids].min(1)<25)
 if name=='dash':
  xx=-cent[ids,2];yy=cent[ids,1];zz=cent[ids,0]
  manualfg=(xx>.081)&(xx<.087)&(yy>-.010)&(yy<-.002)&(zz>.018)&(zz<.042)
  manualfg&=(rgb[ids].max(1)-rgb[ids].min(1)<25)
 fg|=manualfg
 tree=cKDTree(cent[ids[gun|manualfg]])
 dist=tree.query(cent[ids],workers=-1)[0]
 # Body seed is held outside a 25mm spatial neighborhood of the current gun.
 bg=(dist>.025)
 warm=(rgb[ids,0]-rgb[ids,1]>9)&(rgb[ids,1]-rgb[ids,2]>4)&(rgb[ids,0]>55)
 bg|=warm
 # Protect the manually identified glove interiors, allowing a narrow movable
 # seam while preventing neutral glove palms becoming foreground gun seeds.
 x=-cent[ids,2];y=cent[ids,1];hand=np.zeros(nc,bool)
 zones={
  'ember':[(-.438,-.396,-1.05,-.414,.086),(-.382,-.323,-1.05,-.350,.024)],
  'wisp':[(-.203,-.171,-1.2,-.190,.069),(-.157,-.104,-1.2,-.130,.018)],
  'dash':[(.034,.070,-1.5,.056,.055),(.087,.128,-1.5,.106,.008)],
  'rook':[(.306,.350,-.7,.329,.054),(.395,.437,-.8,.416,.007)]}
 for lo,hi,slope,center,offset in zones[name]:
  hand|=(x>lo)&(x<hi)&(y<slope*(x-center)+offset)
 if name=='dash':
  hand=((x>.034)&(x<.094)&(y>.017)&(y<.074)&(y<(-1.4*(x-.080)+.049)))
  hand|=((x>.087)&(x<.128)&(y<(-1.5*(x-.106)+.008)))
 bg|=hand
 if name=='ember':
  bg|=warm
 elif name=='wisp':
  navy=(rgb[ids,2]>rgb[ids,0]+7)&(rgb[ids,2]>rgb[ids,1]+4)
  bg|=navy&(x<-.175)&(y>.074)
 elif name=='dash':
  teal=(rgb[ids,1]>rgb[ids,0]+6)&(rgb[ids,2]>rgb[ids,0]+5)
  bg|=teal&(x<.071)&(y>.067)
 elif name=='rook':
  olive=(rgb[ids,1]-rgb[ids,2]>3)&(rgb[ids,0]-rgb[ids,2]>3)&(rgb[ids,1]>=rgb[ids,0]-10)
  bg|=olive&(x<.34)&(y>.04)
 if name=='ember':
  magpoly=Polygon([(-.377,.055),(-.370,.041),(-.380,.003),(-.395,.011),(-.389,.045)])
  protect=contains_xy(magpoly,x,y)&(cent[ids,0]>.002)&(cent[ids,0]<.069)&~warm
  bg&=~protect
 if name=='dash':
  magpoly=Polygon([(.085,.053),(.101,.034),(.086,-.018),(.072,-.011)])
  protect=contains_xy(magpoly,x,y)&(cent[ids,0]>.015)&(cent[ids,0]<.070)&~warm
  bg&=~protect
 bg&=~manualfg
 fg&=~bg
 source=nc;sink=nc+1
 fgids=np.where(fg)[0];bgids=np.where(bg)[0]
 rr=np.r_[aa,bb,np.full(len(fgids),source),bgids];co=np.r_[bb,aa,fgids,np.full(len(bgids),sink)]
 data=np.r_[cc,cc,np.full(len(fgids),10000000,np.int64),np.full(len(bgids),10000000,np.int64)]
 graph=coo_matrix((data,(rr,co)),shape=(nc+2,nc+2),dtype=np.int64).tocsr()
 flow=maximum_flow(graph,source,sink,method='dinic');residual=(graph-flow.flow).tocsr();residual.data[residual.data<=0]=0;residual.eliminate_zeros()
 reach=breadth_first_order(residual,source,directed=True,return_predecessors=False);new=np.zeros(nc,bool);new[reach[reach<nc]]=True
 # Every source-connected foreground seed is retained, including semantically
 # valid magazines that become separate islands when fused hands are removed.
 output[ids]=ch*2+new.astype(np.int8)
 changes=np.where(new!=gun)[0]
 rep={'character':name,'oldGunTriangles':int(gun.sum()),'newGunTriangles':int(new.sum()),'addedToGun':int((new&~gun).sum()),'returnedToBody':int((gun&~new).sum()),'flowCost':int(flow.flow_value),'foregroundSeeds':int(fg.sum()),'backgroundSeeds':int(bg.sum())}
 reports.append(rep);print(rep,flush=True)
 # A projection of actual source triangle centroids showing changed ownership.
 q=np.stack([-cent[ids,2],cent[ids,1],cent[ids,0]],axis=1)
 for view,coords in [('front',[0,1,2]),('side',[2,1,0])]:
  v=q[:,coords];mn=v[:,:2].min(0);mx=v[:,:2].max(0);scale=1800;w,h=np.ceil((mx-mn)*scale).astype(int)+60
  out=np.full((h,w,3),235,np.uint8);xx=((v[:,0]-mn[0])*scale+30).astype(int);yy=((mx[1]-v[:,1])*scale+30).astype(int);order=np.argsort(v[:,2]);colors=np.rint(rgb[ids]*.65+235*.35).astype('uint8');colors[new]=[46,115,190];colors[new&~gun]=[36,184,88];colors[gun&~new]=[220,60,70];out[yy[order],xx[order]]=colors[order];im=Image.fromarray(out);draw=ImageDraw.Draw(im);draw.text((8,8),f'{name} {view}: blue gun, green added, red returned',fill='black');im.save(O/f'{name}-{view}.png')
np.save(O/'triangle-ownership-candidate.npy',output)
(O/'report.json').write_text(json.dumps({'status':'EXPERIMENTAL_REQUIRES_VISUAL_REVIEW','parts':reports},indent=2)+'\n')
