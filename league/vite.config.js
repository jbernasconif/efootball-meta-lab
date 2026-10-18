import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// `base: "./"` hace que el build funcione abriéndolo desde cualquier carpeta o en GitHub
// Pages sin tener que saber el nombre del repositorio.
export default defineConfig({ plugins: [react()], base: "./", build: { outDir: "dist" } });
