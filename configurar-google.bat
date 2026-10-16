@echo off
title Hangar DCS - Login com Google
cd /d "%~dp0"

node --version >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Node.js nao foi encontrado. Rode o iniciar.bat primeiro.
  pause
  exit /b 1
)

node scripts\configurar-google.mjs
pause
