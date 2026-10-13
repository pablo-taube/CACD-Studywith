/* ═══════════════════════════════════════════════════════════════════
   DIPLOMATIQUE — app.js
   Funcionalidades por página. Cada módulo só inicia se os elementos
   da sua página existirem. Substitui: charts.js e questoes.js
   (e define renderGeneric/clearData, que não existiam em nenhum arquivo).
   Requer core.js carregado antes.
   ═══════════════════════════════════════════════════════════════════ */
(() => {
    'use strict';

    if (!window.App) {
        console.error('app.js: carregue core.js antes deste arquivo.');
        return;
    }
    const {
        sb, state, $, on, emit, onReady, saveDB, setSync, showToast, confirmar,
        escapeHtml, dataLocalISO, segundaDaSemana, defaultDB, store,
    } = window.App;

    const setTexto = (id, valor) => { const el = $(id); if (el) el.textContent = valor; };

    /* ═══ 1. DASHBOARD ═══════════════════════════════════════════════ */
    function iniciarDashboard() {
        if (!$('stat-total-q') && !$('chartSemanal') && !$('ranking-list')) return;

        let grafico = null;
        let resolucoes = [];
        let agendado = null;

        /* — Utilitários de cor (o canvas não entende variáveis CSS) — */
        const lerCssVar = (nome, padrao) =>
            getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || padrao;

        function corComAlpha(hex, alpha) {
            const m = /^#?([0-9a-f]{6})$/i.exec(hex);
            if (!m) return hex;
            const n = parseInt(m[1], 16);
            return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
        }

        /* — Dados — */
        // Retorna null em erro, para não zerar a tela por uma falha momentânea
        async function carregar() {
            if (!sb || !state.session) return null;
            const { data, error } = await sb
                .from('resolucoes')
                .select('data, materia, acertou, xp_ganho')
                .eq('user_id', state.session.user.id);
            if (error) {
                console.error('Erro ao carregar resoluções:', error);
                return null;
            }
            return data || [];
        }

        /* — Cards de hoje — */
        function renderStats() {
            const doDia = resolucoes.filter((r) => r.data === dataLocalISO());
            const acertos = doDia.filter((r) => r.acertou).length;
            setTexto('stat-total-q', doDia.length);
            setTexto('stat-accuracy', `${doDia.length ? Math.round((acertos / doDia.length) * 100) : 0}%`);
            setTexto('stat-xp', doDia.reduce((soma, r) => soma + (r.xp_ganho || 0), 0));
        }

        const renderFlashcards = () => setTexto('stat-flash', state.db.flashcards || 0);

        /* — Gráfico semanal — */
        function renderGrafico() {
            const canvas = $('chartSemanal');
            if (!canvas || typeof Chart === 'undefined') return;

            const segunda = segundaDaSemana();
            const acertos = [0, 0, 0, 0, 0, 0, 0];
            const erros = [0, 0, 0, 0, 0, 0, 0];

            resolucoes.forEach((r) => {
                const [a, m, d] = String(r.data).split('-').map(Number);
                const dia = Math.round((new Date(a, m - 1, d) - segunda) / 86400000);
                if (dia >= 0 && dia < 7) (r.acertou ? acertos : erros)[dia]++;
            });

            // Cores vindas do CSS: acompanham o tema claro/escuro
            const cor = {
                ok:    lerCssVar('--success', '#6FBF98'),
                erro:  lerCssVar('--error', '#E29A9A'),
                texto: lerCssVar('--text-muted', '#64748B'),
                grade: lerCssVar('--border-color', 'rgba(30,60,90,0.10)'),
                dica:  lerCssVar('--dark', '#1F2F42'),
            };
            const fonte = { family: "'Inter', -apple-system, 'Segoe UI', sans-serif", size: 12 };

            const serie = (label, dados, c) => ({
                label,
                data: dados,
                borderColor: c,
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                backgroundColor: (ctx) => {
                    const { ctx: g, chartArea } = ctx.chart;
                    if (!chartArea) return corComAlpha(c, 0.15);
                    const grad = g.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                    grad.addColorStop(0, corComAlpha(c, 0.28));
                    grad.addColorStop(1, corComAlpha(c, 0));
                    return grad;
                },
                pointRadius: 0,
                pointHoverRadius: 5,
                pointHoverBorderWidth: 2,
                pointHoverBackgroundColor: c,
                pointHoverBorderColor: '#fff',
            });

            grafico?.destroy();
            grafico = new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: {
                    labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
                    datasets: [serie('Acertos', acertos, cor.ok), serie('Erros', erros, cor.erro)],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: {
                            position: 'top',
                            align: 'end',
                            labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 7, boxHeight: 7, color: cor.texto, font: fonte },
                        },
                        tooltip: {
                            backgroundColor: cor.dica,
                            titleColor: '#fff',
                            bodyColor: 'rgba(255,255,255,0.85)',
                            padding: 10,
                            cornerRadius: 10,
                            usePointStyle: true,
                            titleFont: { ...fonte, weight: '600' },
                            bodyFont: fonte,
                        },
                    },
                    scales: {
                        x: { grid: { display: false }, border: { display: false }, ticks: { color: cor.texto, font: fonte } },
                        y: { beginAtZero: true, border: { display: false }, grid: { color: cor.grade }, ticks: { color: cor.texto, font: fonte, precision: 0 } },
                    },
                },
            });
        }

        /* — Ranking de matérias (também chamado pelo onchange do select) — */
        function renderRanking() {
            const container = $('ranking-list');
            if (!container) return;

            const periodo = $('rank-periodo')?.value || 'semana';
            // "Semana atual" = desde a segunda-feira, igual ao gráfico (ISO compara como texto)
            const inicio = dataLocalISO(segundaDaSemana());
            const base = periodo === 'semana' ? resolucoes.filter((r) => r.data >= inicio) : resolucoes;

            const mapa = {};
            base.forEach((r) => {
                const chave = r.materia || 'Geral';
                mapa[chave] ||= { total: 0, acertos: 0 };
                mapa[chave].total++;
                if (r.acertou) mapa[chave].acertos++;
            });

            const ranking = Object.entries(mapa)
                .map(([materia, s]) => ({ materia, total: s.total, precisao: Math.round((s.acertos / s.total) * 100) }))
                .sort((a, b) => b.precisao - a.precisao || b.total - a.total);

            container.innerHTML = ranking.length
                ? ranking.map((item, i) => `
                    <div class="rank-item">
                        <div class="rank-head">
                            <span class="rank-name"><span class="rank-pos">${i + 1}</span>${escapeHtml(item.materia)}</span>
                            <span class="rank-meta">${item.precisao}% · ${item.total} q.</span>
                        </div>
                        <div class="rank-bar"><span style="--w:${item.precisao}%"></span></div>
                    </div>`).join('')
                : '<p class="rank-empty">Nenhum dado no período.</p>';
        }

        /* — Orquestração — */
        async function atualizar() {
            renderFlashcards();
            const dados = await carregar();
            if (!dados) return;
            resolucoes = dados;
            renderStats();
            renderGrafico();
            renderRanking();
        }

        // Várias gravações seguidas viram uma única atualização
        const agendar = () => { clearTimeout(agendado); agendado = setTimeout(atualizar, 250); };

        on('db-saved', renderFlashcards);
        on('progress-updated', agendar);

        // O gráfico lê cores do CSS; redesenha ao trocar o tema
        new MutationObserver(renderGrafico)
            .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

        window.renderizarRanking = renderRanking;
        atualizar();
    }

    /* ═══ 2. QUESTÕES / SIMULADO ═════════════════════════════════════ */
    function iniciarQuestoes() {
        if (!$('questions-render')) return;

        const SIM = Object.freeze({ XP_ACERTO: 10, XP_ERRO_CESPE: -5, HIST_MAX: 3, POR_MATERIA: 5 });
        const ICONE_EDITAR = '<svg class="menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';

        let questoes = [];
        let acertos = 0;
        let erros = 0;
        let editandoId = null;

        /* — Painel de configuração — */
        function definirConfigColapsado(colapsado) {
            $('config-panel')?.classList.toggle('collapsed', colapsado);
            setTexto('accordion-icon', colapsado ? '▼' : '▲');
        }
        const toggleConfig = () => definirConfigColapsado(!$('config-panel')?.classList.contains('collapsed'));

        /* — Placar — */
        function atualizarPlacar() {
            setTexto('score-acertos', acertos);
            setTexto('score-erros', erros);
            const respondidas = acertos + erros;
            setTexto('score-pct', respondidas ? `${Math.round((acertos / respondidas) * 100)}%` : '—');
        }

        function iniciarSimulado(lista, estilo) {
            questoes = lista;
            acertos = 0;
            erros = 0;
            atualizarPlacar();
            setTexto('score-total-q', lista.length);
            renderizarSimulado(estilo);
            definirConfigColapsado(true);
        }

        /* — Filtros — */
        async function carregarFiltros() {
            const selectMateria = $('select-materia');
            const datalist = $('assuntos-sugeridos');
            if (!sb || !selectMateria || !datalist) return;

            try {
                const [materias, assuntos] = await Promise.all([
                    sb.from('lista_filtros').select('materia'),
                    sb.from('lista_assuntos').select('assunto'),
                ]);
                if (materias.data) {
                    selectMateria.innerHTML = '<option value="">Todas as matérias</option>' +
                        materias.data.map((m) => `<option value="${escapeHtml(m.materia)}">${escapeHtml(m.materia)}</option>`).join('');
                }
                if (assuntos.data) {
                    datalist.innerHTML = assuntos.data.map((a) => `<option value="${escapeHtml(a.assunto)}">`).join('');
                }
            } catch (err) {
                console.error('Erro ao carregar filtros:', err);
            }
        }

        /* — Geração — */
        const buscarQuestoes = ({ materia = null, assunto = null, status = 'todas', limite }) =>
            sb.rpc('get_random_questions', {
                p_materia: materia || null,
                p_assunto: assunto || null,
                p_status: status,
                p_limite: limite,
            });

        // Fisher–Yates (sort(() => Math.random() - 0.5) gera embaralhamento enviesado)
        function embaralhar(lista) {
            const a = [...lista];
            for (let i = a.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        }

        async function processQuestions() {
            if (!sb) return showToast('Sem conexão com o servidor.', 'error');

            const estilo = $('set-estilo').value;
            setSync('syncing');
            try {
                const { data, error } = await buscarQuestoes({
                    materia: $('select-materia').value,
                    assunto: $('set-assunto').value.trim(),
                    status: $('set-status').value,
                    limite: Math.max(parseInt($('set-limite').value, 10) || 10, 1),
                });
                if (error || !data?.length) {
                    showToast('Nenhuma questão encontrada com esses filtros.', 'error');
                    setSync('offline');
                    return;
                }
                iniciarSimulado(data, estilo);
                setSync('synced');
            } catch (err) {
                console.error('Erro ao gerar simulado:', err);
                showToast('Não foi possível gerar o simulado. Tente novamente.', 'error');
                setSync('offline');
            }
        }

        async function gerarSimuladoGeral() {
            if (!sb) return showToast('Sem conexão com o servidor.', 'error');

            const estilo = $('set-estilo').value;
            setSync('syncing');
            try {
                const { data: materias, error } = await sb.from('lista_filtros').select('materia');
                if (error) throw error;
                if (!materias?.length) {
                    showToast('Nenhuma matéria cadastrada.', 'error');
                    setSync('offline');
                    return;
                }

                const resultados = await Promise.all(
                    materias.map(({ materia }) => buscarQuestoes({ materia, limite: SIM.POR_MATERIA })),
                );

                // Ex.: 404 quando a função RPC não existe no Supabase
                const falha = resultados.find((r) => r.error);
                if (falha) {
                    console.error('Erro na RPC get_random_questions:', falha.error);
                    showToast(`Erro ao buscar questões: ${falha.error.message || 'função RPC não encontrada.'}`, 'error');
                    setSync('offline');
                    return;
                }

                const lista = embaralhar(resultados.flatMap((r) => r.data ?? []));
                if (!lista.length) throw new Error('Banco vazio');

                iniciarSimulado(lista, estilo);
                setSync('synced');
                console.info('Simulado geral:\n' + resultados
                    .map((r, i) => ` • ${materias[i].materia}: ${r.data?.length ?? 0} questões`).join('\n'));
                showToast(`Simulado geral gerado: ${lista.length} questões de ${materias.length} matérias.`, 'success');
            } catch (err) {
                console.error('Erro no simulado geral:', err);
                showToast('Não foi possível gerar o simulado geral.', 'error');
                setSync('offline');
            }
        }

        /* — Renderização — */
        function opcoesHtml(estilo) {
            const rotulos = estilo === 'cespe'
                ? [['c', 'Certo'], ['e', 'Errado']]
                : ['a', 'b', 'c', 'd', 'e'].map((l) => [l, l.toUpperCase()]);
            return rotulos
                .map(([valor, texto]) => `<button type="button" class="opt-btn" data-choice="${valor}">${texto}</button>`)
                .join('');
        }

        function renderizarSimulado(estilo) {
            const container = $('questions-render');
            const tipo = estilo === 'cespe' ? 'cespe' : 'fgv';

            container.innerHTML = questoes.map((q, i) => {
                const gabarito = String(q.gabarito ?? '').toLowerCase().trim() || 'a';
                return `
                <div class="q-container" data-questao-id="${escapeHtml(q.id)}">
                    <div class="q-header">
                        <div class="q-meta">
                            <span class="q-number">Questão ${i + 1}</span>
                            <span class="q-banca">${escapeHtml(q.banca || 'Geral')}</span>
                        </div>
                        <button type="button" class="btn-icon" data-editar="${escapeHtml(q.id)}" aria-label="Editar questão" title="Editar questão">${ICONE_EDITAR}</button>
                    </div>
                    <div class="enunciado" id="enunciado-${escapeHtml(q.id)}">${q.enunciado}</div>
                    ${q.fonte ? `<div class="fonte">${q.fonte}</div>` : ''}
                    <div class="options-grid options-grid--${tipo}" data-gabarito="${escapeHtml(gabarito)}" data-estilo="${tipo}">${opcoesHtml(tipo)}</div>
                </div>`;
            }).join('');
        }

        /* — Resposta — */
        async function atualizarHistoricoQuestao(id, acertou) {
            try {
                const { data } = await sb.from('questoes').select('historico_respostas').eq('id', id).maybeSingle();
                const historico = [acertou, ...(data?.historico_respostas ?? [])].slice(0, SIM.HIST_MAX);
                await sb.from('questoes').update({
                    ultima_vez_respondida: new Date().toISOString(),
                    historico_respostas: historico,
                }).eq('id', id);
            } catch {
                console.warn('Falha ao atualizar o histórico da questão.');
            }
        }

        async function registrarResolucao(q, acertou, estilo) {
            const xp = acertou ? SIM.XP_ACERTO : (estilo === 'cespe' ? SIM.XP_ERRO_CESPE : 0);
            const [insercao] = await Promise.all([
                sb.from('resolucoes').insert({
                    user_id: state.session.user.id,
                    materia: q.materia || 'Geral',
                    acertou,
                    xp_ganho: xp,
                    data: dataLocalISO(),
                }),
                atualizarHistoricoQuestao(q.id, acertou),
            ]);
            if (insercao.error) {
                console.error('Erro ao registrar a resolução:', insercao.error);
                setSync('offline');
                return;
            }
            emit('progress-updated');
        }

        function responder(botao) {
            const grade = botao.parentElement;
            if (grade.classList.contains('answered')) return;
            grade.classList.add('answered');

            const cartao = botao.closest('.q-container');
            const estilo = grade.dataset.estilo;
            const primeira = (v) => String(v).trim().toLowerCase().charAt(0);
            const certa = primeira(grade.dataset.gabarito);
            const acertou = primeira(botao.dataset.choice) === certa;
            const q = questoes.find((x) => String(x.id) === cartao.dataset.questaoId);

            if (acertou) {
                botao.classList.add('correct');
                acertos++;
                state.db.acertos++;
                state.db.xp += SIM.XP_ACERTO;
            } else {
                botao.classList.add('wrong');
                grade.querySelector(`[data-choice="${certa}"]`)?.classList.add('correct');   // mostra a correta
                erros++;
                if (estilo === 'cespe') state.db.xp = Math.max(0, state.db.xp + SIM.XP_ERRO_CESPE);
            }
            atualizarPlacar();

            if (sb && state.session && q) registrarResolucao(q, acertou, estilo);

            if (q?.comentario) {
                const caixa = document.createElement('div');
                caixa.className = 'comentario show-comment';
                caixa.innerHTML = `<div class="comentario-title">Comentário</div><div class="comentario-body">${q.comentario}</div>`;
                cartao.appendChild(caixa);
            }
            saveDB();
        }

        // Delegação de eventos: um único ouvinte para todas as questões
        $('questions-render').addEventListener('click', (e) => {
            const opcao = e.target.closest('.opt-btn');
            if (opcao) return responder(opcao);
            const editar = e.target.closest('[data-editar]');
            if (editar) abrirEditor(editar.dataset.editar);
        });

        /* — Editor — */
        const CAMPOS_EDITOR = ['id', 'enunciado', 'comentario', 'materia', 'assunto', 'fonte', 'gabarito'];

        function abrirEditor(id) {
            const q = questoes.find((x) => String(x.id) === String(id));
            if (!q) return;
            editandoId = q.id;
            CAMPOS_EDITOR.forEach((campo) => { $(`edit-${campo}`).value = q[campo] ?? ''; });
            $('modal-editor').classList.add('active');
        }

        function fecharEditor() {
            $('modal-editor')?.classList.remove('active');
            editandoId = null;
        }

        async function salvarEdicaoCompleta() {
            if (editandoId === null || !sb) return;
            const id = editandoId;
            const dados = {
                enunciado: $('edit-enunciado').value,
                comentario: $('edit-comentario').value,
                materia: $('edit-materia').value,
                assunto: $('edit-assunto').value,
                fonte: $('edit-fonte').value,
                gabarito: $('edit-gabarito').value.toLowerCase(),
            };

            setSync('syncing');
            const { error } = await sb.from('questoes').update(dados).eq('id', id);
            if (error) {
                showToast(`Erro ao salvar: ${error.message}`, 'error');
                setSync('offline');
                return;
            }

            const idx = questoes.findIndex((q) => String(q.id) === String(id));
            if (idx !== -1) {
                questoes[idx] = { ...questoes[idx], ...dados };
                const el = $(`enunciado-${id}`);
                if (el) el.innerHTML = dados.enunciado;
            }
            setSync('synced');
            showToast('Questão atualizada.', 'success', 2500);
            fecharEditor();
        }

        /* — Timer (baseado em timestamps: não "atrasa" com a aba em segundo plano) — */
        let acumuladoMs = 0;
        let retomadoEm = null;
        let intervalo = null;

        const decorridoMs = () => acumuladoMs + (retomadoEm ? Date.now() - retomadoEm : 0);

        function atualizarRelogio() {
            const total = Math.floor(decorridoMs() / 1000);
            const p = (n) => String(n).padStart(2, '0');
            setTexto('clock', `${p(Math.floor(total / 3600))}:${p(Math.floor((total % 3600) / 60))}:${p(total % 60)}`);
        }

        function toggleTimer() {
            if (retomadoEm) {                                    // pausar
                acumuladoMs += Date.now() - retomadoEm;
                retomadoEm = null;
                clearInterval(intervalo);
                intervalo = null;
                setTexto('btn-timer', 'Retomar');
            } else {                                             // iniciar / retomar
                retomadoEm = Date.now();
                intervalo = setInterval(atualizarRelogio, 500);
                setTexto('btn-timer', 'Pausar');
            }
            atualizarRelogio();
        }

        function resetTimer() {
            clearInterval(intervalo);
            intervalo = null;
            acumuladoMs = 0;
            retomadoEm = null;
            atualizarRelogio();
            setTexto('btn-timer', 'Iniciar');
        }

        /* — Início — */
        carregarFiltros();
        Object.assign(window, {
            toggleConfig, processQuestions, gerarSimuladoGeral,
            salvarEdicaoCompleta, fecharEditor, toggleTimer, resetTimer,
        });
    }

    /* ═══ 3. REVISÃO E FLASHCARDS ════════════════════════════════════ */
    // false: mantém onclick/onmouseover etc. do HTML colado (necessário para flashcards interativos).
    // true: remove todos os atributos on*. Scripts e URLs javascript: são sempre removidos.
    const REMOVER_EVENTOS_INLINE = false;

    function sanitizarHtml(html) {
        const tpl = document.createElement('template');         // não executa scripts
        tpl.innerHTML = html;
        tpl.content.querySelectorAll('script, iframe, object, embed, base, meta[http-equiv]')
            .forEach((el) => el.remove());

        tpl.content.querySelectorAll('*').forEach((el) => {
            [...el.attributes].forEach((attr) => {
                const nome = attr.name.toLowerCase();
                const valor = attr.value.replace(/\s+/g, '').toLowerCase();
                const ehUrl = ['href', 'src', 'xlink:href', 'formaction', 'action'].includes(nome);
                if ((ehUrl && valor.startsWith('javascript:')) || (REMOVER_EVENTOS_INLINE && nome.startsWith('on'))) {
                    el.removeAttribute(attr.name);
                }
            });
        });
        return tpl.innerHTML;
    }

    // Convenção de contagem (ajuste se o seu HTML for diferente):
    // 1) elementos .flashcard / .flash-card / [data-flashcard]; 2) <details>; 3) filhos diretos.
    function contarFlashcards(container) {
        const marcados = container.querySelectorAll('.flashcard, .flash-card, [data-flashcard]');
        if (marcados.length) return marcados.length;
        const detalhes = container.querySelectorAll('details');
        if (detalhes.length) return detalhes.length;
        return container.children.length;
    }

    const chaveRascunho = (inputId) => `donezo_conteudo:${inputId}`;

    function renderGeneric(inputId, outputId, contar = false) {
        const entrada = $(inputId);
        const saida = $(outputId);
        if (!entrada || !saida) return;

        const html = entrada.value.trim();
        if (!html) {
            saida.innerHTML = '';
            store.remove(chaveRascunho(inputId));
            showToast('Cole algum conteúdo antes de renderizar.', 'info');
            return;
        }

        saida.innerHTML = sanitizarHtml(html);
        store.set(chaveRascunho(inputId), html);                // rascunho local (não vai para a nuvem)

        if (contar) {
            const total = contarFlashcards(saida);
            state.db.flashcards = total;
            saveDB();
            showToast(`${total} flashcard${total === 1 ? '' : 's'} salvo${total === 1 ? '' : 's'}.`, 'success');
        }
    }

    function iniciarConteudo() {
        [['revisao-input', 'revisao-out'], ['flash-input', 'flash-out']].forEach(([entradaId, saidaId]) => {
            const entrada = $(entradaId);
            const saida = $(saidaId);
            if (!entrada || !saida) return;
            const rascunho = store.get(chaveRascunho(entradaId));
            if (rascunho) {
                entrada.value = rascunho;
                saida.innerHTML = sanitizarHtml(rascunho);
            }
        });
    }

    /* ═══ 4. RESETAR DADOS ═══════════════════════════════════════════ */
    async function clearData() {
        const resetar = await confirmar({
            titulo: 'Resetar progresso?',
            mensagem: 'XP, acertos e contadores serão zerados neste dispositivo e na nuvem. Essa ação não pode ser desfeita.',
            confirmar: 'Resetar',
            perigo: true,
        });
        if (!resetar) return;

        // O histórico alimenta o gráfico semanal e o ranking: apagar é uma decisão separada
        const apagarHistorico = sb && state.session
            ? await confirmar({
                titulo: 'Apagar também o histórico?',
                mensagem: 'Remove as questões já resolvidas que alimentam o gráfico semanal e o ranking.',
                confirmar: 'Apagar histórico',
                cancelar: 'Manter histórico',
                perigo: true,
            })
            : false;

        state.db = defaultDB();
        await saveDB();

        if (apagarHistorico) {
            const { error } = await sb.from('resolucoes').delete().eq('user_id', state.session.user.id);
            if (error) {
                console.error('Erro ao apagar o histórico:', error);
                showToast(`Não foi possível apagar o histórico: ${error.message}`, 'error');
                return;
            }
        }
        emit('progress-updated');
        showToast('Progresso resetado.', 'success');
    }

    /* ═══ 5. INICIALIZAÇÃO ═══════════════════════════════════════════ */
    Object.assign(window, { renderGeneric, clearData });

    onReady(() => {
        iniciarDashboard();
        iniciarQuestoes();
        iniciarConteudo();
    });
})();