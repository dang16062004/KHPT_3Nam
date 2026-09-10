/* UI cua tro ly ca nhan. Vanilla JS — khong framework, khong build step. */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const AREA_LABELS = {
  ngoai_ngu: 'Ngoại ngữ',
  ai: 'AI / Lập trình',
  kinh_te: 'Kinh tế',
  van_dong: 'Vận động',
  an_uong: 'Ăn uống',
};

const TOOL_LABELS = {
  create_reminder: 'Tạo nhắc nhở',
  get_advice: 'Đọc kế hoạch để tư vấn',
  log_progress: 'Ghi tiến độ',
  get_progress_summary: 'Tổng hợp tiến độ',
};

/** fetch co xu ly phien het han: 401 -> quay ve man dang nhap. */
async function api(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (res.status === 401) {
    window.location.href = '/auth/login';
    throw new Error('Phiên đã hết hạn');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Lỗi ${res.status}`);
  }
  return res.json();
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ============================================================ tabs

$$('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    $$('.tab').forEach((t) => t.classList.toggle('is-active', t === tab));
    $$('.panel').forEach((p) => p.classList.toggle('is-active', p.id === `panel-${tab.dataset.tab}`));
    if (tab.dataset.tab === 'plan') loadPlan();
    if (tab.dataset.tab === 'progress') loadProgress();
  });
});

$('#logoutBtn').addEventListener('click', async () => {
  await fetch('/auth/logout', { method: 'POST' });
  window.location.href = '/auth/login';
});

// ============================================================ chat

const chatScroll = $('#chatScroll');
const chatForm = $('#chatForm');
const chatInput = $('#chatInput');
const sendBtn = $('#sendBtn');

let busy = false;

function scrollToBottom() {
  chatScroll.scrollTop = chatScroll.scrollHeight;
}

function addMessage(role, text) {
  $('#chatEmpty')?.remove();
  const wrap = el('div', `msg ${role}`);
  wrap.appendChild(el('div', 'bubble', text));
  chatScroll.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

/** Dong "bot dang lam gi" — hien ngay khi tool bat dau chay. */
function addTrace(trace, state) {
  const node = el('div', `trace ${state}`);
  const icon = state === 'blocked' ? '🚫' : state === 'pending' ? '⏳' : '🔧';
  node.innerHTML = `<span>${icon}</span><span><b>${escapeHtml(
    TOOL_LABELS[trace.tool] || trace.tool,
  )}</b>${trace.label ? ` — ${escapeHtml(trace.label)}` : ''}${
    trace.detail ? `<br><span style="opacity:.75">${escapeHtml(trace.detail)}</span>` : ''
  }${trace.link ? ` <a href="${trace.link}" target="_blank" rel="noopener">mở lịch ↗</a>` : ''}</span>`;
  chatScroll.appendChild(node);
  scrollToBottom();
  return node;
}

function addTyping() {
  const wrap = el('div', 'msg model');
  const dots = el('div', 'bubble typing');
  dots.innerHTML = '<span></span><span></span><span></span>';
  wrap.appendChild(dots);
  chatScroll.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = `${Math.min(chatInput.scrollHeight, 160)}px`;
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.requestSubmit();
  }
});

document.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip[data-send]');
  if (!chip) return;
  chatInput.value = chip.dataset.send;
  chatForm.requestSubmit();
});

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const message = chatInput.value.trim();
  if (!message || busy) return;

  busy = true;
  sendBtn.disabled = true;
  chatInput.value = '';
  chatInput.style.height = 'auto';
  addMessage('user', message);

  const typing = addTyping();
  let pendingTrace = null;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });

    if (res.status === 401) {
      window.location.href = '/auth/login';
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Lỗi ${res.status}`);
    }

    // Doc luong SSE: moi su kien la mot dong "data: {...}".
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';

      for (const chunk of chunks) {
        const line = chunk.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;

        let event;
        try {
          event = JSON.parse(line.slice(5).trim());
        } catch {
          continue;
        }

        if (event.type === 'running') {
          pendingTrace = addTrace({ tool: event.tool, label: 'đang thực hiện…' }, 'pending');
        } else if (event.type === 'action') {
          pendingTrace?.remove();
          pendingTrace = null;
          addTrace(event.trace, event.trace.allowed ? 'allowed' : 'blocked');
        } else if (event.type === 'reply') {
          typing.remove();
          addMessage('model', event.text);
        } else if (event.type === 'error') {
          typing.remove();
          addMessage('error', `⚠️ ${event.message}`);
        }
      }
    }
  } catch (err) {
    typing.remove();
    addMessage('error', `⚠️ ${err.message}`);
  } finally {
    pendingTrace?.remove();
    typing.remove();
    busy = false;
    sendBtn.disabled = false;
    chatInput.focus();
  }
});

// ============================================================ khoi tao

async function boot() {
  try {
    const me = await api('/api/me');
    $('#brandSub').textContent = `${me.email} · ${me.model}`;
  } catch {
    $('#brandSub').textContent = 'chưa đăng nhập';
    return;
  }

  const history = await api('/api/history').catch(() => []);
  if (history.length) {
    $('#chatEmpty')?.remove();
    for (const m of history) {
      if (m.role === 'model' && m.actions?.length) {
        for (const trace of m.actions) addTrace(trace, trace.allowed ? 'allowed' : 'blocked');
      }
      addMessage(m.role === 'model' ? 'model' : 'user', m.content);
    }
  }
  chatInput.focus();
}

// ============================================================ ke hoach

async function loadPlan() {
  const notice = $('#planNotice');
  notice.hidden = true;
  try {
    const plan = await api('/api/plan');
    $('#planEditor').value = JSON.stringify(plan, null, 2);
  } catch (err) {
    showNotice(notice, `Không tải được kế hoạch: ${err.message}`, 'bad');
  }
}

function showNotice(node, text, kind) {
  node.textContent = text;
  node.className = `notice ${kind}`;
  node.hidden = false;
}

$('#planReload').addEventListener('click', loadPlan);

$('#planSave').addEventListener('click', async () => {
  const notice = $('#planNotice');
  let parsed;
  try {
    parsed = JSON.parse($('#planEditor').value);
  } catch (err) {
    showNotice(notice, `JSON sai cú pháp: ${err.message}`, 'bad');
    return;
  }
  try {
    await api('/api/plan', { method: 'PUT', body: JSON.stringify(parsed) });
    showNotice(notice, 'Đã lưu kế hoạch. Bot sẽ dùng dữ liệu mới từ tin nhắn tiếp theo.', 'ok');
  } catch (err) {
    showNotice(notice, `Lưu thất bại: ${err.message}`, 'bad');
  }
});

// ============================================================ tien do

$('#daysSelect').addEventListener('change', loadProgress);

async function loadProgress() {
  const days = Number($('#daysSelect').value);
  $('#progressDays').textContent = days;

  const [data, reminders] = await Promise.all([
    api(`/api/progress?days=${days}`).catch(() => null),
    api('/api/reminders').catch(() => []),
  ]);
  if (!data) return;

  renderSummary(data.summary);
  renderEntries(data.entries);
  renderReminders(reminders);
}

function renderSummary(summary) {
  const host = $('#summaryCards');
  host.textContent = '';

  for (const s of summary) {
    const card = el('div', `card${s.canh_bao ? ' alert' : ''}`);
    card.appendChild(el('div', 'card-title', s.label));
    card.appendChild(el('div', 'card-target', s.chi_tieu_ngay ? `Chỉ tiêu ${s.chi_tieu_ngay}/ngày` : 'Chưa đặt chỉ tiêu'));

    const big = el('div', 'card-big');
    big.textContent = s.tong === null ? '—' : String(s.tong);
    const unit = el('small', null, s.don_vi ? `${s.don_vi} · ${s.so_ngay_dat}/${s.so_ngay_xet} ngày đạt` : '');
    big.appendChild(unit);
    card.appendChild(big);

    // Moi vach = mot ngay, moi nhat o ben phai.
    const bars = el('div', 'bars');
    for (const day of [...s.theo_ngay].reverse()) {
      const bar = el('i', day.dat ? 'hit' : 'miss');
      bar.title = `${day.ngay}: ${day.gia_tri}${s.don_vi ? ' ' + s.don_vi : ''}`;
      bars.appendChild(bar);
    }
    card.appendChild(bars);

    if (s.canh_bao) card.appendChild(el('div', 'card-warn', `⚠️ ${s.canh_bao}`));
    host.appendChild(card);
  }
}

function renderEntries(entries) {
  const host = $('#entriesList');
  host.textContent = '';
  if (!entries.length) {
    host.appendChild(el('div', 'list-empty', 'Chưa có bản ghi nào. Hãy nhắn cho bot hoặc dùng ô "Ghi nhanh" ở trên.'));
    return;
  }
  for (const e of entries.slice(0, 50)) {
    const row = el('div', 'list-item');
    const left = el('div');
    left.textContent = `${AREA_LABELS[e.area] || e.area}: ${e.value} ${e.unit}`;
    if (e.note) left.appendChild(el('div', 'meta', e.note));
    row.appendChild(left);
    row.appendChild(el('div', 'meta', e.log_date));
    host.appendChild(row);
  }
}

function renderReminders(reminders) {
  const host = $('#remindersList');
  host.textContent = '';
  if (!reminders.length) {
    host.appendChild(el('div', 'list-empty', 'Chưa đặt nhắc nhở nào.'));
    return;
  }
  for (const r of reminders) {
    const row = el('div', 'list-item');
    const left = el('div');
    left.textContent = r.title;
    left.appendChild(el('div', 'meta', `${r.due_local} · ${r.channel}${r.recurrence ? ' · lặp ' + r.recurrence : ''}`));
    row.appendChild(left);

    const right = el('div');
    right.style.display = 'flex';
    right.style.gap = '8px';
    right.style.alignItems = 'center';
    if (r.calendar_link) {
      const link = el('a', 'meta', 'lịch ↗');
      link.href = r.calendar_link;
      link.target = '_blank';
      link.rel = 'noopener';
      right.appendChild(link);
    }
    right.appendChild(el('span', `badge ${r.status}`, r.status));
    row.appendChild(right);
    host.appendChild(row);
  }
}

$('#quickLog').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const notice = $('#logNotice');
  try {
    await api('/api/progress', {
      method: 'POST',
      body: JSON.stringify({
        area: form.get('area'),
        value: Number(form.get('value')),
        unit: form.get('unit'),
        date: form.get('date') || undefined,
      }),
    });
    e.target.reset();
    showNotice(notice, 'Đã ghi.', 'ok');
    loadProgress();
  } catch (err) {
    showNotice(notice, `Ghi thất bại: ${err.message}`, 'bad');
  }
});

boot();
