const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const DEFAULT_WORKING_DIR = path.join(os.homedir(), 'claude-api-bridge-workspace');
const MAX_MESSAGE_SIZE = 32 * 1024; // 32KB

// Find claude CLI binary
function findClaudeBinary() {
  const candidates = [
    'claude',
    '/usr/local/bin/claude',
    path.join(os.homedir(), '.claude', 'local', 'claude'),
    path.join(os.homedir(), '.local', 'bin', 'claude'),
  ];

  for (const bin of candidates) {
    try {
      require('child_process').execSync(`"${bin}" --version 2>/dev/null`, { encoding: 'utf-8' });
      return bin;
    } catch { /* continue */ }
  }
  return 'claude'; // fallback
}

const CLAUDE_BIN = findClaudeBinary();

/**
 * Execute a Claude Code CLI command
 * @param {string} message - The prompt to send
 * @param {object} options
 * @param {string} [options.sessionId] - Claude session ID for --resume
 * @param {string} [options.workingDir] - Working directory
 * @returns {Promise<{ response: string, sessionId: string|null }>}
 */
function execute(message, options = {}) {
  return new Promise((resolve, reject) => {
    if (!message || message.length > MAX_MESSAGE_SIZE) {
      return reject(new Error(`Message must be between 1 and ${MAX_MESSAGE_SIZE} bytes`));
    }

    const workingDir = options.workingDir || DEFAULT_WORKING_DIR;

    // Ensure working directory exists
    const fs = require('fs');
    if (!fs.existsSync(workingDir)) {
      fs.mkdirSync(workingDir, { recursive: true });
    }

    // Build claude command args
    const args = [
      '-p', // print mode (non-interactive)
      '--output-format', 'json',
      '--max-turns', '10',
      '--', // prevent message from being parsed as flag
      message,
    ];

    // Resume session if provided
    if (options.sessionId) {
      args.unshift('--resume', options.sessionId);
    }

    const child = spawn(CLAUDE_BIN, args, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300000, // 5 min timeout
      env: {
        ...process.env,
        // Disable interactive features
        CLAUDE_CODE_HEADLESS: '1',
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Claude CLI exited with code ${code}: ${stderr || stdout}`));
      }

      try {
        // Parse JSON output
        const result = JSON.parse(stdout);

        // Extract response text from result
        let responseText = '';
        let sessionId = null;

        if (result.session_id) {
          sessionId = result.session_id;
        }

        // Handle different output formats
        if (typeof result === 'string') {
          responseText = result;
        } else if (result.result) {
          responseText = result.result;
        } else if (result.content) {
          // Content can be array of blocks
          if (Array.isArray(result.content)) {
            responseText = result.content
              .filter((b) => b.type === 'text')
              .map((b) => b.text)
              .join('\n');
          } else {
            responseText = String(result.content);
          }
        } else {
          responseText = stdout;
        }

        resolve({ response: responseText, sessionId });
      } catch {
        // If not JSON, return raw output
        resolve({ response: stdout.trim(), sessionId: null });
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });
  });
}

module.exports = {
  execute,
  CLAUDE_BIN,
  MAX_MESSAGE_SIZE,
  DEFAULT_WORKING_DIR,
};
