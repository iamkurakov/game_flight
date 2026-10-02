global.THREE = require('../libs/three.min.js');
for (const f of ['Utils','LosAngeles','CollisionSystem','FlightPhysics']) require('../src/'+f+'.js');
const G = LA.Geo; G.buildGrid(); G.buildLandmarkData();
const ph = new LA.FlightPhysics(G, null);
ph.pos.set(-10500,6,3000); ph.vel.set(0,-1,-45); ph.quat.identity(); ph.grounded=false; ph.hasFlown=true; ph.airTime=2;
for (let i=0;i<120*20;i++){ ph.step(1/120,{pitch:0,roll:0,yaw:0,throttle:0.3,brake:false,assist:true}); if(ph.crashed){console.log('crash',ph.crashReason,'t=',(i/120).toFixed(1));break;} }
