// Generated assets inside the backend Docker context. Edit web originals, then sync.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const mappings = [['styles.css','styles.css'],['contact.css','contact.css'],['aide.css','aide.css'],['assets/brand/logo.svg','logo.svg'],['assets/brand/favicon.ico','favicon.ico']];
for (const [source,target] of mappings) {
  const data = await readFile(new URL(`../dist/${source}`,import.meta.url));
  const out = new URL(`../../backend/public/${target}`,import.meta.url);
  if (process.argv.includes('--check')) {
    if (!data.equals(await readFile(out))) throw new Error(`Public asset out of date: ${target}`);
  } else { await mkdir(new URL('../../backend/public/',import.meta.url),{recursive:true}); await writeFile(out,data); }
}
// Backend contact is not a second download site: avoid a broken homepage link.
const guide = (await readFile(new URL('../dist/aide-android.html',import.meta.url),'utf8'))
  .replaceAll('href="/index.html"','href="/contact.html"').replace('Poduna, accueil','Poduna, contact').replace('>L’application</a>','>Contact de test</a>');
const out = new URL('../../backend/public/aide-android.html',import.meta.url);
if (process.argv.includes('--check')) { if (await readFile(out,'utf8') !== guide) throw new Error('Guide out of date'); }
else await writeFile(out,guide);
console.log('Public backend assets synchronized.');
