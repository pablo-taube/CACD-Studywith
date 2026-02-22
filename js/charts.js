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

    const acertosData = [0,0,0,0,0,0,0];
    const errosData = [0,0,0,0,0,0,0];
    // ... Lógica de preenchimento dos arrays (mesma do seu código original)

    if (meuGrafico) meuGrafico.destroy();
    meuGrafico = new Chart(ctx, {
        type: 'line',
        data: { /* ... seus dados ... */ },
        options: { responsive: true, maintainAspectRatio: false }
    });
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