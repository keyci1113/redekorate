import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy: {
    "/api": { target: "http://localhost:4000", changeOrigin: false },
    "/uploads": { target: "http://localhost:4000", changeOrigin: false },  // imágenes subidas
    "/proto-tracker.js": { target: "http://localhost:4000", changeOrigin: false },  // script que cargan los prototipos HTML
  } },
});
