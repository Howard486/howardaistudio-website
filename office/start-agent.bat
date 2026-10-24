@echo off
setlocal EnableExtensions
cd /d "%~dp0"
rem HVA Secretary Agent launcher: v0.7 first, then legacy v0.4.1.
rem This starts the Agent for Office pairing. For optional v0.7 mock-browser
rem runner, use the integrated BAT included INSIDE the downloaded v0.7 package.
set "AGENT_EXE="
for %%P in (
  "%~dp0HVASecretaryAgent-v07.exe"
  "%~dp0HVASecretaryAgent-v0.7.exe"
  "%~dp0HVASecretaryAgent.exe"
  "%~dp0HVASecretaryAgent-v07\HVASecretaryAgent-v07.exe"
  "%~dp0HVASecretaryAgent-v07-SaaS-Connector-Preview\HVASecretaryAgent-v07.exe"
  "%~dp0HVASecretaryAgent\HVASecretaryAgent.exe"
) do (
  if not defined AGENT_EXE if exist "%%~P" set "AGENT_EXE=%%~P"
)
if not defined AGENT_EXE (
  echo [ERROR] HVA Secretary Agent EXE not found.
  echo.
  echo 1. Download "Agent v0.7 Windows ZIP" from Office.
  echo 2. GitHub Actions artifact may contain another ZIP inside.
  echo 3. Extract BOTH ZIP layers.
  echo 4. Copy this BAT beside HVASecretaryAgent-v07.exe, then retry.
  echo.
  echo For the v0.7 Browser Runner demo, use
  echo Start-HVA-Office-v07-Integrated.bat from the package instead.
  echo.
  pause
  exit /b 2
)
echo Starting Howard AI Studio Windows Agent...
echo "%AGENT_EXE%"
start "" "%AGENT_EXE%"
if errorlevel 1 (
  echo [ERROR] Agent could not start.
  pause
  exit /b 1
)
echo Agent launch requested. Verify http://127.0.0.1:8765/api/health
exit /b 0
