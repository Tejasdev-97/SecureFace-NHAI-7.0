# Run this script IN POWERSHELL AS ADMINISTRATOR after installing Android Studio
# It sets the ANDROID_HOME and PATH environment variables system-wide

$sdkPath = "$env:LOCALAPPDATA\Android\Sdk"

# Set ANDROID_HOME
[System.Environment]::SetEnvironmentVariable("ANDROID_HOME", $sdkPath, "User")

# Add adb and emulator to PATH
$currentPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
$additions = "$sdkPath\platform-tools;$sdkPath\emulator;$sdkPath\tools\bin"
if ($currentPath -notlike "*platform-tools*") {
    [System.Environment]::SetEnvironmentVariable("PATH", "$currentPath;$additions", "User")
    Write-Host "✅ ANDROID_HOME and PATH set successfully!" -ForegroundColor Green
} else {
    Write-Host "✅ PATH already contains Android tools." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "ANDROID_HOME = $sdkPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠️  IMPORTANT: Close and reopen your terminal for changes to take effect." -ForegroundColor Yellow
