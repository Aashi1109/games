import test from 'node:test';
import assert from 'node:assert/strict';
import { FISH, safeProgress, createTrip, startTrip, pauseTrip, castLine, hookFish, setReeling, bankBasket, riskBasket, advanceTrip } from '../engine.ts';
const started = () => { const s = createTrip({}, () => .1); startTrip(s); return s; };
function hook(s) { assert.equal(castLine(s), true); advanceTrip(s, s.target / .82); assert.equal(hookFish(s), true); }
function land(s) { hook(s); for (let i = 0; i < 1000 && s.phase === 'reeling'; i++) { setReeling(s, s.tension < .55); advanceTrip(s, .025); } assert.ok(['decision','ended'].includes(s.phase)); }
test('cast timing requires the visible green zone and consumes one cast', () => {
  const s = started(); assert.equal(castLine(s), true); assert.equal(s.casts, 7); assert.equal(castLine(s), false); assert.equal(hookFish(s), false); assert.equal(s.lost, 1); assert.equal(s.phase, 'shore');
  hook(s); assert.ok(s.quality > .99); assert.equal(s.phase, 'reeling');
});
test('continuous reeling snaps the line; controlled release can land a fish', () => {
  const tooHard = started(); hook(tooHard); setReeling(tooHard, true); for (let i = 0; i < 300 && tooHard.phase === 'reeling'; i++) advanceTrip(tooHard, .02); assert.equal(tooHard.lost, 1); assert.equal(tooHard.landed, 0);
  const controlled = started(); land(controlled); assert.equal(controlled.landed, 1); assert.equal(controlled.basket.length, 1); assert.equal(controlled.banked, 0);
});
test('rare fish are reachable with a good human-timed cast, without an exact floating-point bullseye', () => {
  const s=createTrip({},()=>.9);startTrip(s);castLine(s);advanceTrip(s,(s.target+.018)/.82);assert.equal(hookFish(s),true);assert.ok(s.quality<1);assert.ok(s.quality>.9);assert.equal(s.fish.id,'moonfish');
  const common=createTrip({},()=>0);startTrip(common);castLine(common);advanceTrip(common,(common.target-.21)/.82);assert.equal(hookFish(common),true);assert.equal(common.fish.id,'medaka');
});
test('ignoring the cast or leaving slack cannot stall a trip forever', () => {
  const s = started(); castLine(s); advanceTrip(s, 8); assert.equal(s.lost, 1); hook(s);
  for(let i=0;i<250 && s.phase==='reeling';i++) advanceTrip(s,.025);
  assert.equal(s.lost, 2); assert.equal(s.phase, 'shore');
});
test('risk raises catch rewards; a later miss loses the basket but banked catches survive', () => {
  const s = started(); land(s); const first = s.basket[0].points; riskBasket(s); land(s); assert.ok(s.basket[1].points > first); assert.equal(s.basket.length, 2);
  bankBasket(s); const secured = s.banked, collection = { ...s.collection }; assert.ok(secured > 0); assert.equal(s.basket.length, 0);
  land(s); riskBasket(s); castLine(s); hookFish(s); assert.equal(s.basket.length, 0); assert.equal(s.banked, secured); assert.deepEqual(s.collection, collection);
});
test('eight successful casts end once and automatically bank the last basket', () => {
  const s = started(); for(let i=0;i<8;i++){land(s);if(s.phase==='decision')bankBasket(s);}
  assert.equal(s.casts,0);assert.equal(s.phase,'ended');assert.equal(s.landed,8);assert.equal(s.basket.length,0);assert.ok(s.banked>0);assert.equal(Object.values(s.collection).reduce((a,b)=>a+b,0),8);
  const score=s.banked;assert.equal(bankBasket(s),false);assert.equal(castLine(s),false);advanceTrip(s,100);assert.equal(s.banked,score);
});
test('eight misses end without awarding or inventing collection progress', () => {
  const s=started();for(let i=0;i<8;i++){castLine(s);hookFish(s);}assert.equal(s.phase,'ended');assert.equal(s.lost,8);assert.equal(s.banked,0);assert.equal(s.landed,0);
});
test('pause freezes meters and decisions, releases the held input, and restart retains only saved progress', () => {
  const s=started();hook(s);setReeling(s,true);advanceTrip(s,.2);pauseTrip(s);assert.equal(s.held,false);const copy=JSON.stringify(s);advanceTrip(s,99);setReeling(s,true);hookFish(s);bankBasket(s);riskBasket(s);assert.equal(JSON.stringify(s),copy);
  pauseTrip(s);assert.equal(s.held,false);advanceTrip(s,.1);assert.ok(s.reelTime>.2);
  const fresh=createTrip({best:500,collection:{koi:3}});assert.equal(fresh.phase,'ready');assert.equal(fresh.casts,8);assert.equal(fresh.banked,0);assert.equal(fresh.best,500);assert.equal(fresh.collection.koi,3);assert.deepEqual(fresh.basket,[]);
});
test('malformed saved values cannot poison totals or journal entries', () => {
  for(const v of [null,[],false,'bad']){const p=safeProgress(v);assert.equal(p.best,0);assert.equal(Object.keys(p.collection).length,FISH.length);}
  const p=safeProgress({best:Infinity,collection:{koi:-1,medaka:3.7,goldfish:'9',perch:NaN,catfish:Infinity,moonfish:999999999}});assert.equal(p.best,0);assert.equal(p.collection.koi,0);assert.equal(p.collection.medaka,3);assert.equal(p.collection.goldfish,0);assert.equal(p.collection.perch,0);assert.equal(p.collection.catfish,0);assert.equal(p.collection.moonfish,1000000);
});
