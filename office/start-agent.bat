@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "AGENT_EXE=%~dp0HVASecretaryAgent.exe"
if not exist "%AGENT_EXE%" (
  set "AGENT_EXE=%~dp0HVASecretaryAgent\HVASecretaryAgent.exe"
)
if not exist "%AGENT_EXE%" (
  echo [ERROR] HVASecretaryAgent.exe not found.
  echo This launcher requires the compiled Windows Agent; it does not install Python.
  echo Put this BAT beside HVASecretaryAgent.exe or beside the HVASecretaryAgent folder.
  pause
  exit /b 2
)
echo Starting Howard AI Studio Windows Agent...
start "" "%AGENT_EXE%"
if errorlevel 1 (
  echo [ERROR] Unable to launch HVASecretaryAgent.exe.
  pause
  exit /b 1
)
echo Windows Agent launch requested.
exit /b 0
