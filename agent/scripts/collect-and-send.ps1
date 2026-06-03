param(
    [string]$ApiUrl = 'http://127.0.0.1:8000/api/telemetry',

    [string]$ApiKey = '',

    [string]$PingTarget = "8.8.8.8",
    [int]$TimeoutSec = 10,
    [int]$MaxRetries = 3,
    [string]$LogPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    $ApiKey = $env:ENDPOINTWATCH_API_KEY
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    $ApiKey = $env:API_KEY
}

if ([string]::IsNullOrWhiteSpace($ApiUrl)) {
    $ApiUrl = 'http://127.0.0.1:8000/api/telemetry'
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    throw 'ApiKey is required. Pass -ApiKey or set ENDPOINTWATCH_API_KEY/API_KEY.'
}

if ([string]::IsNullOrWhiteSpace($LogPath)) {
    $tempRoot = [System.IO.Path]::GetTempPath()
    $LogPath = Join-Path $tempRoot "endpointwatch-agent.log"
}

function Write-AgentLog {
    param(
        [string]$Level,
        [string]$Message
    )

    $line = "{0} [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
    Write-Host $line
    if (-not [string]::IsNullOrWhiteSpace($LogPath)) {
        try {
            Add-Content -Path $LogPath -Value $line
        }
        catch {
            Write-Host ("{0} [WARN] Failed to write log file: {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $_.Exception.Message)
        }
    }
}

function Get-CpuUsage {
    try {
        $sample = Get-Counter '\Processor(_Total)\% Processor Time'
        return [math]::Round($sample.CounterSamples[0].CookedValue, 2)
    }
    catch {
        Write-AgentLog -Level "WARN" -Message "CPU metric failed: $($_.Exception.Message)"
        return $null
    }
}

function Get-RamUsagePercent {
    try {
        $os = Get-CimInstance Win32_OperatingSystem
        $total = [double]$os.TotalVisibleMemorySize
        $free = [double]$os.FreePhysicalMemory
        if ($total -le 0) { return $null }
        return [math]::Round((($total - $free) / $total) * 100, 2)
    }
    catch {
        Write-AgentLog -Level "WARN" -Message "RAM metric failed: $($_.Exception.Message)"
        return $null
    }
}

function Get-DiskUsagePercent {
    try {
        $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
        if (-not $disk -or [double]$disk.Size -le 0) { return $null }
        return [math]::Round((([double]$disk.Size - [double]$disk.FreeSpace) / [double]$disk.Size) * 100, 2)
    }
    catch {
        Write-AgentLog -Level "WARN" -Message "Disk metric failed: $($_.Exception.Message)"
        return $null
    }
}

function Get-NetworkLatencyAndLoss {
    param([string]$Target)
    $result = @{ latency_ms = $null; packet_loss_pct = 0 }
    try {
        $pings = Test-Connection -ComputerName $Target -Count 3 -ErrorAction SilentlyContinue
        if ($pings) {
            $success = $pings | Where-Object { $_.ResponseTime -ne $null }
            $lost = 3 - $success.Count
            $result.packet_loss_pct = [math]::Round(($lost / 3) * 100, 2)
            if ($success.Count -gt 0) {
                $avg = ($success | Measure-Object -Property ResponseTime -Average).Average
                $result.latency_ms = [int]$avg
            }
        } else {
            $result.packet_loss_pct = 100
        }
    }
    catch {
        Write-AgentLog -Level "WARN" -Message "Network latency/loss collection failed: $($_.Exception.Message)"
    }
    return $result
}

function Get-RdpInputDelay {
    try {
        $counter = Get-Counter '\User Input Delay(*)\Max Input Delay' -ErrorAction Stop
        if ($counter -and $counter.CounterSamples) {
            $max = ($counter.CounterSamples | Measure-Object -Property CookedValue -Max).Maximum
            return [math]::Round([double]$max, 2)
        }
    } catch {}
    return $null
}

function Get-RdpRtt {
    try {
        $counter = Get-Counter '\RemoteFX Network(*)\Round Trip Time' -ErrorAction Stop
        if ($counter -and $counter.CounterSamples) {
            $max = ($counter.CounterSamples | Measure-Object -Property CookedValue -Max).Maximum
            return [math]::Round([double]$max, 2)
        }
    } catch {}
    return $null
}

function Get-RdpFrameRate {
    try {
        $counter = Get-Counter '\RemoteFX Graphics(*)\Frames Coded/Second' -ErrorAction Stop
        if ($counter -and $counter.CounterSamples) {
            $max = ($counter.CounterSamples | Measure-Object -Property CookedValue -Max).Maximum
            return [math]::Round([double]$max, 2)
        }
    } catch {}
    return $null
}


function Get-WifiSignalPercent {
    try {
        $output = netsh wlan show interfaces
        $line = $output | Where-Object { $_ -match '^\s*Signal\s*:' } | Select-Object -First 1
        if (-not $line) { return $null }
        if ($line -match '(\d+)%') {
            return [int]$Matches[1]
        }
        return $null
    }
    catch {
        Write-AgentLog -Level "WARN" -Message "WiFi metric failed: $($_.Exception.Message)"
        return $null
    }
}

function Get-RdpSessionActive {
    try {
        # 1. Inbound RDP Session check via environment variable
        $session = [Environment]::GetEnvironmentVariable("SESSIONNAME")
        if ($session -and $session -like "RDP-*") {
            return $true
        }

        # 2. Inbound network connection check on default RDP port 3389
        $inbound = Get-NetTCPConnection -LocalPort 3389 -State Established -ErrorAction SilentlyContinue
        if ($inbound) {
            return $true
        }

        # 3. Outbound RDP Client check (if this machine is connecting to a remote server)
        $outbound = Get-Process -Name mstsc -ErrorAction SilentlyContinue
        if ($outbound) {
            return $true
        }

        return $false
    }
    catch {
        Write-AgentLog -Level "WARN" -Message "RDP session metric failed: $($_.Exception.Message)"
        return $false
    }
}

function Get-MonitorInfo {
    try {
        Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
        $screens = [System.Windows.Forms.Screen]::AllScreens
        $monitorCount = $screens.Count
        $primary = $screens | Where-Object { $_.Primary } | Select-Object -First 1
        $resolution = $null
        if ($primary) {
            $resolution = "{0}x{1}" -f $primary.Bounds.Width, $primary.Bounds.Height
        }

        return @{ monitor_count = $monitorCount; primary_resolution = $resolution }
    }
    catch {
        Write-AgentLog -Level "WARN" -Message "Monitor metric failed: $($_.Exception.Message)"
        return @{ monitor_count = $null; primary_resolution = $null }
    }
}

function Get-GpuMetrics {
    # Keep this lightweight and resilient. On unsupported hardware/counters it returns null values.
    $result = @{ gpu_usage = $null; gpu_memory_usage_mb = $null }
    try {
        $gpuCounter = Get-Counter '\GPU Engine(*)\Utilization Percentage' -ErrorAction Stop
        if ($gpuCounter -and $gpuCounter.CounterSamples) {
            $avg = ($gpuCounter.CounterSamples | Measure-Object -Property CookedValue -Average).Average
            if ($null -ne $avg) {
                $result.gpu_usage = [math]::Round([double]$avg, 2)
            }
        }
    }
    catch {
        Write-AgentLog -Level "WARN" -Message "GPU utilization metric unavailable: $($_.Exception.Message)"
    }

    return $result
}

function Build-TelemetryPayload {
    $monitorInfo = Get-MonitorInfo
    $gpu = Get-GpuMetrics
    $localTime = (Get-Date).ToString("hh:mm tt")

    # Inventory collection
    try {
        $cs = Get-CimInstance Win32_ComputerSystem
        $bios = Get-CimInstance Win32_BIOS
        $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
        $os = Get-CimInstance Win32_OperatingSystem
        $gpuInfo = Get-CimInstance Win32_VideoController | Select-Object -First 1
        $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" | Select-Object -First 1
        $net = Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled } | Select-Object -First 1
        $diskDrive = Get-CimInstance Win32_DiskDrive | Select-Object -First 1

        # Windows License and OEM Status
        $licenseKey = $null
        $oemStatus = "Unlicensed"
        $licChannel = "Unknown"
        try {
            $licService = Get-CimInstance SoftwareLicensingService -ErrorAction SilentlyContinue
            if ($licService) {
                $licenseKey = $licService.OA3xOriginalProductKey
                $propDesc = $licService.CimInstanceProperties['OA3xOriginalProductKeyDescription']
                if ($propDesc -and $propDesc.Value) {
                    $desc = $propDesc.Value.ToUpper()
                    if ($desc -match "RETAIL") { $licChannel = "Retail" }
                    elseif ($desc -match "OEM") { $licChannel = "OEM" }
                    elseif ($desc -match "VOLUME|MAK|KMS") { $licChannel = "Volume" }
                }
            }
            # Query the Windows licensing product specifically
            $licProd = Get-CimInstance SoftwareLicensingProduct -Filter "PartialProductKey is not null" -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*Windows*" } | Select-Object -First 1
            if ($licProd) {
                $propStatus = $licProd.CimInstanceProperties['LicenseStatus']
                if ($propStatus -and $propStatus.Value -ne $null) {
                    $oemStatus = switch ($propStatus.Value) {
                        0 { "Unlicensed" }
                        1 { "Active / Licensed" }
                        2 { "OOB Grace" }
                        3 { "OutOfTolerance Grace" }
                        4 { "Evaluation Grace" }
                        5 { "Extended Grace" }
                        Default { "Active" }
                    }
                }
                if ($licChannel -eq "Unknown") {
                    $propDesc = $licProd.CimInstanceProperties['Description']
                    if ($propDesc -and $propDesc.Value) {
                        $desc = $propDesc.Value.ToUpper()
                        if ($desc -match "RETAIL") { $licChannel = "Retail" }
                        elseif ($desc -match "OEM") { $licChannel = "OEM" }
                        elseif ($desc -match "VOLUME|MAK|KMS") { $licChannel = "Volume" }
                    }
                }
            }
        } catch {
            Write-AgentLog -Level "WARN" -Message "License collection failed: $($_.Exception.Message)"
        }

        # Active local user accounts (excluding system templates/standard builtins)
        $localUsers = $null
        try {
            $userAccounts = Get-CimInstance Win32_UserAccount -Filter "LocalAccount=True and Disabled=False" -ErrorAction SilentlyContinue
            if ($userAccounts) {
                $names = $userAccounts | Where-Object { $_.Name -notmatch "Administrator|Guest|DefaultAccount|WDAGUtilityAccount" } | Select-Object -ExpandProperty Name
                $localUsers = ($names -join ", ")
            }
        } catch {}

        # Network interface Details (Mac and IP)
        $ip = $null
        $mac = $null
        try {
            $ipObj = Get-NetIPAddress -InterfaceAlias 'Wi-Fi','Ethernet' -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($ipObj) {
                $ip = $ipObj.IPAddress
            }
            $netAdapter = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($netAdapter) {
                $mac = $netAdapter.MacAddress
            }
        } catch {}

        # Last boot up time, Install date and Architecture
        $bootTime = $null
        $osInstallDate = $null
        $osArchitecture = $null
        try {
            if ($os.LastBootUpTime) {
                $bootTime = $os.LastBootUpTime.ToString("yyyy-MM-dd HH:mm:ss")
            }
            if ($os.InstallDate) {
                $osInstallDate = $os.InstallDate.ToString("yyyy-MM-dd HH:mm:ss")
            }
            if ($os.OSArchitecture) {
                $osArchitecture = $os.OSArchitecture
            }
        } catch {}

        $resolvedUser = $null
        try {
            $csObj = Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue
            if ($csObj -and $csObj.UserName) {
                $resolvedUser = ($csObj.UserName -split '\\')[-1]
            }
        } catch {}
        if ([string]::IsNullOrWhiteSpace($resolvedUser)) {
            $resolvedUser = [Environment]::UserName
        }

        $inventory = @{ 
            hostname = $env:COMPUTERNAME
            username = $resolvedUser
            manufacturer = $cs.Manufacturer
            model = $cs.Model
            serial_number = $bios.SerialNumber
            cpu_name = $cpu.Name
            cpu_cores = $cpu.NumberOfCores
            cpu_threads = $cpu.NumberOfLogicalProcessors
            ram_total_bytes = [int64]$cs.TotalPhysicalMemory
            cpu_base_clock = if ($cpu.CurrentClockSpeed) { "{0} MHz" -f $cpu.CurrentClockSpeed } else { $null }
            cpu_max_clock = if ($cpu.MaxClockSpeed) { "{0} MHz" -f $cpu.MaxClockSpeed } else { $null }
            gpu_name = $gpuInfo.Name
            gpu_driver = $gpuInfo.DriverVersion
            gpu_memory_bytes = if ($gpuInfo.AdapterRAM) { [int64]$gpuInfo.AdapterRAM } else { $null }
            gpu_driver_date = if ($gpuInfo.DriverDate) { $gpuInfo.DriverDate } else { $null }
            gpu_type = if ($gpuInfo.Name -and $gpuInfo.Name -match 'intel|integrated') { 'Integrated' } else { 'Discrete' }
            windows_version = $os.Caption + " " + $os.Version
            primary_disk = $disk.DeviceID
            disk_size_bytes = if ($disk.Size) { [int64]$disk.Size } else { $null }
            disk_model = if ($diskDrive.Model) { $diskDrive.Model } else { $null }
            disk_type = if ($diskDrive.MediaType) { $diskDrive.MediaType } else { $null }
            network_adapter = if ($net) { $net.Description } else { $null }
            monitor_count = $monitorInfo.monitor_count
            primary_resolution = $monitorInfo.primary_resolution
            # Expanded specs
            windows_license_key = $licenseKey
            oem_activation_status = $oemStatus
            local_active_accounts = $localUsers
            ip_address = $ip
            mac_address = $mac
            last_boot_time = $bootTime
            windows_license_channel = $licChannel
            os_architecture = $osArchitecture
            os_install_date = $osInstallDate
        }
    }
    catch {
        Write-AgentLog -Level "WARN" -Message "Inventory collection failed: $($_.Exception.Message)"
        $inventory = $null
    }

    $netStats = Get-NetworkLatencyAndLoss -Target $PingTarget
    return @{
        hostname = $env:COMPUTERNAME
        local_time = $localTime
        timestamp = ([DateTimeOffset]::Now).ToString("o")
        metrics = @{
            cpu = Get-CpuUsage
            ram = Get-RamUsagePercent
            disk = Get-DiskUsagePercent
            latency_ms = $netStats.latency_ms
            packet_loss_pct = $netStats.packet_loss_pct
            wifi_signal = Get-WifiSignalPercent
            rdp_active = Get-RdpSessionActive
            rdp_rtt_ms = Get-RdpRtt
            rdp_input_delay_ms = Get-RdpInputDelay
            rdp_fps = Get-RdpFrameRate
            monitor_count = $monitorInfo.monitor_count
            primary_resolution = $monitorInfo.primary_resolution
            gpu = $gpu.gpu_usage
            gpu_memory_usage_mb = $gpu.gpu_memory_usage_mb
        }
        inventory = $inventory
    }
}

function Send-Telemetry {
    param(
        [hashtable]$Payload
    )

    $json = $Payload | ConvertTo-Json -Depth 8
    $headers = @{ "x-api-key" = $ApiKey }

    Write-Host "=== Telemetry Payload ==="
    Write-Host $json
    Write-Host "========================="

    for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
        try {
            $response = Invoke-RestMethod -Method Post -Uri $ApiUrl -Headers $headers -ContentType "application/json" -Body $json -TimeoutSec $TimeoutSec
            Write-AgentLog -Level "INFO" -Message "Telemetry sent successfully. Response id: $($response.id)"
            Write-Host "=== Server Response ==="
            $response | ConvertTo-Json -Depth 8 | Write-Host
            Write-Host "======================="
            return $true
        }
        catch {
            Write-AgentLog -Level "ERROR" -Message "Send attempt $attempt failed: $($_.Exception.Message)"
            if ($attempt -lt $MaxRetries) {
                Start-Sleep -Seconds ([math]::Min(10, $attempt * 2))
            }
        }
    }

    return $false
}

try {
    Write-AgentLog -Level "INFO" -Message "Telemetry collection started"
    $payload = Build-TelemetryPayload
    Write-Host ("Local time: {0}" -f $payload.local_time)
    $ok = Send-Telemetry -Payload $payload
    if (-not $ok) {
        exit 1
    }
    exit 0
}
catch {
    Write-AgentLog -Level "ERROR" -Message "Agent failed: $($_.Exception.Message)"
    exit 1
}
