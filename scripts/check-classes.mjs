/**
 * Static check: JS/HTML mein jo CSS class likhi hai, wo styles.css mein define honi chahiye.
 *
 * Kyun: ek baar refactor mein views ne nayi class names (habit-check, week-day...) emit kiye
 * jinki CSS thi hi nahi. Tick button unstyled/invisible ho gaya, aur 49 Firestore-rules tests
 * isse kuch nahi pakad sakte (wo UI nahi dekhte). Ye script wahi galti `npm test` mein pakadti hai.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const css = readFileSync('src/styles.css', 'utf8');
const defined = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));

const files = [...walk('src').filter((f) => f.endsWith('.js')), 'index.html'];
const missing = new Map();

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/class="([^"]*)"/g)) {
    let attr = m[1];
    // ${ cond ? ' done' : '' } ke andar ke quoted tokens bhi classes hain
    const inner = [...attr.matchAll(/\$\{([^}]*)\}/g)].flatMap((x) =>
      [...x[1].matchAll(/['`]([^'`$]*)['`]/g)].map((y) => y[1])
    );
    attr = attr.replace(/\$\{[^}]*\}/g, ' ');
    for (const tok of [...attr.split(/\s+/), ...inner.flatMap((t) => t.split(/\s+/))]) {
      if (!/^[a-z][a-z0-9-]*$/.test(tok) || tok.endsWith('-')) continue;
      if (!defined.has(tok)) (missing.get(tok) ?? missing.set(tok, new Set()).get(tok)).add(file);
    }
  }
}

if (missing.size) {
  console.error('❌ Ye CSS classes use hui hain par src/styles.css mein define nahi:\n');
  for (const [c, f] of missing) console.error(`  .${c}   ← ${[...f].join(', ')}`);
  process.exit(1);
}
console.log(`✅ CSS class check: ${files.length} files, sab classes defined.`);
