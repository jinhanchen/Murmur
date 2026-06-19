@echo off
title Murmur
cd /d "E:\Frank vibe coding(Legion)\voice-input"
set "PATH=%USERPROFILE%\.cargo\bin;C:\Program Files\LLVM\bin;C:\Program Files\CMake\bin;C:\VulkanSDK\1.4.350.0\Bin;%APPDATA%\npm;%PATH%"
set "LIBCLANG_PATH=C:\Program Files\LLVM\bin"
set "VULKAN_SDK=C:\VulkanSDK\1.4.350.0"
set "CARGO_TARGET_DIR=C:\t"
echo Starting Murmur, please wait (~20s)...
bun tauri dev
