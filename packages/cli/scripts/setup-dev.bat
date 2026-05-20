@echo off
REM Local Development Setup Script for Windows
REM Builds and links Atomize for local testing

echo.
echo Building Atomize...
echo.

REM Check if npm is available
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo  Error: npm not found
    echo Please install Node.js first from https://nodejs.org/
    exit /b 1
)

echo  Installing dependencies...
call npm install

if %ERRORLEVEL% NEQ 0 (
    echo  Installation failed
    exit /b 1
)

echo.
echo Building project...
call npm run build

if %ERRORLEVEL% NEQ 0 (
    echo  Build failed
    exit /b 1
)

echo.
echo Linking globally...
call npm link

if %ERRORLEVEL% NEQ 0 (
    echo  Linking failed
    exit /b 1
)

echo.
echo  Setup complete!
echo.
echo You can now use 'atomize' from anywhere:
echo   atomize --version
echo   atomize validate templates\backend-api.yaml
echo   atomize generate templates\backend-api.yaml --dry-run
echo.
echo To unlink later, run:
echo    npm unlink -g @sppg2001/atomize
echo.