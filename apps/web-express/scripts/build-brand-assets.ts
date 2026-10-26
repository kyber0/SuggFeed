import sharp from 'sharp';
import { mkdir, writeFile } from 'fs/promises';
import { resolve } from 'path';

// Deterministic delivery sizes only: retain the supplied artwork and alpha.
const source = resolve(__dirname, '../../../assets/branding/sf-monogram-source.png');
async function main() {
  const outputs = new Map<string, Buffer>();
  outputs.set('sf-monogram.png', await sharp(source).resize(240, 160, { fit: 'inside' }).png().toBuffer());
  for (const size of [16, 32, 48, 180, 192, 512]) {
    const icon = await sharp(source).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    outputs.set(`icon-${size}.png`, icon);
  }
  outputs.set('maskable-512.png', await sharp(source).resize(512, 512, { fit: 'contain', background: '#f8fafc' }).flatten({ background: '#f8fafc' }).png().toBuffer());
  const sizes = [16, 32, 48];
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, index) => {
    const icon = outputs.get(`icon-${size}.png`)!;
    const entry = 6 + index * 16;
    header[entry] = size; header[entry + 1] = size;
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(icon.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
    offset += icon.length;
  });
  outputs.set('favicon.ico', Buffer.concat([header, ...sizes.map(size => outputs.get(`icon-${size}.png`)!)]));
  for (const folder of ['../public/branding']) {
    const target = resolve(__dirname, folder);
    await mkdir(target, { recursive: true });
    await Promise.all([...outputs].map(([name, bytes]) => writeFile(resolve(target, name), bytes)));
  }
  console.log('Express brand assets generated from the supplied monogram.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
