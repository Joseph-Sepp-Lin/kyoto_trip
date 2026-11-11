'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
async function main(){
 const root=path.join(__dirname,'..');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8')
   .replace(/<script id="firebase-config" type="application\/json">[\s\S]*?<\/script>/,
   '<script id="firebase-config" type="application/json">null</script>')
   .replace(/<script type="module">[\s\S]*?<\/script>/g,'');
 const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');
  const file=u.pathname==='/'?'index.html':u.pathname.slice(1);
  if(!['index.html','food-expansion-seeds.js','public-itinerary.js','meal-recommendations.js','unified-controls.js'].includes(file)){res.writeHead(404);return res.end('not found')}
  res.writeHead(200,{'Content-Type':file.endsWith('.js')?'application/javascript; charset=utf-8':'text/html; charset=utf-8'});
  res.end(file==='index.html'?html:fs.readFileSync(path.join(root,file),'utf8'));
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const browser=await chromium.launch({headless:true,channel:'chrome',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:375,height:820}});
 const errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/*',route=>{
  if(new URL(route.request().url()).hostname==='127.0.0.1')route.continue();else route.abort();
 });
 try{
  await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelectorAll('#dayPanel .trip-meal').length>=3,null,{timeout:15000});
  await page.locator('#itineraryDrawer > summary').click();
  assert.match(await page.locator('#dayPanel').innerText(),/單一整合行程/);
  assert.match(await page.locator('#dayPanel').innerText(),/本家 第一旭 本店/);
  await page.locator('#dayPanel [data-meal-select]').first().check();
  let st=await page.evaluate(()=>window.KyotoPlanner.read());
  assert.equal(st.mealChoices['2026-12-25|breakfast'].selected,'本家 第一旭 本店');
  await page.locator('#dayPanel [data-meal-add]').first().click();
  assert.equal(await page.locator('#editor').evaluate(x=>x.open),true);
  await page.locator('#editorForm select[name="restaurant"]').selectOption({index:1});
  await page.locator('#editorForm button[type="submit"]').click();
  st=await page.evaluate(()=>window.KyotoPlanner.read());
  assert.equal(st.mealChoices['2026-12-25|breakfast'].added.length,1);
  await page.locator('#dayTabs [data-day="4"]').click();
  assert.match(await page.locator('#dayPanel').innerText(),/京美茶屋/);
  assert.match(await page.locator('#dayPanel').innerText(),/大原至貴船/);
  await page.evaluate(()=>{
   const d=window.KyotoPlanner.read();
   Object.assign(d.flights[0],{airline:'測試航空',number:'TEST50',date:'2026-12-25',arriveDate:'2026-12-25',depart:'02:00',arrive:'06:00'});
   Object.assign(d.intercity[0],{date:'2026-12-25',mode:'JR',service:'TEST HARUKA',depart:'06:31',arrive:'08:11'});
   Object.assign(d.stays[0],{name:'測試住宿',address:'京都車站',dates:'2026/12/25–2027/01/02',checkin:'15:00'});
   d.days[0].events.push({id:'old-ticket',title:'京都市交響樂團・貝多芬第九',time:'19:00',place:'京都音樂廳',status:'已確認',note:'Order-Number: TEST ONLY',jpy:'3000',twd:''});
   d.days[0].events.push({id:'old-candidate',title:'過去的行程候選',time:'12:00',place:'京都',status:'候選'});
   window.KyotoPlanner.show(d);
  });
  await page.locator('#dayTabs [data-day="0"]').click();
  const before=await page.locator('#dayPanel').innerText();
  assert.match(before,/TEST50/);
  assert.match(before,/TEST HARUKA/);
  assert.match(before,/測試住宿/);
  const cleared=await page.evaluate(()=>{const wasChanged=window.KyotoPlanner.clearOldFirebaseItinerary();const d=window.KyotoPlanner.read();return {wasChanged,events:d.days[0].events,bookings:d.privateBookings,flight:d.flights[0].number,stay:d.stays[0].name}});
  assert.equal(cleared.wasChanged,true);
  assert.deepEqual(cleared.events,[]);
  assert.equal(cleared.bookings.length,1);
  assert.equal(cleared.bookings[0].jpy,'3000');
  assert.equal(cleared.flight,'TEST50');
  assert.equal(cleared.stay,'測試住宿');
  assert.match(await page.locator('#dayPanel').innerText(),/私人票券、訂位與費用紀錄/);
  assert.ok(!(await page.locator('#dayPanel').innerText()).includes('過去的行程候選'));
  const second=await page.evaluate(()=>window.KyotoPlanner.clearOldFirebaseItinerary());
  assert.equal(second,false,'Migration is one-time only');
  // Migrated ticket must be editable in-place without being charged twice.
  const concert=page.locator('#dayPanel .unified-event').filter({hasText:'京都市交響樂團・貝多芬第九'}).first();
  await concert.locator('[data-editticket]').click();
  assert.equal(await page.locator('#editorForm input[name="jpy"]').inputValue(),'3000');
  await page.locator('#modalClose').click();
  // teamLab has a dedicated private purchase editor attached to its public event.
  await page.locator('#dayTabs [data-day="1"]').click();
  const teamLab=page.locator('#dayPanel .unified-event').filter({hasText:'teamLab Biovortex Kyoto'}).first();
  assert.equal(await teamLab.locator('[data-editticket]').count(),1);
  await teamLab.locator('[data-editticket]').click();
  assert.match(await page.locator('#modalTitle').innerText(),/門票・活動費用/);
  await page.locator('#editorForm select[name="status"]').selectOption('已購票');
  await page.locator('#editorForm input[name="jpy"]').fill('4200');
  await page.locator('#editorForm input[name="twd"]').fill('1080');
  await page.locator('#editorForm input[name="booking"]').fill('PRIVATE-TEST-ORDER');
  await page.locator('#editorForm textarea[name="note"]').fill('票券備註 - private');
  await page.locator('#editorForm button[type="submit"]').click();
  let ticketDetails=await page.evaluate(()=>{
   const d=window.KyotoPlanner.read();
   const rows=ledgerRecords().filter(x=>x.category==='活動／門票'&&x.item.title?.includes('teamLab'));
   const e=d.privateBookings.filter(x=>x.title.includes('teamLab'));
   return {entries:e,ledgerCount:rows.length,cost:rows.length?normalizedCost(rows[0].item):null};
  });
  assert.equal(ticketDetails.entries.length,1,'Only one ticket per public event');
  assert.equal(ticketDetails.entries[0].booking,'PRIVATE-TEST-ORDER');
  assert.equal(ticketDetails.entries[0].status,'已購票');
  assert.equal(ticketDetails.entries[0].jpy,'4200');
  assert.equal(ticketDetails.entries[0].twd,'1080');
  assert.equal(ticketDetails.ledgerCount,1);
  assert.equal(ticketDetails.cost.converted,1080,'Actual TWD overrides JPY in ledger');
  assert.match(await teamLab.innerText(),/票價 NT\$1,080/);
  assert.match(await teamLab.innerText(),/已購票/);
  await teamLab.locator('[data-editticket]').click();
  assert.equal(await page.locator('#editorForm input[name="twd"]').inputValue(),'1080');
  await page.locator('#editorForm input[name="twd"]').fill('990');
  await page.locator('#editorForm button[type="submit"]').click();
  ticketDetails=await page.evaluate(()=>{
   const d=window.KyotoPlanner.read();
   const rows=ledgerRecords().filter(x=>x.category==='活動／門票'&&x.item.title?.includes('teamLab'));
   return {count:d.privateBookings.filter(x=>x.title.includes('teamLab')).length,ledgerCount:rows.length,converted:normalizedCost(rows[0].item).converted};
  });
  assert.equal(ticketDetails.count,1,'Editing a ticket updates the same record');
  assert.equal(ticketDetails.ledgerCount,1);
  assert.equal(ticketDetails.converted,990);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#itineraryDrawer > summary').click();
  await page.locator('#dayTabs [data-day="1"]').click();
  const reloaded=await page.evaluate(()=>window.KyotoPlanner.read().privateBookings.find(x=>x.title.includes('teamLab')));
  assert.equal(reloaded.twd,'990','Ticket payment persisted after reload');
  for(const width of [320,375,768]){
   await page.setViewportSize({width,height:820});
   const size=await page.evaluate(()=>document.documentElement.scrollWidth);
   assert.ok(size<=width+2,'No horizontal overflow at '+width+'px: '+size);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS unified itinerary browser: meal options, travel integration, safe Firebase migration, private teamLab ticket price and TWD-first accounting');
 }finally{await browser.close();await new Promise(ok=>server.close(ok))}
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1});
