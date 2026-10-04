const form = document.querySelector('#form');
const input = document.querySelector('#prompt');
const chat = document.querySelector('.chat');
const suggestions = document.querySelector('#suggestions');
const modal = document.querySelector('#modal');
const settings = document.querySelector('#settings');
const statusText = document.querySelector('#statusText');
const note = document.querySelector('#note');
const apiInput = document.querySelector('#apiKey');
const history = [];

let apiKey = sessionStorage.getItem('auguste-openai-key') || '';
let serverStatus = { openai: false, nemoVideo: false };

function updateConnection() {
  const connected = Boolean(apiKey || serverStatus.openai);
  statusText.textContent = connected ? 'OpenAI connecte' : 'Demo';
  settings.textContent = apiKey ? 'OpenAI connecte' : 'Connecter OpenAI';
  note.textContent = connected
    ? 'OpenAI est disponible. NemoVideo necessite une cle secrete sur l hebergement.'
    : 'Mode demo. Ajoute une cle API OpenAI pour activer les reponses et les images.';
}

function setModal(open) {
  modal.classList.toggle('open', open);
  modal.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (open) apiInput.focus();
}

function addMessage(text, who) {
  const box = document.createElement('div');
  box.className = `message ${who}`;

  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = who === 'user' ? 'Auguste' : 'IA du Grand Auguste';

  box.append(label, document.createTextNode(text));
  chat.append(box);
  chat.scrollTop = chat.scrollHeight;
  return box;
}

function setPendingText(box, text) {
  box.lastChild.textContent = text;
}

async function askOpenAI(text) {
  if (serverStatus.openai) {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erreur de connexion a OpenAI.');
    history.push({ role: 'user', content: text }, { role: 'assistant', content: data.text });
    return data.text;
  }

  if (!apiKey) return null;
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-5',
      store: false,
      input: [
        { role: 'developer', content: 'Tu es IA du Grand Auguste, un assistant amical qui parle francais.' },
        ...history,
        { role: 'user', content: text },
      ],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Erreur de connexion a OpenAI.');

  const output = data.output_text
    || data.output?.flatMap(item => item.content || []).map(item => item.text || '').join('\n')
    || 'Je n ai pas recu de reponse.';

  history.push({ role: 'user', content: text }, { role: 'assistant', content: output });
  return output;
}

async function submit(text) {
  const cleanText = text.trim();
  if (!cleanText) return;

  addMessage(cleanText, 'user');
  suggestions.hidden = true;
  input.value = '';

  const pending = addMessage((apiKey || serverStatus.openai) ? 'Je reflechis...' : 'Connecte une cle OpenAI pour obtenir une vraie reponse.', 'assistant');
  const button = form.querySelector('.send');
  button.disabled = true;

  try {
    const answer = await askOpenAI(cleanText);
    if (answer) setPendingText(pending, answer);
  } catch (error) {
    setPendingText(pending, `Connexion impossible : ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

async function createImage() {
  if (!apiKey && !serverStatus.openai) {
    setModal(true);
    return;
  }

  const prompt = window.prompt('Decris l image que tu veux creer :');
  if (!prompt?.trim()) return;

  addMessage(`Cree une image : ${prompt}`, 'user');
  const pending = addMessage('Je cree ton image...', 'assistant');

  try {
    const response = serverStatus.openai
      ? await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      })
      : await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-image-1',
          prompt: prompt.trim(),
          size: '1024x1024',
        }),
      });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Erreur de generation.');

    const image = document.createElement('img');
    image.className = 'image-result';
    image.alt = prompt;
    image.src = `data:image/png;base64,${data.image || data.data[0].b64_json}`;
    pending.lastChild.replaceWith(image);
  } catch (error) {
    setPendingText(pending, `Impossible de creer l image : ${error.message}`);
  }
}

async function createVideo() {
  const prompt = window.prompt('Decris la video que NemoVideo doit creer :');
  if (!prompt?.trim()) return;

  addMessage(`Cree une video avec NemoVideo : ${prompt}`, 'user');
  const pending = addMessage('J envoie ta demande a NemoVideo...', 'assistant');

  try {
    const response = await fetch('/api/video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt.trim() }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'NemoVideo ne repond pas.');

    setPendingText(pending, data.message || 'Ta video est prete.');
    if (data.video) {
      const video = document.createElement('video');
      video.className = 'image-result';
      video.controls = true;
      video.src = data.video;
      pending.append(video);
    }
  } catch (error) {
    if (error.message.includes('cle NemoVideo')) {
      setPendingText(pending, `La creation directe demande une cle API NemoVideo sur l hebergement. Idee de video : ${prompt.trim()}`);
      const link = document.createElement('a');
      link.href = 'https://www.nemovideo.com/';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Ouvrir NemoVideo';
      link.style.cssText = 'display:inline-block;margin-top:10px;color:#e5bb70';
      pending.append(link);
      return;
    }
    setPendingText(pending, `Je ne peux pas encore lancer NemoVideo : ${error.message}`);
  }
}

function drawAmbient() {
  const canvas = document.querySelector('#ambient');
  const context = canvas.getContext('2d');
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;

  canvas.width = width * ratio;
  canvas.height = height * ratio;
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);

  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#101813');
  gradient.addColorStop(.5, '#111611');
  gradient.addColorStop(1, '#201915');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = 'rgba(229, 187, 112, .12)';
  context.lineWidth = 1;
  const gap = Math.max(42, Math.floor(width / 24));
  for (let x = -gap; x < width + gap; x += gap) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + height * .38, height);
    context.stroke();
  }

  context.fillStyle = 'rgba(127, 186, 140, .12)';
  for (let i = 0; i < 80; i += 1) {
    const x = (i * 137.5) % width;
    const y = (i * 83.3) % height;
    context.beginPath();
    context.arc(x, y, (i % 4) + 1, 0, Math.PI * 2);
    context.fill();
  }
}

function updateClock() {
  const clock = document.querySelector('#clock');
  const now = new Date();
  clock.textContent = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

async function loadServerStatus() {
  try {
    const response = await fetch('/api/status');
    if (response.ok) serverStatus = await response.json();
  } catch {
    serverStatus = { openai: false, nemoVideo: false };
  } finally {
    updateConnection();
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  submit(input.value);
});

input.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

document.querySelectorAll('.suggestions button').forEach(button => {
  button.addEventListener('click', () => submit(button.textContent));
});

settings.addEventListener('click', () => {
  apiInput.value = apiKey;
  setModal(true);
});

document.querySelector('#cancel').addEventListener('click', () => setModal(false));

document.querySelector('#keyForm').addEventListener('submit', event => {
  event.preventDefault();
  apiKey = apiInput.value.trim();
  if (apiKey) sessionStorage.setItem('auguste-openai-key', apiKey);
  else sessionStorage.removeItem('auguste-openai-key');
  updateConnection();
  setModal(false);
});

document.querySelector('#imageButton').addEventListener('click', createImage);
document.querySelector('#videoButton').addEventListener('click', createVideo);
window.addEventListener('resize', drawAmbient);

drawAmbient();
updateClock();
setInterval(updateClock, 30000);
loadServerStatus();
