import { useEffect, useRef, useState } from "react";
import { useHud } from "@/game/store";

export function GameApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<{
    startRun: () => void;
    resume: () => void;
    restart: () => void;
    pause: () => void;
    toggleInventory: () => void;
    setSlot: (n: number) => void;
    setPixelScale: (n: number) => void;
    dispose: () => void;
  } | null>(null);
  const hud = useHud();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dead = false;
    let g: (typeof gameRef)["current"] = null;
    import("@/game/engine")
      .then(({ Game }) => {
        if (dead || !canvas) return;
        const inst = new Game(canvas);
        g = inst;
        gameRef.current = inst;
      })
      .catch((e: unknown) => {
        setErr(e instanceof Error ? e.message : "Failed to load the vault");
      });
    return () => {
      dead = true;
      g?.dispose();
      gameRef.current = null;
    };
  }, []);

  const start = () => gameRef.current?.startRun();
  const resume = () => gameRef.current?.resume();
  const restart = () => gameRef.current?.restart();
  const setSlot = (n: number) => gameRef.current?.setSlot(n);

  return (
    <main className="vb-root">
      <canvas
        ref={canvasRef}
        className="vb-canvas"
        aria-label="VAULTBREAKER dungeon"
      />
      {hud.mode === "playing" || hud.mode === "paused" ? <Hud onSlot={setSlot} /> : null}
      {hud.mode === "title" ? <Title onStart={start} ready={hud.ready} /> : null}
      {hud.mode === "paused" || hud.mode === "settings" ? (
        <Pause onResume={resume} onRestart={restart} />
      ) : null}
      {hud.mode === "inventory" ? <Inventory onClose={resume} /> : null}
      {hud.mode === "dead" ? <Dead onRestart={restart} /> : null}
      {hud.isTouch && hud.mode === "playing" ? <TouchControls /> : null}
      {err ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-bg text-fg">
          <p className="font-display text-lg">{err}</p>
        </div>
      ) : null}
    </main>
  );
}

function pad(n: number, w = 4) {
  return String(Math.max(0, Math.floor(n))).padStart(w, "0");
}

function Hud({ onSlot }: { onSlot: (n: number) => void }) {
  const hud = useHud();
  const hpPct = Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100));
  const arPct = Math.max(0, Math.min(100, (hud.armor / hud.maxArmor) * 100));
  const stPct = Math.max(0, Math.min(100, hud.stamina));
  const icons = [
    "/game/icon-shield.png",
    "/game/icon-orb.png",
    "/game/icon-shells.png",
    "/game/icon-heal.png",
  ];
  const counts = [hud.blocking ? "BLK" : "", "", `${hud.mag}`, `${hud.heals}`];

  return (
    <div className="vb-hud">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          boxShadow: `inset 0 0 ${80 + hud.hurtFlash * 140}px ${hud.hurtFlash * 70}px rgba(180,20,20,${hud.hurtFlash * 0.55})`,
        }}
      />

      <div className="absolute top-3 left-3 sm:top-5 sm:left-5 flex flex-col gap-1.5 w-[min(52vw,280px)]">
        <div className="flex items-center gap-2">
          <img src="/game/heart.png" alt="" className="size-6 sm:size-7" style={{ imageRendering: "pixelated" }} />
          <div className="bar-track flex-1">
            <div className="bar-fill bg-hp" style={{ width: `${hpPct}%` }} />
          </div>
        </div>
        <div className="bar-track">
          <div className="bar-fill bg-stam" style={{ width: `${stPct}%` }} />
        </div>
        <div className="bar-track" style={{ height: 8 }}>
          <div className="bar-fill bg-armor" style={{ width: `${arPct}%` }} />
        </div>
        <div className="flex items-center gap-2 mt-1">
          <img src="/game/heart.png" alt="" className="size-5" style={{ imageRendering: "pixelated" }} />
          <span className="pixel-num text-[13px] sm:text-[16px]">{pad(hud.hp, 3)}</span>
        </div>
      </div>

      <div className="absolute top-3 right-3 sm:top-5 sm:right-5 text-right">
        <div className="pixel-num text-[18px] sm:text-[26px] leading-none">{pad(hud.score)}</div>
        <div className="pixel-num text-[14px] sm:text-[20px] mt-2 leading-none">{pad(hud.ammo + hud.mag)}</div>
        {hud.wave > 0 ? (
          <div className="mt-3 font-display text-[11px] tracking-[0.2em] text-muted">WAVE {hud.wave}</div>
        ) : null}
        {hud.combo > 1 ? (
          <div className="pixel-num text-[10px] mt-2 text-score">COMBO x{hud.combo}</div>
        ) : null}
      </div>

      <img
        src="/game/icon-shield.png"
        alt=""
        className="hidden sm:block absolute left-4 top-[38%] w-14 opacity-90"
        style={{ imageRendering: "pixelated" }}
      />
      <img
        src={icons[hud.slot]}
        alt=""
        className="hidden sm:block absolute right-4 top-[36%] w-12 opacity-90"
        style={{ imageRendering: "pixelated" }}
      />

      <div className={`crosshair ${hud.hitFlash > 0.15 ? "hit" : ""}`} />

      {hud.announce ? (
        <div className="absolute left-1/2 top-[22%] -translate-x-1/2 font-display tracking-[0.35em] text-score text-lg sm:text-2xl text-center drop-shadow-[0_2px_0_#1a1208]">
          {hud.announce}
        </div>
      ) : null}

      <div className="hotbar absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 flex gap-2 sm:gap-3">
        {icons.map((src, i) => (
          <button
            key={src}
            type="button"
            className={`slot relative ${hud.slot === i ? "on" : ""}`}
            onClick={() => onSlot(i)}
            aria-label={`Weapon ${i + 1}`}
          >
            <img src={src} alt="" />
            {counts[i] ? (
              <span className="pixel-num absolute -bottom-1 text-[8px]">{counts[i]}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function Title({ onStart, ready }: { onStart: () => void; ready: boolean }) {
  const hud = useHud();
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-end sm:justify-center px-5 pb-10 sm:pb-0 bg-[linear-gradient(to_top,#0b0d12_0%,transparent_42%,#0b0d12aa_100%)]">
      <div className="w-full max-w-xl text-center menu rounded-lg bg-bg/55 px-4 py-6 sm:bg-transparent sm:p-0">
        <p className="font-display tracking-[0.45em] text-[11px] sm:text-xs text-gold mb-3">A 16-BIT BOOMER SHOOTER</p>
        <h1 className="font-display text-[clamp(2.4rem,8vw,4.6rem)] font-bold leading-[0.95] tracking-[0.08em] text-fg drop-shadow-[0_4px_24px_#0b0d12]">
          VAULTBREAKER
        </h1>
        <div className="mx-auto mt-4 mb-6 h-px w-40 bg-gold/50" />
        <p className="text-muted text-sm max-w-md mx-auto leading-relaxed">
          Smash the cursed reliquary. Claim every gem. The shields remember you.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button type="button" className="vb-btn min-h-12 min-w-44" onClick={onStart} disabled={!ready}>
            {ready ? "START" : "LOADING"}
          </button>
        </div>
        {hud.highScore > 0 ? (
          <p className="pixel-num text-[10px] mt-6">BEST {pad(hud.highScore)}</p>
        ) : null}
        <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-2 text-left text-[11px] sm:text-xs text-muted max-w-md mx-auto">
          <dt className="text-fg">WASD</dt>
          <dd>Move</dd>
          <dt className="text-fg">Mouse</dt>
          <dd>Look / Fire</dd>
          <dt className="text-fg">1–4</dt>
          <dd>Shield · Orb · Boomstick · Heal</dd>
          <dt className="text-fg">F / R / Shift</dt>
          <dd>Melee · Reload · Sprint</dd>
          <dt className="text-fg">RMB / Tab</dt>
          <dd>Block · Vault</dd>
        </dl>
      </div>
    </div>
  );
}

function Pause({ onResume, onRestart }: { onResume: () => void; onRestart: () => void }) {
  const hud = useHud();
  const set = useHud.setState;
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-bg/70 px-4">
      <div className="menu menu-panel w-full max-w-sm p-6 sm:p-8">
        <h2 className="font-display text-2xl tracking-[0.2em]">PAUSED</h2>
        <p className="text-muted text-sm mt-2">Wave {hud.wave} · {pad(hud.score)}</p>
        <div className="mt-6 flex flex-col gap-2">
          <button type="button" className="vb-btn" onClick={onResume}>
            Resume
          </button>
          <button type="button" className="vb-btn vb-btn-ghost" onClick={onRestart}>
            Restart
          </button>
        </div>
        <label className="mt-6 flex items-center justify-between text-sm text-muted">
          Look
          <input
            type="range"
            min={0.4}
            max={2}
            step={0.05}
            value={hud.sensitivity}
            onChange={(e) => set({ sensitivity: Number(e.target.value) })}
            className="w-36"
          />
        </label>
        <label className="mt-3 flex items-center justify-between text-sm text-muted">
          Shake
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={hud.shake}
            onChange={(e) => set({ shake: Number(e.target.value) })}
            className="w-36"
          />
        </label>
        <label className="mt-3 flex items-center justify-between text-sm text-muted">
          Invert Y
          <input
            type="checkbox"
            checked={hud.invertY}
            onChange={(e) => set({ invertY: e.target.checked })}
          />
        </label>
      </div>
    </div>
  );
}

function Inventory({ onClose }: { onClose: () => void }) {
  const hud = useHud();
  const cells = Array.from({ length: 35 }, (_, i) => hud.gems[i] ?? null);
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-bg/75 px-3">
      <div className="menu menu-panel w-full max-w-lg p-4 sm:p-6 border-[10px] border-[#c4a574] bg-[#1a2030]">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-display tracking-[0.22em] text-lg">THE VAULT</h2>
          <button type="button" className="vb-btn vb-btn-ghost !px-3 !py-2 text-xs" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {cells.map((g, i) => (
            <div key={i} className="inv-cell">
              {g ? <img src={`/game/gem-${(g.kind % 9) + 1}.png`} alt={g.name} title={g.name} /> : null}
            </div>
          ))}
        </div>
        <p className="mt-4 text-muted text-xs">
          {hud.gems.length} relics · each shard tempers the boomstick
        </p>
      </div>
    </div>
  );
}

function Dead({ onRestart }: { onRestart: () => void }) {
  const hud = useHud();
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-bg/80 px-4">
      <div className="menu menu-panel w-full max-w-sm p-8 text-center">
        <h2 className="font-display text-3xl tracking-[0.18em]">FALLEN</h2>
        <p className="pixel-num text-sm mt-4">{pad(hud.score)}</p>
        <p className="text-muted text-sm mt-2">
          Wave {hud.wave} · {hud.kills} slain · {hud.gems.length} relics
        </p>
        <button type="button" className="vb-btn mt-8" onClick={onRestart}>
          START
        </button>
      </div>
    </div>
  );
}

function TouchControls() {
  const stickRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const fire = (held: boolean) => {
      import("@/game/input").then(({ input }) => {
        input.fireHeld = held;
        if (held) input.fireJust = true;
      });
    };
    return () => {
      fire(false);
    };
  }, []);

  const onStick = (clientX: number, clientY: number) => {
    const el = stickRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let x = (clientX - cx) / (r.width * 0.42);
    let y = (clientY - cy) / (r.height * 0.42);
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    setKnob({ x, y });
    void import("@/game/input").then(({ input }) => {
      input.touchMoveX = x;
      input.touchMoveY = y;
    });
  };

  const endStick = () => {
    setKnob({ x: 0, y: 0 });
    void import("@/game/input").then(({ input }) => {
      input.touchMoveX = 0;
      input.touchMoveY = 0;
    });
  };

  const lookRef = useRef<{ x: number; y: number } | null>(null);

  return (
    <div className="touch-layer absolute inset-0 z-5 pointer-events-none">
      <div
        className="pointer-events-auto absolute right-0 top-0 h-[62%] w-[58%]"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          lookRef.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (!lookRef.current) return;
          const dx = e.clientX - lookRef.current.x;
          const dy = e.clientY - lookRef.current.y;
          lookRef.current = { x: e.clientX, y: e.clientY };
          void import("@/game/input").then(({ input }) => {
            input.touchLookX += dx;
            input.touchLookY += dy;
          });
        }}
        onPointerUp={() => {
          lookRef.current = null;
        }}
      />
      <div
        ref={stickRef}
        className="touch-stick pointer-events-auto absolute left-5 bottom-28"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          onStick(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.buttons || e.pressure > 0) onStick(e.clientX, e.clientY);
        }}
        onPointerUp={endStick}
        onPointerCancel={endStick}
      >
        <div
          className="touch-knob"
          style={{ transform: `translate(calc(-50% + ${knob.x * 28}px), calc(-50% + ${knob.y * 28}px))` }}
        />
      </div>
      <div className="pointer-events-auto absolute right-4 bottom-24 flex flex-col gap-3 items-end">
        <button
          type="button"
          className="touch-btn"
          onPointerDown={() => {
            void import("@/game/input").then(({ input }) => {
              input.fireHeld = true;
              input.fireJust = true;
            });
          }}
          onPointerUp={() => {
            void import("@/game/input").then(({ input }) => {
              input.fireHeld = false;
            });
          }}
        >
          FIRE
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            className="touch-btn !w-14 !h-14"
            onPointerDown={() => {
              void import("@/game/input").then(({ input }) => {
                input.keys.add("Space");
                input.just.add("Space");
              });
            }}
            onPointerUp={() => {
              void import("@/game/input").then(({ input }) => {
                input.keys.delete("Space");
              });
            }}
          >
            JMP
          </button>
          <button
            type="button"
            className="touch-btn !w-14 !h-14"
            onPointerDown={() => {
              void import("@/game/input").then(({ input }) => {
                input.altHeld = true;
              });
            }}
            onPointerUp={() => {
              void import("@/game/input").then(({ input }) => {
                input.altHeld = false;
              });
            }}
          >
            SHD
          </button>
        </div>
      </div>
    </div>
  );
}


