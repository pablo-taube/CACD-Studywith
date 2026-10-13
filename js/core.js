/* ═══════════════════════════════════════════════════════════════════
   DIPLOMATIQUE — core.js
   Infraestrutura compartilhada por TODAS as páginas.
   Substitui: supabase-config.js, auth.js e script.js.
   Carregar antes de app.js e depois da biblioteca do Supabase
   ═══════════════════════════════════════════════════════════════════ */
(() => {
    'use strict';

    /* ─── 1. CONFIGURAÇÃO ────────────────────────────────────────── */
    const CONFIG = Object.freeze({
        SUPABASE_URL: 'https://ozhtjngfedtslwgeafyv.supabase.co',
        SUPABASE_KEY: 'sb_publishable_nP-XLqixj7YPWh1AoDFfAQ_JHQSlRF-',   // chave pública: proteja os dados com RLS
        STORAGE: Object.freeze({ THEME: 'donezo_theme', DB: 'donezo_db' }),
        SYNC_SETTLE_MS: 600,
        MOBILE_MAX_WIDTH: 768,
    });

    // Sem a biblioteca (CDN fora do ar) o app continua utilizável em modo offline
    const sb = window.supabase?.createClient
        ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY)
        : null;
    if (!sb) console.error('Biblioteca do Supabase indisponível: executando em modo offline.');

    const $ = (id) => document.getElementById(id);

    // localStorage pode lançar exceção (modo privado, cota cheia)
    const store = {
        get(key)         { try { return localStorage.getItem(key); } catch { return null; } },
        set(key, value)  { try { localStorage.setItem(key, value); } catch { /* ignorado */ } },
        remove(key)      { try { localStorage.removeItem(key); } catch { /* ignorado */ } },
    };

    /* ─── 2. ESTADO E EVENTOS ────────────────────────────────────── */
    const defaultDB = () => ({
        total_questoes: 0, acertos: 0, flashcards: 0, xp: 0, materias: {}, simuladoAtivo: null,
    });
    const state = { db: defaultDB(), session: null };

    // Mini pub/sub: desacopla o core das páginas (ex.: 'db-saved', 'progress-updated')
    const listeners = {};
    const on   = (evt, fn) => { (listeners[evt] ||= []).push(fn); };
    const emit = (evt, payload) => (listeners[evt] || []).forEach((fn) => {
        try { fn(payload); } catch (err) { console.error(`Erro no ouvinte "${evt}":`, err); }
    });

    // onReady é "pegajoso": se o app já iniciou, executa na hora
    let ready = false;
    const readyQueue = [];
    const onReady = (fn) => (ready ? fn() : readyQueue.push(fn));

    /* ─── 3. UTILITÁRIOS ─────────────────────────────────────────── */
    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (c) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // YYYY-MM-DD no fuso local (toISOString usa UTC e "pula" o dia à noite no Brasil)
    function dataLocalISO(d = new Date()) {
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }

    // Segunda-feira 00:00 (local) da semana de `ref`
    function segundaDaSemana(ref = new Date()) {
        const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
        const dow = d.getDay();                              // 0 = domingo
        d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
        return d;
    }

    /* ─── 4. TEMA ────────────────────────────────────────────────── */
    function applyTheme(theme, persist = true) {
        document.documentElement.setAttribute('data-theme', theme);
        if (persist) store.set(CONFIG.STORAGE.THEME, theme);
        const icon = $('theme-icon');
        const text = $('theme-text');
        if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
        if (text) text.textContent = theme === 'dark' ? 'Modo claro' : 'Modo escuro';
    }

    function toggleTheme() {
        const atual = document.documentElement.getAttribute('data-theme');
        applyTheme(atual === 'dark' ? 'light' : 'dark');
    }

    /* ─── 5. SINCRONIZAÇÃO ───────────────────────────────────────── */
    const SYNC_UI = Object.freeze({
        syncing: { icon: '🔄', text: 'Sincronizando…' },
        synced:  { icon: '☁️', text: 'Nuvem atualizada' },
        offline: { icon: '☁️', text: 'Offline' },
    });

    function setSync(status) {
        const indicator = $('sync-indicator');
        if (!indicator) return;
        const cfg = SYNC_UI[status] || SYNC_UI.offline;
        indicator.className = `sync-status ${SYNC_UI[status] ? status : 'offline'}`;
        const icon = $('sync-icon');
        const text = $('sync-text');
        if (icon) icon.textContent = cfg.icon;
        if (text) text.textContent = cfg.text;
    }

    function loadLocalDB() {
        const raw = store.get(CONFIG.STORAGE.DB);
        if (!raw) return;
        try {
            state.db = { ...defaultDB(), ...JSON.parse(raw) };
        } catch {
            store.remove(CONFIG.STORAGE.DB);          // dado corrompido não trava o app
        }
    }

    async function fetchRemoteDB() {
        if (!sb || !state.session) return;
        setSync('syncing');
        try {
            // maybeSingle: usuário novo (sem registro ainda) não gera erro
            const { data, error } = await sb
                .from('user_progress')
                .select('data_json')
                .eq('id', state.session.user.id)
                .maybeSingle();
            if (error) throw error;

            if (data?.data_json) {
                state.db = { ...defaultDB(), ...data.data_json };
                store.set(CONFIG.STORAGE.DB, JSON.stringify(state.db));
            }
            setSync('synced');
        } catch (err) {
            console.error('Falha ao buscar o progresso na nuvem:', err);
            setSync('offline');
        }
    }

    async function saveDB() {
        store.set(CONFIG.STORAGE.DB, JSON.stringify(state.db));
        emit('db-saved', state.db);
        if (!sb || !state.session) return;

        setSync('syncing');
        const { error } = await sb.from('user_progress').upsert({
            id: state.session.user.id,
            data_json: state.db,
            updated_at: new Date().toISOString(),
        });

        if (error) {
            console.error('Falha ao salvar o progresso na nuvem:', error);
            setSync('offline');
            return;
        }
        setTimeout(() => setSync('synced'), CONFIG.SYNC_SETTLE_MS);
    }

    /* ─── 6. AUTENTICAÇÃO ────────────────────────────────────────── */
    const openAuthModal  = () => { $('auth-modal')?.classList.add('active'); $('auth-email')?.focus(); };
    const closeAuthModal = () => $('auth-modal')?.classList.remove('active');

    function mostrarMensagemAuth(message, type = 'error') {
        let box = $('auth-error');
        if (!box) {
            box = document.createElement('p');
            box.id = 'auth-error';
            box.setAttribute('role', 'alert');
            document.querySelector('#auth-modal .auth-fields')?.insertAdjacentElement('afterend', box);
        }
        box.textContent = message;
        box.className = `auth-error visible${type === 'info' ? ' info' : ''}`;
    }

    function limparMensagemAuth() {
        const box = $('auth-error');
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

    let modoCadastro = false;
    function toggleAuthMode() {
        modoCadastro = !modoCadastro;
        const set = (id, texto) => { const el = $(id); if (el) el.textContent = texto; };
        set('auth-title',       modoCadastro ? 'Criar conta' : 'Entrar na nuvem');
        set('auth-toggle-text', modoCadastro ? 'Já tem conta? Entrar' : 'Não tem conta? Cadastre-se');
        set('auth-btn-main',    modoCadastro ? 'Criar conta' : 'Entrar');
        const senha = $('auth-password');
        if (senha) senha.autocomplete = modoCadastro ? 'new-password' : 'current-password';
        limparMensagemAuth();
    }

    async function handleAuth() {
        if (!sb) return mostrarMensagemAuth('Sem conexão com o servidor. Tente recarregar a página.');

        const email = $('auth-email').value.trim();
        const password = $('auth-password').value;
        const btn = $('auth-btn-main');
        if (!email || !password) return mostrarMensagemAuth('Preencha e-mail e senha.');

        limparMensagemAuth();
        btn.disabled = true;
        try {
            const { data, error } = modoCadastro
                ? await sb.auth.signUp({ email, password })
                : await sb.auth.signInWithPassword({ email, password });

            if (error) return mostrarMensagemAuth(traduzirErroAuth(error.message));

            // Cadastro com confirmação por e-mail: ainda não há sessão
            if (modoCadastro && !data.session) {
                return mostrarMensagemAuth('Conta criada. Confirme seu e-mail para entrar.', 'info');
            }
            location.reload();
        } catch {
            mostrarMensagemAuth('Sem conexão. Verifique sua internet e tente de novo.');
        } finally {
            btn.disabled = false;
        }
    }

    async function logout() {
        try {
            await sb?.auth.signOut();
        } finally {
            store.remove(CONFIG.STORAGE.DB);   // não deixa o progresso de uma conta para a próxima
            location.reload();
        }
    }

    /* ─── 7. MENU LATERAL / MOBILE ───────────────────────────────── */
    function setMenuAberto(aberto) {
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.querySelector('.sidebar-overlay');
        if (!sidebar || !overlay) return;
        sidebar.classList.toggle('active', aberto);
        overlay.classList.toggle('active', aberto);
        overlay.style.display = aberto ? 'block' : 'none';
        document.querySelector('.mobile-menu-toggle')?.setAttribute('aria-expanded', String(aberto));
    }

    function toggleMobileMenu() {
        setMenuAberto(!document.querySelector('.sidebar')?.classList.contains('active'));
    }

    function marcarMenuAtivo() {
        const atual = location.pathname.split('/').pop() || 'index.html';
        document.querySelectorAll('a.menu-item[href]').forEach((a) => {
            if (a.getAttribute('href').split('/').pop() === atual) {
                a.classList.add('active');
                a.setAttribute('aria-current', 'page');
            }
        });
    }

    function ligarEventosGlobais() {
        // Fecha o menu ao escolher um item (somente no mobile)
        document.querySelectorAll('.menu-item').forEach((item) => {
            item.addEventListener('click', () => {
                if (window.innerWidth <= CONFIG.MOBILE_MAX_WIDTH) setMenuAberto(false);
            });
        });
        // Esc fecha o menu
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') setMenuAberto(false);
        });
        // Enter envia o formulário de login
        ['auth-email', 'auth-password'].forEach((id) => {
            $(id)?.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAuth(); });
        });
    }

    /* ─── 8. COMPONENTES DE INTERFACE ────────────────────────────── */

    // Aviso discreto (substitui alert()); estilos em .toast no style.css
    function showToast(message, type = 'info', ms = 4500) {
        let stack = $('toast-stack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'toast-stack';
            stack.className = 'toast-stack';
            stack.setAttribute('aria-live', 'polite');
            document.body.appendChild(stack);
        }
        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
        toast.textContent = message;
        stack.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast--leaving');
            setTimeout(() => toast.remove(), 300);
        }, ms);
    }

    // Confirmação em modal (substitui confirm()); resolve true/false
    function confirmar({ titulo, mensagem, confirmar = 'Confirmar', cancelar = 'Cancelar', perigo = false }) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'auth-overlay active';
            overlay.setAttribute('role', 'alertdialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-labelledby', 'confirm-title');
            overlay.innerHTML = `
                <div class="auth-card confirm-card">
                    <h2 id="confirm-title">${escapeHtml(titulo)}</h2>
                    <p class="confirm-text">${escapeHtml(mensagem)}</p>
                    <div class="modal-actions">
                        <button type="button" class="btn-secondary" data-resposta="0">${escapeHtml(cancelar)}</button>
                        <button type="button" class="btn-primary${perigo ? ' btn-danger' : ''}" data-resposta="1">${escapeHtml(confirmar)}</button>
                    </div>
                </div>`;

            const fechar = (valor) => {
                document.removeEventListener('keydown', aoTeclar);
                overlay.remove();
                resolve(valor);
            };
            const aoTeclar = (e) => { if (e.key === 'Escape') fechar(false); };

            overlay.addEventListener('click', (e) => {
                const botao = e.target.closest('[data-resposta]');
                if (botao) fechar(botao.dataset.resposta === '1');
                else if (e.target === overlay) fechar(false);
            });
            document.addEventListener('keydown', aoTeclar);
            document.body.appendChild(overlay);
            overlay.querySelector('[data-resposta="0"]').focus();
        });
    }

    /* ─── 9. INICIALIZAÇÃO ───────────────────────────────────────── */
    async function init() {
        applyTheme(store.get(CONFIG.STORAGE.THEME) || 'light', false);
        loadLocalDB();
        marcarMenuAtivo();
        ligarEventosGlobais();

        if (sb) {
            try {
                const { data } = await sb.auth.getSession();
                state.session = data.session;
            } catch (err) {
                console.error('Falha ao obter a sessão:', err);
            }
            sb.auth.onAuthStateChange((_evento, session) => { state.session = session; });
        }

        if (state.session) {
            await fetchRemoteDB();
        } else {
            setSync('offline');
            if (sb) openAuthModal();
        }

        ready = true;
        readyQueue.splice(0).forEach((fn) => {
            try { fn(); } catch (err) { console.error('Erro na inicialização da página:', err); }
        });
    }

    /* ─── 10. API PÚBLICA ────────────────────────────────────────── */
    // Para app.js e outros módulos
    window.App = Object.freeze({
        sb, state, $, on, emit, onReady,
        saveDB, setSync, showToast, confirmar,
        escapeHtml, dataLocalISO, segundaDaSemana, defaultDB, store,
    });

    // Para os atributos onclick="" do HTML
    Object.assign(window, {
        handleAuth, toggleAuthMode, openAuthModal, closeAuthModal,
        toggleTheme, toggleMobileMenu, logout,
    });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();