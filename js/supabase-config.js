/* --- CONFIGURAÇÃO SUPABASE --- */
const SUPABASE_URL = 'https://ozhtjngfedtslwgeafyv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_nP-XLqixj7YPWh1AoDFfAQ_JHQSlRF-';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* --- ESTADO GLOBAL --- */
let db = { total_questoes: 0, acertos: 0, flashcards: 0, xp: 0, materias: {}, simuladoAtivo: null };
let currentSession = null;
let acertosSimulado = 0;
let errosSimulado = 0;
let questoesAtuais = [];
let idQuestaoSendoEditada = null;
let dadosResolucoes = []; // Para o Dashboard e Ranking

/* --- MONITOR DE ARMAZENAMENTO --- */
async function atualizarStatusArmazenamento() {
    try {
        const { data, error } = await supabaseClient.rpc('get_db_size_total');
        
        const storageEl = document.getElementById('db-storage-val');
        if (storageEl && !error) {
            storageEl.innerText = data;
        }
    } catch (err) {
        console.error("Erro ao ler armazenamento:", err);
    }
}

// Adicione a chamada dentro do seu listener de inicialização existente
document.addEventListener('DOMContentLoaded', () => {
    // ... suas outras chamadas (carregarMaterias, etc)
    atualizarStatusArmazenamento();
});