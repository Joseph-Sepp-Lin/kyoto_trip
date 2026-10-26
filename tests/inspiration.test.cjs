'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
const source=scripts.find(x=>x.includes('const ideaData=['));
assert.ok(source,'主程式必須存在');
new vm.Script(source,{filename:'index.html/inline.js'});
const between=(start,end)=>{
 const i=source.indexOf(start),j=source.indexOf(end,i+start.length);
 assert.ok(i>=0&&j>i,'找不到片段: '+start);
 return source.slice(i,j);
};
const ideaCode=between('const DATES=','const e=');
const cat=vm.runInNewContext(ideaCode+'\n({ideaData,ideaThemes})');
assert.equal(cat.ideaData.length,55,'靈感總數不應意外改變');
assert.equal(cat.ideaThemes.length,8);
const itineraryCatalog=vm.runInNewContext(between('const recommendedItinerary=','const e=')+'\nrecommendedItinerary');
assert.equal(itineraryCatalog.length,9,'京都行程應涵蓋12/25–1/2共9日');
const eventKeys=new Set();
let total=0;
for(const group of itineraryCatalog){
 assert.match(group.date,/^20\d\d-\d\d-\d\d$/);
 assert.ok(group.date>='2026-12-25'&&group.date<='2027-01-02');
 let lastTime='';
 for(const row of group.items){
  assert.ok(cat.ideaData.some(idea=>idea.id===row.ideaId),'Unknown ideaId: '+row.ideaId);
  assert.match(row.time,/^\d{2}:\d{2}$/,'Each suggested time must be a clock time');
  assert.ok(row.time>=lastTime,'Suggestions should be chronologically ordered: '+group.date);
  lastTime=row.time;
  assert.ok(!eventKeys.has(row.ideaId),'Duplicate recommendation');
  eventKeys.add(row.ideaId);
  assert.ok(row.reminder.length>=12,'Need a substantive reservation or travel note');
  total++;
 }
}
assert.equal(total,31);
assert.ok(source.includes('get readyForImport(){'),'Cloud write must wait for remote initialization');
assert.ok(source.includes('function curatedImportEligibility(){'));
const idset=new Set(cat.ideaData.map(x=>x.id));
assert.equal(idset.size,cat.ideaData.length,'靈感 ID 必須唯一');
for(let i=1;i<=12;i++)assert.ok(idset.has('i'+i),'不可移除原有靈感 id');
for(const idea of cat.ideaData){
 for(const key of ['id','title','category','date','place','intro','reason','dateNote','hours','closed','url','caution','verify']){
  assert.ok(String(idea[key]??'').trim(),'靈感 '+idea.id+' 缺 '+key);
 }
 assert.match(idea.date,/^20\d\d-\d\d-\d\d$/);
 assert.ok(idea.date>='2026-12-25'&&idea.date<='2027-01-02','日期超出旅程: '+idea.id);
 assert.ok(cat.ideaThemes.includes(idea.category),'未知主題: '+idea.category);
 assert.ok(/^https:\/\//.test(idea.url),'官方／活動來源需要安全連結: '+idea.id);
}
const categoryData=vm.runInNewContext(between('const shoppingCategories=','const diningCategories=').replace(/\nensureTravelWishlists\(\);\n/,'\n')+'\n({shoppingCategories,teaShoppingSeeds,incenseShoppingSeeds})');
assert.ok(categoryData.shoppingCategories.includes('日本茶／茶葉'));
assert.equal(categoryData.teaShoppingSeeds.length,4);
assert.ok(categoryData.shoppingCategories.includes('香品／線香'));
assert.equal(categoryData.incenseShoppingSeeds.length,8);
const uniqueStoreIds=new Set();
let allIncenseTotal=0;
for(const shop of categoryData.incenseShoppingSeeds){
 assert.equal(shop.category,'香品／線香');
 assert.ok(!uniqueStoreIds.has(shop.id),'Duplicate store id: '+shop.id);
 uniqueStoreIds.add(shop.id);
 assert.equal(shop.done,false);
 assert.ok(shop.title&&shop.note&&shop.shop1&&shop.link1&&shop.link2);
 const lines=shop.note.split(/\r?\n/).filter(s=>s.startsWith('• '));
 assert.ok(lines.length>=1&&lines.length<=5,'1–5 scents/store: '+shop.id);
 const costs=lines.map(s=>{const m=s.match(/｜¥([0-9,]+)/);assert.ok(m,'Missing unit price: '+s);return Number(m[1].replace(/,/g,''))});
 assert.ok(costs.every(n=>n>0&&n<=2000),'Each scent must be <= ¥2,000');
 assert.equal(costs.reduce((x,y)=>x+y,0),Number(shop.shopPrice1),'Store total must equal sum of scents: '+shop.id);
 allIncenseTotal+=Number(shop.shopPrice1);
}
assert.equal(allIncenseTotal,35050);
for(const item of categoryData.teaShoppingSeeds){
 assert.ok(item.id&&item.title&&item.note&&item.link1);
 assert.equal(item.category,'日本茶／茶葉');
 assert.equal(item.done,false);
}
const ensureSource=between('function ensureTravelWishlists(){','function synchronizedItems(');
const state={restaurants:[{id:'food1'}],shoppingItems:[{id:'existing',title:'原有購物清單',category:'日用品'}]};
const migrate=vm.createContext({state,teaShoppingSeeds:categoryData.teaShoppingSeeds,incenseShoppingSeeds:categoryData.incenseShoppingSeeds});
vm.runInContext(ensureSource+'\nensureTravelWishlists()',migrate);
assert.equal(state.shoppingItems.length,13,'應增加4款茶及8個購香地點');
assert.equal(state.shoppingItems[0].title,'原有購物清單','原有資料必須保留');
state.shoppingItems[1].done=true;
vm.runInContext('ensureTravelWishlists()',migrate);
assert.equal(state.shoppingItems.length,13,'已標記品項不可重複');
const removed=state.shoppingItems.splice(1,1)[0];
vm.runInContext('ensureTravelWishlists()',migrate);
assert.equal(state.shoppingItems.length,12,'使用者刪除後不可復活: '+removed.id);
const incenseRemoved=state.shoppingItems.find(x=>x.id==='incense-store-lisn');
state.shoppingItems=state.shoppingItems.filter(x=>x.id!==incenseRemoved.id);
vm.runInContext('ensureTravelWishlists()',migrate);
assert.equal(state.shoppingItems.length,11,'刪除的香舖不應重複出現');
assert.equal(state.shoppingItems.filter(x=>x.category==='香品／線香').length,7);
const els={ideaFilters:{innerHTML:''},ideaGrid:{innerHTML:''},ideaCount:{textContent:''}};
const renderer=between('function renderIdeas(){','function renderIntercity(){');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ctx=vm.createContext({ideaData:cat.ideaData,ideaThemes:cat.ideaThemes,ideaFilter:'全部',ideaSearch:'',state:{days:[]},$:k=>els[k],esc,attr:esc,uiIcon:()=>'',maps:x=>'https://maps.example/?q='+encodeURIComponent(x),urlSafe:x=>/^https:\/\//.test(x)?x:''});
vm.runInContext(renderer+'\nrenderIdeas()',ctx);
assert.match(els.ideaCount.textContent,/55／55/);
assert.match(els.ideaGrid.innerHTML,/Google Maps/);
assert.match(els.ideaGrid.innerHTML,/營業日期與時間/);
assert.match(els.ideaGrid.innerHTML,/公休日／休館/);
assert.match(els.ideaGrid.innerHTML,/注意事項/);
ctx.ideaFilter='宇治茶與茶文化';
vm.runInContext('renderIdeas()',ctx);
assert.match(els.ideaGrid.innerHTML,/上林春松本店/);
assert.doesNotMatch(els.ideaGrid.innerHTML,/岡崎公園・年末/);
ctx.ideaSearch='綾鷹';
vm.runInContext('renderIdeas()',ctx);
assert.match(els.ideaGrid.innerHTML,/綾鷹/);
assert.doesNotMatch(els.ideaGrid.innerHTML,/福壽園・宇治茶工房/);
console.log('PASS: 內嵌 JS 語法／55 筆8主題／舊 ID／各欄位／主題及文字篩選／購物與線香分類價格總和、遷移與刪除保留');
