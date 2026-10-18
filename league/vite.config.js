import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Sólo en `npm run dev`: los botones "Guardar en el proyecto" / "Guardar y publicar" de Datos mandan
// el export aquí. Se guarda con tools/publish_league.py (le quita el PIN y escribe public/data.json);
// "publicar" además hace commit y push. No existe en el sitio publicado.
const REPO = resolve(__dirname, "..");
const PY = process.env.PYTHON || join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python312", "python.exe");

function saveLeaguePlugin() {
  return {
    name: "save-league",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== "POST" || !["/__league/save", "/__league/publish"].includes(req.url)) return next();
        const send = (status, message) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ message }));
        };
        let body = "";
        for await (const chunk of req) body += chunk;
        let payload;
        try { payload = JSON.parse(body); } catch { return send(400, "Not valid JSON."); }
        if (payload?.app !== "corner-kikudes" || typeof payload.data !== "object") return send(400, "Not a Corner Kikudes export.");
        const file = join(mkdtempSync(join(tmpdir(), "kikudes-")), "export.json");
        writeFileSync(file, body, "utf8");
        const args = ["tools/publish_league.py", file, "--yes", ...(req.url.endsWith("publish") ? ["--push"] : [])];
        const p = spawn(PY, args, { cwd: REPO, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
        let out = "";
        p.stdout.on("data", (d) => (out += d));
        p.stderr.on("data", (d) => (out += d));
        p.on("error", (e) => send(500, `Could not run Python: ${e.message}`));
        p.on("close", (code) => {
          const last = out.trim().split(/\r?\n/).slice(-2).join(" ");
          send(code === 0 ? 200 : 500, code === 0 ? `Saved to league/public/data.json. ${last}` : `Error: ${last}`);
        });
      });
    },
  };
}

// `base: "./"` hace que el build funcione abriéndolo desde cualquier carpeta o en GitHub
// Pages sin tener que saber el nombre del repositorio.
export default defineConfig({ plugins: [react(), saveLeaguePlugin()], base: "./", build: { outDir: "dist" } });
