import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:5000", changeOrigin: true } },
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        // Librerie in file separati: cambiano di rado, quindi dopo un deploy il browser
        // riscarica solo il codice dell'app e tiene in cache questi
        manualChunks: {
          react:  ["react", "react-dom", "react-router-dom"],
          query:  ["@tanstack/react-query", "axios", "zustand"],
        },
      },
    },
  },
});
