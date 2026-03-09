// ─── Constantes ───────────────────────────────────────────────────────────────

const STORAGE_KEYS = {
  THEME: 'donezo_theme',
  DB: 'donezo_db',
};

const SYNC_STATES = {
  SYNCING: 'syncing',
  SYNCED: 'synced',
  OFFLINE: 'offline',
};

const SYNC_UI_CONFIG = {
  [SYNC_STATES.SYNCING]: { icon: '🔄', text: 'Sincronizando...' },
  [SYNC_STATES.SYNCED]:  { icon: '☁️', text: 'Nuvem Atualizada' },
  [SYNC_STATES.OFFLINE]: { icon: '☁️', text: 'Offline' },
};

const SYNC_DELAY_MS = 600;

// ─── Utilitários ──────────────────────────────────────────────────────────────

function getElement(id) {
  return document.getElementById(id);
}

function safeCall(fn, ...args) {
  if (typeof fn === 'function') fn(...args);
}

// ─── Tema ─────────────────────────────────────────────────────────────────────

function loadTheme() {
  const theme = localStorage.getItem(STORAGE_KEYS.THEME) || 'light';
  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEYS.THEME, theme);
  updateThemeUI(theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

function updateThemeUI(theme) {
  const icon = getElement('theme-icon');
  if (icon) icon.innerText = theme === 'dark' ? '☀️' : '🌙';
}

// ─── Banco de Dados Local ──────────────────────────────────────────────────────

function loadLocalDB() {
  const raw = localStorage.getItem(STORAGE_KEYS.DB);
  if (raw) {
    try {
      db = JSON.parse(raw);
    } catch {
      console.warn('Falha ao parsear donezo_db do localStorage.');
    }
  }
}

function persistLocalDB() {
  localStorage.setItem(STORAGE_KEYS.DB, JSON.stringify(db));
}

// ─── Sincronização ────────────────────────────────────────────────────────────

function updateSyncUI(status) {
  const indicator = getElement('sync-indicator');
  if (!indicator) return;

  const config = SYNC_UI_CONFIG[status] ?? SYNC_UI_CONFIG[SYNC_STATES.OFFLINE];
  indicator.className = `sync-status ${status}`;
  getElement('sync-icon').innerText = config.icon;
  getElement('sync-text').innerText = config.text;
}

async function fetchRemoteDB() {
  updateSyncUI(SYNC_STATES.SYNCING);
  try {
    const { data } = await supabaseClient
      .from('user_progress')
      .select('data_json')
      .single();

    if (data?.data_json) {
      db = data.data_json;
      persistLocalDB();
    }
    updateSyncUI(SYNC_STATES.SYNCED);
  } catch {
    updateSyncUI(SYNC_STATES.OFFLINE);
  }
}

async function saveDB() {
  persistLocalDB();
  safeCall(updateDashboard);

  if (!currentSession) return;

  updateSyncUI(SYNC_STATES.SYNCING);
  const { error } = await supabaseClient.from('user_progress').upsert({
    id: currentSession.user.id,
    data_json: db,
    updated_at: new Date(),
  });

  if (error) {
    updateSyncUI(SYNC_STATES.OFFLINE);
  } else {
    setTimeout(() => updateSyncUI(SYNC_STATES.SYNCED), SYNC_DELAY_MS);
  }
}

// ─── Autenticação ─────────────────────────────────────────────────────────────

async function handleAuth() {
  const email    = getElement('auth-email').value;
  const password = getElement('auth-password').value;

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    alert(error.message);
    return;
  }
  location.reload();
}

function toggleAuthModal() {
  getElement('auth-modal').classList.toggle('active');
}

function openAuthModal() {
  getElement('auth-modal').classList.remove('hidden');
}

// ─── Navegação ────────────────────────────────────────────────────────────────

function highlightActiveMenu() {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.menu-item').forEach(item => {
    if (item.getAttribute('href')?.includes(page)) {
      item.classList.add('active');
    }
  });
}

// ─── Inicialização ────────────────────────────────────────────────────────────

async function initializeApp() {
  loadTheme();
  loadLocalDB();

  const { data } = await supabaseClient.auth.getSession();
  currentSession = data.session;

  if (currentSession) {
    await fetchRemoteDB();
    safeCall(carregarMateriasDisponiveis);
  } else {
    updateSyncUI(SYNC_STATES.OFFLINE);
    openAuthModal();
  }

  safeCall(updateDashboard);
  highlightActiveMenu();
}

window.addEventListener('load', initializeApp);