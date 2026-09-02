import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  // GitHub Pages は https://<ユーザー名>.github.io/griffon/ の下に置かれる。
  // "./" にしておくと どこに置かれても 相対で解決できる（Capacitor でも そのまま使える）。
  base: "./",

  // ビルドすると dist/index.html に 全部インラインで 出力される。
  // それを 1ファイルとして Artifact に出したり、Capacitor に渡したりする。
  plugins: [viteSingleFile()],
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
