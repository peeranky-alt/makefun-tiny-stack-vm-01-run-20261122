// Faithful interpreter of make.fun's tiny stack ISA v1: wrapping 32-bit
// arithmetic, 256-value stack, 64-deep calls, 256 words of memory, input
// and output, all ten traps with their own exit codes, checked in the
// ISA's order (steps, pc, unknown opcode, cut-off immediate, stack
// underflow/overflow, then the instruction's own trap).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// Per opcode: [immediate bytes, popped, pushed]; absent = unknown (trap 5).
const S: ([number, number, number] | undefined)[] = new Array(256);
{
  const p = (o: number, i: number, a: number, b: number) => { S[o] = [i, a, b]; };
  const bin = (o: number) => p(o, 0, 2, 1);
  p(0, 0, 0, 0); p(1, 1, 0, 1); p(2, 4, 0, 1); p(3, 0, 1, 0); p(4, 0, 1, 2);
  p(5, 0, 2, 2); p(6, 0, 2, 3); p(7, 0, 3, 3);
  for (let o = 16; o <= 22; o++) bin(o);
  p(23, 0, 1, 1);
  for (let o = 24; o <= 26; o++) bin(o);
  p(27, 0, 1, 1);
  for (let o = 28; o <= 30; o++) bin(o);
  for (let o = 32; o <= 34; o++) bin(o);
  p(48, 2, 0, 0); p(49, 2, 1, 0); p(50, 2, 1, 0); p(51, 2, 0, 0); p(52, 0, 0, 0);
  p(64, 0, 1, 1); p(65, 0, 2, 0);
  p(80, 0, 1, 0); p(81, 0, 1, 0); p(82, 0, 0, 1); p(83, 0, 1, 0);
}
function run(p: Uint8Array, inp: Uint8Array): { o: Uint8Array; c: number } {
  const n = p.length, d = new Int32Array(256), c = new Int32Array(64), m = new Int32Array(256);
  const out = new Uint8Array(65536);
  let ol = 0, ip = 0, pc = 0, sp = 0, cp = 0, st = 0;
  const done = (code: number) => ({ o: out.slice(0, ol), c: code });
  for (;;) {
    if (st === 1000000) return done(10);
    if (pc < 0 || pc >= n) return done(9);
    const op = p[pc], s = S[op];
    if (s === undefined) return done(5);
    if (pc + s[0] >= n) return done(9);
    st++;
    if (sp < s[1]) return done(2);
    if (sp - s[1] + s[2] > 256) return done(3);
    const nx = pc + 1 + s[0];
    pc = nx;
    switch (op) {
      case 0: return done(0);
      case 1: d[sp++] = (p[nx - 1] << 24) >> 24; break;
      case 2: d[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24); break;
      case 3: sp--; break;
      case 4: d[sp] = d[sp - 1]; sp++; break;
      case 5: { const t = d[sp - 1]; d[sp - 1] = d[sp - 2]; d[sp - 2] = t; break; }
      case 6: d[sp] = d[sp - 2]; sp++; break;
      case 7: { const a = d[sp - 3]; d[sp - 3] = d[sp - 2]; d[sp - 2] = d[sp - 1]; d[sp - 1] = a; break; }
      case 23: d[sp - 1] = -d[sp - 1]; break;
      case 27: d[sp - 1] = ~d[sp - 1]; break;
      case 16: case 17: case 18: case 19: case 20: case 21: case 22:
      case 24: case 25: case 26: case 28: case 29: case 30: case 32: case 33: case 34: {
        const b = d[sp - 1], a = d[sp - 2];
        let r: number;
        switch (op) {
          case 16: r = (a + b) | 0; break;
          case 17: r = (a - b) | 0; break;
          case 18: r = Math.imul(a, b); break;
          case 19: if (b === 0) return done(4); r = a === -2147483648 && b === -1 ? a : (a / b) | 0; break;
          case 20: if (b === 0) return done(4); r = b === -1 ? 0 : (a % b) | 0; break;
          case 21: if (b === 0) return done(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; break;
          case 22: if (b === 0) return done(4); r = ((a >>> 0) % (b >>> 0)) | 0; break;
          case 24: r = a & b; break;
          case 25: r = a | b; break;
          case 26: r = a ^ b; break;
          case 28: r = a << (b & 31); break;
          case 29: r = a >> (b & 31); break;
          case 30: r = (a >>> (b & 31)) | 0; break;
          case 32: r = a === b ? 1 : 0; break;
          case 33: r = a < b ? 1 : 0; break;
          default: r = (a >>> 0) < (b >>> 0) ? 1 : 0; break;
        }
        sp -= 2; d[sp++] = r; break;
      }
      case 48: case 49: case 50: {
        const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
        let take = true;
        if (op !== 48) { const v = d[--sp]; take = op === 49 ? v === 0 : v !== 0; }
        if (take) pc = nx + rel;
        break;
      }
      case 51:
        if (cp === 64) return done(7);
        c[cp++] = nx; pc = p[nx - 2] | (p[nx - 1] << 8); break;
      case 52:
        if (cp === 0) return done(8);
        pc = c[--cp]; break;
      case 64: { const a = d[sp - 1]; if (a < 0 || a >= 256) return done(6); d[sp - 1] = m[a]; break; }
      case 65: { const a = d[sp - 1], v = d[sp - 2]; if (a < 0 || a >= 256) return done(6); sp -= 2; m[a] = v; break; }
      case 80: {
        const t = String(d[sp - 1]);
        if (ol + t.length > 65536) return done(11);
        sp--;
        for (let i = 0; i < t.length; i++) out[ol++] = t.charCodeAt(i);
        break;
      }
      case 81:
        if (ol + 1 > 65536) return done(11);
        out[ol++] = d[--sp] & 255; break;
      case 82: d[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 83: return done(d[--sp] & 255);
    }
  }
}
const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  let r: { o: Uint8Array; c: number };
  try {
    r = run(new Uint8Array(readFileSync(join(I, id, 'program.bin'))), new Uint8Array(readFileSync(join(I, id, 'input.bin'))));
  } catch { r = { o: new Uint8Array(0), c: 9 }; }
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.o);
  writeFileSync(join(O, id, 'exit.txt'), `${r.c}\n`);
}
