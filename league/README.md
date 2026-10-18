# Corner Kikudes — proyecto para Claude Code

La misma app que corre en el artefacto de Claude.ai, como proyecto Vite + React que corre en
tu máquina y se edita con Claude Code.

## 1. Requisitos

- Node.js 18 o más nuevo (`node -v` para comprobarlo).
- Claude Code instalado (`npm install -g @anthropic-ai/claude-code`).

## 2. Primera vez

```bash
# descomprime el zip en una carpeta y entra en ella
npm install
npm run dev
```

Abre `http://localhost:5173`. La app arranca **vacía** hasta que le des tus datos (paso 3).

## 3. Traer tus datos — sin perder nada

Tus torneos, ligas, draft, traspasos y jugadores viven en el navegador donde usas el
artefacto. Para pasarlos:

1. En el artefacto (o en la página de GitHub): botón **Datos → Descargar**. Se baja un archivo
   `corner-kikudes-AAAA-MM-DD.json`.
2. Renómbralo a `data.json` y cópialo dentro de la carpeta `public/` de este proyecto.
3. Recarga `http://localhost:5173`.

Eso es todo. La app lee `public/data.json` al arrancar y carga todo en el navegador local.
Se aplica una sola vez (recuerda la fecha del archivo); después, lo que metas en local se
guarda en local y el archivo no lo pisa. Si algún día reemplazas `data.json` por uno más
nuevo, se fusiona encima sin borrar lo que hayas añadido.

**Comprueba que no falta nada:** entra en Temporadas, Liga → Archivo y Jugadores y compara con
el artefacto. Si algo falta, repite el paso 1 — el export siempre lleva todo.

Mientras tanto, el artefacto sigue intacto: esto es una copia, no una mudanza. Puedes seguir
usándolo hasta que el local te convenza.

## 4. Trabajar con Claude Code

```bash
claude
```

desde la carpeta del proyecto. `CLAUDE.md` le cuenta cómo está hecho, las reglas de la liga y
lo que no debe tocar. Un buen primer encargo: *"lee CLAUDE.md y dime qué entiendes del
proyecto"*.

El código es un solo archivo, `src/App.jsx`. Es grande a propósito (se despliega también como
HTML autocontenido); no lo dividas sin preguntarle a Claude Code por las implicaciones.

## 5. Publicar

```bash
npm run build
```

deja la app lista en `dist/`. Para GitHub Pages: sube el contenido de `dist/` **y** tu
`data.json` dentro (queda en `dist/data.json`). El `base: "./"` de `vite.config.js` hace
que funcione desde cualquier carpeta o repositorio.

## 6. Dónde se guardan los datos en local

En `localStorage` del navegador, bajo claves `kikudes:shared:*`. `src/storage.js` emula
el `window.storage` del artefacto. Si algún día quieres un backend real (varios usuarios con
los mismos datos), ese archivo es el único que cambia. Mientras tanto, **Datos → Descargar**
es tu copia de seguridad: hazla de vez en cuando.
