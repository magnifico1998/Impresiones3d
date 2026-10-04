@echo off
rem Manager3D Conector: abre el programa (la primera vez instala lo que necesita).
rem Hace falta Node.js 22 o más nuevo: https://nodejs.org
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo No encontre Node.js. Instalalo desde https://nodejs.org y volve a abrir este archivo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando por unica vez, un momento...
  call npm install --omit=dev --no-audit --no-fund
)
title Manager3D Conector
node src\index.js
pause
