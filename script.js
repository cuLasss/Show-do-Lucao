// Variáveis Globais
let currentQuestionIndex = 0;
let score = 0;
let questions = [];
let usedFiftyFifty = false;

// Definindo os valores das perguntas
const prizeValues = [
    { win: 500, lose: 100, stop: 250 },    // 1ª pergunta
    { win: 1000, lose: 200, stop: 500 },   // 2ª pergunta
    { win: 2000, lose: 400, stop: 1000 },  // 3ª pergunta
    { win: 3000, lose: 600, stop: 1500 },  // 4ª pergunta
    { win: 5000, lose: 1000, stop: 2000 }, // 5ª pergunta
    { win: 10000, lose: 2000, stop: 5000 },// 6ª pergunta
    { win: 15000, lose: 3000, stop: 7500 },// 7ª pergunta
    { win: 20000, lose: 4000, stop: 10000 },// 8ª pergunta
    { win: 30000, lose: 6000, stop: 15000 },// 9ª pergunta
    { win: 50000, lose: 10000, stop: 25000 }, // 10ª pergunta
    { win: 100000, lose: 20000, stop: 50000 }, // 11ª pergunta
    { win: 150000, lose: 30000, stop: 75000 }, // 12ª pergunta
    { win: 300000, lose: 60000, stop: 150000 }, // 13ª pergunta
    { win: 500000, lose: 100000, stop: 250000 }, // 14ª pergunta
    { win: 1000000, lose: 200000, stop: 500000 } // 15ª pergunta
];

let usedPowerUps = {
    cards: false,
    askAudience: false,
    doublePoints: false,
    skipQuestion: false
};

// Funções para Carregar Perguntas
async function getQuestions(difficulty) {
    const response = await fetch(`https://opentdb.com/api.php?amount=10&category=9&difficulty=${difficulty}`);
    const data = await response.json();
    return data.results;
}

async function loadQuestions(difficulty) {
    document.getElementById('loading').style.display = 'block';
    const rawQuestions = await getQuestions(difficulty);

    questions = rawQuestions.map(question => ({
        ...question,
        question: question.question,
        correct_answer: question.correct_answer,
        incorrect_answers: question.incorrect_answers
    }));

    document.getElementById('loading').style.display = 'none';
    showQuestion();
}

// Funções para Iniciar o Jogo
function startGame(difficulty) {
    document.getElementById('difficulty-selection').style.display = 'none';
    document.getElementById('score').style.display = 'block';
    document.getElementById('prizes').style.display = 'block';
    document.getElementById('quiz-container').style.display = 'block';
    document.getElementById('power-ups').style.display = 'block';
    loadQuestions(difficulty);
}

// Funções para Mostrar Perguntas
function showQuestion() {
    // Verifica se o índice está dentro do intervalo
    if (currentQuestionIndex < 0 || currentQuestionIndex >= questions.length) {
        alert(`Fim do jogo! Sua pontuação final é: R$ ${score}`);
        return;
    }

    const question = questions[currentQuestionIndex];
    document.getElementById('question').innerHTML = question.question;

    const options = [...question.incorrect_answers, question.correct_answer];
    const shuffledOptions = shuffleArray(options);

    const optionsDiv = document.getElementById('options');
    optionsDiv.innerHTML = shuffledOptions.map(option => `
    <button onclick="checkAnswer(this)">${option}</button>
    `).join('');

    document.getElementById('next-button').style.display = 'none';
    updatePrizeDisplay(); // Atualiza a exibição de prêmios

    const quizContainer = document.getElementById('quiz-container');
    quizContainer.style.opacity = 0;
    setTimeout(() => {
        quizContainer.style.opacity = 1;
    }, 0);
}

function checkAnswer(selectedButton) {
    const correctAnswer = questions[currentQuestionIndex].correct_answer;
    const optionsButtons = document.querySelectorAll('#options button');
    const currentPrize = prizeValues[currentQuestionIndex];

    // Desabilitar o botão "Parar" ao verificar a resposta
    document.getElementById('stop-prize').disabled = true;

    // Desabilitar todos os botões de opções
    optionsButtons.forEach(btn => {
        btn.disabled = true; // Desabilita todos os botões de opções
        btn.style.pointerEvents = 'none'; // Impede interações
    });

    // Desabilitar os botões de reforço
    disablePowerUps();

    if (selectedButton.textContent === correctAnswer) {
        selectedButton.classList.add('correct'); // Adiciona classe para resposta correta
        score = currentPrize.win; // Define a pontuação para o valor de ganhar
        alert('Resposta correta! Sua pontuação é: R$ ' + score.toLocaleString());
    } else {
        selectedButton.classList.add('incorrect'); // Adiciona classe para resposta incorreta
        score = currentPrize.lose; // Define a pontuação fixa para erro

        // Atualizar a pontuação na interface
        document.getElementById('score').textContent = `Pontuação: R$ ${score.toLocaleString()}`;

        // Exibir a resposta correta em verde
        optionsButtons.forEach(btn => {
            if (btn.textContent === correctAnswer) {
                btn.classList.add('correct'); // Adiciona classe para resposta correta
            }
        });

        // Exibir mensagem de erro antes de finalizar o jogo
        alert(`Resposta incorreta! Sua pontuação é: R$ ${score.toLocaleString()}.`);
        showExitButton(); // Mostrar botão de sair
        return; // Termina a função
    }

    document.getElementById('score').textContent = `Pontuação: R$ ${score.toLocaleString()}`;
    document.getElementById('next-button').style.display = 'block'; // Exibir botão "Próxima"
}

function stopGame() {
    // Verifica se o índice está dentro do intervalo
    if (currentQuestionIndex < 0 || currentQuestionIndex >= prizeValues.length) {
        console.error("Índice fora do intervalo:", currentQuestionIndex);
        score = 0; // Define um valor padrão para score
        document.getElementById('score').textContent = `Pontuação: R$ ${score.toLocaleString()}`;
        alert(`Fim do jogo! Sua pontuação final é: R$ ${score.toLocaleString()}.`);
        return;
    }

    const currentPrize = prizeValues[currentQuestionIndex];
    score = currentPrize.stop; // Define a pontuação fixa ao parar

    // Atualizar o elemento de pontuação com a pontuação final
    document.getElementById('score').textContent = `Pontuação: R$ ${score.toLocaleString()}`;

    // Exibir mensagem de finalização do jogo
    alert(`Você parou o jogo e sua pontuação total é: R$ ${score.toLocaleString()}.`);

    // Desabilitar todos os botões de opções e de reforço
    const optionsButtons = document.querySelectorAll('#options button');
    optionsButtons.forEach(btn => {
        btn.disabled = true; // Desabilita todos os botões de opções
    });
    
    disablePowerUps(); // Desabilita os botões de reforço

    // Desabilitar o botão "Parar"
    document.getElementById('stop-prize').disabled = true;

    // Mostrar botão "Sair"
    showExitButton();
}

function disablePowerUps() {
    const powerUpButtons = document.querySelectorAll('#power-ups .power-up');
    powerUpButtons.forEach(btn => {
        btn.disabled = true; // Desabilita todos os botões de reforço
    });
}

// Funções para Navegar entre Perguntas
function nextQuestion() {
    // Limpar as classes de estilo antes de mostrar a próxima pergunta
    const optionsButtons = document.querySelectorAll('#options button');
    optionsButtons.forEach(btn => {
        btn.classList.remove('correct', 'incorrect'); // Remove as classes de resposta
        btn.disabled = false; // Reabilita os botões
    });

    currentQuestionIndex++;
    // Verifica se há mais perguntas
    if (currentQuestionIndex < questions.length) {
        showQuestion(); // Mostra a próxima pergunta
    } else {
        // Atualiza a pontuação antes de finalizar o jogo
        const finalScore = score; // Guarda a pontuação final
        alert(`Fim do jogo! Sua pontuação final é: R$ ${finalScore.toLocaleString()}`);
    }

    // Reativar o botão "Parar"
    document.getElementById('stop-prize').disabled = false; 

    // Reabilitar os botões de reforço
    const powerUpButtons = document.querySelectorAll('#power-ups .power-up');
    powerUpButtons.forEach(btn => {
        btn.disabled = false; // Habilita todos os botões de reforço
    });
}

function stopGame() {
    // Verifica se o índice está dentro do intervalo
    if (currentQuestionIndex < 0 || currentQuestionIndex >= prizeValues.length) {
        console.error("Índice fora do intervalo:", currentQuestionIndex);
        score = 0; // Define um valor padrão para score
        document.getElementById('score').textContent = `Pontuação: R$ ${score.toLocaleString()}`;
        alert(`Fim do jogo! Sua pontuação final é: R$ ${score.toLocaleString()}.`);
        return;
    }

    const currentPrize = prizeValues[currentQuestionIndex];
    score = currentPrize.stop; // Define a pontuação fixa ao parar

    // Atualizar o elemento de pontuação com a pontuação final
    document.getElementById('score').textContent = `Pontuação: R$ ${score.toLocaleString()}`;

    // Exibir mensagem de finalização do jogo
    alert(`Você parou o jogo e sua pontuação total é: R$ ${score.toLocaleString()}.`);

    // Desabilitar todos os botões de opções e de reforço
    const optionsButtons = document.querySelectorAll('#options button');
    optionsButtons.forEach(btn => {
        btn.disabled = true; // Desabilita todos os botões de opções
    });
    disablePowerUps(); // Desabilita os botões de reforço

    // Desabilitar o botão "Parar"
    document.getElementById('stop-prize').disabled = true;

    // Mostrar botão "Sair"
    showExitButton();
}

// Função para mostrar o botão "Sair"
function showExitButton() {
    const exitButton = document.createElement('button');
    exitButton.textContent = 'Sair';
    exitButton.onclick = restartGame; // Chama a função de reiniciar o jogo
    exitButton.style.marginTop = '20px';
    exitButton.style.padding = '10px 20px';
    exitButton.style.fontSize = '18px';
    exitButton.style.cursor = 'pointer';
    exitButton.style.backgroundColor = '#e74c3c'; // Cor vermelha para o botão
    exitButton.style.color = 'white';
    exitButton.style.border = 'none';
    exitButton.style.borderRadius = '10px';
    exitButton.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
    
    // Adiciona o botão ao container do quiz
    document.getElementById('quiz-container').appendChild(exitButton);
}
// Funções para Power-Ups
function usePowerUp(type) {
    if (usedPowerUps[type]) {
        alert("Você já usou essa opção nesta rodada!");
        return;
    }

    usedPowerUps[type] = true; // Marca a opção como usada
    const button = document.getElementById(`power-${type}`);

    if (!button) {
        console.error(`Botão power-${type} não encontrado!`);
        return;
    }

    // Remove o texto do botão antes de flipar
    button.innerHTML = ""; 
    button.classList.add('flipped'); // Adiciona a classe de flip

    setTimeout(() => {
        button.classList.add('disabled'); // Desabilita o botão

        if (type === 'cards') {
            showCardOptions(); // Chama a função para mostrar as cartas
        }
        if (type === 'askAudience') {
            showAudienceHelp(); // Chama a função para mostrar a ajuda ao público
        }
        if (type === 'skipQuestion') {
            nextQuestion(); // Chama a função para pular a pergunta
        }
    }, 600); // Espera 0.6 segundos para a animação
}

// Funções para Modal de Cartas
function showCardOptions() {
    console.log("Mostrando opções de cartas...");
    const cards = [
        { text: "As de Espadas", removeCount: 1, class: "as-de-espadas", image: 'imagens/as-de-espadas.png' },
        { text: "2 de Espadas", removeCount: 2, class: "dois-de-espadas", image: 'imagens/dois-de-espadas.png' },
        { text: "3 de Espadas", removeCount: 3, class: "tres-de-espadas", image: 'imagens/tres-de-espadas.png' },
        { text: "Nada", removeCount: 0, class: "nada", image: 'imagens/joker.png' }
    ];

    const shuffledCards = shuffleArray(cards);
    const cardContainer = document.getElementById('card-container');
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
        cardBack.style.backgroundImage = `url(${card.image})`; // Define a imagem de fundo

        cardInner.appendChild(cardFront);
        cardInner.appendChild(cardBack);
        cardElement.appendChild(cardInner);
        cardContainer.appendChild(cardElement);

        cardElement.addEventListener('click', () => {
            if (!cardElement.classList.contains('flipped')) {
                cardElement.classList.add('flipped');
                handleCardSelection(card.removeCount, cardElement);
            }
        });
    });

    document.getElementById('card-modal').style.display = 'block'; // Mostra o modal de cartas
}

function handleCardSelection(removeCount, cardElement) {
    const correctAnswer = questions[currentQuestionIndex].correct_answer;
    const optionsButtons = document.querySelectorAll('#options button');

    // Abre a carta
    cardElement.classList.add('flipped');

    // Espera 1 segundo antes de mostrar a mensagem
    setTimeout(() => {
        if (removeCount === 0) {
            alert("Você não eliminou nenhuma resposta.");
        } else {
            alert(`Você escolheu uma carta que elimina ${removeCount} resposta(s) errada(s).`);
            let removed = 0;
            optionsButtons.forEach(btn => {
                if (btn.textContent !== correctAnswer && removed < removeCount) {
                    btn.style.display = 'none';
                    removed++;
                }
            });
        }
        closeCardModal();
    }, 1000); // 1 segundo
}

function closeCardModal() {
    document.getElementById('card-modal').style.display = 'none';
}

// Função para Ajuda do Público
function showAudienceHelp() {
    const correctAnswer = questions[currentQuestionIndex].correct_answer;
    const incorrectAnswers = questions[currentQuestionIndex].incorrect_answers;

    // Simular a ajuda do público com maior porcentagem para a resposta correta
    const correctVotePercentage = Math.floor(Math.random() * 21) + 50; // 50% a 70%
    const incorrectVotePercentage = (100 - correctVotePercentage) / (incorrectAnswers.length + 1); // Divide o restante entre as incorretas

    // Montar os votos
    const audienceVotes = {
        [correctAnswer]: correctVotePercentage
    };

    incorrectAnswers.forEach(answer => {
        audienceVotes[answer] = Math.floor(incorrectVotePercentage);
    });

    // Exibe os resultados em uma lista
    displayAudienceVotes(audienceVotes);
    document.getElementById('audience-help').style.display = 'block'; // Exibe o painel de ajuda
}

// Função para exibir os votos da audiência
function displayAudienceVotes(votes) {
    const audienceVotesDiv = document.getElementById('audience-votes');
    audienceVotesDiv.innerHTML = ''; // Limpa a área antes de adicionar novos votos

    for (const [answer, percentage] of Object.entries(votes)) {
        audienceVotesDiv.innerHTML += `<p>${answer}: ${percentage}%</p>`;
    }
}

function createAudienceChart(votes) {
    const ctx = document.getElementById('audience-chart').getContext('2d');
    console.log(ctx);
    const labels = Object.keys(votes);
    const data = Object.values(votes);

    if (window.audienceChart) {
        window.audienceChart.destroy(); // Destrói o gráfico anterior se existir
    }

    window.audienceChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Votos da Audiência',
                data: data,
                backgroundColor: 'rgba(52, 152, 219, 0.6)', // Azul
                borderColor: 'rgba(52, 152, 219, 1)',
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Número de Votos'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Respostas'
                    }
                }
            }
        }
    });
}

document.getElementById('close-audience-help').onclick = closeAudienceHelp;

function closeAudienceHelp() {
    document.getElementById('audience-help').style.display = 'none';
}

// Função para Reiniciar o Jogo
function restartGame() {
    location.reload();
}

// Função para Embaralhar Perguntas
function shuffleArray(array) {
    return array.sort(() => Math.random() - 0.5);
}

// Funções para Atualizar exibição de Prêmios
function updatePrizeDisplay() {
    // Verifica se o índice está dentro do intervalo
    if (currentQuestionIndex < 0 || currentQuestionIndex >= prizeValues.length) {
        console.error("Índice fora do intervalo:", currentQuestionIndex);
        return;
    }

    const currentPrize = prizeValues[currentQuestionIndex];
    document.getElementById('value-lose').textContent = `R$ ${currentPrize.lose.toLocaleString()}`; 
    document.getElementById('value-win').textContent = `R$ ${currentPrize.win.toLocaleString()}`;
    document.getElementById('value-stop').textContent = `R$ ${currentPrize.stop.toLocaleString()}`;
}
// Função para calcular valores de prêmios com base na pergunta atual
function calculatePrizeValues(questionIndex) {
    const baseWin = 100000; // Valor base para a 1ª pergunta
    const baseLose = 50000;  // Valor base para a perda
    const baseStop = 500000;  // Valor para parar na 10ª pergunta

    // Faz o cálculo proporcional para cada pergunta
    let winAmount = Math.round(baseWin * ((questionIndex + 1) / 10)); // Aumenta o valor ganho conforme as perguntas
    let loseAmount = Math.round(baseLose * ((questionIndex + 1) / 10)); // Aumenta o valor perdido conforme as perguntas
    let stopAmount = baseStop; // O valor para parar sempre será 500 mil na 10ª pergunta

    // Se for a 10ª pergunta, ajusta os valores
    if (questionIndex === 9) {
        winAmount = 1000000; // 1 milhão na 10ª pergunta
        loseAmount = 200000; // 200 mil ao errar na 10ª pergunta
    }

    return {
        win: winAmount,
        lose: loseAmount,
        stop: stopAmount
    };
}
