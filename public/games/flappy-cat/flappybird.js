
//board
let board;
let boardWidth = 360;
let boardHeight = 640;
let context;

//bird
let birdWidth = 34; //width/height ratio = 408/228 = 17/12
let birdHeight = 24;
let birdX = boardWidth / 8;
let birdY = boardHeight / 2;
let birdImg;

let bird = {
    x: birdX,
    y: birdY,
    width: birdWidth,
    height: birdHeight
}

//pipes
let pipeArray = [];
let pipeWidth = 64; //width/height ratio = 384/3072 = 1/8
let pipeHeight = 512;
let pipeX = boardWidth;
let pipeY = 0;

let topPipeImg;
let bottomPipeImg;

//physics
let velocityX = -2; //pipes moving left speed
let velocityY = 0; //bird jump speed
let gravity = 0.4;
let jumpStrength = -6;
let scale = 1;
const BIRD_SCALE = 1.3; // increase this to make the bird sprite larger
const BASE_WIDTH = 360;
const BASE_HEIGHT = 640;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 568;

let gameOver = false;
let score = 0;
let started = false;
let pipeInterval = null;
let overlay;
let startBtn;
let gameOverModal;
let playAgainBtn;
let scoreValueEl;
let highScoreValueEl;
let highScore = 0;
let sfxDie, sfxHit, sfxPoint, sfxWing;

window.onload = function () {
    board = document.getElementById("board");
    context = board.getContext("2d"); //used for drawing on the board
    overlay = document.getElementById("overlay");
    startBtn = document.getElementById("start-btn");
    gameOverModal = document.getElementById("gameover-modal");
    playAgainBtn = document.getElementById("play-again");
    scoreValueEl = document.getElementById("score-value");
    highScoreValueEl = document.getElementById("highscore-value");
    highScore = Number(localStorage.getItem("flappy-highscore") || 0);
    if (highScoreValueEl) highScoreValueEl.textContent = highScore;
    // load sfx
    sfxDie = new Audio("./sfx_die.wav");
    sfxHit = new Audio("./sfx_hit.wav");
    sfxPoint = new Audio("./sfx_point.wav");
    sfxWing = new Audio("./sfx_wing.wav");
    setBoardSize(true);

    if (startBtn) {
        startBtn.addEventListener("click", startGame);
    }
    if (playAgainBtn) {
        playAgainBtn.addEventListener("click", startGame);
    }

    //draw flappy bird
    // context.fillStyle = "green";
    // context.fillRect(bird.x, bird.y, bird.width, bird.height);

    //load images
    birdImg = new Image();
    birdImg.src = "./flappycat.png";
    birdImg.onload = function () {
        context.drawImage(birdImg, bird.x, bird.y, bird.width, bird.height);
    }

    topPipeImg = new Image();
    topPipeImg.src = "./toppipe.png";

    bottomPipeImg = new Image();
    bottomPipeImg.src = "./bottompipe.png";

    requestAnimationFrame(update);
    document.addEventListener("keydown", moveBird);
    // Allow mouse/touch clicks anywhere on the page to flap (mobile-friendly)
    document.addEventListener("pointerdown", handlePointerFlap);
    window.addEventListener("resize", () => setBoardSize(true));
}

function update() {
    requestAnimationFrame(update);
    context.clearRect(0, 0, board.width, board.height);

    if (!started) {
        context.drawImage(birdImg, bird.x, bird.y, bird.width, bird.height);
        drawHUD();
        return;
    }

    if (gameOver) {
        drawHUD();
        return;
    }

    //bird
    velocityY += gravity;
    // bird.y += velocityY;
    bird.y = Math.max(bird.y + velocityY, 0); //apply gravity to current bird.y, limit the bird.y to top of the canvas
    context.drawImage(birdImg, bird.x, bird.y, bird.width, bird.height);

    if (bird.y > board.height) {
        endGame();
    }

    //pipes
    for (let i = 0; i < pipeArray.length; i++) {
        let pipe = pipeArray[i];
        pipe.x += velocityX;
        context.drawImage(pipe.img, pipe.x, pipe.y, pipe.width, pipe.height);

        if (!pipe.passed && bird.x > pipe.x + pipe.width) {
            score += 0.5; //0.5 because there are 2 pipes! so 0.5*2 = 1, 1 for each set of pipes
            pipe.passed = true;
            playSfx(sfxPoint);

            // Sync score with virtual pet parent
            // In Flappy, 1 point is much harder than 1 point in Tetris
            // So we treat 1 Flappy point = 100 "Points" (which = 1 Coin)
            window.parent.postMessage({
                type: 'GAME_SCORE_UPDATE',
                score: Math.floor(score * 100)
            }, '*');
        }

        if (detectCollision(bird, pipe)) {
            playSfx(sfxHit);
            endGame();
        }
    }

    //clear pipes once they are fully off the left edge
    while (pipeArray.length > 0 && (pipeArray[0].x + pipeArray[0].width) < 0) {
        pipeArray.shift(); //removes first element from the array
    }

    drawHUD();
}

function placePipes() {
    if (gameOver || !started) {
        return;
    }

    //(0-1) * pipeHeight/2.
    // 0 -> -128 (pipeHeight/4)
    // 1 -> -128 - 256 (pipeHeight/4 - pipeHeight/2) = -3/4 pipeHeight
    let randomPipeY = pipeY - pipeHeight / 4 - Math.random() * (pipeHeight / 2);
    let openingSpace = board.height / 5;

    let spawnX = boardWidth; // start at the right edge

    let topPipe = {
        img: topPipeImg,
        x: spawnX,
        y: randomPipeY,
        width: pipeWidth,
        height: pipeHeight,
        passed: false
    }
    pipeArray.push(topPipe);

    let bottomPipe = {
        img: bottomPipeImg,
        x: spawnX,
        y: randomPipeY + pipeHeight + openingSpace,
        width: pipeWidth,
        height: pipeHeight,
        passed: false
    }
    pipeArray.push(bottomPipe);
}

function moveBird(e) {
    if (e.code == "Space" || e.code == "ArrowUp" || e.code == "KeyX") {
        flap();
    }
}

function detectCollision(a, b) {
    return a.x < b.x + b.width &&   //a's top left corner doesn't reach b's top right corner
        a.x + a.width > b.x &&   //a's top right corner passes b's top left corner
        a.y < b.y + b.height &&  //a's top left corner doesn't reach b's bottom left corner
        a.y + a.height > b.y;    //a's bottom left corner passes b's top left corner
}

function handlePointerFlap() {
    // Ignore clicks when game over and modal is showing unless they hit Play
    if (gameOver && !gameOverModal.classList.contains("hidden")) return;
    flap();
}

function flap() {
    //jump
    velocityY = jumpStrength;
    playSfx(sfxWing);

    //reset game
    if (gameOver) {
        return;
    }

    // start from input if not already started
    if (!started) {
        startGame();
    }
}

function resetGame() {
    bird = {
        x: birdX,
        y: boardHeight / 2,
        width: birdWidth,
        height: birdHeight
    }
    velocityY = 0;
    pipeArray = [];
    score = 0;
    gameOver = false;
    started = false;
    if (pipeInterval) {
        clearInterval(pipeInterval);
        pipeInterval = null;
    }
    if (overlay) overlay.classList.remove("hidden");
    if (gameOverModal) gameOverModal.classList.add("hidden");
}

function setBoardSize(reset = false) {
    // FIX: Always fill the entire browser window
    boardWidth = window.innerWidth;
    boardHeight = window.innerHeight;

    // Calculate scale based on the dimension that 'fits' best
    // This ensures the bird/pipes don't get too huge on wide screens 
    // or too small on tall screens.
    scale = Math.min(boardWidth / BASE_WIDTH, boardHeight / BASE_HEIGHT);

    const dpr = window.devicePixelRatio || 1;
    board.style.width = `${boardWidth}px`;
    board.style.height = `${boardHeight}px`;
    board.width = Math.round(boardWidth * dpr);
    board.height = Math.round(boardHeight * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Update game element sizes based on the new scale
    birdWidth = 34 * scale * BIRD_SCALE;
    birdHeight = 24 * scale * BIRD_SCALE;

    // Optional: Keep bird relatively close to the left, rather than 1/8th of a huge wide screen
    // You can stick to boardWidth / 8 or clamp it. 
    // sticking to boardWidth / 8 works fine for a wide flappy bird.
    birdX = (boardWidth - birdWidth) / 2;

    pipeWidth = 64 * scale;
    pipeHeight = 512 * scale;

    gravity = 0.4 * scale;
    jumpStrength = -6 * scale;
    velocityX = -2 * scale;

    if (reset) {
        resetGame();
    } else if (!gameOver) {
        bird.width = birdWidth;
        bird.height = birdHeight;
        bird.x = birdX;
    }
}

function startGame() {
    // allow restart even after game over
    if (started && !gameOver) return;

    gameOver = false;
    started = true;
    score = 0;
    bird.y = boardHeight / 2;
    velocityY = 0;
    pipeArray = [];

    if (overlay) overlay.classList.add("hidden");
    if (gameOverModal) gameOverModal.classList.add("hidden");

    if (pipeInterval) {
        clearInterval(pipeInterval);
    }
    pipeInterval = setInterval(placePipes, 1800);
}

function drawHUD() {
    // 1. Setup the Font
    // We scale the font size but keep a minimum size so it's always readable
    const fontSize = Math.max(24, Math.floor(35 * scale));
    context.font = `${fontSize}px "Press Start 2P"`;

    // 2. Position
    // Center the text horizontally
    context.textAlign = "center";
    const x = boardWidth / 2;
    // Position it about 15% down from the top of the screen
    const y = boardHeight * 0.15;

    // 3. Draw the Black Outline (Stroke)
    context.strokeStyle = "black";
    context.lineWidth = 5; // Thickness of the outline
    context.strokeText(score, x, y);

    // 4. Draw the White Text (Fill)
    context.fillStyle = "white";
    context.fillText(score, x, y);

    // 5. Reset alignment
    // Good practice to reset this so it doesn't mess up other drawings (like Debug hitboxes)
    context.textAlign = "start";
}

function endGame() {
    if (gameOver) return;
    gameOver = true;
    playSfx(sfxDie);
    // update high score
    if (score > highScore) {
        highScore = score;
        localStorage.setItem("flappy-highscore", highScore);
    }

    if (scoreValueEl) scoreValueEl.textContent = score;
    if (highScoreValueEl) highScoreValueEl.textContent = highScore;
    if (gameOverModal) gameOverModal.classList.remove("hidden");

    // Notify parent of game completion for rewards
    window.parent.postMessage({
        type: 'GAME_OVER',
        score: Math.floor(score * 100)
    }, '*');
    if (pipeInterval) {
        clearInterval(pipeInterval);
        pipeInterval = null;
    }
}

function playSfx(audioEl) {
    if (!audioEl) return;
    try {
        audioEl.currentTime = 0;
        audioEl.play();
    } catch (e) {
        // ignore playback errors (e.g., user gesture not granted)
    }
}
