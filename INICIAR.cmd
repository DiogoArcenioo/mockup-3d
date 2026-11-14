@echo off
cd /d "%~dp0"
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js LTS e abra este arquivo novamente.
  pause
  exit /b 1
)
if not exist "node_modules\next" (
  echo Preparando o Infinity...
  call npm.cmd ci
  if errorlevel 1 (
    echo Nao foi possivel instalar as dependencias.
    pause
    exit /b 1
  )
)
echo.
echo Infinity - Sistema da loja
echo Mantenha esta janela aberta enquanto estiver usando o site.
echo Para encerrar, pressione Ctrl+C.
echo.
start "" http://localhost:5173
call npm.cmd run dev
pause
