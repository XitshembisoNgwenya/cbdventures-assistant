const $=selector=>document.querySelector(selector);
const dom={shell:$('.shell'),grid:$('#placesGrid'),count:$('#placesCount'),nearbyTotal:$('#nearbyTotal'),pendingTotal:$('#pendingTotal'),search:$('#placeSearch'),categories:$('#categories'),resultsNote:$('#resultsNote'),message:$('#placeMessage'),warning:$('#directoryWarning'),chat:$('#chat'),form:$('#chatForm'),input:$('#messageInput'),send:$('.send'),status:$('#status'),mode:$('#modeNote')};
const state={places:[],pending:[],categories:[],category:'all',tab:'all',search:'',history:[],busy:false,filterIds:null};
const DEFAULT_GREETING='Hey! 👋 I’m CBD Ventures AI Assistance, your student-friendly Pretoria guide. Looking for lunch, somewhere to study, or directions from Richfield? Ask me anything — even what you could plan to buy with R50.';
const icons={all:'✦',food:'🍔',groceries:'🛒',health:'💊',printing:'🖨️',study:'📚',banking:'🏦',grooming:'✂️',transport:'🚌',fun:'🎭'};
function el(tag,attributes={},text){const n=document.createElement(tag);for(const [k,v] of Object.entries(attributes)){if(k==='class')n.className=v;else if(k==='dataset')Object.entries(v).forEach(([dk,dv])=>n.dataset[dk]=dv);else n.setAttribute(k,String(v));}if(text!==undefined)n.textContent=text;return n;}
function stamp(){return new Intl.DateTimeFormat('en-ZA',{hour:'2-digit',minute:'2-digit'}).format(new Date());}
function addMessage(text,who,typing=false){
  const row=el('div',{class:'msg '+who});
  row.append(el('span',{class:'msg-avatar','aria-hidden':'true'},who==='assistant'?'✳':'You'));
  const content=el('div',{class:'msg-content'});
  const bubble=el('div',{class:'msg-bubble'},text);
  if(typing)bubble.setAttribute('aria-label','Assistant is preparing a response');
  content.append(bubble);
  if(!typing)content.append(el('div',{class:'msg-time'},stamp()));
  row.append(content);dom.chat.append(row);dom.chat.scrollTop=dom.chat.scrollHeight;
  return {row,content};
}
function cleanHistory(){state.history=state.history.slice(-18);}
function allPlaces(){return [...state.places,...state.pending];}
function findPlace(id){return allPlaces().find(p=>p.id===id);}
function revealPlace(id){
  const place=findPlace(id);if(!place)return;
  state.tab=place.isWithinRadius?'nearby':'pending';state.category='all';state.search='';state.filterIds=null;
  dom.search.value='';renderCategories();renderPlaces();switchMobile('explore');
  const card=[...dom.grid.querySelectorAll('.place-card')].find(n=>n.dataset.id===id);
  if(card){card.classList.add('highlight');card.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>card.classList.remove('highlight'),2800);}
}
function appendSuggestions(content,ids){
  if(!Array.isArray(ids)||!ids.length)return;
  const chosen=[...new Set(ids)].map(findPlace).filter(Boolean).slice(0,4);
  if(!chosen.length)return;
  const row=el('div',{class:'suggestions'});
  for(const p of chosen){const b=el('button',{type:'button',class:'suggestion'},'📍 '+p.name);b.addEventListener('click',()=>revealPlace(p.id));row.append(b);}
  content.append(row);
}
async function sendMessage(text){
  text=String(text || '').trim();if(!text||state.busy)return;
  state.busy=true;dom.send.disabled=true;
  addMessage(text,'user');state.history.push({role:'user',content:text});cleanHistory();
  dom.input.value='';resizeInput();dom.status.textContent='Thinking…';
  const typing=addMessage('Finding the best campus answer…','assistant',true);
  try{
    const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:state.history})});
    const data=await response.json();
    if(!response.ok)throw Error(data.error || 'Chat request failed');
    typing.row.remove();const result=addMessage(data.reply,'assistant');appendSuggestions(result.content,data.suggestedPlaceIds);
    state.history.push({role:'assistant',content:data.reply});cleanHistory();
    dom.status.textContent=data.mode==='ai'?'AI assistant ready':'Local student guide ready';
    dom.mode.textContent=data.warning || (data.mode==='ai'?'AI-enabled · real-world details may need checking':'Built-in student guide · no AI key needed');
  }catch(error){typing.row.remove();addMessage('I couldn’t reach the chat service. Please check your connection and try again. You can still browse the directory.', 'assistant');dom.status.textContent='Connection issue';}
  finally{state.busy=false;dom.send.disabled=false;dom.input.focus();dom.chat.scrollTop=dom.chat.scrollHeight;}
}
function resizeInput(){dom.input.style.height='auto';dom.input.style.height=Math.min(dom.input.scrollHeight,112)+'px';}
function newConversation(){state.history=[];dom.chat.replaceChildren();addMessage(DEFAULT_GREETING,'assistant');dom.status.textContent='Ready to help';dom.mode.textContent='Ask about student budgets, directions or nearby places';}
function renderCategories(){
  dom.categories.replaceChildren();
  const all=[{id:'all',label:'All places'},...state.categories];
  for(const c of all){const b=el('button',{class:'category-chip'+(state.category===c.id?' active':''),type:'button','aria-pressed':String(state.category===c.id)},(icons[c.id] || '•')+' '+c.label);b.addEventListener('click',()=>{state.category=c.id;state.filterIds=null;renderCategories();renderPlaces();});dom.categories.append(b);}
}
function fallbackMedia(host,category){host.replaceChildren();const box=el('div',{class:'image-empty'});box.append(el('span',{class:'empty-icon'},icons[category]||'⌖'),el('span',{},'Photo not available'));host.append(box);}
function buildCard(place){
  const card=el('article',{class:'place-card',dataset:{id:place.id}});
  const media=el('div',{class:'place-media'});
  const photo=place.image || (place.hasPlacesPhoto?'/api/photo?id='+encodeURIComponent(place.id):null);
  if(photo){const img=el('img',{src:photo,alt:'Exterior or storefront photograph of '+place.name,loading:'lazy',decoding:'async'});img.addEventListener('error',()=>fallbackMedia(media,place.category));media.append(img);}else fallbackMedia(media,place.category);
  const tag=el('span',{class:'media-tag'+(!place.isWithinRadius?' pending-tag':'')},place.image?'Student photo':place.isWithinRadius?'Map location':'Student submitted');media.append(tag);
  const body=el('div',{class:'place-info'});
  const top=el('div',{class:'place-topline'});top.append(el('strong',{class:'place-name'},place.name));top.append(el('span',{class:'place-distance'+(!place.isWithinRadius?' unverified':'')},place.isWithinRadius?`${place.distanceMeters} m`:'To verify'));body.append(top);
  body.append(el('p',{class:'place-address'},'⌖  '+place.address));
  if(place.description)body.append(el('p',{class:'place-desc'},place.description));
  if(place.verificationNote)body.append(el('div',{class:'place-warning'},'⚠ '+place.verificationNote));
  if(!place.isWithinRadius)body.append(el('div',{class:'place-warning'},'1 km eligibility not confirmed; directions are a destination search.'));
  body.append(el('span',{class:'place-source'},'Source: '+place.source));
  const actions=el('div',{class:'place-actions'});
  const dir=el('a',{class:'directions',href:place.directionsUrl,target:'_blank',rel:'noopener noreferrer','aria-label':'Walking directions from Richfield Pretoria Campus to '+place.name},'↗ Directions from Richfield');
  const ask=el('button',{class:'ask-place',type:'button'},'Ask ✳');ask.addEventListener('click',()=>{switchMobile('assistant');sendMessage('Tell me about '+place.name+' and what a student can budget there.');});
  actions.append(dir,ask);body.append(actions);card.append(media,body);return card;
}
function renderPlaces(){
  const list=state.tab==='nearby'?state.places:state.tab==='pending'?state.pending:allPlaces();
  const search=state.search.toLowerCase().trim();
  const visible=list.filter(p=> (state.category==='all'||p.category===state.category) && (!search||[p.name,p.address,p.category,p.description,...(p.aliases||[])].join(' ').toLowerCase().includes(search)) && (!state.filterIds || state.filterIds.includes(p.id)));
  dom.grid.replaceChildren(...visible.map(buildCard));
  dom.count.textContent=String(state.places.length);
  dom.nearbyTotal.textContent=state.places.length;
  dom.pendingTotal.textContent=state.pending.length;
  dom.resultsNote.textContent=state.tab==='nearby'?'Mapped locations within 1,000 m · closest first · distances approximate':state.tab==='pending'?'Student-submitted spots · precise 1 km eligibility still needs checking':'Mapped 1 km locations first, followed by student picks awaiting verification';
  dom.message.hidden=visible.length>0;
  if(!visible.length)dom.message.textContent=state.tab==='nearby'?'No mapped places meet this filter right now. Try Student picks or another category.':'No places match this filter. Try another category or a different search.';
  for(const b of document.querySelectorAll('[data-tab]')){const active=b.dataset.tab===state.tab;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));}
}
function switchMobile(view){dom.shell.dataset.mobileView=view;$('#mobileExplore').classList.toggle('active',view==='explore');$('#mobileAssistant').classList.toggle('active',view==='assistant');}
async function loadPlaces(){
  dom.resultsNote.textContent='Loading campus directory…';
  try{
    const r=await fetch('/api/places');if(!r.ok)throw Error('The place directory is unavailable');
    const data=await r.json();
    state.places=Array.isArray(data.places)?data.places:[];state.pending=Array.isArray(data.pending)?data.pending:[];state.categories=Array.isArray(data.categories)?data.categories:[];
    dom.warning.textContent=data.warning?' '+data.warning:'';
    renderCategories();renderPlaces();
  }catch(error){dom.grid.replaceChildren();dom.message.hidden=false;dom.message.textContent='Unable to load the directory. Please check the server or your connection and tap Refresh.';dom.resultsNote.textContent='Offline or service unavailable';}
}
function attach(){
  dom.form.addEventListener('submit',e=>{e.preventDefault();sendMessage(dom.input.value);});
  dom.input.addEventListener('input',resizeInput);
  dom.input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();dom.form.requestSubmit();}});
  $('#newChat').addEventListener('click',newConversation);
  $('#refreshPlaces').addEventListener('click',loadPlaces);
  dom.search.addEventListener('input',e=>{state.search=e.target.value;renderPlaces();});
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{state.tab=b.dataset.tab;renderPlaces();}));
  document.querySelectorAll('[data-prompt]').forEach(b=>b.addEventListener('click',()=>sendMessage(b.dataset.prompt)));
  $('#mobileExplore').addEventListener('click',()=>switchMobile('explore'));
  $('#mobileAssistant').addEventListener('click',()=>switchMobile('assistant'));
}
attach();newConversation();loadPlaces();
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
