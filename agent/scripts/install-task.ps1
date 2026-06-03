param(
    [ValidateSet('install','uninstall','status')]
    [string]$Action = 'install',

    [string]$TaskName = 'EndpointWatch-Telemetry',
    [int]$IntervalMinutes = 10,
    [string]$ApiUrl = 'http://127.0.0.1:8000/api/telemetry',
    [string]$ApiKey = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    $ApiKey = $env:ENDPOINTWATCH_API_KEY
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    $ApiKey = $env:API_KEY
}

function Write-Log { param($m) Write-Host "[install-task] $m" }

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$collector = Join-Path $scriptDir 'collect-and-send.ps1'

switch ($Action) {
    'install' {
        if (-not (Test-Path $collector)) {
            Write-Log "Collector script not found: $collector"
            exit 2
        }
        if ([string]::IsNullOrWhiteSpace($ApiUrl) -or [string]::IsNullOrWhiteSpace($ApiKey)) {
            Write-Log "For install, provide -ApiKey or set ENDPOINTWATCH_API_KEY/API_KEY"
            exit 3
        }

        $arg = "-NoProfile -ExecutionPolicy Bypass -File `"$collector`" -ApiUrl `"$ApiUrl`" -ApiKey `"$ApiKey`""

        $actionObj = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg
        $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1)
        $repetition = New-TimeSpan -Minutes $IntervalMinutes
        $trigger.Repetition = (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval $repetition).Repetition
        $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
        $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

        try {
            Register-ScheduledTask -TaskName $TaskName -Action $actionObj -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
            Write-Log "Scheduled task '$TaskName' installed. Interval: every $IntervalMinutes minutes."
            exit 0
        }
        catch {
            Write-Log "Failed to register task: $($_.Exception.Message)"
            exit 4
        }
    }

    'uninstall' {
        try {
            if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
                Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
                Write-Log "Scheduled task '$TaskName' removed"
                exit 0
            }
            else {
                Write-Log "Task '$TaskName' not found"
                exit 1
            }
        }
        catch {
            Write-Log "Failed to remove task: $($_.Exception.Message)"
            exit 5
        }
    }

    'status' {
        try {
            $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
            if (-not $t) {
                Write-Log "Task '$TaskName' not found"
                exit 1
            }
            $info = Get-ScheduledTaskInfo -TaskName $TaskName
            Write-Host "TaskName : $($t.TaskName)"
            Write-Host "State    : $($info.State)"
            Write-Host "LastRun  : $($info.LastRunTime)"
            Write-Host "NextRun  : $($info.NextRunTime)"
            exit 0
        }
        catch {
            Write-Log "Status check failed: $($_.Exception.Message)"
            exit 6
        }
    }
}
