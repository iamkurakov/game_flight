global.THREE = require('../libs/three.min.js');
require('../src/Utils.js'); require('../src/LosAngeles.js');
const G = LA.Geo;
console.time('grid'); G.buildGrid(); console.timeEnd('grid');
G.buildLandmarkData();
const pts = {downtown:G.pt.downtown, griffith:G.pt.griffith, sign:G.pt.sign, pier:G.pt.pierRoot, runwayW:{x:G.runway.x0,z:G.runway.cz}, runwayE:{x:G.runway.x1,z:G.runway.cz}, coastSM:{x:-8950,z:-2400}, centuryCity:G.pt.centuryCity,
 NE:{x:12000,z:-5000}, S:{x:0,z:10500}, W:{x:-12900,z:0}};
for (const [k,p] of Object.entries(pts)) console.log(k.padEnd(12), 'h=', G.height(p.x,p.z).toFixed(1), 'surf=',G.surfaceAt(p.x,p.z));
let mn=1e9,mx=-1e9; for (const v of G.grid.data){mn=Math.min(mn,v);mx=Math.max(mx,v);} console.log('min/max', mn.toFixed(0), mx.toFixed(0));
console.time('city'); const c = LA.City.generate(); console.timeEnd('city');
console.log('buildings', c.buildings.length, 'blocks', c.blocks.length);
const kinds = {}; c.blocks.forEach(b=>kinds[b.kind]=(kinds[b.kind]||0)+1); console.log(kinds);
const tall = c.buildings.filter(b=>b.y1-b.y0>100).length; console.log('tall>100m', tall);
console.log('sign letters', G.sign.letters.map(l=>l.ch+':'+l.y.toFixed(0)).join(' '));
