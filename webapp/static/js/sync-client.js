// Multi-User Sync Client
// Handles lock acquisition, heartbeat, and polling for external changes

// Session identity
let sessionId = localStorage.getItem('classify_session_id');
if (!sessionId) {
  sessionId = crypto.randomUUID();
  localStorage.setItem('classify_session_id', sessionId);
}

let sessionName = localStorage.getItem('classify_session_name');

// State
window.readOnlyMode = false;
window.lockStatus = { locked: false, is_holder: false };
let lastKnownTimestamp = null;
let heartbeatInterval = null;
let pollInterval = null;

// Initialize sync on page load
async function initSync() {
  // Prompt for session name if not set
  if (!sessionName) {
    const hostname = await getHostname();
    sessionName = prompt(`What should we call this device?\n\n(This name will be shown to other users when you're editing)`, hostname);
    if (sessionName) {
      localStorage.setItem('classify_session_name', sessionName);
    } else {
      sessionName = hostname;
    }
  }

  // Try to acquire lock
  await tryAcquireLock();

  // Start polling
  startPolling();
}

async function getHostname() {
  // Try to get a friendly hostname
  try {
    const hostname = window.location.hostname;
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return hostname;
    }
  } catch (e) {}
  return 'My Computer';
}

async function tryAcquireLock() {
  try {
    const response = await fetch('/api/lock/acquire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        held_by: sessionName
      })
    });

    const result = await response.json();

    if (result.ok) {
      // Lock acquired!
      window.readOnlyMode = false;
      window.lockStatus = { locked: true, is_holder: true, held_by: sessionName };
      startHeartbeat();
      updateLockUI();
    } else {
      // Lock held by someone else
      window.readOnlyMode = true;
      window.lockStatus = {
        locked: true,
        is_holder: false,
        held_by: result.held_by || 'another user'
      };
      updateLockUI();
    }
  } catch (error) {
    console.error('Failed to acquire lock:', error);
  }
}

async function releaseLock() {
  try {
    await fetch('/api/lock/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });

    window.readOnlyMode = true;
    window.lockStatus = { locked: false, is_holder: false };
    stopHeartbeat();
    updateLockUI();
  } catch (error) {
    console.error('Failed to release lock:', error);
  }
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatInterval = setInterval(async () => {
    try {
      const response = await fetch('/api/lock/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      });

      if (!response.ok) {
        // Lost the lock
        console.warn('Lost edit lock');
        window.readOnlyMode = true;
        stopHeartbeat();
        updateLockUI();
      }
    } catch (error) {
      console.error('Heartbeat failed:', error);
    }
  }, 10000); // Every 10 seconds
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

function startPolling() {
  stopPolling();
  pollInterval = setInterval(async () => {
    await pollForChanges();
  }, 3000); // Every 3 seconds
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

async function pollForChanges() {
  try {
    // Get sync status and lock status in parallel
    const [syncResponse, lockResponse] = await Promise.all([
      fetch('/api/sync-status'),
      fetch(`/api/lock/status?session=${sessionId}`)
    ]);

    const syncStatus = await syncResponse.json();
    const lockStatus = await lockResponse.json();

    // Update lock state
    const wasReadOnly = window.readOnlyMode;
    window.readOnlyMode = lockStatus.locked && !lockStatus.is_holder;
    window.lockStatus = lockStatus;

    // If lock status changed, update UI
    if (wasReadOnly !== window.readOnlyMode) {
      updateLockUI();

      // If we just got the lock, start heartbeat
      if (!window.readOnlyMode && lockStatus.is_holder) {
        startHeartbeat();
      } else if (window.readOnlyMode) {
        stopHeartbeat();
      }
    }

    // Check for external data changes
    if (syncStatus.timestamp !== lastKnownTimestamp &&
        syncStatus.changed_by !== sessionId) {
      lastKnownTimestamp = syncStatus.timestamp;

      // Reload current view if we're on a grade screen
      if (window.currentGrade && typeof showScreen === 'function') {
        console.log('External changes detected, refreshing...');
        await showScreen('students');
      }
    }

    // Update lock indicator
    updateLockIndicator(lockStatus);

  } catch (error) {
    console.error('Poll failed:', error);
  }
}

function updateLockUI() {
  // Apply or remove read-only class
  if (window.readOnlyMode) {
    document.body.classList.add('read-only-mode');
  } else {
    document.body.classList.remove('read-only-mode');
  }

  // Update lock indicator
  updateLockIndicator(window.lockStatus);
}

function updateLockIndicator(lockStatus) {
  const indicator = document.getElementById('lock-indicator');
  if (!indicator) return;

  if (!lockStatus.locked) {
    // No lock
    indicator.innerHTML = `
      <span class="lock-dot free"></span>
      <span class="lock-text">Edit mode available</span>
    `;
  } else if (lockStatus.is_holder) {
    // We hold the lock
    indicator.innerHTML = `
      <span class="lock-dot active"></span>
      <span class="lock-text">Editing (${lockStatus.expires_in}s)</span>
    `;
  } else {
    // Someone else holds the lock
    indicator.innerHTML = `
      <span class="lock-dot locked"></span>
      <span class="lock-text">Read-only — ${lockStatus.held_by} is editing</span>
      <button class="btn ghost sm" onclick="tryTakeLock()" style="margin-left:8px;">Request edit</button>
    `;
  }
}

async function tryTakeLock() {
  if (confirm('Try to take edit mode? This will only work if the other session has timed out.')) {
    await tryAcquireLock();
  }
}

// Release lock on page unload
window.addEventListener('beforeunload', () => {
  if (window.lockStatus?.is_holder) {
    // Use sendBeacon for reliable fire-and-forget
    const data = JSON.stringify({ session_id: sessionId });
    navigator.sendBeacon('/api/lock/release', data);
  }
});

// Export functions
window.initSync = initSync;
window.tryAcquireLock = tryAcquireLock;
window.releaseLock = releaseLock;
window.tryTakeLock = tryTakeLock;
window.sessionId = sessionId;
window.sessionName = sessionName;
