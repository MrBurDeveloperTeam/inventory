/*
 * Deployment marker used to confirm that the current
 * Flappy Cat JavaScript has executed.
 */
window.FLAPPY_BUILD =
    "20260731-12";

console.log(
    "[Flappy Cat] JavaScript loaded:",
    window.FLAPPY_BUILD
);

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

/*
 * Detect Apple devices that can run the web game.
 * This includes iPhone, iPad, iPod touch and macOS devices.
 */
const IS_APPLE_DEVICE =
    /Macintosh|Mac OS X|iPhone|iPad|iPod/.test(
        navigator.userAgent
    ) ||
    /MacIntel|MacPPC|Mac68K|iPhone|iPad|iPod/.test(
        navigator.platform
    );

/*
 * Normalize game movement against a 60 FPS simulation.
 * This keeps movement consistent across 60 Hz and 120 Hz screens.
 */
const TARGET_FRAME_TIME = 1000 / 60;

/*
 * Allow only a small amount of timing compensation.
 * A large delta can make the cat suddenly jump downward.
 */
const MAX_FRAME_DELTA = 1.25;

/*
 * Limit the maximum downward speed so long falls remain
 * controllable and predictable.
 */
const MAX_FALL_SPEED = 7;

let lastFrameTime = 0;
let resizeTimer = null;

/*
 * Remember the current orientation so minor Safari toolbar
 * resize events do not rebuild the Canvas during gameplay.
 */
let lastViewportIsLandscape =
    window.innerWidth >
    window.innerHeight;

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

    /*
    * Preload sound effects on Apple devices to reduce
    * playback preparation delay during gameplay.
    */
    if (IS_APPLE_DEVICE) {
        [
            sfxDie,
            sfxHit,
            sfxPoint,
            sfxWing
        ].forEach((audio) => {
            audio.preload = "auto";
            audio.load();
        });
    }

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
    /*
    * Only the game Canvas should trigger flap input.
    * Menu buttons retain their normal click behavior.
    */
    board.addEventListener(
        "pointerdown",
        handlePointerFlap,
        {
            passive: false
        }
    );
    /*
    * Apple browsers can produce repeated viewport resize events.
    * Use debouncing on Apple devices while preserving the
    * original resize behavior on other platforms.
    */
    if (IS_APPLE_DEVICE) {
        window.addEventListener(
            "resize",
            handleResize
        );

        window.addEventListener(
            "orientationchange",
            handleResize
        );
    } else {
        window.addEventListener(
            "resize",
            () => setBoardSize(true)
        );
    }
}

function update(timestamp) {
    requestAnimationFrame(update);

    /*
     * Calculate movement according to the actual time between
     * frames. Do not manually skip frames because small timing
     * variations can otherwise produce a double-size physics step.
     */
    const elapsed = lastFrameTime
        ? timestamp - lastFrameTime
        : TARGET_FRAME_TIME;

    lastFrameTime = timestamp;

    /*
     * Limit unusually delayed frames so the cat does not
     * suddenly move a large distance in one rendered frame.
     */
    const delta = Math.min(
        elapsed /
            TARGET_FRAME_TIME,
        MAX_FRAME_DELTA
    );

    /*
     * The drawing context already uses DPR scaling, so clear using
     * logical CSS dimensions instead of backing-canvas dimensions.
     */
    context.clearRect(0, 0, boardWidth, boardHeight);

    if (!started) {
        context.drawImage(birdImg, bird.x, bird.y, bird.width, bird.height);
        drawHUD();
        return;
    }

    if (gameOver) {
        drawHUD();
        return;
    }

    /*
    * Apply gravity while limiting the maximum downward speed.
    * The limit scales together with the game dimensions.
    */
    const maxFallSpeed =
        MAX_FALL_SPEED * scale;

    velocityY = Math.min(
        velocityY + gravity * delta,
        maxFallSpeed
    );

    bird.y = Math.max(
        bird.y + velocityY * delta,
        0
    );
    context.drawImage(birdImg, bird.x, bird.y, bird.width, bird.height);

    if (bird.y > boardHeight) {
        endGame();
    }

    //pipes
    for (let i = 0; i < pipeArray.length; i++) {
        let pipe = pipeArray[i];
        pipe.x += velocityX * delta;
        context.drawImage(pipe.img, pipe.x, pipe.y, pipe.width, pipe.height);

        if (
            pipe.countsForScore &&
            !pipe.passed &&
            bird.x >
                pipe.x +
                pipe.width
        ) {
            /*
            * One pipe pair equals one complete point.
            */
            score += 1;
            pipe.passed = true;

            /*
            * Play the point sound only once per pipe pair.
            */
            playSfx(sfxPoint);

            /*
            * Send only one score update to the React parent.
            */
            window.parent.postMessage(
                {
                    type:
                        "GAME_SCORE_UPDATE",

                    score:
                        Math.floor(
                            score * 100
                        )
                },
                "*"
            );
        }

        if (
            detectCollision(
                bird,
                pipe
            )
        ) {
            playSfx(sfxHit);
            endGame();

            /*
            * Stop processing the remaining pipes after game over.
            */
            break;
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
    let openingSpace = boardHeight / 5;

    let spawnX = boardWidth; // start at the right edge

    let topPipe = {
        img: topPipeImg,
        x: spawnX,
        y: randomPipeY,
        width: pipeWidth,
        height: pipeHeight,
        passed: false,

        /*
        * Only one pipe in each pair should trigger scoring.
        */
        countsForScore: true
    };
    pipeArray.push(topPipe);

    let bottomPipe = {
        img: bottomPipeImg,
        x: spawnX,
        y:
            randomPipeY +
            pipeHeight +
            openingSpace,
        width: pipeWidth,
        height: pipeHeight,
        passed: false,

        /*
        * The lower pipe belongs to the same pair and must not
        * trigger another score, sound or parent message.
        */
        countsForScore: false
    };
    pipeArray.push(bottomPipe);
}

function moveBird(e) {
    if (
        e.code === "Space" ||
        e.code === "ArrowUp" ||
        e.code === "KeyX"
    ) {
        e.preventDefault();
        flap();
    }
}

function detectCollision(a, b) {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    );
}

function handlePointerFlap(event) {
    if (!event.isPrimary) {
        return;
    }

    if (
        event.pointerType === "mouse" &&
        event.button !== 0
    ) {
        return;
    }

    event.preventDefault();

    if (
        gameOver &&
        gameOverModal &&
        !gameOverModal.classList.contains(
            "hidden"
        )
    ) {
        return;
    }

    flap();
}

function flap() {
    if (gameOver) {
        return;
    }

    if (!started) {
        startGame();
    }

    /*
     * Apply the jump immediately.
     */
    velocityY = jumpStrength;

    /*
     * Avoid repeated HTML audio playback on Apple devices.
     */
    if (!IS_APPLE_DEVICE) {
        playSfx(sfxWing);
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
    lastFrameTime = performance.now();
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

function handleResize() {
    if (resizeTimer) {
        clearTimeout(
            resizeTimer
        );
    }

    resizeTimer =
        setTimeout(
            () => {
                const nextIsLandscape =
                    window.innerWidth >
                    window.innerHeight;

                /*
                 * Ignore same-orientation Safari toolbar changes
                 * while gameplay is active.
                 */
                if (
                    started &&
                    !gameOver &&
                    nextIsLandscape ===
                        lastViewportIsLandscape
                ) {
                    lastFrameTime =
                        performance.now();

                    return;
                }

                /*
                 * A real orientation change occurred, or the game
                 * is not currently active.
                 */
                lastViewportIsLandscape =
                    nextIsLandscape;

                setBoardSize(
                    !started ||
                    gameOver
                );

                lastFrameTime =
                    performance.now();
            },
            200
        );
}

function setBoardSize(reset = false) {
    // FIX: Always fill the entire browser window
    boardWidth = window.innerWidth;
    boardHeight = window.innerHeight;

    lastViewportIsLandscape =
        boardWidth >
        boardHeight;

    // Calculate scale based on the dimension that 'fits' best
    // This ensures the bird/pipes don't get too huge on wide screens 
    // or too small on tall screens.
    scale = Math.min(boardWidth / BASE_WIDTH, boardHeight / BASE_HEIGHT);

    /*
    * Limit Canvas resolution on Apple Retina displays.
    * Other platforms keep their original device pixel ratio.
    */
    const devicePixelRatio =
        window.devicePixelRatio || 1;

    /*
    * Render Apple devices at CSS-pixel resolution.
    * A DPR 1 Canvas contains about one quarter of the pixels
    * of a DPR 2 Canvas.
    */
    const dpr = IS_APPLE_DEVICE
        ? 1
        : devicePixelRatio;

    board.style.width = `${boardWidth}px`;
    board.style.height = `${boardHeight}px`;
    board.width = Math.round(boardWidth * dpr);
    board.height = Math.round(boardHeight * dpr);

    context.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
    );

    /*
    * Disable image smoothing only on Apple devices.
    * Other platforms keep the browser's default behavior.
    */
    if (IS_APPLE_DEVICE) {
        context.imageSmoothingEnabled = false;
    }

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
    lastFrameTime = performance.now();

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
    context.font = `${fontSize}px Fredoka`;

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

        const playPromise = audioEl.play();

        if (
            playPromise &&
            typeof playPromise.catch === "function"
        ) {
            playPromise.catch(() => {
                // Ignore mobile autoplay or interrupted playback errors
            });
        }
    } catch {
        // Ignore synchronous playback errors
    }
}
