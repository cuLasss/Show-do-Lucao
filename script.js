// ===== Variáveis Globais =====
let token = null;
let currentQuestionIndex = 0;
let score = 0;
let questions = [];
let categoryQueue = [];
let isRequesting = false;
let requestingCategory = null;
let requestingDifficultyLabel = null;
let lastNetworkAt = 0;
const MIN_NET_INTERVAL_MS = 3000; // espaçamento mínimo entre chamadas para evitar 429 (3s)
const exhaustedCategories = new Set();
const failStreakByCategory = new Map();
let initialDifficulty = 'easy';

const usedPowerUps = {
    cards: false,
    askAudience: false,
    skipQuestion: false
};

// Tabela de prêmios
const prizeValues = [
    { win: 500, lose: 100, stop: 250 },
    { win: 1000, lose: 200, stop: 500 },
    { win: 2000, lose: 400, stop: 1000 },
    { win: 3000, lose: 600, stop: 1500 },
    { win: 5000, lose: 1000, stop: 2000 },
    { win: 10000, lose: 2000, stop: 5000 },
    { win: 15000, lose: 3000, stop: 7500 },
    { win: 20000, lose: 4000, stop: 10000 },
    { win: 30000, lose: 6000, stop: 15000 },
    { win: 50000, lose: 10000, stop: 25000 },
    { win: 100000, lose: 20000, stop: 50000 },
    { win: 150000, lose: 30000, stop: 75000 },
    { win: 300000, lose: 60000, stop: 150000 },
    { win: 500000, lose: 100000, stop: 250000 },
    { win: 1000000, lose: 200000, stop: 500000 }
];

// ===== Utilidades =====
function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

function shuffleArray(array) {
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function sanitize(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatMoney(n) {
    return Number(n).toLocaleString('pt-BR');
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// Resilient fetch that falls back to public CORS proxies on CORS/network errors
async function fetchJsonResilient(url, options = {}) {
    // Timeout helper por tentativa
    async function fetchWithTimeout(resource, opts = {}, timeoutMs = 2500) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(resource, { ...opts, signal: controller.signal, cache: 'no-store' });
            clearTimeout(id);
            return res;
        } catch (e) {
            clearTimeout(id);
            throw e;
        }
    }

    // Proxies mais estáveis primeiro; evitamos proxies com DNS/403 frequentes
    const transforms = [
        // corsproxy.io (encoda a URL)
        u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
        // AllOrigins get (formato { contents })
        u => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
        // Jina reader como fallback (texto -> JSON)
        u => `https://r.jina.ai/http://${u.replace(/^https?:\/\//, '')}`,
        // Direto, por último (pode falhar por CORS)
        u => u,
    ];

    let lastErr = null;
    for (let i = 0; i < transforms.length; i++) {
        const attemptUrl = transforms[i](url);
        try {
            // rate limit global: garante intervalo mínimo entre requisições
            const now = Date.now();
            const delta = now - lastNetworkAt;
            if (delta < MIN_NET_INTERVAL_MS) {
                await delay(MIN_NET_INTERVAL_MS - delta);
            }
            const res = await fetchWithTimeout(attemptUrl, options, 3500);
            lastNetworkAt = Date.now();
            if (!res.ok) {
                const err = new Error(`HTTP ${res.status}`);
                err.status = res.status;
                throw err;
            }

            // Se for AllOrigins get
            if (attemptUrl.includes('api.allorigins.win/get')) {
                const wrap = await res.json();
                if (wrap && typeof wrap.contents === 'string') {
                    return JSON.parse(wrap.contents);
                }
                throw new Error('AllOrigins invalid payload');
            }

            // Tente JSON direto
            try { return await res.json(); } catch (_) { }

            // Ou parsear texto como JSON
            const txt = await res.text();
            try { return JSON.parse(txt); } catch (_) { throw new Error('Invalid JSON'); }
        } catch (e) {
            lastErr = e;
            // Se 429, aguarda mais tempo antes de tentar próximo fallback
            if (e && e.status === 429) {
                await delay(MIN_NET_INTERVAL_MS + 800);
                lastNetworkAt = Date.now();
            } else {
                await delay(200);
            }
        }
    }
    throw lastErr || new Error('fetch failed');
}

function showGlobalLoading(show = true) {
    const overlay = $('#global-loading');
    if (!overlay) return;
    overlay.style.display = show ? 'flex' : 'none';
    const msg = document.getElementById('global-loading-message');
    if (msg) msg.textContent = 'Carregando...';
    const btn = document.getElementById('try-random-category');
    if (btn) btn.style.display = 'none';
}

// ===== UI Helpers (globais) =====
function showNotice(text) {
    const notice = document.getElementById('notice-modal');
    const noticeText = document.getElementById('notice-text');
    const noticeOk = document.getElementById('notice-ok');
    if (noticeText) noticeText.textContent = text || 'Aviso';
    if (notice) notice.style.display = 'flex';
    if (noticeOk) {
        noticeOk.onclick = () => { if (notice) notice.style.display = 'none'; };
        try { noticeOk.focus(); } catch (_) { }
    }
}

// ===== API Tryvia =====
async function generateToken() {
    try {
        const data = await fetchJsonResilient('https://tryvia.ptr.red/api_token.php?command=request');
        if (data.response_code === 0 && data.token) {
            token = data.token;
        } else {
            console.warn('Falha ao gerar token PT:', data);
            token = null;
        }
    } catch (e) {
        console.error('Erro ao gerar token PT:', e);
        token = null;
    }
}

async function getCategories() {
    try {
        const data = await fetchJsonResilient('https://tryvia.ptr.red/api_category.php');
        return Array.isArray(data?.trivia_categories) ? data.trivia_categories : [];
    } catch (e) {
        console.error('Erro ao obter categorias PT:', e);
        return [];
    }
}

async function fetchPTQuestionByCategory(categoryId, difficulty = 'easy') {
    const params = new URLSearchParams();
    params.set('amount', '1');
    params.set('category', String(categoryId || 0));
    params.set('type', 'multiple');
    params.set('difficulty', difficulty);
    if (token) params.set('token', token);

    const url = `https://tryvia.ptr.red/api.php?${params.toString()}`;
    const data = await fetchJsonResilient(url);
    if (data.response_code !== 0 || !Array.isArray(data.results) || data.results.length === 0) {
        const err = new Error(`Tryvia sem resultados (code ${data.response_code ?? 'unknown'})`);
        err.response_code = data.response_code;
        err.empty = true;
        throw err;
    }
    return data.results[0];
}

async function getQuestionByCategory(categoryId, preferredDifficulty = 'easy') {
    const diffs = ['easy', 'medium', 'hard'];
    const ordered = [preferredDifficulty, ...diffs.filter(d => d !== preferredDifficulty)];

    let lastErr = null;
    for (let i = 0; i < ordered.length; i++) {
        try {
            requestingDifficultyLabel = ordered[i];
            // espaçamento extra por tentativa para evitar 429 em sequência
            const now = Date.now();
            const delta = now - lastNetworkAt;
            if (delta < MIN_NET_INTERVAL_MS) {
                await delay(MIN_NET_INTERVAL_MS - delta);
            }
            const q = await fetchPTQuestionByCategory(categoryId, ordered[i]);
            lastNetworkAt = Date.now();
            return q;
        } catch (e) {
            lastErr = e;
            // Evitar many requests: pequenas pausas bem curtas
            const wait = e.status === 429 ? MIN_NET_INTERVAL_MS + 400 : 300;
            await delay(wait);
        }
    }
    throw lastErr || new Error('Falha ao obter pergunta PT');
}

// ===== Fluxo do jogo =====
document.addEventListener('DOMContentLoaded', () => {
    const startBtn = $('#start-button');
    if (startBtn) startBtn.addEventListener('click', startGame);

    // Mini modal helpers
    const notice = document.getElementById('notice-modal');
    const noticeText = document.getElementById('notice-text');
    const noticeOk = document.getElementById('notice-ok');
    function showNotice(text) {
        if (noticeText) noticeText.textContent = text || 'Selecione apenas 5 categorias!';
        if (notice) notice.style.display = 'flex';
        if (noticeOk) {
            noticeOk.onclick = () => { if (notice) notice.style.display = 'none'; };
            noticeOk.focus();
        }
    }

    $all('#category-selection input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', function () {
            const label = this.parentElement;
            if (label) {
                if (this.checked) { label.style.backgroundColor = '#007BFF'; label.style.color = '#fff'; }
                else { label.style.backgroundColor = '#fff'; label.style.color = '#333'; }
            }

            const all = $all('#category-selection input[type="checkbox"]');
            const anyCategory = all.find(cb => cb.value === '0');

            // Regra "Qualquer Categoria"
            if (this.value === '0' && this.checked) {
                all.forEach(cb => { if (cb.value !== '0') { cb.checked = false; cb.parentElement && (cb.parentElement.style.backgroundColor = '#fff', cb.parentElement.style.color = '#333'); } });
            }
            if (this.value !== '0' && this.checked && anyCategory && anyCategory.checked) {
                anyCategory.checked = false;
                if (anyCategory.parentElement) { anyCategory.parentElement.style.backgroundColor = '#fff'; anyCategory.parentElement.style.color = '#333'; }
            }

            // Limite de 5: apenas exibe modal e desfaz a marcação extra
            const selectedCount = $all('#category-selection input[type="checkbox"]:checked').length;
            if (selectedCount > 5) {
                this.checked = false;
                if (label) { label.style.backgroundColor = '#fff'; label.style.color = '#333'; }
                showNotice('Selecione apenas 5 categorias!');
            }
        });
    });

    const stopBtn = $('#stop-prize');
    if (stopBtn) stopBtn.addEventListener('click', stopGame);

    const powerButtons = $all('#power-ups .power-up');
    powerButtons.forEach(btn => btn.addEventListener('click', () => usePowerUp(btn.dataset.type)));

    const closeAudienceBtn = document.getElementById('close-audience-help');
    if (closeAudienceBtn) closeAudienceBtn.onclick = closeAudienceHelp;

    (async function initCategoriesUI() {
        const cats = await getCategories();
        console.log('Categorias PT disponíveis:', cats);
    })();

    const powerUps = $('#power-ups');
    if (powerUps) powerUps.style.display = 'none';
    const prizesCard = $('#prizes-card');
    if (prizesCard) prizesCard.style.display = 'none';

    showGlobalLoading(false);
});

async function startGame() {
    currentQuestionIndex = 0;
    score = 0;
    questions = [];
    usedPowerUps.cards = false;
    usedPowerUps.askAudience = false;
    usedPowerUps.skipQuestion = false;

    const diffSelect = $('#difficulty-select');
    initialDifficulty = diffSelect ? diffSelect.value : 'easy';

    const selection = $('#difficulty-selection');
    showGlobalLoading(true);
    if (selection) selection.style.display = 'none';

    try {
        await generateToken();
        const ok = await loadQuestions();
        if (!ok) {
            if (selection) selection.style.display = 'block';
            showGlobalLoading(false);
            return;
        }

        document.body.classList.add('game-started');

        $('#score').style.display = 'block';
        $('#quiz-container').style.display = 'block';

        const powerUps = $('#power-ups');
        if (powerUps) powerUps.style.display = 'flex';

        const prizesCard = $('#prizes-card');
        if (prizesCard) prizesCard.style.display = 'block';

        updateScoreDisplay();
        updatePrizeDisplay();
    } catch (e) {
        showNotice('Não foi possível iniciar o jogo no momento. Tente novamente.');
        if (selection) selection.style.display = 'block';
    } finally {
        showGlobalLoading(false);
    }
}

async function loadQuestions() {
    if (isRequesting) return false;

    const selected = $all('#category-selection input[type="checkbox"]:checked');
    if (selected.length === 0) {
        const nm = document.getElementById('notice-modal');
        const nt = document.getElementById('notice-text');
        const ok = document.getElementById('notice-ok');
        if (nt) nt.textContent = 'Selecione ao menos 1 categoria para iniciar.';
        if (nm) nm.style.display = 'flex';
        if (ok) ok.onclick = () => { if (nm) nm.style.display = 'none'; };
        return false;
    }
    if (selected.length > 5) {
        const nm = document.getElementById('notice-modal');
        const nt = document.getElementById('notice-text');
        const ok = document.getElementById('notice-ok');
        if (nt) nt.textContent = 'Selecione apenas 5 categorias!';
        if (nm) nm.style.display = 'flex';
        if (ok) ok.onclick = () => { if (nm) nm.style.display = 'none'; };
        return false;
    }

    if (selected.some(cb => cb.value === '0')) {
        categoryQueue = [0];
    } else {
        categoryQueue = shuffleArray(selected.map(cb => Number(cb.value)));
    }

    let gotOne = false;
    try {
        await prefetchNextQuestion();
        gotOne = questions.length > 0;
    } catch (e) {
        console.warn('Falha inicial ao pré-buscar pergunta:', e);
    }

    if (gotOne) {
        currentQuestionIndex = 0;
        showQuestion();
        return true;
    } else {
        showNotice('Não foi possível carregar perguntas agora. Tente novamente mais tarde.');
        return false;
    }
}

async function prefetchNextQuestion(opts = {}) {
    if (isRequesting) return;
    if (categoryQueue.length === 0) return;

    isRequesting = true;
    try {
        // Em modo rápido, testar até 4 categorias antes de ceder
        const maxSpins = Math.min(categoryQueue.length, opts.fast ? 4 : 2);
        let added = false;

        for (let spin = 0; spin < maxSpins && !added; spin++) {
            let category = categoryQueue.shift();
            // Se categoria está exaurida, pule
            while (exhaustedCategories.has(category) && categoryQueue.length > 0) {
                category = categoryQueue.shift();
            }
            requestingCategory = category;
            // Atualiza mensagem de loading com categoria e dificuldade correntes
            const msgCat = document.getElementById('global-loading-message');
            if (msgCat) {
                const catLabel = getCategoryLabel(requestingCategory);
                const diffLabel = (requestingDifficultyLabel || initialDifficulty || 'easy');
                msgCat.textContent = `Buscando pergunta... — ${catLabel} · ${diffLabel}`;
            }

            try {
                // Primeiro tenta com a dificuldade atual e fallback entre easy/medium/hard
                // Respeita rate limit global entre categorias
                const now = Date.now();
                const delta = now - lastNetworkAt;
                if (delta < MIN_NET_INTERVAL_MS) {
                    await delay(MIN_NET_INTERVAL_MS - delta);
                }
                let q = await getQuestionByCategory(category, initialDifficulty);
                lastNetworkAt = Date.now();
                if (!q || !q.question) throw new Error('empty');
                const exists = questions.some(x => x.question === q.question && x.correct_answer === q.correct_answer);
                if (!exists) {
                    questions.push(q);
                    added = true;
                    // sucesso: zera o contador de falhas dessa categoria
                    failStreakByCategory.set(category, 0);
                }
            } catch (e) {
                console.debug(`Sem pergunta para categoria ${category} no momento:`, e?.message || e);
                // Marca falha na categoria e, se exceder 3 falhas, considera exaurida no jogo atual
                const fails = (failStreakByCategory.get(category) || 0) + 1;
                failStreakByCategory.set(category, fails);
                if (fails >= 3) {
                    exhaustedCategories.add(category);
                    const msg = document.getElementById('global-loading-message');
                    if (msg) msg.textContent = `Categoria ${getCategoryLabel(category)} esgotada. Tentando próxima...`;
                }
            }

            // Empurra categoria para o fim da fila para tentar depois
            // Refileira categoria somente se não estiver exaurida
            if (!exhaustedCategories.has(category)) categoryQueue.push(category);
            if (!added) await delay(opts.fast ? 120 : 250);
        }

        // Fallback final: tentar "Qualquer Categoria" (0) com ciclo de dificuldades
        if (!added) {
            try {
                requestingCategory = 0; // indica fallback visualmente
                const msg2 = document.getElementById('global-loading-message');
                if (msg2) msg2.textContent = `Buscando pergunta... — ${getCategoryLabel(0)} · ${(requestingDifficultyLabel || initialDifficulty || 'easy')} (fallback)`;
                const anyCatQuestion = await getQuestionByCategory(0, initialDifficulty);
                if (anyCatQuestion && anyCatQuestion.question) {
                    const exists = questions.some(x => x.question === anyCatQuestion.question && x.correct_answer === anyCatQuestion.correct_answer);
                    if (!exists) {
                        questions.push(anyCatQuestion);
                        added = true;
                    }
                }
            } catch (e) {
                console.debug('Fallback "Qualquer Categoria" falhou:', e?.message || e);
            }
        }
    } finally {
        requestingCategory = null;
        isRequesting = false;
    }
}

async function showQuestion() {
    if (!questions[currentQuestionIndex]) {
        await prefetchNextQuestion();
    }

    if (!questions[currentQuestionIndex]) {
        const optionsDiv = $('#options');
        const qEl = $('#question');
        if (qEl) qEl.textContent = 'Carregando pergunta...';
        if (optionsDiv) optionsDiv.innerHTML = '';
        $('#next-button').style.display = 'none';
        return;
    }

    const q = questions[currentQuestionIndex];
    $('#question').innerHTML = sanitize(q.question);

    const options = shuffleArray([...(q.incorrect_answers || []), q.correct_answer]);
    const optionsDiv = $('#options');
    optionsDiv.innerHTML = options.map(opt => `<button class="option-btn">${sanitize(opt)}</button>`).join('');

    $all('#options .option-btn').forEach(btn => {
        btn.onclick = () => openConfirmModal(btn);
        btn.disabled = false;
        btn.classList.remove('correct', 'incorrect');
        btn.style.display = '';
        btn.style.pointerEvents = 'auto';
    });

    $('#next-button').style.display = 'none';

    enablePowerUpsForNewQuestion();

    const quizContainer = $('#quiz-container');
    if (quizContainer) {
        quizContainer.style.opacity = 0;
        requestAnimationFrame(() => { quizContainer.style.opacity = 1; });
    }

    updatePrizeDisplay();

    setTimeout(() => {
        prefetchNextQuestion().catch(() => { });
    }, 200);
}

function openConfirmModal(selectedButton) {
    const confirmModal = document.getElementById('confirm-modal');
    const choiceEl = document.getElementById('confirm-choice');
    const okBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');
    if (choiceEl) choiceEl.textContent = selectedButton.textContent;
    if (confirmModal) confirmModal.style.display = 'flex';

    if (cancelBtn) cancelBtn.onclick = () => { if (confirmModal) confirmModal.style.display = 'none'; };
    if (okBtn) okBtn.onclick = () => {
        if (confirmModal) confirmModal.style.display = 'none';
        checkAnswer(selectedButton);
    };
}

function checkAnswer(selectedButton) {
    const q = questions[currentQuestionIndex];
    const correctAnswer = q.correct_answer;
    const optionsButtons = $all('#options button');
    const currentPrize = prizeValues[Math.min(currentQuestionIndex, prizeValues.length - 1)];

    const stopBtn = $('#stop-prize');
    if (stopBtn) stopBtn.disabled = true;

    optionsButtons.forEach(btn => { btn.disabled = true; btn.style.pointerEvents = 'none'; });

    disablePowerUps();

    const nextBtn = $('#next-button');
    nextBtn.style.display = 'none';
    nextBtn.onclick = null;

    if (selectedButton.textContent === correctAnswer) {
        selectedButton.classList.add('correct');
        score = currentPrize.win;
        updateScoreDisplay();

        // Mostra modal de acerto e oferece "Próxima"
        const cmodal = document.getElementById('correct-modal');
        const cnext = document.getElementById('correct-next');
        const ctext = document.getElementById('correct-text');
        if (ctext) ctext.textContent = `Parabéns! Você ganhou R$ ${formatMoney(currentPrize.win)} Reais!`;
        if (cmodal) cmodal.style.display = 'flex';
        if (cnext) cnext.onclick = async () => {
            // Se esta foi a pergunta final (R$ 1.000.000), encerra imediatamente
            if (currentPrize.win >= 1000000 || currentQuestionIndex >= prizeValues.length - 1) {
                if (cmodal) cmodal.style.display = 'none';
                document.body.classList.add('final-state');
                showFinalResult({
                    title: 'Parabéns!',
                    message: `Você é o grande ganhador! Sua pontuação final é: R$ ${formatMoney(score)}`
                });
                return;
            }

            if (cmodal) cmodal.style.display = 'none';
            showGlobalLoading(true);
            const ok = await ensureNextQuestionReady({ fastSwitch: true });
            showGlobalLoading(false);
            if (ok) nextQuestion();
            else showNotice('Não foi possível preparar a próxima pergunta ainda. Tentaremos novamente em instantes.');
        };
    } else {
        selectedButton.classList.add('incorrect');
        optionsButtons.forEach(btn => { if (btn.textContent === correctAnswer) btn.classList.add('correct'); });
        score = currentPrize.lose;
        updateScoreDisplay();

        // Entrar em estado final e abrir modal de fim de jogo
        document.body.classList.add('final-state');
        showFinalResult({
            title: 'Resposta incorreta',
            message: `Você levou para casa R$ ${formatMoney(score)}.`
        });

        // Preenche detalhes de resposta
        const detail = document.getElementById('game-over-detail');
        if (detail) {
            detail.innerHTML = `Você selecionou: <strong>${sanitize(selectedButton.textContent)}</strong><br>Resposta correta: <strong>${sanitize(correctAnswer)}</strong>`;
        }
    }
}

async function nextQuestion() {
    $all('#options button').forEach(btn => {
        btn.classList.remove('correct', 'incorrect');
        btn.disabled = false;
        btn.style.display = '';
        btn.style.pointerEvents = 'auto';
    });
    const inline = document.getElementById('restart-inline');
    if (inline) inline.remove();

    if (currentQuestionIndex >= prizeValues.length - 1) {
        // Final do jogo (vencedor)
        showFinalResult({
            title: 'Parabéns!',
            message: `Você é o grande ganhador! Sua pontuação final é: R$ ${formatMoney(score)}`
        });
        return;
    }

    // Garantir que a próxima pergunta já foi pré-carregada (com backoff e fallback)
    if (!questions[currentQuestionIndex + 1]) {
        const ok = await ensureNextQuestionReady();
        // Se por algum motivo ainda não houver, permanece no loader (não fecha)
        if (!ok) return;
    }

    currentQuestionIndex++;

    const stopBtn = $('#stop-prize');
    if (stopBtn) stopBtn.disabled = false;

    enablePowerUpsForNewQuestion();
    showQuestion();
}

function stopGame() {
    const idx = Math.min(currentQuestionIndex, prizeValues.length - 1);
    const currentPrize = prizeValues[idx];
    score = currentPrize.stop;
    updateScoreDisplay();

    // Sinaliza estado final para centralização perfeita
    document.body.classList.add('final-state');

    // Encerra UI do quiz e mostra tela final com mensagem de "Parou"
    showFinalResult({
        title: 'Você decidiu parar!',
        message: `Você decidiu parar e ganhou R$ ${formatMoney(score)}.`
    });
}

// Reiniciar com mesmas categorias/dificuldade
function restartWithSameSelection() {
    // Sai do estado final
    document.body.classList.remove('final-state');

    // Apenas recarrega perguntas sem limpar seleção
    currentQuestionIndex = 0;
    questions = [];
    exhaustedCategories.clear();
    failStreakByCategory.clear();
    usedPowerUps.cards = false;
    usedPowerUps.askAudience = false;
    usedPowerUps.skipQuestion = false;

    const selection = $('#difficulty-selection');
    if (selection) selection.style.display = 'none';

    // Reexibe UI do jogo
    document.body.classList.add('game-started');
    $('#score').style.display = 'block';
    $('#quiz-container').style.display = 'block';
    const powerUps = $('#power-ups'); if (powerUps) powerUps.style.display = 'flex';
    const prizesCard = $('#prizes-card'); if (prizesCard) prizesCard.style.display = 'block';

    showGlobalLoading(true);
    loadQuestions()
        .then(ok => {
            if (ok) {
                updateScoreDisplay();
                updatePrizeDisplay();
            } else {
                showNotice('Não foi possível reiniciar agora. Tente novamente.');
            }
        })
        .finally(() => showGlobalLoading(false));
}

// Retorna para seleção inicial
function resetToInitialSelection() {
    document.body.classList.remove('final-state');
    // Limpa estado e volta para a seleção
    document.body.classList.remove('game-started');
    const selection = $('#difficulty-selection'); if (selection) selection.style.display = 'block';
    $('#quiz-container').style.display = 'none';
    const prizesCard = $('#prizes-card'); if (prizesCard) prizesCard.style.display = 'none';
    const powerUps = $('#power-ups'); if (powerUps) powerUps.style.display = 'none';
    $('#score').style.display = 'none';
    exhaustedCategories.clear();
    failStreakByCategory.clear();
}

// ===== Tela Final Genérica =====
function showFinalResult({ title, message }) {
    // Esconde áreas do jogo que não são o final
    const quizEl = $('#quiz-container'); if (quizEl) quizEl.style.display = 'none';
    const prizesCard = $('#prizes-card'); if (prizesCard) prizesCard.style.display = 'none';
    const powerUps = $('#power-ups'); if (powerUps) powerUps.style.display = 'none';
    const scoreEl = $('#score'); if (scoreEl) scoreEl.style.display = 'none';

    // Garante que a seleção inicial não apareça
    const selection = $('#difficulty-selection'); if (selection) selection.style.display = 'none';

    // Modal de Fim de Jogo (substitui card final)
    const gameOver = document.getElementById('game-over-modal');
    const gameText = document.getElementById('game-over-text');
    const btnSame = document.getElementById('game-over-retry-same');
    const btnNew = document.getElementById('game-over-new');
    if (gameText) gameText.textContent = message || 'Fim de jogo';
    if (gameOver) gameOver.style.display = 'flex';

    if (btnSame) btnSame.onclick = () => {
        if (gameOver) gameOver.style.display = 'none';
        // Recomeça com as mesmas categorias e dificuldade
        restartWithSameSelection();
    };

    if (btnNew) btnNew.onclick = () => {
        if (gameOver) gameOver.style.display = 'none';
        // Mostra novamente a seleção inicial
        resetToInitialSelection();
    };
}

// ===== Power-Ups =====
function enablePowerUpsForNewQuestion() {
    $all('#power-ups .power-up').forEach(btn => {
        const type = btn.dataset.type;
        const wasUsed = !!usedPowerUps[type];

        btn.dataset.label = btn.dataset.label || btn.textContent.trim();

        btn.disabled = wasUsed;
        btn.classList.remove('animating');

        if (wasUsed) {
            btn.classList.add('used');
            btn.setAttribute('aria-label', `${btn.dataset.label} usado`);
        } else {
            btn.classList.remove('used');
            btn.removeAttribute('aria-label');
            btn.textContent = btn.dataset.label;
        }
    });

    // Se todos usados, mostra placeholder amigável
    const allUsed = Object.values(usedPowerUps).every(Boolean);
    const empty = document.getElementById('power-ups-empty');
    if (empty) empty.style.display = allUsed ? 'block' : 'none';
}
function disablePowerUps() { $all('#power-ups .power-up').forEach(btn => btn.disabled = true); }

async function usePowerUp(type) {
    if (usedPowerUps[type]) {
        showNotice('Você já usou essa opção nesta rodada!');
        return;
    }

    const button = document.getElementById(`power-${type}`);
    if (!button) { console.error(`Botão power-${type} não encontrado!`); return; }

    if (type === 'skipQuestion') {
        // Para o skip, só marcar como usado após a navegação bem sucedida
        const previousIndex = currentQuestionIndex;
        const result = await trySkipToNextQuestion();
        if (!result) {
            // Falhou em buscar a próxima: não consome o power-up
            return;
        }
        // Sucesso: consome o power-up visualmente
        usedPowerUps.skipQuestion = true;
        button.dataset.label = button.dataset.label || button.textContent.trim();
        button.classList.add('animating');
        setTimeout(() => {
            button.classList.add('used');
            button.textContent = '';
            button.disabled = true;
            button.setAttribute('aria-label', 'Power-up usado');
        }, 400);
        setTimeout(() => { button.classList.remove('animating'); }, 820);
        return;
    }

    // Demais poderes: consome imediatamente como antes
    usedPowerUps[type] = true;
    button.dataset.label = button.dataset.label || button.textContent.trim();
    button.classList.add('animating');
    setTimeout(() => {
        button.classList.add('used');
        button.textContent = '';
        button.disabled = true;
        button.setAttribute('aria-label', 'Power-up usado');
    }, 400);
    setTimeout(() => { button.classList.remove('animating'); }, 820);

    if (type === 'cards') showCardOptions();
    if (type === 'askAudience') showAudienceHelp();
}

async function trySkipToNextQuestion() {
    // Mostra overlay e prepara a próxima pergunta; só avança se existir
    showGlobalLoading(true);
    const ok = await ensureNextQuestionReady({ fastSwitch: true });
    showGlobalLoading(false);
    if (!ok) return false;
    await nextQuestion();
    return true;
}

// Garante próxima pergunta com backoff suave e fallback de categoria
async function ensureNextQuestionReady({ fastSwitch = false } = {}) {
    let attempt = 0;
    const msg = document.getElementById('global-loading-message');
    const btn = document.getElementById('try-random-category');

    while (!questions[currentQuestionIndex + 1]) {
        attempt++;
        const catLabel = getCategoryLabel(requestingCategory);
        const diffLabel = (requestingDifficultyLabel || initialDifficulty || 'easy');
        if (msg) msg.textContent = `Buscando pergunta... tentativa ${attempt} — ${catLabel} · ${diffLabel}`;

        // Após 3 tentativas, oferece o botão de tentar outra categoria
        if (btn && attempt >= 3) btn.style.display = 'inline-block';

        // Modo rápido: tente uma prefetch imediato, depois um delay curto
        if (fastSwitch) {
            await prefetchNextQuestion({ fast: true });
            if (questions[currentQuestionIndex + 1]) break;
            await delay(MIN_NET_INTERVAL_MS);
        } else {
            await delay(MIN_NET_INTERVAL_MS); // delay fixo maior
            await prefetchNextQuestion();
        }
        if (questions[currentQuestionIndex + 1]) break;
    }
    return true;
}

function getCategoryLabel(id) {
    if (id === 0) return 'Qualquer Categoria';
    if (!id && id !== 0) return 'Categoria';
    const el = document.querySelector(`#category-selection input[type="checkbox"][value="${id}"]`);
    if (el && el.parentElement) {
        return el.parentElement.textContent.trim() || `Categoria ${id}`;
    }
    return `Categoria ${id}`;
}

function showCardOptions() {
    const cards = [
        { text: 'As de Espadas', removeCount: 1, class: 'as-de-espadas', image: 'imagens/as-de-espadas.png' },
        { text: '2 de Espadas', removeCount: 2, class: 'dois-de-espadas', image: 'imagens/dois-de-espadas.png' },
        { text: '3 de Espadas', removeCount: 3, class: 'tres-de-espadas', image: 'imagens/tres-de-espadas.png' },
        { text: 'Nada', removeCount: 0, class: 'nada', image: 'imagens/joker.png' }
    ];

    const shuffledCards = shuffleArray(cards);
    const cardContainer = document.getElementById('card-container');
    if (!cardContainer) return;

    cardContainer.innerHTML = '';
    shuffledCards.forEach(card => {
        const cardElement = document.createElement('div');
        cardElement.classList.add('card');

        const cardInner = document.createElement('div');
        cardInner.classList.add('card-inner');

        const cardFront = document.createElement('div');
        cardFront.classList.add('card-front');

        const cardBack = document.createElement('div');
        cardBack.classList.add('card-back', card.class);
        if (card.image) cardBack.style.backgroundImage = `url(${card.image})`;

        cardInner.appendChild(cardFront);
        cardInner.appendChild(cardBack);
        cardElement.appendChild(cardInner);
        cardContainer.appendChild(cardElement);

        cardElement.addEventListener('click', () => {
            if (!cardElement.classList.contains('flipped')) {
                cardElement.classList.add('flipped');
                handleCardSelection(card.removeCount);
            }
        });
    });

    const modal = document.getElementById('card-modal');
    if (modal) modal.style.display = 'flex';
}

function handleCardSelection(removeCount) {
    const q = questions[currentQuestionIndex];
    const correctAnswer = q.correct_answer;
    const optionButtons = $all('#options button');

    setTimeout(() => {
        let removed = 0;
        if (removeCount > 0) {
            const wrongs = optionButtons.filter(btn => btn.textContent !== correctAnswer);
            shuffleArray(wrongs).forEach(btn => {
                if (removed < removeCount) {
                    btn.style.display = 'none';
                    removed++;
                }
            });
        }
        closeCardModal();

        // Mostrar modal próprio com o resultado
        const cModal = document.getElementById('cards-result-modal');
        const cText = document.getElementById('cards-result-text');
        const cOk = document.getElementById('cards-result-ok');
        if (cText) {
            if (removeCount === 0) cText.textContent = 'Você não eliminou nenhuma resposta.';
            else cText.textContent = `Você eliminou ${removed} resposta(s).`;
        }
        if (cModal) cModal.style.display = 'flex';
        if (cOk) cOk.onclick = () => { if (cModal) cModal.style.display = 'none'; };
    }, 400);
}

function closeCardModal() {
    const modal = document.getElementById('card-modal');
    if (modal) modal.style.display = 'none';
}

// Ajuda do público
function showAudienceHelp() {
    const q = questions[currentQuestionIndex];
    const correctAnswer = q.correct_answer;
    const incorrectAnswers = q.incorrect_answers || [];

    const correctVotePercentage = Math.floor(Math.random() * 21) + 50;
    const remaining = 100 - correctVotePercentage;
    const perWrong = incorrectAnswers.length ? Math.floor(remaining / incorrectAnswers.length) : 0;

    const audienceVotes = { [correctAnswer]: correctVotePercentage };
    incorrectAnswers.forEach(ans => { audienceVotes[ans] = perWrong; });

    displayAudienceVotes(audienceVotes);

    const panel = document.getElementById('audience-help');
    if (panel) panel.style.display = 'flex';

    if (document.getElementById('audience-chart')) createAudienceChart(audienceVotes);
}

function displayAudienceVotes(votes) {
    const div = document.getElementById('audience-votes');
    if (!div) return;
    div.innerHTML = '';
    for (const [answer, pct] of Object.entries(votes)) {
        const p = document.createElement('p');
        p.textContent = `${answer}: ${pct}%`;
        div.appendChild(p);
    }
}

function createAudienceChart(votes) {
    const canvas = document.getElementById('audience-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const labels = Object.keys(votes);
    const data = Object.values(votes);
    if (window.audienceChart) window.audienceChart.destroy();
    window.audienceChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Votos da Audiência',
                data,
                backgroundColor: 'rgba(52, 152, 219, 0.6)',
                borderColor: 'rgba(52, 152, 219, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Percentual' } },
                x: { title: { display: true, text: 'Respostas' } }
            },
            plugins: {
                legend: { labels: { color: '#fff' } }
            }
        }
    });
}

function closeAudienceHelp() {
    const panel = document.getElementById('audience-help');
    if (panel) panel.style.display = 'none';
}

// Reiniciar
function restartGame() { location.reload(); }

function showRestartInline() {
    let existing = document.getElementById('restart-inline');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.id = 'restart-inline';
    const btn = document.createElement('button');
    btn.textContent = 'Recomeçar';
    btn.id = 'back-button';
    btn.onclick = restartGame;
    container.appendChild(btn);

    const quiz = document.getElementById('quiz-container');
    if (quiz) quiz.appendChild(container);
}

// UI de prêmios e pontuação
function updatePrizeDisplay() {
    const idx = Math.min(currentQuestionIndex, prizeValues.length - 1);
    const currentPrize = prizeValues[idx];
    const loseEl = document.getElementById('value-lose');
    const winEl = document.getElementById('value-win');
    const stopEl = document.getElementById('value-stop');
    if (loseEl) loseEl.textContent = `R$ ${formatMoney(currentPrize.lose)}`;
    if (winEl) winEl.textContent = `R$ ${formatMoney(currentPrize.win)}`;
    if (stopEl) stopEl.textContent = `R$ ${formatMoney(currentPrize.stop)}`;
}

function updateScoreDisplay() {
    const scoreEl = document.getElementById('score');
    if (scoreEl) scoreEl.textContent = `Pontuação: R$ ${formatMoney(score)}`;
}

// Mostra tela final quando termina tabela de prêmios
function showExitButton() {
    showFinalResult({
        title: 'Parabéns!',
        message: `Você é o grande ganhador! Sua pontuação final é: R$ ${formatMoney(score)}`
    });
}