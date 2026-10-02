global.THREE = require('../libs/three.min.js');
for (const f of ['Utils','LosAngeles','CollisionSystem','FlightPhysics']) require('../src/'+f+'.js');
const G = LA.Geo; G.buildGrid(); G.buildLandmarkData();
const coll = new LA.CollisionSystem(LA.City.generate().buildings.concat(G.colliders));
for (const assist of [false,true]) {
  const ph = new LA.FlightPhysics(G, coll); const R=G.runway;
  ph.pos.set(R.x0+300, R.elev+30, R.cz); ph.vel.set(40,-9,0); ph.quat.setFromAxisAngle(new THREE.Vector3(0,1,0), -Math.PI/2); ph.grounded=false; ph.hasFlown=true; ph.airTime=2; ph.engine=0;
  let t=0; const out=[];
  for (let i=0;i<120*30;i++){ t+=1/120; ph.step(1/120,{pitch:0,roll:0,yaw:0,throttle:0,brake:false,assist}); 
    if (i%240===0) out.push(`t=${t.toFixed(0)} y=${(ph.pos.y-R.elev).toFixed(1)} vs=${ph.vsi.toFixed(1)} V=${ph.airspeed.toFixed(0)} pitch=${ph.pitchDeg.toFixed(0)} a=${(ph.alpha*57.3).toFixed(0)} ${ph.grounded?'G':'A'}`);
    for (const e of ph.events) out.push('EVENT '+JSON.stringify(e,(k,v)=>typeof v==='number'?+v.toFixed(2):v)); ph.events.length=0;
    if (ph.crashed) { out.push('CRASH '+ph.crashReason); break; } }
  console.log('assist', assist, '\n  '+out.join('\n  '));
}
