// Multi-User Sync Client
// Handles lock acquisition, heartbeat, and polling for external changes

// Session identity
let sessionId = localStorage.getItem('classify_session_id');
if (!sessionId) {
  sessionId = crypto.randomUUID();
  localStorage.setItem('classify_session_id', sessionId);
}

// Use the authenticated username as the session name (injected by the server).
// Fall back to localStorage for any legacy sessions.
let sessionName = window.classifyUsername || localStorage.getItem('classify_session_name');
if (sessionName) {
  localStorage.setItem('classify_session_name', sessionName);
}

// Wrap native fetch to automatically add session ID header and handle 403 errors
const originalFetch = window.fetch;
window.fetch = async function(url, options = {}) {
  // Add session ID header to all requests
  options.headers = options.headers || {};
  if (options.headers instanceof Headers) {
    options.headers.set('X-Session-ID', sessionId);
  } else {
    options.headers['X-Session-ID'] = sessionId;
  }

  const response = await originalFetch(url, options);

  // Handle 401 - session expired or not logged in
  if (response.status === 401) {
    window.location.href = '/login';
    return response;
  }

  // Handle 403 - lock not held
  if (response.status === 403 && options.method && options.method !== 'GET') {
    const clone = response.clone();
    try {
      const data = await clone.json();
      if (data.error === 'Lock not held') {
        // Show friendly error modal
        const holder = window.lockStatus?.held_by || 'another user';
        showReadOnlyError(holder);
      }
    } catch (e) {
      // Not JSON or parsing failed, show generic error
      showReadOnlyError(window.lockStatus?.held_by || 'another user');
    }
  }

  return response;
};

function showReadOnlyError(holder) {
  // Create a modal overlay
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  modal.innerHTML = `
    <div style="background: var(--bg); border-radius: var(--rad); padding: 24px; max-width: 400px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
      <div style="font-size: 18px; font-weight: 600; margin-bottom: 12px; color: var(--ink);">
        Can't edit right now
      </div>
      <div style="font-size: 14px; line-height: 1.5; color: var(--ink-2); margin-bottom: 20px;">
        <strong>${holder}</strong> is currently editing. Wait for them to finish, or click <strong>"Request edit"</strong> in the top right to try taking over.
      </div>
      <button class="btn primary sm" onclick="this.closest('[style*=fixed]').remove()" style="width: 100%;">
        OK
      </button>
    </div>
  `;

  document.body.appendChild(modal);

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

// State - per-grade locks
window.gradeLocks = {};  // {grade_id: {locked, is_holder, held_by}}
window.currentGradeId = null;  // Currently viewing grade
let lastKnownTimestamp = null;
let heartbeatInterval = null;
let pollInterval = null;

// Initialize sync on page load
async function initSync() {
  // Session name comes from the authenticated username — no prompt needed.
  if (!sessionName) {
    sessionName = 'Unknown';
  }
  // Don't acquire lock here - will acquire when opening a grade
  // Start polling
  startPolling();
}


async function tryAcquireLock(grade_id) {
  if (!grade_id) return false;

  try {
    const response = await fetch('/api/lock/acquire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        held_by: sessionName,
        grade_id: grade_id
      })
    });

    const result = await response.json();

    if (result.ok) {
      // Lock acquired!
      window.gradeLocks[grade_id] = { locked: true, is_holder: true, held_by: sessionName };
      startHeartbeat(grade_id);
      updateLockUI();
      return true;
    } else {
      // Lock held by someone else
      window.gradeLocks[grade_id] = {
        locked: true,
        is_holder: false,
        held_by: result.held_by || 'another user'
      };
      updateLockUI();
      return false;
    }
  } catch (error) {
    console.error('Failed to acquire lock:', error);
    return false;
  }
}

async function releaseLock(grade_id) {
  try {
    await fetch('/api/lock/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, grade_id: grade_id })
    });

    if (grade_id) {
      window.gradeLocks[grade_id] = { locked: false, is_holder: false };
    }
    stopHeartbeat(grade_id);
    updateLockUI();
  } catch (error) {
    console.error('Failed to release lock:', error);
  }
}

function startHeartbeat(grade_id) {
  if (!grade_id) return;

  // Store interval per grade
  if (!window.heartbeatIntervals) window.heartbeatIntervals = {};

  stopHeartbeat(grade_id);
  window.heartbeatIntervals[grade_id] = setInterval(async () => {
    try {
      const response = await fetch('/api/lock/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, grade_id: grade_id })
      });

      if (!response.ok) {
        // Lost the lock
        console.warn(`Lost edit lock for ${grade_id}`);
        if (window.gradeLocks[grade_id]) {
          window.gradeLocks[grade_id].is_holder = false;
        }
        stopHeartbeat(grade_id);
        updateLockUI();
      }
    } catch (error) {
      console.error('Heartbeat failed:', error);
    }
  }, 10000); // Every 10 seconds
}

function stopHeartbeat(grade_id) {
  if (!window.heartbeatIntervals) return;

  if (grade_id) {
    if (window.heartbeatIntervals[grade_id]) {
      clearInterval(window.heartbeatIntervals[grade_id]);
      delete window.heartbeatIntervals[grade_id];
    }
  } else {
    // Stop all
    Object.values(window.heartbeatIntervals).forEach(interval => clearInterval(interval));
    window.heartbeatIntervals = {};
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
    const grade_id = window.currentGradeId;
    if (!grade_id) return;  // No grade open, nothing to poll

    // Get sync status and lock status for current grade
    const [syncResponse, lockResponse] = await Promise.all([
      fetch('/api/sync-status'),
      fetch(`/api/lock/status?session=${sessionId}&grade_id=${grade_id}`)
    ]);

    const syncStatus = await syncResponse.json();
    const lockStatus = await lockResponse.json();

    const oldLock = window.gradeLocks[grade_id] || {};
    const wasReadOnly = oldLock.locked && !oldLock.is_holder;

    // If lock just became free and we were waiting, try to acquire it
    if (wasReadOnly && !lockStatus.locked) {
      console.log(`Lock became free for ${grade_id}, attempting to acquire...`);
      await tryAcquireLock(grade_id);
      return;
    }

    // Update lock state from server
    window.gradeLocks[grade_id] = lockStatus;

    const nowReadOnly = lockStatus.locked && !lockStatus.is_holder;

    // If lock status changed, update UI
    if (wasReadOnly !== nowReadOnly) {
      updateLockUI();

      // If we just got the lock, start heartbeat
      if (!nowReadOnly && lockStatus.is_holder) {
        startHeartbeat(grade_id);
      } else if (nowReadOnly) {
        stopHeartbeat(grade_id);
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
  const grade_id = window.currentGradeId;
  if (!grade_id) {
    // No grade open - remove read-only mode and hide indicator
    document.body.classList.remove('read-only-mode');
    const indicator = document.getElementById('lock-indicator');
    if (indicator) { indicator.innerHTML = ''; indicator.style.display = 'none'; }
    return;
  }

  const lock = window.gradeLocks[grade_id] || {};
  const isReadOnly = lock.locked && !lock.is_holder;

  // Apply or remove read-only class
  if (isReadOnly) {
    document.body.classList.add('read-only-mode');
  } else {
    document.body.classList.remove('read-only-mode');
  }

  // Update lock indicator
  updateLockIndicator(lock);
}

function updateLockIndicator(lockStatus) {
  const indicator = document.getElementById('lock-indicator');
  if (!indicator) return;

  if (!window.currentGradeId) {
    indicator.innerHTML = '';
    indicator.style.display = 'none';
    return;
  }
  indicator.style.display = '';

  if (!lockStatus.locked) {
    // No lock
    indicator.innerHTML = `
      <span class="lock-dot free"></span>
      <span class="lock-text">Edit mode available</span>
    `;
  } else if (lockStatus.is_holder) {
    // We hold the lock - don't show timer since it jumps around due to polling/heartbeat
    indicator.innerHTML = `
      <span class="lock-dot active"></span>
      <span class="lock-text">Editing</span>
    `;
  } else {
    // Someone else holds the lock
    indicator.innerHTML = `
      <span class="lock-dot locked"></span>
      <span class="lock-text">Read-only — ${lockStatus.held_by} is editing</span>
      <button class="btn ghost sm read-only-allowed" onclick="tryTakeLock()" style="margin-left:8px;">Request edit</button>
    `;
  }
}

async function tryTakeLock() {
  const grade_id = window.currentGradeId;
  if (!grade_id) return;

  if (confirm('Try to take edit mode? This will only work if the other session has timed out.')) {
    const acquired = await tryAcquireLock(grade_id);

    const lock = window.gradeLocks[grade_id] || {};

    // Show feedback
    if (!acquired || !lock.is_holder) {
      // Failed to acquire
      alert(`Could not acquire edit mode. ${lock.held_by} is still actively editing.`);
    } else {
      // Success - we got the lock
      alert('Edit mode acquired! You can now make changes.');
    }
  }
}

// Release all locks on page unload
window.addEventListener('beforeunload', () => {
  // Release all locks for this session
  const data = JSON.stringify({ session_id: sessionId });
  navigator.sendBeacon('/api/lock/release', data);
});

// Export functions
window.initSync = initSync;
window.tryAcquireLock = tryAcquireLock;
window.releaseLock = releaseLock;
window.tryTakeLock = tryTakeLock;
window.sessionId = sessionId;
window.sessionName = sessionName;
