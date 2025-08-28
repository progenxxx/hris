# Biometric System Domain Deployment Guide

## Architecture Overview

When deploying the HRMS biometric functionality on a domain, there are several network considerations:

### **1. Direct Connection Architecture**
```
[Biometric Devices] ←→ [Web Server] ←→ [Database]
     (Local Network)      (Domain)       (Cloud/Local)
```

### **2. Hybrid Architecture (Recommended)**
```
[Biometric Devices] ←→ [Local Bridge Server] ←→ [Web App (Domain)]
     (Local Network)      (Same Network)         (Internet)
```

### **3. VPN Architecture**
```
[Biometric Devices] ←→ [Web Server via VPN] ←→ [Database]
     (Local Network)      (Domain + VPN)        (Cloud)
```

## Implementation Strategies

### **Option 1: Direct Domain Connection**

**Requirements:**
- Biometric devices must have internet access
- Firewall rules to allow ZKTeco protocol (default port 4370)
- Static IP or DDNS for devices

**Configuration:**
```php
// In BiometricController.php - Add network discovery
protected function getNetworkDevices($subnet = null)
{
    if (!$subnet) {
        // Auto-detect local subnet or use configuration
        $subnet = config('biometric.default_subnet', '192.168.1.0/24');
    }
    
    // Scan for devices across multiple subnets
    $subnets = [
        '192.168.1.0/24',  // Local network
        '10.0.0.0/24',     // Common internal
        '172.16.0.0/24'    // Corporate network
    ];
    
    return $this->scanMultipleNetworks($subnets);
}
```

### **Option 2: Local Bridge Server**

Create a local service that bridges biometric devices to your domain:

**Bridge Server (PHP Script):**
```php
// bridge_server.php
<?php
class BiometricBridge {
    private $domain_url = 'https://yourdomain.com';
    private $api_key = 'your_api_key';
    
    public function syncDeviceData() {
        $devices = $this->scanLocalDevices();
        
        foreach ($devices as $device) {
            $logs = $this->fetchDeviceLogs($device);
            $this->sendToDomain($logs);
        }
    }
    
    private function sendToDomain($data) {
        $curl = curl_init();
        curl_setopt_array($curl, [
            CURLOPT_URL => $this->domain_url . '/api/biometric/sync',
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($data),
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $this->api_key,
                'Content-Type: application/json'
            ],
            CURLOPT_RETURNTRANSFER => true
        ]);
        
        return curl_exec($curl);
    }
}

// Run every 5 minutes via cron
$bridge = new BiometricBridge();
$bridge->syncDeviceData();
?>
```

### **Option 3: API-Based Sync**

Add API endpoints for remote sync:

**Routes (web.php):**
```php
// API routes for biometric sync
Route::prefix('api/biometric')->middleware(['api', 'auth:sanctum'])->group(function () {
    Route::post('/sync', [BiometricController::class, 'syncFromRemote']);
    Route::get('/devices/status', [BiometricController::class, 'getDeviceStatus']);
    Route::post('/logs/bulk', [BiometricController::class, 'bulkInsertLogs']);
});
```

**Controller Methods:**
```php
public function syncFromRemote(Request $request)
{
    $validated = $request->validate([
        'device_id' => 'required|string',
        'logs' => 'required|array',
        'logs.*.employee_id' => 'required|integer',
        'logs.*.timestamp' => 'required|date',
        'logs.*.type' => 'required|in:check_in,check_out'
    ]);
    
    DB::beginTransaction();
    try {
        foreach ($validated['logs'] as $log) {
            BiometricLogs::create([
                'device_id' => $validated['device_id'],
                'employee_id' => $log['employee_id'],
                'timestamp' => $log['timestamp'],
                'type' => $log['type'],
                'source' => 'remote_sync'
            ]);
        }
        
        DB::commit();
        return response()->json(['status' => 'success']);
    } catch (Exception $e) {
        DB::rollBack();
        return response()->json(['error' => $e->getMessage()], 500);
    }
}
```

## Server Requirements

### **PHP Configuration (php.ini)**
```ini
# For domain deployment
extension=sockets
extension=curl
extension=openssl

# Increase timeouts for network operations
max_execution_time = 300
max_input_time = 300
memory_limit = 512M
default_socket_timeout = 60

# Enable error logging
log_errors = On
error_log = /path/to/biometric_errors.log
```

### **Firewall Configuration**
```bash
# Allow ZKTeco protocol
iptables -A INPUT -p tcp --dport 4370 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 4370 -j ACCEPT

# For HTTPS
iptables -A INPUT -p tcp --dport 443 -j ACCEPT
```

## Security Considerations

### **1. Network Security**
- Use HTTPS for all web communications
- VPN for device connections when possible
- IP whitelisting for biometric devices
- Regular security updates

### **2. Data Encryption**
```php
// Encrypt sensitive biometric data
protected function encryptBiometricData($data)
{
    return encrypt(json_encode($data));
}

protected function decryptBiometricData($encrypted)
{
    return json_decode(decrypt($encrypted), true);
}
```

### **3. Authentication**
```php
// API authentication for remote sync
protected function authenticateDevice($request)
{
    $deviceToken = $request->header('X-Device-Token');
    $device = BiometricDevice::where('api_token', $deviceToken)->first();
    
    if (!$device || !$device->is_active) {
        abort(401, 'Unauthorized device');
    }
    
    return $device;
}
```

## Monitoring and Troubleshooting

### **Health Check Endpoint**
```php
Route::get('/biometric/health', function() {
    return response()->json([
        'socket_extension' => extension_loaded('sockets'),
        'database' => DB::connection()->getPdo() ? 'connected' : 'disconnected',
        'devices_online' => BiometricDevice::where('status', 'online')->count(),
        'last_sync' => BiometricLogs::latest()->first()?->created_at,
    ]);
});
```

### **Logging Configuration**
```php
// Add to config/logging.php
'biometric' => [
    'driver' => 'single',
    'path' => storage_path('logs/biometric.log'),
    'level' => 'debug',
],
```

## Deployment Checklist

- [ ] Update .env with production settings
- [ ] Enable SSL certificate (HTTPS)
- [ ] Configure PHP extensions (sockets, curl, openssl)
- [ ] Set up firewall rules
- [ ] Test network connectivity from devices
- [ ] Configure monitoring and alerts
- [ ] Set up automated backups
- [ ] Test failover scenarios
- [ ] Document IP addresses and network topology
- [ ] Train staff on troubleshooting procedures