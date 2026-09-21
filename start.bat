@echo off
chcp 65001 >nul
echo ===================================================
echo   工业大屏产品工作台 (Industrial Dashboard Studio)
echo ===================================================
echo 正在启动本地服务...
echo 访问地址: http://localhost:8080/apps/showcase/index.html
echo.
start http://localhost:8080/apps/showcase/index.html
python -m http.server 8080
pause
