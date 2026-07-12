
const SUPABASE_URL = "https://xufbpsdtzrjnwvkpalbu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1ZmJwc2R0enJqbnd2a3BhbGJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzODc2NzIsImV4cCI6MjA5ODk2MzY3Mn0.X1EnpBZxrDdFRz6tRxpmOJIyTAEiOXZGG-NHIqTC5p0";
const EDGE_FUNCTION_URL = "https://xufbpsdtzrjnwvkpalbu.supabase.co/functions/v1/chat-deputy";

const OWNER_UID = "29b257e4-5ea6-4bb8-9920-fb8c222e6bd9";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;
let systemFrozen = false;
let storedAPIs = [];
let currentMissionDraft = null;
let authToken = null;
let queueDataById = {};

const PREVIEW_BASE_FILES = {
  site: 'https://dazm86.github.io/aegis/site-staging/index.html',
  dashboard: 'https://dazm86.github.io/aegis/web-staging/dashboard.html'
};

async function previewCode(id) {
  const item = queueDataById[id];
  if (!item) return;

  const modal = document.getElementById('preview-modal');
  const iframe = document.getElementById('preview-iframe');
  const label = document.getElementById('preview-target-label');
  label.textContent = item.target === 'dashboard' ? 'پنل مدیریت (staging)' : 'سایت اصلی (staging)';
  iframe.srcdoc = '<p style="font-family:sans-serif;padding:20px;color:#888;">در حال بارگیری پیش‌نمایش...</p>';
  modal.style.display = 'flex';

  try {
    const baseUrl = PREVIEW_BASE_FILES[item.target] || PREVIEW_BASE_FILES.site;
    const res = await fetch(baseUrl, { cache: 'no-store' });
    const baseHtml = await res.text();
    const marker = '<!-- AEGIS_INSERT_POINT -->';
    const block = `\n<!-- PREVIEW: pending mission code -->\n${item.code}\n${marker}`;
    const previewHtml = baseHtml.includes(marker)
      ? baseHtml.replace(marker, block)
      : baseHtml + item.code;
    iframe.srcdoc = previewHtml;
  } catch (err) {
    iframe.srcdoc = `<p style="font-family:sans-serif;padding:20px;color:red;">خطا در بارگیری پیش‌نمایش: ${err.message}</p>`;
  }
}

function closePreview() {
  document.getElementById('preview-modal').style.display = 'none';
  document.getElementById('preview-iframe').srcdoc = '';
}

// ---- Notifications (in-dashboard only; does not send email/SMS) ----
function getLastSeenTime() {
  return localStorage.getItem('aegis_last_seen') || '1970-01-01T00:00:00Z';
}

function markSeen() {
  localStorage.setItem('aegis_last_seen', new Date().toISOString());
  document.getElementById('notif-badge').textContent = '';
}

function updateNotifBadge(decisions) {
  if (!decisions) return;
  const lastSeen = getLastSeenTime();
  const unreadCount = decisions.filter(d => d.created_at && d.created_at > lastSeen).length;
  const badge = document.getElementById('notif-badge');
  badge.textContent = unreadCount > 0 ? unreadCount : '';
}

// ---- Auth (real login, owner only) ----
async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session && session.user?.id === OWNER_UID) {
    authToken = session.access_token;
    currentUser = session.user;
    showApp();
    return;
  }
  showLoginGate();
}

function showLoginGate() {
  document.body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;">
      <div class="panel" style="max-width:360px;width:100%;">
        <h2>🔒 ورود مدیر سیستم</h2>
        <div class="form-row">
          <label>ایمیل</label>
          <input id="login-email" type="email" placeholder="you@example.com" />
        </div>
        <div class="form-row">
          <label>رمز عبور</label>
          <input id="login-password" type="password" placeholder="••••••••" onkeydown="if(event.key==='Enter')doLogin()" />
        </div>
        <div id="login-error" style="color:var(--red);font-size:12px;margin-bottom:10px;"></div>
        <button class="btn primary" onclick="doLogin()" style="width:100%;">ورود</button>
      </div>
    </div>
  `;
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorDiv = document.getElementById('login-error');
  errorDiv.textContent = '';

  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    errorDiv.textContent = 'خطا: ' + error.message;
    return;
  }

  if (data.user?.id !== OWNER_UID) {
    errorDiv.textContent = 'این حساب اجازه‌ی دسترسی به این پنل را ندارد.';
    await sb.auth.signOut();
    return;
  }

  authToken = data.session.access_token;
  currentUser = data.user;
  location.reload();
}

async function doLogout() {
  await sb.auth.signOut();
  location.reload();
}

function showApp() {
  loadFreezeState();
  loadAPIs();
  loadQueue();
  loadMissions();
}

async function getFreshToken() {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.access_token) {
    authToken = session.access_token;
  }
  return authToken;
}

// ---- Tab Navigation ----
function showTab(tabName, btnEl) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(tabName + '-tab').classList.add('active');
  if (btnEl) btnEl.classList.add('active');
}

// ---- Freeze System ----
async function loadFreezeState() {
  const { data } = await sb.from('system_state').select('value').eq('key', 'frozen').maybeSingle();
  systemFrozen = data?.value === true;
  applyFreezeUI();
}

function applyFreezeUI() {
  document.body.classList.toggle('frozen', systemFrozen);
  const btn = document.getElementById('freeze-btn');
  btn.textContent = systemFrozen ? '🔓 باز کردن سیستم' : 'توقف سیستم';
  const indicator = document.getElementById('status-indicator');
  indicator.textContent = systemFrozen ? '🔴 متوقف' : '🟢 فعال';
}

async function toggleFreeze() {
  const newValue = !systemFrozen;
  const { error } = await sb.from('system_state').update({ value: newValue }).eq('key', 'frozen');
  if (error) {
    alert('خطا در تغییر وضعیت: ' + error.message);
    return;
  }
  systemFrozen = newValue;
  applyFreezeUI();
}

// ---- Trigger immediate heartbeat run via GitHub Actions ----
async function triggerHeartbeat() {
  if (!confirm('اجرای فوری شورا رو شروع کنم؟')) return;
  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await getFreshToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 'trigger_heartbeat' })
    });
    const data = await response.json();
    if (response.ok && data.success) {
      alert('✅ دستور اجرا با موفقیت به گیت‌هاب ارسال شد. چرخه سیستم آغاز شد!');
    } else {
      alert('❌ خطا در اجرا: ' + (data.error || 'خطای ناشناخته'));
    }
  } catch (err) {
    alert('❌ خطای ارتباطی: ' + err.message);
  }
}

// ---- Deputy Chat ----
async function sendMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;

  input.value = '';

  const messagesDiv = document.getElementById('chat-messages');
  const userMsg = document.createElement('div');
  userMsg.className = 'message user';
  userMsg.textContent = message;
  messagesDiv.appendChild(userMsg);

  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await getFreshToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 'chat_deputy', message })
    });

    if (!response.ok) {
      let bodyText = '';
      try { bodyText = await response.text(); } catch {}
      throw new Error(`کد ${response.status} - ${bodyText || 'بدون جزئیات'}`);
    }

    const data = await response.json();
    currentMissionDraft = data;

    const deputyMsg = document.createElement('div');
    deputyMsg.className = 'message deputy';
    deputyMsg.innerHTML = `<strong>${escapeHtml(data.suggestedTitle || '')}</strong><br/>${escapeHtml(data.understanding || '')}`;
    messagesDiv.appendChild(deputyMsg);

    if (data.needsClarification) {
      const clarifyMsg = document.createElement('div');
      clarifyMsg.className = 'message deputy';
      clarifyMsg.textContent = `❓ ${data.clarifyingQuestion || ''}`;
      messagesDiv.appendChild(clarifyMsg);
    }

    const confirmDiv = document.getElementById('mission-confirmation');
    confirmDiv.innerHTML = `
      <div class="card">
        <div class="card-title">${escapeHtml(data.suggestedTitle || '')}</div>
        <div>${escapeHtml(data.suggestedDescription || '')}</div>
      </div>
    `;

    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  } catch (err) {
    const errMsg = document.createElement('div');
    errMsg.className = 'message deputy';
    errMsg.textContent = '❌ خطا: ' + err.message;
    messagesDiv.appendChild(errMsg);
  }
}

async function createMission() {
  if (!currentMissionDraft) {
    alert('ابتدا با معاون صحبت کنید');
    return;
  }

  const target = document.getElementById('mission-target').value;

  const { error } = await sb.from('missions').insert({
    title: currentMissionDraft.suggestedTitle,
    description: currentMissionDraft.suggestedDescription,
    target: target
  });

  if (error) {
    alert('خطا: ' + error.message);
  } else {
    alert('✅ ماموریت ایجاد شد');
    currentMissionDraft = null;
    document.getElementById('mission-confirmation').innerHTML = '<p class="loading">منتظر پیشنهاد...</p>';
    loadMissions();
  }
}

// ---- APIs Management (real, stored securely via Edge Function) ----
async function addAPI() {
  const name = document.getElementById('api-name').value.trim();
  const provider = document.getElementById('api-provider').value.trim();
  const url = document.getElementById('api-url').value.trim();
  const model = document.getElementById('api-model').value.trim();
  const key = document.getElementById('api-key').value.trim();

  if (!name || !provider || !key) {
    alert('نام، provider و API Key الزامی هستند');
    return;
  }

  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await getFreshToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'save_api_key',
        name, provider, base_url: url, model, api_key: key, purpose: 'text'
      })
    });
    const data = await response.json();
    if (data.success) {
      document.getElementById('api-name').value = '';
      document.getElementById('api-provider').value = '';
      document.getElementById('api-url').value = '';
      document.getElementById('api-model').value = '';
      document.getElementById('api-key').value = '';
      alert('✅ کلید با موفقیت و امن ذخیره شد');
      loadAPIs();
    } else {
      alert('❌ خطا: ' + (data.error || 'نامشخص'));
    }
  } catch (err) {
    alert('❌ خطای ارتباطی: ' + err.message);
  }
}

async function removeAPI(id) {
  if (!confirm('این کلید حذف بشه؟')) return;
  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await getFreshToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 'delete_api_key', id })
    });
    const data = await response.json();
    if (data.success) {
      loadAPIs();
    } else {
      alert('❌ خطا: ' + (data.error || 'نامشخص'));
    }
  } catch (err) {
    alert('❌ خطای ارتباطی: ' + err.message);
  }
}

async function loadAPIs() {
  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await getFreshToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 'list_api_keys' })
    });
    const data = await response.json();
    storedAPIs = data.keys || [];
    renderAPIs();
  } catch (err) {
    console.error('loadAPIs failed:', err.message);
  }
}

function renderAPIs() {
  const list = document.getElementById('api-list');
  list.innerHTML = storedAPIs.map((api) => `
    <div class="api-item">
      <div>
        <strong>${escapeHtml(api.name)}</strong> (${escapeHtml(api.provider)}${api.model ? ' / ' + escapeHtml(api.model) : ''})<br/>
        <span style="font-size:11px;color:var(--muted);">کلید: ${escapeHtml(api.masked_key)}</span>
      </div>
      <button onclick="removeAPI(${api.id})">حذف</button>
    </div>
  `).join('') || '<p class="loading">هیچ کلیدی اضافه نشده — از Groq پیش‌فرض استفاده می‌شه</p>';
}

// ---- Review Queue ----
async function loadQueue() {
  const { data, error } = await sb
    .from('content_queue')
    .select('*')
    .order('created_at', { ascending: false });

  const list = document.getElementById('queue-list');
  if (error || !data?.length) {
    list.innerHTML = '<p class="loading">صف خالی است</p>';
    return;
  }

  queueDataById = {};

  list.innerHTML = data.map(item => {
    let parsed = {};
    try { parsed = JSON.parse(item.content); } catch {}

    queueDataById[item.id] = { code: parsed.code || '', target: item.target || 'site' };

    return `
      <div class="card">
        <div class="card-title">${escapeHtml(parsed.missionTitle || item.content_type)}</div>
        <div class="card-meta">
          <span class="badge ${item.status}">${item.status}</span>
          اطمینان: ${escapeHtml(parsed.confidence || '؟')}
        </div>
        <p>${escapeHtml(parsed.explanation || '')}</p>
        ${item.status === 'pending_review' ? `
          <div class="code-view">${escapeHtml(parsed.code || '')}</div>
          <div class="actions">
            <button class="approve" onclick="previewCode(${item.id})">پیش‌نمایش زنده</button>
            <button class="approve" onclick="approveCode(${item.id})">تأیید ✓</button>
            <button class="reject" onclick="rejectCode(${item.id})">رد ✗</button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

async function approveCode(id) {
  const { error } = await sb
    .from('content_queue')
    .update({ status: 'approved', reviewed_at: new Date().toISOString() })
    .eq('id', id);

  if (!error) {
    alert('✅ تأیید شد');
    loadQueue();
  } else {
    alert('خطا: ' + error.message);
  }
}

async function rejectCode(id) {
  const { error } = await sb
    .from('content_queue')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
    .eq('id', id);

  if (!error) {
    alert('✅ رد شد');
    loadQueue();
  } else {
    alert('خطا: ' + error.message);
  }
}

// ---- Mission actions ----
async function deleteMission(id) {
  if (!confirm('مطمئنی می‌خوای این ماموریت رو کامل حذف کنی؟')) return;
  const { error } = await sb.from('missions').delete().eq('id', id);
  if (error) { alert('خطا: ' + error.message); return; }
  loadMissions();
}

async function suspendMission(id) {
  const { error } = await sb.from('missions').update({ status: 'suspended' }).eq('id', id);
  if (error) { alert('خطا: ' + error.message); return; }
  loadMissions();
}

async function resumeMission(id) {
  const { error } = await sb.from('missions').update({ status: 'pending' }).eq('id', id);
  if (error) { alert('خطا: ' + error.message); return; }
  loadMissions();
}

async function ownerOverride(id) {
  if (!confirm('این ماموریت بدون بررسی کامل شورا، فقط با بررسی ایمنی اجرا می‌شه. مطمئنی؟')) return;
  const { error } = await sb.from('missions').update({ status: 'owner_override' }).eq('id', id);
  if (error) { alert('خطا: ' + error.message); return; }
  alert('✅ ثبت شد. دفعه‌ی بعد که شورا اجرا بشه، فقط بررسی ایمنی انجام می‌ده.');
  loadMissions();
}

async function changePriority(id, newPriority) {
  const { error } = await sb.from('missions').update({ priority: newPriority }).eq('id', id);
  if (error) { alert('خطا: ' + error.message); return; }
  loadMissions();
}

// ---- Missions & Docket ----
async function loadMissions() {
  const { data: missions, error: mErr } = await sb.from('missions').select('*').order('created_at', { ascending: false });
  const { data: decisions, error: dErr } = await sb.from('decisions').select('*');
  const { data: verdicts } = await sb.from('council_decisions').select('*');

  updateNotifBadge(decisions);

  const mList = document.getElementById('missions-list');
  if (!missions?.length) {
    mList.innerHTML = '<p class="loading">هیچ ماموریتی ثبت نشده</p>';
  } else {
    mList.innerHTML = missions.map(m => {
      const dec = decisions?.find(d => d.mission_id === m.id);
      const vList = verdicts?.filter(v => v.mission_id === m.id) || [];

      return `
        <div class="card">
          <div class="card-title">${escapeHtml(m.title)}</div>
          <span class="badge ${m.status}">${m.status}</span>
          ${m.target === 'dashboard' ? `<span class="badge" style="background:rgba(199,82,75,0.15);color:var(--red);">هدف: داشبورد</span>` : ''}
          ${m.source === 'ai_generated' ? `<span class="badge" style="background:rgba(63,167,150,0.25);color:var(--green);">🧠 ایده‌ی خودکار</span>` : ''}
          ${dec ? `<span class="badge" style="background:rgba(232,163,61,0.2);color:var(--amber);">امتیاز: ${dec.average_score}</span>` : ''}
          ${m.priority ? `<span class="badge" style="background:rgba(63,167,150,0.2);color:var(--green);">اولویت: ${m.priority}</span>` : ''}
          <p style="margin-top:6px;font-size:13px;">${escapeHtml(m.description)}</p>
          ${vList.length ? `<details><summary>نظرات شورا (${vList.length})</summary><div style="margin-top:6px;font-size:12px;color:var(--muted);">${vList.map(v => `${escapeHtml(v.role_id)}: ${escapeHtml(v.response || '')}`).join('<br/>')}</div></details>` : ''}
          <div class="actions">
            ${m.status === 'pending' ? `
              <button class="approve" onclick="changePriority(${m.id}, ${(m.priority || 0) + 1})">اولویت ▲</button>
              <button class="reject" onclick="changePriority(${m.id}, ${(m.priority || 0) - 1})">اولویت ▼</button>
            ` : ''}
            ${m.status === 'suspended'
              ? `<button class="approve" onclick="resumeMission(${m.id})">فعال‌سازی مجدد</button>`
              : `<button class="reject" onclick="suspendMission(${m.id})">تعلیق</button>`}
            <button class="reject" onclick="deleteMission(${m.id})">حذف</button>
            ${m.status === 'rejected'
              ? `<button class="approve" onclick="ownerOverride(${m.id})">⚡ دستور مدیر</button>`
              : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  const dList = document.getElementById('decisions-list');
  if (!decisions?.length) {
    dList.innerHTML = '<p class="loading">هیچ تصمیمی اتخاذ نشده</p>';
  } else {
    dList.innerHTML = decisions.map(d => `
      <div class="card">
        <div class="card-title">ماموریت #${d.mission_id}</div>
        <span class="badge ${d.approved ? 'approved' : 'rejected'}">${d.approved ? '✅ تأیید' : '❌ رد'}</span>
        <div style="font-size:12px;margin-top:6px;">امتیاز: ${d.average_score} / ${d.threshold}</div>
        ${d.reasoning ? `<div style="font-size:12px;margin-top:4px;color:var(--muted);">${escapeHtml(d.reasoning)}</div>` : ''}
      </div>
    `).join('');
  }
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Init
initAuth();
setInterval(() => { loadQueue(); loadMissions(); }, 30000);
