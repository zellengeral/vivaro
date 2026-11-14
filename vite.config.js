import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Site web (ptisp): publicado em zellen.pt/vivaro (subpasta).
  // APK Android: o workflow define VITE_BASE="./" para os ficheiros carregarem de dentro da app.
  base: process.env.VITE_BASE || "/vivaro/",
  plugins: [react()],
});
