// Render the existing vector logo. Both splash implementations share one PNG.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');

async function main() {
  const original = await fs.readFile(path.join(root, 'assets/branding/rocksky-logo.svg'), 'utf8');
  const defs = original.slice(original.indexOf('<defs>'), original.indexOf('</defs>') + 7);
  const note = original.slice(original.indexOf('    <g transform="translate(-8,2)">'), original.indexOf('\n  </g>\n\n  <rect'));
  const stars = original.slice(original.indexOf('    <g fill="#FFFFFF">'), original.indexOf('    <g transform="translate(-8,2)">'));
  const sky = `<rect width="1024" height="1024" fill="url(#bg)"/><rect y="464" width="1024" height="560" fill="url(#glow)"/>${stars}`;
  // Reduce only the logo, leaving the background full bleed for launcher masks.
  const paddedNote = `<g transform="translate(512 512) scale(0.78) translate(-512 -512)">${note}</g>`;
  const svg = (content, viewBox = '0 0 1024 1024') => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="${viewBox}">${defs}${content}</svg>`;
  const render = (name, source, size) => sharp(Buffer.from(source)).resize(size, size).png().toFile(path.join(root, 'assets/images', name));
  await render('icon.png', svg(sky + paddedNote), 1024);
  await render('play-store-icon.png', svg(sky + paddedNote), 512);
  await render('adaptive-icon.png', svg(paddedNote), 1024);
  await render('icon-background.png', svg(sky), 1024);
  await render('splash-icon.png', svg(note, '192 192 640 640'), 512);
  await render('favicon.png', svg(sky + paddedNote), 48);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
