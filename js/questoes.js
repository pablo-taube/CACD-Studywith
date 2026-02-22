async function carregarMateriasDisponiveis() {
    const selectMateria = document.getElementById('select-materia');
    if (!selectMateria) return;
    try {
        const { data, error } = await supabaseClient.from('questoes').select('materia, assunto');
        if (error) throw error;
        const materiasUnicas = [...new Set(data.map(item => item.materia))].filter(Boolean).sort();
        selectMateria.innerHTML = '<option value="">-- Todas as Matérias --</option>';
        materiasUnicas.forEach(materia => {
            const option = document.createElement('option');
            option.value = materia; option.textContent = materia;
            selectMateria.appendChild(option);
        });
    } catch (err) { console.error("Erro ao carregar filtros:", err); }
}

async function processQuestions() {
    const materia = document.getElementById('select-materia').value;
    const assunto = document.getElementById('set-assunto').value.trim();
    const estilo = document.getElementById('set-estilo').value;
    const limite = parseInt(document.getElementById('set-limite').value) || 10;
    
    updateSyncUI('syncing');
    try {
        let query = supabaseClient.from('questoes').select('*');
        if (materia) query = query.eq('materia', materia);
        if (assunto) query = query.ilike('assunto', `%${assunto}%`);

        const { data, error } = await query;
        if (error || !data?.length) return alert("Nenhuma questão encontrada.");

        questoesAtuais = data.sort(() => Math.random() - 0.5).slice(0, limite);
        acertosSimulado = 0; errosSimulado = 0;
        renderizarSimulado(estilo);
        updateSyncUI('synced');
    } catch (err) { updateSyncUI('offline'); }
}

function renderizarSimulado(estilo) {
    const container = document.getElementById('questions-render');
    if (!container) return;
    container.innerHTML = "";
    questoesAtuais.forEach((qObj, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = "q-container";
        wrapper.dataset.questaoId = qObj.id;
        let gabaritoFinal = qObj.gabarito ? qObj.gabarito.toLowerCase().trim() : "a";
        
        wrapper.innerHTML = `
            <div style="display:flex; justify-content:space-between;">
                <p>QUESTÃO ${index + 1} | ${qObj.banca || 'Geral'}</p>
                <button onclick="abrirEditorQuestao(${qObj.id})">✏️</button>
            </div>
            <div class="enunciado">${qObj.enunciado}</div>
            <div class="options-grid">${renderOptions(estilo, gabaritoFinal)}</div>
        `;
        container.appendChild(wrapper);
    });
}

function renderOptions(estilo, gabarito) {
    if (estilo === 'cespe') {
        return `<button class="opt-btn" onclick="check(this,'c','${gabarito}','cespe')">Certo</button>
                <button class="opt-btn" onclick="check(this,'e','${gabarito}','cespe')">Errado</button>`;
    }
    return ['A','B','C','D','E'].map(opt => `<button class="opt-btn" onclick="check(this,'${opt.toLowerCase()}','${gabarito}','fgv')">${opt}</button>`).join('');
}

async function check(btn, choice, correct, estilo) {
    const container = btn.closest('.q-container');
    const optionsGrid = btn.parentElement;
    const questaoId = container.dataset.questaoId;
    if (optionsGrid.classList.contains('answered')) return;
    optionsGrid.classList.add('answered');

    const normalizar = (v) => String(v).trim().toLowerCase().charAt(0);
    const acertou = normalizar(choice) === normalizar(correct);
    const qData = questoesAtuais.find(q => q.id == questaoId);

    if (acertou) { btn.classList.add('correct'); acertosSimulado++; db.acertos++; db.xp += 10; }
    else { btn.classList.add('wrong'); errosSimulado++; if (estilo === 'cespe') db.xp -= 5; }

    if (currentSession && qData) {
        await supabaseClient.from('resolucoes').insert({
            user_id: currentSession.user.id,
            materia: qData.materia || "Geral",
            acertou: acertou,
            xp_ganho: acertou ? 10 : (estilo === 'cespe' ? -5 : 0),
            data: new Date().toISOString().split('T')[0]
        });
    }
    saveDB();
    if (questaoId) updateQuestaoStats(questaoId, acertou);
}

async function updateQuestaoStats(id, acertou) {
    if (!currentSession) return;
    const { data } = await supabaseClient.from('questoes').select('historico_respostas').eq('id', id).single();
    let hist = data?.historico_respostas || [];
    hist.unshift(acertou);
    await supabaseClient.from('questoes').update({ ultima_vez_respondida: new Date(), historico_respostas: hist.slice(0,3) }).eq('id', id);
}

/* --- EDITOR DE QUESTÕES (questoes.js) --- */
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

// Funções de Editor omitidas por brevidade, mas devem ficar aqui.