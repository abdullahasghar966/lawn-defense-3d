@echo off
REM Starts the game server without going through npm.
REM
REM PowerShell blocks npm's .ps1 launcher under the default execution policy, so
REM "npm run dev" fails before npm is even reached. Batch files are not affected.
REM Usage:  .\dev.cmd
node "%~dp0server\index.js" %*
