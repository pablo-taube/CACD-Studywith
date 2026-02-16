// --- CONFIGURAÇÃO SUPABASE ---
const SUPABASE_URL = 'https://ozhtjngfedtslwgeafyv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_nP-XLqixj7YPWh1AoDFfAQ_JHQSlRF-';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 1. BANCO DE DADOS E SINCRONIZAÇÃO ---
let db = { total_questoes: 0, acertos: 0, flashcards: 0, xp: 0, materias: {}, simuladoAtivo: null };
let currentSession = null;

async function initializeApp() {
    const localData = localStorage.getItem('donezo_db');
    if (localData) db = JSON.parse(localData);

    const { data } = await supabaseClient.auth.getSession();
    currentSession = data.session;

    if (currentSession) await fetchRemoteDB();
    else {
        updateSyncUI('offline');
        toggleAuthModal();
    }

    updateDashboard();
    highlightActiveMenu();
}

window.addEventListener('load', initializeApp);

function updateSyncUI(status) {
    const indicator = document.getElementById('sync-indicator');
    if (!indicator) return;

    const icon = document.getElementById('sync-icon');
    const text = document.getElementById('sync-text');

    indicator.className = `sync-status ${status}`;

    const states = {
        syncing: { icon: '🔄', text: 'Sincronizando...' },
        synced: { icon: '☁️', text: 'Nuvem Atualizada' },
        offline: { icon: '☁️', text: 'Offline' }
    };

    const state = states[status] || states.offline;
    icon.innerText = state.icon;
    text.innerText = state.text;
}

async function saveDB() {
    localStorage.setItem('donezo_db', JSON.stringify(db));
    updateDashboard();

    if (!currentSession) return;

    updateSyncUI('syncing');

    const { error } = await supabaseClient
        .from('user_progress')
        .upsert({
            id: currentSession.user.id,
            data_json: db,
            updated_at: new Date()
        });

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
        updateDashboard();
    } catch {
        updateSyncUI('offline');
    }
}

// --- 2. CONTROLE DE SIMULADO ---
// --- 2. CONTROLE DE SIMULADO (MODIFICADO PARA SUPABASE) ---
let acertosSimulado = 0;
let errosSimulado = 0;
let questoesAtuais = [];

async function processQuestions() {
    const materia = document.getElementById('select-tema').value;
    const estilo = document.getElementById('set-estilo').value;
    const limite = parseInt(document.getElementById('set-limite').value) || 10;

    // Busca questões diretamente da tabela 'questoes' do Supabase
    const { data, error } = await supabaseClient
        .from('questoes')
        .select('*')
        .eq('materia', materia.replace('.html', '')); // Ajuste caso o value do select ainda tenha .html

    if (error || !data.length) return alert("Não foram encontradas questões para este tema no banco de dados.");

    // Embaralha e aplica o limite
    let todas = data;
    todas.sort(() => Math.random() - 0.5);
    questoesAtuais = todas.slice(0, limite);

    db.simuladoAtivo = {
        questoes: questoesAtuais,
        estilo,
        materia: materia
    };

    saveDB();
    renderizarSimulado(estilo);
}

function renderizarSimulado(estilo) {
    const container = document.getElementById('questions-render');
    if (!container) return;
    container.innerHTML = "";

    questoesAtuais.forEach((qObj, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = "q-container";
        // Armazenamos o ID da questão no elemento para usar na correção
        wrapper.dataset.questaoId = qObj.id; 

        wrapper.innerHTML = `
            <p style="color:var(--accent-color); font-weight:700; font-size:0.8rem;">
                QUESTÃO ${index + 1} | ${qObj.banca}
            </p>
            <div class="enunciado">${qObj.enunciado}</div>
            <div class="fonte">${qObj.fonte || "Diplomatique Study AI"}</div>
            <div class="options-grid">
                ${renderOptions(estilo, qObj.gabarito, qObj.enunciado)}
            </div>
        `;
        container.appendChild(wrapper);
    });
}

function renderOptions(estilo, gabaritoOficial, enunciadoOriginal) {
    // Agora o gabarito já vem limpo do banco (ex: 'c' ou 'a')
    if (estilo === 'cespe') {
        return `
            <button class="opt-btn" onclick="check(this,'c','${gabaritoOficial}','cespe')">Certo</button>
            <button class="opt-btn" onclick="check(this,'e','${gabaritoOficial}','cespe')">Errado</button>
        `;
    }
    return ['A','B','C','D','E']
        .map(opt => `<button class="opt-btn" onclick="check(this,'${opt.toLowerCase()}','${gabaritoOficial}','fgv')">${opt}</button>`)
        .join('');
}

async function check(btn, choice, correct, estilo) {
    const container = btn.closest('.q-container');
    const optionsGrid = btn.parentElement;
    const questaoId = container.dataset.questaoId;

    if (optionsGrid.classList.contains('answered')) return;
    optionsGrid.classList.add('answered');

    const acertou = choice === correct;

    if (acertou) {
        btn.classList.add('correct');
        acertosSimulado++;
        db.acertos++;
        db.xp += 10;
    } else {
        btn.classList.add('wrong');
        errosSimulado++;
        if (estilo === 'cespe') db.xp -= 5;
    }

    // Mostra comentário (que agora vem do banco)
    const qData = questoesAtuais.find(q => q.id == questaoId);
    if (qData && qData.comentario) {
        const commentDiv = document.createElement('div');
        commentDiv.className = "comentario show-comment";
        commentDiv.innerHTML = qData.comentario;
        container.appendChild(commentDiv);
    }

    document.getElementById('score-acertos').innerText = acertosSimulado;
    document.getElementById('score-erros').innerText = errosSimulado;
    document.getElementById('score-total-q').innerText = questoesAtuais.length;

    // Atualiza estatísticas globais e histórico individual no banco
    saveDB();
    if (questaoId) await updateQuestaoStats(questaoId, acertou);
}

async function updateQuestaoStats(id, acertou) {
    if (!currentSession) return;

    // 1. Busca histórico atual da questão
    const { data } = await supabaseClient
        .from('questoes')
        .select('historico_respostas')
        .eq('id', id)
        .single();

    let historico = data?.historico_respostas || [];
    
    // 2. Adiciona nova resposta (true/false) no início e mantém as 3 últimas
    historico.unshift(acertou);
    if (historico.length > 3) historico.pop();

    // 3. Salva a data e o novo histórico
    await supabaseClient
        .from('questoes')
        .update({
            ultima_vez_respondida: new Date(),
            historico_respostas: historico
        })
        .eq('id', id);
}

// --- 3. AUTENTICAÇÃO ---
let isSignUp = false;

function toggleAuthModal() {
    document.getElementById('auth-modal').classList.toggle('active');
}

function closeAuthModal() {
    document.getElementById('auth-modal').classList.remove('active');
}

function toggleAuthMode() {
    isSignUp = !isSignUp;
    document.getElementById('auth-title').innerText =
        isSignUp ? 'Criar Conta' : 'Entrar na Nuvem';
}

async function handleAuth() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;

    if (isSignUp) {
        await supabaseClient.auth.signUp({ email, password });
        return;
    }

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) return alert(error.message);

    await fetchRemoteDB();
    location.reload();
}

// --- 4. UTILITÁRIOS ---
function toggleMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const active = sidebar.classList.toggle('active');
    document.getElementById('hamburger-icon').innerText = active ? '✕' : '☰';
}

function toggleConfig() {
    const panel = document.getElementById('config-panel');
    panel.classList.toggle('collapsed');
    document.getElementById('accordion-icon').innerText =
        panel.classList.contains('collapsed') ? '▼' : '▲';
}

function updateDashboard() {
    const total = db.total_questoes || 0;
    const accuracy = total > 0
        ? Math.round((db.acertos / total) * 100) + "%"
        : "0%";

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.innerText = value;
    };

    setText('stat-total-q', total);
    setText('stat-accuracy', accuracy);
    setText('stat-flash', db.flashcards || 0);
    setText('stat-xp', db.xp || 0);
}

function highlightActiveMenu() {
    const page = window.location.pathname.split("/").pop() || "index.html";

    document.querySelectorAll('.menu-item').forEach(item => {
        const href = item.getAttribute('href');
        if (href && href.includes(page)) item.classList.add('active');
    });
}

function openAuthModal() {
    document.getElementById("auth-modal").classList.remove("hidden");
}

function closeAuthModal() {
    document.getElementById("auth-modal").classList.add("hidden");
}

if (!supabaseClient.auth.getSession()) {
    openAuthModal();
}


// --- ATUALIZAÇÃO DA INICIALIZAÇÃO ---
async function initializeApp() {
    const localData = localStorage.getItem('donezo_db');
    if (localData) db = JSON.parse(localData);

    // RECUPERAR TEMA SALVO
    const savedTheme = localStorage.getItem('donezo_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeUI(savedTheme);

    const { data } = await supabaseClient.auth.getSession();
    currentSession = data.session;

    if (currentSession) await fetchRemoteDB();
    else {
        updateSyncUI('offline');
        toggleAuthModal();
    }

    updateDashboard();
    highlightActiveMenu();
}

// --- FUNÇÕES DE TEMA ---
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('donezo_theme', newTheme);
    updateThemeUI(newTheme);
}

function updateThemeUI(theme) {
    const icon = document.getElementById('theme-icon');
    const text = document.getElementById('theme-text');
    
    if (icon && text) {
        icon.innerText = theme === 'dark' ? '☀️' : '🌙';
        text.innerText = theme === 'dark' ? 'Modo Claro' : 'Modo Escuro';
    }
}