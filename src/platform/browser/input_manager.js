/**
 * Browser Input & Touch Manager (Milestone 4 - Feature F19)
 * Captures Keyboard, Mouse pointer, and Touch events into normalized InputAction objects.
 *
 * Pure ES Module - Zero external dependencies.
 */

export class InputManager {
  /**
   * @param {HTMLElement|Object} [targetElement] - Canvas or container element for pointer events.
   * @param {Window|Object} [windowObj] - Window object for global keyboard listeners.
   */
  constructor(targetElement = null, windowObj = null) {
    this.targetElement = targetElement;
    this.win = windowObj || (typeof window !== 'undefined' ? window : null);

    // Continuous states
    this.keysDown = new Set();
    this.targetX = null;
    this.hasPointerMoved = false;

    // Edge-triggered triggers (cleared upon pollAction / getAction)
    this.pendingLaunch = false;
    this.pendingToggleBot = false;
    this.pendingTogglePause = false;
    this.pendingRestart = false;

    // Bound listener references for clean removal
    this._onKeyDown = this.handleKeyDown.bind(this);
    this._onKeyUp = this.handleKeyUp.bind(this);
    this._onPointerMove = this.handlePointerMove.bind(this);
    this._onPointerDown = this.handlePointerDown.bind(this);
    this._onTouchMove = this.handleTouchMove.bind(this);
    this._onTouchStart = this.handleTouchStart.bind(this);
    this._onBlur = this.reset.bind(this);

    this.attach();
  }

  /**
   * Attaches event listeners if running in a browser environment.
   */
  attach() {
    if (this.win && typeof this.win.addEventListener === 'function') {
      this.win.addEventListener('keydown', this._onKeyDown);
      this.win.addEventListener('keyup', this._onKeyUp);
      this.win.addEventListener('blur', this._onBlur);
    }

    if (this.targetElement && typeof this.targetElement.addEventListener === 'function') {
      this.targetElement.addEventListener('pointermove', this._onPointerMove);
      this.targetElement.addEventListener('pointerdown', this._onPointerDown);
      this.targetElement.addEventListener('touchmove', this._onTouchMove, { passive: false });
      this.targetElement.addEventListener('touchstart', this._onTouchStart, { passive: false });
    }
  }

  /**
   * Detaches all registered event listeners.
   */
  destroy() {
    if (this.win && typeof this.win.removeEventListener === 'function') {
      this.win.removeEventListener('keydown', this._onKeyDown);
      this.win.removeEventListener('keyup', this._onKeyUp);
      this.win.removeEventListener('blur', this._onBlur);
    }

    if (this.targetElement && typeof this.targetElement.removeEventListener === 'function') {
      this.targetElement.removeEventListener('pointermove', this._onPointerMove);
      this.targetElement.removeEventListener('pointerdown', this._onPointerDown);
      this.targetElement.removeEventListener('touchmove', this._onTouchMove);
      this.targetElement.removeEventListener('touchstart', this._onTouchStart);
    }

    this.reset();
  }

  /**
   * Resets all input state.
   */
  reset() {
    this.keysDown.clear();
    this.targetX = null;
    this.hasPointerMoved = false;
    this.pendingLaunch = false;
    this.pendingToggleBot = false;
    this.pendingTogglePause = false;
    this.pendingRestart = false;
  }

  /**
   * Translates clientX/Y coordinates to internal canvas coordinates.
   * @param {number} clientX - Pointer client X coordinate.
   * @returns {number|null} Normalized canvas X coordinate.
   */
  normalizeX(clientX) {
    if (!this.targetElement || typeof this.targetElement.getBoundingClientRect !== 'function') {
      return clientX;
    }

    const rect = this.targetElement.getBoundingClientRect();
    if (!rect.width || rect.width <= 0) return clientX;

    const internalWidth = this.targetElement.width || 480;
    const scaleX = internalWidth / rect.width;
    const canvasX = (clientX - rect.left) * scaleX;
    return Math.max(0, Math.min(internalWidth, canvasX));
  }

  handleKeyDown(e) {
    if (!e) return;
    const key = e.key;
    const code = e.code;
    if (e.target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
    if (e.target?.tagName === 'BUTTON' && (key === ' ' || key === 'Enter')) return;

    // Prevent default browser scrolling on game control keys
    if (key === ' ' || key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
      if (typeof e.preventDefault === 'function') {
        e.preventDefault();
      }
    }

    this.keysDown.add(key.toLowerCase());
    if (code) this.keysDown.add(code.toLowerCase());

    // Holding a steering key repeats movement; toggles only fire once per press.
    if (e.repeat) return;

    // Edge triggers
    if (key === ' ' || code === 'Space') {
      this.pendingLaunch = true;
    } else if (key === 'b' || key === 'B' || code === 'KeyB') {
      this.pendingToggleBot = true;
    } else if (key === 'p' || key === 'P' || key === 'Escape' || code === 'KeyP' || code === 'Escape') {
      this.pendingTogglePause = true;
    } else if (key === 'r' || key === 'R' || code === 'KeyR') {
      this.pendingRestart = true;
    }
  }

  handleKeyUp(e) {
    if (!e) return;
    const key = e.key;
    const code = e.code;
    this.keysDown.delete(key.toLowerCase());
    if (code) this.keysDown.delete(code.toLowerCase());
  }

  handlePointerMove(e) {
    if (!e) return;
    this.targetX = this.normalizeX(e.clientX);
    this.hasPointerMoved = true;
  }

  handlePointerDown(e) {
    if (!e) return;
    this.pendingLaunch = true;
    this.targetX = this.normalizeX(e.clientX);
    this.hasPointerMoved = true;
  }

  handleTouchMove(e) {
    if (!e) return;
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (e.touches && e.touches.length > 0) {
      this.targetX = this.normalizeX(e.touches[0].clientX);
      this.hasPointerMoved = true;
    }
  }

  handleTouchStart(e) {
    if (!e) return;
    if (typeof e.preventDefault === 'function') e.preventDefault();
    this.pendingLaunch = true;
    if (e.touches && e.touches.length > 0) {
      this.targetX = this.normalizeX(e.touches[0].clientX);
      this.hasPointerMoved = true;
    }
  }

  /**
   * Polls the current normalized InputAction and clears edge-triggered pulses.
   * @returns {Object} Normalized InputAction:
   *   { moveLeft, moveRight, targetX, launchBall, toggleBot, togglePause, restart }
   */
  pollAction() {
    const moveLeft = this.keysDown.has('arrowleft') || this.keysDown.has('a') || this.keysDown.has('keya');
    const moveRight = this.keysDown.has('arrowright') || this.keysDown.has('d') || this.keysDown.has('keyd');

    // If keyboard is actively steering, clear pointer targetX so keyboard takes priority
    if (moveLeft || moveRight) {
      this.targetX = null;
      this.hasPointerMoved = false;
    }

    const action = {
      moveLeft: Boolean(moveLeft),
      moveRight: Boolean(moveRight),
      targetX: this.hasPointerMoved ? this.targetX : null,
      launchBall: this.pendingLaunch,
      toggleBot: this.pendingToggleBot,
      togglePause: this.pendingTogglePause,
      restart: this.pendingRestart
    };

    // Clear one-shot triggers
    this.pendingLaunch = false;
    this.pendingToggleBot = false;
    this.pendingTogglePause = false;
    this.pendingRestart = false;

    return action;
  }

  /**
   * Alias for pollAction to satisfy interface contracts.
   */
  getAction() {
    return this.pollAction();
  }
}
