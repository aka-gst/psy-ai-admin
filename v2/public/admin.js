const login = document.querySelector('#login');
const dashboard = document.querySelector('#dashboard');
const bookings = document.querySelector('#bookings');
const slots = document.querySelector('#slots');
const specialists = document.querySelector('#specialists');
let schedule = { specialists: [], slots: [] };

const statusLabels = { pending: 'Ожидает решения', confirmed: 'Подтверждена', rejected: 'Отклонена', available: 'Свободен', held: 'Ожидает решения', booked: 'Занят' };
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const formatDate = (value) => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'Ошибка запроса.'), { status: response.status });
  return data;
}

async function loadBookings() {
  try {
    const data = await api('/api/admin/bookings');
    login.hidden = true;
    dashboard.hidden = false;
    bookings.innerHTML = data.bookings.length ? data.bookings.map((item) => `<article><div><span class="status ${item.status}">${statusLabels[item.status]}</span><h2>${escapeHtml(item.clientName)}</h2><p>${formatDate(item.startsAt)} · ${escapeHtml(item.specialistName)}</p><a href="${item.contactType === 'email' ? 'mailto:' : 'tel:'}${encodeURIComponent(item.contact)}">${escapeHtml(item.contact)}</a></div>${item.status === 'pending' ? `<div class="actions"><button data-booking-id="${item.id}" data-decision="confirmed">Подтвердить</button><button class="secondary" data-booking-id="${item.id}" data-decision="rejected">Отклонить</button></div>` : ''}</article>`).join('') : '<p class="empty">Заявок пока нет.</p>';
  } catch (error) {
    if (error.status === 401) { login.hidden = false; dashboard.hidden = true; }
  }
}

async function loadSchedule() {
  schedule = await api('/api/admin/schedule');
  const active = schedule.specialists.filter((item) => item.active);
  document.querySelector('#slot-specialist').innerHTML = '<option value="">Выберите специалиста</option>' + active.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
  slots.innerHTML = schedule.slots.length ? schedule.slots.map((item) => `<article><div><span class="status ${item.status}">${statusLabels[item.status]}</span><b>${formatDate(item.startsAt)}</b><span>${escapeHtml(item.specialistName)}</span></div>${item.status === 'available' ? `<button class="secondary danger" data-slot-id="${item.id}">Удалить</button>` : ''}</article>`).join('') : '<p class="empty">Будущих слотов пока нет.</p>';
  specialists.innerHTML = schedule.specialists.length ? schedule.specialists.map((item) => `<article><div><b>${escapeHtml(item.name)}</b><span>${escapeHtml(item.description || 'Без описания')}</span></div><button class="secondary" data-specialist-id="${escapeHtml(item.id)}" data-active="${!item.active}">${item.active ? 'Отключить' : 'Включить'}</button></article>`).join('') : '<p class="empty">Специалистов пока нет.</p>';
}

login.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: document.querySelector('#password').value }) });
    document.querySelector('#login-error').textContent = '';
    await Promise.all([loadBookings(), loadSchedule()]);
  } catch (error) { document.querySelector('#login-error').textContent = error.message; }
});

bookings.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-booking-id]');
  if (!button) return;
  button.disabled = true;
  await api(`/api/admin/bookings/${button.dataset.bookingId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: button.dataset.decision }) });
  await Promise.all([loadBookings(), loadSchedule()]);
});

document.querySelector('.admin-tabs').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-tab]');
  if (!button) return;
  document.querySelectorAll('.admin-tabs button').forEach((item) => item.classList.toggle('active', item === button));
  document.querySelectorAll('.admin-section').forEach((item) => { item.hidden = item.id !== `${button.dataset.tab}-tab`; });
  if (button.dataset.tab !== 'requests') await loadSchedule();
});

document.querySelector('#slot-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = document.querySelector('#slot-message');
  try {
    await api('/api/admin/slots', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ specialistId: document.querySelector('#slot-specialist').value, startsAt: document.querySelector('#slot-start').value }) });
    message.textContent = 'Свободное время добавлено.';
    event.target.reset();
    await loadSchedule();
  } catch (error) { message.textContent = error.message; }
});

slots.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-slot-id]');
  if (!button) return;
  button.disabled = true;
  try { await api(`/api/admin/slots/${button.dataset.slotId}`, { method: 'DELETE' }); await loadSchedule(); }
  catch (error) { document.querySelector('#slot-message').textContent = error.message; }
});

document.querySelector('#specialist-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = document.querySelector('#specialist-message');
  try {
    await api('/api/admin/specialists', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: document.querySelector('#specialist-name').value, description: document.querySelector('#specialist-description').value }) });
    message.textContent = 'Специалист добавлен.';
    event.target.reset();
    await loadSchedule();
  } catch (error) { message.textContent = error.message; }
});

specialists.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-specialist-id]');
  if (!button) return;
  button.disabled = true;
  await api(`/api/admin/specialists/${button.dataset.specialistId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ active: button.dataset.active === 'true' }) });
  await loadSchedule();
});

document.querySelector('#refresh').addEventListener('click', () => Promise.all([loadBookings(), loadSchedule()]));
loadBookings();
