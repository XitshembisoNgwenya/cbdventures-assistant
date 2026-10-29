const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'public');
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
function localReply(message) {
  const q = message.toLowerCase();
  if (/hello|hi\b|hey|good morning|good evening/.test(q)) return "Hi! 👋 Welcome to CBDventures Assistant, your Pretoria guide. I can help you explore attractions, find places to eat, and plan where to stay. What are you looking for?";
  if (/restaurant|eat|food|cafe|hungry|lunch|dinner/.test(q)) return "Here are a few areas to explore for food in Pretoria:\n\n• **Church Square / central Pretoria** — historic city-centre options; check current opening times before going.\n• **Hatfield** — casual restaurants and student-friendly cafés.\n• **Hazelwood** — a popular area for dining and cafés.\n• **Menlyn Maine** — restaurants and a modern mixed-use precinct.\n\nTell me your budget and preferred food, and I’ll narrow it down. I can’t verify live availability in this offline demo.";
  if (/attraction|visit|tour|things to do|museum|place to see/.test(q)) return "For a Pretoria outing, consider:\n\n• **Union Buildings** — gardens and city views.\n• **Freedom Park** — heritage and remembrance site.\n• **Voortrekker Monument** — history and panoramic views.\n• **National Zoological Garden** — a full-day wildlife outing.\n• **Church Square** — historic architecture in the city centre.\n\nCheck official visitor information for current hours, tickets and access before travelling.";
  if (/hotel|stay|accommodation|guest house|place to sleep/.test(q)) return "I can help you compare places to stay. Popular areas to start searching include **Hatfield** (near the university and transport), **Arcadia** (central and close to embassies and attractions), and **Menlyn** (shopping and dining). What dates, nightly budget, and number of guests should I use? I can’t confirm live room prices in this demo.";
  if (/church square/.test(q)) return "Church Square is in central Pretoria. For food nearby, search current listings around the square and check recent reviews and opening hours before heading out. If you tell me your budget, cuisine, and whether you want walking distance, I can help you choose what to look for.";
  if (/budget|cheap|free/.test(q)) return "For a lower-cost Pretoria day, consider visiting public outdoor areas such as the Union Buildings gardens, walking around Church Square, or choosing cafés and casual eateries in Hatfield. Check access rules and current opening details before you go. What kind of outing do you have in mind?";
  if (/help|what can you do|options/.test(q)) return "I can help with:\n\n📍 **Nearby Attractions** — sights, museums and activities\n🍽️ **Best Restaurants** — food ideas by area, cuisine and budget\n🛏️ **Hotel Deals** — areas to stay and what to compare\n🗺️ **Trip planning** — build a simple Pretoria itinerary\n\nAsk me a question or tap one of the quick buttons below.";
  return "Thanks for your question! I’m the CBDventures Pretoria guide. I can help with attractions, restaurants, accommodation and simple itineraries. For more open-ended AI answers, add an AI provider API key to the server configuration. For now, try asking about restaurants, attractions, hotels, or budget-friendly activities.";
}
async function aiReply(messages) {
  const key = process.env.AI_API_KEY;
  if (!key) return localReply(messages[messages.length - 1]?.content || '');
  const base = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const response = await fetch(base + '/chat/completions', {
    method: 'POST', headers: {'Content-Type':'application/json','Authorization':'Bearer ' + key},
    body: JSON.stringify({model: process.env.AI_MODEL || 'gpt-4o-mini', temperature: 0.6, messages: [
      {role:'system', content:'You are CBDventures Assistant, a friendly and honest Pretoria, South Africa visitor guide. Help users discover attractions, restaurants, accommodation and itinerary ideas. Do not invent real-time prices, opening hours, availability or business facts; say when details need checking. Ask concise follow-up questions when useful. Keep answers readable on mobile.'},
      ...messages.filter(m => ['user','assistant'].includes(m.role)).slice(-12)
    ]})
  });
  if (!response.ok) throw new Error('AI provider returned ' + response.status);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'Sorry, I could not create a reply just now.';
}
const server = http.createServer(async (req,res) => {
  if (req.method === 'POST' && req.url === '/api/chat') {
    let body=''; req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        if (!Array.isArray(data.messages) || !data.messages.length) throw new Error('Please send a message.');
        const reply = await aiReply(data.messages);
        res.writeHead(200, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
        res.end(JSON.stringify({reply, mode: process.env.AI_API_KEY ? 'ai' : 'demo'}));
      } catch (e) {
        res.writeHead(500, {'Content-Type':'application/json; charset=utf-8'});
        res.end(JSON.stringify({error:'I could not answer just now. Check the server or AI configuration and try again.'}));
      }
    }); return;
  }
  let pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  if (pathname === '/') pathname = '/index.html';
  const file = path.join(ROOT, pathname.replace(/^\/+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, content) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream','X-Content-Type-Options':'nosniff'}); res.end(content);
  });
});
server.listen(PORT, () => console.log(`CBDventures Assistant running on http://localhost:${PORT}`));
