@echo off
setlocal enabledelayedexpansion
title VivoTV - Convertidor de Peliculas

echo.
echo ==========================================
echo  VIVOTV - Convertidor de Peliculas
echo  Comprime + Convierte a HLS para Web
echo ==========================================
echo.

:: Verificar FFmpeg
where ffmpeg >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] FFmpeg no esta instalado.
    echo Instala con: winget install ffmpeg
    echo Reinicia la consola despues de instalarlo.
    pause
    exit /b 1
)

echo FFmpeg detectado correctamente.
echo.

:: Pedir archivo de entrada
echo Arrastra el archivo de la pelicula a esta ventana y presiona ENTER:
echo.
set /p INPUT_FILE="Archivo: "

:: Limpiar comillas
set INPUT_FILE=%INPUT_FILE:"=%

if not exist "%INPUT_FILE%" (
    echo.
    echo [ERROR] Archivo no encontrado: %INPUT_FILE%
    pause
    exit /b 1
)

:: Obtener nombre y directorio
for %%F in ("%INPUT_FILE%") do (
    set FILE_NAME=%%~nF
    set FILE_DIR=%%~dpF
)

set OUTPUT_DIR=%FILE_DIR%%FILE_NAME%_hls
set TEMP_MP4=%FILE_DIR%%FILE_NAME%_web.mp4

echo.
echo ------------------------------------------
echo Entrada : %INPUT_FILE%
echo Salida  : %OUTPUT_DIR%
echo ------------------------------------------
echo.

:: PASO 1: Comprimir con H.265
echo [PASO 1/2] Comprimiendo con H.265...
echo (Esto puede tardar varios minutos segun el tamano del archivo)
echo.

ffmpeg -i "%INPUT_FILE%" -vcodec libx265 -crf 27 -preset fast -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -acodec aac -b:a 128k -movflags +faststart -y "%TEMP_MP4%"

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Fallo la compresion.
    echo Asegurate de que FFmpeg soporte libx265.
    pause
    exit /b 1
)

echo.
echo [OK] Compresion completada: %TEMP_MP4%
echo.

:: PASO 2: Convertir a HLS
echo [PASO 2/2] Convirtiendo a HLS...
echo.

if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

ffmpeg -i "%TEMP_MP4%" -codec: copy -start_number 0 -hls_time 10 -hls_list_size 0 -hls_segment_filename "%OUTPUT_DIR%\seg%%05d.ts" -f hls -y "%OUTPUT_DIR%\index.m3u8"

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Fallo la conversion HLS.
    pause
    exit /b 1
)

:: Eliminar el temporal
del "%TEMP_MP4%" >nul 2>&1

echo.
echo ==========================================
echo  PROCESO COMPLETADO
echo ==========================================
echo.
echo Carpeta generada:
echo %OUTPUT_DIR%
echo.
echo Sube TODA esa carpeta a Backblaze B2.
echo.
echo URL para guardar en Supabase (video_sources):
echo https://videos.tudominio.com/%FILE_NAME%_hls/index.m3u8
echo.

pause
exit /b 0
