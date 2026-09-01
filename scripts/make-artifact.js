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

// charset は Artifact 側が付けるので落とす
const cleanHead = head.replace(/<meta\s+charset[^>]*>\s*/i, "").trim();

writeFileSync(outPath, `${cleanHead}\n\n${body.trim()}\n`, "utf-8");

const kb = (readFileSync(outPath).length / 1024).toFixed(1);
console.log(`Artifact用に書き出したよ → dist/griffon.html (${kb} kB)`);
