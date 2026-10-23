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
        // (Vite 8/rolldown accetta solo la forma a funzione)
        manualChunks(id) {
          if (/node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return "react";
          if (/node_modules[\\/](@tanstack[\\/]react-query|@tanstack[\\/]query-core|axios|zustand)[\\/]/.test(id)) return "query";
        },
      },
    },
  },
});
