@echo off
REM Build Classify for Windows
REM Requirements: pip install pyinstaller, npm install (in electron\)

set ROOT=%~dp0
cd /d "%ROOT%"

echo === Step 1: Bundle Flask backend with PyInstaller ===
pyinstaller classify.spec --noconfirm --clean
if errorlevel 1 goto error

echo.
echo === Step 2: Install Electron dependencies ===
cd /d "%ROOT%electron"
npm install
if errorlevel 1 goto error

echo.
echo === Step 3: Build Windows app with electron-builder ===
npm run dist:win
if errorlevel 1 goto error

echo.
echo === Done! ===
echo Installer: %ROOT%dist\Classify-Setup-*.exe
goto end

:error
echo Build failed.
exit /b 1

:end
