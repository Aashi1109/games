"""Return raycast-confirmed low-metal Wisp glove scraps to the character.

Starts from exact exported source-face ownership. Limits changes to the rear
trigger-hand scraps and the lower support-hand scraps; stock/magazine retained.
"""
from pathlib import Path
import numpy as np
import json,hashlib,shutil
from PIL import Image
D=Path('output/models/tripo-working');M=Path('output/models/tripo-master');O=D/'color'/'cut-wisp-contact-cleanup';O.mkdir(exist_ok=True)
p=np.fromfile(D/'POSITION.bin','<f4').reshape(-1,3);f=np.fromfile(D/'indices.bin','<u4').reshape(-1,3);uv=np.fromfile(D/'TEXCOORD_0.bin','<f4').reshape(-1,2)
snapshot=O/'initial-ownership.npy'
if snapshot.exists():old=np.load(snapshot)
else:
 old=np.full(len(f),-1,np.int8)
 for ch,name in enumerate(['ember','wisp','dash','rook']):
  for kind,label in [('body',ch*2),('gun',ch*2+1)]:
   ids=np.fromfile(M/'ownership'/f'{name}-{kind}.u32','<u4');assert np.all(old[ids]==-1);old[ids]=label
 np.save(snapshot,old)
new=old.copy();ids=np.where(old==3)[0];cent=p[f[ids]].mean(1);q=np.stack([-cent[:,2],cent[:,1],cent[:,0]],1);x,y,z=q.T
coords=uv[f[ids]].mean(1);xy=np.clip((coords*4095).astype(int),0,4095);rgb=np.array(Image.open(D/'color/base-color-corrected.png'))[xy[:,1],xy[:,0]].astype(float);orm=np.array(Image.open(D/'texture-1.jpg'))[xy[:,1],xy[:,0]].astype(float)
plane=1.19*(x+.222)-.046;behind=z<plane-.008
cloth=(orm[:,2]<45)&(orm[:,1]>175)&(rgb.max(1)<95)&(rgb.max(1)-rgb.min(1)<25)
rear=(x>-.204)&(x<-.159)&(y>.049)&(y<.091)&behind
spike=(x>-.131)&(x<-.114)&(y>-.010)&(y<.009)&behind
lower=(x>-.114)&(x<-.091)&(y>-.033)&(y<-.005)&(z>.080)&(z<.115)
selected=(rear|spike|lower)&cloth;removed=ids[selected];new[removed]=2
np.save(O/'triangle-ownership-candidate.npy',new);removed.astype('<u4').tofile(O/'returned-glove-source-faces.u32');shutil.copy2(__file__,O/'refinement-source.py')
r={'status':'RAYCAST_CONFIRMED_CONTACT_SCRAP_CLEANUP_REQUIRES_RENDERED_REVIEW','initialSHA256':hashlib.sha256(snapshot.read_bytes()).hexdigest(),'candidateSHA256':hashlib.sha256((O/'triangle-ownership-candidate.npy').read_bytes()).hexdigest(),'oldWispGunSourceTriangles':int((old==3).sum()),'newWispGunSourceTriangles':int((new==3).sum()),'returnedGloveTriangles':int(len(removed)),'rearCount':int((rear&cloth).sum()),'spikeCount':int((spike&cloth).sum()),'lowerCount':int((lower&cloth).sum()),'clothGate':{'metallicMax':45,'roughnessMin':175,'maxRGB':95,'RGBspreadMax':25},'spatialGate':{'rear':{'x':[-.204,-.159],'y':[.049,.091],'behindRiflePlaneBy':.008},'spike':{'x':[-.131,-.114],'y':[-.010,.009],'behindRiflePlaneBy':.008},'lower':{'x':[-.114,-.091],'y':[-.033,-.005],'depth':[.080,.115]}},'allOtherCharactersUnchanged':bool(np.array_equal(old[old//2!=1],new[old//2!=1])),'verifiedSourceSpike770175Returned':bool(new[770175]==2),'noGunGrowth':True}
(O/'report.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r,indent=2))
