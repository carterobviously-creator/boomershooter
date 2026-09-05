import * as THREE from "three";

export type TexSet = {
  floor: THREE.CanvasTexture;
  wall: THREE.CanvasTexture;
  wallDark: THREE.CanvasTexture;
  cracked: THREE.CanvasTexture;
  ceiling: THREE.CanvasTexture;
  wood: THREE.CanvasTexture;
  metal: THREE.CanvasTexture;
  lava: THREE.CanvasTexture;
  rune: THREE.CanvasTexture;
};

function canvasTex(size: number, paint: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  paint(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function put(data: Uint8ClampedArray, i: number, r: number, g: number, b: number) {
  const p = i * 4;
  data[p] = r;
  data[p + 1] = g;
  data[p + 2] = b;
  data[p + 3] = 255;
}

function hash(x: number, y: number) {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}

export function createTextures(): TexSet {
  const floor = canvasTex(64, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    const d = img.data;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = y * s + x;
        const grout = x % 32 < 2 || y % 32 < 2 || x === 0 || y === 0;
        const n = hash(x, y);
        if (grout) {
          put(d, i, 48 + n * 10, 46 + n * 8, 52 + n * 10);
        } else {
          const tile = (Math.floor(x / 32) + Math.floor(y / 32) * 2) % 4;
          const bases = [
            [138, 128, 110],
            [126, 118, 102],
            [148, 138, 118],
            [118, 110, 96],
          ];
          const b = bases[tile]!;
          const dirt = n < 0.08 ? -18 : n > 0.94 ? 12 : 0;
          put(d, i, b[0]! + dirt + (n - 0.5) * 8, b[1]! + dirt + (n - 0.5) * 6, b[2]! + dirt);
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  });
  floor.repeat.set(14, 14);

  const wall = canvasTex(64, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    const d = img.data;
    const bh = 8;
    const bw = 16;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = y * s + x;
        const row = Math.floor(y / bh);
        const ox = (row % 2) * (bw / 2);
        const mortar = y % bh === 0 || ((x + ox) % bw) < 1;
        const n = hash(x, y + 20);
        if (mortar) put(d, i, 28, 30, 38);
        else {
          const shade = (row % 3) * 6;
          put(
            d,
            i,
            58 + shade + n * 14,
            66 + shade + n * 12,
            84 + shade + n * 16,
          );
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  });
  wall.repeat.set(1, 1);

  const wallDark = canvasTex(64, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    const d = img.data;
    const bh = 10;
    const bw = 20;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = y * s + x;
        const row = Math.floor(y / bh);
        const ox = (row % 2) * (bw / 2);
        const mortar = y % bh === 0 || ((x + ox) % bw) < 1;
        const n = hash(x + 3, y);
        if (mortar) put(d, i, 18, 16, 20);
        else put(d, i, 42 + n * 10, 38 + n * 8, 48 + n * 12);
      }
    }
    ctx.putImageData(img, 0, 0);
  });

  const cracked = canvasTex(64, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    const d = img.data;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = y * s + x;
        const n = hash(x, y);
        const crack = Math.abs((y - x * 0.4) % 18) < 1 || Math.abs((x + y * 0.6) % 22) < 1;
        if (crack) put(d, i, 18, 16, 14);
        else put(d, i, 70 + n * 16, 64 + n * 12, 58 + n * 10);
      }
    }
    ctx.putImageData(img, 0, 0);
  });

  const ceiling = canvasTex(64, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    const d = img.data;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = y * s + x;
        const beam = x % 32 < 3;
        const n = hash(x + 9, y + 2);
        if (beam) put(d, i, 36, 30, 26);
        else put(d, i, 40 + n * 8, 42 + n * 8, 50 + n * 10);
      }
    }
    ctx.putImageData(img, 0, 0);
  });
  ceiling.repeat.set(14, 14);

  const wood = canvasTex(32, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    const d = img.data;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = y * s + x;
        const n = hash(x, y);
        const grain = Math.sin(y * 0.9 + n) * 8;
        put(d, i, 92 + grain + n * 10, 62 + grain * 0.6, 38);
      }
    }
    ctx.putImageData(img, 0, 0);
  });

  const metal = canvasTex(32, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    const d = img.data;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = y * s + x;
        const n = hash(x * 2, y);
        const rivet = (x % 8 === 0 && y % 8 === 0);
        if (rivet) put(d, i, 180, 170, 150);
        else put(d, i, 38 + n * 20, 42 + n * 18, 52 + n * 16);
      }
    }
    ctx.putImageData(img, 0, 0);
  });

  const lava = canvasTex(32, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    const d = img.data;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = y * s + x;
        const n = hash(x, y);
        const hot = n > 0.65;
        if (hot) put(d, i, 255, 180 + n * 40, 40);
        else put(d, i, 180 + n * 40, 40 + n * 20, 12);
      }
    }
    ctx.putImageData(img, 0, 0);
  });
  lava.repeat.set(1, 1);

  const rune = canvasTex(64, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    const d = img.data;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = y * s + x;
        const n = hash(x, y);
        const ring = Math.abs(Math.hypot(x - 32, y - 32) - 18) < 1.2;
        const cross = (Math.abs(x - 32) < 1 && y > 16 && y < 48) || (Math.abs(y - 32) < 1 && x > 16 && x < 48);
        if (ring || cross) put(d, i, 196, 150, 60);
        else put(d, i, 52 + n * 8, 48, 62 + n * 10);
      }
    }
    ctx.putImageData(img, 0, 0);
  });

  return { floor, wall, wallDark, cracked, ceiling, wood, metal, lava, rune };
}

export function disposeTextures(t: TexSet) {
  for (const v of Object.values(t)) v.dispose();
}
