from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
D=Path('output/models/tripo-working');p=np.fromfile(D/'POSITION.bin','<f4').reshape(-1,3);uv=np.fromfile(D/'TEXCOORD_0.bin','<f4').reshape(-1,2);f=np.fromfile(D/'indices.bin','<u4').reshape(-1,3)
q=np.stack([-p[:,2],p[:,1],p[:,0]],1);c=q[f].mean(1);tuv=uv[f].mean(1);t=np.asarray(Image.open(D/'texture-0.jpg'));rgb=t[np.clip((tuv[:,1]*4095).astype(int),0,4095),np.clip((tuv[:,0]*4095).astype(int),0,4095)]
own=np.load(D/'triangle-ownership.npy')
for name,xmin,xmax,ymin,ymax in [('dash',.02,.145,-.03,.125),('ember',-.47,-.28,-.04,.16)]:
 mask=(c[:,0]>xmin)&(c[:,0]<xmax)&(c[:,1]>ymin)&(c[:,1]<ymax);ids=np.where(mask)[0];ids=ids[np.argsort(c[ids,2])];scale=4000
 im=Image.new('RGB',(int((xmax-xmin)*scale)+60,int((ymax-ymin)*scale)+60),(215,215,215));dr=ImageDraw.Draw(im)
 pix=np.stack([(q[:,0]-xmin)*scale+30,(ymax-q[:,1])*scale+30],1)
 for i in ids:dr.polygon([tuple(x) for x in pix[f[i]]],fill=tuple(rgb[i]))
 for v in np.arange(-.6,.6,.01):
  x=(v-xmin)*scale+30;y=(ymax-v)*scale+30
  if 30<x<im.width-30:dr.line((x,0,x,im.height),fill=(100,130,160));dr.text((x+2,2),f'{v:.2f}',fill='black')
  if 30<y<im.height-30:dr.line((0,y,im.width,y),fill=(100,130,160));dr.text((2,y+2),f'{v:.2f}',fill='black')
 im.save(D/f'{name}-triangle-detail.png')
