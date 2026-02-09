var PACMAN_DIRECTION = 3;
var PACMAN_DIRECTION_TRY = -1;
var PACMAN_DIRECTION_TRY_TIMER = null;
var PACMAN_DIRECTION_TRY_CANCEL = 1000;
var PACMAN_POSITION_X = 276;
var PACMAN_POSITION_Y = 416;
var PACMAN_POSITION_STEP = 2;
var PACMAN_MOUNTH_STATE = 3;
var PACMAN_MOUNTH_STATE_MAX = 6;
var PACMAN_SIZE = 16;
var PACMAN_MOVING = false;
var PACMAN_MOVING_TIMER = -1;
var PACMAN_MOVING_SPEED = 15;
var PACMAN_CANVAS_CONTEXT = null;
var PACMAN_IMAGE_STAY = null;
var PACMAN_IMAGE_STAY_READY = false;
var PACMAN_IMAGE_MOVING = null;
var PACMAN_IMAGE_MOVING_READY = false;
var PACMAN_IMAGE_SCALE = 1.35; // scale factor for cat sprite relative to Pac-Man diameter
var PACMAN_IMAGE_OFFSET_Y = -8; // vertical nudge to visually center cat in maze paths
var PACMAN_ANIM_TIMER = -1; // keeps cat gif animating while stationary
var PACMAN_ANIM_SPEED = 120; // ms between redraws for gif frames
var PACMAN_IMG_EL = null; // DOM image overlay for animated cat
var PACMAN_EAT_GAP = 15;
var PACMAN_GHOST_GAP = 20;
var PACMAN_FRUITS_GAP = 15;
var PACMAN_KILLING_TIMER = -1;
var PACMAN_KILLING_SPEED = 70;
var PACMAN_RETRY_SPEED = 2100;
var PACMAN_DEAD = false;

function initPacman() { 
	var canvas = document.getElementById('canvas-pacman');
	canvas.setAttribute('width', '550');
	canvas.setAttribute('height', '550');
	if (canvas.getContext) { 
		PACMAN_CANVAS_CONTEXT = canvas.getContext('2d');
	}

	ensurePacmanImageElement();

	// Load cat images for idle and moving states (preload & redraw on ready)
	if (!PACMAN_IMAGE_STAY) {
		PACMAN_IMAGE_STAY = new Image();
		PACMAN_IMAGE_STAY.onload = function() { 
			PACMAN_IMAGE_STAY_READY = true;
			if (PACMAN_CANVAS_CONTEXT) {
				erasePacman();
				drawPacman();
			}
			startPacmanAnimator();
		};
		PACMAN_IMAGE_STAY.src = 'img/cat_stay.gif';
	} else if (PACMAN_IMAGE_STAY.complete) {
		PACMAN_IMAGE_STAY_READY = true;
		startPacmanAnimator();
	}

	if (!PACMAN_IMAGE_MOVING) {
		PACMAN_IMAGE_MOVING = new Image();
		PACMAN_IMAGE_MOVING.onload = function() { 
			PACMAN_IMAGE_MOVING_READY = true;
		};
		PACMAN_IMAGE_MOVING.src = 'img/cat_moving.gif';
	} else if (PACMAN_IMAGE_MOVING.complete) {
		PACMAN_IMAGE_MOVING_READY = true;
	}
}

function ensurePacmanImageElement() {
	if (!PACMAN_IMG_EL) {
		PACMAN_IMG_EL = document.getElementById('pacman-cat');
		if (!PACMAN_IMG_EL) {
			PACMAN_IMG_EL = document.createElement('img');
			PACMAN_IMG_EL.id = 'pacman-cat';
			PACMAN_IMG_EL.style.position = 'absolute';
			PACMAN_IMG_EL.style.pointerEvents = 'none';
			PACMAN_IMG_EL.style.display = 'none';
			PACMAN_IMG_EL.style.transformOrigin = '50% 50%';
			PACMAN_IMG_EL.style.willChange = 'transform, left, top';
			var board = document.getElementById('board');
			board.appendChild(PACMAN_IMG_EL);
		}
	}
}
function resetPacman() { 
	stopPacman();

	PACMAN_DIRECTION = 3;
	PACMAN_DIRECTION_TRY = -1;
	PACMAN_DIRECTION_TRY_TIMER = null;
	PACMAN_POSITION_X = 276;
	PACMAN_POSITION_Y = 416;
	PACMAN_MOUNTH_STATE = 3;
	PACMAN_MOVING = false;
	PACMAN_MOVING_TIMER = -1;
	PACMAN_KILLING_TIMER = -1;
	PACMAN_DEAD = false;
	PACMAN_SUPER = false;
}
function getPacmanCanevasContext() { 
	return PACMAN_CANVAS_CONTEXT;
}

function startPacmanAnimator() {
	if (PACMAN_ANIM_TIMER === -1) {
		PACMAN_ANIM_TIMER = setInterval(function() {
			// Redraw periodically so GIF frames advance (even while moving)
			if ((!PACMAN_IMAGE_STAY_READY && !PACMAN_IMAGE_MOVING_READY) || PACMAN_DEAD) return;
			erasePacman();
			drawPacman();
		}, PACMAN_ANIM_SPEED);
	}
}

function stopPacman() { 
	if (PACMAN_MOVING_TIMER != -1) { 
		clearInterval(PACMAN_MOVING_TIMER);
		PACMAN_MOVING_TIMER = -1;
		PACMAN_MOVING = false;
	}
	if (PACMAN_KILLING_TIMER != -1) { 
		clearInterval(PACMAN_KILLING_TIMER);
		PACMAN_KILLING_TIMER = -1;
	}
}

function pausePacman() { 
	if (PACMAN_DIRECTION_TRY_TIMER != null) { 
		PACMAN_DIRECTION_TRY_TIMER.pause();
	}
	
	if ( PACMAN_MOVING_TIMER != -1 ) { 
		clearInterval(PACMAN_MOVING_TIMER);
		PACMAN_MOVING_TIMER = -1;
		PACMAN_MOVING = false;
	}
}
function resumePacman() { 
	if (PACMAN_DIRECTION_TRY_TIMER != null) { 
		PACMAN_DIRECTION_TRY_TIMER.resume();
	}
	movePacman();
}

function tryMovePacmanCancel() { 
	if (PACMAN_DIRECTION_TRY_TIMER != null) { 
		PACMAN_DIRECTION_TRY_TIMER.cancel();
		PACMAN_DIRECTION_TRY = -1;
		PACMAN_DIRECTION_TRY_TIMER = null;
	}
}
function tryMovePacman(direction) { 
	PACMAN_DIRECTION_TRY = direction;
	PACMAN_DIRECTION_TRY_TIMER = new Timer('tryMovePacmanCancel()', PACMAN_DIRECTION_TRY_CANCEL);
}

function movePacman(direction) {

	if (PACMAN_MOVING === false) { 
		PACMAN_MOVING = true;
		drawPacman();
		PACMAN_MOVING_TIMER = setInterval('movePacman()', PACMAN_MOVING_SPEED);
	}
	
	var directionTry = direction;
	var quarterChangeDirection = false;
	
	if (!directionTry && PACMAN_DIRECTION_TRY != -1) { 
		directionTry = PACMAN_DIRECTION_TRY;
	}
	
	if ((!directionTry || PACMAN_DIRECTION !== directionTry)) { 
	
		if (directionTry) { 
			if (canMovePacman(directionTry)) { 
				if (PACMAN_DIRECTION + 1 === directionTry || PACMAN_DIRECTION - 1 === directionTry || PACMAN_DIRECTION + 1 === directionTry || (PACMAN_DIRECTION === 4 && directionTry === 1) || (PACMAN_DIRECTION === 1 && directionTry === 4) ) { 
					quarterChangeDirection = true;
				}
				PACMAN_DIRECTION = directionTry;
				tryMovePacmanCancel();
			} else { 
				if (directionTry !== PACMAN_DIRECTION_TRY) { 
					tryMovePacmanCancel();
				}
				if (PACMAN_DIRECTION_TRY === -1) { 
					tryMovePacman(directionTry);
				}
			}
		}

		if (canMovePacman(PACMAN_DIRECTION)) { 
			erasePacman();
			
			if (PACMAN_MOUNTH_STATE < PACMAN_MOUNTH_STATE_MAX) { 
				PACMAN_MOUNTH_STATE ++; 
			} else { 
				PACMAN_MOUNTH_STATE = 0; 
			}
						
			var speedUp = 0;
			if (quarterChangeDirection) { 
				speedUp = 6;
			}
			
			if ( PACMAN_DIRECTION === 1 ) { 
				PACMAN_POSITION_X += PACMAN_POSITION_STEP + speedUp;
			} else if ( PACMAN_DIRECTION === 2 ) { 
				PACMAN_POSITION_Y += PACMAN_POSITION_STEP + speedUp;
			} else if ( PACMAN_DIRECTION === 3 ) { 
				PACMAN_POSITION_X -= PACMAN_POSITION_STEP + speedUp;
			} else if ( PACMAN_DIRECTION === 4 ) { 
				PACMAN_POSITION_Y -= (PACMAN_POSITION_STEP + speedUp);
			}
			
			if ( PACMAN_POSITION_X === 2 && PACMAN_POSITION_Y === 258 ) { 
				PACMAN_POSITION_X = 548;
				PACMAN_POSITION_Y = 258;
			} else if ( PACMAN_POSITION_X === 548 && PACMAN_POSITION_Y === 258 ) { 
				PACMAN_POSITION_X = 2;
				PACMAN_POSITION_Y = 258;
			}
			
			drawPacman();
			
			if ((PACMAN_MOUNTH_STATE) === 0 || (PACMAN_MOUNTH_STATE) === 3) { 
				testBubblesPacman();
				testGhostsPacman();
				testFruitsPacman();
			}
		} else { 
			stopPacman();
		}
	} else if (direction && PACMAN_DIRECTION === direction) { 
		tryMovePacmanCancel();
	}
}

function canMovePacman(direction) { 
	
	var positionX = PACMAN_POSITION_X;
	var positionY = PACMAN_POSITION_Y;
	
	if (positionX === 276 && positionY === 204 && direction === 2) return false;
	
	if ( direction === 1 ) { 
		positionX += PACMAN_POSITION_STEP;
	} else if ( direction === 2 ) { 
		positionY += PACMAN_POSITION_STEP;
	} else if ( direction === 3 ) { 
		positionX -= PACMAN_POSITION_STEP;
	} else if ( direction === 4 ) { 
		positionY -= PACMAN_POSITION_STEP;
	}
	
	for (var i = 0, imax = PATHS.length; i < imax; i ++) { 
	
		var p = PATHS[i];
		var c = p.split("-");
		var cx = c[0].split(",");
		var cy = c[1].split(",");
	
		var startX = cx[0];
		var startY = cx[1];
		var endX = cy[0];
		var endY = cy[1];

		if (positionX >= startX && positionX <= endX && positionY >= startY && positionY <= endY) { 
			return true;
		}
	}
	
	return false;
}

function drawPacman() { 

    var ctx = getPacmanCanevasContext();
    
    if (PACMAN_IMAGE_STAY_READY || PACMAN_IMAGE_MOVING_READY) {
        
        var imgSize = PACMAN_SIZE * 2 * PACMAN_IMAGE_SCALE;
        var currentImage = PACMAN_MOVING && PACMAN_IMAGE_MOVING_READY ? PACMAN_IMAGE_MOVING
            : PACMAN_IMAGE_STAY_READY ? PACMAN_IMAGE_STAY
            : PACMAN_IMAGE_MOVING;

        // --- START OF FIX ---
        // Only update the src if it is different. 
        // This prevents the GIF from resetting to frame 0.
        if (PACMAN_IMG_EL.src !== currentImage.src) {
            PACMAN_IMG_EL.src = currentImage.src;
        }
        // --- END OF FIX ---

        PACMAN_IMG_EL.style.width = imgSize + 'px';
        PACMAN_IMG_EL.style.height = imgSize + 'px';
        PACMAN_IMG_EL.style.left = PACMAN_POSITION_X + 'px';
        PACMAN_IMG_EL.style.top = (PACMAN_POSITION_Y + PACMAN_IMAGE_OFFSET_Y) + 'px';

        var flip = PACMAN_DIRECTION === 3 ? ' scaleX(-1)' : '';
        PACMAN_IMG_EL.style.transform = 'translate(-50%, -50%)' + flip;
        PACMAN_IMG_EL.style.display = 'block';
    } else {
		// Fallback to original vector Pac-Man while image loads
		ctx.fillStyle = "#fff200";
		ctx.beginPath();
		
		var startAngle = 0;
		var endAngle = 2 * Math.PI;
		var lineToX = PACMAN_POSITION_X;
		var lineToY = PACMAN_POSITION_Y;
		if (PACMAN_DIRECTION === 1) { 
			startAngle = (0.35 - (PACMAN_MOUNTH_STATE * 0.05)) * Math.PI;
			endAngle = (1.65 + (PACMAN_MOUNTH_STATE * 0.05)) * Math.PI;
			lineToX -= 8;
		} else if (PACMAN_DIRECTION === 2) { 
			startAngle = (0.85 - (PACMAN_MOUNTH_STATE * 0.05)) * Math.PI;
			endAngle = (0.15 + (PACMAN_MOUNTH_STATE * 0.05)) * Math.PI;
			lineToY -= 8;
		} else if (PACMAN_DIRECTION === 3) { 
			startAngle = (1.35 - (PACMAN_MOUNTH_STATE * 0.05)) * Math.PI;
			endAngle = (0.65 + (PACMAN_MOUNTH_STATE * 0.05)) * Math.PI;
			lineToX += 8;
		} else if (PACMAN_DIRECTION === 4) { 
			startAngle = (1.85 - (PACMAN_MOUNTH_STATE * 0.05)) * Math.PI;
			endAngle = (1.15 + (PACMAN_MOUNTH_STATE * 0.05)) * Math.PI;
			lineToY += 8;
		}
		ctx.arc(PACMAN_POSITION_X, PACMAN_POSITION_Y, PACMAN_SIZE, startAngle, endAngle, false);
		ctx.lineTo(lineToX, lineToY);
		ctx.fill();
		ctx.closePath();
	}
}

function erasePacman() { 

	var ctx = getPacmanCanevasContext();
	// Clear an area big enough where the cat might have been drawn previously (fallback)
	ctx.clearRect(0, 0, 550, 550);
}

function killPacman() { 
	playDieSound();

	LOCK = true;
	PACMAN_DEAD = true;
	stopPacman();
	stopGhosts();
	pauseTimes();
	stopBlinkSuperBubbles();
	PACMAN_KILLING_TIMER = setInterval('killingPacman()', PACMAN_KILLING_SPEED);
}
function killingPacman() { 
	if (PACMAN_MOUNTH_STATE > -12) { 
		erasePacman();
		PACMAN_MOUNTH_STATE --;
		drawPacman();
	} else { 
		clearInterval(PACMAN_KILLING_TIMER);
		PACMAN_KILLING_TIMER = -1;
		erasePacman();
		if (LIFES > 0) { 
			lifes(-1);
			setTimeout('retry()', (PACMAN_RETRY_SPEED));
		} else { 
			gameover();
		}
	}
}

function testGhostsPacman() { 
	testGhostPacman('blinky');
	testGhostPacman('pinky');
	testGhostPacman('inky');
	testGhostPacman('clyde');

}
function testGhostPacman(ghost) { 
	eval('var positionX = GHOST_' + ghost.toUpperCase() + '_POSITION_X');
	eval('var positionY = GHOST_' + ghost.toUpperCase() + '_POSITION_Y');
		
	if (positionX <= PACMAN_POSITION_X + PACMAN_GHOST_GAP && positionX >= PACMAN_POSITION_X - PACMAN_GHOST_GAP && positionY <= PACMAN_POSITION_Y + PACMAN_GHOST_GAP && positionY >= PACMAN_POSITION_Y - PACMAN_GHOST_GAP ) { 
		eval('var state = GHOST_' + ghost.toUpperCase() + '_STATE');
		if (state === 0) { 
			killPacman();
		} else if (state === 1) { 
			startEatGhost(ghost);
		}
	}
}
function testFruitsPacman() { 
	
	if (FRUIT_CANCEL_TIMER != null) { 
		if (FRUITS_POSITION_X <= PACMAN_POSITION_X + PACMAN_FRUITS_GAP && FRUITS_POSITION_X >= PACMAN_POSITION_X - PACMAN_FRUITS_GAP && FRUITS_POSITION_Y <= PACMAN_POSITION_Y + PACMAN_FRUITS_GAP && FRUITS_POSITION_Y >= PACMAN_POSITION_Y - PACMAN_FRUITS_GAP ) { 
			eatFruit();
		}
	}
}
function testBubblesPacman() { 
	
	var r = { x: PACMAN_POSITION_X - ( PACMAN_SIZE / 2 ), y: PACMAN_POSITION_Y - ( PACMAN_SIZE / 2 ) , width: ( PACMAN_SIZE * 2 ), height: ( PACMAN_SIZE * 2 ) };
		
	for (var i = 0, imax = BUBBLES_ARRAY.length; i < imax; i ++) { 
		var bubble = BUBBLES_ARRAY[i];
		
		var bubbleParams = bubble.split( ";" );
		var testX = parseInt(bubbleParams[0].split( "," )[0]);
		var testY = parseInt(bubbleParams[0].split( "," )[1]);
		var p = { x: testX, y: testY };
		
		if ( isPointInRect( p, r ) ) { 
			
			if ( bubbleParams[4] === "0" ) { 
				var type = bubbleParams[3];
							
				eraseBubble( type, testX, testY );
				BUBBLES_ARRAY[i] = bubble.substr( 0, bubble.length - 1 ) + "1"
				
				if ( type === "s" ) { 
					setSuperBubbleOnXY( testX, testY, "1" );
					score( SCORE_SUPER_BUBBLE );
					playEatPillSound();
					affraidGhosts();
				} else { 
					score( SCORE_BUBBLE );
					playEatingSound();
				}
				BUBBLES_COUNTER --;
				if ( BUBBLES_COUNTER === 0 ) { 
					win();
				}
			} else { 
				stopEatingSound();
			}
			return;
		}
	}
}
