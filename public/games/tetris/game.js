/**
 * Tetris Game - Improved Edition
 * Enhanced with better security, gameplay features, and UX
 */

// ==================== CONFIGURATION ====================
const CONFIG = {
    COLS: 10,
    ROWS: 20,
    CELL_SIZE: 28,
    STORAGE_KEY: 'tetris_v2_data',
    SETTINGS_KEY: 'tetris_v2_settings',
    DAS: 180, // Delayed Auto Shift (pre-repeat delay)
    ARR: 60   // Auto Repeat Rate (repeat speed)
};

// ==================== GAME STATE ====================
const gameState = {
    arena: null,
    score: 0,
    lines: 0,
    level: 1,
    highscore: 0,
    leaderboard: [],
    dropCounter: 0,
    dropInterval: 1000,
    lastTime: 0,
    paused: false,
    running: false,
    isCountingDown: false,
    gameStartTime: 0,
    totalPieces: 0,
    holdUsed: false,
    settings: {
        soundEnabled: true,
        ghostEnabled: true,
        gridEnabled: true
    },
    input: {
        left: false,
        right: false,
        down: false,
        leftTimer: 0,
        rightTimer: 0,
        downTimer: 0
    }
};

// ==================== DOM ELEMENTS ====================
const canvas = document.getElementById('tetris');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nctx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold');
const hctx = holdCanvas.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayMsg = document.getElementById('overlay-msg');
const overlayStart = document.getElementById('overlay-start');
const overlayRestart = document.getElementById('overlay-restart');
const overlaySettings = document.getElementById('overlay-settings');
const overlayQuit = document.getElementById('overlay-quit');
const overlayHome = document.getElementById('overlay-home');
const overlaySettingsPanel = document.getElementById('overlay-settings-panel');
const settingsSubmenu = document.getElementById('settings-submenu');
const sectionGameSettings = document.getElementById('section-game-settings');
const sectionControls = document.getElementById('section-controls');
const overlayButtons = document.getElementById('overlay-buttons');
const overlayClose = document.getElementById('overlay-close');
const leaderboardContainer = document.getElementById('leaderboard');
const gameTitle = document.querySelector('.game-title');
const btnPause = document.getElementById('btn-pause');

// ==================== TETROMINO DEFINITIONS ====================
const colors = [null, '#00f0f0', '#0050f0', '#f0a000', '#f0f000', '#00f000', '#a000f0', '#f04040'];
const pieces = 'IOTSZJL';
const shapes = {
    I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    O: [[2, 2], [2, 2]],
    T: [[0, 3, 0], [3, 3, 3], [0, 0, 0]],
    S: [[0, 4, 4], [4, 4, 0], [0, 0, 0]],
    Z: [[5, 5, 0], [0, 5, 5], [0, 0, 0]],
    J: [[6, 0, 0], [6, 6, 6], [0, 0, 0]],
    L: [[0, 0, 7], [7, 7, 7], [0, 0, 0]]
};

// Wall kick data for SRS (Super Rotation System)
const WALL_KICKS = {
    'JLSTZ': [
        [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], // 0->1
        [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],     // 1->2
        [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],    // 2->3
        [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]]   // 3->0
    ],
    'I': [
        [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
        [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
        [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
        [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]]
    ]
};

// ==================== PLAYER & PIECES ====================
const player = {
    pos: { x: 0, y: 0 },
    matrix: null,
    rotation: 0,
    type: null
};
let nextPiece = { matrix: null, type: null };
let holdPiece = { matrix: null, type: null };

// ==================== AUDIO SYSTEM ====================
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

/**
 * Initialize audio context (user interaction required)
 */
function ensureAudio() {
    if (!audioCtx) {
        try {
            audioCtx = new AudioCtx();
        } catch (e) {
            console.error('Audio not supported:', e);
            audioCtx = null;
        }
    }
}

/**
 * Play lock sound when piece lands
 */
function playLockSound() {
    if (!audioCtx || !gameState.settings.soundEnabled) return;
    try {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.001);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.26);
    } catch (e) {
        console.error('Audio error:', e);
    }
}

/**
 * Play line clear sound
 */
function playLineClearSound(linesCleared) {
    if (!audioCtx || !gameState.settings.soundEnabled) return;
    try {
        const now = audioCtx.currentTime;
        const base = 330 + (linesCleared - 1) * 120;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(base, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.45);
    } catch (e) {
        console.error('Audio error:', e);
    }
}

/**
 * Play move sound
 */
function playMoveSound() {
    if (!audioCtx || !gameState.settings.soundEnabled) return;
    try {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.06);
    } catch (e) {
        console.error('Audio error:', e);
    }
}

// ==================== UTILITY FUNCTIONS ====================
/**
 * Create empty matrix
 */
function createMatrix(w, h) {
    const m = [];
    while (h--) m.push(new Array(w).fill(0));
    return m;
}

/**
 * Validate and sanitize localStorage data
 */
function sanitizeNumber(value, defaultValue = 0, min = 0, max = Infinity) {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < min || num > max) return defaultValue;
    return num;
}

/**
 * Load settings from localStorage
 */
function loadSettings() {
    try {
        const saved = localStorage.getItem(CONFIG.SETTINGS_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (typeof parsed === 'object') {
                gameState.settings = {
                    soundEnabled: parsed.soundEnabled !== false,
                    ghostEnabled: parsed.ghostEnabled !== false,
                    gridEnabled: parsed.gridEnabled !== false
                };
                updateSettingsUI();
            }
        }
    } catch (e) {
        console.error('Error loading settings:', e);
    }
}

/**
 * Save settings to localStorage
 */
function saveSettings() {
    try {
        localStorage.setItem(CONFIG.SETTINGS_KEY, JSON.stringify(gameState.settings));
    } catch (e) {
        console.error('Error saving settings:', e);
    }
}

/**
 * Update settings UI toggles
 */
function updateSettingsUI() {
    document.getElementById('toggle-sound').classList.toggle('active', gameState.settings.soundEnabled);
    document.getElementById('toggle-ghost').classList.toggle('active', gameState.settings.ghostEnabled);
    document.getElementById('toggle-grid').classList.toggle('active', gameState.settings.gridEnabled);
}

/**
 * Load high score from localStorage with validation
 */
function loadHighscore() {
    try {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            gameState.highscore = sanitizeNumber(data.highscore, 0, 0, 999999999);
            gameState.leaderboard = Array.isArray(data.leaderboard) ? data.leaderboard.slice(0, 3) : [gameState.highscore];
        } else {
            gameState.leaderboard = [];
        }
    } catch (e) {
        console.error('Error loading highscore:', e);
        gameState.highscore = 0;
        gameState.leaderboard = [];
    }
    document.getElementById('highscore').innerText = gameState.highscore;
    updateLeaderboardUI();
}

/**
 * Save high score to localStorage
 */
function saveHighscore() {
    // Add current score to leaderboard
    if (gameState.score > 0) {
        gameState.leaderboard.push(gameState.score);
        gameState.leaderboard.sort((a, b) => b - a);
        gameState.leaderboard = gameState.leaderboard.slice(0, 3); // Keep top 3
    }

    if (gameState.score > gameState.highscore) {
        gameState.highscore = gameState.score;
    }

    try {
        const data = {
            highscore: gameState.highscore,
            leaderboard: gameState.leaderboard,
            timestamp: Date.now()
        };
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Error saving highscore:', e);
    }
    document.getElementById('highscore').innerText = gameState.highscore;
    updateLeaderboardUI();
}

/**
 * Update leaderboard UI
 */
function updateLeaderboardUI() {
    const list = document.getElementById('leaderboard-list');
    if (!list) return;

    list.innerHTML = '';
    const displayScores = gameState.leaderboard.length > 0 ? gameState.leaderboard.slice(0, 3) : [0, 0, 0];

    displayScores.forEach(score => {
        const row = document.createElement('div');
        row.className = 'leaderboard-row';
        row.innerHTML = `<span class="score-val">${score.toLocaleString()}</span>`;
        list.appendChild(row);
    });
}

/**
 * Update score display
 */
function updateStats() {
    document.getElementById('score').innerText = gameState.score;
    document.getElementById('level').innerText = gameState.level;
    document.getElementById('lines').innerText = gameState.lines;
    if (gameState.score > gameState.highscore) {
        gameState.highscore = gameState.score;
        saveHighscore();
    }

    // Update time and statistics
    if (gameState.running && !gameState.paused) {
        const elapsed = Math.floor((performance.now() - gameState.gameStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        document.getElementById('time-played').innerText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        document.getElementById('total-pieces').innerText = gameState.totalPieces;
        const ppm = elapsed > 0 ? Math.round((gameState.totalPieces / elapsed) * 60) : 0;
        document.getElementById('ppm').innerText = ppm;

        // Sync with virtual pet parent
        window.parent.postMessage({
            type: 'GAME_SCORE_UPDATE',
            score: gameState.score,
            pieces: gameState.totalPieces,
            lines: gameState.lines
        }, '*');
    }
}

// ==================== DRAWING FUNCTIONS ====================
/**
 * Draw a tetromino matrix on canvas
 */
function drawMatrix(matrix, offset, context, cellSize, isGhost = false) {
    for (let y = 0; y < matrix.length; y++) {
        for (let x = 0; x < matrix[y].length; x++) {
            const val = matrix[y][x];
            if (val) {
                if (isGhost) {
                    context.strokeStyle = colors[val];
                    context.lineWidth = 2;
                    context.strokeRect((x + offset.x) * cellSize + 1, (y + offset.y) * cellSize + 1, cellSize - 3, cellSize - 3);
                } else {
                    context.fillStyle = colors[val];
                    context.fillRect((x + offset.x) * cellSize, (y + offset.y) * cellSize, cellSize - 1, cellSize - 1);
                    context.strokeStyle = 'rgba(0,0,0,0.2)';
                    context.strokeRect((x + offset.x) * cellSize, (y + offset.y) * cellSize, cellSize - 1, cellSize - 1);
                }
            }
        }
    }
}

/**
 * Draw grid lines on canvas
 */
function drawGrid() {
    if (!gameState.settings.gridEnabled) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= CONFIG.COLS; x++) {
        ctx.beginPath();
        ctx.moveTo(x * CONFIG.CELL_SIZE, 0);
        ctx.lineTo(x * CONFIG.CELL_SIZE, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y <= CONFIG.ROWS; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * CONFIG.CELL_SIZE);
        ctx.lineTo(canvas.width, y * CONFIG.CELL_SIZE);
        ctx.stroke();
    }
}

/**
 * Calculate ghost piece position
 */
function getGhostPosition() {
    if (!player.matrix) return null;
    let ghostY = player.pos.y;
    while (!collide(gameState.arena, { matrix: player.matrix, pos: { x: player.pos.x, y: ghostY + 1 } })) {
        ghostY++;
    }
    return ghostY;
}

/**
 * Main draw function
 */
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    nctx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    hctx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);

    // Draw grid
    drawGrid();

    // Draw arena
    drawMatrix(gameState.arena, { x: 0, y: 0 }, ctx, CONFIG.CELL_SIZE);

    // Draw ghost piece
    if (player.matrix && gameState.settings.ghostEnabled) {
        const ghostY = getGhostPosition();
        if (ghostY !== null && ghostY !== player.pos.y) {
            drawMatrix(player.matrix, { x: player.pos.x, y: ghostY }, ctx, CONFIG.CELL_SIZE, true);
        }
    }

    // Draw current piece
    if (player.matrix) {
        drawMatrix(player.matrix, player.pos, ctx, CONFIG.CELL_SIZE);
    }

    // Draw next piece
    if (nextPiece.matrix) {
        // Calculate visible bounds for centering
        let minX = 6, maxX = 0, minY = 4, maxY = 0;
        nextPiece.matrix.forEach((row, y) => {
            row.forEach((val, x) => {
                if (val !== 0) {
                    minX = Math.min(minX, x);
                    maxX = Math.max(maxX, x);
                    minY = Math.min(minY, y);
                    maxY = Math.max(maxY, y);
                }
            });
        });
        const w = maxX - minX + 1;
        const h = maxY - minY + 1;
        const nx = (6 - w) / 2 - minX;
        const ny = (4 - h) / 2 - minY;
        drawMatrix(nextPiece.matrix, { x: nx, y: ny }, nctx, 28);
    }

    // Draw hold piece
    if (holdPiece.matrix) {
        // Calculate visible bounds for centering
        let minX = 6, maxX = 0, minY = 4, maxY = 0;
        holdPiece.matrix.forEach((row, y) => {
            row.forEach((val, x) => {
                if (val !== 0) {
                    minX = Math.min(minX, x);
                    maxX = Math.max(maxX, x);
                    minY = Math.min(minY, y);
                    maxY = Math.max(maxY, y);
                }
            });
        });
        const w = maxX - minX + 1;
        const h = maxY - minY + 1;
        const hx = (6 - w) / 2 - minX;
        const hy = (4 - h) / 2 - minY;
        drawMatrix(holdPiece.matrix, { x: hx, y: hy }, hctx, 28);
    }
}

// ==================== GAME LOGIC ====================
/**
 * Merge piece into arena
 */
function merge(arenaRef, piece) {
    piece.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value) arenaRef[y + piece.pos.y][x + piece.pos.x] = value;
        });
    });
    playLockSound();
}

/**
 * Check collision
 */
function collide(arenaRef, piece) {
    const m = piece.matrix;
    for (let y = 0; y < m.length; y++) {
        for (let x = 0; x < m[y].length; x++) {
            if (m[y][x]) {
                const ay = arenaRef[y + piece.pos.y];
                if (!ay || ay[x + piece.pos.x] !== 0) return true;
            }
        }
    }
    return false;
}

/**
 * Rotate matrix with wall kick support
 */
function rotate(matrix, dir) {
    for (let y = 0; y < matrix.length; y++) {
        for (let x = 0; x < y; x++) {
            [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
        }
    }
    if (dir > 0) matrix.forEach(row => row.reverse());
    else matrix.reverse();
}

/**
 * Attempt rotation with wall kick
 */
function playerRotate(dir) {
    if (!player.matrix) return;

    const originalPos = { x: player.pos.x, y: player.pos.y };
    const originalRotation = player.rotation;

    // Create a copy and rotate it
    const rotatedMatrix = player.matrix.map(row => row.slice());
    rotate(rotatedMatrix, dir);

    // Calculate new rotation state
    const newRotation = (player.rotation + (dir > 0 ? 1 : 3)) % 4;

    // Get wall kick data
    let kickData = WALL_KICKS['JLSTZ'];
    if (player.type === 'I') kickData = WALL_KICKS['I'];
    if (player.type === 'O') {
        // O piece doesn't need wall kicks
        player.matrix = rotatedMatrix;
        player.rotation = newRotation;
        return;
    }

    const kicks = kickData[originalRotation];

    // Try each wall kick offset
    for (let i = 0; i < kicks.length; i++) {
        player.pos.x = originalPos.x + kicks[i][0];
        player.pos.y = originalPos.y - kicks[i][1]; // Y is inverted in screen coordinates

        if (!collide(gameState.arena, { matrix: rotatedMatrix, pos: player.pos })) {
            player.matrix = rotatedMatrix;
            player.rotation = newRotation;
            playMoveSound();
            return;
        }
    }

    // Restore original position if all kicks failed
    player.pos.x = originalPos.x;
    player.pos.y = originalPos.y;
}

/**
 * Create new piece
 */
function createPiece(type) {
    return shapes[type].map(r => r.slice());
}

/**
 * Get random piece type
 */
function randomPiece() {
    return pieces[Math.floor(Math.random() * pieces.length)];
}

/**
 * Show overlay message
 */
function showOverlay(title, msg, showStart = false, showRestart = false, showSettings = false, showResume = false) {
    if (title) {
        overlayTitle.innerText = title;
        overlayTitle.style.display = 'block';
    } else {
        overlayTitle.style.display = 'none';
    }
    if (typeof msg === 'string') {
        overlayMsg.innerHTML = msg ? `<p>${msg}</p>` : '';
    } else {
        overlayMsg.innerHTML = msg;
    }
    overlay.classList.remove('centered-mode');

    // Switch to initial buttons view
    overlayButtons.style.display = 'flex';
    overlaySettingsPanel.style.display = 'none';

    // Keep message hidden by default
    if (typeof msg === 'string' && msg !== '') {
        overlayMsg.style.display = 'block';
    } else {
        overlayMsg.style.display = 'none';
    }

    overlay.style.display = 'flex';

    // Handle appearance based on state
    if (title === 'Game Over' || title === 'Paused') {
        overlay.classList.add('centered-mode');
        if (gameTitle) gameTitle.style.display = 'none';
        if (title === 'Game Over') {
            if (leaderboardContainer) leaderboardContainer.style.display = 'block';
            overlayTitle.classList.add('huge-title');
        } else {
            if (leaderboardContainer) leaderboardContainer.style.display = 'none';
            overlayTitle.classList.remove('huge-title');
        }
    } else {
        // Welcome screen or others
        if (gameTitle) gameTitle.style.display = 'flex';
        if (leaderboardContainer) leaderboardContainer.style.display = 'block';
        overlayTitle.classList.remove('huge-title');
    }

    overlayStart.style.display = showStart ? 'inline-block' : 'none';
    overlayRestart.style.display = showRestart ? 'inline-block' : 'none';
    overlaySettings.style.display = showSettings ? 'inline-block' : 'none';

    // In pause menu, we want both Resume and Restart.
    // In Game Over, we want only Restart.
    // In Welcome, we want only Start.
    if (showResume || title === 'Paused') {
        overlayClose.style.display = 'inline-block';
    } else {
        overlayClose.style.display = (showStart || showRestart) ? 'none' : 'inline-block';
    }

    // Toggle Quit and Home
    overlayQuit.style.display = showStart ? 'inline-block' : 'none';
    overlayHome.style.display = showStart ? 'none' : 'inline-block';

    // Toggle Pause Button
    if (btnPause) {
        if (showStart || title === 'Game Over') {
            btnPause.style.display = 'none';
        } else {
            btnPause.style.display = 'flex';
        }
    }

    updateSettingsUI();
}

/**
 * Hide overlay
 */
function hideOverlay() {
    overlay.style.display = 'none';
    if (gameTitle) gameTitle.style.display = 'none';
}

/**
 * Spawn next piece
 */
function spawnNext() {
    player.matrix = nextPiece.matrix.map(r => r.slice());
    player.type = nextPiece.type;
    player.rotation = 0;
    player.pos.y = 0;
    player.pos.x = Math.floor((CONFIG.COLS - player.matrix[0].length) / 2);

    // Generate new next piece
    nextPiece.type = randomPiece();
    nextPiece.matrix = createPiece(nextPiece.type);

    gameState.totalPieces++;
    gameState.holdUsed = false;

    // Check game over
    if (collide(gameState.arena, player)) {
        stopGame();
        showOverlay('Game Over', '', false, true, true);
    }
}

/**
 * Sweep completed lines
 */
function sweepLines() {
    let rowCount = 0;
    outer: for (let y = gameState.arena.length - 1; y >= 0; y--) {
        for (let x = 0; x < gameState.arena[y].length; x++) {
            if (gameState.arena[y][x] === 0) continue outer;
        }
        const row = gameState.arena.splice(y, 1)[0].fill(0);
        gameState.arena.unshift(row);
        y++;
        rowCount++;
    }

    if (rowCount > 0) {
        const points = [0, 40, 100, 300, 1200];
        gameState.score += points[rowCount] * gameState.level;
        gameState.lines += rowCount;
        gameState.level = Math.floor(gameState.lines / 10) + 1;
        updateStats();
        playLineClearSound(rowCount);
    }
    return rowCount;
}

/**
 * Hold current piece
 */
function holdCurrentPiece() {
    if (!player.matrix || gameState.holdUsed) return;

    if (!holdPiece.matrix) {
        holdPiece.matrix = createPiece(player.type);
        holdPiece.type = player.type;
        spawnNext();
    } else {
        const tempMatrix = holdPiece.matrix;
        const tempType = holdPiece.type;
        holdPiece.matrix = createPiece(player.type);
        holdPiece.type = player.type;
        player.matrix = tempMatrix.map(r => r.slice());
        player.type = tempType;
        player.rotation = 0;
        player.pos.y = 0;
        player.pos.x = Math.floor((CONFIG.COLS - player.matrix[0].length) / 2);
    }

    gameState.holdUsed = true;
    playMoveSound();
}

// ==================== GAME LOOP ====================
/**
 * Main game update loop
 */
function update(time = 0) {
    if (!gameState.running) return;

    if (gameState.paused) {
        gameState.lastTime = time;
        requestAnimationFrame(update);
        return;
    }

    const delta = time - gameState.lastTime;
    gameState.lastTime = time;
    gameState.dropCounter += delta;

    // Calculate drop interval based on level
    gameState.dropInterval = Math.max(
        80,
        1000 * Math.pow(0.85, gameState.level - 1)
    );

    if (gameState.dropCounter > gameState.dropInterval) {
        player.pos.y++;
        if (collide(gameState.arena, player)) {
            player.pos.y--;
            merge(gameState.arena, player);
            sweepLines();
            spawnNext();
        }
        gameState.dropCounter = 0;
    }

    // Handle smooth horizontal movement (DAS/ARR)
    if (gameState.input.left) {
        if (gameState.input.leftTimer === 0) {
            moveLeft();
            gameState.input.leftTimer = CONFIG.DAS;
        } else {
            gameState.input.leftTimer -= delta;
            if (gameState.input.leftTimer <= 0) {
                moveLeft();
                gameState.input.leftTimer = CONFIG.ARR;
            }
        }
    } else {
        gameState.input.leftTimer = 0;
    }

    if (gameState.input.right) {
        if (gameState.input.rightTimer === 0) {
            moveRight();
            gameState.input.rightTimer = CONFIG.DAS;
        } else {
            gameState.input.rightTimer -= delta;
            if (gameState.input.rightTimer <= 0) {
                moveRight();
                gameState.input.rightTimer = CONFIG.ARR;
            }
        }
    } else {
        gameState.input.rightTimer = 0;
    }

    // Optional: Smooth soft drop
    if (gameState.input.down) {
        if (gameState.input.downTimer === 0) {
            moveDown();
            gameState.input.downTimer = 50; // Constant speed for soft drop
        } else {
            gameState.input.downTimer -= delta;
            if (gameState.input.downTimer <= 0) {
                moveDown();
                gameState.input.downTimer = 50;
            }
        }
    } else {
        gameState.input.downTimer = 0;
    }

    draw();
    updateStats();
    requestAnimationFrame(update);
}

function moveLeft() {
    player.pos.x--;
    if (collide(gameState.arena, player)) {
        player.pos.x++;
        return false;
    }
    playMoveSound();
    return true;
}

function moveRight() {
    player.pos.x++;
    if (collide(gameState.arena, player)) {
        player.pos.x--;
        return false;
    }
    playMoveSound();
    return true;
}

function moveDown() {
    player.pos.y++;
    if (collide(gameState.arena, player)) {
        player.pos.y--;
        merge(gameState.arena, player);
        sweepLines();
        spawnNext();
        return false;
    }
    gameState.dropCounter = 0; // Reset natural drop when manually moving down
    return true;
}

/**
 * Start new game
 */
function startGame() {
    // Reset state
    gameState.arena = createMatrix(CONFIG.COLS, CONFIG.ROWS);
    gameState.score = 0;
    gameState.lines = 0;
    gameState.level = 1;
    gameState.dropCounter = 0;
    gameState.lastTime = performance.now();
    gameState.paused = false;
    gameState.gameStartTime = performance.now();
    gameState.totalPieces = 0;
    gameState.holdUsed = false;

    // Reset pieces
    nextPiece.type = randomPiece();
    nextPiece.matrix = createPiece(nextPiece.type);
    holdPiece.matrix = null;
    holdPiece.type = null;

    hideOverlay();
    loadHighscore();
    spawnNext();
    updateStats();

    if (btnPause) {
        btnPause.style.display = 'flex';
        btnPause.innerHTML = '<i class="fas fa-pause"></i>';
    }

    if (!gameState.running) {
        gameState.running = true;
        requestAnimationFrame(update);
    }
}

/**
 * Stop game
 */
function stopGame(sendReward = true) {
    if (gameState.running && sendReward) {
        // Notify parent of game completion
        window.parent.postMessage({
            type: 'GAME_OVER',
            score: gameState.score,
            pieces: gameState.totalPieces,
            lines: gameState.lines
        }, '*');
    }
    gameState.running = false;
    if (btnPause) btnPause.style.display = 'none';
}

/**
 * Toggle pause
 */
function togglePause() {
    if (!gameState.running || gameState.isCountingDown) return;

    if (!gameState.paused) {
        // Pausing is immediate
        gameState.paused = true;
        if (btnPause) {
            btnPause.innerHTML = '<i class="fas fa-play"></i>';
        }
        showOverlay('Paused', '', false, true, true);
    } else {
        // Resuming has a countdown
        startResumeCountdown();
    }
}

/**
 * Start countdown before resuming game
 */
function startResumeCountdown() {
    if (gameState.isCountingDown) return;

    gameState.isCountingDown = true;
    overlayButtons.style.display = 'none';
    overlayTitle.style.display = 'block';
    overlayTitle.classList.add('huge-title');

    let count = 3;
    overlayTitle.innerText = count;

    const timer = setInterval(() => {
        count--;
        if (count > 0) {
            overlayTitle.innerText = count;
            // Optional: play a tick sound if move sound is suitable
            playMoveSound();
        } else {
            clearInterval(timer);
            gameState.paused = false;
            gameState.isCountingDown = false;
            hideOverlay();
            overlayTitle.classList.remove('huge-title');
            if (btnPause) {
                btnPause.innerHTML = '<i class="fas fa-pause"></i>';
            }
        }
    }, 1000);
}

// ==================== INPUT HANDLERS ====================
/**
 * Handle keyboard input
 */
function handleKey(e) {
    if (!gameState.running || gameState.paused || gameState.isCountingDown) return;
    if (!audioCtx) ensureAudio();

    if (e.key === 'ArrowLeft') {
        e.preventDefault();
        gameState.input.left = true;
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        gameState.input.right = true;
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        gameState.input.down = true;
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        playerRotate(1);
    } else if (e.code === 'Space') {
        e.preventDefault();
        while (!collide(gameState.arena, player)) player.pos.y++;
        player.pos.y--;
        merge(gameState.arena, player);
        sweepLines();
        spawnNext();
        gameState.dropCounter = 0;
    } else if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        holdCurrentPiece();
    } else if (e.key.toLowerCase() === 'p') {
        e.preventDefault();
        togglePause();
    }
}

function handleKeyUp(e) {
    if (e.key === 'ArrowLeft') gameState.input.left = false;
    if (e.key === 'ArrowRight') gameState.input.right = false;
    if (e.key === 'ArrowDown') gameState.input.down = false;
}

window.addEventListener('keydown', handleKey);
window.addEventListener('keyup', handleKeyUp);

// ==================== OVERLAY BUTTONS ====================
overlayStart.addEventListener('click', () => {
    startGame();
});

overlayRestart.addEventListener('click', () => {
    startGame();
});

overlayClose.addEventListener('click', () => {
    togglePause();
});

if (btnPause) {
    btnPause.addEventListener('click', togglePause);
}

const btnSettings = document.getElementById('btn-settings-toggle');
if (btnSettings) {
    btnSettings.remove(); // Clean up if it exists in DOM but not used
}

overlaySettings.addEventListener('click', () => {
    overlayTitle.style.display = 'none';
    overlayButtons.style.display = 'none';
    if (leaderboardContainer) leaderboardContainer.style.display = 'none';
    if (gameTitle) gameTitle.style.display = 'none';
    overlayMsg.style.display = 'none';
    overlay.classList.add('centered-mode');

    // Reset to show sub-menu first
    settingsSubmenu.style.display = 'flex';
    sectionGameSettings.style.display = 'none';
    sectionControls.style.display = 'none';
    overlaySettingsPanel.style.display = 'block';
});

overlayQuit.addEventListener('click', () => {
    window.location.href = '../../';
});

overlayHome.addEventListener('click', () => {
    stopGame(false); // Manually quitting forfeits pending coins
    init(); // Reset to main welcome menu
});

// Sub-menu navigation
document.getElementById('btn-goto-game-settings').addEventListener('click', () => {
    settingsSubmenu.style.display = 'none';
    sectionGameSettings.style.display = 'block';
});

document.getElementById('btn-goto-controls').addEventListener('click', () => {
    settingsSubmenu.style.display = 'none';
    sectionControls.style.display = 'block';
});

document.getElementById('btn-settings-back').addEventListener('click', () => {
    // If we are in a sub-section, go back to the sub-menu
    if (settingsSubmenu.style.display === 'none') {
        settingsSubmenu.style.display = 'flex';
        sectionGameSettings.style.display = 'none';
        sectionControls.style.display = 'none';
    } else {
        // Otherwise go back to main menu
        overlaySettingsPanel.style.display = 'none';
        showOverlay(overlayTitle.innerText, overlayMsg.innerHTML,
            overlayStart.style.display === 'inline-block',
            overlayRestart.style.display === 'inline-block',
            overlaySettings.style.display === 'inline-block',
            overlayClose.style.display === 'inline-block'
        );
    }
});

// ==================== SETTINGS TOGGLES ====================
document.getElementById('toggle-sound').addEventListener('click', function () {
    gameState.settings.soundEnabled = !gameState.settings.soundEnabled;
    this.classList.toggle('active', gameState.settings.soundEnabled);
    saveSettings();
});

document.getElementById('toggle-ghost').addEventListener('click', function () {
    gameState.settings.ghostEnabled = !gameState.settings.ghostEnabled;
    this.classList.toggle('active', gameState.settings.ghostEnabled);
    saveSettings();
});

document.getElementById('toggle-grid').addEventListener('click', function () {
    gameState.settings.gridEnabled = !gameState.settings.gridEnabled;
    this.classList.toggle('active', gameState.settings.gridEnabled);
    saveSettings();
});

// ==================== INITIALIZATION ====================
/**
 * Focus canvas for keyboard input
 */
window.addEventListener('load', () => {
    document.body.focus();
});

document.body.addEventListener('click', () => {
    document.body.focus();
    if (!audioCtx) ensureAudio();
});

/**
 * Initialize game
 */
function init() {
    canvas.width = CONFIG.COLS * CONFIG.CELL_SIZE;
    canvas.height = CONFIG.ROWS * CONFIG.CELL_SIZE;
    nextCanvas.width = 6 * 28;
    nextCanvas.height = 4 * 28;
    holdCanvas.width = 6 * 28;
    holdCanvas.height = 4 * 28;

    loadSettings();
    loadHighscore();

    gameState.arena = createMatrix(CONFIG.COLS, CONFIG.ROWS);
    draw();

    // Show initial welcome overlay with settings enabled
    const initialMsg = overlayMsg.innerHTML;
    showOverlay('', initialMsg, true, false, true);
}

init();
