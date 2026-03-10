/* ═══════════════════════════════════════════════════════════════════
   DIPLOMATIQUE — questoes.js (Versão Otimizada)
   ═══════════════════════════════════════════════════════════════════ */

const SIM = {
    XP_ACERTO: 10,
    XP_ERRO_CESPE: -5,
    HIST_MAX: 3,
    POR_MATERIA: 5,
};

// Cache de elementos frequentes para evitar buscas repetidas no DOM
const UI = {
    get scoreAcertos() { return document.getElementById('score-acertos'); },
    get scoreErros() { return document.getElementById('score-erros'); },
    get scoreTotal() { return document.getElementById('score-total-q'); },
    get configPanel() { return document.getElementById('config-panel'); },
    get accordionIcon() { return document.getElementById('accordion-icon'); },
    get clock() { return document.getElementById('clock'); },
    get btnTimer() { return document.getElementById('btn-timer'); }
};

/* ─── 1. UTILITÁRIOS DE INTERFACE ────────────────────────────────── */

function toggleConfig() {
    if (!UI.configPanel) return;
    const isCollapsed = UI.configPanel.classList.toggle('collapsed');
    if (UI.accordionIcon) {
        UI.accordionIcon.innerText = isCollapsed ? '▼' : '▲';
    }
}

function atualizarPlacarUI() {
    if (UI.scoreAcertos) UI.scoreAcertos.innerText = acertosSimulado;
    if (UI.scoreErros) UI.scoreErros.innerText = errosSimulado;
}

/* ─── 2. GERENCIAMENTO DE FILTROS ────────────────────────────────── */

async function carregarMateriasDisponiveis() {
    const selectMateria = document.getElementById('select-materia');
    const datalistAssunto = document.getElementById('assuntos-sugeridos');
    if (!selectMateria || !datalistAssunto) return;

    try {
        const [resMat, resAss] = await Promise.all([
            supabaseClient.from('lista_filtros').select('materia'),
            supabaseClient.from('lista_assuntos').select('assunto')
        ]);

        // 1. Popular Select de Matérias
        if (resMat.data) {
            selectMateria.innerHTML = '<option value="">-- Todas as Matérias --</option>' +
                resMat.data.map(m => `<option value="${m.materia}">${m.materia}</option>`).join('');
        }

        // 2. Popular Datalist de Assuntos (Permite digitar ou selecionar)
        if (resAss.data) {
            datalistAssunto.innerHTML = resAss.data
                .map(a => `<option value="${a.assunto}">`)
                .join('');
        }
    } catch (err) {
        console.error("Erro ao carregar filtros:", err);
    }
}

/* ─── 3. MOTORES DE GERAÇÃO ──────────────────────────────────────── */

async function processQuestions() {
    const materia = document.getElementById('select-materia').value || null;
    const assunto = document.getElementById('set-assunto').value.trim() || null;
    const limite = parseInt(document.getElementById('set-limite').value) || 10;
    const estilo = document.getElementById('set-estilo').value;
    const status = document.getElementById('set-status').value; // <- Capturando o novo filtro

    updateSyncUI('syncing');

    try {
        // Passando o p_status para a RPC no servidor
        const { data, error } = await supabaseClient.rpc('get_random_questions', {
            p_materia: (materia === "") ? null : materia,
            p_assunto: (assunto === "") ? null : assunto,
            p_status: status, // <- Enviando o parâmetro
            p_limite: limite
        });

        if (error || !data?.length) {
            alert("Nenhuma questão encontrada com esses filtros.");
            updateSyncUI('offline');
            return;
        }

        questoesAtuais = data;
        resetarPlacarInterface(questoesAtuais.length);
        renderizarSimulado(estilo);
        toggleConfig();
        updateSyncUI('synced');
    } catch (err) {
        updateSyncUI('offline');
    }
}

async function gerarSimuladoGeral() {
    const estilo = document.getElementById('set-estilo').value;
    updateSyncUI('syncing');
    try {
        const { data: materias, error: errMat } = await supabaseClient
            .from('lista_filtros')
            .select('materia');

        if (errMat) throw errMat;
        if (!materias?.length) return alert('Nenhuma matéria cadastrada.');

        const resultados = await Promise.all(
            materias.map(({ materia }) =>
                supabaseClient.rpc('get_random_questions', {
                    p_materia: materia,
                    p_assunto: null,
                    p_status: 'todas',
                    p_limite: SIM.POR_MATERIA,
                })
            )
        );

        // Detecta erros de RPC (ex: 404 — função não encontrada no Supabase)
        const rpcError = resultados.find(res => res.error);
        if (rpcError) {
            console.error('Erro na RPC get_random_questions:', rpcError.error);
            alert(`Erro ao buscar questões: ${rpcError.error.message || 'Função RPC não encontrada no Supabase.'}`);
            updateSyncUI('offline');
            return;
        }

        const listaFinal = resultados
            .flatMap(res => res.data ?? [])
            .sort(() => Math.random() - 0.5);

        if (!listaFinal.length) throw new Error('Banco vazio');

        questoesAtuais = listaFinal;
        acertosSimulado = 0;
        errosSimulado = 0;
        atualizarPlacarUI();
        if (UI.scoreTotal) UI.scoreTotal.innerText = questoesAtuais.length;
        renderizarSimulado(estilo);
        toggleConfig();
        updateSyncUI('synced');

        const relatorio = resultados
            .map((res, i) => ` • ${materias[i].materia}: ${res.data?.length ?? 0} questões`)
            .join('\n');

        alert(`Simulado: ${questoesAtuais.length} questões\n\n${relatorio}`);
    } catch (err) {
        console.error('Erro no Simulado Geral:', err);
        updateSyncUI('offline');
    }
}

/* ─── 4. RENDERIZAÇÃO ────────────────────────────────────────────── */

function renderizarSimulado(estilo) {
    const container = document.getElementById('questions-render');
    if (!container) return;

    container.innerHTML = questoesAtuais.map((q, i) => `
        <div class="q-container" data-questao-id="${q.id}">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <p style="color:var(--accent-color); font-weight:700; font-size:0.8rem; margin:0;">
                    QUESTÃO ${i + 1} | ${q.banca || 'Geral'}
                </p>
                <button onclick="abrirEditorQuestao(${q.id})" class="btn-mini-reset" style="padding:5px 8px;">✏️</button>
            </div>
            <div class="enunciado" id="enunciado-${q.id}">${q.enunciado}</div>
            <div class="fonte">${q.fonte || ''}</div>
            <div class="options-grid">${renderOptions(estilo, q.gabarito?.toLowerCase().trim() || 'a')}</div>
        </div>
    `).join('');
}

function renderOptions(estilo, gabarito) {
    if (estilo === 'cespe') {
        return `
            <button class="opt-btn" onclick="check(this,'c','${gabarito}','cespe')">Certo</button>
            <button class="opt-btn" onclick="check(this,'e','${gabarito}','cespe')">Errado</button>
        `;
    }
    return ['A', 'B', 'C', 'D', 'E']
        .map(opt => `<button class="opt-btn" onclick="check(this,'${opt.toLowerCase()}','${gabarito}','fgv')">${opt}</button>`)
        .join('');
}

/* ─── 5. LÓGICA DE INTERAÇÃO ─────────────────────────────────────── */

async function check(btn, choice, correct, estilo) {
    const optionsGrid = btn.parentElement;
    if (optionsGrid.classList.contains('answered')) return;

    optionsGrid.classList.add('answered');
    const container = btn.closest('.q-container');
    const questaoId = container.dataset.questaoId;
    
    const norm = (v) => String(v).trim().toLowerCase().charAt(0);
    const acertou = norm(choice) === norm(correct);
    const qData = questoesAtuais.find(q => q.id == questaoId);

    if (acertou) {
        btn.classList.add('correct');
        acertosSimulado++;
        db.acertos++;
        db.xp += SIM.XP_ACERTO;
    } else {
        btn.classList.add('wrong');
        errosSimulado++;
        if (estilo === 'cespe') db.xp = Math.max(0, db.xp + SIM.XP_ERRO_CESPE);
    }

    atualizarPlacarUI();

    if (currentSession && qData) {
        Promise.all([
            supabaseClient.from('resolucoes').insert({
                user_id: currentSession.user.id,
                materia: qData.materia || 'Geral',
                acertou,
                xp_ganho: acertou ? SIM.XP_ACERTO : (estilo === 'cespe' ? SIM.XP_ERRO_CESPE : 0),
                data: new Date().toISOString().split('T')[0],
            }),
            updateQuestaoStats(questaoId, acertou)
        ]).then(() => {
            if (typeof atualizarWidgetsProgresso === 'function') atualizarWidgetsProgresso();
        }).catch(err => console.error('Erro na sincronização:', err));
    }

    if (qData?.comentario) {
        const comDiv = document.createElement('div');
        comDiv.className = 'comentario show-comment';
        comDiv.innerHTML = `<hr style="opacity:0.1; margin:10px 0;"><strong>Comentário:</strong><br>${qData.comentario}`;
        container.appendChild(comDiv);
    }
    saveDB();
}

async function updateQuestaoStats(id, acertou) {
    if (!currentSession) return;
    try {
        const { data } = await supabaseClient.from('questoes').select('historico_respostas').eq('id', id).maybeSingle();
        const hist = [acertou, ...(data?.historico_respostas ?? [])].slice(0, SIM.HIST_MAX);

        await supabaseClient.from('questoes').update({
            ultima_vez_respondida: new Date().toISOString(),
            historico_respostas: hist,
        }).eq('id', id);
    } catch {
        console.warn('Falha ao atualizar stats da questão.');
    }
}

/* ─── 6. EDITOR ─────────────────────────────────────────────────── */

function abrirEditorQuestao(id) {
    const q = questoesAtuais.find(q => q.id === id);
    if (!q) return;

    idQuestaoSendoEditada = id;
    const fields = ['id', 'enunciado', 'comentario', 'materia', 'assunto', 'fonte', 'gabarito'];
    fields.forEach(f => document.getElementById(`edit-${f}`).value = q[f] || '');

    document.getElementById('modal-editor').classList.add('active');
}

async function salvarEdicaoCompleta() {
    const id = idQuestaoSendoEditada;
    const dados = {
        enunciado: document.getElementById('edit-enunciado').value,
        comentario: document.getElementById('edit-comentario').value,
        materia: document.getElementById('edit-materia').value,
        assunto: document.getElementById('edit-assunto').value,
        fonte: document.getElementById('edit-fonte').value,
        gabarito: document.getElementById('edit-gabarito').value.toLowerCase(),
    };

    updateSyncUI('syncing');
    const { error } = await supabaseClient.from('questoes').update(dados).eq('id', id);

    if (error) {
        alert('Erro: ' + error.message);
        updateSyncUI('offline');
        return;
    }

    const index = questoesAtuais.findIndex(q => q.id == id);
    if (index !== -1) {
        questoesAtuais[index] = { ...questoesAtuais[index], ...dados };
        const el = document.getElementById(`enunciado-${id}`);
        if (el) el.innerHTML = dados.enunciado;
    }
   

    updateSyncUI('synced');
    fecharEditor();
}

/* ─── 7. TIMER & INIT ────────────────────────────────────────────── */

function toggleTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
        if (UI.btnTimer) UI.btnTimer.innerText = 'Retomar';
    } else {
        if (UI.btnTimer) UI.btnTimer.innerText = 'Pausar';
        timerInterval = setInterval(() => {
            secondsElapsed++;
            updateTimerDisplay();
        }, 1000);
    }
}

function updateTimerDisplay() {
    if (!UI.clock) return;
    const pad = (n) => String(n).padStart(2, '0');
    const h = Math.floor(secondsElapsed / 3600);
    const m = Math.floor((secondsElapsed % 3600) / 60);
    const s = secondsElapsed % 60;
    UI.clock.innerText = `${pad(h)}:${pad(m)}:${pad(s)}`;
}

document.addEventListener('DOMContentLoaded', () => {
    carregarMateriasDisponiveis();
    setTimeout(() => {
        if (typeof atualizarWidgetsProgresso === 'function') {
            atualizarWidgetsProgresso();
        }
    }, 1500);
});

/* ─── 8. FUNÇÕES AUSENTES ────────────────────────────────────────── */
function fecharEditor() {
    document.getElementById('modal-editor').classList.remove('active');
    idQuestaoSendoEditada = null;
}
function resetarPlacarInterface(total) {
    acertosSimulado = 0;
    errosSimulado = 0;
    atualizarPlacarUI();
    if (UI.scoreTotal) UI.scoreTotal.innerText = total;
}