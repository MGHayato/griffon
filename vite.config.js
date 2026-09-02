import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // GitHub Pages は https://<ユーザー名>.github.io/griffon/ の下に置かれる。
  // "./" にしておくと どこに置かれても 相対で解決できる（Capacitor でも そのまま使える）。
  base: "./",

  plugins: [
    // ホーム画面に追加できるようにする（PWA）。
    // 対応していないブラウザでは まるごと無視されるので、
    // ふつうのWebページとしての 遊び心地は 何も変わらない。
    VitePWA({
      registerType: "autoUpdate",     // 新しい版を出したら 自動で入れ替える
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "グリフォン",
        short_name: "グリフォン",     // ホーム画面のアイコンの下に出る名前
        description: "3レーンの陣形で戦うカードバトルゲーム",
        lang: "ja",
        start_url: "./",
        scope: "./",
        display: "fullscreen",        // アドレスバーもタブも出さない
        orientation: "portrait",      // たて画面に固定
        background_color: "#04081a",  // 起動直後の画面の色（ゲームの一番奥の闇）
        theme_color: "#101c42",       // OSのバーの色（ウィンドウの濃紺）
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          // Androidは アイコンを 丸や角丸に 切り抜く。
          // maskable は そのぶんの余白を 足してある版。
          { src: "icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // 1ファイル構成なので、拾うのは HTML・アイコン・manifest だけでよい
        globPatterns: ["**/*.{html,png,svg,ico,webmanifest}"],
        // Artifact用の切り出しファイルは アプリには要らない
        globIgnores: ["griffon.html"],
        navigateFallback: "index.html",
      },
      devOptions: { enabled: false },  // 開発中は 邪魔なので切る
    }),

    // ビルドすると dist/index.html に 全部インラインで 出力される。
    // それを 1ファイルとして Artifact に出したり、Capacitor に渡したりする。
    // ※ PWAプラグインより後ろに置くこと（先に manifest を作らせるため）
    viteSingleFile(),
  ],

  build: {
    outDir: "dist",
    emptyOutDir: true,
    // 1ファイル化のため 分割しない
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },

  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
  },
});
