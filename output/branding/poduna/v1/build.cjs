/* Build native SVG sources into a standalone identity kit. No app/site files changed. */
const fs = require('node:fs');
const path = require('node:path');
const {promisify} = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const sharp = require('sharp');
const root = __dirname;
const green = '#245c46', ivory = '#faf8f3';
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, data) => fs.writeFileSync(path.join(root, p), data);
const inside = svg => svg.slice(svg.indexOf('<g '), svg.lastIndexOf('</svg>'));
const symbol = inside(read('source/symbol.svg'));
const small = inside(read('source/symbol-small.svg'));
const recolor = (body, color) => body.replaceAll(green, color);
const svg = (w, h, title, body, background) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}">${background ? `<rect width="${w}" height="${h}" fill="${background}"/>` : ''}${body}</svg>`;
const nest = (body, box, x, y, w, h=w) => `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 ${box} ${box}">${body}</svg>`;
const png = async (src, dest, width) => {
  await sharp(Buffer.from(src)).resize(width).png().toFile(path.join(root, dest));
};
function ico(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({size, data}, i) => {
    const p = 6 + i * 16;
    header[p] = header[p+1] = size;
    header.writeUInt16LE(1, p+4); header.writeUInt16LE(32, p+6);
    header.writeUInt32LE(data.length, p+8); header.writeUInt32LE(offset, p+12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map(i => i.data)]);
}
async function main() {
  const {stdout:font} = await execFile('fc-match',['Fira Sans:style=Medium','-f','%{family}|%{style}']);
  const [families,styles] = font.trim().split('|');
  if (!families.split(',').includes('Fira Sans') || !styles.split(',').includes('Medium')) throw Error(`Fira Sans Medium required; found ${font}`);
  for (const d of ['svg', 'png', 'icons', 'preview']) fs.mkdirSync(path.join(root, d), {recursive:true});
  for (const [name, color] of [['green',green], ['ivory',ivory], ['black','#000000']]) {
    const body = recolor(symbol, color);
    const mark = svg(1254,1254,'Poduna',body);
    write(`svg/poduna-symbol-${name}.svg`, mark);
    await png(mark, `png/poduna-symbol-${name}-1024.png`,1024);
    const lockup = svg(860,260,'Poduna',nest(body,1254,0,8,244)+`<text x="252" y="178" fill="${color}" font-family="Fira Sans" font-weight="500" font-size="148" letter-spacing="-4">Poduna</text>`);
    write(`source/lockup-${name}-editable.svg`,lockup);
    // Cairo's SVG output outlines glyphs, avoiding missing-font substitutions.
    const {stdout:outlined} = await execFile('rsvg-convert',['-f','svg',path.join(root,`source/lockup-${name}-editable.svg`)],{encoding:'utf8'});
    if (/<text\b/.test(outlined)) throw Error('Wordmark was not outlined');
    write(`svg/poduna-logo-${name}.svg`,outlined.replace('<svg ', '<svg role="img" aria-label="Poduna" '));
    await png(outlined,`png/poduna-logo-${name}-1720.png`,1720);
  }
  const icon = svg(1024,1024,'Poduna',nest(symbol,1254,0,0,1024),ivory);
  const inverse = svg(1024,1024,'Poduna',nest(recolor(symbol,ivory),1254,0,0,1024),green);
  write('icons/app-icon.svg',icon); write('icons/app-icon-inverse.svg',inverse);
  for(const size of [256,512,1024]) await png(icon,`icons/app-icon-${size}.png`,size);
  await png(inverse,'icons/app-icon-inverse-1024.png',1024);
  await png(icon,'icons/apple-touch-icon.png',180);
  // Mark occupies ~53% of adaptive foreground: contained in the central safe circle.
  const foreground = svg(108,108,'Poduna',nest(recolor(symbol,ivory),1254,14,14,80));
  write('icons/android-foreground.svg',foreground);
  await png(foreground,'icons/android-foreground-432.png',432);
  const favicon = svg(32,32,'Poduna',small);
  write('icons/favicon.svg',favicon);
  write('icons/favicon-ivory.svg',svg(32,32,'Poduna',recolor(small,ivory)));
  const icoImages=[];
  for (const size of [16,32,48]) {
    // Opaque ivory tile provides dependable contrast in both light/dark browser chrome.
    const tile=svg(32,32,'Poduna',small,ivory);
    await png(tile,`icons/favicon-${size}.png`,size);
    icoImages.push({size,data:fs.readFileSync(path.join(root,`icons/favicon-${size}.png`))});
  }
  write('icons/favicon.ico',ico(icoImages));
  const text=(x,y,size,content,color=green)=>`<text x="${x}" y="${y}" font-family="Fira Sans, sans-serif" font-size="${size}" fill="${color}">${content}</text>`;
  const embed=(p,x,y,w,h=w)=>`<image x="${x}" y="${y}" width="${w}" height="${h}" href="data:image/png;base64,${fs.readFileSync(path.join(root,p)).toString('base64')}"/>`;
  let board = text(64,74,18,'PODUNA / IDENTITÉ VISUELLE — V1')+text(64,128,38,'Le panier choisi, redessiné en vectoriel.');
  board += `<rect x="64" y="176" width="500" height="474" rx="24" fill="white"/>`+nest(symbol,1254,75,180,474);
  board += `<rect x="588" y="176" width="548" height="474" rx="24" fill="${green}"/>`+embed('png/poduna-logo-ivory-1720.png',618,258,488,148)+text(626,608,16,'LOGO HORIZONTAL · LETTRAGE VECTORISÉ',ivory);
  board += text(64,700,23,'Applications')+embed('icons/app-icon-256.png',64,724,152)+embed('icons/app-icon-inverse-1024.png',244,724,152);
  board += text(64,908,15,'Icône claire')+text(244,908,15,'Icône inversée');
  board += text(458,753,18,'Favicons à taille réelle');
  for(const [i,size] of [16,32,48].entries()) board += embed(`icons/favicon-${size}.png`,458+i*94,788,size)+text(458+i*94,861,14,`${size} px`);
  board += text(828,753,18,'Palette Origine')+`<rect x="828" y="776" width="128" height="62" rx="8" fill="${green}"/><rect x="976" y="776" width="128" height="62" rx="8" fill="${ivory}" stroke="#d7ded5"/>`+text(828,866,16,'#245C46')+text(976,866,16,'#FAF8F3');
  board += text(64,977,16,'Tressage complet pour le logo · variante optique simplifiée pour les petites tailles.')+text(64,1006,14,'Préparation uniquement : aucun changement dans le site ou l’application.');
  const boardSvg=svg(1200,1050,'Poduna — planche de présentation',board,ivory);
  write('preview/brand-board.svg',boardSvg); await png(boardSvg,'preview/brand-board.png',1200);
  let qa = text(28,40,22,'Contrôle des petites tailles — pixels réels puis × 6 sans lissage');
  let x=28;
  for(const size of [16,24,32,48,64]) {
    const full = await sharp(Buffer.from(svg(1254,1254,'Poduna',symbol,ivory))).resize(size).png().toBuffer();
    const opt = await sharp(Buffer.from(svg(32,32,'Poduna',small,ivory))).resize(size).png().toBuffer();
    for(const [j,b] of [full,opt].entries()) {
      const zoom=await sharp(b).resize(size*6,size*6,{kernel:'nearest'}).png().toBuffer();
      qa += `<image x="${x}" y="${80+j*470}" width="${size}" height="${size}" href="data:image/png;base64,${b.toString('base64')}"/><image x="${x}" y="${170+j*470}" width="${size*6}" height="${size*6}" href="data:image/png;base64,${zoom.toString('base64')}"/>`;
    }
    qa+=text(x,65,16,`${size} px`); x+=size*6+28;
  }
  const qaSvg=svg(x,1070,'Contrôle du logo complet et du favicon',qa,'#ffffff');
  write('preview/small-sizes.svg',qaSvg); await png(qaSvg,'preview/small-sizes.png',x);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
