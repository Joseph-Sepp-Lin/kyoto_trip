'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');

async function main(){
 const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 // Critical: offline browser tests NEVER connect to the real owner's Firebase account.
 let fixture=source.replace(/<script id="firebase-config" type="application\/json">[\s\S]*?<\/script>/,
 '<script id="firebase-config" type="application/json">null</script>');
 fixture=fixture.replace(/<script type="module">[\s\S]*?<\/script>/g,'');
 assert.notEqual(fixture,source,'Firebase must be disabled in test-only fixture');
 const server=http.createServer((req,res)=>{
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
  res.end(fixture);
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const url='http://127.0.0.1:'+server.address().port+'/';
 const browser=await chromium.launch({headless:true,channel:'chrome',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:375,height:812},deviceScaleFactor:1});
 const jsErrors=[];
 page.on('pageerror',e=>{jsErrors.push(String(e));console.error('BROWSER PAGE ERROR',e.stack||e)});
 page.on('console',msg=>{if(msg.type()==='error')console.error('BROWSER CONSOLE ERROR',msg.text())});
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.hostname==='127.0.0.1')route.continue(); else route.abort();
 });
 try{
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(1000);
  console.log('DIAGNOSTIC',JSON.stringify({ideaCount:await page.locator('#ideaCount').textContent(),gridCount:await page.locator('#ideaGrid .idea').count(),shoppingCount:await page.locator('#shoppingChecklist .checklist-category').count(),html:await page.title(),jsErrors}));
  await page.waitForFunction(()=>document.querySelectorAll('#ideaGrid .idea').length===65,{timeout:10000});
  const sessionIds=['before-tripDrawer','itineraryDrawer','ideasDrawer','restaurantsDrawer','shoppingDrawer','logisticsDrawer','budgetDrawer','notesDrawer'];
  for(const id of sessionIds)assert.equal(await page.locator('#'+id).evaluate(x=>x.open),false,'Default collapsed: '+id);
  // Keyboard and navigation should open the right parent, including deep hash targets.
  await page.locator('a[href="#itinerary"]').first().click();
  assert.equal(await page.locator('#itineraryDrawer').evaluate(x=>x.open),true,'Nav opens daily itinerary');
  await page.locator('#itineraryDrawer > summary').click();
  assert.equal(await page.locator('#itineraryDrawer').evaluate(x=>x.open),false,'Daily itinerary can close');
  await page.evaluate(()=>{location.hash='#flights'});
  await page.waitForFunction(()=>document.querySelector('#logisticsDrawer').open&&document.querySelector('#flightsPanel').open);
  await page.evaluate(()=>{location.hash='#sync'});
  await page.waitForFunction(()=>document.querySelector('#accountSettings').open&&document.querySelector('#syncDrawer').open);
  await page.locator('#ideasDrawer > summary').click();
  assert.equal(await page.locator('#ideasDrawer').evaluate(x=>x.open),true,'Ideas can expand');
  assert.match(await page.locator('#ideaCount').innerText(),/65／65/);
  assert.equal(await page.locator('#shoppingChecklist .checklist-category').count(),7);
  // 京都地圖：不需要連接真實 Firebase，也不要求地圖 CDN 載入才可以使用地點清單。
  assert.equal(await page.locator('#mapDrawer').evaluate(x=>x.open),false);
  await page.locator('a[href="#map"]').click();
  assert.equal(await page.locator('#mapDrawer').evaluate(x=>x.open),true);
  await page.waitForTimeout(350);
  console.log('MAP_DIAG',JSON.stringify(await page.evaluate(()=>({mapOpen:document.getElementById('mapDrawer').open,results:document.querySelectorAll('#geoMapResults .geo-result').length,preview:document.getElementById('geoMapResults').innerText.slice(0,180),count:document.getElementById('geoMapCount').textContent,hasGeoFn:typeof geoCatalog==='function',catalogLen:typeof geoCatalog==='function'?geoCatalog().length:-1,types:typeof geoCatalog==='function'?geoCatalog().reduce((o,x)=>(o[x.source]=(o[x.source]||0)+1,o),{}):{},geoState:typeof geoLeafletState!=='undefined'?geoLeafletState:'unknown'}))));
  const markerStyle=await page.evaluate(()=>{
    const marker=document.createElement('div');
    marker.className='geo-pin geo-event approx';marker.innerHTML='<span><em>🗓️</em></span>';
    document.body.appendChild(marker);
    const content=getComputedStyle(marker,'::before').content;
    const border=getComputedStyle(marker.querySelector('span')).borderTopColor;
    const line=document.createElement('div');line.className='event';document.body.appendChild(line);
    const timelineCircle=getComputedStyle(line,'::before').content;
    marker.remove();line.remove();
    return {content,border,timelineCircle};
  });
  assert.ok(!['""',"''"].includes(markerStyle.content),'Map markers must not inherit the timeline circle pseudo-element');
  assert.ok(['""',"''"].includes(markerStyle.timelineCircle),'Daily itinerary timeline circle must remain');
  assert.equal(markerStyle.border,'rgb(143, 89, 129)','Scheduled pin keeps its purple category border');
  await page.waitForFunction(()=>document.querySelectorAll('#geoMapResults .geo-result').length>=55,{timeout:8000});
  assert.match(await page.locator('#geoMapCount').innerText(),/顯示 \d+ 筆/);
  assert.ok((await page.locator('#geoMapResults .geo-result').allTextContents()).some(x=>x.includes('上林春松本店')));
  const positions=await page.evaluate(()=>({
   tea:getGeoPosition({place:'平等院'}),
   shrine:getGeoPosition({place:'貴船神社'}),
   restaurant:getGeoPosition({place:'Example',area:'祇園'}),
   exact:getGeoPosition({place:'Example',googleUrl:'https://www.google.com/maps/place/Foo/@35.0041,135.7777,18z'}),
   missing:getGeoPosition({place:'Unknown',area:''}),
   route:geoRouteUrl([{query:'清水寺 京都 日本'},{query:'建仁寺 京都 日本'},{query:'知恩院 京都 日本'}])
  }));
  assert.equal(positions.tea.precision,'參考位置');
  assert.ok(positions.tea.lat<34.95);
  assert.ok(positions.shrine.lat>35.09);
  assert.equal(positions.restaurant.precision,'區域概略');
  assert.equal(positions.exact.precision,'Google Maps 座標');
  assert.equal(positions.missing,null);
  assert.match(positions.route,/waypoints=/);
  await page.locator('#mapSource').selectOption('idea');
  await page.locator('#mapDate').selectOption('2026-12-26');
  assert.ok(await page.locator('#geoMapResults .geo-result').count()>=7);
  await page.locator('#mapDate').selectOption('all');
  await page.locator('#mapSource').selectOption('all');
  await page.locator('#geoMapResults [data-geoselect]').first().check();
  await page.locator('#geoMapResults [data-geoselect]').nth(1).check();
  assert.match(await page.locator('#geoRouteCount').innerText(),/2\/5/);
  await page.locator('#geoResetRoute').click();
  assert.match(await page.locator('#geoRouteCount').innerText(),/0\/5/);
  await fs.promises.mkdir('test-artifacts',{recursive:true});
  await page.locator('#map').screenshot({path:'test-artifacts/kyoto-map-overview.png',animations:'disabled'});
  assert.equal(await page.locator('#shoppingChecklist details[data-shopcat="香品／線香"] .shopping-checkitem').count(),8);
  const themes=await page.locator('#ideaFilters button').allTextContents();
  assert.equal(themes.length,9,'全部 + 八個主題');
  const sizes=[320,375,768,1280];
  for(const width of sizes){
   await page.setViewportSize({width,height:850});
   const overflow=await page.evaluate(()=>({viewport:window.innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
   assert.ok(overflow.html<=width+2,'Unexpected page horizontal overflow at '+width+': '+JSON.stringify(overflow));
  }
  await page.setViewportSize({width:375,height:812});
  await page.locator('#ideaFilters [data-filter="宇治茶與茶文化"]').click();
  assert.match(await page.locator('#ideaCount').innerText(),/7／65/);
  await page.locator('#ideaSearch').fill('綾鷹');
  assert.match(await page.locator('#ideaCount').innerText(),/1／65/);
  const card=page.locator('#ideaGrid .idea').first();
  await card.locator('summary').click();
  assert.equal(await card.locator('details').getAttribute('open'),'');
  assert.ok((await card.innerText()).includes('營業日期與時間'));
  assert.ok((await card.innerText()).includes('公休日'));
  assert.ok((await card.innerText()).includes('注意事項'));
  const maps=await card.locator('a').filter({hasText:'Google Maps'}).getAttribute('href');
  assert.match(maps,/google\.com\/maps\/search/);
  await fs.promises.mkdir('test-artifacts',{recursive:true});
  await page.locator('#ideas').screenshot({path:'test-artifacts/mobile-ideas.png',animations:'disabled'});
  await card.locator('[data-addidea]').click();
  assert.equal(await page.locator('#editor').evaluate(e=>e.open),true);
  await page.locator('#editorForm button[type="submit"]').click();
  let saved=await page.evaluate(()=>window.KyotoPlanner.read());
  assert.ok(saved.days.some(d=>d.events.some(e=>e.ideaId==='tea-kambayashi-shunsho')),'Added idea must exist');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelectorAll('#ideaGrid .idea').length===65);
  saved=await page.evaluate(()=>window.KyotoPlanner.read());
  assert.ok(saved.days.some(d=>d.events.some(e=>e.ideaId==='tea-kambayashi-shunsho')),'Added idea must survive reload');
  assert.equal(saved.shoppingItems.filter(x=>x.category==='日本茶／茶葉').length,4);
  assert.equal(saved.shoppingItems.filter(x=>x.category==='日本年貨／正月準備').length,15);
  assert.equal(saved.shoppingItems.filter(x=>x.category==='香品／線香').length,8);
  await page.locator('#shoppingDrawer > summary').click();
  await page.locator('#shoppingChecklist details[data-shopcat="日本茶／茶葉"] > summary').click();
  await page.locator('#shoppingChecklist [data-checkshop="tea-ayataka"]').check();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#shoppingDrawer > summary').click();
  await page.locator('#shoppingChecklist details[data-shopcat="日本茶／茶葉"] > summary').click();
  await page.locator('#shoppingChecklist [data-checkshop="tea-ayataka"]').waitFor();
  assert.equal(await page.locator('#shoppingChecklist [data-checkshop="tea-ayataka"]').isChecked(),true);
  await page.locator('#shoppingChecklist [data-editshopitem="tea-karigane"]').click();
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#modalDanger').click();
  assert.equal(await page.locator('#shoppingChecklist [data-checkshop="tea-karigane"]').count(),0);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelectorAll('#ideaGrid .idea').length===65);
  assert.equal(await page.locator('#shoppingChecklist [data-checkshop="tea-karigane"]').count(),0,'Deleted tea should not resurrect after reload');
  const legacy=await page.evaluate(()=>{
   const old=window.KyotoPlanner.seed();
   old.notes='保留既有私人旅行筆記';
   old.flights[0].price='4321';
   old.shoppingItems=[{id:'legacy-own',title:'我原本的購物品項',category:'日用品',done:true}];
   old.days[2].events.push({id:'user-kept-i5',ideaId:'i5',time:'14:00',title:'知恩院・除夜之鐘試敲',place:'知恩院',note:'使用者既有已確認活動，禁止覆蓋',transport:'巴士',status:'已確認',must:true,jpy:'',twd:''});
   window.KyotoPlanner.show(old);
   return window.KyotoPlanner.read();
  });
  assert.equal(legacy.notes,'保留既有私人旅行筆記');
  assert.equal(legacy.flights[0].price,'4321');
  assert.ok(legacy.shoppingItems.some(x=>x.id==='legacy-own'&&x.done),'legacy shopping item lost');
  assert.equal(legacy.shoppingItems.filter(x=>x.category==='日本茶／茶葉').length,4,'Cloud legacy show migration');
  assert.equal(legacy.shoppingItems.filter(x=>x.category==='香品／線香').length,8,'Cloud legacy incense migration');
  assert.equal(legacy.shoppingItems.filter(x=>x.category==='日本年貨／正月準備').length,15,'New Year checklist is added on old cloud data');
  assert.ok(legacy.shoppingItems.find(x=>x.id==='newyear-miso').shop2,'Multiple recommended shops');
  // User's private restaurant names remain in memory and render in map but are never baked into GitHub source.
  await page.evaluate(()=>{
   const draft=window.KyotoPlanner.read();
   draft.restaurants=[{id:'r-map-1',name:'測試京都餐廳',area:'東山區',googleUrl:'',dish:'湯豆腐',category:'和食',note:''}];
   window.KyotoPlanner.show(draft);
  });
  console.log('MAP_LEGACY_DIAG',JSON.stringify(await page.evaluate(()=>({open:document.querySelector('#mapDrawer').open,source:mapSource.value,date:mapDate.value,region:mapRegion.value,search:mapSearch.value,rest:window.KyotoPlanner.read().restaurants.length,geo:geoCatalog().filter(x=>x.source==='restaurant').length,visible:geoVisiblePoints().filter(x=>x.source==='restaurant').length}))));
  if(!(await page.locator('#mapDrawer').evaluate(x=>x.open)))await page.locator('#mapDrawer > summary').click();
  await page.waitForFunction(()=>document.querySelector('#geoMapResults').innerText.includes('測試京都餐廳'),null,{timeout:8000});
  await page.locator('#mapSource').selectOption('restaurant');
  assert.equal(await page.locator('#geoMapResults .geo-result').count(),1);
  await page.locator('#geoMapResults [data-geoedit="r-map-1"]').click();
  assert.equal(await page.locator('#editorForm input[name="locationLat"]').count(),1);
  await page.locator('#editorForm input[name="locationLat"]').fill('35.0045');
  await page.locator('#editorForm input[name="locationLng"]').fill('135.7785');
  await page.locator('#editorForm button[type="submit"]').click();
  assert.equal((await page.evaluate(()=>window.KyotoPlanner.read())).restaurants[0].locationLat,'35.0045');
  await page.locator('#mapSource').selectOption('all');

  const incenseNotes=legacy.shoppingItems.filter(x=>x.category==='香品／線香');
  assert.ok(incenseNotes.every(x=>x.note.includes('• ')&&Number(x.shopPrice1)>0),'Incense product notes and store totals');
  await page.locator('#shoppingDrawer > summary').click();
  await page.locator('#shoppingChecklist details[data-shopcat="香品／線香"] > summary').click();
  await page.locator('#shoppingChecklist [data-editshopitem="incense-store-shoyeido"]').click();
  const notes=await page.locator('#editorForm textarea[name="note"]').inputValue();
  assert.ok(notes.includes('芳輪 京五彩')&&notes.includes('¥1,650'));
  assert.equal(await page.locator('#editorForm input[name="shopPrice1"]').inputValue(),'3630');
  await page.locator('#modalClose').click();
  // Curated itinerary: preview is opt-in and does not write until the user confirms.
  let beforePlan=await page.evaluate(()=>window.KyotoPlanner.read());
  const initialEventCount=beforePlan.days.reduce((n,d)=>n+d.events.length,0);
  assert.ok(initialEventCount>=1,'The legacy confirmed event must remain');
  await page.locator('#previewCuratedItinerary').click();
  assert.equal(await page.locator('#editor').evaluate(el=>el.open),true);
  assert.equal(await page.locator('#editorForm input[name="choice__i5"]').count(),0,'Manual existing event must be skipped');
  assert.equal(await page.locator('#editorForm input[name="choice__i1"]').isChecked(),true);
  assert.equal(await page.locator('#editorForm input[name="choice__film-pontocho"]').isChecked(),false,'Optional event must start unchecked');
  await page.locator('#editorForm button[type="submit"]').click();
  let merged=await page.evaluate(()=>window.KyotoPlanner.read());
  assert.equal(merged.days.filter(d=>d.events.some(e=>e.id==='user-kept-i5')).length,1);
  assert.equal(merged.days[2].events.find(e=>e.id==='user-kept-i5').note,'使用者既有已確認活動，禁止覆蓋');
  assert.equal(merged.flights[0].price,'4321','Flight price retained');
  assert.equal(merged.notes,'保留既有私人旅行筆記','Existing notes retained');
  assert.ok(merged.shoppingItems.some(x=>x.id==='legacy-own'&&x.done),'Shopping data retained');
  const numAfter=merged.days.reduce((n,d)=>n+d.events.length,0);
  assert.ok(numAfter>=initialEventCount+18 && numAfter<=initialEventCount+38,'Expected curated plan with defaults selected');
  assert.equal(new Set(merged.days.flatMap(d=>d.events.map(e=>e.id))).size,numAfter,'Unique event IDs');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#previewCuratedItinerary'));
  merged=await page.evaluate(()=>window.KyotoPlanner.read());
  assert.equal(merged.days.reduce((n,d)=>n+d.events.length,0),numAfter,'Curated plan persisted after reload');
  await page.locator('#previewCuratedItinerary').click();
  const remaining=await page.locator('#editorForm input[type="checkbox"]').count();
  const expectedRemaining=await page.evaluate(()=>curatedAvailableRows().reduce((n,g)=>n+g.rows.length,0));
  assert.equal(remaining,expectedRemaining,'After import only remaining optional suggestions remain without duplicates');
  assert.ok(remaining>=1,'Optional alternatives remain');
  await page.locator('#modalClose').click();
  await page.setViewportSize({width:1280,height:900});
  await page.locator('#ideasDrawer > summary').click();
  await page.locator('#ideaFilters [data-filter="全部"]').click();
  await page.locator('#ideaSearch').fill('');
  await page.locator('#ideas').screenshot({path:'test-artifacts/desktop-ideas.png',animations:'disabled'});
  assert.equal(jsErrors.length,0,'JS errors: '+jsErrors.join('; '));
  console.log('PASS browser: opt-in curated Firebase-ready itinerary merge and reload, session drawers, navigation deep links, nested tea categories, 320/375/768/1280 layout, theme/search, add/save/reload, tea check/delete/reload, legacy cloud payload');
 }finally{
  await browser.close();
  await new Promise(ok=>server.close(ok));
 }
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1});
