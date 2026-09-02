/**
 * public/icon-512.png から、PWAに必要な アイコンを 作る。
 *
 *   icon-192.png       ふつうのアイコン（小さいサイズ用）
 *   icon-maskable.png  Android用。まわりを丸く切られても
 *                      絵が欠けないように、余白を足して 中央に縮めたもの
 *   apple-touch-icon.png  iPhoneのホーム画面用（180px）
 *
 * つかいかた: npm run icons
 */
import sharp from "sharp";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "public/icon-512.png");

if (!existsSync(src)) {
  console.error("public/icon-512.png が 見つからないよ。");
  process.exit(1);
}

// 背景の色（元絵の 左上の色を 使って、余白を なじませる）
const { dominant } = await sharp(src).stats();
const bg = { r: dominant.r, g: dominant.g, b: dominant.b, alpha: 1 };

// ① 192px
await sharp(src).resize(192, 192).png().toFile(resolve(root, "public/icon-192.png"));

// ② maskable（安全地帯に収めるため 中央 80% に縮めて、まわりを 背景色で埋める）
const inner = Math.round(512 * 0.8);
await sharp(src)
  .resize(inner, inner)
  .extend({
    top: (512 - inner) / 2, bottom: (512 - inner) / 2,
    left: (512 - inner) / 2, right: (512 - inner) / 2,
    background: bg,
  })
  .png()
  .toFile(resolve(root, "public/icon-maskable.png"));

// ③ iPhone のホーム画面用
await sharp(src).resize(180, 180).png().toFile(resolve(root, "public/apple-touch-icon.png"));

console.log(`アイコンを 作ったよ（背景色 rgb(${bg.r},${bg.g},${bg.b}) で なじませた）`);
console.log("  public/icon-192.png");
console.log("  public/icon-maskable.png");
console.log("  public/apple-touch-icon.png");
