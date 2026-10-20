// Lib-mode build: bundles the widget (React included) into one IIFE script +
// one CSS file that any page can include. The dev server config in
// vite.config.js is untouched.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist-widget",
    emptyOutDir: true,
    lib: {
      entry: "src/embed.jsx",
      name: "KyambogoChat",
      formats: ["iife"],
      fileName: () => "kyambogo-chat-widget.js",
    },
    cssFileName: "kyambogo-chat-widget",
  },
});
