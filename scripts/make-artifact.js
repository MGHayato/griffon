/**
 * dist/index.html（ふつうの1枚HTML）から、Artifact公開用の dist/griffon.html を作る。
 *
 * Artifact は <!DOCTYPE>/<html>/<head>/<body> を自前で付けるので、
 * こちらは中身だけを渡す必要がある。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcPath = resolve(root, "dist/index.html");
const outPath = resolve(root, "dist/griffon.html");

const html = readFileSync(srcPath, "utf-8");

const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1];
const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1];

if (!head || !body) {
  console.error("dist/index.html の <head> / <body> が読み取れなかったよ。");
  process.exit(1);
}

// head と body をつないでから、要らないものを まとめて取り除く。
// （PWA用のタグは head と body の どちらに出るか ビルド次第なので、
//   場所を決めうちにせず 全体から消す）
let out = `${head.trim()}\n\n${body.trim()}`;

const strip = [
  // charset は Artifact 側が付ける
  [/<meta\s+charset[^>]*>\s*/gi, "charset"],
  // PWA まわりは Artifact には置けない（manifest も sw も配信されない）。
  // 参照が残ると 404 になるので 取り除く。
  [/<link[^>]*manifest\.webmanifest[^>]*>\s*/gi, "manifest"],
  [/<link[^>]*apple-touch-icon[^>]*>\s*/gi, "apple-touch-icon"],
  [/<meta[^>]*name=["']theme-color["'][^>]*>\s*/gi, "theme-color"],
  [/<script[^>]*(?:registerSW\.js|pwa:register-sw)[^>]*>[\s\S]*?<\/script>\s*/gi, "Service Worker登録"],
];

const removed = [];
for (const [re, label] of strip) {
  if (re.test(out)) removed.push(label);
  out = out.replace(re, "");
}

writeFileSync(outPath, out.trim() + "\n", "utf-8");

// 消し残しがないか 見張る（Artifactで404を出さないため）
const leftovers = ["manifest.webmanifest", "registerSW", "apple-touch-icon"]
  .filter((w) => out.includes(w));

const kb = (readFileSync(outPath).length / 1024).toFixed(1);
console.log(`Artifact用に書き出したよ → dist/griffon.html (${kb} kB)`);
if (removed.length) console.log(`  取り除いた: ${removed.join(" / ")}`);
if (leftovers.length) {
  console.error(`  消し残しがある: ${leftovers.join(" / ")}`);
  process.exit(1);
}
