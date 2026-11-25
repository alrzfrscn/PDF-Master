import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  build: {
    // Windows 10/11 still ship WebView2 runtimes from the Edge 109 era; newer
    // syntax in the bundle throws before React mounts and leaves a blank window.
    target: "chrome109",
    // The stamp catalogue is a single synchronous JSON payload (569 kB, 59 kB gzip); it is split
    // from the app code but cannot be split further without lazy-loading stamp lookup everywhere.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("pdfjs-dist")) return "pdfjs";
            if (id.includes("pdf-lib")) return "pdf-lib";
            if (id.includes("katex")) return "katex";
            if (id.includes("lucide-react")) return "icons";
            if (id.includes("react")) return "react";
            return "vendor";
          }
          if (/[\\/]src[\\/]lib[\\/]data\.ts$/.test(id)) return "stamp-data";
          return undefined;
        },
      },
    },
  },
});
