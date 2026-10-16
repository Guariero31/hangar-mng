@echo off
title Hangar DCS - servidor local
cd /d "%~dp0"

set "PY="
python --version >nul 2>&1 && set "PY=python"
if not defined PY py --version >nul 2>&1 && set "PY=py"
if not defined PY if exist "%USERPROFILE%\miniconda3\python.exe" set "PY=%USERPROFILE%\miniconda3\python.exe"
if not defined PY if exist "%USERPROFILE%\anaconda3\python.exe" set "PY=%USERPROFILE%\anaconda3\python.exe"

if not defined PY (
  echo.
  echo  Python nao foi encontrado neste computador.
  echo  Instale em https://www.python.org/downloads/
  echo  e marque a opcao "Add Python to PATH" durante a instalacao.
  echo.
  pause
  exit /b 1
)

"%PY%" servidor.py
pause
