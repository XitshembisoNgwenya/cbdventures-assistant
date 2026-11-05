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
function outOfAreaRequest(question) {
  const words=normalWords(question);
  const planet=words.match(/\b(?:on|in|at|near|around|from|the planet|planet)\s+(?:the\s+)?(mars|venus|jupiter|saturn|uranus|neptune|pluto|mercury|moon)\b/);
  if(planet) {
    const name=planet[1]==='moon'?'the Moon':planet[1][0].toUpperCase()+planet[1].slice(1);
    return {reply:`There aren't any public restaurants or shops on ${name} that I can recommend. My directory covers places around Richfield Pretoria, so I can help you find real nearby options instead.`,suggestedPlaceIds:[]};
  }
  const otherCity=words.match(/\b(?:in|at|near|around|from|to)\s+(?:the\s+)?(johannesburg|joburg|durban|cape town|bloemfontein|polokwane|centurion|hatfield|menlyn|sandton|soweto|london|new york|paris|tokyo)\b/);
  if(otherCity) {
    const location=otherCity[1].replace(/\b\w/g,x=>x.toUpperCase());
    return {reply:`I cover places within the Richfield Pretoria campus area, so I can't reliably recommend businesses in ${location} from this directory. If you want places near Richfield, I can help with those.`,suggestedPlaceIds:[]};
  }
  return null;
}
function editDistance(a,b,limit) {
  if(Math.abs(a.length-b.length)>limit) return limit+1;
  let previous=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++) {
    const current=[i];
    let smallest=i;
    for(let j=1;j<=b.length;j++) {
      const cost=a[i-1]===b[j-1]?0:1;
      const next=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+cost);
      current.push(next);
      if(next<smallest)smallest=next;
    }
    if(smallest>limit)return limit+1;
    previous=current;
  }
  return previous[b.length];
}
function matchedPlace(question,all) {
  const q=' '+normalWords(question)+' ';
  let best=null,score=0;
  for(const place of all) for(const phrase of [place.name,...(place.aliases || [])]) {
    const alias=normalWords(phrase);
    if(alias.length<4 || !q.includes(' '+alias+' '))continue;
    if(alias.length>score){best=place;score=alias.length;}
  }
  if(best)return best;
  const words=normalWords(question).split(' ').filter(Boolean);
  let candidate=null,lowest=Infinity,tied=false;
  for(const place of all) for(const phrase of [place.name,...(place.aliases || [])]) {
    const aliasWords=normalWords(phrase).split(' ').filter(Boolean);
    const target=aliasWords.join('');
    if(target.length<7 || words.length<aliasWords.length)continue;
    const threshold=aliasWords.length===1?1:target.length>=11?3:2;
    for(let i=0;i+aliasWords.length<=words.length;i++) {
      const fragment=words.slice(i,i+aliasWords.length).join('');
      const score=editDistance(fragment,target,threshold);
      if(score===0 || score>threshold)continue;
      const adjusted=score/target.length;
      if(adjusted<lowest-0.001){candidate=place;lowest=adjusted;tied=false;}
      else if(Math.abs(adjusted-lowest)<0.001 && candidate?.id!==place.id)tied=true;
    }
  }
  return tied?null:candidate;
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
function placeIntro(place) {
  const name=place.name;
  const key=String(place.id || '');
  if(key==='student:magwinya-zone') return 'Magwinya Zone is a takeaway spot for magwinya, the classic South African fried-dough snack. It could be a good option when you want a quick bite between classes.';
  if(key==='student:honchos') return 'Honchos is a chicken and fast-food takeaway. It’s one of the options students can consider when looking for a quick meal in Pretoria Central.';
  if(key==='student:asian-delight-shawarma') return 'Asian Delight Shawarma is a takeaway for shawarma and other food. You can also see its storefront photo in the student guide.';
  if(key==='student:top-class-fast-foods') return 'Top Class Fast Foods is a takeaway spot on Pretorius Street. Its storefront photo is included in the guide.';
  if(key==='student:quick-bake') return 'Quick Bake is a bakery and confectionery spot. Its storefront sign also mentions coffee.';
  if(key==='student:thuba-rush-kj') return 'Thuba Rush KJ is a takeaway on Pretorius Street. We have a photo of its storefront so you can recognise it.';
  if(key==='student:four-four-two') return 'Four Four Two is a sports and music lounge. It’s more of a hangout option than a study spot.';
  if(key==='local:richfield-library') return 'The Richfield Pretoria campus library is conveniently on campus, so it is an option to consider for studying between lectures.';
  if(key==='student:sammy-marks-library') return 'Es’kia Mphahlele Community Library is a public library near Sammy Marks with reading and study areas. It also has a documented American Corner.';
  if(key==='student:absa-building') return 'ABSA Building is listed in the student guide as a banking-related location in Pretoria Central. Bank and ATM services at that address still need confirmation.';
  if(place.category==='food') return `${name} is one of the food options in the student directory.`;
  if(place.category==='study') return `${name} is a study option in the student directory.`;
  if(place.category==='banking') return `${name} is a banking-related location in the student directory.`;
  if(place.category==='transport') return `${name} is a transport option in the student directory.`;
  if(place.category==='fun') return `${name} is an entertainment option in the student directory.`;
  if(place.category==='health') return `${name} is a health-related location in the student directory.`;
  if(place.category==='printing') return `${name} is a printing or stationery option in the student directory.`;
  if(place.category==='grooming') return `${name} is a grooming or salon option in the student directory.`;
  if(place.category==='groceries') return `${name} is a grocery option in the student directory.`;
  return `${name} is listed in the student directory.`;
}
function addressDetail(place) {
  return `📍 The guide lists it at ${place.address}.`;
}
function addressNote(place) {
  if(place.submittedAddress && place.verificationNote && /address conflict/i.test(place.verificationNote)) {
    return `The storefront shows ${place.address}, but the earlier submitted address was ${place.submittedAddress}. Check the correct entrance before travelling.`;
  }
  if(place.id==='student:thuba-rush-kj') return 'The storefront sign spells the name “Thuba Rush KJ”.';
  return '';
}
function navigationAdvice() {
  return 'Tap Map on the place card to view the destination, or use the walking-directions link to start from Richfield, 291 Helen Joseph Street.';
}
function interestingAnswer(place) {
  const facts=Array.isArray(place.highlights)?place.highlights:[];
  if(facts.length) {
    const details=facts.length>1?facts.map(fact=>`• ${fact}`).join('\n'):facts[0];
    const access=place.category==='study'?' Some services and current access may vary, so check with the library before visiting.':'';
    return `${place.name} has a few things worth knowing about:\n\n${details}\n\n${place.detailsSource?'These details are based on published information.':'These are the details currently listed in the student guide.'}${access}`;
  }
  const lines=[placeIntro(place),addressDetail(place)];
  if(place.category==='food')lines.push('If you’re deciding what to buy, I can help you plan a student budget. The shop’s current menu prices aren’t listed here.');
  if(place.category==='fun')lines.push('I can show you directions, but I don’t have a confirmed current events schedule.');
  lines.push('Want directions from Richfield or suggestions for a student budget?');
  return lines.join('\n\n');
}
function priceAnswer(amount,place) {
  const budget=amount?Number(amount):null;
  const match=place && FOOD_EXAMPLES.find(x=>x.match.test(place.name));
  const name=place?.name || 'a food spot near campus';
  if(place && place.category!=='food')return `I don’t have confirmed current charges for ${name}. If you’re checking entry fees or services, it’s best to ask the venue directly. I can show you where it is and how to get there from Richfield.`;
  const suggestions=place?.id==='student:magwinya-zone'?'For a quick bite, magwinya is the obvious thing to ask about.':match?`You could ask about ${match.idea}.`:'A snack, a small takeaway or a drink could be worth comparing.';
  if(budget!==null) {
    const plans=budget<=20?'Start by asking for the cheapest single snack.':budget<=60?'You could aim for roughly R30 for something to eat and keep R20 for a drink or another snack.':`You could reserve around R${Math.round(budget*.7)} for food and keep R${budget-Math.round(budget*.7)} for a drink or later.`;
    return `With R${budget}, here’s how I’d plan it at ${name}: ${suggestions} ${plans}\n\nThose amounts are example budgets, not confirmed prices at the shop. Check the menu before ordering.`;
  }
  return `For ${name}, I don’t have a current confirmed price list. ${suggestions} As a rough planning example, a small snack might be R5–R20, while a larger takeaway could cost more. Those are illustrative amounts, not the shop’s actual prices.\n\nGive me a budget like R30, R50 or R100 and I’ll suggest a plan.`;
}
function placeAnswer(place,{navigation=false,distance=false}={}) {
  const lines=[placeIntro(place),addressDetail(place)];
  if(distance) {
    if(place.isWithinRadius) lines.push(`The map puts it about ${place.distanceMeters} metres from campus in a straight line. The walking route may be longer.`);
    else lines.push('I don’t have a reliable distance from campus yet, so I won’t guess the metres. The map link can help you check the walking route.');
  }
  if(navigation) lines.push(navigationAdvice());
  else lines.push('You can tap its photo card for the picture and directions from Richfield.');
  const note=addressNote(place);
  if(note && navigation) lines.push(note);
  return lines.join('\n\n');
}
function makeLocalReply(question,places,pending=[],messages=[]) {
  const q=safeText(question);
  const outside=outOfAreaRequest(q);
  if(outside) return outside;
  const all=[...places,...pending];
  const explicit=matchedPlace(q,all);
  const context=selectedFromHistory(q,messages.slice(0,-1),places,pending);
  const followUp=/\b(this place|that place|the place|there|it|its|their|the library|that library|this library|tell me more|more about|interesting|special|unique|features|facilities|what can i do|what does it offer|what makes|why visit|what about|is it|can i|does it|how about|what is good|what is nice|first one|second one|third one|option [123]|number [123]|[123](?:st|nd|rd) one)\b/i.test(q);
  const hit=explicit || (followUp?context:null);
  const money=q.match(/\bR\s?(\d{1,5})\b/i) || q.match(/\b(\d{1,5})\s?(?:rand|zar)\b/i);
  const pricing=/\b(price|prices|cost|costs|costing|menu|special|meal deal|discount|afford|affordable|budget|cheap|cheapest|spend|buy|under)\b/i.test(q) || Boolean(money);
  const navigation=/\b(direction|directions|route|walk|walking|navigate|navigation|where is|how do i get|how can i get|how to get|how do i reach|how can i reach|how far|distance|location|address)\b/i.test(q);
  const distance=/\b(how far|distance|metres|meters|kilometres|kilometers|km)\b/i.test(q);
  const category=Object.entries(PATTERNS).find(([,re])=>re.test(q))?.[0];
  const interesting=/\b(interesting|special|unique|features|facilities|worth visiting|why visit|why go|tell me more|more about|what makes|what is good|what is nice|what can i do|what can you do|what does it offer|what is there|what about|what do they sell|what does it sell|what can i get|tell me about|what's at|whats at)\b/i.test(q);
  const serviceQuestion=/\b(wifi|wi-fi|internet|computers?|laptop|photocopy|printing|print|books|borrow|quiet|study space|seats?|desks?)\b/i.test(q) && /\b(does|can|is|are|has|have|there|it|this|that)\b/i.test(q);
  const productsQuestion=/\b(what do they sell|what does it sell|what can i get there|what food|what kind of food|do they sell)\b/i.test(q);
  const hoursQuestion=/\b(open|opening|close|closing|hours|weekend|saturday|sunday)\b/i.test(q) && /\b(is|does|it|there|what|when|the)\b/i.test(q);
  if(/^\s*(hi|hello|hey|howzit|good morning|good afternoon|good evening|how are you)[!? .]*$/i.test(q)) return {reply:'Hey! 👋 What are you looking for today — somewhere to eat, a place to study, or directions from Richfield?',suggestedPlaceIds:[]};
  if(/^\s*(thanks|thank you|thank u|shot|sharp|cool|okay|ok)[!? .]*$/i.test(q)) return {reply:'You’re welcome! 😊 Anything else you want to find around campus?',suggestedPlaceIds:[]};
  if(/^(help|options|features|what can you do|what can this bot do|how does this chatbot work)[?! .]*$/i.test(q)) return {reply:'I can help you find food, study spaces, shops and services near Richfield. Ask me about a place, request walking directions from campus, or tell me your budget for a food idea. Tap the place cards to see photos.',suggestedPlaceIds:[]};
  if(hit) {
    if(productsQuestion && hit.category==='food')return {reply:`${placeIntro(hit)}\n\nI don’t have a complete current menu for ${hit.name}. You can open its photo card to recognise the shop, or ask me for a student-budget idea.`,suggestedPlaceIds:[hit.id]};
    if(hoursQuestion) return {reply:`I don’t have today’s opening hours for ${hit.name}. It’s listed at ${hit.address}; check with the venue before making a special trip. I can still show you directions from Richfield.`,suggestedPlaceIds:[hit.id]};
    if((interesting || serviceQuestion) && !money && !/\b(price|prices|cost|costs|budget|spend|buy|discount|cheapest)\b/i.test(q)) return {reply:interestingAnswer(hit),suggestedPlaceIds:[hit.id]};
    if(pricing) return {reply:priceAnswer(money?.[1],hit),suggestedPlaceIds:[hit.id]};
    return {reply:placeAnswer(hit,{navigation,distance}),suggestedPlaceIds:[hit.id]};
  }
  if(followUp && !hit && /\b(this place|that place|there|it|interesting|special|tell me more|more about|what about|the library)\b/i.test(q) && !pricing) return {reply:'Which place would you like to know more about — Richfield Pretoria campus library or Es’kia Mphahlele Community Library? Tap a place or tell me its name.',suggestedPlaceIds:[...places.filter(p=>p.category==='study'),...pending.filter(p=>p.category==='study')].slice(0,2).map(p=>p.id)};
  if(pricing) {
    const subset=[...places.filter(p=>p.category==='food'),...pending.filter(p=>p.category==='food')].slice(0,6);
    return {reply:priceAnswer(money?.[1],null)+`\n\nSome places to compare: ${subset.map(p=>p.name).join(', ')}. Tap a photo card to see the business and directions.`,suggestedPlaceIds:subset.map(p=>p.id)};
  }
  if(/\b(weather|temperature|rain|forecast)\b/i.test(q)) return {reply:'I can help you find places around campus, but I’m not connected to a live weather forecast yet, so I don’t want to guess the weather in Pretoria. Check a weather service for the latest conditions.',suggestedPlaceIds:[]};
  const nearby=places.filter(p=>!category || p.category===category).slice(0,5);
  const unchecked=pending.filter(p=>!category || p.category===category).slice(0,5);
  if(category || navigation || /\b(near|nearby|closest|places|recommend|find|looking for|suggest|around campus)\b/i.test(q)) {
    const label=CATEGORIES.find(c=>c.id===category)?.label?.toLowerCase() || 'places';
    const lines=[...nearby,...unchecked].slice(0,8).map(p=>`• ${p.name} — ${p.address}${p.isWithinRadius?` (about ${p.distanceMeters} m from campus)` : ''}`);
    if(!lines.length)return {reply:`I don’t have a ${label} recommendation to show you just yet. Try another category or ask me about a specific place.`,suggestedPlaceIds:[]};
    const note=unchecked.length?'Some listings are student-submitted, so their exact distance has not been checked.':'';
    return {reply:`Here are some ${label} options to check out from Richfield:\n\n${lines.join('\n')}\n\nTap a place card for its photo and directions starting at campus.${note?' '+note:''}`,suggestedPlaceIds:[...nearby,...unchecked].slice(0,8).map(p=>p.id)};
  }
  return {reply:'I’m best at helping with places around Richfield Pretoria — food, libraries, shopping, transport and walking directions. Tell me what you’re looking for and I’ll help you find an option.',suggestedPlaceIds:[]};
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
  const system=`You are CBD Ventures AI Assistance, a student-friendly local guide serving students of ${CAMPUS.name}, ${CAMPUS.address}. Sound like a helpful, confident student guide: answer the actual question first, then offer a useful next step. Use two or three short sentences when possible, not database fields or repeated disclaimers. State addresses as listed in the directory, and mention uncertainty only when it materially affects the answer. Avoid technical words such as geocoding or radius eligibility in ordinary place descriptions. Recommend mapped nearby places ONLY from MAPPED_WITHIN_1KM. You may ALSO discuss STUDENT_SUBMITTED_UNVERIFIED places if asked, but explicitly state that their distance and eligibility have not been checked; never claim they are within 1 km. Any route MUST originate from Richfield at 291 Helen Joseph Street; direct users to the Map button on the place card or Google Maps walking directions. Never invent factual shop prices, menu deals, hours, addresses or photos. For budget questions you MAY make clearly labelled hypothetical calculations and illustrative price bands, NEVER attributed as real shop prices or current specials. If a business has an address discrepancy, flag it. Distances are approximate straight-line, not walking distance. Briefly flag unconfirmed prices or hours only when asked about them, and never use a warning as the first sentence of a general description. MAPPED_WITHIN_1KM:\n${places.slice(0,100).map(p=>JSON.stringify({name:p.name,address:p.address,distanceMeters:p.distanceMeters})).join('\n')}\nSTUDENT_SUBMITTED_UNVERIFIED:\n${pending.slice(0,80).map(p=>JSON.stringify({name:p.name,address:p.address,verificationNote:p.verificationNote})).join('\n')}`;
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
  if(outOfAreaRequest(messages.at(-1).content)) return {...local,mode:'local',warning:null};
  const settings=aiSettings();
  if(!settings.configured) return {...local,mode:'local',warning:settings.provider==='none'?null:'AI provider is missing its server-side API key; local guide is active.'};
  try {
    const response=await remoteReply(messages,places,pending);
    if(typeof response!=='string' || !response.trim()) throw Error('Empty AI response');
    return {...local,reply:response.trim().slice(0,4000),mode:'ai',warning:'Verify all real-world details before visiting; listed map coordinates control radius eligibility.'};
  }catch(e){console.warn('AI fallback:',e.message);return {...local,mode:'local',warning:'AI service unavailable; using the built-in student guide.'};}
}
module.exports={makeLocalReply,aiSettings,getChat,priceAnswer};
