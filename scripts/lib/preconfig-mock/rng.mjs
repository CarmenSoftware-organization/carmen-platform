/**
 * Deterministic pseudo-random helpers for the Preconfig mock generator.
 * ตัวช่วยสุ่มแบบกำหนด seed สำหรับตัวสร้างข้อมูลจำลอง Preconfig
 *
 * Every value in the generated workbook derives from one of these helpers, so the same
 * seed always produces the same workbook contents.
 */

/**
 * mulberry32 — a small, fast, 32-bit seeded PRNG.
 * @param {number} seed - Any integer / จำนวนเต็มใด ๆ
 * @returns {() => number} Next float in [0, 1) / ค่าถัดไปในช่วง [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build the helper bundle every generator module takes as its first argument.
 * @param {number} seed - PRNG seed / ค่าเริ่มต้นของตัวสุ่ม
 * @returns {{next: () => number, int: (min: number, max: number) => number,
 *   pick: (arr: any[]) => any, chance: (p: number) => boolean,
 *   shuffle: (arr: any[]) => any[],
 *   weightedSplit: (total: number, parts: number, max: number) => number[]}}
 */
export function createRng(seed) {
  const next = mulberry32(seed);

  /** Inclusive on both ends. / รวมค่าปลายทั้งสองด้าน */
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));

  const pick = (arr) => {
    if (arr.length === 0) throw new Error('pick() called with an empty array');
    return arr[int(0, arr.length - 1)];
  };

  const chance = (p) => next() < p;

  /** Fisher-Yates over a copy — the input array is never mutated. */
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = int(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  /**
   * Split `total` into `parts` random integers, each between 1 and `max`, summing exactly
   * to `total`. Used to spread a category's product quota across its item groups.
   * แบ่ง total ออกเป็น parts จำนวนเต็ม แต่ละส่วนอยู่ระหว่าง 1 ถึง max และรวมได้เท่ากับ total พอดี
   */
  const weightedSplit = (total, parts, max) => {
    if (parts < 1) throw new Error('weightedSplit: parts must be >= 1');
    if (total < parts) {
      throw new Error(`weightedSplit: cannot split ${total} into ${parts} parts of at least 1`);
    }
    if (total > parts * max) {
      throw new Error(`weightedSplit: cannot split ${total} into ${parts} parts of at most ${max}`);
    }
    const out = new Array(parts).fill(1);
    let left = total - parts;
    // A floor of 0.1 keeps any single bucket from being starved to exactly its minimum.
    const weights = out.map(() => next() + 0.1);
    const sum = weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < parts && left > 0; i++) {
      const want = Math.min(Math.round((weights[i] / sum) * (total - parts)), max - out[i], left);
      out[i] += want;
      left -= want;
    }
    // Rounding always leaves a small remainder; hand it to whichever buckets have headroom.
    for (let i = 0; left > 0; i = (i + 1) % parts) {
      if (out[i] < max) {
        out[i] += 1;
        left -= 1;
      }
    }
    return out;
  };

  return { next, int, pick, chance, shuffle, weightedSplit };
}
