import test from 'node:test';import assert from 'node:assert/strict';import {RoomService} from '../room-service.ts';import {createDoodleApi} from '../server-api.ts';
function setup(){let clock=100000;const service=new RoomService({now:()=>clock,random:()=>.4});const a=service.create('Ada'),b=service.join(a.code,'Bea');const state=p=>service.state(p.code,p.token),act=(p,data)=>service.act(p.code,p.token,data);return{service,a,b,state,act,advance:ms=>{clock+=ms;}};}
test('word choices and hidden prompt never leak to guessers',()=>{const{a,b,state,act}=setup();act(a,{action:'start',duration:60});assert.equal(state(a).choices.length,3);assert.deepEqual(state(b).choices,[]);act(a,{action:'choose',index:1});const word=state(a).word;assert.ok(word);assert.equal(state(b).word,null);assert.ok(!JSON.stringify(state(b)).includes(`"${word}"`));assert.match(state(b).hint,/^[_ ]+$/);});
test('authority and payload validation prevent impersonation and invalid strokes',()=>{const{a,b,act,service}=setup();assert.throws(()=>act(b,{action:'start',duration:60}),/host/);act(a,{action:'start',duration:60});assert.throws(()=>act(b,{action:'choose',index:1}),/turn/);act(a,{action:'choose',index:0});assert.throws(()=>act(b,{action:'stroke',points:[[.1,.2]],color:'#353048',size:7,strokeId:'x'}),/artist/);assert.throws(()=>act(a,{action:'stroke',points:[[Infinity,.2]],color:'#353048',size:7,strokeId:'x'}),/coordinates/);assert.throws(()=>service.state(a.code,'fake-token'),/session/);assert.throws(()=>act(b,{action:'kick',playerId:a.playerId}),/host/);});
test('drawing synchronizes, undo removes an entire segmented stroke, clear works',()=>{const{a,b,state,act}=setup();act(a,{action:'start',duration:60});act(a,{action:'choose',index:0});for(let i=0;i<3;i++)act(a,{action:'stroke',points:[[i/10,.2]],color:'#353048',size:7,strokeId:'line'});assert.equal(state(b).strokes.length,3);act(a,{action:'undo'});assert.equal(state(b).strokes.length,0);act(a,{action:'stroke',points:[[.1,.2]],color:'#353048',size:7,strokeId:'another'});act(a,{action:'clear'});assert.equal(state(b).strokes.length,0);});
test('full two-player two-round match rotates artists, scores and rematches',()=>{const s=setup();s.act(s.a,{action:'start',duration:45});for(let turn=0;turn<4;turn++){const artist=turn%2?s.b:s.a,guesser=turn%2?s.a:s.b;s.state(artist);s.state(guesser);s.act(artist,{action:'choose',index:0});const word=s.state(artist).word;s.act(guesser,{action:'guess',text:word.toUpperCase()});assert.equal(s.state(guesser).phase,'reveal');s.advance(5000);s.state(s.a);s.state(s.b);}const final=s.state(s.a);assert.equal(final.phase,'finished');assert.deepEqual(final.players.map(p=>p.score),[500,500]);s.act(s.a,{action:'start',duration:60});assert.equal(s.state(s.a).phase,'choosing');assert.deepEqual(s.state(s.a).players.map(p=>p.score),[0,0]);});
test('late joiners spectate and cannot score in current match',()=>{const{a,b,service,act,state}=setup();act(a,{action:'start',duration:60});const c=service.join(a.code,'Cat');act(a,{action:'choose',index:0});assert.equal(state(c).spectator,true);assert.throws(()=>act(c,{action:'guess',text:state(a).word}),/next/);assert.equal(state(b).spectator,false);});
test('timeouts, disconnected host transfer, and room expiration progress safely',()=>{const s=setup();s.act(s.a,{action:'start',duration:45});s.advance(16000);assert.equal(s.state(s.a).phase,'drawing');s.advance(10000);const b=s.state(s.b);assert.equal(b.host,s.a.playerId);s.advance(21000);const next=s.state(s.b);assert.equal(next.host,s.b.playerId);assert.equal(next.phase,'reveal');s.advance(31*60000);s.service.tick();assert.throws(()=>s.state(s.b),/expired/);});
test('invalid names do not allocate rooms and room capacity is bounded',()=>{const service=new RoomService();assert.throws(()=>service.create('\u0001'),/name/);assert.equal(service.rooms.size,0);const a=service.create('A');for(let i=0;i<7;i++)service.join(a.code,'player'+i);assert.throws(()=>service.join(a.code,'ninth'),/eight/);assert.throws(()=>service.join(a.code,'A'),/eight/);});
test('duplicate guesses cannot farm score',()=>{const s=setup();s.act(s.a,{action:'start',duration:60});s.act(s.a,{action:'choose',index:0});const word=s.state(s.a).word;s.act(s.b,{action:'guess',text:word});assert.throws(()=>s.act(s.b,{action:'guess',text:word}),/next/);assert.equal(s.state(s.b).players.find(p=>p.id===s.b.playerId).score,200);});
test('API rejects foreign origins, malformed JSON, unsupported content types and oversized bodies', async () => {
  const api = createDoodleApi();
  async function call({ body = '{}', origin = 'http://localhost:4180', content = 'application/json' } = {}) {
    return api.handle(new Request('http://localhost:4180/doodle-dash/api/rooms', {
      method: 'POST',
      headers: {
        origin,
        'content-type': content,
        'x-questline-client-address': 'test',
      },
      body,
    }));
  }
  try {
    assert.equal((await call({ origin: 'https://elsewhere.invalid' })).status, 403);
    assert.equal((await call({ body: '{' })).status, 400);
    assert.equal((await call({ content: 'text/plain' })).status, 415);
    assert.equal((await call({ body: 'x'.repeat(19000) })).status, 413);
    assert.equal((await call({ body: '{"name":"Host"}' })).status, 201);
  } finally { api.close(); }
});
