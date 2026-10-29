import test from 'node:test';
import assert from 'node:assert/strict';
import { WIDTH, HEIGHT, LEVELS, createGame, createBricks, launch, pauseGame, resumeGame, movePaddle, stepGame, sweepCircleRect, safeBest } from '../engine.ts';
const near = (actual, expected, tolerance = 1e-5) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
const playing = () => { const s=createGame();launch(s);return s; };
test('four original courts contain valid durable and reachable brick layouts',()=>{
  assert.equal(LEVELS.length,4);
  for(let i=0;i<4;i++){const bricks=createBricks(i);assert.ok(bricks.length>=30);assert.equal(new Set(bricks.map(b=>b.id)).size,bricks.length);for(const b of bricks){assert.ok(b.x>20&&b.x+b.w<WIDTH-20);assert.ok(b.y>21&&b.y+b.h<HEIGHT-200);assert.ok([1,2,3].includes(b.hp));}}
  assert.ok(createBricks(3).some(b=>b.hp===3));
});
test('sweep catches fast face contact rather than tunneling through a brick',()=>{
  const hit=sweepCircleRect({x:150,y:300,vx:0,vy:-10000,r:7},{x:100,y:100,w:100,h:20},.05);near(hit.time,.0173);assert.equal(hit.ny,1);
  const s=playing();s.bricks=[{id:1,x:100,y:100,w:100,h:20,hp:1,maxHp:1,row:0},{id:2,x:650,y:100,w:50,h:20,hp:1,maxHp:1,row:0}];s.ball={x:150,y:300,vx:0,vy:-10000,r:7};stepGame(s,.025);assert.equal(s.bricks[0].hp,0);assert.ok(s.ball.vy>0);assert.equal(s.hits,1);assert.equal(s.score,50);
});
test('rounded corner contact has a radial normal and reflects both velocity components',()=>{
  const rect={x:100,y:100,w:60,h:20},ball={x:80,y:80,vx:100,vy:100,r:10};
  const hit=sweepCircleRect(ball,rect,.2);near(hit.time,(20-Math.sqrt(50))/100);near(hit.nx,-Math.SQRT1_2);near(hit.ny,-Math.SQRT1_2);
  const dot=ball.vx*hit.nx+ball.vy*hit.ny;near(ball.vx-2*dot*hit.nx,-100);near(ball.vy-2*dot*hit.ny,-100);
});
test('sweep rejects empty expanded-box corners, grazing paths and departing contact',()=>{
  const rect={x:100,y:100,w:60,h:20};
  assert.equal(sweepCircleRect({x:85,y:91,vx:40,vy:0,r:10},rect,.1),null);
  assert.equal(sweepCircleRect({x:90,y:90,vx:-50,vy:-50,r:10},rect,.3),null);
  assert.equal(sweepCircleRect({x:110,y:90,vx:0,vy:-100,r:10},rect,.2),null);
});
test('paddle contact steers left and right while always sending the ball upward',()=>{
  for(const offset of[-40,0,40]){const s=playing();s.ball.x=s.paddle.x+offset;s.ball.y=s.paddle.y-20;s.ball.vx=0;s.ball.vy=400;stepGame(s,.05);assert.ok(s.ball.vy<0);if(offset)assert.equal(Math.sign(s.ball.vx),Math.sign(offset));assert.ok(Math.abs(s.ball.vx)>0);}
});
test('wall and simultaneous corner contacts stay inside the court at high speed',()=>{
  const s=playing();s.ball={x:30,y:31,vx:-1500,vy:-1500,r:7};stepGame(s,.015);assert.ok(s.ball.x>=27);assert.ok(s.ball.y>=28);assert.ok(s.ball.vx>0);assert.ok(s.ball.vy>0);
});
test('simultaneous perpendicular wall contacts preserve unequal component speeds',()=>{
  const s=playing();s.ball={x:30,y:34,vx:-300,vy:-600,r:7};stepGame(s,.015);near(s.ball.vx,300);near(s.ball.vy,600);assert.ok(s.ball.x>=27);assert.ok(s.ball.y>=28);
});
test('durable brick awards one contact at a time, then its destruction value',()=>{
  const s=playing();s.bricks=[{id:1,x:100,y:100,w:100,h:20,hp:2,maxHp:2,row:0},{id:2,x:650,y:100,w:50,h:20,hp:1,maxHp:1,row:0}];
  for(let i=0;i<2;i++){s.ball={x:150,y:140,vx:0,vy:-400,r:7};stepGame(s,.05);}
  assert.equal(s.bricks[0].hp,0);assert.equal(s.hits,2);assert.equal(s.score,130);
});
test('three misses consume exactly three lives, require serves, and end the match',()=>{
  const s=playing();for(let i=0;i<3;i++){s.ball.x=50;s.ball.y=HEIGHT+6;s.ball.vx=0;s.ball.vy=400;stepGame(s,.02);assert.equal(s.lives,2-i);if(i<2){assert.equal(s.phase,'serve');assert.equal(s.ball.vy,0);launch(s);}}
  assert.equal(s.phase,'lost');assert.equal(launch(s),false);const score=s.score;stepGame(s,100);assert.equal(s.lives,0);assert.equal(s.score,score);
});
test('clearing four courts progresses once, preserves lives and finishes with the win bonus',()=>{
  const s=playing();for(let level=0;level<4;level++){s.bricks=[{id:1,x:100,y:100,w:100,h:20,hp:1,maxHp:1,row:0}];s.ball={x:150,y:140,vx:0,vy:-400,r:7};stepGame(s,.05);if(level<3){assert.equal(s.level,level+1);assert.equal(s.phase,'serve');assert.equal(s.lives,3);launch(s);}}
  assert.equal(s.phase,'won');assert.equal(s.score,200+500+1000+1500+2000+900);const score=s.score;assert.equal(launch(s),false);stepGame(s,.1);assert.equal(s.score,score);
});
test('pause freezes physics and blocks paddle/serve; resume keeps phase and restart is clean',()=>{
  const s=playing();stepGame(s,.1,{axis:1});assert.equal(pauseGame(s),true);const snapshot=JSON.stringify(s);stepGame(s,.2,{axis:-1});movePaddle(s,30);launch(s);assert.equal(JSON.stringify(s),snapshot);assert.equal(resumeGame(s),true);assert.equal(s.phase,'playing');stepGame(s,.1);assert.ok(s.elapsed>.1);
  const fresh=createGame();assert.equal(fresh.phase,'ready');assert.equal(fresh.lives,3);assert.equal(fresh.score,0);assert.equal(fresh.level,0);assert.equal(fresh.elapsed,0);
});
test('ready paddle clamps at walls and keeps its served ball attached',()=>{
  const s=createGame();movePaddle(s,-100);assert.equal(s.paddle.x,80);assert.equal(s.ball.x,80);movePaddle(s,9999);assert.equal(s.paddle.x,720);assert.equal(s.ball.x,720);assert.equal(movePaddle(s,NaN),false);
});
test('invalid saved scores and time steps cannot poison state',()=>{
  for(const value of[null,'100',Infinity,NaN,-1,{},[]])assert.equal(safeBest(value),0);assert.equal(safeBest(300.9),300);assert.equal(safeBest(1e40),999999999);
  const s=playing(), snapshot=JSON.stringify(s);for(const dt of[NaN,Infinity,-1,0])stepGame(s,dt);assert.equal(JSON.stringify(s),snapshot);
});
test('deterministic autonomous play remains finite and advances real bricks',()=>{
  const s=playing();let serves=0;
  for(let i=0;i<120*120;i++){if(s.phase==='serve'){launch(s);serves++;}if(['won','lost'].includes(s.phase))break;stepGame(s,1/120,{targetX:s.ball.x-Math.sin(s.elapsed*.8)*s.paddle.w*.32});assert.ok(Number.isFinite(s.ball.x+s.ball.y+s.ball.vx+s.ball.vy));}
  assert.ok(s.hits>20);assert.ok(s.score>1000);assert.ok(serves<10);
});
