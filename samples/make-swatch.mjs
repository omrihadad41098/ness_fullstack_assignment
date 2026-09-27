// Generates samples/swatch.png: a real PNG (valid signature, IHDR/IDAT/IEND, correct CRCs)
// so upload tests exercise the magic-byte check against genuine image bytes.
// Run: node samples/make-swatch.mjs
import { crc32, deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const SIZE = 64;

function chunk(type, data) {
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(typeAndData.length + 8);
  out.writeUInt32BE(data.length, 0);
  typeAndData.copy(out, 4);
  out.writeUInt32BE(crc32(typeAndData) >>> 0, out.length - 4);
  return out;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // colour type: truecolour RGB

const raw = [];
for (let y = 0; y < SIZE; y += 1) {
  raw.push(Buffer.from([0])); // filter type 0 for the scanline
  const row = Buffer.alloc(SIZE * 3);
  for (let x = 0; x < SIZE; x += 1) {
    row[x * 3] = (x * 4) % 256;
    row[x * 3 + 1] = (y * 4) % 256;
    row[x * 3 + 2] = 128;
  }
  raw.push(row);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(Buffer.concat(raw))),
  chunk('IEND', Buffer.alloc(0)),
]);

writeFileSync(new URL('./swatch.png', import.meta.url), png);
console.log(`wrote swatch.png (${png.length} bytes)`);
