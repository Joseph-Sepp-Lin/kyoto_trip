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

/* Private ticket and admission cost for a published sightseeing activity. */
function editPublicTicket(date,index){
 if(!privateDataVisible()){toast('請先登入 Google 才能儲存私人票務資訊');return}
 const event=publicPlanFor(date)?.events?.[index];
 if(!event){toast('找不到對應的活動，請重新開啟每日散策');return}
 const existing=publicTicketFor(date,index);
 const ticket=existing||{status:event.status==='已購票'?'已購票':'待購票',jpy:'',twd:'',booking:'',url:'',note:''};
 const ticketStatuses=['待購票','考慮中','已預約','已購票','已確認','已付款','已完成'];
 if(ticket.status&&!ticketStatuses.includes(ticket.status))ticketStatuses.push(ticket.status);
 const intro='<p class="trip-subnote">此處是私人門票紀錄，只會保存在登入帳號的 Firebase，不會寫進公開行程。<strong>實際支付費用</strong>才填入金額；尚未購票可先留白。若同時填日幣和台幣，旅費統計只會計入台幣，不會重複計算。</p>';
 const form=intro+'<p class="strong">'+esc(date+'｜'+event.title)+'</p>'+
  selectField('status','購票／預約狀態',ticketStatuses,ticket.status||'待購票')+
  currencyInputs(ticket)+
  inputField('booking','訂單編號／預約代碼（私人）',ticket.booking||'')+
  inputField('url','電子票券／訂位網址（選填）',ticket.url||'','url')+
  textareaField('note','票券備註／集合時間／座位',ticket.note||'');
 openModal('🎟 門票・活動費用',form,o=>{
  if(['jpy','twd'].some(k=>String(o[k]??'').trim()&&!amountFilled(o[k]))){alert('票價金額請填正數或 0，也可以兩欄留空。');return false}
  if(o.url&&!urlSafe(o.url)){alert('請填有效的 http(s) 票券網址或保持空白');return false}
  if(!Array.isArray(state.privateBookings))state.privateBookings=[];
  const record=existing||{id:'event-ticket-'+date+'-'+index};
  if(!saveMoney(record,o))return false;
  Object.assign(record,{date,time:event.time||'',title:event.title,place:event.place||'',eventKey:publicTicketKey(date,index),
    status:o.status||'待購票',booking:String(o.booking||'').trim(),url:String(o.url||'').trim(),
    note:o.note||'',source:'public-ticket'});
  if(!existing)state.privateBookings.push(record);
  return true;
 },{danger:existing?()=>{
  if(!confirm('確定清除此活動的整筆私人票券與費用紀錄？此動作也會從旅費統計扣除此筆金額。'))return;
  state.privateBookings=(state.privateBookings||[]).filter(x=>x!==existing&&x.id!==existing.id);
  closeModal();save();rerender();toast('已清除這筆門票與費用紀錄');
 }:null});
}

/* All interaction here is local or Firebase-authenticated; no private data is committed to GitHub. */
window.KyotoPlanner.clearOldFirebaseItinerary=()=>clearOldFirebaseItinerary();
document.getElementById('dayPanel').addEventListener('click',ev=>{
 const button=ev.target.closest('[data-editticket]');
 if(!button)return;
 editPublicTicket(button.dataset.editticket,Number(button.dataset.ticketIndex));
});

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
