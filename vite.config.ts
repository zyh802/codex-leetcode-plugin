import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  root: "ui",
  plugins: [viteSingleFile()],
  build: {
    outDir: "../dist/ui",
    emptyOutDir: false,
    rollupOptions: {
      input: "catalog.html",
    },
  },
});
