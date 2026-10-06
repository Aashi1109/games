"""Move verified Wisp magazine and receiver underside from body to weapon.

Polygon traced from filled source-only projections with coordinate grid.
The two glove volumes outside this central weapon span remain untouched.
"""
from pathlib import Path
import numpy as np
import json,hashlib,shutil
from shapely import Polygon,contains_xy
D=Path('output/models/tripo-working');O=D/'color'/'cut-wisp-source-weapon';O.mkdir(exist_ok=True)
source=D/'color/cut-wisp-local/preserved-161cf8bb0f30/triangle-ownership-candidate.npy';expected='161cf8bb0f30b8b4749ec60f125260eb9aa5827612c659944cb8992c5a142ada';assert hashlib.sha256(source.read_bytes()).hexdigest()==expected
old=np.load(source);new=old.copy();p=np.fromfile(D/'POSITION.bin','<f4').reshape(-1,3);f=np.fromfile(D/'indices.bin','<u4').reshape(-1,3);ids=np.where(old==2)[0];cent=p[f[ids]].mean(1);q=np.stack([-cent[:,2],cent[:,1],cent[:,0]],1)
outline=[[-.168,.055],[-.159,.054],[-.147,.037],[-.128,.021],[-.121,.010],[-.122,-.005],[-.130,.004],[-.141,.018],[-.145,.009],[-.154,.005],[-.162,.015],[-.169,.022],[-.164,.033],[-.167,.037]]
inside=contains_xy(Polygon(outline),q[:,0],q[:,1]);plane=1.19*(q[:,0]+.222)-.046
selected=inside&(q[:,2]>-.004)&(q[:,2]>plane-.033)&(q[:,2]<plane+.040)
added=ids[selected];new[added]=3
np.save(O/'triangle-ownership-candidate.npy',new);added.astype('<u4').tofile(O/'added-source-faces.u32');shutil.copy2(source,O/'initial-ownership.npy');shutil.copy2(__file__,O/'refinement-source.py')
report={'status':'CONFIRMED_SOURCE_WEAPON_REASSIGNMENT_REQUIRES_CLOSED_GLB_REVIEW','initialSHA256':expected,'candidateSHA256':hashlib.sha256((O/'triangle-ownership-candidate.npy').read_bytes()).hexdigest(),'outlineXY':outline,'depthMin':-.004,'gunPlane':'1.19*(qx+.222)-.046','depthPlaneBounds':[-.033,.040],'addedSourceFaces':int(len(added)),'oldGunTriangleCount':int((old==3).sum()),'newGunTriangleCount':int((new==3).sum()),'existingGunFacesPreserved':bool(np.all(new[old==3]==3)),'allOtherCharactersUnchanged':bool(np.array_equal(old[old//2!=1],new[old//2!=1])),'referenceProjection':'wisp-source-hand-band-grid.png shows magazine/foreend source geometry between gloves'}
(O/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
