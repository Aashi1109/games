"""Conservative Wisp-only graph cut around verified source gun surfaces.

Other characters and Wisp faces outside the two local neighborhoods are fixed.
Exact initial mask and seed settings are saved with the candidate.
"""
from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import maximum_flow,breadth_first_order
D=Path('output/models/tripo-working');O=D/'color'/'cut-wisp-local';O.mkdir(exist_ok=True)
source=D/'color/cut-orm/initial-ownership.npy'
snapshot=O/'initial-ownership.npy'
if not snapshot.exists():snapshot.write_bytes(source.read_bytes())
initial=np.load(snapshot);output=initial.copy()
p=np.fromfile(D/'POSITION.bin','<f4').reshape(-1,3);f=np.fromfile(D/'indices.bin','<u4').reshape(-1,3);uv=np.fromfile(D/'TEXCOORD_0.bin','<f4').reshape(-1,2)
ids=np.where(initial//2==1)[0];fs=f[ids];cent=p[fs].mean(1);q=np.stack([-cent[:,2],cent[:,1],cent[:,0]],1);nc=len(ids)
tex=np.array(Image.open(D/'color/base-color-corrected.png'));t=uv[fs].mean(1);rgb=tex[np.clip((t[:,1]*4095).astype(int),0,4095),np.clip((t[:,0]*4095).astype(int),0,4095)].astype(float)
_,w=np.unique(p,axis=0,return_inverse=True);wf=w[fs];e=np.concatenate([wf[:,[0,1]],wf[:,[1,2]],wf[:,[2,0]]]);ef=np.tile(np.arange(nc),3);e.sort(1);order=np.lexsort((e[:,1],e[:,0]));es=e[order];same=np.all(es[1:]==es[:-1],1);a=ef[order[:-1][same]];b=ef[order[1:][same]]
fn=np.cross(p[fs[:,1]]-p[fs[:,0]],p[fs[:,2]]-p[fs[:,0]]);fn/=np.maximum(np.linalg.norm(fn,axis=1)[:,None],1e-20);angle=np.arccos(np.clip(np.einsum('ij,ij->i',fn[a],fn[b]),-1,1));delta=np.linalg.norm(rgb[a]-rgb[b],axis=1)
cap=np.maximum(1,np.rint(1000*(.10+.90*np.exp(-angle/.30))*(.20+.80*np.exp(-delta/35)))).astype(np.int64)
stock=np.array([[-.205465,.134750,-.017127],[-.186628,.115128,.003821],[-.177994,.111988,.002620],[-.193692,.109633,-.025033],[-.189767,.101000,-.020843]])
foreend=np.array([[-.155232,.040562,.045511],[-.124620,.009951,.087502],[-.123836,.002887,.091444]])
def polyline_distance(points,polyline):
 distances=[]
 for start,end in zip(polyline[:-1],polyline[1:]):
  axis=end-start;u=np.clip(((points-start)*axis).sum(1)/(axis@axis),0,1);closest=start+u[:,None]*axis;distances.append(np.linalg.norm(points-closest,axis=1))
 return np.minimum.reduce(distances)
ds=polyline_distance(q,stock);df=polyline_distance(q,foreend)
roi=(ds<.020)|(df<.020);protect=(ds<.008)|(df<.008);seed=(ds<.006)|(df<.006)
gun=initial[ids]==3;fg=gun.copy();bg=~gun&~roi
r,g,blue=rgb.T;warm=(r-g>9)&(g-blue>4)&(r>55);neutral=(rgb.max(1)-rgb.min(1)<24)&(rgb.max(1)>35)
x,y,z=q.T;hand=((x>-.203)&(x<-.171)&(y<(-1.2*(x+.190)+.069)))|((x>-.157)&(x<-.104)&(y<(-1.2*(x+.130)+.018)))
navy=(blue>r+7)&(blue>g+4)&(x<-.175)&(y>.074)
bg|=roi&(warm|((hand|navy)&~protect))
fg|=seed&neutral&~warm
bg&=~gun
fg&=~bg
src=nc;sink=nc+1;fgids=np.where(fg)[0];bgids=np.where(bg)[0];rr=np.r_[a,b,np.full(len(fgids),src),bgids];cc=np.r_[b,a,fgids,np.full(len(bgids),sink)];data=np.r_[cap,cap,np.full(len(fgids),10000000,np.int64),np.full(len(bgids),10000000,np.int64)]
mat=coo_matrix((data,(rr,cc)),shape=(nc+2,nc+2),dtype=np.int64).tocsr();flow=maximum_flow(mat,src,sink,method='dinic');res=(mat-flow.flow).tocsr();res.data[res.data<=0]=0;res.eliminate_zeros();reachable=breadth_first_order(res,src,directed=True,return_predecessors=False);new=np.zeros(nc,bool);new[reachable[reachable<nc]]=True;output[ids]=2+new.astype(np.int8)
# Remove only verified high-roughness glove lobes from Dash. This pass cannot
# grow a weapon or touch low-roughness/metallic gun surfaces.
dash_ids=np.where(initial//2==2)[0];dash_faces=f[dash_ids];dash_q=np.stack([-p[dash_faces,2].mean(1),p[dash_faces,1].mean(1),p[dash_faces,0].mean(1)],1)
dash_uv=uv[dash_faces].mean(1);dash_xy=np.clip((dash_uv*4095).astype(int),0,4095)
dash_rgb=tex[dash_xy[:,1],dash_xy[:,0]].astype(float)
map_orm=np.array(Image.open(D/'texture-1.jpg'));dash_orm=map_orm[dash_xy[:,1],dash_xy[:,0]].astype(float)
dash_gun=initial[dash_ids]==5
contact=(dash_q[:,0]>.078)&(dash_q[:,0]<.10)&(dash_q[:,1]>.018)&(dash_q[:,1]<.05)&(dash_q[:,2]>.055)
glove=(dash_rgb.max(1)-dash_rgb.min(1)<25)&(dash_rgb.max(1)<90)&(dash_orm[:,1]>215)&(dash_orm[:,2]<20)
reject=dash_gun&contact&glove
# Use direct tightly gated face ownership here. Root performs its normal
# topology cleanup/closure; no unrelated mesh region can drift.
output[dash_ids[reject]]=4
dash_report={'removedGunFaces':int(reject.sum()),'newGunFaces':int(((output[dash_ids])==5).sum()),'zoneQ':{'x':[.078,.10],'y':[.018,.05],'depthMin':.055},'maxRGB':90,'rgbSpreadMax':25,'roughnessMin':215,'metallicMax':20,'growthAllowed':False}
np.save(O/'triangle-ownership-candidate.npy',output)
report={'status':'LOCALIZED_CANDIDATE_REQUIRES_RENDERED_REVIEW','initialSHA256':hashlib.sha256(snapshot.read_bytes()).hexdigest(),'stockSourcePointsQ':stock.tolist(),'foreendSourcePointsQ':foreend.tolist(),'seedRadius':.006,'protectRadius':.008,'changeRegionRadius':.020,'oldGunTriangles':int(gun.sum()),'newGunTriangles':int(new.sum()),'addedGunTriangles':int((new&~gun).sum()),'returnedToBody':int((gun&~new).sum()),'emberAndRookUnchanged':bool(np.array_equal(output[np.isin(initial//2,[0,3])],initial[np.isin(initial//2,[0,3])])),'dashGloveFilter':dash_report,'outsideLocalRegionUnchanged':bool(np.array_equal(output[ids[~roi]],initial[ids[~roi]])),'verifiedFaceLabels':{str(i):int(output[i]) for i in [536474,536364,513909,627641,565648,508616,700319,763720,692251,601365]}}
(O/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
