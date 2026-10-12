import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
// Intentionally pinned to the tested artifact. Never replace it with an unverified build.
const file = 'poduna-0.1.11-preview.apk';
const expected = 'ba9f1406f2df3ba2dfa08ed7f30b12147a80774ffe7f064b21407b7165955654';
const input = fileURLToPath(new URL(`../../artifacts/android/${file}`, import.meta.url));
const output = fileURLToPath(new URL('../dist/downloads/', import.meta.url));
const actual = createHash('sha256').update(await readFile(input)).digest('hex');
if (actual !== expected) throw new Error('APK inattendu : arrêter la préparation et vérifier la version/signature.');
await mkdir(output, { recursive: true });
await copyFile(input, output + file);
await writeFile(output + file + '.sha256', `${actual}  ${file}\n`);
console.log(`Téléchargement préparé : ${file} (SHA-256 vérifié)`);
