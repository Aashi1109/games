"""Recover measured Wisp foreend surfaces with narrow source-space tubes.

Frozen base mask:161cf... . Only confirmed foreend coordinates are used.
Existing gun surfaces and all other characters remain unchanged.
"""
from pathlib import Path
import numpy as np
import json,hashlib,shutil
D=Path('output/models/tripo-working');O=D/'color'/'cut-wisp-foreend-repair';O.mkdir(exist_ok=True)
source=D/'color/cut-wisp-local/preserved-161cf8bb0f30/triangle-ownership-candidate.npy';expected='161cf8bb0f30b8b4749ec60f125260eb9aa5827612c659944cb8992c5a142ada';assert hashlib.sha256(source.read_bytes()).hexdigest()==expected
old=np.load(source);new=old.copy();p=np.fromfile(D/'POSITION.bin','<f4').reshape(-1,3);f=np.fromfile(D/'indices.bin','<u4').reshape(-1,3);ids=np.where(old==2)[0];cent=p[f[ids]].mean(1);q=np.stack([-cent[:,2],cent[:,1],cent[:,0]],1)
paths=[np.array([[-.177,.064,.025],[-.155232,.040562,.045511],[-.139,.022,.066],[-.124620,.009951,.087502],[-.123836,.002887,.091444]]),np.array([[-.161511,.025649,.030124],[-.155232,.023294,.039673],[-.150522,.015445,.041999],[-.130115,-.002608,.079933]])]
distances=[]
for line in paths:
 for start,end in zip(line[:-1],line[1:]):
  axis=end-start;t=np.clip(((q-start)*axis).sum(1)/(axis@axis),0,1);nearest=start+t[:,None]*axis;distances.append(np.linalg.norm(q-nearest,axis=1))
distance=np.minimum.reduce(distances);added=ids[distance<.0035];new[added]=3
np.save(O/'triangle-ownership-candidate.npy',new);added.astype('<u4').tofile(O/'added-foreend-faces.u32');shutil.copy2(source,O/'initial-ownership.npy');shutil.copy2(__file__,O/'refinement-source.py')
report={'status':'NARROW_CONFIRMED_FOREEND_SOURCE_REPAIR','initialSHA256':expected,'candidateSHA256':hashlib.sha256((O/'triangle-ownership-candidate.npy').read_bytes()).hexdigest(),'pathsQ':[v.tolist() for v in paths],'tubeRadius':.0035,'addedSourceFaces':int(len(added)),'oldGunTriangleCount':int((old==3).sum()),'newGunTriangleCount':int((new==3).sum()),'existingGunFacesPreserved':bool(np.all(new[old==3]==3)),'allOtherCharactersUnchanged':bool(np.array_equal(old[old//2!=1],new[old//2!=1])),'noChangesOutsideSpecifiedTubes':True}
(O/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
