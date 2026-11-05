const { CAMPUS, CATEGORIES }=require('./config');
const PATTERNS={
  food:/\b(food|eat|hungry|restaurant|takeaway|lunch|breakfast|coffee|burger|chicken|shawarma|magwinya|bakery|fast food|pizza)\b/i,
  groceries:/\b(grocer|supermarket|shoprite|woolworths|spar|pick n pay|snack|bread|milk)\b/i,
  health:/\b(pharmacy|medicine|doctor|clinic|health|clicks|chemist|optometrist)\b/i,
  printing:/\b(print|photocopy|copy|stationery|assignment|binding|postnet|paper)\b/i,
  study:/\b(study|studying|library|books|research|quiet|reading|wifi|wi-fi)\b/i,
  banking:/\b(bank|atm|withdraw|cash|fnb|absa|capitec|nedbank)\b/i,
  grooming:/\b(barber|haircut|salon|braid|nails|beauty|hairdresser)\b/i,
  transport:/\b(bus|taxi|rank|transport|commute|train|ride|bus stop|gautrain)\b/i,
  fun:/\b(fun|entertainment|movie|theatre|theater|show|date|lounge|music|hangout)\b/i
};
const FOOD_EXAMPLES=[
  {match:/magwinya|vetkoek|fat cake/i,idea:'a few magwinya or a magwinya-and-drink combination',range:'R5–R20 per item (illustrative planning range, not this store’s price)'},
  {match:/shawarma|asian delight/i,idea:'a small shawarma or a portion to share',range:'R25–R65 (illustrative planning range, not this store’s price)'},
  {match:/bake|coffee|espresso|expresso/i,idea:'a pastry or a hot drink',range:'R15–R45 (illustrative planning range, not this store’s price)'},
  {match:/honchos|chicken|top class|thuba|thaba/i,idea:'a snack-sized takeaway, chips or a value special if offered',range:'R25–R65 (illustrative planning range, not this store’s price)'}
];
const safeText=s=>String(s || '').replace(/\s+/g,' ').trim();
const normalWords=s=>String(s || '').normalize('NFKD').toLowerCase().replace(/[’‘`']/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
function matchedPlace(question,all) {
  const q=' '+normalWords(question)+' ';
  let best=null,score=0;
  for(const place of all) for(const phrase of [place.name,...(place.aliases || [])]) {
    const alias=normalWords(phrase);
    if(alias.length<4 || !q.includes(' '+alias+' '))continue;
    if(alias.length>score){best=place;score=alias.length;}
  }
  return best;
}
function selectedFromHistory(question,history,places,pending) {
  const all=[...places,...pending];
  const number=normalWords(question).match(/\b(?:first|second|third|1st|2nd|3rd|option 1|option 2|option 3|number 1|number 2|number 3)(?: one| place| library)?\b/);
  if(number) {
    const rank=/first|1/.test(number[0])?0:/second|2/.test(number[0])?1:2;
    const lastCategory=[...history].reverse().find(m=>m.role==='user' && Object.entries(PATTERNS).some(([,re])=>re.test(m.content)))?.content || '';
    const category=Object.entries(PATTERNS).find(([,re])=>re.test(lastCategory))?.[0];
    if(category) return [...places.filter(p=>p.category===category).slice(0,5),...pending.filter(p=>p.category===category).slice(0,5)][rank] || null;
  }
  for(const message of [...history].reverse()) {
    if(message.role!=='user')continue;
    const found=matchedPlace(message.content,all);
    if(found)return found;
    if(/\b(where can i|places to|nearby|recommend|find|show)\b/i.test(message.content) && Object.entries(PATTERNS).some(([,re])=>re.test(message.content)))break;
  }
  return null;
}
function interestingAnswer(place) {
  const facts=Array.isArray(place.highlights)?place.highlights:[];
  const intro=`Here’s what makes ${place.name} worth knowing about:`;
  const body=facts.length?facts.map((fact,index)=>`${index+1}. ${fact}`).join('\n'):(place.description || 'It is one of the places listed in the student directory.');
  const source=place.detailsSource?'These details come from published information and may have changed.':'The directory has limited confirmed detail about this place.';
  const verification=place.verificationNote?` ${place.verificationNote}`:'';
  return `${intro}\n\n${body}\n\n${source} Check current access, services and opening hours before visiting.${verification}`;
}
function priceAnswer(amount,place) {
  const questionAmount=amount ? `R${amount}` : 'your budget';
  const example=place && FOOD_EXAMPLES.find(x=>x.match.test(place.name));
  const generic='For planning only, you might budget roughly R5–R20 for a small snack, R15–R30 for a drink, or R25–R65 for a takeaway. These are invented examples for budgeting, NOT prices charged by any listed business.';
  const intro=place?`${place.name} has no verified, current menu prices in this directory.`:'This directory has no verified, current shop or menu prices.';
  const idea=example?`One idea to ask about is ${example.idea}. Sample price band: ${example.range}.`:'One idea is to ask the shop for its cheapest snack or student special.';
  const extra=amount?`For ${questionAmount}, compare the price at the counter before ordering. A hypothetical R50 plan could be R25 for food + R15 for a drink = R40, leaving R10; this is an example budget, not a real deal.`:'Tell me your budget, such as R30, R50 or R100, and I can make an example spending plan.';
  return [intro,idea,generic,extra].join('\n\n');
}
function makeLocalReply(question,places,pending=[],messages=[]) {
  const q=safeText(question);
  const all=[...places,...pending];
  const explicit=matchedPlace(q,all);
  const context=selectedFromHistory(q,messages.slice(0,-1),places,pending);
  const followUp=/\b(this place|that place|the place|there|it|its|their|the library|that library|this library|tell me more|more about|interesting|special|unique|features|facilities|what can i do|what does it offer|what makes|why visit|what about|is it|can i|does it|how about|what is good|what is nice|first one|second one|third one|option [123]|number [123]|[123](?:st|nd|rd) one)\b/i.test(q);
  const hit=explicit || (followUp?context:null);
  const money=q.match(/\bR\s?(\d{1,5})\b/i) || q.match(/\b(\d{1,5})\s?(?:rand|zar)\b/i);
  const pricing=/\b(price|prices|cost|costs|costing|menu|special|meal deal|discount|afford|budget|cheap|cheapest|spend|buy|under)\b/i.test(q) || Boolean(money);
  const navigation=/\b(direction|directions|route|walk|walking|navigate|navigation|where is|how do i get|how far|distance|location|address)\b/i.test(q);
  const category=Object.entries(PATTERNS).find(([,re])=>re.test(q))?.[0];
  const interesting=/\b(interesting|special|unique|features|facilities|worth visiting|why visit|why go|tell me more|more about|what makes|what is good|what is nice|what can i do|what can you do|what does it offer|what is there|what about)\b/i.test(q);
  const serviceQuestion=/\b(wifi|wi-fi|internet|computers?|laptop|photocopy|printing|print|books|borrow|quiet|study space|seats?|desks?)\b/i.test(q) && /\b(does|can|is|are|has|have|there|it|this|that)\b/i.test(q);
  const hoursQuestion=/\b(open|opening|close|closing|hours|weekend|saturday|sunday)\b/i.test(q) && /\b(is|does|it|there|what|when|the)\b/i.test(q);
  if(/^\s*(hi|hello|hey|howzit|good morning|good afternoon|good evening|how are you)[!? .]*$/i.test(q)) return {reply:'Hey! 👋 I’m CBD Ventures AI Assistance. I can help you find food, study spots, banks, printing, transport and more near campus. Ask about a place, directions from Richfield, or a budget such as R50.',suggestedPlaceIds:[]};
  if(/^(help|options|features|what can you do|what can this bot do|how does this chatbot work)[?! .]*$/i.test(q)) return {reply:'I can show closest-first verified map locations inside 1 km of campus, display the student-submitted businesses awaiting precise location checks, share their real storefront photos, open walking directions from Richfield, and suggest example student budgets. Current shop prices and opening hours are not confirmed.',suggestedPlaceIds:[]};
  if(hit) {
    if(interesting || serviceQuestion) return {reply:interestingAnswer(hit),suggestedPlaceIds:[hit.id]};
    if(hoursQuestion) return {reply:`I don't have confirmed current opening hours for ${hit.name}. ${hit.address}. Check with the venue before travelling. You can use its Map card for directions starting at Richfield.`,suggestedPlaceIds:[hit.id]};
    if(pricing) return {reply:priceAnswer(money?.[1],hit)+`\n\n${hit.name}: ${hit.address}. Use its photo card to see directions starting at Richfield.`,suggestedPlaceIds:[hit.id]};
    const location=hit.isWithinRadius?`Approximately ${hit.distanceMeters} m straight-line from the campus reference pin, within the 1 km directory limit.`:'The exact location has not been geocoded, so the 1 km distance is not yet confirmed.';
    return {reply:`${hit.name}\n${hit.address}\n${location}\n\n${hit.description || ''}${hit.verificationNote?'\n\nCheck: '+hit.verificationNote:''}\n\nTap “Directions from Richfield” on the place card to open walking navigation from 291 Helen Joseph Street. Prices and opening hours have not been verified.`,suggestedPlaceIds:[hit.id]};
  }
  if(followUp && !hit && /\b(this place|that place|there|it|interesting|special|tell me more|more about|what about|the library)\b/i.test(q) && !pricing) return {reply:'Which place do you mean — Richfield Pretoria campus library or Es’kia Mphahlele Community Library? Tap a place card or type its name, then ask your follow-up.',suggestedPlaceIds:[...places.filter(p=>p.category==='study'),...pending.filter(p=>p.category==='study')].slice(0,2).map(p=>p.id)};
  if(pricing) {
    const subset=[...places.filter(p=>p.category==='food'),...pending.filter(p=>p.category==='food')].slice(0,6);
    return {reply:priceAnswer(money?.[1],null)+'\n\nFood places to compare: '+(subset.map(p=>p.name).join(', ') || 'no food listings available')+'.',suggestedPlaceIds:subset.map(p=>p.id)};
  }
  let nearby=places.filter(p=>!category || p.category===category).slice(0,5);
  let unchecked=pending.filter(p=>!category || p.category===category).slice(0,5);
  if(category || navigation || /\b(near|nearby|closest|places|recommend|find|looking for|suggest|around campus)\b/i.test(q)) {
    const label=CATEGORIES.find(c=>c.id===category)?.label?.toLowerCase() || 'places';
    const lines=nearby.map(p=>`• ${p.name} — about ${p.distanceMeters} m, straight-line (${p.address})`);
    const pendingLines=unchecked.map(p=>`• ${p.name} — location and 1 km eligibility not yet confirmed (${p.address})`);
    const words=lines.length?`Mapped ${label} within 1 km of campus, closest first:\n${lines.join('\n')}`:`No mapped ${label} currently pass the strict 1 km filter.`;
    return {reply:[words,pendingLines.length?'Student-submitted places awaiting coordinate verification:\n'+pendingLines.join('\n'):'', 'Tap any place’s “Directions from Richfield” button for a walking route starting at campus. Distances are straight-line estimates, not walking-route lengths.'].filter(Boolean).join('\n\n'),suggestedPlaceIds:[...nearby,...unchecked].map(p=>p.id)};
  }
  return {reply:'Ask me something like “Where is Honchos?”, “How do I get to Magwinya Zone from Richfield?”, “What can I eat for R50?”, “Where can I study?”, or “Show nearby ATMs”. I’ll keep suggestions student-friendly and clearly flag any unverified addresses or sample prices.',suggestedPlaceIds:[]};
}
function aiSettings() {
  const provider=String(process.env.AI_PROVIDER || 'none').toLowerCase();
  const key=provider==='anthropic'?(process.env.ANTHROPIC_API_KEY || process.env.AI_API_KEY):provider==='gemini'?(process.env.GEMINI_API_KEY || process.env.AI_API_KEY):(process.env.OPENAI_API_KEY || process.env.AI_API_KEY);
  return {provider,key,configured:provider!=='none'&&(provider==='ollama'||Boolean(key))};
}
async function requestJSON(url,init) {
  const response=await fetch(url,{...init,signal:AbortSignal.timeout(13000)});
  if(!response.ok) throw Error(`Provider HTTP ${response.status}`);
  return response.json();
}
async function remoteReply(messages,places,pending) {
  const {provider,key}=aiSettings();
  const system=`You are CBD Ventures AI Assistance, a student-friendly local guide serving students of ${CAMPUS.name}, ${CAMPUS.address}. Give warm concise practical answers. Recommend mapped nearby places ONLY from MAPPED_WITHIN_1KM. You may ALSO discuss STUDENT_SUBMITTED_UNVERIFIED places if asked, but explicitly state that their distance and eligibility have not been checked; never claim they are within 1 km. Any route MUST originate from Richfield at 291 Helen Joseph Street; direct users to the place card's directions button. Never invent factual shop prices, menu deals, hours, addresses or photos. For budget questions you MAY make clearly labelled hypothetical calculations and illustrative price bands, NEVER attributed as real shop prices or current specials. If a business has an address discrepancy, flag it. Distances are approximate straight-line, not walking distance. Ask users to confirm prices, hours and access. MAPPED_WITHIN_1KM:\n${places.slice(0,100).map(p=>JSON.stringify({name:p.name,address:p.address,distanceMeters:p.distanceMeters})).join('\n')}\nSTUDENT_SUBMITTED_UNVERIFIED:\n${pending.slice(0,80).map(p=>JSON.stringify({name:p.name,address:p.address,verificationNote:p.verificationNote})).join('\n')}`;
  const recent=messages.filter(x=>x && ['user','assistant'].includes(x.role) && typeof x.content==='string').slice(-12).map(x=>({role:x.role,content:x.content.slice(0,2000)}));
  if(['openai','openai-compatible','ollama'].includes(provider)) {
    const base=process.env.AI_BASE_URL || (provider==='ollama'?'http://localhost:11434/v1':'https://api.openai.com/v1');
    const data=await requestJSON(base.replace(/\/+$/,'')+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',...(key?{Authorization:`Bearer ${key}`}:{})},body:JSON.stringify({model:process.env.AI_MODEL || (provider==='ollama'?'llama3.2':'gpt-4o-mini'),temperature:0.3,messages:[{role:'system',content:system},...recent]})});
    return data.choices?.[0]?.message?.content;
  }
  if(provider==='anthropic') {
    const data=await requestJSON('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:process.env.AI_MODEL || 'claude-haiku-4-5',max_tokens:500,system,messages:recent})});
    return data.content?.filter(x=>x.type==='text').map(x=>x.text).join('\n');
  }
  if(provider==='gemini') {
    const model=process.env.AI_MODEL || 'gemini-2.5-flash';
    if(!/^[a-z0-9._-]+$/i.test(model)) throw Error('Invalid model');
    const data=await requestJSON(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},generationConfig:{temperature:0.3,maxOutputTokens:650},contents:recent.map(x=>({role:x.role==='assistant'?'model':'user',parts:[{text:x.content}]}))})});
    return data.candidates?.[0]?.content?.parts?.map(p=>p.text || '').join('\n');
  }
  throw Error('AI_PROVIDER not supported');
}
async function getChat(messages,places,pending=[]) {
  const local=makeLocalReply(messages.at(-1).content,places,pending,messages);
  const settings=aiSettings();
  if(!settings.configured) return {...local,mode:'local',warning:settings.provider==='none'?null:'AI provider is missing its server-side API key; local guide is active.'};
  try {
    const response=await remoteReply(messages,places,pending);
    if(typeof response!=='string' || !response.trim()) throw Error('Empty AI response');
    return {...local,reply:response.trim().slice(0,4000),mode:'ai',warning:'Verify all real-world details before visiting; listed map coordinates control radius eligibility.'};
  }catch(e){console.warn('AI fallback:',e.message);return {...local,mode:'local',warning:'AI service unavailable; using the built-in student guide.'};}
}
module.exports={makeLocalReply,aiSettings,getChat,priceAnswer};
