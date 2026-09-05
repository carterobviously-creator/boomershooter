import * as THREE from "three";
import { audio } from "./audio";
import { input } from "./input";
import { createTextures, disposeTextures, type TexSet } from "./textures";
import {
  buildMap,
  cellAt,
  circleBlocked,
  CELL,
  MAP_H,
  MAP_W,
  WALL_H,
  worldOf,
  type MapData,
} from "./map";
import { hudApi, writeHigh, type GameMode } from "./store";

const EYE = 1.52;
const GRAVITY = 26;
const JUMP_V = 8.4;
const SPEED = 6.35;
const SPRINT = 9.7;
const RADIUS = 0.36;
const ACCEL = 28;
const FRICTION = 10;
const PITCH_LIM = Math.PI / 2 - 0.02;
const GEM_NAMES = [
  "Blood Ruby",
  "Sky Shard",
  "Cinder Crystal",
  "Twilight Drop",
  "King's Topaz",
  "Tide Hex",
  "Pink Star",
  "Prism Square",
  "Inferno Heart",
];

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _o = new THREE.Object3D();
const _c = new THREE.Color();
const _dummy = new THREE.Object3D();

type Kind = "imp" | "shield" | "wraith" | "golem" | "boss";

type Enemy = {
  alive: boolean;
  kind: Kind;
  x: number;
  y: number;
  z: number;
  hp: number;
  maxHp: number;
  radius: number;
  height: number;
  speed: number;
  sprite: THREE.Sprite;
  glow: THREE.PointLight;
  atkCd: number;
  hurtT: number;
  bob: number;
  vx: number;
  vz: number;
  chargeT: number;
  spawnCd: number;
};

type Bullet = {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  dmg: number;
  friendly: boolean;
  mesh: THREE.Mesh;
  homing: number;
};

type Pickup = {
  alive: boolean;
  kind: "gem" | "shells" | "health" | "armor";
  gem: number;
  x: number;
  y: number;
  z: number;
  t: number;
  mesh: THREE.Object3D;
};

type Breakable = {
  i: number;
  j: number;
  hp: number;
  type: 2 | 3;
  mesh: THREE.Mesh;
};

type Spark = {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  s: number;
  r: number;
  g: number;
  b: number;
};

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setKeys?: (codes: string[]) => void;
      getPos?: () => { x: number; y: number; z: number };
    };
  }
}

function lambert(color: number, map?: THREE.Texture) {
  if (map) return new THREE.MeshLambertMaterial({ color, map });
  return new THREE.MeshLambertMaterial({ color });
}

export class Game {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  weaponScene: THREE.Scene;
  weaponCam: THREE.PerspectiveCamera;
  tex: TexSet;
  map: MapData;
  clock = 0;
  last = 0;
  acc = 0;
  running = false;
  disposed = false;
  mode: GameMode = "title";
  trauma = 0;
  bob = 0;
  fireCd = 0;
  meleeCd = 0;
  reloadT = 0;
  waveDelay = 0;
  lavaT = 0;
  comboT = 0;
  muzzleT = 0;
  swingT = 0;
  coyote = 0;
  hudTick = 0;
  dmgMul = 1;
  pixelScale = 2.4;

  player = {
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    pitch: 0,
    hp: 300,
    maxHp: 300,
    armor: 80,
    stamina: 100,
    ammo: 32,
    mag: 8,
    heals: 3,
    slot: 2,
    score: 0,
    kills: 0,
    wave: 0,
    combo: 0,
    onGround: true,
  };

  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  pickups: Pickup[] = [];
  sparks: Spark[] = [];
  breakables: Breakable[] = [];
  sparkMesh: THREE.InstancedMesh;
  sparkMat: THREE.MeshBasicMaterial;
  mats: THREE.Material[] = [];
  geos: THREE.BufferGeometry[] = [];
  spriteMats: Record<string, THREE.SpriteMaterial> = {};
  textures: THREE.Texture[] = [];
  weapons: {
    shotgun: THREE.Group;
    orb: THREE.Group;
    shield: THREE.Group;
    flask: THREE.Group;
    sword: THREE.Group;
  };
  muzzle: THREE.Sprite;
  flashlight: THREE.SpotLight;
  torchLights: THREE.PointLight[] = [];
  sharedBox: THREE.BoxGeometry;
  sharedOct: THREE.OctahedronGeometry;
  sharedSphere: THREE.SphereGeometry;
  bulletGeo: THREE.SphereGeometry;
  bulletMatFriendly: THREE.MeshBasicMaterial;
  bulletMatEnemy: THREE.MeshBasicMaterial;
  loopFn: (t: number) => void;
  gemSpin = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.tex = createTextures();
    this.map = buildMap();

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.renderer.setClearColor(0x090b10);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.autoClear = false;
    this.renderer.setPixelRatio(1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0b0d14, 0.052);
    this.scene.background = new THREE.Color(0x0b0d14);

    this.camera = new THREE.PerspectiveCamera(78, 1, 0.08, 80);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);

    this.weaponScene = new THREE.Scene();
    this.weaponCam = new THREE.PerspectiveCamera(52, 1, 0.05, 8);
    this.weaponScene.add(this.weaponCam);
    const wAmb = new THREE.AmbientLight(0xffffff, 0.85);
    const wDir = new THREE.DirectionalLight(0xffe0c0, 1.1);
    wDir.position.set(0.4, 0.8, 0.6);
    this.weaponScene.add(wAmb, wDir);

    this.sharedBox = new THREE.BoxGeometry(1, 1, 1);
    this.sharedOct = new THREE.OctahedronGeometry(0.5, 0);
    this.sharedSphere = new THREE.SphereGeometry(0.5, 6, 5);
    this.bulletGeo = new THREE.SphereGeometry(0.12, 6, 5);
    this.geos.push(this.sharedBox, this.sharedOct, this.sharedSphere, this.bulletGeo);
    this.bulletMatFriendly = new THREE.MeshBasicMaterial({ color: 0x4ad4ff });
    this.bulletMatEnemy = new THREE.MeshBasicMaterial({ color: 0xff5533 });
    this.mats.push(this.bulletMatFriendly, this.bulletMatEnemy);

    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mats.push(this.sparkMat);
    this.sparkMesh = new THREE.InstancedMesh(this.sharedBox, this.sparkMat, 220);
    this.sparkMesh.frustumCulled = false;
    this.scene.add(this.sparkMesh);

    this.buildWorld();
    this.weapons = this.buildWeapons();
    this.muzzle = this.makeMuzzle();
    this.weapons.shotgun.add(this.muzzle);

    this.flashlight = new THREE.SpotLight(0xffe6c4, 2.6, 22, 0.62, 0.45, 1.5);
    this.flashlight.position.set(0.15, -0.05, 0.1);
    this.flashlight.target.position.set(0, -0.1, -1);
    this.camera.add(this.flashlight);
    this.camera.add(this.flashlight.target);

    this.loadSprites();
    this.seedPickups();
    this.poolBullets();
    this.poolSparks();

    this.player.x = this.map.spawnX;
    this.player.z = this.map.spawnZ;
    this.player.yaw = 0;

    input.attach(canvas);
    this.bindLock();
    this.resize();
    window.addEventListener("resize", this.onResize);

    this.loopFn = (t) => this.loop(t);
    this.renderer.setAnimationLoop(this.loopFn);
    this.running = true;

    const touch = window.matchMedia("(pointer: coarse)").matches;
    hudApi.set({ ready: true, isTouch: touch, highScore: hudApi.get().highScore });
    this.syncHud(true);

    window.__controlsTest = {
      getYaw: () => this.player.yaw,
      getSpeed: () => Math.hypot(this.player.vx, this.player.vz),
      setKeys: (codes) => input.setInjected(codes),
      getPos: () => ({ x: this.player.x, y: this.player.y, z: this.player.z }),
    };
    (window.__controlsTest as { setYaw?: (y: number) => void; fire?: () => void }).setYaw = (y: number) => {
      this.player.yaw = y;
    };
    (window.__controlsTest as { setYaw?: (y: number) => void; fire?: () => void }).fire = () => {
      input.fireJust = true;
      input.fireHeld = true;
    };
  }

  private bindLock() {
    this.canvas.addEventListener("click", () => {
      if (this.mode !== "playing") return;
      if (document.pointerLockElement === this.canvas) return;
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true } as PointerLockOptions);
      if (p && typeof (p as Promise<void>).catch === "function") {
        (p as Promise<void>).catch(() => {
          this.canvas.requestPointerLock();
        });
      }
    });
    document.addEventListener("pointerlockchange", this.onLock);
  }

  private onLock = () => {
    if (this.mode === "playing" && document.pointerLockElement !== this.canvas && !hudApi.get().isTouch) {
      this.setMode("paused");
    }
  };

  private onResize = () => this.resize();

  resize() {
    const scale = Math.max(1.6, this.pixelScale);
    const w = Math.max(320, Math.floor(window.innerWidth / scale));
    const h = Math.max(180, Math.floor(window.innerHeight / scale));
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.imageRendering = "pixelated";
    const aspect = w / Math.max(1, h);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.weaponCam.aspect = aspect;
    this.weaponCam.updateProjectionMatrix();
  }

  setPixelScale(v: number) {
    this.pixelScale = v;
    hudApi.set({ pixelScale: v });
    this.resize();
  }

  setMode(m: GameMode) {
    this.mode = m;
    hudApi.set({ mode: m });
    if (m !== "playing" && document.pointerLockElement) document.exitPointerLock();
  }

  startRun() {
    audio.unlock();
    this.resetRun();
    this.setMode("playing");
    this.tryLock();
    this.announce("THE VAULT OPENS");
    this.waveDelay = 1.4;
  }

  restart() {
    this.startRun();
  }

  pause() {
    if (this.mode === "playing") this.setMode("paused");
  }

  resume() {
    if (this.mode === "paused" || this.mode === "settings" || this.mode === "inventory") {
      this.setMode("playing");
      this.tryLock();
    }
  }

  toggleInventory() {
    if (this.mode === "playing") this.setMode("inventory");
    else if (this.mode === "inventory") this.resume();
  }

  setSlot(s: number) {
    this.player.slot = Math.max(0, Math.min(3, s));
    hudApi.set({ slot: this.player.slot });
  }

  private tryLock() {
    if (hudApi.get().isTouch) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true } as PointerLockOptions);
      if (p && typeof (p as Promise<void>).catch === "function") {
        (p as Promise<void>).catch(() => this.canvas.requestPointerLock());
      }
    } catch {
      this.canvas.requestPointerLock();
    }
  }

  private resetRun() {
    this.player.x = this.map.spawnX;
    this.player.y = 0;
    this.player.z = this.map.spawnZ;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.vz = 0;
    this.player.yaw = 0;
    this.player.pitch = 0;
    this.player.hp = 300;
    this.player.maxHp = 300;
    this.player.armor = 80;
    this.player.stamina = 100;
    this.player.ammo = 40;
    this.player.mag = 8;
    this.player.heals = 3;
    this.player.slot = 2;
    this.player.score = 0;
    this.player.kills = 0;
    this.player.wave = 0;
    this.player.combo = 0;
    this.dmgMul = 1;
    this.reloadT = 0;
    this.fireCd = 0;
    this.trauma = 0;
    for (const e of this.enemies) this.killEnemy(e, false);
    for (const b of this.bullets) b.alive = false;
    for (const p of this.pickups) {
      if (p.kind !== "gem" || p.t > 0.2) {
        /* keep seeded gems */
      }
    }
    hudApi.set({ gems: [], score: 0, kills: 0, wave: 0, hp: 300, armor: 80 });
    this.seedPickups();
    this.syncHud(true);
  }

  dispose() {
    this.disposed = true;
    this.running = false;
    this.renderer.setAnimationLoop(null);
    input.detach();
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("pointerlockchange", this.onLock);
    disposeTextures(this.tex);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.textures) t.dispose();
    this.renderer.dispose();
    if (window.__controlsTest) delete window.__controlsTest;
  }

  private loop = (tms: number) => {
    if (this.disposed) return;
    const t = tms * 0.001;
    if (!this.last) this.last = t;
    let dt = Math.min(t - this.last, 0.1);
    this.last = t;
    this.clock += dt;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) this.trauma *= 0.5;

    input.pollGamepad();

    if (this.mode === "title") {
      this.updateCinematic(dt);
      this.updateDecor(dt);
      this.draw();
      input.endFrame();
      return;
    }

    if (this.mode === "playing") {
      if (input.wasPressed("Escape")) {
        this.pause();
        input.endFrame();
        return;
      }
      if (input.wasPressed("KeyI") || input.wasPressed("Tab")) {
        this.toggleInventory();
        input.endFrame();
        return;
      }
      this.acc += dt;
      const step = 1 / 60;
      while (this.acc >= step) {
        this.fixed(step);
        this.acc -= step;
      }
      this.updateVisuals(dt);
    } else {
      this.updateDecor(dt);
    }

    this.draw();
    input.endFrame();
  };

  private updateCinematic(dt: number) {
    const t = this.clock;
    const cx = this.map.spawnX;
    const cz = this.map.spawnZ;
    this.camera.position.set(cx + Math.sin(t * 0.18) * 7.5, 2.35, cz + Math.cos(t * 0.18) * 7.5);
    this.camera.lookAt(cx, 1.1, cz);
    this.updateDecor(dt);
    this.flickerTorches();
  }

  private fixed(dt: number) {
    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updatePickups(dt);
    this.updateSparks(dt);
    this.updateWaves(dt);
    if (this.fireCd > 0) this.fireCd -= dt;
    if (this.meleeCd > 0) this.meleeCd -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.finishReload();
    }
    if (this.muzzleT > 0) this.muzzleT -= dt;
    if (this.swingT > 0) this.swingT -= dt;
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.player.combo = 0;
    }
    this.hudTick += dt;
    if (this.hudTick > 0.08) {
      this.hudTick = 0;
      this.syncHud(false);
    }
  }

  private updatePlayer(dt: number) {
    const p = this.player;
    const hud = hudApi.get();
    const sens = 0.0022 * hud.sensitivity;
    p.yaw -= (input.mouseDX + input.touchLookX * 1.6) * sens;
    p.yaw -= input.padLookX * 2.5 * dt;
    const inv = hud.invertY ? -1 : 1;
    p.pitch -= (input.mouseDY + input.touchLookY * 1.6) * sens * inv;
    p.pitch -= input.padLookY * 2.5 * dt * inv;
    if (p.pitch < -PITCH_LIM) p.pitch = -PITCH_LIM;
    if (p.pitch > PITCH_LIM) p.pitch = PITCH_LIM;

    if (input.wasPressed("Digit1")) this.setSlot(0);
    if (input.wasPressed("Digit2")) this.setSlot(1);
    if (input.wasPressed("Digit3")) this.setSlot(2);
    if (input.wasPressed("Digit4")) this.setSlot(3);
    if (input.wasPressed("WheelUp")) this.setSlot((p.slot + 3) % 4);
    if (input.wasPressed("WheelDown")) this.setSlot((p.slot + 1) % 4);

    const blocking =
      ((p.slot === 0 && (input.fireHeld || input.altHeld)) || input.altHeld) && p.stamina > 4;
    hudApi.set({ blocking });

    const axis = input.moveAxis();
    const sprint =
      (input.isDown("ShiftLeft") || input.isDown("ShiftRight")) && p.stamina > 0 && !blocking;
    const wishSpeed = blocking ? SPEED * 0.42 : sprint ? SPRINT : SPEED;
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    const rx = Math.cos(p.yaw);
    const rz = -Math.sin(p.yaw);
    const wishX = rx * axis.x + fx * -axis.y;
    const wishZ = rz * axis.x + fz * -axis.y;

    const onGround = p.y <= 0.001;
    p.onGround = onGround;
    if (onGround) {
      p.y = 0;
      if (p.vy < 0) p.vy = 0;
      this.coyote = 0.1;
    } else {
      this.coyote -= dt;
      p.vy -= GRAVITY * dt;
    }

    if ((input.wasPressed("Space") || input.isDown("Space")) && this.coyote > 0 && p.vy <= 0.2) {
      p.vy = JUMP_V;
      this.coyote = 0;
      p.onGround = false;
    }

    const air = onGround ? 1 : 0.38;
    p.vx += wishX * ACCEL * air * dt;
    p.vz += wishZ * ACCEL * air * dt;
    const spd = Math.hypot(p.vx, p.vz);
    const max = wishSpeed * (axis.x || axis.y ? 1 : 0) + 0.0001;
    if (onGround) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      if (!axis.x && !axis.y) {
        p.vx *= damp;
        p.vz *= damp;
      } else if (spd > wishSpeed) {
        p.vx = (p.vx / spd) * wishSpeed;
        p.vz = (p.vz / spd) * wishSpeed;
      }
    } else if (spd > SPRINT) {
      p.vx = (p.vx / spd) * SPRINT;
      p.vz = (p.vz / spd) * SPRINT;
    }
    void max;

    const nx = p.x + p.vx * dt;
    if (!circleBlocked(this.map.grid, nx, p.z, RADIUS)) p.x = nx;
    else p.vx = 0;
    const nz = p.z + p.vz * dt;
    if (!circleBlocked(this.map.grid, p.x, nz, RADIUS)) p.z = nz;
    else p.vz = 0;
    p.y += p.vy * dt;
    if (p.y < 0) {
      p.y = 0;
      p.vy = 0;
    }
    if (p.y > WALL_H - 1.2) {
      p.y = WALL_H - 1.2;
      p.vy = 0;
    }

    const moving = Math.hypot(p.vx, p.vz) > 0.6 && onGround;
    audio.step(dt, moving);

    if (sprint && moving) p.stamina = Math.max(0, p.stamina - 18 * dt);
    else if (blocking) p.stamina = Math.max(0, p.stamina - 12 * dt);
    else p.stamina = Math.min(100, p.stamina + 22 * dt);

    if (cellAt(this.map.grid, p.x, p.z) === 4) {
      this.lavaT += dt;
      if (this.lavaT > 0.35) {
        this.lavaT = 0;
        this.hurt(16, 0, 0);
      }
    }

    if (input.wasPressed("KeyR") && this.reloadT <= 0) this.startReload();

    if (input.wasPressed("KeyF") && this.meleeCd <= 0) this.melee();

    if (p.slot === 0) {
      /* block handled */
    } else if (p.slot === 1) {
      if (input.fireHeld && this.fireCd <= 0 && this.reloadT <= 0) this.fireOrb();
    } else if (p.slot === 2) {
      if (input.fireJust && this.reloadT <= 0) this.fireShotgun();
    } else if (p.slot === 3) {
      if (input.fireJust) this.useHeal();
    }

    if (blocking && input.fireJust && p.slot === 0) audio.block();
  }

  private updateVisuals(dt: number) {
    const p = this.player;
    const spd = Math.hypot(p.vx, p.vz);
    this.bob += spd * dt * 9.5;
    const bobY = p.onGround ? Math.sin(this.bob) * Math.min(1, spd / SPEED) * 0.045 : 0;
    const bobX = p.onGround ? Math.cos(this.bob * 0.5) * Math.min(1, spd / SPEED) * 0.02 : 0;

    this.trauma = Math.max(0, this.trauma - dt * 1.9);
    const sh = this.trauma * this.trauma * (hudApi.get().shake ?? 1);
    const sx = (Math.random() * 2 - 1) * sh * 0.14;
    const sy = (Math.random() * 2 - 1) * sh * 0.1;

    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = p.yaw;
    this.camera.rotation.x = p.pitch;
    this.camera.position.set(p.x + bobX + sx, p.y + EYE + bobY + sy, p.z);

    this.flickerTorches();
    this.updateDecor(dt);
    this.updateWeapons(dt);

    const hf = hudApi.get().hitFlash;
    const hurt = hudApi.get().hurtFlash;
    if (hf > 0) hudApi.set({ hitFlash: Math.max(0, hf - dt * 4) });
    if (hurt > 0) hudApi.set({ hurtFlash: Math.max(0, hurt - dt * 1.6) });
  }

  private updateWeapons(dt: number) {
    const p = this.player;
    const blocking = hudApi.get().blocking;
    const spd = Math.hypot(p.vx, p.vz);
    const bob = Math.sin(this.bob) * Math.min(1, spd / SPEED) * 0.018;
    const kick = this.muzzleT * 0.35;

    const showShield = blocking || p.slot === 0;
    this.weapons.shield.visible = showShield;
    this.weapons.shotgun.visible = p.slot === 2 && !showShield;
    this.weapons.orb.visible = p.slot === 1 && !showShield;
    this.weapons.flask.visible = p.slot === 3 && !showShield;
    this.weapons.sword.visible = this.swingT > 0;

    this.weapons.shotgun.position.set(0.32 + bob, -0.28 - kick, -0.62 - kick * 0.4);
    this.weapons.shotgun.rotation.set(kick * 0.8, 0.12, 0.04);
    this.muzzle.visible = this.muzzleT > 0.02;
    if (this.muzzle.visible) {
      const s = 0.25 + this.muzzleT * 1.2;
      this.muzzle.scale.set(s, s, s);
    }

    this.weapons.orb.position.set(0.28 + bob, -0.24, -0.55);
    this.weapons.orb.rotation.set(0.1, this.clock * 0.4, 0.08);
    const core = this.weapons.orb.getObjectByName("orbcore");
    if (core) core.rotation.y += dt * 4;

    this.weapons.flask.position.set(0.26 + bob, -0.3, -0.5);
    this.weapons.flask.rotation.set(0.2, 0.3, 0.1);

    if (showShield) {
      this.weapons.shield.position.set(-0.05, -0.12, -0.48);
      this.weapons.shield.rotation.set(-0.15, 0.35, -0.1);
    }

    if (this.swingT > 0) {
      const k = 1 - this.swingT / 0.32;
      this.weapons.sword.position.set(0.2, -0.25 + k * 0.1, -0.45);
      this.weapons.sword.rotation.set(-0.4 + k * 1.4, 0.4, 0.8 - k * 1.6);
    }

    void dt;
  }

  private fireShotgun() {
    const p = this.player;
    if (this.fireCd > 0) return;
    if (p.mag <= 0) {
      audio.empty();
      if (p.ammo > 0) this.startReload();
      return;
    }
    p.mag -= 1;
    this.fireCd = 0.48;
    this.muzzleT = 0.09;
    this.trauma = Math.min(1, this.trauma + 0.42);
    audio.shotgun();
    this.camera.getWorldDirection(_v);
    const origin = this.camera.position;
    let hits = 0;
    for (let i = 0; i < 8; i++) {
      _v2.copy(_v);
      if (i > 0) {
        _v2.x += (Math.random() - 0.5) * 0.09;
        _v2.y += (Math.random() - 0.5) * 0.07;
        _v2.z += (Math.random() - 0.5) * 0.09;
        _v2.normalize();
      }
      const dmg = (11 + Math.random() * 6) * this.dmgMul;
      if (this.hitscan(origin, _v2, dmg, 28, true)) hits++;
    }
    if (hits > 0) {
      hudApi.set({ hitFlash: 1 });
      audio.hit();
    }
    this.burst(origin.x + _v.x, origin.y + _v.y, origin.z + _v.z, 8, 0.9, 0.85, 0.7, 0.3, 4);
    if (p.mag <= 0 && p.ammo > 0) this.startReload();
    this.syncHud(true);
  }

  private fireOrb() {
    this.fireCd = 0.28;
    audio.orb();
    this.camera.getWorldDirection(_v);
    const o = this.camera.position;
    this.spawnBullet(o.x + _v.x * 0.6, o.y + _v.y * 0.6, o.z + _v.z * 0.6, _v.x * 18, _v.y * 18, _v.z * 18, 36 * this.dmgMul, true, 0.35);
    this.muzzleT = 0.06;
    this.trauma = Math.min(1, this.trauma + 0.12);
  }

  private melee() {
    this.meleeCd = 0.42;
    this.swingT = 0.32;
    audio.melee();
    this.camera.getWorldDirection(_v);
    const o = this.camera.position;
    let hit = false;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - o.x;
      const dy = e.y + e.height * 0.4 - o.y;
      const dz = e.z - o.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 2.1) continue;
      _v2.set(dx, dy, dz).normalize();
      if (_v.dot(_v2) < 0.45) continue;
      this.damageEnemy(e, 48 * this.dmgMul, _v.x * 6, _v.z * 6);
      hit = true;
    }
    if (hit) {
      hudApi.set({ hitFlash: 1 });
      this.trauma = Math.min(1, this.trauma + 0.28);
    }
  }

  private useHeal() {
    const p = this.player;
    if (p.heals <= 0 || p.hp >= p.maxHp) {
      audio.empty();
      return;
    }
    p.heals -= 1;
    p.hp = Math.min(p.maxHp, p.hp + 90);
    audio.heal();
    this.announce("RELIC MEND");
    this.syncHud(true);
  }

  private startReload() {
    const p = this.player;
    if (p.mag >= 8 || p.ammo <= 0 || this.reloadT > 0) return;
    this.reloadT = 1.05;
  }

  private finishReload() {
    const p = this.player;
    const need = 8 - p.mag;
    const take = Math.min(need, p.ammo);
    p.mag += take;
    p.ammo -= take;
    this.syncHud(true);
  }

  private hitscan(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    dmg: number,
    maxDist: number,
    friendly: boolean,
  ): boolean {
    const step = 0.16;
    let hit = false;
    for (let t = 0.4; t < maxDist; t += step) {
      const x = origin.x + dir.x * t;
      const y = origin.y + dir.y * t;
      const z = origin.z + dir.z * t;
      if (y < 0.02) {
        this.burst(x, 0.05, z, 4, 0.5, 0.45, 0.4, 0.3, 2);
        break;
      }
      if (y > WALL_H - 0.05) break;
      if (friendly) {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          const dx = e.x - x;
          const dz = e.z - z;
          if (dx * dx + dz * dz < e.radius * e.radius && y < e.height && y > 0) {
            this.damageEnemy(e, dmg * Math.max(0.45, 1 - t / maxDist), dir.x * 4, dir.z * 4);
            this.burst(x, y, z, 10, 0.9, 0.3, 0.6, 1.6, 5);
            hit = true;
            return true;
          }
        }
        if (this.hitBreakable(x, z, dmg)) {
          this.burst(x, y, z, 8, 0.7, 0.6, 0.45, 1.2, 4);
          return true;
        }
      } else {
        const p = this.player;
        const dx = p.x - x;
        const dz = p.z - z;
        if (dx * dx + dz * dz < RADIUS * RADIUS && y < EYE + 0.3 && y > p.y) {
          this.hurt(dmg, dir.x, dir.z);
          return true;
        }
      }
      const c = cellAt(this.map.grid, x, z);
      if (c === 1 || c === 5) {
        this.burst(x - dir.x * 0.1, y, z - dir.z * 0.1, 5, 0.55, 0.55, 0.6, 0.8, 2.5);
        break;
      }
    }
    return hit;
  }

  private hitBreakable(x: number, z: number, dmg: number) {
    const i = Math.floor(x / CELL);
    const j = Math.floor(z / CELL);
    const b = this.breakables.find((k) => k.i === i && k.j === j && k.mesh.visible);
    if (!b) return false;
    b.hp -= dmg;
    if (b.hp <= 0) {
      b.mesh.visible = false;
      this.map.grid[j]![i] = 0;
      this.burst((i + 0.5) * CELL, 1, (j + 0.5) * CELL, 16, 0.6, 0.5, 0.4, 2.5, 6);
      audio.explode();
      if (Math.random() < 0.55) this.spawnPickup("shells", (i + 0.5) * CELL, (j + 0.5) * CELL);
      else if (Math.random() < 0.4) this.spawnPickup("gem", (i + 0.5) * CELL, (j + 0.5) * CELL);
    }
    return true;
  }

  private damageEnemy(e: Enemy, dmg: number, kx: number, kz: number) {
    e.hp -= dmg;
    e.hurtT = 0.12;
    e.vx += kx;
    e.vz += kz;
    e.sprite.material.color.setRGB(1, 0.45, 0.45);
    this.player.combo += 1;
    this.comboT = 2.2;
    if (e.hp <= 0) this.killEnemy(e, true);
  }

  private killEnemy(e: Enemy, reward: boolean) {
    if (!e.alive && reward) return;
    e.alive = false;
    e.sprite.visible = false;
    e.glow.visible = false;
    e.glow.intensity = 0;
    if (!reward) return;
    this.player.kills += 1;
    const base = e.kind === "boss" ? 2500 : e.kind === "golem" ? 500 : e.kind === "shield" ? 250 : e.kind === "wraith" ? 180 : 100;
    const gain = Math.floor(base * (1 + this.player.combo * 0.05));
    this.player.score += gain;
    this.burst(e.x, e.height * 0.5, e.z, 22, 0.8, 0.4, 1, 3.2, 8);
    audio.explode();
    this.trauma = Math.min(1, this.trauma + (e.kind === "boss" ? 0.8 : 0.3));
    const r = Math.random();
    if (r < 0.55) this.spawnPickup("gem", e.x, e.z);
    else if (r < 0.78) this.spawnPickup("shells", e.x, e.z);
    else if (r < 0.9) this.spawnPickup("health", e.x, e.z);
    else this.spawnPickup("armor", e.x, e.z);
    if (e.kind === "boss") {
      this.spawnPickup("health", e.x + 0.6, e.z);
      this.spawnPickup("gem", e.x - 0.6, e.z);
      this.announce("GUARDIAN SHATTERED");
    }
    writeHigh(this.player.score);
    hudApi.set({ highScore: Math.max(hudApi.get().highScore, this.player.score) });
    this.syncHud(true);
  }

  private hurt(amount: number, dirx: number, dirz: number) {
    const p = this.player;
    const blocking = hudApi.get().blocking;
    let dmg = amount;
    if (blocking) {
      const fx = -Math.sin(p.yaw);
      const fz = -Math.cos(p.yaw);
      const incoming = -dirx * fx + -dirz * fz;
      if (incoming > 0.15 || (dirx === 0 && dirz === 0)) {
        dmg *= 0.2;
        audio.block();
        p.stamina = Math.max(0, p.stamina - 8);
      }
    }
    if (p.armor > 0) {
      const soak = Math.min(p.armor, dmg * 0.65);
      p.armor -= soak;
      dmg -= soak;
    }
    p.hp -= dmg;
    this.trauma = Math.min(1, this.trauma + 0.5);
    hudApi.set({ hurtFlash: 0.85 });
    audio.hurt();
    p.vx += dirx * 3;
    p.vz += dirz * 3;
    if (p.hp <= 0) {
      p.hp = 0;
      writeHigh(p.score);
      this.setMode("dead");
      this.announce("YOU FALL");
    }
    this.syncHud(true);
  }

  private updateEnemies(dt: number) {
    const p = this.player;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.bob += dt;
      e.atkCd -= dt;
      e.hurtT -= dt;
      e.chargeT -= dt;
      e.spawnCd -= dt;
      if (e.hurtT <= 0) e.sprite.material.color.setRGB(1, 1, 1);

      const dx = p.x - e.x;
      const dz = p.z - e.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const nx = dx / dist;
      const nz = dz / dist;
      const los = this.los(e.x, e.z, p.x, p.z);

      let speed = e.speed;
      if (e.kind === "shield" && dist < 9 && los && e.chargeT <= -2) e.chargeT = 0.7;
      if (e.chargeT > 0) speed *= 2.15;

      let wishX = 0;
      let wishZ = 0;
      if (e.kind === "wraith" && dist < 5.5) {
        wishX = -nx;
        wishZ = -nz;
      } else if (dist > e.radius + RADIUS + 0.35 && (los || dist < 22)) {
        wishX = nx;
        wishZ = nz;
      } else if (!los) {
        wishX = Math.sin(e.bob * 0.7);
        wishZ = Math.cos(e.bob * 0.5);
      }

      e.vx += wishX * 14 * dt;
      e.vz += wishZ * 14 * dt;
      e.vx *= 1 - 6 * dt;
      e.vz *= 1 - 6 * dt;
      const sp = Math.hypot(e.vx, e.vz);
      if (sp > speed) {
        e.vx = (e.vx / sp) * speed;
        e.vz = (e.vz / sp) * speed;
      }
      const nxpos = e.x + e.vx * dt;
      if (!circleBlocked(this.map.grid, nxpos, e.z, e.radius * 0.7)) e.x = nxpos;
      const nzpos = e.z + e.vz * dt;
      if (!circleBlocked(this.map.grid, e.x, nzpos, e.radius * 0.7)) e.z = nzpos;

      const bobY = e.kind === "wraith" || e.kind === "shield" ? 0.25 + Math.sin(e.bob * 3) * 0.12 : 0;
      e.sprite.position.set(e.x, bobY, e.z);
      e.glow.position.set(e.x, e.height * 0.5 + bobY, e.z);

      if (e.kind === "wraith" && los && dist < 16 && e.atkCd <= 0) {
        e.atkCd = 1.35;
        const ox = e.x;
        const oy = e.height * 0.55;
        const oz = e.z;
        const spb = 9.5;
        this.spawnBullet(ox, oy, oz, nx * spb, ((p.y + EYE) - oy) / dist * spb, nz * spb, 14, false, 0);
      }
      if ((e.kind === "imp" || e.kind === "golem" || e.kind === "shield" || e.kind === "boss") && dist < e.radius + RADIUS + 0.55 && e.atkCd <= 0) {
        e.atkCd = e.kind === "golem" || e.kind === "boss" ? 1.1 : 0.7;
        const dmg = e.kind === "boss" ? 34 : e.kind === "golem" ? 24 : e.kind === "shield" ? 20 : 12;
        this.hurt(dmg, nx, nz);
      }
      if (e.kind === "boss" && e.spawnCd <= 0) {
        e.spawnCd = 7.5;
        this.spawnEnemy("imp", e.x + 1.4, e.z + 1.2);
        this.spawnEnemy("imp", e.x - 1.4, e.z - 1.1);
      }
    }
  }

  private los(x0: number, z0: number, x1: number, z1: number) {
    const dist = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.ceil(dist / 0.45);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const c = cellAt(this.map.grid, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
      if (c === 1 || c === 5 || c === 2) return false;
    }
    return true;
  }

  private updateBullets(dt: number) {
    for (const b of this.bullets) {
      if (!b.alive) continue;
      b.life -= dt;
      if (b.homing > 0 && b.friendly) {
        let best: Enemy | null = null;
        let bestD = 10;
        for (const e of this.enemies) {
          if (!e.alive) continue;
          const d = Math.hypot(e.x - b.x, e.z - b.z);
          if (d < bestD) {
            bestD = d;
            best = e;
          }
        }
        if (best) {
          _v.set(best.x - b.x, best.y + 0.7 - b.y, best.z - b.z).normalize();
          b.vx += _v.x * 22 * dt;
          b.vy += _v.y * 22 * dt;
          b.vz += _v.z * 22 * dt;
        }
      }
      const spd = Math.hypot(b.vx, b.vy, b.vz) || 1;
      const nx = b.x + b.vx * dt;
      const ny = b.y + b.vy * dt;
      const nz = b.z + b.vz * dt;
      const c = cellAt(this.map.grid, nx, nz);
      if (c === 1 || c === 5 || ny < 0.05 || ny > WALL_H || b.life <= 0) {
        if (b.friendly) this.hitBreakable(nx, nz, b.dmg);
        this.burst(b.x, b.y, b.z, 8, 0.3, 0.8, 1, 1.4, 4);
        b.alive = false;
        b.mesh.visible = false;
        continue;
      }
      let hit = false;
      if (b.friendly) {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          const dx = e.x - nx;
          const dz = e.z - nz;
          if (dx * dx + dz * dz < e.radius * e.radius && ny < e.height) {
            this.damageEnemy(e, b.dmg, b.vx * 0.04, b.vz * 0.04);
            this.burst(nx, ny, nz, 12, 0.4, 0.9, 1, 2, 5);
            hudApi.set({ hitFlash: 1 });
            hit = true;
            break;
          }
        }
      } else {
        const p = this.player;
        const dx = p.x - nx;
        const dz = p.z - nz;
        if (dx * dx + dz * dz < RADIUS * RADIUS && ny < EYE + 0.4) {
          const spn = spd || 1;
          this.hurt(b.dmg, b.vx / spn, b.vz / spn);
          hit = true;
        }
      }
      if (hit) {
        b.alive = false;
        b.mesh.visible = false;
        continue;
      }
      b.x = nx;
      b.y = ny;
      b.z = nz;
      b.mesh.position.set(nx, ny, nz);
      b.mesh.rotation.y += dt * 8;
      b.mesh.visible = true;
    }
  }

  private updatePickups(dt: number) {
    this.gemSpin += dt;
    const p = this.player;
    for (const u of this.pickups) {
      if (!u.alive) continue;
      u.t += dt;
      u.mesh.position.set(u.x, 0.45 + Math.sin(u.t * 3) * 0.12, u.z);
      u.mesh.rotation.y = u.t * 2.2;
      const dx = p.x - u.x;
      const dz = p.z - u.z;
      if (dx * dx + dz * dz < 0.85) this.takePickup(u);
    }
  }

  private takePickup(u: Pickup) {
    u.alive = false;
    u.mesh.visible = false;
    audio.pickup();
    const p = this.player;
    if (u.kind === "shells") {
      p.ammo = Math.min(80, p.ammo + 8);
      this.announce("+SHELLS");
    } else if (u.kind === "health") {
      p.hp = Math.min(p.maxHp, p.hp + 45);
      this.announce("+VITALITY");
    } else if (u.kind === "armor") {
      p.armor = Math.min(100, p.armor + 25);
      this.announce("+AEGIS");
    } else {
      const kind = u.gem;
      const gems = hudApi.get().gems.slice();
      if (gems.length < 35) {
        gems.push({ id: Date.now() + gems.length, kind, name: GEM_NAMES[kind] ?? "Shard" });
        hudApi.set({ gems });
      }
      p.score += 50;
      this.dmgMul = Math.min(2.2, this.dmgMul + 0.03);
      p.maxHp = Math.min(420, p.maxHp + 4);
      this.announce(GEM_NAMES[kind] ?? "SHARD");
    }
    this.syncHud(true);
  }

  private updateSparks(dt: number) {
    let n = 0;
    for (const s of this.sparks) {
      if (!s.alive) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.alive = false;
        continue;
      }
      s.vy -= 14 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      if (s.y < 0.02) {
        s.y = 0.02;
        s.vy *= -0.3;
        s.vx *= 0.6;
        s.vz *= 0.6;
      }
      const k = s.life / s.max;
      _dummy.position.set(s.x, s.y, s.z);
      _dummy.scale.setScalar(s.s * k);
      _dummy.rotation.set(0, 0, 0);
      _dummy.updateMatrix();
      this.sparkMesh.setMatrixAt(n, _dummy.matrix);
      _c.setRGB(s.r, s.g, s.b);
      this.sparkMesh.setColorAt(n, _c);
      n++;
    }
    this.sparkMesh.count = n;
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    if (this.sparkMesh.instanceColor) this.sparkMesh.instanceColor.needsUpdate = true;
  }

  private burst(
    x: number,
    y: number,
    z: number,
    n: number,
    r: number,
    g: number,
    b: number,
    force: number,
    life: number,
  ) {
    let spawned = 0;
    for (const s of this.sparks) {
      if (s.alive) continue;
      s.alive = true;
      s.x = x;
      s.y = y;
      s.z = z;
      s.vx = (Math.random() - 0.5) * force;
      s.vy = Math.random() * force * 0.8;
      s.vz = (Math.random() - 0.5) * force;
      s.life = s.max = 0.25 + Math.random() * life * 0.12;
      s.s = 0.04 + Math.random() * 0.07;
      s.r = r;
      s.g = g;
      s.b = b;
      spawned++;
      if (spawned >= n) break;
    }
  }

  private updateWaves(dt: number) {
    if (this.waveDelay > 0) {
      this.waveDelay -= dt;
      if (this.waveDelay <= 0) this.nextWave();
      return;
    }
    if (this.mode !== "playing") return;
    const alive = this.enemies.some((e) => e.alive);
    if (!alive && this.player.wave > 0) {
      this.waveDelay = 2.2;
      this.announce("VAULT CLEARED");
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 18);
      this.player.ammo = Math.min(80, this.player.ammo + 4);
    }
  }

  private nextWave() {
    this.player.wave += 1;
    const w = this.player.wave;
    audio.wave();
    this.announce(w % 5 === 0 ? "GUARDIAN STIRS" : `WAVE ${w}`);
    hudApi.set({ wave: w });
    const n = 3 + w * 2;
    if (w === 1) {
      this.spawnEnemy("imp", this.player.x - 1.2, this.player.z - 6.5);
      this.spawnEnemy("shield", this.player.x + 3.2, this.player.z - 5.5);
    }
    for (let i = 0; i < n; i++) {
      const pos = this.findSpawn();
      if (!pos) break;
      let kind: Kind = "imp";
      if (w >= 2 && Math.random() < 0.28) kind = "wraith";
      if (w >= 3 && Math.random() < 0.22) kind = "shield";
      if (w >= 4 && Math.random() < 0.14) kind = "golem";
      this.spawnEnemy(kind, pos.x, pos.z);
    }
    if (w % 5 === 0) {
      const pos = this.findSpawn() ?? { x: this.map.spawnX + 6, z: this.map.spawnZ - 6 };
      this.spawnEnemy("boss", pos.x, pos.z);
    }
  }

  private findSpawn(): { x: number; z: number } | null {
    const p = this.player;
    for (let k = 0; k < 50; k++) {
      const i = 2 + Math.floor(Math.random() * (MAP_W - 4));
      const j = 2 + Math.floor(Math.random() * (MAP_H - 4));
      if (this.map.grid[j]![i] !== 0) continue;
      const w = worldOf(i, j);
      const d = Math.hypot(w.x - p.x, w.z - p.z);
      if (d > 11 && d < 34) return w;
    }
    return null;
  }

  private spawnEnemy(kind: Kind, x: number, z: number) {
    let e = this.enemies.find((n) => !n.alive);
    const stats: Record<Kind, { hp: number; speed: number; radius: number; height: number; scale: number; color: number }> = {
      imp: { hp: 38, speed: 3.4, radius: 0.42, height: 1.35, scale: 1.35, color: 0xaa44ff },
      shield: { hp: 95, speed: 2.5, radius: 0.5, height: 1.55, scale: 1.5, color: 0x4477ff },
      wraith: { hp: 52, speed: 2.9, radius: 0.45, height: 1.7, scale: 1.65, color: 0xff6622 },
      golem: { hp: 210, speed: 1.55, radius: 0.7, height: 2.2, scale: 2.15, color: 0x44dd88 },
      boss: { hp: 720, speed: 1.85, radius: 1.05, height: 3.1, scale: 3.05, color: 0xffdd55 },
    };
    const s = stats[kind];
    const hp = s.hp * (1 + this.player.wave * 0.08);
    const key = kind === "boss" ? "golem" : kind;
    const mat = this.spriteMats[key] ?? this.fallbackSprite(s.color);
    if (!e) {
      const sprite = new THREE.Sprite(mat.clone());
      sprite.center.set(0.5, 0);
      this.scene.add(sprite);
      const glow = new THREE.PointLight(s.color, 0.7, 5, 2);
      this.scene.add(glow);
      e = {
        alive: true,
        kind,
        x,
        y: 0,
        z,
        hp,
        maxHp: hp,
        radius: s.radius,
        height: s.height,
        speed: s.speed,
        sprite,
        glow,
        atkCd: 0.4,
        hurtT: 0,
        bob: Math.random() * 10,
        vx: 0,
        vz: 0,
        chargeT: 0,
        spawnCd: 5,
      };
      this.enemies.push(e);
    }
    e.alive = true;
    e.kind = kind;
    e.x = x;
    e.z = z;
    e.hp = hp;
    e.maxHp = hp;
    e.radius = s.radius;
    e.height = s.height;
    e.speed = s.speed;
    e.atkCd = 0.5;
    e.hurtT = 0;
    e.vx = 0;
    e.vz = 0;
    e.chargeT = 0;
    e.spawnCd = 6;
    e.sprite.material = mat.clone();
    e.sprite.material.color.setRGB(1, 1, 1);
    e.sprite.scale.set(s.scale * 0.85, s.scale, 1);
    e.sprite.position.set(x, 0, z);
    e.sprite.visible = true;
    e.glow.color.setHex(s.color);
    e.glow.distance = kind === "boss" ? 9 : 5;
    e.glow.intensity = kind === "boss" ? 1.4 : 0.65;
    e.glow.visible = true;
    e.glow.position.set(x, s.height * 0.5, z);
  }

  private fallbackSprite(color: number) {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
    ctx.beginPath();
    ctx.moveTo(16, 2);
    ctx.lineTo(28, 16);
    ctx.lineTo(16, 30);
    ctx.lineTo(4, 16);
    ctx.closePath();
    ctx.fill();
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    this.textures.push(t);
    const m = new THREE.SpriteMaterial({ map: t, transparent: true, alphaTest: 0.2 });
    this.mats.push(m);
    return m;
  }

  private spawnBullet(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    dmg: number,
    friendly: boolean,
    homing: number,
  ) {
    let b = this.bullets.find((n) => !n.alive);
    if (!b) {
      const mesh = new THREE.Mesh(this.bulletGeo, friendly ? this.bulletMatFriendly : this.bulletMatEnemy);
      this.scene.add(mesh);
      b = { alive: true, x, y, z, vx, vy, vz, life: 2.4, dmg, friendly, mesh, homing };
      this.bullets.push(b);
    }
    b.alive = true;
    b.x = x;
    b.y = y;
    b.z = z;
    b.vx = vx;
    b.vy = vy;
    b.vz = vz;
    b.life = 2.4;
    b.dmg = dmg;
    b.friendly = friendly;
    b.homing = homing;
    b.mesh.material = friendly ? this.bulletMatFriendly : this.bulletMatEnemy;
    b.mesh.position.set(x, y, z);
    b.mesh.visible = true;
    b.mesh.scale.setScalar(friendly ? 1 : 0.8);
  }

  private spawnPickup(kind: Pickup["kind"], x: number, z: number, gem = Math.floor(Math.random() * 9)) {
    let u = this.pickups.find((n) => !n.alive);
    const mesh = this.makePickupMesh(kind, gem);
    this.scene.add(mesh);
    if (!u) {
      u = { alive: true, kind, gem, x, y: 0, z, t: 0, mesh };
      this.pickups.push(u);
    } else {
      this.scene.remove(u.mesh);
      u.alive = true;
      u.kind = kind;
      u.gem = gem;
      u.x = x;
      u.z = z;
      u.t = 0;
      u.mesh = mesh;
    }
    mesh.position.set(x, 0.45, z);
    mesh.visible = true;
  }

  private makePickupMesh(kind: Pickup["kind"], gem: number) {
    const g = new THREE.Group();
    if (kind === "gem") {
      const colors = [0xff2a4a, 0x3ad4ff, 0xff7a18, 0xb44aff, 0xffd24a, 0x2ee6c8, 0xff7ab0, 0x66ffaa, 0xff4422];
      const m = new THREE.Mesh(
        this.sharedOct,
        new THREE.MeshLambertMaterial({ color: colors[gem], emissive: colors[gem], emissiveIntensity: 0.55 }),
      );
      m.scale.set(0.45, 0.7, 0.45);
      this.mats.push(m.material as THREE.Material);
      g.add(m);
    } else if (kind === "shells") {
      const m = new THREE.Mesh(this.sharedBox, lambert(0xc43c3c, this.tex.metal));
      m.scale.set(0.35, 0.22, 0.25);
      g.add(m);
    } else if (kind === "health") {
      const m = new THREE.Mesh(this.sharedBox, lambert(0x2ecc5a));
      m.scale.set(0.28, 0.28, 0.12);
      g.add(m);
      const m2 = new THREE.Mesh(this.sharedBox, lambert(0x2ecc5a));
      m2.scale.set(0.12, 0.12, 0.28);
      g.add(m2);
    } else {
      const m = new THREE.Mesh(this.sharedBox, lambert(0xc4a24a, this.tex.metal));
      m.scale.set(0.4, 0.5, 0.12);
      g.add(m);
    }
    return g;
  }

  private seedPickups() {
    for (const u of this.pickups) {
      u.alive = false;
      u.mesh.visible = false;
    }
    const spots = [worldOf(24, 5), worldOf(22, 4), worldOf(24, 24), worldOf(5, 5), worldOf(14, 4)];
    spots.forEach((s, i) => this.spawnPickup(i === 3 ? "health" : "gem", s.x, s.z, i % 9));
  }

  private poolBullets() {
    for (let i = 0; i < 28; i++) {
      const mesh = new THREE.Mesh(this.bulletGeo, this.bulletMatFriendly);
      mesh.visible = false;
      this.scene.add(mesh);
      this.bullets.push({
        alive: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        dmg: 0,
        friendly: true,
        mesh,
        homing: 0,
      });
    }
  }

  private poolSparks() {
    for (let i = 0; i < 220; i++) {
      this.sparks.push({
        alive: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        max: 1,
        s: 0.05,
        r: 1,
        g: 1,
        b: 1,
      });
    }
    this.sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sparkMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(220 * 3), 3);
  }

  private updateDecor(dt: number) {
    for (const u of this.pickups) {
      if (!u.alive) continue;
      u.mesh.rotation.y += dt * 1.4;
    }
  }

  private flickerTorches() {
    for (const l of this.torchLights) {
      l.intensity = 1.35 + Math.sin(this.clock * 9 + l.position.x) * 0.35 + Math.random() * 0.12;
    }
  }

  private announce(msg: string) {
    hudApi.set({ announce: msg });
    window.setTimeout(() => {
      if (hudApi.get().announce === msg) hudApi.set({ announce: "" });
    }, 1800);
  }

  private syncHud(_force: boolean) {
    const p = this.player;
    hudApi.set({
      hp: Math.max(0, Math.round(p.hp)),
      maxHp: p.maxHp,
      armor: Math.max(0, Math.round(p.armor)),
      stamina: Math.max(0, Math.round(p.stamina)),
      score: p.score,
      ammo: p.ammo,
      mag: p.mag,
      heals: p.heals,
      slot: p.slot,
      wave: p.wave,
      kills: p.kills,
      combo: p.combo,
    });
  }

  private draw() {
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (this.mode === "playing" || this.mode === "paused") {
      this.renderer.clearDepth();
      this.renderer.render(this.weaponScene, this.weaponCam);
    }
  }

  private loadSprites() {
    const loader = new THREE.TextureLoader();
    const bind = (url: string, key: string) => {
      loader.load(
        url,
        (t) => {
          t.magFilter = THREE.NearestFilter;
          t.minFilter = THREE.NearestFilter;
          t.generateMipmaps = false;
          t.colorSpace = THREE.SRGBColorSpace;
          this.textures.push(t);
          const m = new THREE.SpriteMaterial({ map: t, transparent: true, alphaTest: 0.12, depthWrite: false });
          this.spriteMats[key] = m;
          this.mats.push(m);
          for (const e of this.enemies) {
            if (!e.alive) continue;
            const k = e.kind === "boss" ? "golem" : e.kind;
            if (k === key) {
              e.sprite.material = m.clone();
            }
          }
        },
        undefined,
        () => {
          /* keep fallback */
        },
      );
    };
    bind("/game/enemy-imp.png", "imp");
    bind("/game/enemy-shield.png", "shield");
    bind("/game/enemy-wraith.png", "wraith");
    bind("/game/enemy-golem.png", "golem");
    loader.load("/game/wall-shield.png", (t) => {
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.colorSpace = THREE.SRGBColorSpace;
      this.textures.push(t);
      const m = new THREE.SpriteMaterial({ map: t, transparent: true, alphaTest: 0.15 });
      this.mats.push(m);
      for (const d of this.map.decors) {
        if (d.kind !== "shield") continue;
        const spr = new THREE.Sprite(m);
        spr.scale.set(1.15, 1.35, 1);
        spr.position.set(d.x, d.y, d.z);
        this.scene.add(spr);
      }
    });
    loader.load("/game/fx-muzzle.png", (t) => {
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.colorSpace = THREE.SRGBColorSpace;
      this.textures.push(t);
      this.muzzle.material.map = t;
      this.muzzle.material.needsUpdate = true;
    });
  }

  private makeMuzzle() {
    const mat = new THREE.SpriteMaterial({
      color: 0xffeeaa,
      transparent: true,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.mats.push(mat);
    const s = new THREE.Sprite(mat);
    s.position.set(0, 0.06, -0.55);
    s.scale.set(0.35, 0.35, 1);
    s.visible = false;
    return s;
  }

  private buildWorld() {
    const amb = new THREE.AmbientLight(0x6a7390, 0.32);
    const hemi = new THREE.HemisphereLight(0x8899bb, 0x2a2418, 0.42);
    this.scene.add(amb, hemi);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_W * CELL, MAP_H * CELL),
      lambert(0xffffff, this.tex.floor),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((MAP_W * CELL) / 2, 0, (MAP_H * CELL) / 2);
    this.scene.add(floor);

    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_W * CELL, MAP_H * CELL),
      lambert(0xffffff, this.tex.ceiling),
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set((MAP_W * CELL) / 2, WALL_H, (MAP_H * CELL) / 2);
    this.scene.add(ceil);

    const wallGeo = this.sharedBox;
    const wallMat = lambert(0xffffff, this.tex.wall);
    const darkMat = lambert(0xffffff, this.tex.wallDark);
    const crackMat = lambert(0xffffff, this.tex.cracked);
    const woodMat = lambert(0xffffff, this.tex.wood);
    const lavaMat = new THREE.MeshLambertMaterial({
      map: this.tex.lava,
      emissive: 0xff5511,
      emissiveIntensity: 0.8,
    });
    const pillarMat = lambert(0x9aa3b8, this.tex.wall);
    this.mats.push(wallMat, darkMat, crackMat, woodMat, lavaMat, pillarMat, floor.material as THREE.Material, ceil.material as THREE.Material);

    let wallCount = 0;
    let pillarCount = 0;
    for (let j = 0; j < MAP_H; j++) {
      for (let i = 0; i < MAP_W; i++) {
        const c = this.map.grid[j]![i];
        if (c === 1) wallCount++;
        if (c === 5) pillarCount++;
      }
    }
    const walls = new THREE.InstancedMesh(wallGeo, wallMat, wallCount);
    const pillars = new THREE.InstancedMesh(wallGeo, pillarMat, Math.max(1, pillarCount));
    let wi = 0;
    let pi = 0;
    for (let j = 0; j < MAP_H; j++) {
      for (let i = 0; i < MAP_W; i++) {
        const c = this.map.grid[j]![i]!;
        const w = worldOf(i, j);
        if (c === 1) {
          _dummy.position.set(w.x, WALL_H / 2, w.z);
          _dummy.scale.set(CELL * 1.01, WALL_H, CELL * 1.01);
          _dummy.updateMatrix();
          walls.setMatrixAt(wi++, _dummy.matrix);
        } else if (c === 5) {
          _dummy.position.set(w.x, WALL_H / 2, w.z);
          _dummy.scale.set(CELL * 0.72, WALL_H, CELL * 0.72);
          _dummy.updateMatrix();
          pillars.setMatrixAt(pi++, _dummy.matrix);
        } else if (c === 2 || c === 3) {
          const mesh = new THREE.Mesh(wallGeo, c === 2 ? crackMat : woodMat);
          mesh.position.set(w.x, c === 3 ? 0.55 : WALL_H / 2, w.z);
          mesh.scale.set(c === 3 ? 0.9 : CELL * 1.01, c === 3 ? 1.1 : WALL_H, c === 3 ? 0.9 : CELL * 1.01);
          this.scene.add(mesh);
          this.breakables.push({ i, j, hp: c === 3 ? 28 : 55, type: c, mesh });
        } else if (c === 4) {
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.95, 0.12, CELL * 0.95), lavaMat);
          mesh.position.set(w.x, 0.04, w.z);
          this.scene.add(mesh);
        }
      }
    }
    this.scene.add(walls, pillars);

    const runeMat = lambert(0xffffff, this.tex.rune);
    this.mats.push(runeMat);
    for (const r of this.map.runeCells) {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(CELL * 0.9, CELL * 0.9), runeMat);
      q.rotation.x = -Math.PI / 2;
      q.position.set(r.x, 0.015, r.z);
      this.scene.add(q);
    }

    let lights = 0;
    for (const d of this.map.decors) {
      if (d.kind === "torch") {
        const flame = new THREE.Mesh(
          this.sharedOct,
          new THREE.MeshBasicMaterial({ color: 0xff9933 }),
        );
        flame.scale.set(0.14, 0.28, 0.14);
        flame.position.set(d.x, d.y, d.z);
        this.scene.add(flame);
        this.mats.push(flame.material as THREE.Material);
        if (lights < 8) {
          const pl = new THREE.PointLight(0xff9944, 1.5, 8.5, 2);
          pl.position.set(d.x, d.y, d.z);
          this.scene.add(pl);
          this.torchLights.push(pl);
          lights++;
        }
      } else if (d.kind === "pedestal") {
        const base = new THREE.Mesh(this.sharedBox, lambert(0x8890a0, this.tex.wall));
        base.scale.set(0.7, 0.7, 0.7);
        base.position.set(d.x, 0.35, d.z);
        this.scene.add(base);
      }
    }
  }

  private buildWeapons() {
    const shotgun = new THREE.Group();
    const metal = lambert(0x1c2436, this.tex.metal);
    const dark = lambert(0x12151c, this.tex.metal);
    const wood = lambert(0x6a3a22, this.tex.wood);
    const gold = lambert(0xc4a24a, this.tex.metal);
    this.mats.push(metal, dark, wood, gold);

    const rec = new THREE.Mesh(this.sharedBox, metal);
    rec.scale.set(0.14, 0.16, 0.55);
    rec.position.set(0, 0.02, 0);
    shotgun.add(rec);
    const bar = new THREE.Mesh(this.sharedBox, dark);
    bar.scale.set(0.08, 0.08, 0.7);
    bar.position.set(0, 0.05, -0.4);
    shotgun.add(bar);
    const bar2 = new THREE.Mesh(this.sharedBox, dark);
    bar2.scale.set(0.07, 0.07, 0.62);
    bar2.position.set(0, -0.02, -0.36);
    shotgun.add(bar2);
    const pump = new THREE.Mesh(this.sharedBox, wood);
    pump.scale.set(0.12, 0.1, 0.22);
    pump.position.set(0, -0.04, -0.18);
    shotgun.add(pump);
    const stock = new THREE.Mesh(this.sharedBox, wood);
    stock.scale.set(0.1, 0.14, 0.28);
    stock.position.set(0, -0.04, 0.32);
    shotgun.add(stock);
    const band = new THREE.Mesh(this.sharedBox, gold);
    band.scale.set(0.15, 0.04, 0.04);
    band.position.set(0, 0.08, 0.05);
    shotgun.add(band);
    shotgun.position.set(0.32, -0.28, -0.62);
    this.weaponCam.add(shotgun);

    const orb = new THREE.Group();
    const stick = new THREE.Mesh(this.sharedBox, wood);
    stick.scale.set(0.06, 0.06, 0.5);
    stick.position.set(0, 0, 0);
    orb.add(stick);
    const core = new THREE.Mesh(
      this.sharedOct,
      new THREE.MeshLambertMaterial({ color: 0x3ec4ff, emissive: 0x2277ff, emissiveIntensity: 0.9 }),
    );
    core.name = "orbcore";
    core.scale.set(0.28, 0.28, 0.28);
    core.position.set(0, 0.04, -0.32);
    this.mats.push(core.material as THREE.Material);
    orb.add(core);
    orb.position.set(0.28, -0.24, -0.55);
    this.weaponCam.add(orb);

    const shield = new THREE.Group();
    const plate = new THREE.Mesh(this.sharedBox, lambert(0x2a4a8c, this.tex.metal));
    plate.scale.set(0.55, 0.72, 0.08);
    shield.add(plate);
    const rim = new THREE.Mesh(this.sharedBox, gold);
    rim.scale.set(0.62, 0.78, 0.04);
    rim.position.z = 0.03;
    shield.add(rim);
    const boss = new THREE.Mesh(this.sharedOct, gold);
    boss.scale.set(0.18, 0.18, 0.12);
    boss.position.z = 0.08;
    shield.add(boss);
    shield.position.set(-0.05, -0.12, -0.5);
    this.weaponCam.add(shield);

    const flask = new THREE.Group();
    const bottle = new THREE.Mesh(this.sharedBox, lambert(0x1e8a44));
    bottle.scale.set(0.14, 0.28, 0.14);
    flask.add(bottle);
    const cap = new THREE.Mesh(this.sharedBox, gold);
    cap.scale.set(0.08, 0.06, 0.08);
    cap.position.y = 0.18;
    flask.add(cap);
    const cross = new THREE.Mesh(this.sharedBox, lambert(0xb6ff9a));
    cross.scale.set(0.16, 0.05, 0.04);
    cross.position.z = 0.08;
    flask.add(cross);
    flask.position.set(0.26, -0.3, -0.5);
    this.weaponCam.add(flask);

    const sword = new THREE.Group();
    const blade = new THREE.Mesh(this.sharedBox, lambert(0xcfd8e6, this.tex.metal));
    blade.scale.set(0.05, 0.05, 0.85);
    blade.position.z = -0.2;
    sword.add(blade);
    const guard = new THREE.Mesh(this.sharedBox, gold);
    guard.scale.set(0.28, 0.06, 0.06);
    sword.add(guard);
    const grip = new THREE.Mesh(this.sharedBox, wood);
    grip.scale.set(0.07, 0.07, 0.22);
    grip.position.z = 0.16;
    sword.add(grip);
    sword.visible = false;
    this.weaponCam.add(sword);

    return { shotgun, orb, shield, flask, sword };
  }
}
