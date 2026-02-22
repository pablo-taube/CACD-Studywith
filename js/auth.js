async function initializeApp() {
    const savedTheme = localStorage.getItem('donezo_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeUI(savedTheme);

    const localData = localStorage.getItem('donezo_db');
    if (localData) db = JSON.parse(localData);

    const { data } = await supabaseClient.auth.getSession();
    currentSession = data.session;

    if (currentSession) {
        await fetchRemoteDB();
        if (typeof carregarMateriasDisponiveis === 'function') await carregarMateriasDisponiveis();
    } else {
        updateSyncUI('offline');
        openAuthModal();
    }

    if (typeof updateDashboard === 'function') updateDashboard();
    highlightActiveMenu();
}

window.addEventListener('load', initializeApp);

async function handleAuth() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return alert(error.message);
    location.reload();
}

async function fetchRemoteDB() {
    updateSyncUI('syncing');
    try {
        const { data } = await supabaseClient.from('user_progress').select('data_json').single();
        if (data?.data_json) {
            db = data.data_json;
            localStorage.setItem('donezo_db', JSON.stringify(db));
        }
        updateSyncUI('synced');
    } catch { updateSyncUI('offline'); }
}

async function saveDB() {
    localStorage.setItem('donezo_db', JSON.stringify(db));
    if (typeof updateDashboard === 'function') updateDashboard();

    if (!currentSession) return;
    updateSyncUI('syncing');
    const { error } = await supabaseClient.from('user_progress').upsert({
        id: currentSession.user.id,
        data_json: db,
        updated_at: new Date()
    });
    if (!error) setTimeout(() => updateSyncUI('synced'), 600);
    else updateSyncUI('offline');
}

function updateSyncUI(status) {
    const indicator = document.getElementById('sync-indicator');
    if (!indicator) return;
    const icon = document.getElementById('sync-icon');
    const text = document.getElementById('sync-text');
    const states = {
        syncing: { icon: '🔄', text: 'Sincronizando...' },
        synced: { icon: '☁️', text: 'Nuvem Atualizada' },
        offline: { icon: '☁️', text: 'Offline' }
    };
    const state = states[status] || states.offline;
    indicator.className = `sync-status ${status}`;
    icon.innerText = state.icon;
    text.innerText = state.text;
}

function toggleTheme() {
    const html = document.documentElement;
    const theme = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', theme);
    localStorage.setItem('donezo_theme', theme);
    updateThemeUI(theme);
}

function updateThemeUI(theme) {
    const icon = document.getElementById('theme-icon');
    if (icon) icon.innerText = theme === 'dark' ? '☀️' : '🌙';
}

function toggleAuthModal() { document.getElementById('auth-modal').classList.toggle('active'); }
function openAuthModal() { document.getElementById("auth-modal").classList.remove("hidden"); }
function highlightActiveMenu() {
    const page = window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll('.menu-item').forEach(item => {
        if (item.getAttribute('href')?.includes(page)) item.classList.add('active');
    });
}