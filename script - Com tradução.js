let currentQuestionIndex = 0;
let score = 0;
let questions = [];
let usedFiftyFifty = false;

const prizeValues = [
    1000, 2000, 3000, 5000, 10000,
    20000, 50000, 100000, 300000, 1000000
];

async function getQuestions(difficulty) {
    const response = await fetch(`https://opentdb.com/api.php?amount=10&category=9&difficulty=${difficulty}`);
    const data = await response.json();
    return data.results;
}

async function translateText(text, sourceLang, targetLang) {
    const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`);
    const data = await response.json();
    return data.responseData.translatedText;
}

async function loadQuestions(difficulty) {
    document.getElementById('loading').style.display = 'block';
    const rawQuestions = await getQuestions(difficulty);

    questions = await Promise.all(rawQuestions.map(async (question) => {
        const translatedQuestion = await translateText(question.question, 'en', 'pt');
        const translatedCorrectAnswer = await translateText(question.correct_answer, 'en', 'pt');
        const translatedIncorrectAnswers = await Promise.all(
            question.incorrect_answers.map(answer => translateText(answer, 'en', 'pt'))
        );

        return {
            ...question,
            question: translatedQuestion,
            correct_answer: translatedCorrectAnswer,
            incorrect_answers: translatedIncorrectAnswers
        };
    }));

    document.getElementById('loading').style.display = 'none';
    showQuestion();
}

function startGame(difficulty) {
    document.getElementById('difficulty-selection').style.display = 'none';
    document.getElementById('loading').style.display = 'none';
    document.getElementById('score').style.display = 'block';
    document.getElementById('prize-level').style.display = 'block';
    document.getElementById('quiz-container').style.display = 'block';
    loadQuestions(difficulty);
}

function showQuestion() {
    const question = questions[currentQuestionIndex];
    document.getElementById('question').textContent = question.question;

    const options = [...question.incorrect_answers, question.correct_answer];
    const shuffledOptions = shuffleArray(options);

    const optionsDiv = document.getElementById('options');
    optionsDiv.innerHTML = shuffledOptions.map(option => `
        <button onclick="checkAnswer('${option}', this)">${option}</button>
    `).join('');

    document.getElementById('fifty-fifty').style.display = 'inline-block';
    document.getElementById('ask-audience').style.display = 'inline-block';

    updatePrizeDisplay();
    
    // Fade-in effect
    const quizContainer = document.getElementById('quiz-container');
    quizContainer.style.opacity = 0;
    setTimeout(() => {
        quizContainer.style.opacity = 1;
    }, 0); // Trigger reflow
}

function checkAnswer(selectedAnswer, button) {
    const correctAnswer = questions[currentQuestionIndex].correct_answer;
    const optionsButtons = document.querySelectorAll('#options button');

    // Adiciona estilos inline para a resposta correta ou incorreta
    if (selectedAnswer === correctAnswer) {
        button.style.backgroundColor = '#2ecc71'; // Verde para resposta correta
        button.style.color = '#fff'; // Texto branco
        alert('Resposta correta! Você ganhou R$ ' + prizeValues[currentQuestionIndex]);
        score += prizeValues[currentQuestionIndex]; // Adiciona o valor ao total
    } else {
        button.style.backgroundColor = '#e74c3c'; // Vermelho para resposta errada
        button.style.color = '#fff'; // Texto branco
        alert(`Resposta incorreta! Você levou para casa R$ ${score}.`);
        score = 0; // Reinicia a pontuação
    }

    // Destaca a resposta correta
    optionsButtons.forEach(btn => {
        if (btn.textContent === correctAnswer) {
            btn.style.backgroundColor = '#2ecc71'; // Verde para resposta correta
            btn.style.color = '#fff'; // Texto branco
        }
    });

    document.getElementById('score').textContent = `Pontuação: R$ ${score}`;
    currentQuestionIndex++;

    // Atraso para permitir que a animação ocorra
    setTimeout(() => {
        // Limpa os estilos inline antes de mostrar a próxima pergunta
        optionsButtons.forEach(btn => {
            btn.style.backgroundColor = ''; // Reseta a cor de fundo
            btn.style.color = ''; // Reseta a cor do texto
        });

        if (currentQuestionIndex < questions.length) {
            showQuestion();
        } else {
            alert(`Fim do jogo! Sua pontuação final é: R$ ${score}`);
        }
    }, 3000); // Atraso de 3 segundos
}

function useFiftyFifty() {
    if (!usedFiftyFifty) {
        usedFiftyFifty = true;
        const correctAnswer = questions[currentQuestionIndex].correct_answer;
        const incorrectAnswers = questions[currentQuestionIndex].incorrect_answers;

        const toRemove = shuffleArray(incorrectAnswers).slice(0, 2);
        const remainingOptions = incorrectAnswers.filter(ans => !toRemove.includes(ans));

        const newOptions = [correctAnswer, ...remainingOptions];
        showOptions(newOptions);
    } else {
        alert("Você já usou a ajuda 50/50.");
    }
}

function askAudience() {
    const correctAnswer = questions[currentQuestionIndex].correct_answer;
    const options = [...questions[currentQuestionIndex].incorrect_answers, correctAnswer];

    const audienceHelp = options.map(option => {
        let percentage = Math.floor(Math.random() * 50);
        if (option === correctAnswer) {
            percentage += 50;
        }
        return {
            answer: option,
            percentage: Math.min(percentage, 100)
        };
    });

    alert("Ajuda do Público:\n" + audienceHelp.map(item => `${item.answer}: ${item.percentage}%`).join('\n'));
}

function updatePrizeDisplay() {
    const prizeElements = document.querySelectorAll('#prize-values span');
    prizeElements.forEach((el, index) => {
        el.textContent = `R$ ${prizeValues[index].toLocaleString()}`;
    });
}

function shuffleArray(array) {
    return array.sort(() => Math.random() - 0.5);
}