# Corner Kikudes

Plataforma de la liga privada de eFootball de un grupo de amigos. Un solo archivo React
(`src/App.jsx`) que se ejecuta sin backend.

## Cómo funciona

- **Sin servidor.** Todo se guarda en `window.storage`, un API de cuatro métodos que en
  local emula `src/storage.js` sobre `localStorage`.
- **Carga inicial de datos.** `src/seed.js` lee `public/data.json` (el export de la app) al
  arrancar y lo vuelca en `localStorage` una sola vez por navegador, fusionando por id si ya
  había datos. Es el puente desde el artefacto de Claude.ai: no lo quites ni cambies el
  formato del export sin actualizarlo.
- **`src/main.jsx` no usa `await` a nivel de módulo**: el build de producción no lo admite.
- **Todo se deriva.** Campeones, rankings, medallas, tiers y premios se calculan de los
  resultados. Si algo se puede calcular, se calcula: no hay estado duplicado.
- **Un solo archivo a propósito.** Se despliega también como HTML autocontenido para
  repartirlo. **No lo dividas sin preguntar antes.**

## Secciones

Inicio · Equipos · Torneo · Liga · Temporadas · Stats · Ranking · Jugadores · Reglas · Meta Lab ↗

Meta Lab es otra app (JS sin compilar) en `../lab/` del repo; en el sitio publicado está en `./lab/`.
El botón sólo navega allí: no hay datos compartidos entre las dos apps.

## Datos incrustados

- `PLAYER_DB` — 586 jugadores de OCR sobre 624 capturas.
  `{n, a: partidos, r: nota media, b: mejor, m: MVPs, p: posición,
    c: [[club, partidos ahí, nota ahí, MVPs ahí]]}`. Los de `a: 0` son de catálogo.
- `CLUB_CRESTS` — escudos en base64, casi la mitad del peso del archivo.
- `DEFAULT_RULES` — el reglamento.

## Reglas de la liga

- Clubes variables (8 ó 9 normalmente), 3 vueltas, **3 jornadas por semana**. Con número
  impar cada club descansa una jornada por vuelta (`roundRobinRounds` mete un `null`).
- **Los asientos del draft son los clubes de la liga**: añadir o quitar uno en el draft pasa
  por `applyLeagueChange`, que regenera el calendario y vuelve a casar los resultados por
  (par de clubes, vuelta) con `remapLeagueResults`. Nunca borrar `league-results` al
  reconfigurar. Un club con partidos jugados no se puede quitar.
- Plantel de **23**: 1 franquicia + 22 rondas de draft en serpiente, más 1 baneo.
- Torneos por doble eliminación o **escalera coreana**, agrupados en Temporadas.
- **Cronología**: Primera → Segunda → … → Séptima; dentro, Primero → Segundo → Tercero → Cuarto.
- **Desde la Séptima** cada "parte" es un proceso de dos cosas que dan puntos: la liga y
  un Kikudes. Ambos suman al power ranking, cuya ventana es de **4 procesos**, no de 4
  registros. Una liga guardada con temporada y parte se convierte en un registro
  (`kind: "league"`) vía `leagueAsRecords()` y entra en la misma tubería que los torneos.
- **La liga no tiene playoffs.** Se quitaron a propósito (formato oro/plata, eliminación
  simple, tercer puesto, preview, botón de crear): no reintroducirlos. Los únicos formatos
  de cuadro son doble eliminación y escalera coreana.

## Distinciones (no inventar otras)

- `OG_CLUBS` — Torre del Grecco, Nelapoltsk, DVP. Sello negro y oro, no se gana jugando.
- `FOUNDING_MEMBERS` — los cinco fundadores. **No uses el flag `founding` de los datos.**
- `CURRENT_PRESIDENT` — DVP. Nelapoltsk es ex presidente.
- **Grand Slam**: grupo + cuadro de ganadores + final, en el mismo torneo.
- **Golden Road**: los cuatro Kikudes de una temporada.

## Varias ligas

- Cada liga tiene `leagueId` en `league-config`; las guardadas antes de que existiera reciben
  uno derivado de su configuración (`legacyLeagueId`), así que coinciden con su snapshot.
- **Nueva liga** archiva la actual entera (snapshot en `league-archive`) y deja resultados,
  draft, traspasos y playoff a cero con un id nuevo.
- `collectMatches` y `collectManualMvps` reciben las ligas archivadas y añaden sus partidos
  con su propio calendario (`leagueScheduleFor(rec.config)`), saltando la que tenga el mismo
  id que la actual y quedándose con la copia más reciente de cada liga
  (`distinctArchivedLeagues`). Nunca leer `LEAGUE_SCHEDULE` para una liga archivada.

## Dos fuentes de datos que NO se mezclan

- **OCR de Discord** → sólo notas de jugador y MVPs de la base.
- **Entrada manual** → resultados, y los **premios MVP** salen sólo de aquí.

No existen goles por jugador, asistencias ni alineaciones: **no propongas** Bota de Oro,
máximo goleador ni Mejor XI por goles.

## Convenciones

- **Nada de clases Tailwind arbitrarias** (`text-[0.65rem]`). No hay compilador en el build
  del artefacto y fallan en silencio. Usa `style={{ fontSize: ... }}`.
- **Nada de `localStorage` directo** en `App.jsx`; todo por `window.storage`, y SIEMPRE a
  través de `loadKey`/`saveKey`/`withRetry`: el storage del artefacto tiene límite de tasa
  ("Message rate limit exceeded"), las llamadas van en cola con espaciado y reintento.
- **Una lectura fallida nunca es "vacío"**: `loadKey` lanza `StorageError` cuando el límite
  se agota, para que ningún leer-modificar-escribir pise datos que no llegó a leer. Toda
  operación que escribe tras leer captura ese error y lo enseña.
- **No consultar el storage en cada tecleo**: los efectos que recalculan estado leen una vez
  y luego trabajan con lo que tienen en memoria (ver `LeagueSaveBar`).
- **Componentes siempre a nivel de módulo**, nunca dentro de otro: un componente anidado es
  un tipo nuevo en cada render y React desmonta el input, perdiendo el foco. Ya pasó dos
  veces. Si necesitas algo local, usa una función `renderX()`.
- Los cálculos caros van por `cachedStandings()` y `cachedMatches()`.

## Comprobaciones antes de dar algo por bueno

```bash
npm run build
grep -o 'className="[^"]*"' src/App.jsx | grep -o '[a-z-]*\[[^]]*\]'   # vacío = bien
```
