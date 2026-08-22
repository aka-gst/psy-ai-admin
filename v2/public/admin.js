const login = document.querySelector('#login');
const dashboard = document.querySelector('#dashboard');
const bookings = document.querySelector('#bookings');

const statusLabels = { pending: 'Ожидает решения', confirmed: 'Подтверждена', rejected: 'Отклонена' };
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

async function loadBookings() {
  const response = await fetch('/api/admin/bookings');
  if (response.status === 401) { login.hidden = false; dashboard.hidden = true; return; }
  const data = await response.json();
  login.hidden = true; dashboard.hidden = false;
  bookings.innerHTML = data.bookings.length ? data.bookings.map((item) => `<article><div><span class="status ${item.status}">${statusLabels[item.status]}</span><h2>${escapeHtml(item.clientName)}</h2><p>${new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeStyle:'short'}).format(new Date(item.startsAt))} · ${escapeHtml(item.specialistName)}</p><a href="${item.contactType === 'email' ? 'mailto:' : 'tel:'}${encodeURIComponent(item.contact)}">${escapeHtml(item.contact)}</a></div>${item.status === 'pending' ? `<div class="actions"><button data-id="${item.id}" data-decision="confirmed">Подтвердить</button><button class="secondary" data-id="${item.id}" data-decision="rejected">Отклонить</button></div>` : ''}</article>`).join('') : '<p class="empty">Заявок пока нет.</p>';
}

login.addEventListener('submit', async (event) => { event.preventDefault(); const response = await fetch('/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:document.querySelector('#password').value})}); if (!response.ok) { document.querySelector('#login-error').textContent='Неверный пароль или панель ещё не настроена.'; return; } await loadBookings(); });
bookings.addEventListener('click', async (event) => { const button = event.target.closest('button[data-id]'); if (!button) return; button.disabled=true; await fetch(`/api/admin/bookings/${button.dataset.id}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({decision:button.dataset.decision})}); await loadBookings(); });
document.querySelector('#refresh').addEventListener('click', loadBookings);
loadBookings();
