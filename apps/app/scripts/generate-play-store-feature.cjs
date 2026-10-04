// Compose the store banner from the existing vector logo and bundled fonts.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');

async function main() {
  const original = await fs.readFile(path.join(root, 'assets/branding/rocksky-logo.svg'), 'utf8');
  const defs = original.slice(original.indexOf('<defs>') + 6, original.indexOf('</defs>'));
  const note = original.slice(original.indexOf('    <g transform="translate(-8,2)">'), original.indexOf('\n  </g>\n\n  <rect'));
  const stars = [[80,94,2],[174,65,1.4],[307,105,2.4],[360,54,1],[498,82,1.6],[748,68,2],[904,104,2.5],[949,194,1],[853,351,1.8],[930,427,2],[662,423,1.2],[433,400,1.8],[272,435,1.2],[98,368,2],[54,231,1.3]];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
    <defs>${defs}
      <radialGradient id="aura"><stop stop-color="#7C3AED" stop-opacity=".32"/><stop offset="1" stop-color="#7C3AED" stop-opacity="0"/></radialGradient>
      <linearGradient id="horizon" x2="1" y2="0"><stop stop-color="#A855F7" stop-opacity="0"/><stop offset=".5" stop-color="#A855F7" stop-opacity=".2"/><stop offset="1" stop-color="#22D3EE" stop-opacity="0"/></linearGradient>
    </defs>
    <rect width="1024" height="500" fill="url(#bg)"/>
    <ellipse cx="246" cy="245" rx="330" ry="290" fill="url(#aura)"/>
    <path d="M-80 482 Q480 250 1140 428 L1140 550 H-80Z" fill="url(#horizon)"/>
    <path d="M-80 482 Q480 250 1140 428" fill="none" stroke="#BDA5F5" stroke-opacity=".13"/>
    ${stars.map(([cx,cy,r],i)=>`<circle cx="${cx}" cy="${cy}" r="${r}" fill="#E9DEFF" opacity="${i%3===0?.7:.35}"/>`).join('')}
    <g transform="translate(238 244) scale(.48) translate(-512 -512)">${note}</g>
  </svg>`;
  const label = (text, face, size, color) => sharp({ text: {
    text: `<span foreground="${color}">${text}</span>`,
    font: `Rockford Sans ${face} ${size}`,
    fontfile: path.join(root, `assets/fonts/RockfordSans-${face}.otf`),
    rgba: true, dpi: 72,
  }}).png().toBuffer();
  const title = await label('Rocksky', 'ExtraBold', 84, '#FFFFFF');
  const subtitle = await label('La musique se partage.', 'Regular', 28, '#D4C7EA');
  await sharp(Buffer.from(svg)).composite([
    { input: title, left: 420, top: 178 },
    { input: subtitle, left: 424, top: 285 },
  ]).flatten({ background: '#130825' }).removeAlpha().png().toFile(path.join(root, 'assets/images/play-store-feature.png'));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
