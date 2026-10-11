@echo off
REM ============================================================
REM  PenDraw launcher - double-click this file to start PenDraw.
REM  This computer becomes the "host". Draw from the other
REM  computer's browser using the address shown in the server
REM  window that opens.
REM ============================================================
title PenDraw launcher
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"

if not exist "apps\pendraw\dist\index.html" (
  echo First-time setup - installing and building. This can take a minute...
  call npm ci
  if errorlevel 1 exit /b 1
  call npm run build -w pendraw
  if errorlevel 1 exit /b 1
)

echo Starting the PenDraw server in a new window...
start "PenDraw Server - keep this window open" cmd /k node "apps\pendraw\server\sync-server.mjs"

REM give the server a moment to start, then open the mirror on this computer
timeout /t 3 /nobreak >nul
start "" "http://localhost:4000/?mirror"

echo.
echo PenDraw is running. To stop it, close the "PenDraw Server" window.
echo On the OTHER computer, open the http://... address shown in that window.
timeout /t 6 /nobreak >nul
exit
