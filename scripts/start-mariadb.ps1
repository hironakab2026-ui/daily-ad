# Manually start MariaDB.
#
# On this machine, Start-Service for the "MariaDB" Windows service fails with an
# administrator-privilege error, so we run mysqld directly as a process instead of
# relying on the service. This uses the same --defaults-file the service normally
# uses, so authentication (grant tables) stays enabled as usual.
# Do NOT add --skip-grant-tables here -- that disables all authentication.
$mariadbBin = "C:\Program Files\MariaDB 11.8\bin\mysqld.exe"
$defaultsFile = "C:\Program Files\MariaDB 11.8\data\my.ini"

$existing = Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "MariaDB is already running (PID: $($existing[0].OwningProcess))"
    exit 0
}

Start-Process -FilePath $mariadbBin -ArgumentList "--defaults-file=$defaultsFile" -WindowStyle Hidden
Start-Sleep -Seconds 2

$listening = Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue
if ($listening) {
    Write-Host "MariaDB started (PID: $($listening[0].OwningProcess))"
} else {
    Write-Host "Startup may have failed. Check the error log:"
    Write-Host "  C:\Program Files\MariaDB 11.8\data\*.err"
    exit 1
}
