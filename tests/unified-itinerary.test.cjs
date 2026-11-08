'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const inline=[...index.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert.equal(inline.length,1,'Exactly one classic inline app script');
new vm.Script(inline[0],{filename:'index.inline.js'});
for(const file of ['food-expansion-seeds.js','public-itinerary.js','meal-recommendations.js','unified-controls.js'])
 new vm.Script(fs.readFileSync(path.join(root,file),'utf8'),{filename:file});
const sandbox={window:{}};
for(const file of ['public-itinerary.js','meal-recommendations.js'])
 vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),sandbox,{filename:file});
const plans=sandbox.window.KyotoPublicItinerary20261108;
const meals=sandbox.window.KyotoMealRecommendations20261109;
assert.equal(plans.length,11,'December 25 through January 4');
assert.equal(meals.length,9,'Kyoto portion meal plans December 25 through January 2');
for(const day of meals){
 assert.ok(plans.some(p=>p.date===day.date),'Meals belong to a trip date');
 assert.equal(new Set(day.slots.map(s=>s.id)).size,day.slots.length,'Unique meal slot ids');
 assert.ok(day.slots.every(s=>s.time&&s.title&&s.options.length),'Non-empty meal slots');
}
const all=meals.flatMap(d=>d.slots.flatMap(s=>s.options.map(x=>x.name)));
assert.equal(all.length,new Set(all).size,'No repeated restaurant suggestions across days');
assert.ok(all.length>=50,'The expanded restaurant rotation is preserved');
const ohara=meals.find(d=>d.date==='2026-12-29');
assert.ok(ohara.slots.some(s=>s.id==='lunch'&&s.options.some(x=>x.name.includes('京美茶屋'))));
const onTime=plans.find(d=>d.date==='2026-12-29');
assert.ok(onTime.events.some(e=>e.title.includes('大原至貴船')&&e.time.includes('12:00')));
for(const src of ['food-expansion-seeds.js','public-itinerary.js','meal-recommendations.js','unified-controls.js'])
 assert.ok(index.includes('<script src="'+src+'"></script>'),'Script linked: '+src);
assert.ok(index.includes('function clearOldFirebaseItinerary()'));
assert.ok(index.includes('window.KyotoCloud.localChange(UI.read())'));
assert.ok(index.includes('data-editsource='));
assert.ok(index.includes('data-meal-select='));
assert.ok(index.includes('state.privateBookings'));
assert.ok(!index.includes('公開行程由 GitHub 直接更新；私人加排行程'));
console.log('PASS: JS parses; 11 trip dates; 9 meal days; 50 distinct restaurant candidates; integrated travel; one-time Firebase migration wired');
