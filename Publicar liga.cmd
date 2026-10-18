@echo off
rem Doble clic: publica en el sitio el ultimo export de la liga (Datos -> Descargar en la app).
cd /d "%~dp0"
"%LOCALAPPDATA%\Programs\Python\Python312\python.exe" tools\publish_league.py --push
echo.
pause
