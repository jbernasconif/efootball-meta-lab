@echo off
rem Doble clic: abre la liga en http://localhost:5180 con los botones "Guardar en el proyecto" y
rem "Guardar y publicar" (en DATA). Deja esta ventana abierta mientras editas; cierrala para apagar.
cd /d "%~dp0league"
set "PATH=%ProgramFiles%\nodejs;%PATH%"
if not exist node_modules call npm install
start "" http://localhost:5180
call npm run dev -- --port 5180 --strictPort
pause
