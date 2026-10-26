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
  await page.locator('#ideaGrid .idea').first().waitFor({timeout:7000});
  assert.match(await page.locator('#ideaCount').innerText(),/55／55/);
  assert.equal(await page.locator('#shoppingChecklist .checklist-category').count(),5);
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
  assert.match(await page.locator('#ideaCount').innerText(),/7／55/);
  await page.locator('#ideaSearch').fill('綾鷹');
  assert.match(await page.locator('#ideaCount').innerText(),/1／55/);
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
  await page.locator('#ideaGrid .idea').first().waitFor();
  saved=await page.evaluate(()=>window.KyotoPlanner.read());
  assert.ok(saved.days.some(d=>d.events.some(e=>e.ideaId==='tea-kambayashi-shunsho')),'Added idea must survive reload');
  assert.equal(saved.shoppingItems.filter(x=>x.category==='日本茶／茶葉').length,4);
  await page.locator('#shoppingChecklist [data-checkshop="tea-ayataka"]').check();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#shoppingChecklist [data-checkshop="tea-ayataka"]').waitFor();
  assert.equal(await page.locator('#shoppingChecklist [data-checkshop="tea-ayataka"]').isChecked(),true);
  await page.locator('#shoppingChecklist [data-editshopitem="tea-karigane"]').click();
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#modalDanger').click();
  assert.equal(await page.locator('#shoppingChecklist [data-checkshop="tea-karigane"]').count(),0);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#ideaGrid .idea').first().waitFor();
  assert.equal(await page.locator('#shoppingChecklist [data-checkshop="tea-karigane"]').count(),0,'Deleted tea should not resurrect after reload');
  const legacy=await page.evaluate(()=>{
   const old=window.KyotoPlanner.seed();
   old.notes='保留既有私人旅行筆記';
   old.flights[0].price='4321';
   old.shoppingItems=[{id:'legacy-own',title:'我原本的購物品項',category:'日用品',done:true}];
   window.KyotoPlanner.show(old);
   return window.KyotoPlanner.read();
  });
  assert.equal(legacy.notes,'保留既有私人旅行筆記');
  assert.equal(legacy.flights[0].price,'4321');
  assert.ok(legacy.shoppingItems.some(x=>x.id==='legacy-own'&&x.done),'legacy shopping item lost');
  assert.equal(legacy.shoppingItems.filter(x=>x.category==='日本茶／茶葉').length,4,'Cloud legacy show migration');
  await page.setViewportSize({width:1280,height:900});
  await page.locator('#ideaFilters [data-filter="全部"]').click();
  await page.locator('#ideaSearch').fill('');
  await page.locator('#ideas').screenshot({path:'test-artifacts/desktop-ideas.png',animations:'disabled'});
  assert.equal(jsErrors.length,0,'JS errors: '+jsErrors.join('; '));
  console.log('PASS browser: 320/375/768/1280 layout, theme/search, detail links, add/save/reload, tea check/delete/reload, legacy cloud payload');
 }finally{
  await browser.close();
  await new Promise(ok=>server.close(ok));
 }
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1});
