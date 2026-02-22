/* --- 1. CONFIGURAÇÃO E FILTROS --- */

function toggleConfig() {
    const panel = document.getElementById('config-panel');
    if (!panel) return;
    panel.classList.toggle('collapsed');
    const icon = document.getElementById('accordion-icon');
    if (icon) icon.innerText = panel.classList.contains('collapsed') ? '▼' : '▲';
}

async function carregarMateriasDisponiveis() {
    const selectMateria = document.getElementById('select-materia');
    const datalistAssunto = document.getElementById('assuntos-sugeridos');
    if (!selectMateria) return;

    try {
        const { data, error } = await supabaseClient.from('questoes').select('materia, assunto');
        if (error) throw error;

        // Popular Matérias (Unicas e Ordenadas)
        const materiasUnicas = [...new Set(data.map(item => item.materia))].filter(Boolean).sort();
        selectMateria.innerHTML = '<option value="">-- Todas as Matérias --</option>';
        materiasUnicas.forEach(materia => {
            const option = document.createElement('option');
            option.value = materia; option.textContent = materia;
            selectMateria.appendChild(option);
        });

        // Popular Datalist de Assuntos para o Autocomplete
        if (datalistAssunto) {
            const assuntosUnicos = [...new Set(data.map(item => item.assunto))].filter(Boolean).sort();
            datalistAssunto.innerHTML = assuntosUnicos.map(a => `<option value="${a}">`).join('');
        }
    } catch (err) { console.error("Erro ao carregar filtros:", err); }
}

/* --- 2. GERAÇÃO DO SIMULADO --- */

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
        if (error || !data?.length) {
            alert("Nenhuma questão encontrada com esses filtros.");
            updateSyncUI('offline');
            return;
        }

        questoesAtuais = data.sort(() => Math.random() - 0.5).slice(0, limite);
        
        // Resetar Placar do Simulado
        acertosSimulado = 0; 
        errosSimulado = 0;
        document.getElementById('score-acertos').innerText = "0";
        document.getElementById('score-erros').innerText = "0";
        document.getElementById('score-total-q').innerText = questoesAtuais.length;

        renderizarSimulado(estilo);
        toggleConfig(); 
        updateSyncUI('synced');
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
        
        let gabaritoFinal = qObj.gabarito ? qObj.gabarito.toLowerCase().trim() : "a";
        
        wrapper.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <p style="color:var(--accent-color); font-weight:700; font-size:0.8rem; margin:0;">
                    QUESTÃO ${index + 1} | ${qObj.banca || 'Geral'}
                </p>
                <button onclick="abrirEditorQuestao(${qObj.id})" class="btn-mini-reset" style="padding:5px 8px;">✏️</button>
            </div>
            <div class="enunciado" id="enunciado-${qObj.id}">${qObj.enunciado}</div>
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
    return ['A','B','C','D','E'].map(opt => 
        `<button class="opt-btn" onclick="check(this,'${opt.toLowerCase()}','${gabarito}','fgv')">${opt}</button>`
    ).join('');
}

/* --- 3. CORREÇÃO E STATS --- */

async function check(btn, choice, correct, estilo) {
    const container = btn.closest('.q-container');
    const optionsGrid = btn.parentElement;
    const questaoId = container.dataset.questaoId;
    
    if (optionsGrid.classList.contains('answered')) return;
    optionsGrid.classList.add('answered');

    const normalizar = (v) => String(v).trim().toLowerCase().charAt(0);
    const acertou = normalizar(choice) === normalizar(correct);
    const qData = questoesAtuais.find(q => q.id == questaoId);

    if (acertou) { 
        btn.classList.add('correct'); 
        acertosSimulado++; db.acertos++; db.xp += 10; 
    } else { 
        btn.classList.add('wrong'); 
        errosSimulado++; 
        if (estilo === 'cespe') db.xp = Math.max(0, db.xp - 5); 
    }

    document.getElementById('score-acertos').innerText = acertosSimulado;
    document.getElementById('score-erros').innerText = errosSimulado;

    if (currentSession && qData) {
        await supabaseClient.from('resolucoes').insert({
            user_id: currentSession.user.id,
            materia: qData.materia || "Geral",
            acertou: acertou,
            xp_ganho: acertou ? 10 : (estilo === 'cespe' ? -5 : 0),
            data: new Date().toISOString().split('T')[0]
        });
    }

    if (qData?.comentario) {
        const comDiv = document.createElement('div');
        comDiv.className = "comentario show-comment";
        comDiv.innerHTML = `<hr style="opacity:0.1; margin:10px 0;"><strong>Comentário:</strong><br>${qData.comentario}`;
        container.appendChild(comDiv);
    }

    saveDB();
    if (questaoId) updateQuestaoStats(questaoId, acertou);
}

async function updateQuestaoStats(id, acertou) {
    if (!currentSession) return;
    const { data } = await supabaseClient.from('questoes').select('historico_respostas').eq('id', id).single();
    let hist = data?.historico_respostas || [];
    hist.unshift(acertou);
    await supabaseClient.from('questoes').update({ 
        ultima_vez_respondida: new Date(), 
        historico_respostas: hist.slice(0,3) 
    }).eq('id', id);
}

/* --- 4. EDITOR DE QUESTÕES --- */

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

/* --- 5. SISTEMA DE TIMER --- */

let timerInterval = null;
let secondsElapsed = 0;

function toggleTimer() {
    const btn = document.getElementById('btn-timer');
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
        if (btn) btn.innerText = "Retomar";
    } else {
        if (btn) btn.innerText = "Pausar";
        timerInterval = setInterval(() => {
            secondsElapsed++;
            updateTimerDisplay();
        }, 1000);
    }
}

function resetTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    secondsElapsed = 0;
    updateTimerDisplay();
    const btn = document.getElementById('btn-timer');
    if (btn) btn.innerText = "Iniciar";
}

function updateTimerDisplay() {
    const clock = document.getElementById('clock');
    if (!clock) return;
    const hrs = Math.floor(secondsElapsed / 3600);
    const mins = Math.floor((secondsElapsed % 3600) / 60);
    const secs = secondsElapsed % 60;
    const format = (num) => String(num).padStart(2, '0');
    clock.innerText = `${format(hrs)}:${format(mins)}:${format(secs)}`;
}