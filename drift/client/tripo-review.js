import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const stage=document.getElementById('stage');
const stats=document.getElementById('stats');
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.NoToneMapping;
stage.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#c3c3c3');
scene.add(new THREE.HemisphereLight('#ffffff','#747d78',1.3));
const key=new THREE.DirectionalLight('#ffffff',2);key.position.set(-3,5,4);scene.add(key);
const fill=new THREE.DirectionalLight('#ffffff',.65);fill.position.set(4,2,-3);scene.add(fill);
const camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,30);
const controls=new OrbitControls(camera,stage);controls.enablePan=true;controls.minZoom=.5;controls.maxZoom=5;
let model=null,face=false,angle='front',wire=false,pending=0,lineupWidth=3.2;
function render(){pending=0;const {width,height}=stage.getBoundingClientRect();renderer.setSize(width,height,false);const span=face?.6:Math.max(2.15,lineupWidth*1.10/(width/height));camera.left=-span*width/height/2;camera.right=-camera.left;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();renderer.render(scene,camera);}
function requestRender(){if(!pending)pending=requestAnimationFrame(render);}
function frame(){const target=new THREE.Vector3(face?-1.22:0,face?1.58:.89,0);const directions={front:[0,.08,1],quarter:[-.4,.08,1],side:[-1,.08,0],back:[0,.08,-1]};camera.position.copy(new THREE.Vector3(...directions[angle]).normalize().multiplyScalar(4).add(target));controls.target.copy(target);camera.zoom=1;controls.update();for(const name of Object.keys(directions))document.getElementById(name).setAttribute('aria-pressed',String(name===angle));requestRender();}
controls.addEventListener('change',requestRender);
controls.addEventListener('start',()=>{for(const id of ['front','quarter','side','back'])document.getElementById(id).setAttribute('aria-pressed','false');});
for(const id of ['front','quarter','side','back'])document.getElementById(id).onclick=()=>{angle=id;frame();};
document.getElementById('face').onclick=()=>{face=!face;document.getElementById('face').setAttribute('aria-pressed',String(face));document.getElementById('comparison').classList.toggle('face',face);document.getElementById('reference-label').textContent=face?'Ember':'All four characters';frame();};
document.getElementById('wire').onclick=()=>{wire=!wire;document.getElementById('wire').setAttribute('aria-pressed',String(wire));model?.traverse(p=>{if(p.isMesh)for(const m of [p.material].flat())m.wireframe=wire;});requestRender();};
stage.onkeydown=event=>{const a=({ArrowLeft:-.13,ArrowRight:.13})[event.key];if(a===undefined)return;event.preventDefault();camera.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0,1,0),a).add(controls.target);controls.update();};
new ResizeObserver(requestRender).observe(stage);
try{
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf=await loader.loadAsync('/output/models/tripo-review/tripo-character-lineup.glb');
  model=gltf.scene;
  // The lineup runs along source Z with Y up. Rotate only the review holder.
  const holder=new THREE.Group();holder.rotation.y=-Math.PI/2;holder.add(model);scene.add(holder);
  const bounds=new THREE.Box3().setFromObject(holder);const size=bounds.getSize(new THREE.Vector3());
  holder.scale.setScalar(1.8/size.y);holder.updateMatrixWorld(true);
  const scaled=new THREE.Box3().setFromObject(holder),center=scaled.getCenter(new THREE.Vector3());
  holder.position.set(-center.x,-scaled.min.y,-center.z);lineupWidth=scaled.max.x-scaled.min.x;
  let triangles=0,vertices=0,meshes=0,skinned=0;const textures=new Map();
  model.traverse(p=>{if(!p.isMesh)return;meshes++;vertices+=p.geometry.attributes.position.count;triangles+=(p.geometry.index?.count??p.geometry.attributes.position.count)/3;if(p.isSkinnedMesh)skinned++;for(const m of [p.material].flat())for(const key of ['map','normalMap','roughnessMap','metalnessMap'])if(m[key]){const image=m[key].image;textures.set(m[key].source.uuid,`${image.width} × ${image.height}`);}});
  stats.textContent=`${triangles.toLocaleString()} triangles · ${vertices.toLocaleString()} vertices · ${meshes} mesh · ${textures.size} embedded textures (${[...textures.values()].join(', ')}) · ${skinned} skinned meshes · ${gltf.animations.length} animations · 18.90 MB download`;
  frame();
}catch(error){stats.classList.add('error');stats.textContent=`Model preview failed: ${error.message}`;console.error(error);}
