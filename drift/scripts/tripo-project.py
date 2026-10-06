"""Inspection projection of actual GLB vertices, with source coordinates."""
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
D=Path('output/models/tripo-working')
p=np.fromfile(D/'POSITION.bin','<f4').reshape(-1,3)
uv=np.fromfile(D/'TEXCOORD_0.bin','<f4').reshape(-1,2)
t=np.asarray(Image.open(D/'texture-0.jpg').convert('RGB'))
c=t[np.clip((uv[:,1]*4095).astype(int),0,4095),np.clip((uv[:,0]*4095).astype(int),0,4095)]
front=np.stack([-p[:,2],p[:,1],p[:,0]],axis=1)
for name,lo,hi in [('ember',.27,.51),('wisp',.02,.27),('dash',-.228,.02),('rook',-.51,-.228)]:
 mask=(p[:,2]>lo)&(p[:,2]<hi);v=front[mask];color=c[mask]
 for view in ['front','side']:
  q=v.copy() if view=='front' else v[:,[2,1,0]].copy()
  scale=1700;mn=q[:,:2].min(0);mx=q[:,:2].max(0);w,h=np.ceil((mx-mn)*scale).astype(int)+80
  out=np.full((h,w,3),225,np.uint8);x=((q[:,0]-mn[0])*scale+40).astype(int);y=((mx[1]-q[:,1])*scale+40).astype(int)
  order=np.argsort(q[:,2]);out[y[order],x[order]]=color[order]
  im=Image.fromarray(out);dr=ImageDraw.Draw(im)
  for val in np.arange(-.6,.61,.025):
   xx=(val-mn[0])*scale+40;yy=(mx[1]-val)*scale+40
   if 0<=xx<w:dr.line((xx,0,xx,h),fill=(130,170,190),width=1);dr.text((xx+2,2),f'{val:.3f}',fill='black')
   if 0<=yy<h:dr.line((0,yy,w,yy),fill=(130,170,190),width=1);dr.text((2,yy+2),f'{val:.3f}',fill='black')
  im.save(D/f'{name}-{view}-grid.png')
