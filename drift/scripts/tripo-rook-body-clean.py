"""Remove confirmed retained Rook magazine and foreend from the body ownership.

Spatial regions are traced from actual textured source front and side projections.
The forward foreend is farther out than either hand; the olive magazine sits below
and between the gloves. No replacement anatomy or bridge is added.
"""
from pathlib import Path
import hashlib,json,shutil
import numpy as np
from PIL import Image
from shapely import Polygon,contains_xy
D=Path('output/models/tripo-working');O=D/'color/cut-rook-body-clean';O.mkdir(exist_ok=True)
snapshot=O/'initial-ownership.npy'
if not snapshot.exists():shutil.copy2(D/'triangle-ownership.npy',snapshot)
old=np.load(snapshot);new=old.copy();p=np.fromfile(D/'POSITION.bin','<f4').reshape(-1,3);f=np.fromfile(D/'indices.bin','<u4').reshape(-1,3);uv=np.fromfile(D/'TEXCOORD_0.bin','<f4').reshape(-1,2)
ids=np.flatnonzero(old==6);cent=p[f[ids]].mean(1);q=np.stack([-cent[:,2],cent[:,1],cent[:,0]],1);x,y,z=q.T
coords=uv[f[ids]].mean(1);texture=np.array(Image.open(D/'color/base-color-corrected.png'));xy=np.clip((coords*4095).astype(int),0,4095);rgb=texture[xy[:,1],xy[:,0]].astype(float);warm=(rgb[:,0]>rgb[:,1]+13)&(rgb[:,1]>rgb[:,2]+6)&(rgb[:,0]>65)
magazine_outline=[(.366,.025),(.380,.031),(.411,.025),(.411,-.025),(.401,-.040),(.366,-.040)]
magazine=contains_xy(Polygon(magazine_outline),x,y)&(z>.068)&(z<.145)&~warm
foreend=(x>.376)&(x<.467)&(y>-.043)&(y<.038)&(z>.106)&(z<.203)&~warm
selected=magazine|foreend;removed=ids[selected];new[removed]=7
np.save(O/'triangle-ownership-candidate.npy',new);removed.astype('<u4').tofile(O/'confirmed-weapon-source-faces.u32');shutil.copy2(__file__,O/'refinement-source.py')
r={'status':'SOURCE_WEAPON_REASSIGNMENT_REQUIRES_CLOSED_BODY_RENDERED_REVIEW','initialSHA256':hashlib.sha256(snapshot.read_bytes()).hexdigest(),'candidateSHA256':hashlib.sha256((O/'triangle-ownership-candidate.npy').read_bytes()).hexdigest(),'oldRookBodyTriangles':int((old==6).sum()),'newRookBodyTriangles':int((new==6).sum()),'removedWeaponSourceFaces':int(len(removed)),'magazineFaces':int(magazine.sum()),'foreendFaces':int(foreend.sum()),'magazineOutline':magazine_outline,'magazineDepth':[.068,.145],'foreendBounds':{'x':[.376,.467],'y':[-.043,.038],'depth':[.106,.203]},'skinFacesExcluded':True,'existingGunFacesPreserved':bool(np.all(new[old==7]==7)),'allOtherCharactersUnchanged':bool(np.array_equal(old[old//2!=3],new[old//2!=3])),'wristBridgeAdded':False}
(O/'report.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r,indent=2))
