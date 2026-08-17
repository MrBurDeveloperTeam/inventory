/*
 * Mobile gesture controls for Tetris.
 *
 * Gesture mapping:
 * - Horizontal swipe: ArrowLeft / ArrowRight
 * - Single tap: Space
 * - Double tap: ArrowUp
 * - Long press: Hold ArrowDown
 * - HOLD button: C
 */
(function () {
    var viewport =
        document.getElementById(
            'tetris-viewport'
        );

    var holdButton =
        document.getElementById(
            'mobile-hold-button'
        );

    var guideButton =
        document.getElementById(
            'mobile-guide-button'
        );

    var guideModal =
        document.getElementById(
            'mobile-guide-modal'
        );

    var guideCloseButtons =
        document.querySelectorAll(
            '[data-mobile-guide-close]'
        );

    if (!viewport) {
        return;
    }

    /*
     * Do not install gesture controls on normal desktop
     * devices without touch support.
     */
    var isTouchDevice =
        navigator.maxTouchPoints > 0 ||
        window.matchMedia(
            '(pointer: coarse)'
        ).matches;

    if (!isTouchDevice) {
        return;
    }

    var overlay =
        document.getElementById(
            'overlay'
        );

    var KEYBOARD_KEYS = {
        ArrowLeft: {
            key: 'ArrowLeft',
            code: 'ArrowLeft',
            keyCode: 37
        },

        ArrowUp: {
            key: 'ArrowUp',
            code: 'ArrowUp',
            keyCode: 38
        },

        ArrowRight: {
            key: 'ArrowRight',
            code: 'ArrowRight',
            keyCode: 39
        },

        ArrowDown: {
            key: 'ArrowDown',
            code: 'ArrowDown',
            keyCode: 40
        },

        Space: {
            key: ' ',
            code: 'Space',
            keyCode: 32
        },

        KeyC: {
            key: 'c',
            code: 'KeyC',
            keyCode: 67
        }
    };

    /*
    * Approximately one horizontal gesture step per Tetris cell.
    */
    var SWIPE_STEP_PX = 28;
    var TAP_MOVE_LIMIT_PX = 14;
    var DOUBLE_TAP_DISTANCE_PX = 48;
    var DOUBLE_TAP_DELAY_MS = 240;
    var LONG_PRESS_DELAY_MS = 380;
    var SOFT_DROP_REPEAT_MS = 70;

    var activePointerId = null;

    var startX = 0;
    var startY = 0;
    var startTime = 0;

    var lastHorizontalStep = 0;

    var gestureMoved = false;
    var longPressActivated = false;

    var longPressTimer = 0;
    var softDropTimer = 0;

    var pendingTapTimer = 0;
    var lastTapTime = 0;
    var lastTapX = 0;
    var lastTapY = 0;

    /*
     * Create a keyboard event that supports both modern
     * event.code checks and older event.keyCode checks.
     */
    function dispatchKeyboardEvent(
        type,
        keyName,
        repeat
    ) {
        var keyConfig =
            KEYBOARD_KEYS[keyName];

        if (!keyConfig) {
            return;
        }

        var keyboardEvent =
            new KeyboardEvent(
                type,
                {
                    key: keyConfig.key,
                    code: keyConfig.code,
                    bubbles: true,
                    cancelable: true,
                    repeat: Boolean(repeat)
                }
            );

        /*
         * Some older Tetris keyboard handlers still read
         * keyCode or which.
         */
        try {
            Object.defineProperty(
                keyboardEvent,
                'keyCode',
                {
                    get: function () {
                        return keyConfig.keyCode;
                    }
                }
            );

            Object.defineProperty(
                keyboardEvent,
                'which',
                {
                    get: function () {
                        return keyConfig.keyCode;
                    }
                }
            );
        } catch (error) {
            /*
             * Modern key and code properties are still present.
             */
        }

        document.body.dispatchEvent(
            keyboardEvent
        );
    }

    /*
     * Simulate one normal keyboard press.
     */
    function pressKey(keyName) {
        dispatchKeyboardEvent(
            'keydown',
            keyName,
            false
        );

        dispatchKeyboardEvent(
            'keyup',
            keyName,
            false
        );
    }

    /*
    * Move horizontally through the explicit mobile API.
    * ArrowLeft and ArrowRight cannot use pressKey() because
    * the Tetris keyboard system expects the key state to remain
    * active until a later animation frame.
    */
    function moveHorizontal(direction) {
        var api =
            window.tetrisMobileApi;

        if (!api) {
            return;
        }

        if (
            direction < 0 &&
            typeof api.moveLeft ===
                'function'
        ) {
            api.moveLeft();
        } else if (
            direction > 0 &&
            typeof api.moveRight ===
                'function'
        ) {
            api.moveRight();
        }
    }

    /*
     * Begin accelerated downward movement.
     *
     * The first keydown supports games that track held keys.
     * The repeating keydown events support games that move
     * once for every keyboard event.
     */
    function startSoftDrop() {
        if (softDropTimer) {
            return;
        }

        dispatchKeyboardEvent(
            'keydown',
            'ArrowDown',
            false
        );

        softDropTimer =
            window.setInterval(
                function () {
                    dispatchKeyboardEvent(
                        'keydown',
                        'ArrowDown',
                        true
                    );
                },
                SOFT_DROP_REPEAT_MS
            );
    }

    /*
     * Stop accelerated downward movement immediately when
     * the user releases their finger.
     */
    function stopSoftDrop() {
        if (softDropTimer) {
            window.clearInterval(
                softDropTimer
            );

            softDropTimer = 0;
        }

        dispatchKeyboardEvent(
            'keyup',
            'ArrowDown',
            false
        );
    }

    function cancelLongPressTimer() {
        if (!longPressTimer) {
            return;
        }

        window.clearTimeout(
            longPressTimer
        );

        longPressTimer = 0;
    }

    /*
     * The gesture surface must not control Tetris when the
     * menu, pause screen, settings or leaderboard overlay
     * is currently visible.
     */
    function isGuideOpen() {
        return Boolean(
            guideModal &&
            !guideModal.hidden
        );
    }

    function isOverlayVisible() {
        if (isGuideOpen()) {
            return true;
        }

        if (!overlay) {
            return false;
        }

        return (
            window.getComputedStyle(
                overlay
            ).display !== 'none'
        );
    }

    /*
     * Ignore normal buttons and other interactive controls.
     */
    function isInteractiveTarget(target) {
        if (!(target instanceof Element)) {
            return false;
        }

        return Boolean(
            target.closest(
                [
                    '#mobile-hold-button',
                    'button',
                    'a',
                    'input',
                    'select',
                    'textarea'
                ].join(',')
            )
        );
    }

    function distanceBetween(
        x1,
        y1,
        x2,
        y2
    ) {
        return Math.hypot(
            x2 - x1,
            y2 - y1
        );
    }

    /*
     * Delay Space briefly so a second tap can cancel it
     * and become ArrowUp instead.
     */
    function registerTap(x, y) {
        var now = Date.now();

        var isSecondTap =
            pendingTapTimer &&
            now - lastTapTime <=
                DOUBLE_TAP_DELAY_MS &&
            distanceBetween(
                lastTapX,
                lastTapY,
                x,
                y
            ) <= DOUBLE_TAP_DISTANCE_PX;

        if (isSecondTap) {
            window.clearTimeout(
                pendingTapTimer
            );

            pendingTapTimer = 0;
            lastTapTime = 0;

            /*
             * Double tap: rotate the active piece.
             */
            pressKey('ArrowUp');

            return;
        }

        /*
         * A previous tap occurred somewhere else.
         * Complete that first tap as a hard drop.
         */
        if (pendingTapTimer) {
            window.clearTimeout(
                pendingTapTimer
            );

            pendingTapTimer = 0;

            pressKey('Space');
        }

        lastTapTime = now;
        lastTapX = x;
        lastTapY = y;

        pendingTapTimer =
            window.setTimeout(
                function () {
                    pendingTapTimer = 0;
                    lastTapTime = 0;

                    /*
                     * Single tap: hard drop.
                     */
                    pressKey('Space');
                },
                DOUBLE_TAP_DELAY_MS
            );
    }

    function resetPointerState() {
        activePointerId = null;

        startX = 0;
        startY = 0;
        startTime = 0;

        lastHorizontalStep = 0;

        gestureMoved = false;
        longPressActivated = false;

        cancelLongPressTimer();
        stopSoftDrop();
    }

    viewport.addEventListener(
        'pointerdown',
        function (event) {
            if (
                activePointerId !== null ||
                isOverlayVisible() ||
                isInteractiveTarget(
                    event.target
                )
            ) {
                return;
            }

            event.preventDefault();

            activePointerId =
                event.pointerId;

            startX = event.clientX;
            startY = event.clientY;
            startTime = Date.now();

            lastHorizontalStep = 0;

            gestureMoved = false;
            longPressActivated = false;

            try {
                viewport.setPointerCapture(
                    event.pointerId
                );
            } catch (error) {
                /*
                 * Pointer capture is optional.
                 */
            }

            /*
             * The body already has tabindex="0".
             */
            try {
                document.body.focus({
                    preventScroll: true
                });
            } catch (error) {
                document.body.focus();
            }

            longPressTimer =
                window.setTimeout(
                    function () {
                        if (
                            activePointerId ===
                                event.pointerId &&
                            !gestureMoved
                        ) {
                            longPressActivated = true;

                            /*
                             * Long press: accelerated fall.
                             */
                            startSoftDrop();
                        }
                    },
                    LONG_PRESS_DELAY_MS
                );
        },
        {
            passive: false
        }
    );

    viewport.addEventListener(
        'pointermove',
        function (event) {
            if (
                event.pointerId !==
                activePointerId
            ) {
                return;
            }

            event.preventDefault();

            var deltaX =
                event.clientX - startX;

            var deltaY =
                event.clientY - startY;

            var absoluteX =
                Math.abs(deltaX);

            var absoluteY =
                Math.abs(deltaY);

            if (
                absoluteX >
                    TAP_MOVE_LIMIT_PX ||
                absoluteY >
                    TAP_MOVE_LIMIT_PX
            ) {
                gestureMoved = true;

                cancelLongPressTimer();

                if (longPressActivated) {
                    longPressActivated = false;
                    stopSoftDrop();
                }
            }

            /*
             * Only treat mainly-horizontal movement as
             * left or right Tetris input.
             */
            if (
                absoluteX >
                absoluteY * 1.15
            ) {
                var targetStep =
                    Math.trunc(
                        deltaX /
                        SWIPE_STEP_PX
                    );

                /*
                * Move once for every additional horizontal swipe step.
                */
                while (
                    lastHorizontalStep <
                    targetStep
                ) {
                    moveHorizontal(1);
                    lastHorizontalStep++;
                }

                while (
                    lastHorizontalStep >
                    targetStep
                ) {
                    moveHorizontal(-1);
                    lastHorizontalStep--;
                }
            }
        },
        {
            passive: false
        }
    );

    function finishPointer(event) {
        if (
            event.pointerId !==
            activePointerId
        ) {
            return;
        }

        event.preventDefault();

        cancelLongPressTimer();

        var endX = event.clientX;
        var endY = event.clientY;

        var totalDistance =
            distanceBetween(
                startX,
                startY,
                endX,
                endY
            );

        var pressDuration =
            Date.now() -
            startTime;

        var wasLongPress =
            longPressActivated;

        var usedHorizontalSwipe =
            lastHorizontalStep !== 0;

        stopSoftDrop();

        /*
         * A short stationary release is a tap.
         */
        if (
            !wasLongPress &&
            !usedHorizontalSwipe &&
            totalDistance <=
                TAP_MOVE_LIMIT_PX &&
            pressDuration <
                LONG_PRESS_DELAY_MS
        ) {
            registerTap(
                endX,
                endY
            );
        }

        resetPointerState();
    }

    viewport.addEventListener(
        'pointerup',
        finishPointer,
        {
            passive: false
        }
    );

    viewport.addEventListener(
        'pointercancel',
        function (event) {
            if (
                event.pointerId ===
                activePointerId
            ) {
                resetPointerState();
            }
        },
        {
            passive: false
        }
    );

    /*
     * Prevent the browser context menu from appearing after
     * a prolonged touch.
     */
    viewport.addEventListener(
        'contextmenu',
        function (event) {
            event.preventDefault();
        }
    );

    function openMobileGuide() {
        if (!guideModal || !guideButton) {
            return;
        }

        resetPointerState();
        guideModal.hidden = false;
        guideButton.setAttribute(
            'aria-expanded',
            'true'
        );

        syncHoldButtonVisibility();

        var closeButton =
            document.getElementById(
                'mobile-guide-close'
            );

        if (closeButton) {
            closeButton.focus();
        }
    }

    function closeMobileGuide() {
        if (!guideModal || !guideButton) {
            return;
        }

        guideModal.hidden = true;
        guideButton.setAttribute(
            'aria-expanded',
            'false'
        );

        syncHoldButtonVisibility();
        guideButton.focus();
    }

    if (guideButton && guideModal) {
        guideButton.addEventListener(
            'pointerdown',
            function (event) {
                event.stopPropagation();
            }
        );

        guideButton.addEventListener(
            'click',
            function (event) {
                event.preventDefault();
                event.stopPropagation();
                openMobileGuide();
            }
        );

        guideCloseButtons.forEach(
            function (button) {
                button.addEventListener(
                    'pointerdown',
                    function (event) {
                        event.stopPropagation();
                    }
                );

                button.addEventListener(
                    'click',
                    function (event) {
                        event.preventDefault();
                        event.stopPropagation();
                        closeMobileGuide();
                    }
                );
            }
        );

        document.addEventListener(
            'keydown',
            function (event) {
                if (
                    event.key === 'Escape' &&
                    isGuideOpen()
                ) {
                    closeMobileGuide();
                }
            }
        );
    }

    /*
    * Mobile HOLD button: keyboard C.
    */
    if (holdButton) {
        holdButton.addEventListener(
            'pointerdown',
            function (event) {
                event.stopPropagation();
            }
        );

        holdButton.addEventListener(
            'click',
            function (event) {
                event.preventDefault();
                event.stopPropagation();

                pressKey('KeyC');
            }
        );
    }

    /*
     * Show the HOLD button only while actual gameplay is
     * visible. Hide it on the start, pause, settings and
     * game-over overlays.
     */
    function syncHoldButtonVisibility() {
        if (!holdButton) {
            return;
        }

        holdButton.classList.toggle(
            'is-gameplay-visible',
            !isOverlayVisible()
        );
    }

    syncHoldButtonVisibility();

    if (
        overlay &&
        'MutationObserver' in window
    ) {
        var overlayObserver =
            new MutationObserver(
                syncHoldButtonVisibility
            );

        overlayObserver.observe(
            overlay,
            {
                attributes: true,
                attributeFilter: [
                    'style',
                    'class'
                ]
            }
        );
    }

    /*
     * Ensure a held ArrowDown state cannot remain active
     * after switching apps or hiding the browser.
     */
    window.addEventListener(
        'blur',
        resetPointerState
    );

    document.addEventListener(
        'visibilitychange',
        function () {
            if (document.hidden) {
                resetPointerState();
            }
        }
    );
})();