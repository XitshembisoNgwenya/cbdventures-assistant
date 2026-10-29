const chat = document.getElementById('chat');
const form = document.getElementById('chatForm');
const input = document.getElementById('messageInput');
const send = document.querySelector('.send');
const statusText = document.getElementById('status');
const modeNote = document.getElementById('modeNote');
let history = [{role:'assistant',content:"Hi! I'm your Pretoria guide. Ask me anything about places to visit, eat, or stay!"}];
function stamp(){return new Intl.DateTimeFormat([], {hour:'numeric',minute:'2-digit'}).format(new Date())}
function addMessage(text, who, isTyping=false){
  const row=document.createElement('div');row.className='message '+who;
  const bubble=document.createElement('div');bubble.className='bubble'+(isTyping?' typing':'');
  bubble.textContent=text;
  if(!isTyping){const time=document.createElement('time');time.textContent=stamp();bubble.appendChild(time)}
  row.appendChild(bubble);chat.appendChild(row);chat.scrollTop=chat.scrollHeight;return row;
}
function renderMarkdown(text){
  // Keep output safe while supporting simple bold formatting and line breaks.
  const escaped=text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return escaped.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
}
async function sendMessage(text){
  text=(text||'').trim();if(!text||send.disabled)return;
  addMessage(text,'user');history.push({role:'user',content:text});input.value='';resizeInput();send.disabled=true;statusText.textContent='Thinking…';
  const typing=addMessage('CBDventures is preparing a reply…','assistant',true);
  try{
    const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:history})});
    const data=await r.json();if(!r.ok)throw new Error(data.error||'Request failed');
    typing.remove();const row=addMessage('','assistant');const bubble=row.querySelector('.bubble');bubble.innerHTML=renderMarkdown(data.reply);const time=document.createElement('time');time.textContent=stamp();bubble.appendChild(time);
    history.push({role:'assistant',content:data.reply});history=history.slice(-24);
    if(data.mode==='ai'){modeNote.textContent='AI-powered Pretoria guide';statusText.textContent='Online Guide'}else{modeNote.textContent='Demo mode · connect an AI API key for open-ended answers';statusText.textContent='Online Guide'}
  }catch(e){typing.remove();addMessage('Sorry, I could not reach the chatbot server. Please make sure the app server is running, then try again.','assistant');statusText.textContent='Connection issue'}
  finally{send.disabled=false;input.focus();chat.scrollTop=chat.scrollHeight}
}
function resizeInput(){input.style.height='auto';input.style.height=Math.min(input.scrollHeight,120)+'px'}
form.addEventListener('submit',e=>{e.preventDefault();sendMessage(input.value)});
input.addEventListener('input',resizeInput);input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit()}});
document.querySelectorAll('[data-prompt]').forEach(b=>b.addEventListener('click',()=>sendMessage(b.dataset.prompt)));
document.getElementById('newChat').addEventListener('click',()=>{history=[{role:'assistant',content:"Hi! I'm your Pretoria guide. Ask me anything about places to visit, eat, or stay!"}];chat.innerHTML='';addMessage(history[0].content,'assistant');statusText.textContent='Online Guide'});
if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
