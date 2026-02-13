// --- 1. BANCO DE DADOS LOCAL ---
let db = JSON.parse(localStorage.getItem('donezo_db')) || {
    total_questoes: 0,
    acertos: 0,
    flashcards: 0,
    xp: 0,
    materias: {}
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
function processQuestions() {
    const raw = document.getElementById('raw-html').value;
    const estilo = document.getElementById('set-estilo').value;
    const materia = document.getElementById('set-materia').value || 'Geral';
    
    if (!raw) return alert("Cole o HTML das questões!");

    // Minimiza o painel
    const panel = document.getElementById('config-panel');
    if (panel && !panel.classList.contains('collapsed')) {
        toggleConfig();
    }

    // Reseta estatísticas do simulado atual
    acertosSimulado = 0;
    errosSimulado = 0;
    respondidasSimulado = 0;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = raw;
    questoesAtuais = tempDiv.querySelectorAll('.questao').length > 0
        ? Array.from(tempDiv.querySelectorAll('.questao')).map(n => n.outerHTML)
        : [raw];

    const btnReset = document.getElementById('btn-reset-simulado');
    if (btnReset) btnReset.style.display = 'block';

    updateScoreUI();
    renderizarSimulado(estilo, materia);

    // Inicia Cronômetro automaticamente
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
        db.acertos++;
        db.xp += 10;
    } else {
        btn.classList.add('wrong');
        errosSimulado++; // INCREMENTO DO ERRO
        if (estilo === 'CESPE') db.xp -= 5;
    }

    const commentEl = parent.querySelector('.comentario');
    if (commentEl) commentEl.classList.add('show-comment');
    
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
    const savedTheme = localStorage.getItem('donezo_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeUI(savedTheme);
};

function clearData() {
    if (confirm("Apagar todo o progresso?")) {
        localStorage.removeItem('donezo_db');
        location.reload();
    }
}