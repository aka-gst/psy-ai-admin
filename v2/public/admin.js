const login = document.querySelector('#login');
const dashboard = document.querySelector('#dashboard');
const board = document.querySelector('#board');
const slots = document.querySelector('#slots');
const specialists = document.querySelector('#specialists');
const inquiryForm = document.querySelector('#inquiry-form');
let schedule = { specialists: [], slots: [] };
let records = new Map();

const statusLabels = { pending: 'Нужно связаться', confirmed: 'Подтверждено', rejected: 'Закрыто', available: 'Свободен', held: 'Ожидает решения', booked: 'Занят' };
const kindLabels = { booking: 'Запись к специалисту', hall_rental: 'Аренда зала', seminar: 'Семинар', callback: 'Перезвонить', email: 'Ответить по e-mail' };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const formatDate = (value) => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const contactHref = (record) => `${record.contactType === 'email' ? 'mailto:' : 'tel:'}${encodeURIComponent(record.contact)}`;

async function api(path, options) {
  const response = await fetch(path.replace(/^\//, ''), options);
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'Ошибка запроса.'), { status: response.status });
  return data;
}

function slotOptions(currentSlotId) {
  return schedule.slots.filter((slot) => slot.status === 'available' || slot.id === currentSlotId)
    .map((slot) => `<option value="${slot.id}" ${slot.id === currentSlotId ? 'selected' : ''}>${escapeHtml(formatDate(slot.startsAt))} · ${escapeHtml(slot.specialistName)}</option>`).join('');
}

function bookingCard(item) {
  return `<article class="record-card" draggable="true" data-record-type="booking" data-record-id="${item.id}">
    <span class="kind">${kindLabels.booking}</span><h3>${escapeHtml(item.clientName)}</h3>
    <p>${escapeHtml(formatDate(item.startsAt))} · ${escapeHtml(item.specialistName)}</p>
    <a href="${contactHref(item)}">${escapeHtml(item.contact)}</a>
    <details><summary>Изменить или перенести</summary><form data-edit-booking="${item.id}" class="edit-form">
      <label>Имя<input name="clientName" value="${escapeHtml(item.clientName)}" required></label>
      <label>Контакт<input name="contact" value="${escapeHtml(item.contact)}" required></label>
      <label>Тип контакта<select name="contactType"><option value="phone" ${item.contactType === 'phone' ? 'selected' : ''}>Телефон</option><option value="email" ${item.contactType === 'email' ? 'selected' : ''}>E-mail</option></select></label>
      <label>Время и специалист<select name="slotId">${slotOptions(item.slotId)}</select></label>
      <label>Статус<select name="status">${['pending', 'confirmed', 'rejected'].map((status) => `<option value="${status}" ${item.status === status ? 'selected' : ''}>${statusLabels[status]}</option>`).join('')}</select></label>
      <button>Сохранить</button></form></details>
    <div class="card-actions"><button class="secondary" data-status-booking="${item.id}" data-status="confirmed">Подтвердить</button><button class="secondary" data-status-booking="${item.id}" data-status="rejected">Закрыть</button><button class="secondary danger" data-delete-booking="${item.id}">Удалить</button></div>
  </article>`;
}

function inquiryCard(item) {
  return `<article class="record-card" draggable="true" data-record-type="inquiry" data-record-id="${item.id}">
    <span class="kind">${kindLabels[item.kind]}</span><h3>${escapeHtml(item.clientName || 'Имя не указано')}</h3>
    <p>${escapeHtml(item.requestedFor || 'Время не выбрано')}</p><p class="details">${escapeHtml(item.details)}</p>
    <a href="${contactHref(item)}">${escapeHtml(item.contact)}</a>
    <details><summary>Уточнить и сохранить</summary><form data-edit-inquiry="${item.id}" class="edit-form">
      <label>Тип<select name="kind">${Object.entries(kindLabels).filter(([key]) => key !== 'booking').map(([key, label]) => `<option value="${key}" ${item.kind === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label>Имя<input name="clientName" value="${escapeHtml(item.clientName)}"></label>
      <label>Контакт<input name="contact" value="${escapeHtml(item.contact)}" required></label>
      <label>Тип контакта<select name="contactType"><option value="phone" ${item.contactType === 'phone' ? 'selected' : ''}>Телефон</option><option value="email" ${item.contactType === 'email' ? 'selected' : ''}>E-mail</option></select></label>
      <label>Желаемые дата и время<input name="requestedFor" value="${escapeHtml(item.requestedFor)}"></label>
      <label>Комментарий<textarea name="details" maxlength="400">${escapeHtml(item.details)}</textarea></label>
      <label>Статус<select name="status">${['pending', 'confirmed', 'rejected'].map((status) => `<option value="${status}" ${item.status === status ? 'selected' : ''}>${statusLabels[status]}</option>`).join('')}</select></label>
      <button>Сохранить</button></form></details>
    <div class="card-actions"><button class="secondary" data-status-inquiry="${item.id}" data-status="confirmed">Подтвердить</button><button class="secondary" data-status-inquiry="${item.id}" data-status="rejected">Закрыть</button><button class="secondary danger" data-delete-inquiry="${item.id}">Удалить</button></div>
  </article>`;
}

function renderBoard(bookings, inquiries) {
  records = new Map([...bookings.map((item) => [`booking:${item.id}`, item]), ...inquiries.map((item) => [`inquiry:${item.id}`, item])]);
  board.innerHTML = ['pending', 'confirmed', 'rejected'].map((status) => {
    const cards = [...bookings.filter((item) => item.status === status).map(bookingCard), ...inquiries.filter((item) => item.status === status).map(inquiryCard)].join('') || '<p class="empty">Пока пусто</p>';
    return `<section class="board-column" data-drop-status="${status}"><h2>${statusLabels[status]}</h2><div class="board-stack">${cards}</div></section>`;
  }).join('');
}

async function loadSchedule() {
  schedule = await api('/api/admin/schedule');
  const active = schedule.specialists.filter((item) => item.active);
  document.querySelector('#slot-specialist').innerHTML = '<option value="">Выберите специалиста</option>' + active.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
  slots.innerHTML = schedule.slots.length ? schedule.slots.map((item) => `<article><div><span class="status ${item.status}">${statusLabels[item.status]}</span><b>${formatDate(item.startsAt)}</b><span>${escapeHtml(item.specialistName)}</span></div>${item.status === 'available' ? `<button class="secondary danger" data-slot-id="${item.id}">Удалить</button>` : ''}</article>`).join('') : '<p class="empty">Будущих слотов пока нет.</p>';
  specialists.innerHTML = schedule.specialists.length ? schedule.specialists.map((item) => `<article><div><b>${escapeHtml(item.name)}</b><span>${escapeHtml(item.description || 'Без описания')}</span></div><button class="secondary" data-specialist-id="${escapeHtml(item.id)}" data-active="${!item.active}">${item.active ? 'Отключить' : 'Включить'}</button></article>`).join('') : '<p class="empty">Специалистов пока нет.</p>';
}

async function loadDashboard() {
  const [bookingData, inquiryData] = await Promise.all([api('/api/admin/bookings'), api('/api/admin/inquiries')]);
  login.hidden = true; dashboard.hidden = false;
  await loadSchedule();
  renderBoard(bookingData.bookings, inquiryData.inquiries);
}

const body = (form) => Object.fromEntries(new FormData(form));
const refresh = () => loadDashboard();

login.addEventListener('submit', async (event) => {
  event.preventDefault();
  try { await api('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: document.querySelector('#password').value }) }); document.querySelector('#login-error').textContent = ''; await refresh(); }
  catch (error) { document.querySelector('#login-error').textContent = error.message; }
});
inquiryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try { await api('/api/admin/inquiries', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body(event.target)) }); event.target.reset(); await refresh(); }
  catch (error) { document.querySelector('#inquiry-message').textContent = error.message; }
});
board.addEventListener('submit', async (event) => {
  const form = event.target.closest('form'); if (!form) return;
  event.preventDefault(); const type = form.dataset.editBooking ? 'bookings' : 'inquiries'; const id = form.dataset.editBooking || form.dataset.editInquiry;
  await api(`/api/admin/${type}/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body(form)) }); await refresh();
});
board.addEventListener('click', async (event) => {
  const button = event.target.closest('button'); if (!button) return;
  const type = button.dataset.statusBooking ? 'bookings' : button.dataset.statusInquiry ? 'inquiries' : button.dataset.deleteBooking ? 'bookings' : button.dataset.deleteInquiry ? 'inquiries' : null;
  const id = button.dataset.statusBooking || button.dataset.statusInquiry || button.dataset.deleteBooking || button.dataset.deleteInquiry;
  if (!type || !id) return; button.disabled = true;
  if (button.dataset.status) { const recordType = type === 'bookings' ? 'booking' : 'inquiry'; const record = records.get(`${recordType}:${id}`); await api(`/api/admin/${type}/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...record, status: button.dataset.status }) }); }
  else if (window.confirm('Удалить эту демонстрационную запись?')) await api(`/api/admin/${type}/${id}`, { method: 'DELETE' });
  await refresh();
});
board.addEventListener('dragstart', (event) => { const card = event.target.closest('[data-record-type]'); if (!card) return; event.dataTransfer.setData('text/plain', `${card.dataset.recordType}:${card.dataset.recordId}`); event.dataTransfer.effectAllowed = 'move'; });
board.addEventListener('dragover', (event) => { if (event.target.closest('[data-drop-status]')) event.preventDefault(); });
board.addEventListener('drop', async (event) => { const column = event.target.closest('[data-drop-status]'); if (!column) return; event.preventDefault(); const [type, id] = event.dataTransfer.getData('text/plain').split(':'); const record = records.get(`${type}:${id}`); if (!record || record.status === column.dataset.dropStatus) return; await api(`/api/admin/${type === 'booking' ? 'bookings' : 'inquiries'}/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...record, status: column.dataset.dropStatus }) }); await refresh(); });
document.querySelector('.admin-tabs').addEventListener('click', async (event) => { const button = event.target.closest('button[data-tab]'); if (!button) return; document.querySelectorAll('.admin-tabs button').forEach((item) => item.classList.toggle('active', item === button)); document.querySelectorAll('.admin-section').forEach((item) => { item.hidden = item.id !== `${button.dataset.tab}-tab`; }); if (button.dataset.tab !== 'requests') await loadSchedule(); });
document.querySelector('#slot-form').addEventListener('submit', async (event) => { event.preventDefault(); const message = document.querySelector('#slot-message'); try { await api('/api/admin/slots', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ specialistId: document.querySelector('#slot-specialist').value, startsAt: document.querySelector('#slot-start').value }) }); message.textContent = 'Свободное время добавлено.'; event.target.reset(); await loadSchedule(); } catch (error) { message.textContent = error.message; } });
slots.addEventListener('click', async (event) => { const button = event.target.closest('button[data-slot-id]'); if (!button) return; button.disabled = true; try { await api(`/api/admin/slots/${button.dataset.slotId}`, { method: 'DELETE' }); await loadSchedule(); } catch (error) { document.querySelector('#slot-message').textContent = error.message; } });
document.querySelector('#specialist-form').addEventListener('submit', async (event) => { event.preventDefault(); const message = document.querySelector('#specialist-message'); try { await api('/api/admin/specialists', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: document.querySelector('#specialist-name').value, description: document.querySelector('#specialist-description').value }) }); message.textContent = 'Специалист добавлен.'; event.target.reset(); await loadSchedule(); } catch (error) { message.textContent = error.message; } });
specialists.addEventListener('click', async (event) => { const button = event.target.closest('button[data-specialist-id]'); if (!button) return; button.disabled = true; await api(`/api/admin/specialists/${button.dataset.specialistId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ active: button.dataset.active === 'true' }) }); await loadSchedule(); });
document.querySelector('#refresh').addEventListener('click', refresh);
