const $=selector=>document.querySelector(selector);
const dom={shell:$('.shell'),chat:$('#chat'),form:$('#chatForm'),input:$('#messageInput'),send:$('.send'),status:$('#status'),mode:$('#modeNote'),featured:$('#featuredPlaces')};
const state={places:[],pending:[],history:[],busy:false,selectedRouteId:null,campus:{lat:-25.746467,lng:28.19252}};
const DEFAULT_GREETING='Hey! 👋 I’m CBD Ventures AI Assistance, your student-friendly Pretoria guide. Looking for lunch, somewhere to study, or directions from Richfield? Ask me anything — even what you could plan to buy with R50.';
const icons={food:"🍔",groceries:"🛒",health:"💊",printing:"🖨️",study:"📚",banking:"🏦",grooming:"✂️",transport:"🚌",fun:"🎭"};
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
function setSuggestionsCollapsed(collapsed){
  const tray=$('#suggestionTray'),toggle=$('#toggleSuggestions');
  tray.hidden=Boolean(collapsed);
  toggle.setAttribute('aria-expanded',String(!collapsed));
  toggle.innerHTML=collapsed?'Show places &amp; ideas <span aria-hidden="true">⌃</span>':'Hide suggestions <span aria-hidden="true">⌄</span>';
  dom.shell.classList.toggle('chat-has-questions',Boolean(collapsed));
}
function scrollToReply(row){
  requestAnimationFrame(()=>{
    if(!row.isConnected)return;
    const offset=row.getBoundingClientRect().top-dom.chat.getBoundingClientRect().top;
    dom.chat.scrollTop+=offset-10;
  });
}
function mapPreviewUrl(place){
  const campus=state.campus;
  const hasPoint=Boolean(place && place.isWithinRadius && Number.isFinite(place.lat) && Number.isFinite(place.lng));
  const lat=hasPoint?place.lat:campus.lat,lng=hasPoint?place.lng:campus.lng;
  const pad=.0022;
  const minLat=Math.min(lat,campus.lat)-pad,maxLat=Math.max(lat,campus.lat)+pad;
  const minLng=Math.min(lng,campus.lng)-pad,maxLng=Math.max(lng,campus.lng)+pad;
  const bbox=[minLng,minLat,maxLng,maxLat].join(',');
  return 'https://www.openstreetmap.org/export/embed.html?bbox='+encodeURIComponent(bbox)+'&layer=mapnik&marker='+encodeURIComponent(`${lat},${lng}`);
}
function showRoute(place){
  if(!place)return;
  state.selectedRouteId=place.id;
  $('#routeTitle').textContent=place.name;
  $('#routeDestination').textContent='From Richfield, 291 Helen Joseph Street → '+place.address;
  const warning=$('#routeWarning');
  warning.hidden=Boolean(place.isWithinRadius && !place.verificationNote);
  warning.textContent=[place.verificationNote,(!place.isWithinRadius?'The map marks Richfield only because the destination position has not been verified.':'The pin marks a mapped location, not a walking route.')].filter(Boolean).join(' ');
  const external=$('#routeOpenGoogle');
  external.href=place.directionsUrl;
  external.setAttribute('aria-label','Open walking directions from Richfield Pretoria to '+place.name+' in Google Maps');
  const frame=$('#routeMapFrame');
  frame.src=mapPreviewUrl(place);
  frame.title=place.isWithinRadius?'Map preview of Richfield and '+place.name:'Campus map; exact location of '+place.name+' awaiting verification';
  renderMapDestinations();
  navigate('map');
}
function cleanHistory(){state.history=state.history.slice(-18);}
function allPlaces(){return [...state.places,...state.pending];}
function findPlace(id){return allPlaces().find(p=>p.id===id);}
function photoFor(place){return place.image || (place.hasPlacesPhoto ? '/api/photo?id='+encodeURIComponent(place.id) : null);}
function makePreviewCard(place,context='featured'){
  const card=el('article',{class:'preview-card',dataset:{id:place.id}});
  const media=el('div',{class:'preview-image'});
  const photo=photoFor(place);
  if(photo){
    const img=el('img',{src:photo,alt:'Storefront of '+place.name,loading:'lazy',decoding:'async'});
    img.addEventListener('error',()=>fallbackMedia(media,place.category));
    media.append(img);
  }else fallbackMedia(media,place.category);
  const distance=place.isWithinRadius?`~${place.distanceMeters} m from campus`:'Unverified';
  media.append(el('span',{class:'preview-distance'},distance));
  const body=el('div',{class:'preview-body'});
  body.append(el('strong',{class:'preview-name',title:place.name},place.name));
  body.append(el('span',{class:'preview-address',title:place.address},place.address));
  const actions=el('div',{class:'preview-actions'});
  const ask=el('button',{type:'button','aria-label':'Ask about '+place.name},'✳ Ask');
  ask.addEventListener('click',()=>{
    navigate('chat');
    sendMessage(`Show me ${place.name} and how to get there from Richfield`);
  });
  const link=el('button',{type:'button','aria-label':'Open in-app map from Richfield to '+place.name},'↗ Map');
  link.addEventListener('click',()=>showRoute(place));
  actions.append(ask,link);body.append(actions);
  card.append(media,body);
  return card;
}
function renderFeatured(){
  const all=allPlaces();
  const photoFirst=[
    ...state.places.filter(p=>photoFor(p)),
    ...state.pending.filter(p=>photoFor(p)).sort((a,b)=>{
      const order=['student:magwinya-zone','student:honchos','student:asian-delight-shawarma','student:quick-bake','student:top-class-fast-foods','student:thuba-rush-kj','student:four-four-two'];
      const rank=id=>order.includes(id)?order.indexOf(id):order.length;
      return rank(a.id)-rank(b.id);
    }),
    ...state.places.filter(p=>!photoFor(p)),
    ...state.pending.filter(p=>!photoFor(p))
  ];
  dom.featured.replaceChildren();
  if(!all.length){dom.featured.append(el('p',{class:'featured-loading'},'Suggested places will appear when the directory is available.'));return;}
  dom.featured.append(...photoFirst.slice(0,16).map(p=>makePreviewCard(p)));
}
function appendSuggestions(content,ids){
  if(!Array.isArray(ids)||!ids.length)return;
  const chosen=[...new Set(ids)].map(findPlace).filter(Boolean).slice(0,3);
  if(!chosen.length)return;
  const rail=el('div',{class:'inline-place-rail',role:'group','aria-label':'Places mentioned in this answer'});
  rail.append(...chosen.map(p=>makePreviewCard(p,'inline')));
  content.append(rail);
}
async function sendMessage(text){
  text=String(text || '').trim();if(!text||state.busy)return;
  state.busy=true;dom.send.disabled=true;
  setSuggestionsCollapsed(true);
  addMessage(text,'user');state.history.push({role:'user',content:text});cleanHistory();
  dom.input.value='';resizeInput();dom.status.textContent='Thinking…';
  const typing=addMessage('Finding the best campus answer…','assistant',true);
  try{
    const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:state.history})});
    const data=await response.json();
    if(!response.ok)throw Error(data.error || 'Chat request failed');
    typing.row.remove();const result=addMessage(data.reply,'assistant');appendSuggestions(result.content,data.suggestedPlaceIds);
    state.history.push({role:'assistant',content:data.reply});cleanHistory();
    scrollToReply(result.row);
    dom.status.textContent=data.mode==='ai'?'AI assistant ready':'Local student guide ready';
    dom.mode.textContent=data.warning || (data.mode==='ai'?'AI-enabled · real-world details may need checking':'Built-in student guide · no AI key needed');
  }catch(error){typing.row.remove();const result=addMessage('I couldn’t reach the chat service. Please check your connection and try again. You can still browse the directory.', 'assistant');scrollToReply(result.row);dom.status.textContent='Connection issue';}
  finally{state.busy=false;dom.send.disabled=false;dom.input.focus({preventScroll:true});}
}
function resizeInput(){dom.input.style.height='auto';dom.input.style.height=Math.min(dom.input.scrollHeight,112)+'px';}
function newConversation(){state.history=[];setSuggestionsCollapsed(false);dom.chat.replaceChildren();addMessage(DEFAULT_GREETING,'assistant');dom.status.textContent='Ready to help';dom.mode.textContent='Ask about student budgets, directions or nearby places';}
function fallbackMedia(host,category){host.replaceChildren();const box=el('div',{class:'image-empty'});box.append(el('span',{class:'empty-icon'},icons[category]||'⌖'),el('span',{},'Photo not available'));host.append(box);}
function navigate(page,updateHash=true){
  if(page!=='chat'&&page!=='map')page='chat';
  dom.shell.dataset.page=page;
  $('#mainContent').hidden=page==='map';
  $('#mapPage').hidden=page!=='map';
  document.querySelectorAll('[data-page]').forEach(button=>{
    const active=button.dataset.page===page;
    button.classList.toggle('active',active);
    if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  });
  if(updateHash&&location.hash!=='#'+page)history.replaceState(null,'','#'+page);
  if(page==='chat'&&updateHash)dom.input.focus({preventScroll:true});
  if(page==='map')window.scrollTo({top:0,behavior:'instant'});
}
function renderMapDestinations(){
  const host=$('#mapDestinations');host.replaceChildren();
  for(const p of allPlaces()){
    const card=el('div',{class:'map-destination'});
    const info=el('div');info.append(el('strong',{},p.name),el('small',{},p.address));
    if(!p.isWithinRadius)info.append(el('small',{class:'pending-copy'},'Exact 1 km eligibility not verified'));
    const tools=el('div',{class:'destination-actions'});
    const select=el('button',{type:'button',class:'map-select'+(state.selectedRouteId===p.id?' selected':''),'aria-pressed':String(state.selectedRouteId===p.id)},state.selectedRouteId===p.id?'Selected ✓':'View on map');
    select.addEventListener('click',()=>showRoute(p));
    const anchor=el('a',{href:p.directionsUrl,target:'_blank',rel:'noopener noreferrer'},'Walk ↗');
    tools.append(select,anchor);
    card.append(info,tools);host.append(card);
  }
}
async function loadPlaces(){
  try{
    const response=await fetch('/api/places');
    if(!response.ok)throw Error('Place directory unavailable');
    const data=await response.json();
    state.places=Array.isArray(data.places)?data.places:[];
    state.pending=Array.isArray(data.pending)?data.pending:[];
    if(data.campus&&Number.isFinite(data.campus.lat)&&Number.isFinite(data.campus.lng))state.campus={lat:data.campus.lat,lng:data.campus.lng};
    if(!state.selectedRouteId)$('#routeMapFrame').src=mapPreviewUrl(null);
    renderFeatured();renderMapDestinations();
  }catch(error){
    dom.featured.replaceChildren(el('p',{class:'featured-loading'},'Suggested places are unavailable right now. You can still use the chat.'));
    $('#mapDestinations').replaceChildren(el('p',{},'Destinations are temporarily unavailable.'));
  }
}
function attach(){
  dom.form.addEventListener('submit',event=>{event.preventDefault();sendMessage(dom.input.value);});
  dom.input.addEventListener('input',resizeInput);
  dom.input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();dom.form.requestSubmit();}});
  $('#newChat').addEventListener('click',newConversation);
  $('#toggleSuggestions').addEventListener('click',()=>setSuggestionsCollapsed(!$('#suggestionTray').hidden));
  $('#featuredPrev').addEventListener('click',()=>dom.featured.scrollBy({left:-230,behavior:'smooth'}));
  $('#featuredNext').addEventListener('click',()=>dom.featured.scrollBy({left:230,behavior:'smooth'}));
  document.querySelectorAll('[data-prompt]').forEach(button=>button.addEventListener('click',()=>sendMessage(button.dataset.prompt)));
  document.querySelectorAll('[data-page]:not(:disabled)').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.page)));
  window.addEventListener('hashchange',()=>navigate(location.hash.slice(1),false));
}
attach();newConversation();loadPlaces();navigate(location.hash.slice(1)||'chat',false);
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
