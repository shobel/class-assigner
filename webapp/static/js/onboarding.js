// Onboarding flow for new schools
// Normalization helpers — exposed globally so homeroom-app.js and transition.js can use them

let onboardingState = {
  schoolYear: '',
  rosterData: null,
  parsedRoster: {}
};

// Check if onboarding is needed
async function checkOnboarding() {
  const res = await fetch('/api/onboarding/status');
  const data = await res.json();

  if (data.needs_onboarding && window.classifyIsAdmin) {
    // Pre-fill suggested year
    onboardingState.schoolYear = data.suggested_year;
    document.getElementById('onboarding-year').value = data.suggested_year;

    // Show onboarding
    document.getElementById('onboardingOverlay').classList.add('open');
    return true;
  }

  return false;
}

// Handle file drop/selection
function setupDropZone() {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('rosterFile');

  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragging');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragging');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragging');

    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });
}

async function handleFile(file) {
  // Clear any previous errors/warnings
  hideError();

  if (!file.name.endsWith('.csv')) {
    showError('Please upload a CSV file');
    return;
  }

  const text = await file.text();
  parseRosterCSV(text);
}

function parseCSVLine(line) {
  // Simple CSV parser that handles quoted fields
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseRosterCSV(csvText) {
  const lines = csvText.trim().split('\n').filter(l => l.trim());

  if (lines.length < 2) {
    showError('CSV file is empty or has no data rows');
    return;
  }

  // Parse header
  const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());

  // Find required columns
  const nameIdx = headers.findIndex(h => h.includes('name') || h === 'student');
  const gradeIdx = headers.findIndex(h => h.includes('grade'));
  const genderIdx = headers.findIndex(h => h.includes('gender') || h.includes('sex'));

  if (nameIdx === -1) {
    showError(`CSV must have a "name" or "student" column. Found columns: ${headers.join(', ')}`);
    return;
  }

  if (gradeIdx === -1) {
    showError(`CSV must have a "grade" column. Found columns: ${headers.join(', ')}`);
    return;
  }

  // Find optional property columns from config
  const mathIdx = headers.findIndex(h => h.includes('math'));
  const readingIdx = headers.findIndex(h => h.includes('reading'));
  const behaviorIdx = headers.findIndex(h => h.includes('behavior') || h.includes('problematic'));
  const independenceIdx = headers.findIndex(h => h.includes('independence'));
  const iepIdx = headers.findIndex(h => h === 'iep');
  const plan504Idx = headers.findIndex(h => h === '504' || h.includes('504'));
  const eslIdx = headers.findIndex(h => h === 'esl' || h.includes('english') && h.includes('learner'));
  const gateIdx = headers.findIndex(h => h === 'gate' || h.includes('gifted'));
  const friendsIdx = headers.findIndex(h => h.includes('friend'));
  const incompatibleIdx = headers.findIndex(h => h.includes('incompatible'));

  // Parse rows
  const roster = {};
  let totalStudents = 0;
  const warnings = [];
  const skippedRows = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    const rowNum = i + 1;

    if (cells.length <= nameIdx || cells.length <= gradeIdx) {
      skippedRows.push(`Row ${rowNum}: not enough columns`);
      continue;
    }

    const name = cells[nameIdx];
    const gradeRaw = cells[gradeIdx];

    if (!name) {
      skippedRows.push(`Row ${rowNum}: missing name`);
      continue;
    }

    // Normalize grade name
    const gradeName = normalizeGradeName(gradeRaw);
    if (!gradeName) {
      skippedRows.push(`Row ${rowNum}: unrecognized grade "${gradeRaw}" (expected K-8, Kindergarten, 1st-8th, etc.)`);
      continue;
    }

    const gender = genderIdx !== -1 ? cells[genderIdx] : 'b';

    // Build student object
    const student = {
      name: name,
      gender: normalizeGender(gender),
      behavior: behaviorIdx !== -1 ? normalizeBehavior(cells[behaviorIdx]) : 'neutral',
      independence: independenceIdx !== -1 ? normalizeIndependence(cells[independenceIdx]) : 'neutral',
      iep: iepIdx !== -1 ? normalizeYesNo(cells[iepIdx]) === 'y' : false,
      '504': plan504Idx !== -1 ? normalizeYesNo(cells[plan504Idx]) === 'y' : false,
      esl: eslIdx !== -1 ? normalizeYesNo(cells[eslIdx]) === 'y' : false,
      gate: gateIdx !== -1 ? normalizeYesNo(cells[gateIdx]) === 'y' : false,
      math: mathIdx !== -1 ? normalizeLevelHML(cells[mathIdx]) : 'm',
      reading: readingIdx !== -1 ? normalizeLevelHML(cells[readingIdx]) : 'm',
      friends: friendsIdx !== -1 ? cells[friendsIdx].trim() : '',
      incompatible: incompatibleIdx !== -1 ? cells[incompatibleIdx].trim() : ''
    };

    if (!roster[gradeName]) {
      roster[gradeName] = [];
    }
    roster[gradeName].push(student);
    totalStudents++;
  }

  if (totalStudents === 0) {
    const errorDetails = skippedRows.length > 0
      ? `No valid students found. Issues:\n${skippedRows.slice(0, 5).join('\n')}${skippedRows.length > 5 ? `\n...and ${skippedRows.length - 5} more issues` : ''}`
      : 'No valid students found in CSV';
    showError(errorDetails);
    return;
  }

  // Show warnings if any rows were skipped
  if (skippedRows.length > 0) {
    const maxShow = 10;
    const errorList = skippedRows.slice(0, maxShow).join('\n');
    const moreCount = skippedRows.length - maxShow;
    const warningMsg = `Imported ${totalStudents} students successfully.\n\nSkipped ${skippedRows.length} row${skippedRows.length > 1 ? 's' : ''} with issues:\n\n${errorList}${moreCount > 0 ? `\n\n...and ${moreCount} more issue${moreCount > 1 ? 's' : ''}` : ''}`;
    showWarning(warningMsg);
    console.warn('Skipped rows:', skippedRows);
  }

  onboardingState.parsedRoster = roster;
  showPreview(roster, totalStudents);
}

function normalizeGradeName(grade) {
  const g = grade.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (g.includes('k') || g === '0') return 'Kindergarten';
  if (g === '1' || g === '1st' || g.includes('first')) return '1st Grade';
  if (g === '2' || g === '2nd' || g.includes('second')) return '2nd Grade';
  if (g === '3' || g === '3rd' || g.includes('third')) return '3rd Grade';
  if (g === '4' || g === '4th' || g.includes('fourth')) return '4th Grade';
  if (g === '5' || g === '5th' || g.includes('fifth')) return '5th Grade';
  if (g === '6' || g === '6th' || g.includes('sixth')) return '6th Grade';
  if (g === '7' || g === '7th' || g.includes('seventh')) return '7th Grade';
  if (g === '8' || g === '8th' || g.includes('eighth')) return '8th Grade';

  return null;
}

function normalizeGender(val) {
  const v = val.toLowerCase();
  if (v.startsWith('f') || v.startsWith('g') || v === 'girl' || v === 'female') return 'g';
  return 'b';
}

function normalizeYesNo(val) {
  const v = val.toLowerCase();
  if (v.startsWith('y') || v === '1' || v === 'true') return 'y';
  return 'n';
}

function normalizeLevelHML(val) {
  const v = val.toLowerCase();
  if (v.startsWith('h') || v === 'high' || v === '3') return 'h';
  if (v.startsWith('l') || v === 'low' || v === '1') return 'l';
  return 'm';
}

function normalizeBehavior(val) {
  if (!val || val.trim() === '') return 'neutral';
  const v = val.toLowerCase().trim();
  if (v.startsWith('c') || v === 'cooperative' || v === 'good') return 'cooperative';
  if (v.startsWith('d') || v === 'disruptive' || v === 'problematic' || v === 'bad' || v === 'y' || v === 'yes') return 'disruptive';
  return 'neutral';
}

function normalizeIndependence(val) {
  if (!val || val.trim() === '') return 'neutral';
  const v = val.toLowerCase().trim();
  if (v.startsWith('h') || v === 'high') return 'high';
  if (v.startsWith('l') || v === 'low') return 'low';
  return 'neutral';
}

// Expose normalization helpers globally
window.normalizeGradeName = normalizeGradeName;
window.normalizeGender = normalizeGender;
window.normalizeYesNo = normalizeYesNo;
window.normalizeLevelHML = normalizeLevelHML;
window.normalizeBehavior = normalizeBehavior;
window.normalizeIndependence = normalizeIndependence;

function showPreview(roster, totalStudents) {
  const gradeOrder = ['Kindergarten', '1st Grade', '2nd Grade', '3rd Grade', '4th Grade', '5th Grade', '6th Grade', '7th Grade', '8th Grade'];

  document.getElementById('preview-total').textContent = totalStudents;
  document.getElementById('preview-grades-count').textContent = Object.keys(roster).length;

  const gradesHtml = gradeOrder
    .filter(g => roster[g])
    .map(g => `
      <div class="preview-grade">
        <div class="preview-grade-name">${g}</div>
        <div class="preview-grade-count">${roster[g].length} students</div>
      </div>
    `).join('');

  document.getElementById('previewGrades').innerHTML = gradesHtml;
  document.getElementById('previewPanel').classList.add('visible');
  document.getElementById('confirmButton').disabled = false;
}

async function confirmImport() {
  const yearInput = document.getElementById('onboarding-year').value.trim();
  if (!yearInput) { showError('Please enter a school year'); return; }

  const btn = document.getElementById('confirmButton');
  btn.disabled = true;
  btn.textContent = 'Setting up…';

  try {
    const res = await fetch('/api/school-years/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: yearInput })
    });

    if (res.ok) {
      document.getElementById('onboardingOverlay').classList.remove('open');
      await loadConfig();
      await loadGrades();
      showScreen('welcome');
      // Show server URL modal before import wizard
      await showServerUrlModal();
      showImportModal('schoolYear');
    } else {
      const error = await res.json();
      showError(error.error || 'Failed to create school year');
      btn.disabled = false;
      btn.textContent = 'Set up school year →';
    }
  } catch (err) {
    showError('Network error: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Set up school year →';
  }
}

async function showServerUrlModal() {
  let url = window.location.origin;
  try {
    const r = await fetch('/api/server-info');
    if (r.ok) {
      const d = await r.json();
      url = d.url;
    }
  } catch (_) {}

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center;';

    const card = document.createElement('div');
    card.style.cssText = 'background:var(--bg);border:1px solid var(--line);border-radius:var(--rad-lg);padding:32px 36px;max-width:420px;width:90%;box-shadow:0 4px 24px rgba(0,0,0,0.12);';

    const mailtoBody = encodeURIComponent(`Hi,\n\nYou can access the class assignment tool at:\n${url}\n\nLog in with the credentials your admin set up for you.`);
    const mailtoLink = `mailto:?subject=${encodeURIComponent('Your class assignment tool access link')}&body=${mailtoBody}`;

    card.innerHTML = `
      <div style="font-family:'Instrument Serif',serif;font-style:italic;font-size:22px;margin-bottom:6px;">You're all set!</div>
      <div style="font-size:13px;color:var(--ink-3);margin-bottom:20px;line-height:1.5;">
        Share this address with your teachers so they can access Classify from any device on your school network.
      </div>
      <div style="background:var(--bg-2);border:1px solid var(--line);border-radius:var(--rad);padding:10px 14px;font-family:'JetBrains Mono',monospace;font-size:14px;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:16px;">
        <span id="srv-url-text" style="word-break:break-all;">${url}</span>
        <button onclick="navigator.clipboard.writeText('${url}').then(()=>{this.textContent='Copied!';setTimeout(()=>{this.textContent='Copy'},1500)})" style="flex-shrink:0;padding:4px 10px;background:var(--terra);color:#fff;border:none;border-radius:var(--rad);font-size:12px;cursor:pointer;font-family:inherit;">Copy</button>
      </div>
      <div style="display:flex;gap:8px;">
        <a href="${mailtoLink}" style="flex:1;text-align:center;padding:9px;background:var(--bg-2);border:1px solid var(--line);border-radius:var(--rad);font-size:13px;color:var(--ink-2);text-decoration:none;cursor:pointer;">✉ Email teachers</a>
        <button id="srv-url-done" style="flex:1;padding:9px;background:var(--terra);color:#fff;border:none;border-radius:var(--rad);font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;">Continue →</button>
      </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    document.getElementById('srv-url-done').addEventListener('click', () => {
      overlay.remove();
      resolve();
    });
  });
}

function showError(message) {
  const errorEl = document.getElementById('errorMessage');
  errorEl.textContent = message;
  errorEl.className = 'error-message visible';
}

function showWarning(message) {
  const errorEl = document.getElementById('errorMessage');
  errorEl.textContent = message;
  errorEl.className = 'error-message warning visible';
}

function hideError() {
  document.getElementById('errorMessage').classList.remove('visible');
}

// Export functions
window.checkOnboarding = checkOnboarding;
window.setupDropZone = setupDropZone;
window.confirmImport = confirmImport;
