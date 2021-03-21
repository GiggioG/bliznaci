@echo off
node --no-warnings index.js
IF %ERRORLEVEL% EQU 20 exit