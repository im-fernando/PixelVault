#!/usr/bin/env node
/** Cria EXE, ISO e CHD de teste a partir de código MIT do projeto. */
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { criarHomebrewPs1 } from './ps1-homebrew.mjs';
const destino = process.argv[2] ?? mkdtempSync(path.join(tmpdir(), 'pixelvault-ps1-'));
const pasta = path.join(destino, 'cd');
mkdirSync(pasta, { recursive: true });
writeFileSync(path.join(destino, 'pixelvault.exe'), criarHomebrewPs1());
writeFileSync(path.join(pasta, 'PSX.EXE'), criarHomebrewPs1());
writeFileSync(
  path.join(pasta, 'SYSTEM.CNF'),
  'BOOT = cdrom:\\PSX.EXE;1\r\nTCB = 4\r\nEVENT = 10\r\nSTACK = 801fff00\r\n',
);
const isoPath = path.join(destino, 'pixelvault.iso');
execFileSync(process.env.MKISOFS ?? 'mkisofs', [
  '-quiet',
  '-sysid',
  'PLAYSTATION',
  '-V',
  'PIXELVAULT',
  '-o',
  isoPath,
  pasta,
]);
// CHD usa a faixa bruta MODE2/2352, como um CD de PS1; não MODE1 cooked.
const iso = readFileSync(isoPath);
const setores = iso.length / 2048;
const raw = new Uint8Array(setores * 2352);
const bcd = (x) => Math.floor(x / 10) * 16 + (x % 10);
for (let i = 0; i < setores; i++) {
  const offset = i * 2352;
  const frame = i + 150;
  raw.set(
    [
      0,
      ...Array(10).fill(255),
      0,
      bcd(Math.floor(frame / 4500)),
      bcd(Math.floor(frame / 75) % 60),
      bcd(frame % 75),
      2,
      0,
      0,
      8,
      0,
      0,
      0,
      8,
      0,
    ],
    offset,
  );
  raw.set(iso.subarray(i * 2048, (i + 1) * 2048), offset + 24);
}
writeFileSync(path.join(destino, 'pixelvault.bin'), raw);
const cuePath = path.join(destino, 'pixelvault.cue');
writeFileSync(cuePath, 'FILE "pixelvault.bin" BINARY\n TRACK 01 MODE2/2352\n INDEX 01 00:00:00\n');
execFileSync(
  process.env.CHDMAN ?? 'chdman',
  ['createcd', '-i', cuePath, '-o', path.join(destino, 'pixelvault.chd'), '-f'],
  { stdio: 'inherit' },
);
process.stdout.write(destino + '\n');
