// Zkopíruje hru (o složku výš) do www/, odkud ji Capacitor zabalí do APK.
import { cpSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const root = join(import.meta.dirname, '..'), out = join(import.meta.dirname, 'www');
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const f of readdirSync(root)) if (f.endsWith('.js') || f === 'index.html') cpSync(join(root, f), join(out, f));
for (const d of ['assets', 'vendor']) cpSync(join(root, d), join(out, d), { recursive: true });
console.log('www/ připraveno:', readdirSync(out).join(', '));
