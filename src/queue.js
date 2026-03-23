const db = require('./db');
const claude = require('./claude');

let isProcessing = false;
let currentRequestId = null;

const MAX_QUEUE_SIZE = 50;

/**
 * Add a request to the queue
 */
function enqueue({ requestId, tokenId, message, sessionMode, sessionId }) {
  const queueLen = db.getQueueLength();
  if (queueLen >= MAX_QUEUE_SIZE) {
    throw new Error('Queue is full. Please try again later.');
  }

  db.createRequest({
    id: requestId,
    tokenId,
    message,
    sessionId,
  });

  // Start processing if idle
  processNext();

  return { position: queueLen + 1 };
}

/**
 * Process the next request in the queue
 */
async function processNext() {
  if (isProcessing) return;

  const queued = db.getQueuedRequests();
  if (queued.length === 0) return;

  const request = queued[0];
  isProcessing = true;
  currentRequestId = request.id;

  try {
    db.updateRequest(request.id, { status: 'processing' });

    // Get token info for session mode
    const token = db.verifyToken ? null : null; // Token already validated at API layer

    // Build execution options
    const options = {};

    // Handle stateful sessions
    if (request.session_id) {
      const session = db.getOrCreateSession(request.token_id, claude.DEFAULT_WORKING_DIR);
      if (session.claude_session_id) {
        options.sessionId = session.claude_session_id;
      }
      options.workingDir = session.working_dir || claude.DEFAULT_WORKING_DIR;
    }

    console.log(`  ⚡  Processing request ${request.id.substring(0, 8)}...`);

    const result = await claude.execute(request.message, options);

    // Update session ID if returned
    if (result.sessionId && request.session_id) {
      db.updateSessionClaudeId(request.session_id, result.sessionId);
    }

    db.updateRequest(request.id, {
      status: 'completed',
      response: result.response,
    });

    console.log(`  ✅  Request ${request.id.substring(0, 8)} completed`);

  } catch (err) {
    console.error(`  ❌  Request ${request.id.substring(0, 8)} failed: ${err.message}`);

    db.updateRequest(request.id, {
      status: 'error',
      error: err.message,
    });

  } finally {
    isProcessing = false;
    currentRequestId = null;

    // Process next in queue
    setImmediate(processNext);
  }
}

function getStatus() {
  return {
    isProcessing,
    currentRequestId,
    queueLength: db.getQueueLength(),
  };
}

module.exports = {
  enqueue,
  processNext,
  getStatus,
  MAX_QUEUE_SIZE,
};
