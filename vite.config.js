import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
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
