@rem ==========================================================================
@rem Stronghold-Protocol Gradle Execution Wrapper
@rem Locates an extracted Gradle distribution under the wrapper cache, or a
@rem system-wide `gradle`, and forwards all arguments to it.
@rem ==========================================================================
@echo off
setlocal

set "GRADLE_BIN="

rem 1. Look for an extracted Gradle 8.14.3 (AGP 8.7.2 needs >= 8.9) under the wrapper dists cache.
if exist "%USERPROFILE%\.gradle\wrapper\dists\gradle-8.14.3-all" (
    for /d %%D in ("%USERPROFILE%\.gradle\wrapper\dists\gradle-8.14.3-all\*") do (
        if exist "%%D\gradle-8.14.3\bin\gradle.bat" set "GRADLE_BIN=%%D\gradle-8.14.3\bin\gradle.bat"
    )
)

rem 2. Fall back to a system Gradle on PATH.
if "%GRADLE_BIN%"=="" (
    for /f "delims=" %%i in ('where gradle 2^>nul') do (
        if not defined GRADLE_BIN set "GRADLE_BIN=%%i"
    )
)

if "%GRADLE_BIN%"=="" (
    echo [ERROR] Gradle 8.14.3 not found in .gradle\wrapper\dists or on PATH.
    exit /b 1
)

echo [wrapper] Using Gradle: %GRADLE_BIN%
call "%GRADLE_BIN%" %*
exit /b %ERRORLEVEL%
