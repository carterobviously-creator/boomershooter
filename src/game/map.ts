export const CELL = 2.55;
export const MAP_W = 30;
export const MAP_H = 30;
export const WALL_H = 3.45;

/** 0 floor, 1 wall, 2 cracked, 3 crate, 4 lava, 5 pillar */
export type Cell = 0 | 1 | 2 | 3 | 4 | 5;

export type Decor = {
  kind: "torch" | "shield" | "pedestal";
  x: number;
  y: number;
  z: number;
  rot: number;
};

export type MapData = {
  grid: Uint8Array[];
  spawnX: number;
  spawnZ: number;
  decors: Decor[];
  runeCells: { x: number; z: number }[];
};

function fill(grid: Uint8Array[], v: number) {
  for (let j = 0; j < MAP_H; j++) grid[j]!.fill(v);
}

function carve(grid: Uint8Array[], x: number, y: number, w: number, h: number, v: Cell = 0) {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      if (i > 0 && j > 0 && i < MAP_W - 1 && j < MAP_H - 1) grid[j]![i] = v;
    }
  }
}

export function worldOf(i: number, j: number) {
  return { x: (i + 0.5) * CELL, z: (j + 0.5) * CELL };
}

export function cellAt(grid: Uint8Array[], x: number, z: number): number {
  const i = Math.floor(x / CELL);
  const j = Math.floor(z / CELL);
  if (i < 0 || j < 0 || i >= MAP_W || j >= MAP_H) return 1;
  return grid[j]![i]!;
}

export function isSolid(grid: Uint8Array[], x: number, z: number) {
  const c = cellAt(grid, x, z);
  return c === 1 || c === 2 || c === 3 || c === 5;
}

export function buildMap(): MapData {
  const grid: Uint8Array[] = Array.from({ length: MAP_H }, () => new Uint8Array(MAP_W));
  fill(grid, 1);

  // Hub atrium
  carve(grid, 11, 11, 8, 8);
  // Cardinal halls
  carve(grid, 12, 2, 6, 9); // north
  carve(grid, 12, 19, 6, 9); // south
  carve(grid, 2, 12, 9, 6); // west
  carve(grid, 19, 12, 9, 6); // east
  // Corner chambers
  carve(grid, 2, 2, 7, 7); // NW chapel
  carve(grid, 21, 2, 7, 7); // NE vault
  carve(grid, 2, 21, 7, 7); // SW crypt
  carve(grid, 21, 21, 7, 7); // SE hoard
  // Corridors to corners
  carve(grid, 8, 4, 5, 3);
  carve(grid, 17, 4, 5, 3);
  carve(grid, 8, 23, 5, 3);
  // Secret: cracked approach into SE
  carve(grid, 17, 23, 5, 3, 2);
  carve(grid, 19, 22, 2, 2, 2);

  // Pillars in atrium
  grid[13]![13] = 5;
  grid[13]![16] = 5;
  grid[16]![13] = 5;
  grid[16]![16] = 5;

  // Crates in west armory
  grid[13]![4] = 3;
  grid[14]![5] = 3;
  grid[16]![4] = 3;
  grid[15]![7] = 3;
  grid[13]![7] = 3;

  // Lava in SW crypt
  grid[24]![4] = 4;
  grid[24]![5] = 4;
  grid[25]![4] = 4;
  grid[25]![5] = 4;

  // Extra cracked walls as destructible cover in north
  grid[5]![13] = 2;
  grid[5]![16] = 2;

  const spawn = worldOf(14, 15);
  const decors: Decor[] = [];
  const runeCells: { x: number; z: number }[] = [];

  // Rune floor in NE vault
  for (let j = 23; j <= 25; j++) {
    for (let i = 23; i <= 25; i++) {
      if (grid[j]![i] === 0) runeCells.push(worldOf(i, j));
    }
  }
  runeCells.push(worldOf(14, 14));

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  let torchN = 0;
  let shieldN = 0;
  for (let j = 1; j < MAP_H - 1; j++) {
    for (let i = 1; i < MAP_W - 1; i++) {
      if (grid[j]![i] !== 1 && grid[j]![i] !== 5) continue;
      for (const [di, dj] of dirs) {
        const ni = i + di!;
        const nj = j + dj!;
        if (grid[nj]![ni] !== 0) continue;
        const w = worldOf(i, j);
        const f = worldOf(ni, nj);
        const x = (w.x + f.x) * 0.5;
        const z = (w.z + f.z) * 0.5;
        const rot = Math.atan2(di!, dj!);
        const h = hash(i * 13 + j * 7 + di! * 3 + dj! * 11);
        if (h > 0.82 && torchN < 18) {
          decors.push({ kind: "torch", x, y: 1.7, z, rot });
          torchN++;
        } else if (h > 0.74 && shieldN < 10) {
          decors.push({ kind: "shield", x, y: 1.55, z, rot });
          shieldN++;
        }
      }
    }
  }

  // Pedestals in NE vault
  const p1 = worldOf(24, 5);
  const p2 = worldOf(22, 4);
  decors.push({ kind: "pedestal", x: p1.x, y: 0, z: p1.z, rot: 0 });
  decors.push({ kind: "pedestal", x: p2.x, y: 0, z: p2.z, rot: 0 });

  return { grid, spawnX: spawn.x, spawnZ: spawn.z, decors, runeCells };
}

function hash(n: number) {
  n = (n ^ 0x5bd1e995) * 0x27d4eb2d;
  return ((n ^ (n >>> 15)) >>> 0) / 4294967295;
}

export function circleBlocked(grid: Uint8Array[], x: number, z: number, r: number) {
  const samples = 8;
  for (let k = 0; k < samples; k++) {
    const a = (k / samples) * Math.PI * 2;
    if (isSolid(grid, x + Math.cos(a) * r, z + Math.sin(a) * r)) return true;
  }
  return isSolid(grid, x, z);
}
