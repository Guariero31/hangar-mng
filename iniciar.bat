@echo off
title Hangar DCS
cd /d "%~dp0"

node --version >nul 2>&1
if errorlevel 1 goto :sem_node

if not exist "server\.env" copy "server\.env.example" "server\.env" >nul

if exist "node_modules" goto :rodar
echo.
echo  Instalando dependencias - so na primeira vez, pode levar alguns minutos...
echo.
call npm install
if errorlevel 1 goto :falha_install

:rodar
echo.
echo  Iniciando o Hangar DCS...
echo  O navegador abre sozinho em http://localhost:5173
echo  Para parar, feche esta janela.
echo.
call npm run dev
pause
exit /b 0

:sem_node
echo.
echo  Node.js nao foi encontrado neste computador.
echo  Instale a versao LTS em https://nodejs.org e rode este arquivo de novo.
echo.
start "" https://nodejs.org
pause
exit /b 1

:falha_install
echo.
echo  Falha ao instalar as dependencias. Veja a mensagem acima.
pause
exit /b 1
