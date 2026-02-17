/* --- CONFIGURAÇÃO SUPABASE --- */
const SUPABASE_URL = 'https://ozhtjngfedtslwgeafyv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_nP-XLqixj7YPWh1AoDFfAQ_JHQSlRF-';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* --- 1. ESTADO GLOBAL --- */
let db = { total_questoes: 0, acertos: 0, flashcards: 0, xp: 0, materias: {}, simuladoAtivo: null };
let currentSession = null;
let acertosSimulado = 0;
let errosSimulado = 0;
let questoesAtuais = [];
let idQuestaoSendoEditada = null;

/* --- 2. INICIALIZAÇÃO --- */
async function initializeApp() {
    // 1. Recuperar tema
    const savedTheme = localStorage.getItem('donezo_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeUI(savedTheme);

    // 2. Recuperar dados locais
    const localData = localStorage.getItem('donezo_db');
    if (localData) db = JSON.parse(localData);

    // 3. Verificar sessão
    const { data } = await supabaseClient.auth.getSession();
    currentSession = data.session;

    if (currentSession) {
        await fetchRemoteDB();
        await carregarMateriasDisponiveis();
    } else {
        updateSyncUI('offline');
        openAuthModal();
    }

    updateDashboard();
    highlightActiveMenu();
}

window.addEventListener('load', initializeApp);

/* --- 3. BANCO DE DADOS E SINCRONIZAÇÃO --- */
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

/* --- 4. CONTROLE DE SIMULADO --- */
async function carregarMateriasDisponiveis() {
    const selectMateria = document.getElementById('select-materia');
    if (!selectMateria) return;

    try {
        const { data, error } = await supabaseClient.from('questoes').select('materia');
        if (error) throw error;

        const materiasUnicas = [...new Set(data.map(item => item.materia))].sort();
        selectMateria.innerHTML = '<option value="">-- Todas as Matérias --</option>';
        
        materiasUnicas.forEach(materia => {
            if (materia) {
                const option = document.createElement('option');
                option.value = materia;
                option.textContent = materia;
                selectMateria.appendChild(option);
            }
        });
    } catch (err) {
        console.error("Erro ao carregar matérias:", err);
    }
}

async function processQuestions() {
    const materia = document.getElementById('select-materia').value;
    const assunto = document.getElementById('set-assunto').value.trim();
    const estilo = document.getElementById('set-estilo').value;
    const limite = parseInt(document.getElementById('set-limite').value) || 10;

    if (!materia && !assunto) return alert("Selecione ao menos uma matéria ou assunto!");

    updateSyncUI('syncing');
    try {
        let query = supabaseClient.from('questoes').select('*');
        if (materia) query = query.eq('materia', materia);
        if (assunto) query = query.ilike('assunto', `%${assunto}%`);

        const { data, error } = await query;
        if (error) throw error;
        if (!data?.length) {
            updateSyncUI('offline');
            return alert("Nenhuma questão encontrada.");
        }

        questoesAtuais = data.sort(() => Math.random() - 0.5).slice(0, limite);
        acertosSimulado = 0;
        errosSimulado = 0;

        renderizarSimulado(estilo);
        updateSyncUI('synced');
        toggleConfig();
    } catch (err) {
        console.error(err);
        updateSyncUI('offline');
    }
}

function renderizarSimulado(estilo) {
    const container = document.getElementById('questions-render');
    if (!container) return;
    container.innerHTML = "";

    questoesAtuais.forEach((qObj, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = "q-container";
        wrapper.dataset.questaoId = qObj.id; 

        // Lógica de Extração Híbrida (Coluna do Banco OU HTML legado)
        let gabaritoFinal = qObj.gabarito ? qObj.gabarito.toLowerCase().trim() : "";
        
        // Se a coluna do banco estiver vazia, tenta extrair do HTML
        if (!gabaritoFinal || gabaritoFinal === "") {
            const temp = document.createElement('div');
            temp.innerHTML = qObj.enunciado + (qObj.comentario || "");
            const gabEl = temp.querySelector('.gabarito');
            if (gabEl) {
                const text = gabEl.innerText.toLowerCase();
                if (text.includes('certo') || text === 'c') gabaritoFinal = 'c';
                else if (text.includes('errado') || text === 'e') gabaritoFinal = 'e';
                else gabaritoFinal = text.match(/[a-e]/) ? text.match(/[a-e]/)[0] : "a";
            }
        }

        wrapper.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <p style="color:var(--accent-color); font-weight:700; font-size:0.8rem; margin:0;">
                    QUESTÃO ${index + 1} | ${qObj.banca || 'Geral'}
                </p>
                <button onclick="abrirEditorQuestao(${qObj.id})" title="Editar"
                        style="background: #f0f4f8; border: 1px solid #d1d9e0; border-radius: 8px; padding: 5px 8px; cursor: pointer; font-size: 1.1rem;">
                    ✏️
                </button>
            </div>
            <div class="enunciado" id="enunciado-${qObj.id}">${qObj.enunciado}</div>
            <div class="fonte" style="margin-top: 10px; font-size: 0.8rem; opacity: 0.7;">${qObj.fonte || ""}</div>
            <div class="options-grid">
                ${renderOptions(estilo, gabaritoFinal)}
            </div>
        `;
        container.appendChild(wrapper);
    });
}

function renderOptions(estilo, gabarito) {
    if (estilo === 'cespe') {
        return `
            <button class="opt-btn" onclick="check(this,'c','${gabarito}','cespe')">Certo</button>
            <button class="opt-btn" onclick="check(this,'e','${gabarito}','cespe')">Errado</button>`;
    }
    return ['A','B','C','D','E']
        .map(opt => `<button class="opt-btn" onclick="check(this,'${opt.toLowerCase()}','${gabarito}','fgv')">${opt}</button>`)
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

    const qData = questoesAtuais.find(q => q.id == questaoId);
    if (qData?.comentario) {
        const commentDiv = document.createElement('div');
        commentDiv.className = "comentario show-comment";
        
        // Limpa a div gabarito do comentário antes de mostrar ao usuário
        const tempComment = document.createElement('div');
        tempComment.innerHTML = qData.comentario;
        const gabInterno = tempComment.querySelector('.gabarito');
        if (gabInterno) gabInterno.remove();
        
        commentDiv.innerHTML = tempComment.innerHTML;
        container.appendChild(commentDiv);
    }

    document.getElementById('score-acertos').innerText = acertosSimulado;
    document.getElementById('score-erros').innerText = errosSimulado;
    document.getElementById('score-total-q').innerText = questoesAtuais.length;

    saveDB();
    if (questaoId) await updateQuestaoStats(questaoId, acertou);
}

async function updateQuestaoStats(id, acertou) {
    if (!currentSession) return;
    const { data } = await supabaseClient.from('questoes').select('historico_respostas').eq('id', id).single();
    let historico = data?.historico_respostas || [];
    historico.unshift(acertou);
    if (historico.length > 3) historico.pop();

    await supabaseClient.from('questoes').update({
        ultima_vez_respondida: new Date(),
        historico_respostas: historico
    }).eq('id', id);
}

/* --- 5. EDITOR DE QUESTÕES --- */
function abrirEditorQuestao(id) {
    const questao = questoesAtuais.find(q => q.id === id);
    if (!questao) return;

    idQuestaoSendoEditada = id;
    document.getElementById('edit-id').value = id;
    document.getElementById('edit-enunciado').value = questao.enunciado;
    document.getElementById('edit-comentario').value = questao.comentario || "";
    document.getElementById('edit-materia').value = questao.materia || "";
    document.getElementById('edit-assunto').value = questao.assunto || "";
    document.getElementById('edit-fonte').value = questao.fonte || "";
    document.getElementById('edit-gabarito').value = questao.gabarito || "";

    document.getElementById('modal-editor').classList.add('active');
}

function fecharEditor() {
    document.getElementById('modal-editor').classList.remove('active');
}

async function salvarEdicaoCompleta() {
    const id = idQuestaoSendoEditada;
    const dados = {
        enunciado: document.getElementById('edit-enunciado').value,
        comentario: document.getElementById('edit-comentario').value,
        materia: document.getElementById('edit-materia').value,
        assunto: document.getElementById('edit-assunto').value,
        fonte: document.getElementById('edit-fonte').value,
        gabarito: document.getElementById('edit-gabarito').value.toLowerCase()
    };

    updateSyncUI('syncing');
    const { error } = await supabaseClient.from('questoes').update(dados).eq('id', id);

    if (error) {
        alert("Erro: " + error.message);
        updateSyncUI('offline');
    } else {
        updateSyncUI('synced');
        fecharEditor();
        const index = questoesAtuais.findIndex(q => q.id == id);
        if (index !== -1) {
            questoesAtuais[index] = { ...questoesAtuais[index], ...dados };
            const el = document.getElementById(`enunciado-${id}`);
            if (el) el.innerHTML = dados.enunciado;
        }
        alert("Salvo com sucesso!");
    }
}

/* --- 6. AUTENTICAÇÃO E UTILITÁRIOS --- */
function toggleAuthModal() { document.getElementById('auth-modal').classList.toggle('active'); }
function closeAuthModal() { document.getElementById('auth-modal').classList.remove('active'); }
function openAuthModal() { document.getElementById("auth-modal").classList.remove("hidden"); }

async function handleAuth() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return alert(error.message);
    location.reload();
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
    const text = document.getElementById('theme-text');
    if (icon) icon.innerText = theme === 'dark' ? '☀️' : '🌙';
    if (text) text.innerText = theme === 'dark' ? 'Modo Claro' : 'Modo Escuro';
}

function toggleConfig() {
    const panel = document.getElementById('config-panel');
    panel.classList.toggle('collapsed');
    document.getElementById('accordion-icon').innerText = panel.classList.contains('collapsed') ? '▼' : '▲';
}

function updateDashboard() {
    const total = db.total_questoes || 0;
    const accuracy = total > 0 ? Math.round((db.acertos / total) * 100) + "%" : "0%";
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    setText('stat-total-q', total);
    setText('stat-accuracy', accuracy);
    setText('stat-flash', db.flashcards || 0);
    setText('stat-xp', db.xp || 0);
}

function highlightActiveMenu() {
    const page = window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll('.menu-item').forEach(item => {
        if (item.getAttribute('href')?.includes(page)) item.classList.add('active');
    });
}