@echo off
cd /d "%~dp0"
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js LTS e abra este arquivo novamente.
  pause
  exit /b 1
)
if not exist "node_modules\vite" (
  echo Preparando o Mockup Studio...
  call npm.cmd ci
  if errorlevel 1 (
    echo Nao foi possivel instalar as dependencias.
    pause
    exit /b 1
  )
)
echo.
echo Forma - Mockup Studio
echo Mantenha esta janela aberta enquanto estiver usando o site.
echo Para encerrar, pressione Ctrl+C.
echo.
call npm.cmd run dev -- --open
pause
