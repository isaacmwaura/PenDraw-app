import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const out = path.resolve('licenses');
fs.mkdirSync(out, {recursive: true});
const rows = [];
function collect(dir, label, license) {
  const dest = path.join(out, label.replace(/[^a-zA-Z0-9._-]/g, '_'));
  fs.mkdirSync(dest, {recursive: true});
  let count = 0;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.isFile() && /^(licen[cs]e|copying|notice|copyright)([._-]|$)/i.test(entry.name)) {
      fs.copyFileSync(path.join(dir, entry.name), path.join(dest, entry.name));
      count++;
    }
  }
  rows.push(`| ${label} | ${String(license || 'See upstream').replaceAll('|', '/')} | ${count ? `licenses/${path.basename(dest)}/` : 'Consult upstream package'} |`);
}
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
for (const [key, p] of Object.entries(lock.packages)) {
  if (!key.includes('node_modules/') || p.link || p.dev) continue;
  const dir = path.resolve(key);
  if (!fs.existsSync(path.join(dir, 'package.json'))) continue;
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  collect(dir, `${manifest.name}@${manifest.version}`, manifest.license || p.license);
}
if (process.env.CARGO_TARGET_DIR) {
  const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--locked', '--format-version', '1', '--manifest-path', 'apps/pendraw/src-tauri/Cargo.toml'], {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024}));
  for (const p of metadata.packages) {
    if (!p.source) continue;
    collect(path.dirname(p.manifest_path), `${p.name}@${p.version}`, p.license);
  }
}
fs.writeFileSync('THIRD_PARTY_NOTICES.md', '# Third-party notices\n\nPenDraw is based on the MIT-licensed Excalidraw engine. Dependencies retain their own licenses. The accompanying licenses directory contains upstream notice and license files. This inventory includes production JavaScript packages and, for a native build, the resolved Rust dependencies.\n\n| Package | Declared license | Notices |\n|---|---|---|\n' + rows.sort().join('\n') + '\n');
