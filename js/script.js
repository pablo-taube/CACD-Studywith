// --- 1. BANCO DE DADOS LOCAL ---
// Altere a inicialização do db para incluir 'simuladoAtivo'
let db = JSON.parse(localStorage.getItem('donezo_db')) || {
    total_questoes: 0,
    acertos: 0,
    flashcards: 0,
    xp: 0,
    materias: {},
    simuladoAtivo: null // Novo campo para salvar o estado atual
};

function saveDB() {
    localStorage.setItem('donezo_db', JSON.stringify(db));
    updateDashboard();
}

// --- 2. CONTROLE DO SIMULADO ATUAL ---
let acertosSimulado = 0;
let errosSimulado = 0; 
let respondidasSimulado = 0;
let questoesAtuais = [];
let timerInterval = null;
let seconds = 0;

// --- 3. PROCESSAMENTO E RENDERIZAÇÃO ---
async function processQuestions() {
    const temaSelecionado = document.getElementById('select-tema').value;
    const estilo = document.getElementById('set-estilo').value;
    const inputMateria = document.getElementById('set-materia').value;
    const limite = parseInt(document.getElementById('set-limite').value); // CAPTURA O LIMITE
    let raw = "";

    if (temaSelecionado) {
        try {
            const response = await fetch(`../banco-questoes/${temaSelecionado}`);
            if (!response.ok) throw new Error();
            raw = await response.text();
        } catch (error) {
            return alert("Erro ao carregar arquivo do banco de questões.");
        }
    } else {
        raw = document.getElementById('raw-html').value;
    }

    if (!raw) return alert("Selecione um tema ou cole o HTML das questões!");

    const panel = document.getElementById('config-panel');
    if (panel && !panel.classList.contains('collapsed')) toggleConfig();

    const materia = inputMateria || (temaSelecionado ? temaSelecionado.replace('.html', '').toUpperCase() : "Geral");

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = raw;
    
    // 1. Pega todas as questões encontradas
    let todasAsQuestoes = Array.from(tempDiv.querySelectorAll('.questao')).map(n => n.outerHTML);
    if (todasAsQuestoes.length === 0) todasAsQuestoes = [raw];

    // 2. EMBARALHA ANTES DE FILTRAR (para não pegar sempre as mesmas do topo)
    todasAsQuestoes.sort(() => Math.random() - 0.5);

    // 3. APLICA O FILTRO DE QUANTIDADE
    if (limite > 0) {
        questoesAtuais = todasAsQuestoes.slice(0, limite);
    } else {
        questoesAtuais = todasAsQuestoes;
    }

    db.simuladoAtivo = {
        questoes: questoesAtuais,
        estilo: estilo,
        materia: materia,
        acertos: 0,
        erros: 0,
        respondidas: 0
    };
    saveDB();

    acertosSimulado = 0;
    errosSimulado = 0;
    respondidasSimulado = 0;

    renderizarSimulado(estilo, materia);
    updateScoreUI();
    
    document.getElementById('btn-reset-simulado').style.display = 'block';

    if (timerInterval) clearInterval(timerInterval);
    seconds = 0;
    timerInterval = null; 
    toggleTimer();
}

function renderizarSimulado(estilo, materia) {
    const container = document.getElementById('questions-render');
    if (!container) return;
    container.innerHTML = "";
    
    const shuffled = [...questoesAtuais].sort(() => Math.random() - 0.5);

    shuffled.forEach((qHtml, index) => {
        const div = document.createElement('div');
        div.className = "q-container";
        div.innerHTML = `
            <p style="color:var(--accent); font-weight:700; margin-bottom:10px;">QUESTÃO ${index + 1} [${materia.toUpperCase()}]</p>
            <div style="margin: 15px 0; line-height:1.6;">${qHtml}</div>
            <div class="options-grid">
                ${renderOptions(estilo, qHtml)}
            </div>
        `;
        container.appendChild(div);
    });
}

function renderOptions(estilo, text) {
    const isCorrectC = text.toLowerCase().includes('gabarito: certo') || text.toLowerCase().includes('correta: c');
    if (estilo === 'cespe') {
        return `
            <button class="opt-btn" onclick="check(this, 'c', ${isCorrectC ? "'c'" : "'e'"}, 'CESPE')">Certo</button>
            <button class="opt-btn" onclick="check(this, 'e', ${isCorrectC ? "'c'" : "'e'"}, 'CESPE')">Errado</button>
        `;
    } else {
        const match = text.match(/gabarito:\s*([a-e])/i);
        const correctLetter = match ? match[1].toLowerCase() : 'a';
        return ['A','B','C','D','E'].map(opt => `
            <button class="opt-btn" onclick="check(this, '${opt.toLowerCase()}', '${correctLetter}', 'FGV')">${opt}</button>
        `).join('');
    }
}

// --- 4. LÓGICA DE CORREÇÃO (CONTADOR DE ERROS AQUI) ---
function check(btn, choice, correct, estilo) {
    const optionsParent = btn.parentElement;
    if (optionsParent.classList.contains('answered')) return;
    
    const parent = btn.parentElement.closest('.q-container');
    optionsParent.classList.add('answered');
    respondidasSimulado++;
    db.total_questoes++;
    
   if (choice.toLowerCase() === correct.toLowerCase()) {
        btn.classList.add('correct');
        acertosSimulado++;
        if(db.simuladoAtivo) db.simuladoAtivo.acertos++; // Salva no storage
        db.acertos++;
        db.xp += 10;
    } else {
        btn.classList.add('wrong');
        errosSimulado++;
        if(db.simuladoAtivo) db.simuladoAtivo.erros++; // Salva no storage
        if (estilo === 'CESPE') db.xp -= 5;
    }
if(db.simuladoAtivo) db.simuladoAtivo.respondidas++;
    
    updateScoreUI();
    saveDB();
}

function updateScoreUI() {
    const acertosEl = document.getElementById('score-acertos');
    const errosEl = document.getElementById('score-erros');
    const totalEl = document.getElementById('score-total-q');

    if (acertosEl) {
        acertosEl.innerText = acertosSimulado;
        acertosEl.style.transform = "scale(1.2)";
        setTimeout(() => acertosEl.style.transform = "scale(1)", 200);
    }
    if (errosEl) {
        errosEl.innerText = errosSimulado;
        errosEl.style.transform = "scale(1.2)";
        setTimeout(() => errosEl.style.transform = "scale(1)", 200);
    }
    if (totalEl) totalEl.innerText = questoesAtuais.length;
}

// --- 5. CRONÔMETRO E UTILITÁRIOS ---
function toggleTimer() {
    const btn = document.getElementById('btn-timer');
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
        if (btn) btn.innerText = "Retomar";
    } else {
        timerInterval = setInterval(() => {
            seconds++;
            const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
            const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
            const s = String(seconds % 60).padStart(2, '0');
            const clock = document.getElementById('clock');
            if (clock) clock.innerText = `${h}:${m}:${s}`;
        }, 1000);
        if (btn) btn.innerText = "Pausar";
    }
}

function resetTimer() {
    if(timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    seconds = 0;
    const clock = document.getElementById('clock');
    if (clock) clock.innerText = "00:00:00";
    const btn = document.getElementById('btn-timer');
    if (btn) btn.innerText = "Iniciar";
}

function toggleConfig() {
    const panel = document.getElementById('config-panel');
    const icon = document.getElementById('accordion-icon');
    panel.classList.toggle('collapsed');
    icon.innerText = panel.classList.contains('collapsed') ? '▼' : '▲';
}

function resetSimulado() {
    if (confirm("Reiniciar o teste atual?")) {
        processQuestions();
        resetTimer();
        toggleTimer();
    }
}

// --- 6. TEMA E INICIALIZAÇÃO ---
function toggleTheme() {
    const html = document.documentElement;
    const newTheme = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
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

function updateDashboard() {
    const tq = document.getElementById('stat-total-q');
    const ta = document.getElementById('stat-accuracy');
    const tf = document.getElementById('stat-flash');
    const tx = document.getElementById('stat-xp');

    if (tq) tq.innerText = db.total_questoes;
    if (tx) tx.innerText = db.xp;
    if (tf) tf.innerText = db.flashcards;
    if (ta) {
        const acc = db.total_questoes > 0 ? Math.round((db.acertos / db.total_questoes) * 100) : 0;
        ta.innerText = acc + "%";
    }
}

function highlightActiveMenu() {
    const currentPage = window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll('.menu-item').forEach(item => {
        const href = item.getAttribute('href');
        if (href && href.includes(currentPage)) item.classList.add('active');
        else item.classList.remove('active');
    });
}

window.onload = () => {
    highlightActiveMenu();
    updateDashboard();
    
    // Recupera o tema
    const savedTheme = localStorage.getItem('donezo_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeUI(savedTheme);

    // RECUPERAR SIMULADO ATIVO
    if (db.simuladoAtivo && document.getElementById('questions-render')) {
        questoesAtuais = db.simuladoAtivo.questoes;
        acertosSimulado = db.simuladoAtivo.acertos;
        errosSimulado = db.simuladoAtivo.erros;
        respondidasSimulado = db.simuladoAtivo.respondidas;
        
        renderizarSimulado(db.simuladoAtivo.estilo, db.simuladoAtivo.materia);
        updateScoreUI();
        
        const btnReset = document.getElementById('btn-reset-simulado');
        if (btnReset) btnReset.style.display = 'block';
    }
};

function clearData() {
    if (confirm("Apagar todo o progresso?")) {
        localStorage.removeItem('donezo_db');
        location.reload();
    }
}

function toggleMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const icon = document.getElementById('hamburger-icon');
    const isOpened = sidebar.classList.toggle('active');

    // Troca o ícone entre hambúrguer e fechar (X)
    if (isOpened) {
        icon.innerText = '✕';
    } else {
        icon.innerText = '☰';
    }
}

// Opcional: Fechar menu automaticamente ao clicar em um link (menu-item)
document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        if (sidebar.classList.contains('active')) {
            toggleMobileMenu();
        }
    });
});