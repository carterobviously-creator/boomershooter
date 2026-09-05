const GAME_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyR",
  "KeyF",
  "KeyE",
  "KeyQ",
  "KeyI",
  "KeyC",
  "Space",
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "Tab",
  "Escape",
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

export class Input {
  keys = new Set<string>();
  just = new Set<string>();
  injected: Set<string> | null = null;
  mouseDX = 0;
  mouseDY = 0;
  fireHeld = false;
  fireJust = false;
  altHeld = false;
  touchMoveX = 0;
  touchMoveY = 0;
  touchLookX = 0;
  touchLookY = 0;
  padLookX = 0;
  padLookY = 0;
  padMoveX = 0;
  padMoveY = 0;
  lookSens = 0.0022;
  invertY = false;

  private canvas: HTMLCanvasElement | null = null;

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVis);
    canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("mousemove", this.onMouseMove);
    canvas.addEventListener("contextmenu", this.onCtx);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  detach() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVis);
    this.canvas?.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    this.canvas?.removeEventListener("contextmenu", this.onCtx);
    this.canvas?.removeEventListener("wheel", this.onWheel);
  }

  setInjected(codes: string[]) {
    this.injected = codes.length ? new Set(codes) : null;
  }

  isDown(code: string) {
    if (this.injected) return this.injected.has(code);
    return this.keys.has(code);
  }

  wasPressed(code: string) {
    if (this.injected) return false;
    return this.just.has(code);
  }

  endFrame() {
    this.just.clear();
    this.fireJust = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.touchLookX = 0;
    this.touchLookY = 0;
  }

  pollGamepad() {
    this.padMoveX = 0;
    this.padMoveY = 0;
    this.padLookX = 0;
    this.padLookY = 0;
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) {
      if (!p || p.mapping !== "standard") continue;
      const ls = radial(p.axes[0] ?? 0, p.axes[1] ?? 0, 0.18);
      this.padMoveX += ls.x;
      this.padMoveY += ls.y;
      const rs = radial(p.axes[2] ?? 0, p.axes[3] ?? 0, 0.18);
      this.padLookX += rs.x;
      this.padLookY += rs.y;
      if (p.buttons[7]?.pressed) {
        if (!this.fireHeld) this.fireJust = true;
        this.fireHeld = true;
      }
      if (p.buttons[6]?.pressed) this.altHeld = true;
      if (p.buttons[0]?.pressed) this.keys.add("Space");
      if (p.buttons[9]?.pressed) this.just.add("Escape");
      if (p.buttons[2]?.pressed) this.just.add("KeyR");
      if (p.buttons[3]?.pressed) this.just.add("Digit4");
      if (p.buttons[4]?.pressed) this.just.add("Digit1");
      if (p.buttons[5]?.pressed) this.just.add("Digit3");
      break;
    }
  }

  moveAxis(): { x: number; y: number } {
    let x = this.touchMoveX + this.padMoveX;
    let y = this.touchMoveY + this.padMoveY;
    if (this.isDown("KeyW") || this.isDown("ArrowUp")) y -= 1;
    if (this.isDown("KeyS") || this.isDown("ArrowDown")) y += 1;
    if (this.isDown("KeyD") || this.isDown("ArrowRight")) x += 1;
    if (this.isDown("KeyA") || this.isDown("ArrowLeft")) x -= 1;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    return { x, y };
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (GAME_CODES.has(e.code)) e.preventDefault();
    if (!this.keys.has(e.code)) this.just.add(e.code);
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.keys.clear();
    this.fireHeld = false;
    this.altHeld = false;
  };

  private onVis = () => {
    if (document.hidden) this.onBlur();
  };

  private onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) {
      this.fireHeld = true;
      this.fireJust = true;
    }
    if (e.button === 2) this.altHeld = true;
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.fireHeld = false;
    if (e.button === 2) this.altHeld = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.canvas) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };

  private onCtx = (e: Event) => e.preventDefault();

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (e.deltaY > 0) this.just.add("WheelDown");
    else this.just.add("WheelUp");
  };
}

function radial(x: number, y: number, dz: number) {
  const m = Math.hypot(x, y);
  if (m < dz) return { x: 0, y: 0 };
  const scale = (m - dz) / (1 - dz) / m;
  return { x: x * scale, y: y * scale };
}

export const input = new Input();
