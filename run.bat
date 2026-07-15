@echo off

wt ^
new-tab -d "%~dp0server" cmd /k "npm start" ^
; new-tab -d "%~dp0client" cmd /k "npm run dev" ^
; new-tab -d "%~dp0server\python" cmd /k "python main.py"