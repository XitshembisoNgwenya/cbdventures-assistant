
const chat = document.getElementById('chat');
const form = document.getElementById('chatForm');
const input = document.getElementById('messageInput');
const send = document.querySelector('.send');
const statusText = document.getElementById('status');
const modeNote = document.getElementById('modeNote');

const welcomeMessage = "Hi! I'm your Pretoria guide. Ask me anything about places to visit, eat, or stay!";

let history = [
  { role: 'assistant', content: welcomeMessage }
];

if (modeNote) {
  modeNote.textContent = '';
  modeNote.hidden = true;
}

function stamp() {
  return new Intl.DateTimeFormat([], {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date());
}

function addMessage(text, who, isTyping = false) {
  const row = document.createElement('div');
  row.className = 'message ' + who;

  const bubble = document.createElement('div');
  bubble.className = 'bubble' + (isTyping ? ' typing' : '');
  bubble.textContent = text;

  if (!isTyping) {
    const time = document.createElement('time');
    time.textContent = stamp();
    bubble.appendChild(time);
  }

  row.appendChild(bubble);
  chat.appendChild(row);
  chat.scrollTop = chat.scrollHeight;

  return row;
}

function renderMarkdown(text) {
  const escaped = text.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]));

  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

async function sendMessage(text) {
  text = (text || '').trim();

  if (!text || send.disabled) return;

  addMessage(text, 'user');
  history.push({ role: 'user', content: text });

  input.value = '';
  resizeInput();
  send.disabled = true;
  statusText.textContent = 'Thinking…';

  const typing = addMessage(
    'CBDventures is preparing a reply…',
    'assistant',
    true
  );

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ messages: history })
    });

    if (!response.ok) {
      throw new Error('Request failed with status ' + response.status);
    }

    const data = await response.json();

    if (typeof data.reply !== 'string') {
      throw new Error('The server returned an invalid reply.');
    }

    typing.remove();

    const row = addMessage('', 'assistant');
    const bubble = row.querySelector('.bubble');

    bubble.innerHTML = renderMarkdown(data.reply);

    const time = document.createElement('time');
    time.textContent = stamp();
    bubble.appendChild(time);

    history.push({
      role: 'assistant',
      content: data.reply
    });

    history = history.slice(-24);

    if (modeNote) {
      modeNote.textContent = '';
      modeNote.hidden = true;
    }

    statusText.textContent = 'Online Guide';

  } catch (error) {
    typing.remove();

    addMessage(
      'Sorry, I could not reach the chatbot server. Please try again.',
      'assistant'
    );

    statusText.textContent = 'Connection issue';
    console.error(error);

  } finally {
    send.disabled = false;
    input.focus();
    chat.scrollTop = chat.scrollHeight;
  }
}

function resizeInput() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
}

form.addEventListener('submit', event => {
  event.preventDefault();
  sendMessage(input.value);
});

input.addEventListener('input', resizeInput);

input.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

document.querySelectorAll('[data-prompt]').forEach(button => {
  button.addEventListener('click', () => {
    sendMessage(button.dataset.prompt);
  });
});

document.getElementById('newChat').addEventListener('click', () => {
  history = [
    { role: 'assistant', content: welcomeMessage }
  ];

  chat.innerHTML = '';
  addMessage(welcomeMessage, 'assistant');

  if (modeNote) {
    modeNote.textContent = '';
    modeNote.hidden = true;
  }

  statusText.textContent = 'Online Guide';
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(error => {
      console.error('Service worker registration failed:', error);
    });
  });
}
