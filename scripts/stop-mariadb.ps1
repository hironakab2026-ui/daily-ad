# Manually stop MariaDB (the process started by start-mariadb.ps1).
# This only signals the process on port 3306 to close, so it needs no credentials.
# mysqld handles the CTRL_CLOSE console event by running InnoDB's normal shutdown.
$conn = Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue
if (-not $conn) {
    Write-Host "MariaDB is not running"
    exit 0
}

$targetPid = $conn[0].OwningProcess
taskkill /PID $targetPid
Write-Host "Sent stop signal to MariaDB (PID: $targetPid)"
