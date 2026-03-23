const { spawn, execSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CLOUDFLARED_DIR = path.join(os.homedir(), '.claude-api-bridge', 'bin');

/**
 * Check if cloudflared is installed
 */
function findCloudflared() {
  // 1. Check system PATH
  try {
    execSync('cloudflared --version 2>/dev/null', { encoding: 'utf-8' });
    return 'cloudflared';
  } catch { /* continue */ }

  // 2. Check our local copy
  const localBin = path.join(CLOUDFLARED_DIR, 'cloudflared');
  if (fs.existsSync(localBin)) {
    return localBin;
  }

  return null;
}

/**
 * Download cloudflared binary
 */
async function downloadCloudflared() {
  const platform = os.platform();
  const arch = os.arch();

  let url;
  if (platform === 'darwin') {
    url = arch === 'arm64'
      ? 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz'
      : 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz';
  } else if (platform === 'linux') {
    url = arch === 'arm64'
      ? 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64'
      : 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64';
  } else if (platform === 'win32') {
    url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  console.log('  📥  Downloading cloudflared...');

  if (!fs.existsSync(CLOUDFLARED_DIR)) {
    fs.mkdirSync(CLOUDFLARED_DIR, { recursive: true });
  }

  const isTgz = url.endsWith('.tgz');
  const destFile = path.join(CLOUDFLARED_DIR, isTgz ? 'cloudflared.tgz' : (platform === 'win32' ? 'cloudflared.exe' : 'cloudflared'));

  // Download using curl (available on all target platforms)
  try {
    execSync(`curl -L -o "${destFile}" "${url}" 2>/dev/null`, { timeout: 120000 });
  } catch {
    throw new Error('Failed to download cloudflared. Please install it manually: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
  }

  if (isTgz) {
    // Extract tgz on macOS
    execSync(`tar -xzf "${destFile}" -C "${CLOUDFLARED_DIR}" 2>/dev/null`);
    fs.unlinkSync(destFile);
  }

  // Make executable
  const binPath = path.join(CLOUDFLARED_DIR, platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  if (platform !== 'win32') {
    fs.chmodSync(binPath, 0o755);
  }

  console.log('  ✅  cloudflared installed');
  return binPath;
}

/**
 * Start a Cloudflare quick tunnel (no account needed)
 * @param {number} port - Local port to tunnel
 * @returns {Promise<{ url: string, process: ChildProcess }>}
 */
async function startTunnel(port) {
  let bin = findCloudflared();
  if (!bin) {
    bin = await downloadCloudflared();
  }

  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['tunnel', '--url', `http://localhost:${port}`], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        reject(new Error('Cloudflare Tunnel connection timed out (30s)'));
      }
    }, 30000);

    // Parse URL from stderr (cloudflared outputs connection info there)
    child.stderr.on('data', (data) => {
      const output = data.toString();

      // Look for the tunnel URL
      const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({ url: match[0], process: child });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      if (!resolved) {
        reject(new Error(`Failed to start cloudflared: ${err.message}`));
      }
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (!resolved) {
        reject(new Error(`cloudflared exited with code ${code}`));
      }
    });
  });
}

module.exports = {
  findCloudflared,
  downloadCloudflared,
  startTunnel,
};
