/* ═══════════════════════════════════════════════════════════════════
   DIPLOMATIQUE — supabase-config.js (v2)
   ═══════════════════════════════════════════════════════════════════ */

/* ─── 1. CONFIGURAÇÃO SUPABASE ───────────────────────────────────── */
const SUPABASE_URL = 'https://ozhtjngfedtslwgeafyv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_nP-XLqixj7YPWh1AoDFfAQ_JHQSlRF-';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ─── 2. ESTADO GLOBAL ───────────────────────────────────────────── */
let db = { total_questoes: 0, acertos: 0, flashcards: 0, xp: 0, materias: {}, simuladoAtivo: null };
let currentSession        = null;
let acertosSimulado       = 0;
let errosSimulado         = 0;
let questoesAtuais        = [];
let idQuestaoSendoEditada = null;
let timerInterval         = null;
let secondsElapsed        = 0;

// UI e updateTimerDisplay vivem em questoes.js (só existem nessa página)
function resetTimer() {
    clearInterval(timerInterval);
    timerInterval  = null;
    secondsElapsed = 0;
    if (typeof updateTimerDisplay === 'function') updateTimerDisplay();
    if (typeof UI !== 'undefined' && UI.btnTimer) UI.btnTimer.innerText = 'Iniciar';
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
    if (localData) {
        try { db = JSON.parse(localData); }
        catch { localStorage.removeItem('donezo_db'); }   // dado corrompido não trava o app
    }

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
        syncing: { icon: '🔄', text: 'Sincronizando…' },
        synced:  { icon: '☁️', text: 'Nuvem atualizada' },
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
        .upsert({
            id: currentSession.user.id,
            data_json: db,
            updated_at: new Date().toISOString(),
        });

    if (!error) setTimeout(() => updateSyncUI('synced'), 600);
    else updateSyncUI('offline');
}

async function fetchRemoteDB() {
    updateSyncUI('syncing');
    try {
        // maybeSingle: usuário novo (sem registro ainda) não gera erro
        const { data, error } = await supabaseClient
            .from('user_progress')
            .select('data_json')
            .eq('id', currentSession.user.id)
            .maybeSingle();

        if (error) throw error;

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
function openAuthModal()   { document.getElementById('auth-modal')?.classList.add('active'); }
function closeAuthModal()  { document.getElementById('auth-modal')?.classList.remove('active'); }
function toggleAuthModal() { document.getElementById('auth-modal')?.classList.toggle('active'); }

// Mensagem inline no lugar de alert() (estilo .auth-error no CSS)
function showAuthMessage(message, type = 'error') {
    let box = document.getElementById('auth-error');
    if (!box) {
        box = document.createElement('p');
        box.id = 'auth-error';
        box.setAttribute('role', 'alert');
        document.querySelector('#auth-modal .auth-fields')?.insertAdjacentElement('afterend', box);
    }
    box.textContent = message;
    box.className = `auth-error visible${type === 'info' ? ' info' : ''}`;
}

function clearAuthMessage() {
    const box = document.getElementById('auth-error');
    if (box) box.className = 'auth-error';
}

function traduzirErroAuth(message = '') {
    const m = message.toLowerCase();
    if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
    if (m.includes('already registered'))        return 'Este e-mail já tem cadastro. Tente entrar.';
    if (m.includes('password should be'))        return 'A senha precisa ter pelo menos 6 caracteres.';
    if (m.includes('email not confirmed'))       return 'Confirme seu e-mail antes de entrar.';
    if (m.includes('rate limit'))                return 'Muitas tentativas. Aguarde um instante.';
    return message || 'Não foi possível concluir. Tente novamente.';
}

let _authModeIsRegister = false;
function toggleAuthMode() {
    _authModeIsRegister = !_authModeIsRegister;

    const title      = document.getElementById('auth-title');
    const toggleText = document.getElementById('auth-toggle-text');
    const mainBtn    = document.getElementById('auth-btn-main');
    const password   = document.getElementById('auth-password');

    if (title)      title.innerText      = _authModeIsRegister ? 'Criar conta' : 'Entrar na nuvem';
    if (toggleText) toggleText.innerText = _authModeIsRegister ? 'Já tem conta? Entrar' : 'Não tem conta? Cadastre-se';
    if (mainBtn)    mainBtn.innerText    = _authModeIsRegister ? 'Criar conta' : 'Entrar';
    if (password)   password.autocomplete = _authModeIsRegister ? 'new-password' : 'current-password';

    clearAuthMessage();
}

async function handleAuth() {
    const email    = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const btn      = document.getElementById('auth-btn-main');

    if (!email || !password) return showAuthMessage('Preencha e-mail e senha.');

    clearAuthMessage();
    btn.disabled = true;

    try {
        const { data, error } = _authModeIsRegister
            ? await supabaseClient.auth.signUp({ email, password })
            : await supabaseClient.auth.signInWithPassword({ email, password });

        if (error) return showAuthMessage(traduzirErroAuth(error.message));

        // Cadastro com confirmação por e-mail: ainda não há sessão
        if (_authModeIsRegister && !data.session) {
            return showAuthMessage('Conta criada. Confirme seu e-mail para entrar.', 'info');
        }
        location.reload();
    } catch {
        showAuthMessage('Sem conexão. Verifique sua internet e tente de novo.');
    } finally {
        btn.disabled = false;
    }
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
    if (text) text.innerText = theme === 'dark' ? 'Modo claro' : 'Modo escuro';
}

/* ─── 7. MENU ATIVO ──────────────────────────────────────────────── */
function highlightActiveMenu() {
    const page = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.menu-item').forEach(item => {
        if (item.getAttribute('href')?.includes(page)) {
            item.classList.add('active');
            item.setAttribute('aria-current', 'page');
        }
    });
}

/* ─── 8. MENU HAMBÚRGUER MOBILE ──────────────────────────────────── */
function _setMenuExpanded(expanded) {
    document.querySelector('.mobile-menu-toggle')?.setAttribute('aria-expanded', String(expanded));
}

function _abrirMenuMobile(sidebar, overlay) {
    sidebar.classList.add('active');
    overlay.classList.add('active');
    overlay.style.display = 'block';
    _setMenuExpanded(true);
}

function _fecharMenuMobile(sidebar, overlay) {
    sidebar.classList.remove('active');
    overlay.classList.remove('active');
    overlay.style.display = 'none';
    _setMenuExpanded(false);
}

// Exposta globalmente para o onclick="" do HTML (botão e overlay)
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

    // Fecha o menu ao escolher um item (somente no mobile)
    if (sidebar && overlay) {
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', () => {
                if (window.innerWidth <= 768) _fecharMenuMobile(sidebar, overlay);
            });
        });

        // Esc fecha o menu
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && sidebar.classList.contains('active')) {
                _fecharMenuMobile(sidebar, overlay);
            }
        });
    }

    // Enter envia o formulário de login
    ['auth-email', 'auth-password'].forEach(id => {
        document.getElementById(id)?.addEventListener('keydown', e => {
            if (e.key === 'Enter') handleAuth();
        });
    });
});
