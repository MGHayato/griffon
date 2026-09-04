/**
 * art/ に おいた 絵を ゲームに 取りこむ。
 *
 *   art/dragon.png  →  ドラゴンの 絵に なる
 *
 * カードの id と おなじ名前の png（jpg / webp / svg でも いい）を
 * おくだけ。おいていない カードは 絵文字の まま。
 *
 *   npm run art            取りこむ
 *   npm run art -- --list  id の 一覧を 出す
 *
 * 絵は src/core/art.js に data URI として 書きこまれる。
 * ゲームは 1ファイルで 配るので、絵も その中に 入る。
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const ART  = join(ROOT, "art");
const OUT  = join(ROOT, "src", "core", "art.js");

const MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

const { CARDS } = await import("../src/core/cards.js");

// --- 一覧を 出すだけ ---
if (process.argv.includes("--list")) {
  const label = { unit: "ユニット", spell: "とくぎ", item: "どうぐ" };
  for (const kind of ["unit", "spell", "item"]) {
    const group = CARDS.filter(c => c.type === kind);
    console.log(`\n--- ${label[kind]}（${group.length}種）---`);
    for (const c of group) {
      const has = findFile(c.id);
      console.log(`  ${has ? "●" : "○"} ${(c.id + ".png").padEnd(18)} ${c.name}`);
    }
  }
  console.log("\n  ● 絵あり   ○ まだ 絵文字\n");
  process.exit(0);
}

/** その id の 絵が あるか さがす（拡張子は 何でもいい） */
function findFile(id) {
  if (!existsSync(ART)) return null;
  for (const f of readdirSync(ART)) {
    const ext = extname(f).toLowerCase();
    if (!MIME[ext]) continue;
    if (basename(f, extname(f)) === id) return join(ART, f);
  }
  return null;
}

const known = new Set(CARDS.map(c => c.id));
const found = [];
const strays = [];
let bytes = 0;

for (const c of CARDS) {
  const file = findFile(c.id);
  if (!file) continue;
  const ext = extname(file).toLowerCase();
  const data = readFileSync(file);
  bytes += data.length;
  found.push({ id: c.id, name: c.name, kb: data.length / 1024,
               uri: `data:${MIME[ext]};base64,${data.toString("base64")}` });
}

// カードに ひもづかない ファイルは 書きまちがい かもしれない
if (existsSync(ART)) {
  for (const f of readdirSync(ART)) {
    const ext = extname(f).toLowerCase();
    if (!MIME[ext]) continue;
    if (!known.has(basename(f, extname(f)))) strays.push(f);
  }
}

const lines = [
  "/* =========================================================",
  "   カードの 絵",
  "   art/ に おいた 画像から scripts/make-art.js が 作る。",
  "   直に なおさず、art/ に 絵を おいて `npm run art` を 走らせる。",
  "   ここに 無い カードは 絵文字の まま 出る。",
  "   ========================================================= */",
  "",
  "export const ART = {",
  ...found.map(a => `  // ${a.name}（${a.kb.toFixed(1)}KB）\n  ${a.id}: "${a.uri}",`),
  "};",
  "",
];
writeFileSync(OUT, lines.join("\n"), "utf8");

console.log(`\n絵を ${found.length}枚 取りこんだよ（ぜんぶで ${(bytes / 1024).toFixed(0)}KB）`);
if (found.length) {
  for (const a of found) console.log(`  ${a.name}  ${a.kb.toFixed(1)}KB`);
}
if (!found.length) {
  console.log("  art/ に カードの id と おなじ名前で png を おいてね。");
  console.log("  id の 一覧は  npm run art -- --list");
}
if (strays.length) {
  console.log(`\nつかわれていない ファイル（id が ちがうかも）:`);
  for (const f of strays) console.log(`  ${f}`);
}
if (bytes > 600 * 1024) {
  console.log(`\n※ 絵の 合計が ${(bytes / 1024).toFixed(0)}KB。`);
  console.log("  すこし 重いので、小さくするか まとめかたを 変えると いいかも。");
}
console.log("");
