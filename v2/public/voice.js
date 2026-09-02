// Голосовой слой поверх того же маршрута /api/ask. Собственной логики ответа
// здесь нет: что сказать, по-прежнему решает движок, а страница только
// распознаёт речь и произносит готовый текст.
const talk = document.querySelector('#talk');
const speakToggle = document.querySelector('#speak');
const heard = document.querySelector('#heard');
const answer = document.querySelector('#answer');
const support = document.querySelector('#support');

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let lastSourceKey = '';
let listening = false;

fetch('api/config').then((response) => response.json()).then((config) => {
  document.querySelector('#emergency-notice').textContent = config.emergencyNotice;
}).catch(() => {});

// Браузер без распознавания речи не должен встречать посетителя пустой кнопкой.
if (!Recognition) {
  support.hidden = false;
  support.textContent = 'Этот браузер не умеет распознавать речь. Ответы будут озвучены, но вопрос придётся задать на странице записи текстом.';
  talk.disabled = true;
}
if (!('speechSynthesis' in window)) {
  support.hidden = false;
  support.textContent = `${support.textContent} Произнесение ответа тоже недоступно.`.trim();
  speakToggle.checked = false;
  speakToggle.disabled = true;
}

const speak = (text) => {
  if (!speakToggle.checked || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ru-RU';
  speechSynthesis.speak(utterance);
};

async function ask(question) {
  const response = await fetch('api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question, lastSourceKey }) });
  const data = await response.json();
  answer.hidden = false;
  if (!response.ok) { answer.className = 'answer'; answer.textContent = data.error; return; }
  lastSourceKey = data.sourceKeys[0] || lastSourceKey;
  answer.className = `answer ${data.kind === 'crisis' || data.kind === 'boundary' ? data.kind : ''}`.trim();
  answer.textContent = data.text;
  for (const source of data.sources) {
    const link = document.createElement('a');
    link.href = source.url;
    link.textContent = source.label;
    answer.append(link);
  }
  speak(data.text);
}

if (Recognition) {
  const recognition = new Recognition();
  recognition.lang = 'ru-RU';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.addEventListener('result', (event) => {
    const question = event.results[0][0].transcript.trim();
    heard.hidden = false;
    heard.textContent = `Услышано: ${question}`;
    if (question) void ask(question);
  });
  recognition.addEventListener('error', (event) => {
    support.hidden = false;
    support.textContent = event.error === 'not-allowed'
      ? 'Доступ к микрофону не разрешён. Разрешите его в настройках браузера и попробуйте снова.'
      : 'Не удалось распознать речь. Попробуйте ещё раз.';
  });
  const stop = () => { listening = false; talk.textContent = 'Говорить'; };
  recognition.addEventListener('end', stop);

  talk.addEventListener('click', () => {
    if (listening) { recognition.stop(); stop(); return; }
    support.hidden = true;
    listening = true;
    talk.textContent = 'Слушаю… нажмите, чтобы остановить';
    // Ответ не должен звучать поверх нового вопроса.
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    recognition.start();
  });
}
