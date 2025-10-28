@echo off
setlocal enabledelayedexpansion

REM ���� � ffmpeg.exe � ��������
set "FFMPEG=C:\Progra~1\ffmpeg-2025-10-27-git-68152978b5-essentials_build\bin\ffmpeg.exe"

for %%f in (*.mp4) do (
    set "filename=%%~nf"
    if not exist "!filename!.webm" (
        echo ����������� %%f -> !filename!.webm
        "%FFMPEG%" -i "%%f" -c:v libvpx-vp9 -b:v 1M -c:a libopus "!filename!.webm"
    ) else (
        echo ���� !filename!.webm ��� ����������, ����������.
    )
)

echo ��� ����������� ���������!
pause
