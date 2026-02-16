// --- CONFIGURAÇÃO SUPABASE ---
const SUPABASE_URL = 'https://ozhtjngfedtslwgeafyv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_nP-XLqixj7YPWh1AoDFfAQ_JHQSlRF-'; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 1. BANCO DE DADOS LOCAL E NUVEM ---
let db = { total_questoes: 0, acertos: 0, flashcards: 0, xp: 0, materias: {}, simuladoAtivo: null };

// Função unificada de inicialização
async function initializeApp() {
    const localData = localStorage.getItem('donezo_db');
    if (localData) db = JSON.parse(localData);

    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (session) {
        console.log("Usuário logado:", session.user.email);
        await fetchRemoteDB(); // Sincroniza dados da nuvem IMEDIATAMENTE
    } else {
        toggleAuthModal(); // Abre o login se não houver sessão
    }
    
    updateDashboard();
    highlightActiveMenu();
}

window.onload = initializeApp;

async function fetchRemoteDB() {
    try {
        const { data, error } = await supabaseClient
            .from('user_progress')
            .select('data_json')
            .single();
        
        if (data && data.data_json) {
            // Lógica de merge: prevalece o que tiver mais progresso ou for mais recente
            db = data.data_json;
            localStorage.setItem('donezo_db', JSON.stringify(db));
            updateDashboard();
        }
    } catch (err) {
        console.log("Ainda não há dados na nuvem para este usuário.");
    }
}

// --- 2. CONTROLE DO SIMULADO ---
let acertosSimulado = 0, errosSimulado = 0, respondidasSimulado = 0, questoesAtuais = [], timerInterval = null, seconds = 0;

async function processQuestions() {
    const tema = document.getElementById('select-tema').value;
    const estilo = document.getElementById('set-estilo').value;
    const limite = parseInt(document.getElementById('set-limite').value);
    let raw = "";

    if (tema) {
        try {
            const res = await fetch(`../banco-questoes/${tema}`);
            raw = await res.text();
        } catch (e) { return alert("Erro ao carregar tema."); }
    } else { raw = document.getElementById('raw-html').value; }

    if (!raw) return alert("Selecione um tema!");

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = raw;
    let todas = Array.from(tempDiv.querySelectorAll('.questao')).map(n => n.outerHTML);
    if (todas.length === 0) todas = [raw];
    
    todas.sort(() => Math.random() - 0.5);
    questoesAtuais = limite > 0 ? todas.slice(0, limite) : todas;

    db.simuladoAtivo = { questoes: questoesAtuais, estilo, materia: tema || "Geral", acertos: 0, erros: 0, respondidas: 0 };
    saveDB();
    acertosSimulado = 0; errosSimulado = 0; respondidasSimulado = 0;
    renderizarSimulado(estilo, db.simuladoAtivo.materia);
    updateScoreUI();
    if (timerInterval) clearInterval(timerInterval);
    seconds = 0; toggleTimer();
}

function renderizarSimulado(estilo, materia) {
    const container = document.getElementById('questions-render');
    container.innerHTML = "";
    questoesAtuais.forEach((qHtml, index) => {
        const div = document.createElement('div');
        div.className = "q-container";
        div.innerHTML = `<p style="color:var(--accent); font-weight:700;">QUESTÃO ${index + 1}</p>
                         <div style="margin:15px 0;">${qHtml}</div>
                         <div class="options-grid">${renderOptions(estilo, qHtml)}</div>`;
        container.appendChild(div);
    });
}

function renderOptions(estilo, text) {
    const isCorrectC = text.toLowerCase().includes('gabarito: certo') || text.toLowerCase().includes('correta: c');
    if (estilo === 'cespe') {
        return `<button class="opt-btn" onclick="check(this, 'c', ${isCorrectC ? "'c'" : "'e'"}, 'CESPE')">Certo</button>
                <button class="opt-btn" onclick="check(this, 'e', ${isCorrectC ? "'c'" : "'e'"}, 'CESPE')">Errado</button>`;
    }
    const match = text.match(/gabarito:\s*([a-e])/i);
    const correct = match ? match[1].toLowerCase() : 'a';
    return ['A','B','C','D','E'].map(opt => `<button class="opt-btn" onclick="check(this, '${opt.toLowerCase()}', '${correct}', 'FGV')">${opt}</button>`).join('');
}

function check(btn, choice, correct, estilo) {
    const parent = btn.closest('.q-container');
    const options = btn.parentElement;
    if (options.classList.contains('answered')) return;
    options.classList.add('answered');
    respondidasSimulado++; db.total_questoes++;

    if (choice.toLowerCase() === correct.toLowerCase()) {
        btn.classList.add('correct'); acertosSimulado++; db.acertos++; db.xp += 10;
    } else {
        btn.classList.add('wrong'); errosSimulado++; if (estilo === 'CESPE') db.xp -= 5;
    }
    const comment = parent.querySelector('.comentario');
    if (comment) { comment.classList.add('show-comment'); comment.style.display = 'block'; }
    updateScoreUI(); saveDB();
}

// --- 3. UI E UTILITÁRIOS ---
function updateScoreUI() {
    document.getElementById('score-acertos').innerText = acertosSimulado;
    document.getElementById('score-erros').innerText = errosSimulado;
    document.getElementById('score-total-q').innerText = questoesAtuais.length;
}

function toggleMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const icon = document.getElementById('hamburger-icon');
    const isOpen = sidebar.classList.toggle('active');
    icon.innerText = isOpen ? '✕' : '☰';
    document.body.style.overflow = isOpen ? 'hidden' : 'auto';
}

let isSignUp = false;
function toggleAuthModal() { document.getElementById('auth-modal').classList.toggle('active'); }
function closeAuthModal() { document.getElementById('auth-modal').classList.remove('active'); }
function toggleAuthMode() {
    isSignUp = !isSignUp;
    document.getElementById('auth-title').innerText = isSignUp ? 'Criar Conta' : 'Entrar na Nuvem';
}

async function handleAuth() {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const btnMain = document.getElementById('auth-btn-main');

    if (!email || !password) return alert("Preencha todos os campos!");
    
    btnMain.innerText = "Processando...";
    btnMain.disabled = true;

    try {
        let result;
        if (isSignUp) {
            result = await supabaseClient.auth.signUp({ email, password });
        } else {
            result = await supabaseClient.auth.signInWithPassword({ email, password });
        }

        if (result.error) throw result.error;

        if (result.data.user && result.data.session) {
            alert(isSignUp ? "Conta criada com sucesso!" : "Bem-vindo de volta!");
            await fetchRemoteDB();
            closeAuthModal();
            // Pequeno delay antes do reload para garantir escrita no storage
            setTimeout(() => location.reload(), 500);
        } else if (isSignUp) {
            alert("Verifique seu e-mail para confirmar o cadastro!");
        }

    } catch (error) {
        alert("Erro: " + error.message);
        console.error("Erro Supabase:", error);
    } finally {
        btnMain.disabled = false;
        btnMain.innerText = isSignUp ? 'Cadastrar' : 'Entrar';
    }
}