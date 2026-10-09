// بناء الواجهة: esbuild للـ TS/React + Tailwind v4 (عبر واجهته البرمجية) → web/dist
import { build } from 'esbuild';
import { compile } from 'tailwindcss';
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync, copyFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname);
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'assets'), { recursive: true });

// 1) JS
const res = await build({
  entryPoints: [join(root, 'src/main.tsx')], bundle: true, minify: true, format: 'esm', target: 'es2020', sourcemap: false,
  outfile: join(dist, 'assets/app.js'), define: { 'process.env.NODE_ENV': '"production"' }, jsx: 'automatic', metafile: false, logLevel: 'warning',
});

// 2) Tailwind
const req = createRequire(import.meta.url);
const twDir = dirname(req.resolve('tailwindcss/package.json'));
const input = readFileSync(join(root, 'src/styles.css'), 'utf8');
const compiler = await compile(input, {
  base: root,
  loadStylesheet: async (id, base) => {
    const path = id === 'tailwindcss' ? join(twDir, 'index.css') : id.startsWith('tailwindcss/') ? join(twDir, id.slice(12) + (id.endsWith('.css') ? '' : '.css')) : resolve(base, id);
    return { path, base: dirname(path), content: readFileSync(path, 'utf8') };
  },
});
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.(tsx?|html)$/.test(f) && files.push(p); } })(join(root, 'src'));
files.push(join(root, 'index.html'));
const cands = new Set();
for (const f of files) for (const t of readFileSync(f, 'utf8').split(/[\s"'`<>={}()\[\],;]+/)) if (t) cands.add(t);
// الأصناف ذات الأقواس المربعة تحتاج معالجة خاصة
for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/[\w:-]+\[[^\]\s]+\]/g)) cands.add(m[0]);
const css = compiler.build([...cands]);
writeFileSync(join(dist, 'assets/app.css'), css.replace(/\/\*[\s\S]*?\*\//g, ''));

// 3) HTML + ملفات ثابتة (مع بصمة للإصدار)
const h = (f) => createHash('sha1').update(readFileSync(join(dist, 'assets', f))).digest('hex').slice(0, 8);
let html = readFileSync(join(root, 'index.html'), 'utf8');
html = html.replace('/assets/app.css', `/assets/app.css?v=${h('app.css')}`).replace('/assets/app.js', `/assets/app.js?v=${h('app.js')}`);
writeFileSync(join(dist, 'index.html'), html);
const pub = join(root, 'public');
if (existsSync(pub)) for (const f of readdirSync(pub)) copyFileSync(join(pub, f), join(dist, f));
console.log('built web/dist:', files.length, 'source files,', cands.size, 'candidates');
