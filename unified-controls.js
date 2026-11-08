'use strict';
function addRestToMeal(restId,key){
 if(!privateDataVisible()){toast('請先登入 Google');return false}
 const r=state.restaurants.find(r=>r.id===restId),parts=String(key||'').split('|');
 const slot=mealPlanFor(parts[0])?.slots.find(x=>x.id===parts[1]);
 if(!r||!slot)return false;
 if(!state.mealChoices||typeof state.mealChoices!=='object')state.mealChoices={};
 const choice=state.mealChoices[key]||{selected:'',added:[]};
 if(!Array.isArray(choice.added))choice.added=[];
 if(!mealOptionList(parts[0],slot).some(o=>normalizePlace(o.name)===normalizePlace(r.name)))choice.added.push(restId);
 state.mealChoices[key]=choice;save();rerender();toast('已加入 '+slot.title+' 候選');return true;
}

function addMealFromCatalogue(key){
 const parts=String(key||'').split('|'),date=parts[0],slot=mealPlanFor(date)?.slots.find(s=>s.id===parts[1]);
 if(!slot||!privateDataVisible()){toast('請先登入 Google');return}
 const list=state.restaurants.filter(r=>r.id&&r.name).slice().sort((a,b)=>String(a.category).localeCompare(String(b.category),'zh-Hant'));
 if(!list.length){toast('目前沒有餐廳收藏');return}
 const opts=list.map(r=>r.id+' ｜ '+r.name+'（'+(r.category||'其他')+'）');
 openModal('🍜 加入餐次候選',`<p class="trip-subnote">${esc(date+' '+slot.time+' '+slot.title)}｜從完整收藏清單選餐廳，不會取代原有候選。</p>${selectField('restaurant','收藏餐廳',opts,opts[0])}`,o=>addRestToMeal(String(o.restaurant||'').split(' ｜ ')[0],key));
}

function pickMealSlot(restId){
 if(!privateDataVisible()){toast('請先登入 Google');return}
 const r=state.restaurants.find(r=>r.id===restId);if(!r)return;
 const slots=(window.KyotoMealRecommendations20261109||[]).flatMap(d=>(d.slots||[]).map(s=>({key:mealChoiceKey(d.date,s.id),label:`${d.date}｜${s.time}｜${s.title}`})));
 const opts=slots.map(s=>s.label);
 if(!opts.length){toast('餐次尚未建立');return}
 openModal('🍽 放入哪一天的餐食候選',`<p class="trip-subnote"><strong>${esc(r.name)}</strong>｜${esc(r.dish||r.category||'')}</p>${selectField('slot','日期／餐次',opts,opts[0])}`,o=>{
  const target=slots.find(s=>s.label===o.slot);if(!target)return false;
  const ok=addRestToMeal(restId,target.key);
  if(ok){currentDay=Math.max(0,state.days.findIndex(d=>d.date===target.key.split('|')[0]));$('itineraryDrawer').open=true;renderDay()}
  return ok;
 });
}

function removeRestFromMeal(key,restId){
 if(!privateDataVisible())return;
 const choice=state.mealChoices?.[key];if(!choice)return;
 choice.added=(choice.added||[]).filter(id=>id!==restId);
 const r=state.restaurants.find(r=>r.id===restId);if(r&&choice.selected===r.name)choice.selected='';
 save();renderDay();toast('已從此餐次移除候選');
}

/* All interaction here is local or Firebase-authenticated; no private data is committed to GitHub. */
window.KyotoPlanner.clearOldFirebaseItinerary=()=>clearOldFirebaseItinerary();
document.getElementById('dayPanel').addEventListener('change',ev=>{
 const el=ev.target.closest('[data-meal-select]');if(!el||!privateDataVisible())return;
 const key=el.dataset.mealSelect;
 if(!state.mealChoices||typeof state.mealChoices!=='object')state.mealChoices={};
 const choice=state.mealChoices[key]||{selected:'',added:[]};
 choice.selected=el.value;state.mealChoices[key]=choice;
 save();renderDay();toast('已選擇：'+el.value);
});
document.getElementById('dayPanel').addEventListener('click',ev=>{
 const add=ev.target.closest('[data-meal-add]');if(add)return addMealFromCatalogue(add.dataset.mealAdd);
 const remove=ev.target.closest('[data-meal-remove]');if(remove)return removeRestFromMeal(remove.dataset.mealRemove,remove.dataset.mealRestid);
 const edit=ev.target.closest('[data-editsource]');
 if(edit){
  const i=Number(edit.dataset.sourceindex);
  if(edit.dataset.editsource==='flight')return editFlight(i);
  if(edit.dataset.editsource==='stay')return editStay(i);
  if(edit.dataset.editsource==='intercity')return editIntercity(i);
 }
});
document.getElementById('restaurantCards').addEventListener('click',ev=>{
 const b=ev.target.closest('[data-planrestaurant]');
 if(!b)return;
 ev.stopPropagation();
 ev.preventDefault();
 pickMealSlot(b.dataset.planrestaurant);
},true);
