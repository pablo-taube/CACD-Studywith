let meuGrafico = null;

async function updateDashboard() {
    if (!currentSession) return;
    const { data, error } = await supabaseClient.from('resolucoes').select('*').eq('user_id', currentSession.user.id);
    if (error) return;
    dadosResolucoes = data;

    const hoje = new Date().toISOString().split('T')[0];
    const deHoje = data.filter(r => r.data === hoje);

    document.getElementById('stat-total-q').innerText = deHoje.length;
    document.getElementById('stat-xp').innerText = deHoje.reduce((acc, r) => acc + r.xp_ganho, 0);
    
    renderizarGraficoSemanal(data);
    renderizarRanking();
}

function renderizarGraficoSemanal(data) {
    const ctx = document.getElementById('chartSemanal')?.getContext('2d');
    if (!ctx) return;

    const diasLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
    
    // Calcula a segunda-feira da semana atual (Local)
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const diaDaSemana = hoje.getDay(); 
    const diffParaSegunda = diaDaSemana === 0 ? -6 : 1 - diaDaSemana;
    
    const segundaFeira = new Date(hoje);
    segundaFeira.setDate(hoje.getDate() + diffParaSegunda);

    const acertosData = [0, 0, 0, 0, 0, 0, 0];
    const errosData = [0, 0, 0, 0, 0, 0, 0];

    data.forEach(res => {
        // Converte a string YYYY-MM-DD do banco para objeto Date local (meia-noite)
        const partes = res.data.split('-');
        const dataRes = new Date(partes[0], partes[1] - 1, partes[2]);
        
        // Verifica se está dentro da semana atual (Segunda 00:00 até Domingo 23:59)
        const diffTempo = dataRes.getTime() - segundaFeira.getTime();
        const diffDias = Math.round(diffTempo / (1000 * 60 * 60 * 24));

        if (diffDias >= 0 && diffDias < 7) {
            if (res.acertou) acertosData[diffDias]++;
            else errosData[diffDias]++;
        }
    });
    
    // ... resto do código do Chart.js (meuGrafico.destroy e new Chart)
}

function renderizarRanking() {
    const periodo = document.getElementById('rank-periodo')?.value || 'semana';
    const lista = document.getElementById('ranking-list');
    if (!lista) return;

    // ... Lógica de filtro e reduce para o Ranking (mesma do seu código original)
}

/* --- LÓGICA DE DATAS (charts.js) --- */
function renderizarGraficoSemanal(data) {
    const ctx = document.getElementById('chartSemanal')?.getContext('2d');
    if (!ctx) return;

    const diasLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
    const hoje = new Date();
    const diaDaSemana = hoje.getDay(); 
    const diffParaSegunda = hoje.getDate() - diaDaSemana + (diaDaSemana === 0 ? -6 : 1);
    const segundaFeira = new Date(hoje.setDate(diffParaSegunda));
    segundaFeira.setHours(0, 0, 0, 0);

    const acertosData = [0, 0, 0, 0, 0, 0, 0];
    const errosData = [0, 0, 0, 0, 0, 0, 0];

    data.forEach(res => {
        const dataRes = new Date(res.data + "T00:00:00");
        if (dataRes >= segundaFeira) {
            const diffDias = Math.floor((dataRes - segundaFeira) / (1000 * 60 * 60 * 24));
            if (diffDias >= 0 && diffDias < 7) {
                if (res.acertou) acertosData[diffDias]++;
                else errosData[diffDias]++;
            }
        }
    });

    if (meuGrafico) meuGrafico.destroy();
    meuGrafico = new Chart(ctx, {
        type: 'line',
        data: {
            labels: diasLabels,
            datasets: [
                { label: 'Acertos', data: acertosData, borderColor: '#25614D', backgroundColor: 'rgba(37, 97, 77, 0.1)', fill: true, tension: 0.4 },
                { label: 'Erros', data: errosData, borderColor: '#e74c3c', backgroundColor: 'rgba(231, 76, 60, 0.1)', fill: true, tension: 0.4 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // Aguarda um momento para o auth.js carregar a sessão
    setTimeout(inicializarDashboard, 1000);
});

async function inicializarDashboard() {
    if (!currentSession) return;

    const { data: resolucoes, error } = await supabaseClient
        .from('resolucoes')
        .select('*')
        .eq('user_id', currentSession.user.id);

    if (error) {
        console.error("Erro ao carregar dados:", error);
        return;
    }

    atualizarStatsHoje(resolucoes);
    gerarGraficoSemanal(resolucoes);
    renderizarRanking(resolucoes);
}

// 1. Atualiza os cards superiores (Questões, Acertos %, Flashcards, XP)
function atualizarStatsHoje(dados) {
    // Captura a data local no formato YYYY-MM-DD sem interferência de fuso horário
    const agora = new Date();
    const hojeLocal = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
    
    const resolucoesHoje = dados.filter(r => r.data === hojeLocal);
    
    const totalQ = resolucoesHoje.length;
    const acertos = resolucoesHoje.filter(r => r.acertou).length;
    const precisao = totalQ > 0 ? Math.round((acertos / totalQ) * 100) : 0;
    const xpTotal = resolucoesHoje.reduce((acc, curr) => acc + (curr.xp_ganho || 0), 0);

    if(document.getElementById('stat-total-q')) document.getElementById('stat-total-q').innerText = totalQ;
    if(document.getElementById('stat-accuracy')) document.getElementById('stat-accuracy').innerText = `${precisao}%`;
    if(document.getElementById('stat-xp')) document.getElementById('stat-xp').innerText = xpTotal;
}   
    // Obs: stat-flash deve ser integrado com sua lógica de flashcards futuramente

// 3. Ranking de Disciplinas
async function renderizarRanking(dadosPassados = null) {
    let dados = dadosPassados;
    
    // Se a função for chamada pelo onchange do select, ela busca os dados novamente
    if (!dados) {
        const { data } = await supabaseClient
            .from('resolucoes')
            .select('*')
            .eq('user_id', currentSession.user.id);
        dados = data;
    }

    const periodo = document.getElementById('rank-periodo').value;
    const container = document.getElementById('ranking-list');
    if (!container || !dados) return;

    // Filtro de Período
    let dadosFiltrados = dados;
    if (periodo === 'semana') {
        const umaSemanaAtras = new Date();
        umaSemanaAtras.setDate(umaSemanaAtras.getDate() - 7);
        dadosFiltrados = dados.filter(r => new Date(r.data) >= umaSemanaAtras);
    }

    // Agrupar por Matéria
    const rankingMap = {};
    dadosFiltrados.forEach(r => {
        if (!rankingMap[r.materia]) rankingMap[r.materia] = { total: 0, acertos: 0 };
        rankingMap[r.materia].total++;
        if (r.acertou) rankingMap[r.materia].acertos++;
    });

    const rankingFinal = Object.entries(rankingMap)
        .map(([materia, stat]) => ({
            materia,
            precisao: Math.round((stat.acertos / stat.total) * 100),
            total: stat.total
        }))
        .sort((a, b) => b.precisao - a.precisao);

    container.innerHTML = rankingFinal.length ? rankingFinal.map(item => `
        <div class="ranking-item" style="display:flex; flex-direction:column; gap:4px">
            <div style="display:flex; justify-content:space-between; font-size:13px">
                <span style="font-weight:600">${item.materia}</span>
                <span style="color:var(--text-muted)">${item.precisao}% (${item.total} q.)</span>
            </div>
            <div style="width:100%; height:8px; background:rgba(0,0,0,0.05); border-radius:4px; overflow:hidden">
                <div style="width:${item.precisao}%; height:100%; background:#25614D; border-radius:4px"></div>
            </div>
        </div>
    `).join('') : '<p style="font-size:12px; color:var(--text-muted)">Nenhum dado no período.</p>';
}