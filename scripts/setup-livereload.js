#!/usr/bin/env node

/**
 * ARCONZA — Live Reload Setup for Capacitor Android
 * 
 * This script:
 * 1. Detects your local network IP address
 * 2. Backs up capacitor.config.json and patches it with the server URL for live reload
 * 3. Restores the original config when the process exits (Ctrl+C)
 * 4. Starts the Express dev server
 * 5. Syncs the config to the Android project
 * 
 * Usage: node scripts/setup-livereload.js
 * Then in another terminal: npx cap run android
 * 
 * Or use: npm run dev:android
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const os = require('os');

// ── Config ────────────────────────────────
const PORT = process.env.PORT || 8080;
const CONFIG_PATH = path.join(__dirname, '..', 'capacitor.config.json');

// ── Original config backup ────────────────
let originalConfig = null;
let cleanedUp = false;

function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;

  if (originalConfig) {
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(originalConfig, null, 2) + '\n');
      console.log('\n  ✓ Restored original capacitor.config.json');
    } catch (err) {
      console.error('\n  ✗ Failed to restore config:', err.message);
    }
  }

  if (server) {
    server.kill('SIGINT');
  }
}

// Trap all exit paths
process.on('SIGINT', () => { console.log('\n\n  Shutting down...'); cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('exit', () => { cleanup(); });

let server = null;

// ── Get local network IP ──────────────────
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  let fallback = null;
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const n = name.toLowerCase();
        // Prioritise Wi-Fi over wired (VirtualBox, Hyper-V etc.)
        if (n.includes('wi-fi') || n.includes('wlan')) {
          return iface.address;
        }
        // Save first non-internal as fallback
        if (!fallback) fallback = iface.address;
      }
    }
  }
  return fallback || '127.0.0.1';
}

// ── Main ──────────────────────────────────
function main() {
  let useAdbReverse = false;
  const adbPath = process.env.LOCALAPPDATA 
    ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe')
    : 'adb';

  try {
    const devicesOutput = execSync(`"${adbPath}" devices`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
    const lines = devicesOutput.split('\n').map(l => l.trim());
    const devices = lines.filter(line => line && !line.startsWith('List of devices') && line.includes('\tdevice'));

    if (devices.length > 0) {
      console.log(`\n  ✓ Connected Android device detected: ${devices[0].split('\t')[0]}`);
      console.log(`  ✓ Setting up ADB reverse port forwarding for port ${PORT}...`);
      execSync(`"${adbPath}" reverse tcp:${PORT} tcp:${PORT}`);
      useAdbReverse = true;
    }
  } catch (err) {
    // ADB not found or failed, fallback to Wi-Fi IP
  }

  const localIP = getLocalIP();
  const serverUrl = useAdbReverse ? `http://localhost:${PORT}` : `http://${localIP}:${PORT}`;

  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║   ARCONZA — Live Reload Setup         ║');
  console.log('  ╠══════════════════════════════════════════════╣');
  console.log(`  ║   ADB Reverse:  ${(useAdbReverse ? 'Enabled (USB)' : 'Disabled').padEnd(27)}║`);
  console.log(`  ║   IP detected:  ${localIP.padEnd(27)}║`);
  console.log(`  ║   Server URL:   ${serverUrl.padEnd(27)}║`);
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');

  // ── Backup and patch capacitor.config.json ──
  originalConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

  const patchedConfig = JSON.parse(JSON.stringify(originalConfig));
  patchedConfig.server = patchedConfig.server || {};
  patchedConfig.server.url = serverUrl;
  patchedConfig.server.cleartext = true;
  patchedConfig.server.androidScheme = 'http';

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(patchedConfig, null, 2) + '\n');
  console.log(`  ✓ Patched capacitor.config.json with server.url = ${serverUrl}`);
  console.log('  ✓ Original config backed up — will restore on exit');

  // ── Sync to Android ──────────────────────
  console.log('  ✓ Syncing to Android project...');
  try {
    execSync('npx cap copy android', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    });
    console.log('  ✓ Android project synced successfully!');
  } catch (err) {
    console.error('  ✗ Failed to sync Android project:', err.message);
    cleanup();
    process.exit(1);
  }

  console.log('');
  console.log('  ────────────────────────────────────────────────');
  console.log('  ✅  Live reload is ready!');
  console.log('');
  console.log('  Next steps:');
  console.log('  1. Keep this terminal running — the dev server is starting...');
  console.log('  2. Open a NEW terminal and run:');
  console.log('     npm run cap:run:android');
  console.log('  3. The app will open on your connected Android device/emulator');
  console.log('  4. Edit your code — changes auto-refresh instantly!');
  console.log('');
  console.log('  ⚠️  Make sure your phone and computer are on the same Wi-Fi network');
  console.log('  ⚠️  If hot reload doesn\'t work, restart the app from the device');
  console.log('  ⚠️  Press Ctrl+C to stop the server and restore config');
  console.log('');

  // ── Start Express Server ────────────────
  const serverPath = path.join(__dirname, '..', 'server.js');
  console.log(`  Starting Express server on port ${PORT}...`);
  console.log('');
  
  server = spawn('node', [serverPath], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env, PORT: String(PORT) }
  });

  server.on('close', (code) => {
    console.log(`  Server exited with code ${code}`);
    cleanup();
    process.exit(code);
  });
}

main();
