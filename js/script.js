/* ═══════════════════════════════════════════════════════════════════
   DIPLOMATIQUE — supabase-config.js (Refatorado)
   ═══════════════════════════════════════════════════════════════════ */

/* ─── 1. CONFIGURAÇÃO SUPABASE ───────────────────────────────────── */
const SUPABASE_URL = 'https://ozhtjngfedtslwgeafyv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_nP-XLqixj7YPWh1AoDFfAQ_JHQSlRF-';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ─── 2. ESTADO GLOBAL ───────────────────────────────────────────── */
let db = { total_questoes: 0, acertos: 0, flashcards: 0, xp: 0, materias: {}, simuladoAtivo: null };
let currentSession      = null;
let acertosSimulado     = 0;
let errosSimulado       = 0;
let questoesAtuais      = [];
let idQuestaoSendoEditada = null;
let timerInterval  = null;
let secondsElapsed = 0;

function resetTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    secondsElapsed = 0;
    updateTimerDisplay();
    if (UI.btnTimer) UI.btnTimer.innerText = 'Iniciar';
}

/* ─── 3. INICIALIZAÇÃO ───────────────────────────────────────────── */
window.addEventListener('load', initializeApp);

async function initializeApp() {
    // Tema salvo
    const savedTheme = localStorage.getItem('donezo_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeUI(savedTheme);

    // Dados locais
    const localData = localStorage.getItem('donezo_db');
    if (localData) db = JSON.parse(localData);

    // Sessão
    const { data } = await supabaseClient.auth.getSession();
    currentSession = data.session;

    if (currentSession) {
        await fetchRemoteDB();
        // carregarMateriasDisponiveis vive em questoes.js (só existe nessa página)
        if (typeof carregarMateriasDisponiveis === 'function') {
            await carregarMateriasDisponiveis();
        }
    } else {
        updateSyncUI('offline');
        openAuthModal();
    }

    // updateDashboard vive em charts.js
    if (typeof updateDashboard === 'function') updateDashboard();

    highlightActiveMenu();
}

/* ─── 4. SINCRONIZAÇÃO COM SUPABASE ──────────────────────────────── */
function updateSyncUI(status) {
    const indicator = document.getElementById('sync-indicator');
    if (!indicator) return;

    const icon = document.getElementById('sync-icon');
    const text = document.getElementById('sync-text');

    const states = {
        syncing: { icon: '🔄', text: 'Sincronizando...' },
        synced:  { icon: '☁️', text: 'Nuvem Atualizada' },
        offline: { icon: '☁️', text: 'Offline' },
    };
    const state = states[status] || states.offline;

    indicator.className = `sync-status ${status}`;
    if (icon) icon.innerText = state.icon;
    if (text) text.innerText = state.text;
}

async function saveDB() {
    localStorage.setItem('donezo_db', JSON.stringify(db));

    if (typeof updateDashboard === 'function') updateDashboard();
    if (!currentSession) return;

    updateSyncUI('syncing');
    const { error } = await supabaseClient
        .from('user_progress')
        .upsert({ id: currentSession.user.id, data_json: db, updated_at: new Date() });

    if (!error) setTimeout(() => updateSyncUI('synced'), 600);
    else updateSyncUI('offline');
}

async function fetchRemoteDB() {
    updateSyncUI('syncing');
    try {
        const { data } = await supabaseClient
            .from('user_progress')
            .select('data_json')
            .single();

        if (data?.data_json) {
            db = data.data_json;
            localStorage.setItem('donezo_db', JSON.stringify(db));
        }
        updateSyncUI('synced');
        if (typeof updateDashboard === 'function') updateDashboard();
    } catch {
        updateSyncUI('offline');
    }
}

/* ─── 5. AUTENTICAÇÃO ────────────────────────────────────────────── */
function openAuthModal()  { document.getElementById('auth-modal')?.classList.add('active'); }
function closeAuthModal() { document.getElementById('auth-modal')?.classList.remove('active'); }
function toggleAuthModal() { document.getElementById('auth-modal')?.classList.toggle('active'); }

let _authModeIsRegister = false;
function toggleAuthMode() {
    _authModeIsRegister = !_authModeIsRegister;
    const title      = document.getElementById('auth-title');
    const toggleText = document.getElementById('auth-toggle-text');
    if (title)      title.innerText      = _authModeIsRegister ? 'Criar Conta' : 'Entrar na Nuvem';
    if (toggleText) toggleText.innerText = _authModeIsRegister ? 'Já tem conta? Entrar' : 'Não tem conta? Cadastre-se';
}

async function handleAuth() {
    const email    = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;

    const fn = _authModeIsRegister
        ? supabaseClient.auth.signUp({ email, password })
        : supabaseClient.auth.signInWithPassword({ email, password });

    const { error } = await fn;
    if (error) return alert(error.message);
    location.reload();
}

/* ─── 6. TEMA ────────────────────────────────────────────────────── */
function toggleTheme() {
    const html  = document.documentElement;
    const theme = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', theme);
    localStorage.setItem('donezo_theme', theme);
    updateThemeUI(theme);
}

function updateThemeUI(theme) {
    const icon = document.getElementById('theme-icon');
    const text = document.getElementById('theme-text');
    if (icon) icon.innerText = theme === 'dark' ? '☀️' : '🌙';
    if (text) text.innerText = theme === 'dark' ? 'Modo Claro' : 'Modo Escuro';
}

/* ─── 7. MENU ATIVO ──────────────────────────────────────────────── */
function highlightActiveMenu() {
    const page = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.menu-item').forEach(item => {
        if (item.getAttribute('href')?.includes(page)) item.classList.add('active');
    });
}

/* ─── 8. MENU HAMBÚRGUER MOBILE ──────────────────────────────────── */
/* ─── 8. MENU HAMBÚRGUER MOBILE ──────────────────────────────────── */
function _abrirMenuMobile(sidebar, overlay) {
    sidebar.classList.add('active');
    overlay.classList.add('active');
    overlay.style.display = 'block';
}

function _fecharMenuMobile(sidebar, overlay) {
    sidebar.classList.remove('active');
    overlay.classList.remove('active');
    overlay.style.display = 'none';
}

// Exposta globalmente para o onclick="" do HTML
function toggleMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    if (!sidebar || !overlay) return;

    sidebar.classList.contains('active')
        ? _fecharMenuMobile(sidebar, overlay)
        : _abrirMenuMobile(sidebar, overlay);
}

document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');

    if (overlay) {
        overlay.addEventListener('click', () => _fecharMenuMobile(sidebar, overlay));
    }

    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 768) _fecharMenuMobile(sidebar, overlay);
        });
    });
});