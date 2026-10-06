"""Exact, narrow Wisp foreend recovery requested after closed-GLB review.

Only source triangles within a 3.5mm tube of verified foreend centerline are
added to Wisp's gun. Existing gun faces and other characters cannot change.
"""
from pathlib import Path
import numpy as np
import json,hashlib,shutil
D=Path('output/models/tripo-working');O=D/'color'/'cut-wisp-foreend-final';O.mkdir(exist_ok=True)
source=D/'color/cut-wisp-local/preserved-161cf8bb0f30/triangle-ownership-candidate.npy'
expected='161cf8bb0f30b8b4749ec60f125260eb9aa5827612c659944cb8992c5a142ada'
assert hashlib.sha256(source.read_bytes()).hexdigest()==expected
old=np.load(source);new=old.copy();p=np.fromfile(D/'POSITION.bin','<f4').reshape(-1,3);f=np.fromfile(D/'indices.bin','<u4').reshape(-1,3)
ids=np.where(old==2)[0];cent=p[f[ids]].mean(1);q=np.stack([-cent[:,2],cent[:,1],cent[:,0]],1)
polyline=np.array([[-.177,.064,.025],[-.155232,.040562,.045511],[-.139,.022,.066],[-.124620,.009951,.087502],[-.123836,.002887,.091444]])
distances=[]
for start,end in zip(polyline[:-1],polyline[1:]):
 axis=end-start;t=np.clip(((q-start)*axis).sum(1)/(axis@axis),0,1);nearest=start+t[:,None]*axis;distances.append(np.linalg.norm(q-nearest,axis=1))
distance=np.minimum.reduce(distances);added=ids[distance<.0035];new[added]=3
np.save(O/'triangle-ownership-candidate.npy',new);added.astype('<u4').tofile(O/'added-foreend-faces.u32');shutil.copy2(source,O/'initial-ownership.npy');shutil.copy2(__file__,O/'refinement-source.py')
report={'status':'PRECISE_SOURCE_TUBE_REQUIRES_FINAL_RENDERED_REVIEW','initialSHA256':expected,'candidateSHA256':hashlib.sha256((O/'triangle-ownership-candidate.npy').read_bytes()).hexdigest(),'polylineQ':polyline.tolist(),'tubeRadius':.0035,'addedSourceFaces':int(len(added)),'oldGunTriangleCount':int((old==3).sum()),'newGunTriangleCount':int((new==3).sum()),'existingGunFacesPreserved':bool(np.all(new[old==3]==3)),'allOtherCharactersUnchanged':bool(np.array_equal(old[old//2!=1],new[old//2!=1])),'noChangesOutsideSpecifiedTube':True,'noColorBrightnessGate':True}
(O/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
