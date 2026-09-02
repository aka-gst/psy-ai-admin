const form = document.querySelector('#booking-form');
const slot = document.querySelector('#slot');
const notice = document.querySelector('#notice');
const result = document.querySelector('#result');

const formatSlot = (item) => `${new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.startsAt))} — ${item.specialistName}`;

async function load() {
  const [configResponse, slotsResponse] = await Promise.all([fetch('api/config'), fetch('api/slots')]);
  const config = await configResponse.json();
  const { slots } = await slotsResponse.json();
  document.title = `Запись — ${config.centerName}`;
  document.querySelector('#consent-text').textContent = config.consentText;
  notice.textContent = config.bookingNotice;
  slot.innerHTML = '<option value="">Выберите дату, время и специалиста</option>' + slots.map((item) => `<option value="${item.id}">${formatSlot(item)}</option>`).join('');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  const response = await fetch('api/bookings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slotId: slot.value, clientName: document.querySelector('#client-name').value, contact: document.querySelector('#contact').value, contactType: document.querySelector('#contact-type').value, consent: document.querySelector('#consent').checked }) });
  const data = await response.json();
  button.disabled = false;
  if (!response.ok) { result.hidden = false; result.className = 'result error'; result.textContent = data.error; return; }
  form.hidden = true;
  result.hidden = false;
  result.className = 'result success';
  result.innerHTML = `<b>Заявка принята</b><p>${data.message}</p><small>Номер заявки: ${data.publicCode}</small>`;
});

load().catch(() => { slot.innerHTML = '<option value="">Не удалось загрузить расписание</option>'; });
