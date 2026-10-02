global.THREE = require('../libs/three.min.js');
for (const f of ['Utils','LosAngeles','CollisionSystem','FlightPhysics']) require('../src/'+f+'.js');
const G = LA.Geo; G.buildGrid(); G.buildLandmarkData();
const city = LA.City.generate();
const coll = new LA.CollisionSystem(city.buildings.concat(G.colliders));
const P = LA.AircraftParams;
const DT = 1/120;
function mk() { return new LA.FlightPhysics(G, coll); }
function run(ph, secs, ctl, log, every=1) {
  const n = Math.round(secs/DT); let t0=ph._t||0;
  for (let i=0;i<n;i++) {
    ph._t = (ph._t||0)+DT;
    const inp = typeof ctl==='function' ? ctl(ph, ph._t) : ctl;
    ph.step(DT, inp);
    ph.events.length && ph.events.forEach(e=>console.log(`   [t=${ph._t.toFixed(1)}] event`, JSON.stringify(e, (k,v)=>typeof v==='number'?+v.toFixed(2):v)));
    ph.events.length = 0;
    if (log && i % Math.round(every/DT) === 0) console.log(log(ph));
    if (ph.crashed) { console.log('   CRASHED:', ph.crashReason, 'at t=', ph._t.toFixed(1)); break; }
  }
}
const fmt = (p)=>`t=${p._t.toFixed(0).padStart(3)} V=${p.airspeed.toFixed(1)} alt=${p.pos.y.toFixed(0)} agl=${p.agl.toFixed(0)} vs=${p.vsi.toFixed(1)} pitch=${p.pitchDeg.toFixed(1)} bank=${p.bankDeg.toFixed(0)} hdg=${p.headingDeg.toFixed(0)} a=${(p.alpha/Math.PI*180).toFixed(1)} g=${p.gLoad.toFixed(2)} ${p.grounded?'GND':'AIR'}${p.stalled?' STALL':''}`;
const C = (o)=>Object.assign({pitch:0,roll:0,yaw:0,throttle:0.1,brake:false,assist:true}, o);

console.log('\n=== 1. Взлёт (газ 100%, на 36 м/с тянем) ===');
let ph = mk(); let lift=null;
run(ph, 30, (p,t)=>C({throttle:1, pitch: p.airspeed>34 ? 0.55 : 0, yaw:0}), (p)=>{ return fmt(p)+` x=${(p.pos.x-G.runway.x0-90).toFixed(0)}m`;}, 3);

console.log('\n=== 2. Висение без рук на 450 м, 60 м/с, газ 55% (assist ON) ===');
ph = mk(); ph.pos.set(0, 450, 0); ph.vel.set(0,0,-60); ph.quat.identity(); ph.grounded=false; ph.hasFlown=true; ph.airTime=1; ph.engine=0.55;
run(ph, 40, C({throttle:0.55}), fmt, 5);

console.log('\n=== 3. Вираж 40° (assist ON): держим крен регулятором, 20 с ===');
ph = mk(); ph.pos.set(0, 450, 0); ph.vel.set(0,0,-65); ph.quat.identity(); ph.grounded=false; ph.hasFlown=true; ph.airTime=1; ph.engine=0.6;
run(ph, 20, (p)=>C({roll: Math.max(-1,Math.min(1,(40-p.bankDeg)/15)), throttle:0.6}), fmt, 3);
console.log('  -- отпускаем ручку');
run(ph, 8, C({throttle:0.6}), fmt, 2);
console.log('\n=== 3b. Вираж 40° (assist OFF) ===');
ph = mk(); ph.pos.set(0, 450, 0); ph.vel.set(0,0,-65); ph.quat.identity(); ph.grounded=false; ph.hasFlown=true; ph.airTime=1; ph.engine=0.6;
run(ph, 12, (p)=>C({assist:false, roll: Math.max(-1,Math.min(1,(40-p.bankDeg)/15)), pitch: 0.0, throttle:0.6}), fmt, 3);

console.log('\n=== 4. Срыв: газ 0, тянем на себя (assist ON) ===');
ph = mk(); ph.pos.set(0, 800, 0); ph.vel.set(0,0,-55); ph.quat.identity(); ph.grounded=false; ph.hasFlown=true; ph.airTime=1; ph.engine=0.3;
run(ph, 20, C({throttle:0, pitch:1}), fmt, 1.5);
console.log('  -- выход: ручка от себя, газ полный');
run(ph, 12, (p,t)=>C({throttle:1, pitch: p.alpha>0.15? -0.6 : 0}), fmt, 1.5);

console.log('\n=== 5. Посадка: заход 3° с океана, 42 м/с, выравнивание ===');
ph = mk(); const R=G.runway; const x0=R.x0-2400; ph.pos.set(x0, 6+ (R.x0+250-x0)*Math.tan(3*Math.PI/180), R.cz); ph.vel.set(42,-2.2,0);
ph.quat.setFromAxisAngle(new THREE.Vector3(0,1,0), -Math.PI/2); ph.grounded=false; ph.hasFlown=true; ph.airTime=1; ph.engine=0.3;
run(ph, 90, (p)=>{ const agl=p.agl; let pitch=0, thr=Math.max(0,Math.min(1,0.3+(p.airspeed-42)*-0.08)); if(agl<11){ thr=0; pitch = Math.max(-0.3, Math.min(0.6,(-0.5 - p.vsi)*0.35)); } return C({throttle:thr, pitch, brake: p.grounded && p.groundspeed<30}); }, fmt, 4);

console.log('\n=== 6. Жёсткая посадка: пикируем -8 м/с в ВПП ===');
ph = mk(); ph.pos.set(R.x0+500, 6+60, R.cz); ph.vel.set(45,-8,0); ph.quat.setFromAxisAngle(new THREE.Vector3(0,1,0), -Math.PI/2); ph.grounded=false; ph.hasFlown=true; ph.airTime=1; ph.engine=0.3;
run(ph, 20, C({throttle:0.2}), null);

console.log('\n=== 7. Столкновение с горой (курс на север к Гриффит) ===');
ph = mk(); ph.pos.set(-250, 300, -2000); ph.vel.set(0,0,-60); ph.quat.identity(); ph.grounded=false; ph.hasFlown=true; ph.airTime=1; ph.engine=0.6;
run(ph, 60, C({throttle:0.6}), null);

console.log('\n=== 8. Здание: US Bank Tower ===');
const T=G.towers[0]; ph = mk(); ph.pos.set(T.x, 200, T.z+800); ph.vel.set(0,0,-60); ph.quat.identity(); ph.grounded=false; ph.hasFlown=true; ph.airTime=1; ph.engine=0.6;
run(ph, 30, C({throttle:0.6}), null);

console.log('\n=== 9. Фаззинг 200 прогонов по 60 с со случайными вводами: NaN? ===');
let nan=0, crashes=0;
for (let k=0;k<200;k++){ ph=mk(); ph.pos.set((Math.random()-0.5)*8000, 100+Math.random()*1500, (Math.random()-0.5)*8000); ph.vel.set((Math.random()-0.5)*80,(Math.random()-0.5)*20,(Math.random()-0.5)*80); ph.grounded=false; ph.hasFlown=true; ph.airTime=1;
  let c={pitch:0,roll:0,yaw:0,throttle:0.5,brake:false,assist:Math.random()<0.5};
  for (let i=0;i<60*120;i++){ if(i%120===0){ c={pitch:Math.random()*2-1,roll:Math.random()*2-1,yaw:Math.random()*2-1,throttle:Math.random(),brake:Math.random()<0.1,assist:c.assist}; } ph.step(DT,c); ph.events.length=0; if(ph.crashed) break; }
  if (ph.nanRecoveries>0) nan++; if (ph.crashed) crashes++;
  if (!Number.isFinite(ph.pos.x+ph.pos.y+ph.pos.z+ph.quat.x+ph.quat.w)) console.log('NONFINITE!');
}
console.log('runs with NaN recovery:', nan, 'crashed:', crashes, '/200');
