const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const root = __dirname;
const file = p => path.join(root,p);
async function main() {
  let checks=0;
  for (const name of fs.readdirSync(file('svg'))) {
    const content=fs.readFileSync(file(`svg/${name}`),'utf8');
    assert(!/<(?:image|text|script)\b/.test(content),`${name}: must contain only native vector shapes`);
    await sharp(Buffer.from(content)).png().toBuffer(); checks++;
  }
  for(const [p,w,h] of [
    ['icons/app-icon-1024.png',1024,1024],['icons/app-icon-512.png',512,512],
    ['icons/app-icon-256.png',256,256],['icons/apple-touch-icon.png',180,180],
    ['icons/app-icon-inverse-1024.png',1024,1024],
    ['icons/favicon-16.png',16,16],['icons/favicon-32.png',32,32],['icons/favicon-48.png',48,48]
  ]) {
    const meta=await sharp(file(p)).metadata();
    assert.equal(meta.width,w);assert.equal(meta.height,h);
    const {data}=await sharp(file(p)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    for(let i=3;i<data.length;i+=4) assert.equal(data[i],255,`${p}: opaque background required`);
    checks++;
  }
  const {data:mark,info}=await sharp(file('png/poduna-symbol-green-1024.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const alpha=(x,y)=>mark[(y*info.width+x)*4+3];
  assert.equal(alpha(0,0),0);assert.equal(alpha(512,320),0);assert.equal(alpha(512,450),0);
  assert.equal(alpha(512,165),255);checks++;
  const fg=await sharp(file('icons/android-foreground-432.png')).ensureAlpha().raw().toBuffer();
  let radius=0;
  for(let y=0;y<432;y++)for(let x=0;x<432;x++)if(fg[(y*432+x)*4+3]>16)radius=Math.max(radius,Math.hypot(x+.5-216,y+.5-216));
  assert(radius<=132,`Foreground outside central 66/108 safe circle: ${radius}`);checks++;
  const ico=fs.readFileSync(file('icons/favicon.ico'));
  assert.equal(ico.readUInt16LE(2),1);assert.equal(ico.readUInt16LE(4),3);
  for(let i=0;i<3;i++){
    const p=6+i*16,size=[16,32,48][i];
    assert.equal(ico[p],size);assert.equal(ico[p+1],size);
    const bytes=ico.readUInt32LE(p+8),offset=ico.readUInt32LE(p+12);
    assert(offset+bytes<=ico.length);
    const m=await sharp(ico.subarray(offset,offset+bytes)).metadata();
    assert.equal(m.width,size);checks++;
  }
  console.log(`${checks} checks passed: vectors, dimensions, alpha, ICO, adaptive foreground (radius ${radius.toFixed(1)}/132 px).`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
