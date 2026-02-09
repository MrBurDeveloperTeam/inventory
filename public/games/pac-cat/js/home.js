var HOME = false;

var HOME_PRESENTATION_TIMER = -1;
var HOME_PRESENTATION_STATE = 0;

var HOME_TRAILER_TIMER = -1;
var HOME_TRAILER_STATE = 0;

// --- NEW VARIABLES FOR ANIMATED CAT ---
var TRAILER_CAT_EL = null; 
var TRAILER_CAT_OFFSET_Y = -8; // Adjust this to vertically center the cat
var TRAILER_CAT_SCALE = 1.35;
// --------------------------------------

var PACMAN_TRAILER_CANVAS_CONTEXT = null;
var PACMAN_TRAILER_DIRECTION = 3;
var PACMAN_TRAILER_POSITION_X = 600;
var PACMAN_TRAILER_POSITION_Y = 25;
var PACMAN_TRAILER_POSITION_STEP = 3;
var PACMAN_TRAILER_MOUNTH_STATE = 3;
var PACMAN_TRAILER_MOUNTH_STATE_MAX = 6;
var PACMAN_TRAILER_SIZE = 16;

var GHOST_TRAILER_CANVAS_CONTEXT = null;
var GHOST_TRAILER_BODY_STATE_MAX = 6;
var GHOST_TRAILER_POSITION_STEP = 3;

var GHOST_BLINKY_TRAILER_POSITION_X = 1000;
var GHOST_BLINKY_TRAILER_POSITION_Y = 25;
var GHOST_BLINKY_TRAILER_DIRECTION = 3;
var GHOST_BLINKY_TRAILER_COLOR = "#ed1b24";
var GHOST_BLINKY_TRAILER_BODY_STATE = 0;
var GHOST_BLINKY_TRAILER_STATE = 0;

var GHOST_PINKY_TRAILER_POSITION_X = 1035;
var GHOST_PINKY_TRAILER_POSITION_Y = 25;
var GHOST_PINKY_TRAILER_DIRECTION = 3;
var GHOST_PINKY_TRAILER_COLOR = "#feaec9";
var GHOST_PINKY_TRAILER_BODY_STATE = 1;
var GHOST_PINKY_TRAILER_STATE = 0;

var GHOST_INKY_TRAILER_POSITION_X = 1070;
var GHOST_INKY_TRAILER_POSITION_Y = 25;
var GHOST_INKY_TRAILER_DIRECTION = 3;
var GHOST_INKY_TRAILER_COLOR = "#4adecb";
var GHOST_INKY_TRAILER_BODY_STATE = 2;
var GHOST_INKY_TRAILER_STATE = 0;

var GHOST_CLYDE_TRAILER_POSITION_X = 1105;
var GHOST_CLYDE_TRAILER_POSITION_Y = 25;
var GHOST_CLYDE_TRAILER_DIRECTION = 3;
var GHOST_CLYDE_TRAILER_COLOR = "#f99c00";
var GHOST_CLYDE_TRAILER_BODY_STATE = 3;
var GHOST_CLYDE_TRAILER_STATE = 0;

function initHome() { 
    HOME = true;
    
    // --- 1. SETUP THE CAT ELEMENT ---
    ensureTrailerCatElement();
    // --------------------------------

    GAMEOVER = false;
    LOCK = false;
    PACMAN_DEAD = false;

    $("#panel").hide();
    $("#home").show();
    $("#home h3 em").append( " - " + new Date().getFullYear() );
    
    $('#help').fadeOut("slow");
    
    var ctx = null;
    var canvas = document.getElementById('canvas-home-title-pacman');
    canvas.setAttribute('width', '140');
    canvas.setAttribute('height', '110');
    if (canvas.getContext) { 
        ctx = canvas.getContext('2d');
    }
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "90px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🐱", canvas.width / 2, canvas.height / 2);
    
    canvas = document.getElementById('canvas-presentation-blinky');
    canvas.setAttribute('width', '50');
    canvas.setAttribute('height', '50');
    if (canvas.getContext) { 
        ctx = canvas.getContext('2d');
    }
    ctx.fillStyle = GHOST_BLINKY_COLOR;
    drawHelperGhost(ctx, 25, 25, 1, 0, 0, 0);
    
    canvas = document.getElementById('canvas-presentation-pinky');
    canvas.setAttribute('width', '50');
    canvas.setAttribute('height', '50');
    if (canvas.getContext) { 
        ctx = canvas.getContext('2d');
    }
    ctx.fillStyle = GHOST_PINKY_COLOR;
    drawHelperGhost(ctx, 25, 25, 1, 0, 0, 0);
    
    canvas = document.getElementById('canvas-presentation-inky');
    canvas.setAttribute('width', '50');
    canvas.setAttribute('height', '50');
    if (canvas.getContext) { 
        ctx = canvas.getContext('2d');
    }
    ctx.fillStyle = GHOST_INKY_COLOR;
    drawHelperGhost(ctx, 25, 25, 1, 0, 0, 0);
    
    canvas = document.getElementById('canvas-presentation-clyde');
    canvas.setAttribute('width', '50');
    canvas.setAttribute('height', '50');
    if (canvas.getContext) { 
        ctx = canvas.getContext('2d');
    }
    ctx.fillStyle = GHOST_CLYDE_COLOR;
    drawHelperGhost(ctx, 25, 25, 1, 0, 0, 0);
    
    startPresentation();
}

// --- 2. UPDATED HELPER: Creates a Mask Div and puts Cat inside it ---
function ensureTrailerCatElement() {
    // Check if the mask already exists
    var mask = document.getElementById('trailer-mask');
    
    if (!mask) {
        // 1. Create the Mask (The "Window")
        mask = document.createElement('div');
        mask.id = 'trailer-mask';
        
        // Copy the exact position/size of the game area
        mask.style.width = '500px';
        mask.style.height = '50px';
        mask.style.position = 'absolute';
        mask.style.margin = 'auto';
        mask.style.left = '0';
        mask.style.right = '0';
        mask.style.bottom = '100px'; // Same as #trailer canvas
        mask.style.overflow = 'hidden'; // <--- THIS MAKES THE SMOOTH CLIPPING WORK
        mask.style.zIndex = '100';      
        mask.style.pointerEvents = 'none'; 
        
        // Add the mask to the Home screen
        var container = document.getElementById('home'); 
        if (container) {
            container.appendChild(mask);
        }
    }

    // 2. Create the Cat inside the Mask
    if (!TRAILER_CAT_EL) {
        TRAILER_CAT_EL = document.getElementById('trailer-cat');
        if (!TRAILER_CAT_EL) {
            TRAILER_CAT_EL = document.createElement('img');
            TRAILER_CAT_EL.id = 'trailer-cat';
            TRAILER_CAT_EL.src = 'img/cat_moving.gif'; 
            TRAILER_CAT_EL.style.position = 'absolute';
            TRAILER_CAT_EL.style.display = 'none';
            
            // Append the cat TO THE MASK
            mask.appendChild(TRAILER_CAT_EL);
        }
    }
}
// ---------------------------------------

function startPresentation() { 
    $("#presentation *").hide();
    
    if (HOME_PRESENTATION_TIMER === -1) { 
        HOME_PRESENTATION_STATE = 0;
        HOME_PRESENTATION_TIMER = setInterval("nextSequencePresentation()", 500);
    }
}
function stopPresentation() { 

    if (HOME_PRESENTATION_TIMER != -1) { 
        $("#presentation *").hide();
        HOME_PRESENTATION_STATE = 0;
        clearInterval(HOME_PRESENTATION_TIMER);
        HOME_PRESENTATION_TIMER = -1;
    }
}
function nextSequencePresentation() { 
    if (HOME_PRESENTATION_STATE === 0) { 
        $("#presentation-titles").show();
    } else if (HOME_PRESENTATION_STATE === 2) { 
        $("#canvas-presentation-blinky").show();
    } else if (HOME_PRESENTATION_STATE === 4) { 
        $("#presentation-character-blinky").show();
    } else if (HOME_PRESENTATION_STATE === 5) { 
        $("#presentation-name-blinky").show();
    } else if (HOME_PRESENTATION_STATE === 6) { 
        $("#canvas-presentation-pinky").show();
    } else if (HOME_PRESENTATION_STATE === 8) { 
        $("#presentation-character-pinky").show();
    } else if (HOME_PRESENTATION_STATE === 9) { 
        $("#presentation-name-pinky").show();
    } else if (HOME_PRESENTATION_STATE === 10) { 
        $("#canvas-presentation-inky").show();
    } else if (HOME_PRESENTATION_STATE === 12) { 
        $("#presentation-character-inky").show();
    } else if (HOME_PRESENTATION_STATE === 13) { 
        $("#presentation-name-inky").show();
    } else if (HOME_PRESENTATION_STATE === 14) { 
        $("#canvas-presentation-clyde").show();
    } else if (HOME_PRESENTATION_STATE === 16) { 
        $("#presentation-character-clyde").show();
    } else if (HOME_PRESENTATION_STATE === 17) { 
        $("#presentation-name-clyde").show();
    }
    
    if (HOME_PRESENTATION_STATE === 17) { 
        clearInterval(HOME_PRESENTATION_TIMER);
        HOME_PRESENTATION_TIMER = -1;
        
        startTrailer();
    } else { 
        HOME_PRESENTATION_STATE ++;
    }
}

function startTrailer() { 

    var canvas = document.getElementById('trailer');
    canvas.setAttribute('width', '500');
    canvas.setAttribute('height', '50');
    if (canvas.getContext) { 
        PACMAN_TRAILER_CANVAS_CONTEXT = canvas.getContext('2d');
    }
    
    if (HOME_TRAILER_TIMER === -1) { 
        HOME_TRAILER_STATE = 0;
        HOME_TRAILER_TIMER = setInterval("nextSequenceTrailer()", 20);
    }
}

function stopTrailer() { 

    if (HOME_TRAILER_TIMER != -1) { 
        $("#presentation *").hide();
        
        // --- 3. HIDE CAT WHEN STOPPED ---
        if (TRAILER_CAT_EL) {
            TRAILER_CAT_EL.style.display = 'none';
        }
        // --------------------------------
        
        HOME_TRAILER_STATE = 0;
        clearInterval(HOME_TRAILER_TIMER);
        HOME_TRAILER_TIMER = -1;
    }
}
function nextSequenceTrailer() { 

    erasePacmanTrailer();
    eraseGhostsTrailer();
    
    // --- PACMAN / CAT ANIMATION ---
    if (PACMAN_TRAILER_MOUNTH_STATE < PACMAN_TRAILER_MOUNTH_STATE_MAX) { 
        PACMAN_TRAILER_MOUNTH_STATE ++; 
    } else { 
        PACMAN_TRAILER_MOUNTH_STATE = 0; 
    }
    if ( PACMAN_TRAILER_DIRECTION === 1 ) { 
        PACMAN_TRAILER_POSITION_X += PACMAN_TRAILER_POSITION_STEP;
    } else if ( PACMAN_TRAILER_DIRECTION === 3 ) { 
        PACMAN_TRAILER_POSITION_X -= PACMAN_TRAILER_POSITION_STEP;
    }
    if ( PACMAN_TRAILER_POSITION_X < -650) { 
        PACMAN_TRAILER_DIRECTION = 1;
        PACMAN_TRAILER_POSITION_STEP ++; // Cat runs faster when turning back!
    }
    
    // --- GHOST ANIMATIONS ---
    if (GHOST_BLINKY_TRAILER_BODY_STATE < GHOST_TRAILER_BODY_STATE_MAX) { 
        GHOST_BLINKY_TRAILER_BODY_STATE ++;
    } else { 
        GHOST_BLINKY_TRAILER_BODY_STATE = 0;
    }
    if (GHOST_PINKY_TRAILER_BODY_STATE < GHOST_TRAILER_BODY_STATE_MAX) { 
        GHOST_PINKY_TRAILER_BODY_STATE ++;
    } else { 
        GHOST_PINKY_TRAILER_BODY_STATE = 0;
    }
    if (GHOST_INKY_TRAILER_BODY_STATE < GHOST_TRAILER_BODY_STATE_MAX) { 
        GHOST_INKY_TRAILER_BODY_STATE ++;
    } else { 
        GHOST_INKY_TRAILER_BODY_STATE = 0;
    }
    if (GHOST_CLYDE_TRAILER_BODY_STATE < GHOST_TRAILER_BODY_STATE_MAX) { 
        GHOST_CLYDE_TRAILER_BODY_STATE ++;
    } else { 
        GHOST_CLYDE_TRAILER_BODY_STATE = 0;
    }               

    // --- GHOST MOVEMENTS ---
    if ( GHOST_BLINKY_TRAILER_DIRECTION === 1 ) { 
        GHOST_BLINKY_TRAILER_POSITION_X += GHOST_TRAILER_POSITION_STEP;
    } else if ( GHOST_BLINKY_TRAILER_DIRECTION === 3 ) { 
        GHOST_BLINKY_TRAILER_POSITION_X -= GHOST_TRAILER_POSITION_STEP;
    }
    if ( GHOST_PINKY_TRAILER_DIRECTION === 1 ) { 
        GHOST_PINKY_TRAILER_POSITION_X += GHOST_TRAILER_POSITION_STEP;
    } else if ( GHOST_PINKY_TRAILER_DIRECTION === 3 ) { 
        GHOST_PINKY_TRAILER_POSITION_X -= GHOST_TRAILER_POSITION_STEP;
    }
    if ( GHOST_INKY_TRAILER_DIRECTION === 1 ) { 
        GHOST_INKY_TRAILER_POSITION_X += GHOST_TRAILER_POSITION_STEP;
    } else if ( GHOST_INKY_TRAILER_DIRECTION === 3 ) { 
        GHOST_INKY_TRAILER_POSITION_X -= GHOST_TRAILER_POSITION_STEP;
    }
    if ( GHOST_CLYDE_TRAILER_DIRECTION === 1 ) { 
        GHOST_CLYDE_TRAILER_POSITION_X += GHOST_TRAILER_POSITION_STEP;
    } else if ( GHOST_CLYDE_TRAILER_DIRECTION === 3 ) { 
        GHOST_CLYDE_TRAILER_POSITION_X -= GHOST_TRAILER_POSITION_STEP;
    }

    // --- GHOST TURNS (Scared Mode) ---
    if ( GHOST_BLINKY_TRAILER_POSITION_X < -255) { 
        GHOST_BLINKY_TRAILER_DIRECTION = 1;
        GHOST_BLINKY_TRAILER_STATE = 1;
    }
    if ( GHOST_PINKY_TRAILER_POSITION_X < -220) { 
        GHOST_PINKY_TRAILER_DIRECTION = 1;
        GHOST_PINKY_TRAILER_STATE = 1;
    }
    if ( GHOST_INKY_TRAILER_POSITION_X < -185) { 
        GHOST_INKY_TRAILER_DIRECTION = 1;
        GHOST_INKY_TRAILER_STATE = 1;
    }
    if ( GHOST_CLYDE_TRAILER_POSITION_X < -150) { 
        GHOST_CLYDE_TRAILER_DIRECTION = 1;
        GHOST_CLYDE_TRAILER_STATE = 1;
    }
    
    drawPacmanTrailer();
    drawGhostsTrailer();
    
    // --- LOOP LOGIC HERE ---
    if (HOME_TRAILER_STATE === 750) { 
        // Instead of clearing the timer, we RESET everything to the start
        HOME_TRAILER_STATE = 0;

        // Reset Pacman/Cat
        PACMAN_TRAILER_POSITION_X = 600;
        PACMAN_TRAILER_DIRECTION = 3;
        PACMAN_TRAILER_POSITION_STEP = 3;

        // Reset Blinky
        GHOST_BLINKY_TRAILER_POSITION_X = 1000;
        GHOST_BLINKY_TRAILER_DIRECTION = 3;
        GHOST_BLINKY_TRAILER_STATE = 0;

        // Reset Pinky
        GHOST_PINKY_TRAILER_POSITION_X = 1035;
        GHOST_PINKY_TRAILER_DIRECTION = 3;
        GHOST_PINKY_TRAILER_STATE = 0;

        // Reset Inky
        GHOST_INKY_TRAILER_POSITION_X = 1070;
        GHOST_INKY_TRAILER_DIRECTION = 3;
        GHOST_INKY_TRAILER_STATE = 0;

        // Reset Clyde
        GHOST_CLYDE_TRAILER_POSITION_X = 1105;
        GHOST_CLYDE_TRAILER_DIRECTION = 3;
        GHOST_CLYDE_TRAILER_STATE = 0;

    } else { 
        HOME_TRAILER_STATE ++;
    }
}

function getGhostsTrailerCanevasContext() { 
    return PACMAN_TRAILER_CANVAS_CONTEXT;
}
function drawGhostsTrailer() { 
    var ctx = getGhostsTrailerCanevasContext();
    
    if (GHOST_BLINKY_TRAILER_STATE === 1) { 
        ctx.fillStyle = GHOST_AFFRAID_COLOR;
    } else { 
        ctx.fillStyle = GHOST_BLINKY_COLOR;
    }
    drawHelperGhost(ctx, GHOST_BLINKY_TRAILER_POSITION_X, GHOST_BLINKY_TRAILER_POSITION_Y, GHOST_BLINKY_TRAILER_DIRECTION, GHOST_BLINKY_TRAILER_BODY_STATE, GHOST_BLINKY_TRAILER_STATE, 0);
    
    if (GHOST_PINKY_TRAILER_STATE === 1) { 
        ctx.fillStyle = GHOST_AFFRAID_COLOR;
    } else { 
        ctx.fillStyle = GHOST_PINKY_COLOR;
    }
    drawHelperGhost(ctx, GHOST_PINKY_TRAILER_POSITION_X, GHOST_PINKY_TRAILER_POSITION_Y, GHOST_PINKY_TRAILER_DIRECTION, GHOST_PINKY_TRAILER_BODY_STATE, GHOST_PINKY_TRAILER_STATE, 0);
    
    if (GHOST_INKY_TRAILER_STATE === 1) { 
        ctx.fillStyle = GHOST_AFFRAID_COLOR;
    } else { 
        ctx.fillStyle = GHOST_INKY_COLOR;
    }
    drawHelperGhost(ctx, GHOST_INKY_TRAILER_POSITION_X, GHOST_INKY_TRAILER_POSITION_Y, GHOST_INKY_TRAILER_DIRECTION, GHOST_INKY_TRAILER_BODY_STATE, GHOST_INKY_TRAILER_STATE, 0);
    
    if (GHOST_CLYDE_TRAILER_STATE === 1) { 
        ctx.fillStyle = GHOST_AFFRAID_COLOR;
    } else { 
        ctx.fillStyle = GHOST_CLYDE_COLOR;
    }
    drawHelperGhost(ctx, GHOST_CLYDE_TRAILER_POSITION_X, GHOST_CLYDE_TRAILER_POSITION_Y, GHOST_CLYDE_TRAILER_DIRECTION, GHOST_CLYDE_TRAILER_BODY_STATE, GHOST_CLYDE_TRAILER_STATE, 0);
}
function eraseGhostsTrailer(ghost) { 

    var ctx = getGhostsTrailerCanevasContext();
    
    ctx.clearRect(GHOST_BLINKY_TRAILER_POSITION_X - 17, GHOST_BLINKY_TRAILER_POSITION_Y - 17, 34, 34);
    ctx.clearRect(GHOST_PINKY_TRAILER_POSITION_X - 17, GHOST_BLINKY_TRAILER_POSITION_Y - 17, 34, 34);
    ctx.clearRect(GHOST_INKY_TRAILER_POSITION_X - 17, GHOST_BLINKY_TRAILER_POSITION_Y - 17, 34, 34);
    ctx.clearRect(GHOST_CLYDE_TRAILER_POSITION_X - 17, GHOST_BLINKY_TRAILER_POSITION_Y - 17, 34, 34);
}

function getPacmanTrailerCanevasContext() { 
    return PACMAN_TRAILER_CANVAS_CONTEXT;
}

// --- 4. UPDATED DRAW FUNCTION: Uses Mask Relative Position ---
function drawPacmanTrailer() { 
    if (TRAILER_CAT_EL) {
        // We do NOT need canvas offsets anymore because the cat is inside the Mask div 
        // which is already positioned exactly where the canvas is.
        // We simply use the game coordinates (X) and center it vertically (Y).

        var size = PACMAN_TRAILER_SIZE * 2 * TRAILER_CAT_SCALE;
        
        TRAILER_CAT_EL.style.width = size + 'px';
        TRAILER_CAT_EL.style.height = size + 'px';
        
        // Simpler positioning: Just use the Game X position directly!
        TRAILER_CAT_EL.style.left = PACMAN_TRAILER_POSITION_X + 'px';
        
        // Center Y vertically in the 50px tall mask
        // (25 is the center of the mask height)
        TRAILER_CAT_EL.style.top = (25 + TRAILER_CAT_OFFSET_Y) + 'px';
        
        // Handle Flip (Direction 3 is Left)
        var flip = (PACMAN_TRAILER_DIRECTION === 3) ? ' scaleX(-1)' : ' scaleX(1)';
        TRAILER_CAT_EL.style.transform = 'translate(-50%, -50%)' + flip;
        
        // The mask handles the hiding automatically via 'overflow: hidden'
        TRAILER_CAT_EL.style.display = 'block';
    }
}

function erasePacmanTrailer() { 
    // We don't need to erase anything on canvas because the cat is a DOM element floating above it.
}