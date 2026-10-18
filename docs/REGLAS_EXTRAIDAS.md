# Reglas extraídas: eFootball Skill Mechanics (eFHUB, 17 oct 2026)

Fuente: <https://efhub.com/articles/261017_3-17-october-2026-efootball-s-skill-mechanics-cracked-the-complete-guide>, leído completo el 18 oct 2026.
Fuente de verdad en código: `data/skills.v1.json` y `data/mechanics.v1.json`.

**Advertencia general del artículo:** reproduce trabajo de terceros. Método: análisis estático y ejecución de instrucciones ARM64 en escenarios construidos. **No hubo pruebas de partido completo.** Ninguna regla está validada en partido real.

Niveles de validación usados:
- **A**: documentado y validado con baterías de escenarios construidos.
- **B**: documentado por análisis de código.
- **C**: parcial. Hay parámetros locales documentados, pero el alcance o resultado en partido no está establecido.

## Habilidades (21)

| # | Habilidad (ID interno) | Tipo | Efecto numérico | Condiciones clave | Tope 99 | Nivel | Incertidumbres |
|---|---|---|---|---|---|---|---|
| 01 | Shadow Hunt (SHADOW_GUARDIAN) | Temporal | Vel +3, Acel +3 | CB/LB/RB/DMF; balón suelto tras pase rival; balón detrás; ángulo < 90° hacia campo propio | completo ≤96 | B | modos de movimiento sin mapear; latencia |
| 02 | Attack Trigger (MAESTRO_SIGNAL) | Temporal (a compañeros) | Act. ofensiva +3 a compañeros | poseedor con la habilidad; IN_PLAY; el poseedor no recibe | ≤96 | B | frame del borrado de posesión al pasar |
| 03 | Attacking Surge (BREAK_SPRINT) | Temporal | Vel +3, Acel +3 sin balón | x > 0; compañero poseedor; IN_PLAY | ≤96 | B | — |
| 04 | Fighting Spirit (COMBATIVE_SPIRIT) | Penalización/fatiga | ×0.8 componente de penalización; fatiga 60→75% (capitán 70→85%); +10 distancia | fórmulas documentadas | n/a | C | éxito en partido; relación con la barra de resistencia |
| 05 | Fortress (FORTRESS) | Temporal | Act. def., Entrada, Agresividad, Compromiso def. +6 | 2.º tiempo o posterior **y** ganando | ≤93 | B | — |
| 06 | Super-sub (SUPER_SUB) | Temporal | +1 a 25 atributos | suplente que entra en el descanso, 2.º tiempo o prórroga | 98+1=99 | B | tanda de penales; latencia |
| 07 | Momentum Dribbling (MOMENTUM_DRIBBLING) | Temporal | Regate, Conducción ceñida, Vel, Acel +6 | poseedor; x ≥ +18 m | ≤93 | B | escalado de campo |
| 08 | Aerial Fort (DF_SKY_HIGH) | Temporal | Contacto físico +4, Salto +4 | pase; PASS_GET; balón más alto; regla de área propia | ≤95 | B | generación del punto almacenado |
| 09 | GK Directing Defence (GK_COACHING) | Temporal (receptores) | Act. def. +2, Agresividad +2 | GK en campo con la habilidad; receptor CB/LB/RB en x ≤ −18 | ≤97 | B | escenario construido, no partido |
| 10 | GK Spirit Roar (GK_ALERT) | Temporal (receptores) | Contacto, Salto, Acel +2 | GK con la habilidad; CB/LB/RB; 2.º tiempo; ganando | ≤97 | B | no extender a Vel/Resistencia |
| 11 | Low Screamer (LOW_IMPACT_SHOT) | Movimiento | potencia local +0.2 | Stunning Shot con potencia < 50% | n/a | C | coeficiente de error +0.1 sin cuantificar |
| 12 | Acceleration Burst (ACCEL_BURST) | Movimiento | gancho entre 15.5° y 120°; 11→16; ×1.025; TP normalizado +0.1 | poseedor | n/a | C | aceleración y velocidad punta finales |
| 13 | Long-reach Tackle (PHYSICAL_TACKLE) | Movimiento | +5.625° de orientación; +3 lateral | entradas de alcance medio y largo | n/a | C | sin alcance en metros ni tasa de éxito |
| 14 | Visionary Pass (VISIONARY_PASS) | Local (receptor) | +6 local al atributo de la acción | marcador del pase con el pie; sin control ni regate con contacto | sin tope | A | registros preparados |
| 15 | Bullet Header (BULLET_HEADER) | Movimiento | retención de 1−0.20r² a 1−0.15r²; +4 km/h máx.; ×0.5 severidad | remate de cabeza | coexiste con Cabeceo +5 | C | IDs de movimiento |
| 16 | Phenomenal Pass (PHENOMENAL_PASS) | Local + error | +6 local Pase raso/bombeado | movimiento especial; direcciones laterales o hacia atrás | 99→105 | C | IDs de movimiento |
| 17 | Phenomenal Finishing (IMPROVISER) | Local + error | +7 local Finalización | movimiento especial, sin cabeza | 99→106 | C | IDs y tasas |
| 18 | Game-changing Pass (GAME_CHANGING_PASS) | Temporal | Pase raso +6, Pase bombeado +6 | 2.º tiempo o posterior **y** empate o derrota | ≤93 | A | — |
| 19 | Edged Crossing (BLITZ_CROSSING) | Movimiento | ángulo +3.8° o +2.5°; efecto | centro; < 30 km/h; 12–32 m | n/a | C | **aumento de velocidad no confirmado** |
| 20 | Blitz Curler (BLITZ_CURLER) | Movimiento | potencia 0.7+0.3N; ángulo R(d)·[…] | tiro colocado; potencia ≥ 50%; ≤ 35 m; lateral ≥ 1 m | n/a | C | flag c0 |
| 21 | Magnetic Feet (BREAKTHROUGH_DRIBBLE) | Temporal escalado | +2 × rivales (máx. 4) a Regate, Conducción ceñida, Contacto, Equilibrio | poseedor; rivales a 0 < d < 5 m | 4 rivales: ≤91 | A (481 checks) | sin prueba instalada |

## Reglas transversales

| Regla | Contenido | Estado |
|---|---|---|
| Orden de operaciones | condición → entrenador (desde referencia) → habilidades temporales → tope 40–99 → post-tope → tope 120 | **Documentado** |
| Tres tipos de bono | temporal (con tope), local (después de la lectura, sin tope), movimiento (no convertible a puntos) | **Documentado** |
| Entrenador 89 | referencia 40–55: +1; 56–83: +2; 84–99: +3; la habilidad no cruza umbral (83→85→88, 84→87→90) | **Parcial**: solo nivel 89; atributos afectados no especificados (*hipótesis: todos*) |
| Flechas de condición | 3 grupos; interpolación por rating 60–95; truncar hacia cero; tope 40–99 | **Documentado**. El orden E–A y la correspondencia grupo 0/1/2 → Conciencia/Técnico/Físico son **inferidos** |
| Regiones ±18 | ±18 m desde el medio campo; medio campo de 52.56 × 34.06 m; frente del área a 36.14 m | **Documentado**. Ancho del área: *hipótesis* (reglamentario) |
| Stacking documentado | Fortress+Super-sub suman (+7); Momentum y Surge se excluyen; GK DD+SR suman en 5 atributos distintos; Visionary/Phenomenal/ordinarios toman el máximo local; Heading+Bullet coexisten | **Documentado** |
| Stacking no listado | temporales distintos se suman; locales del mismo selector toman el máximo | *Hipótesis* |
| Boosters | no se tratan en el artículo; se modelan como adición post-tope | *Hipótesis* |
| Progresión (categorías → atributos, costes) | no está en el artículo; categorías observadas en eFHUB | **Sin verificar** |

## Casos numéricos usados en las pruebas automatizadas

- Fortress con tope: ordinario 99 / post-tope 0 da 99→99. Ordinario 97 / post-tope 2 da 99→101. Ordinario 93 / post-tope 6 da 99→105.
- Super-sub: 98+1 = 99; 99+1 = 99.
- Magnetic Feet: 90+8 = 98; 95+8 = 99; 99+8 = 99; tope de 4 rivales.
- Entrenador 89: referencia 83 da 85, y con habilidad +3 da 88. Referencia 84 da 87, y con +3 da 90.
- Visionary: 80→86 y 99→105. Phenomenal Finishing: 80→87 y 99→106. Visionary+PF = +7. Ordinario+PP = +6.
- Fortress + Super-sub: +7 en los 4 defensivos y +1 en los otros 21.
- Bullet Header: retención a 90° de 0.95 a 0.9625; a 135° de 0.80 a 0.85.
- Blitz Curler (Efecto 80, Potencia 80): 0° a 10 m; ≈3.868888° a 15 y 20 m; ≈6.770555° a 25 y 30 m. Potencia 0.5→0.7 y 1→1.
- Postura de PF: retención 0.90 con efectivo 99; ≈0.946667 con 106.
- Fighting Spirit: umbral de fatiga 75 (85 si es capitán).
- Low Screamer: 0.4→0.6; potencia de 0.5 exacta excluida.
- Flechas: extremos de la tabla en rating 60 y 95.
