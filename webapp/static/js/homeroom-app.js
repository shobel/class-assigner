// Homeroom App - Main Controller

let currentGrade = null;
let currentScreen = 'welcome';
let currentStudentTab = 'roster'; // roster, friendships, incompatibilities
let grades = [];
let config = {
  enabled: { gender: true, problematic: true, specialNeeds: true, mathLevel: true, readingLevel: true },
  weights: { gender: 3, problematic: 5, specialNeeds: 5, mathLevel: 4, readingLevel: 4, friend: 2 },
  school_name: 'School',
  school_year: '2025–26'
};

// Load config from server
async function loadConfig() {
  const res = await fetch('/api/config');
  config = await res.json();

  // Load available school years
  const yearsRes = await fetch('/api/school-years');
  const yearsData = await yearsRes.json();

  // Update school year list
  const yearNav = document.getElementById('schoolYearNav');
  const years = yearsData.years.length > 0 ? yearsData.years : [config.school_year];

  yearNav.innerHTML = years.map(year => `
    <div class="nav-item ${year === yearsData.active ? 'active' : ''}" onclick="switchSchoolYear('${year}')">
      <span class="nav-label">${year}</span>
      ${year === yearsData.current ? '<span class="nav-count" style="font-size: 9px; padding: 2px 5px;">current</span>' : ''}
      ${year === yearsData.active ? `<button class="nav-clear" onclick="event.stopPropagation(); clearSchoolYear('${year}')" title="Clear all data"><span style="font-size: 9px; opacity: 0.7;">[dev]</span> ×</button>` : ''}
    </div>
  `).join('');

  // Update UI elements
  document.getElementById('crumb-school').textContent = config.school_name || 'School';
}

// Switch school year
async function switchSchoolYear(year) {
  await fetch(`/api/school-years/${year}`, { method: 'POST' });
  await loadConfig();
  await loadGrades();
  showScreen(currentScreen); // Refresh current screen
}

// Create next school year
async function createNextYear() {
  showTransitionWizard();
}

// Clear school year data
async function clearSchoolYear(year) {
  if (!confirm(`⚠️ Clear all data for ${year}?\n\nThis will delete all students, grades, and assignments for this school year. This action cannot be undone.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/school-years/${year}/clear`, { method: 'POST' });
    if (res.ok) {
      // Reload the page to trigger onboarding if no years exist
      window.location.reload();
    } else {
      alert('Failed to clear school year data');
    }
  } catch (err) {
    console.error('Error clearing school year:', err);
    alert('Error clearing school year data');
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Check if onboarding is needed
  const needsOnboarding = await checkOnboarding();

  if (!needsOnboarding) {
    // Normal app flow
    await loadConfig();
    await loadGrades();
    showScreen('welcome');
  } else {
    // Setup onboarding UI
    setupDropZone();
  }
});

// Load grades from server
async function loadGrades() {
  const res = await fetch('/api/grades');
  grades = await res.json();
  renderGradeNav();
  updateStudentCount();
}

// Render grade navigation
function renderGradeNav() {
  const nav = document.getElementById('gradeNav');
  nav.innerHTML = grades.map(g => {
    let statusText = '';
    if (g.status === 'assigned') {
      statusText = `${g.classes} class${g.classes !== 1 ? 'es' : ''}`;
    } else if (g.status === 'imported') {
      statusText = 'not assigned';
    } else {
      statusText = 'empty';
    }

    return `
    <div class="grade-row ${g.id === currentGrade?.id ? 'active' : ''}" onclick="selectGrade('${g.id}')">
      <div>
        <div class="gn">${g.name}</div>
        <div class="gm">
          ${g.students} student${g.students !== 1 ? 's' : ''} · ${statusText}
        </div>
      </div>
    </div>
  `;
  }).join('');
}

// Select grade
function selectGrade(gradeId) {
  currentGrade = grades.find(g => g.id === gradeId);
  renderGradeNav();
  showScreen(currentGrade.students === 0 ? 'import' : 'students');
}

// Update student count in topbar
function updateStudentCount() {
  const total = grades.reduce((sum, g) => sum + g.students, 0);
  document.getElementById('student-count').textContent = total;
}

// Grade settings modal
let currentGradeSettings = null;

async function showGradeSettings(gradeId) {
  const grade = grades.find(g => g.id === gradeId);
  if (!grade) return;

  // Fetch full grade data
  const res = await fetch(`/api/grades/${gradeId}/students`);
  const data = await res.json();

  currentGradeSettings = {
    gradeId: gradeId,
    num_classes: data.num_classes || 5,
    min_students: data.min_students || 18,
    max_students: data.max_students || 26,
    enforce_class_size: data.enforce_class_size === true // default to false (soft constraint)
  };

  document.getElementById('gradeSettingsTitle').textContent = `${grade.name} Settings`;
  document.getElementById('gradeSettingsBody').innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 20px;">
      <div>
        <label style="display: block; font-weight: 500; margin-bottom: 8px;">Number of classes</label>
        <input type="number" id="numClasses" value="${currentGradeSettings.num_classes}" min="1" max="10"
          style="width: 100px; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font: inherit;">
        <p style="font-size: 12px; color: var(--ink-3); margin-top: 4px;">How many classes to create for this grade</p>
      </div>

      <div>
        <label style="display: block; font-weight: 500; margin-bottom: 8px;">Class size constraints</label>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <label style="display: block; font-size: 12px; color: var(--ink-3); margin-bottom: 4px;">Minimum per class</label>
            <input type="number" id="minStudents" value="${currentGradeSettings.min_students}" min="1" max="50"
              style="width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font: inherit;">
          </div>
          <div>
            <label style="display: block; font-size: 12px; color: var(--ink-3); margin-bottom: 4px;">Maximum per class</label>
            <input type="number" id="maxStudents" value="${currentGradeSettings.max_students}" min="1" max="50"
              style="width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font: inherit;">
          </div>
        </div>

        <div style="margin-top: 12px; padding: 12px; background: var(--bg-2); border-radius: 6px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="checkbox" id="enforceClassSize" ${currentGradeSettings.enforce_class_size ? 'checked' : ''}
              style="width: 16px; height: 16px; cursor: pointer;">
            <span style="font-size: 12px; font-weight: 500;">Enforce as hard constraint</span>
          </label>
          <p style="font-size: 11px; color: var(--ink-3); margin: 6px 0 0 24px; line-height: 1.4;">
            <strong>Checked:</strong> Optimizer fails if limits can't be met<br>
            <strong>Unchecked:</strong> Optimizer tries its best but allows flexibility
          </p>
        </div>
      </div>
    </div>
  `;

  document.getElementById('gradeSettingsModal').classList.add('open');
}

function closeGradeSettings() {
  document.getElementById('gradeSettingsModal').classList.remove('open');
  currentGradeSettings = null;
}

async function saveGradeSettings() {
  if (!currentGradeSettings) return;

  const numClasses = parseInt(document.getElementById('numClasses').value);
  const minStudents = parseInt(document.getElementById('minStudents').value);
  const maxStudents = parseInt(document.getElementById('maxStudents').value);
  const enforceClassSize = document.getElementById('enforceClassSize').checked;

  if (minStudents > maxStudents) {
    alert('Minimum students cannot be greater than maximum students');
    return;
  }

  // Save to server
  try {
    const res = await fetch(`/api/grades/${currentGradeSettings.gradeId}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        num_classes: numClasses,
        min_students: minStudents,
        max_students: maxStudents,
        enforce_class_size: enforceClassSize
      })
    });

    if (res.ok) {
      closeGradeSettings();
      await loadGrades();
      // Refresh current screen to show updated settings
      if (currentScreen === 'results') {
        await showScreen('results');
      }
    } else {
      alert('Failed to save settings');
    }
  } catch (err) {
    console.error('Error saving settings:', err);
    alert('Error saving settings');
  }
}

// Show screen
async function showScreen(screen) {
  currentScreen = screen;

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  if (screen === 'config') document.getElementById('nav-config')?.classList.add('active');
  if (screen === 'welcome') document.getElementById('nav-welcome')?.classList.add('active');

  // Update breadcrumbs
  document.getElementById('crumb-grade').textContent = currentGrade?.name || '...';
  const screenNames = {
    welcome: 'Welcome',
    config: 'Configuration',
    import: 'Import students',
    students: 'Roster',
    results: 'Class assignments'
  };
  document.getElementById('crumb-screen').textContent = screenNames[screen] || screen;

  // Render screen
  const main = document.getElementById('mainContent');
  const detailPanel = document.getElementById('detailPanel');

  let content = '';
  if (screen === 'welcome') {
    content = renderWelcomeScreen();
  } else if (screen === 'config') {
    content = renderConfigScreen();
  } else if (screen === 'students') {
    content = await renderStudentsScreen();
  } else if (screen === 'results') {
    content = await renderResultsScreen();
  }

  // Update content but preserve detail panel
  main.innerHTML = content;
  if (detailPanel) {
    main.appendChild(detailPanel);
  }
}

// Welcome Screen
function renderWelcomeScreen() {
  const totalStudents = grades.reduce((sum, g) => sum + g.students, 0);
  const totalGrades = grades.length;

  return `
    <div class="welcome">
      <div class="muted" style="font-family:var(--t-mono); font-size:11px; letter-spacing:0.07em; text-transform:uppercase; margin-bottom:18px">
        Class Assignment Optimizer · ${totalGrades} grade${totalGrades !== 1 ? 's' : ''} · ${totalStudents} students
      </div>
      <h1>Three steps to <em>balanced</em> classes.</h1>
      <p class="lede">
        Manual class assignment means juggling gender, behavior, special needs, math and reading levels — plus
        keeping friends together and difficult pairs apart. Homeroom solves it all at once with a constraint solver,
        in about thirty seconds.
      </p>

      <div class="steps">
        <div class="step">
          <span class="num">i.</span>
          <h3>Configure rules</h3>
          <p>Tell the optimizer which factors matter most by setting priority weights. Saved per‑school.</p>
          <div style="flex:1"></div>
          <button class="btn sm" onclick="showScreen('config')">Open rules →</button>
        </div>
        <div class="step">
          <span class="num">ii.</span>
          <h3>Import a grade</h3>
          <p>Drop in a CSV. Map the columns. Preview the first rows before you commit.</p>
          <div style="flex:1"></div>
          <button class="btn sm" onclick="showImportModal()">Import students →</button>
        </div>
        <div class="step">
          <span class="num">iii.</span>
          <h3>Run the solver</h3>
          <p>One click. Watch the phases. Get a balance report you can defend in any meeting.</p>
          <div style="flex:1"></div>
          <button class="btn sm" onclick="selectGrade('${grades[0]?.id}')" ${!grades[0] ? 'disabled' : ''}>${grades[0] ? `View ${grades[0].name}` : 'Import a grade first'} →</button>
        </div>
      </div>

      <div class="panel">
        <div class="panel-h">
          <h3>What Homeroom balances</h3>
          <span class="sub">6 factors · 1 hard constraint</span>
        </div>
        <div class="panel-b" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:14px">
          <div style="display:flex; flex-direction:column; gap:2px">
            <div style="font-weight:500; font-size:13px">Gender</div>
            <div class="muted" style="font-size:12px">Even split of girls and boys per class</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:2px">
            <div style="font-weight:500; font-size:13px">Problematic students</div>
            <div class="muted" style="font-size:12px">Avoid clustering of behavioral challenges</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:2px">
            <div style="font-weight:500; font-size:13px">Special needs</div>
            <div class="muted" style="font-size:12px">Spread support requirements evenly</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:2px">
            <div style="font-weight:500; font-size:13px">Math level</div>
            <div class="muted" style="font-size:12px">Mix high / medium / low across classes</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:2px">
            <div style="font-weight:500; font-size:13px">Reading level</div>
            <div class="muted" style="font-size:12px">Same — but for reading proficiency</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:2px">
            <div style="font-weight:500; font-size:13px">Friend placement</div>
            <div class="muted" style="font-size:12px">Keep at least one friend per student where possible</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Config Screen
function renderConfigScreen() {
  return `
    <div class="canvas">
      <div class="page-hd">
        <div>
          <h1>Rules &amp; <em>weights</em></h1>
          <p class="lede">How aggressively the optimizer should balance each factor. Higher weight wins ties when constraints compete.</p>
        </div>
        <div class="acts">
          <button class="btn ghost">↻ Reset defaults</button>
          <button class="btn primary">✓ Saved</button>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px;">
        <div class="panel">
          <div class="panel-h">
            <h3>Balancing factors</h3>
            <span class="sub">${config.properties?.filter(p => p.enabled !== false).length || 0} active</span>
          </div>
          <div class="panel-b">
            ${renderWeightSliders()}
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 14px;">
          <div class="panel">
            <div class="panel-h">
              <h3>About weights</h3>
              <span class="sub">soft constraints</span>
            </div>
            <div class="panel-b">
              <p style="font-size: 12px; color: var(--ink-3); line-height: 1.5; margin-bottom: 12px;">
                All weights are <b>soft constraints</b> — the optimizer tries to satisfy them but will compromise if needed. Higher weights win when factors compete.
              </p>
              <p style="font-size: 12px; color: var(--ink-3); line-height: 1.5;">
                <b>Critical</b> weight means "try very hard," but it's still flexible if mathematically impossible.
              </p>
            </div>
          </div>

          <div class="panel">
            <div class="panel-h">
              <h3>Hard constraints</h3>
              <span class="sub">must satisfy</span>
            </div>
            <div class="panel-b">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span>Incompatibility list</span>
                <span class="badge" style="background: var(--rose); color: white; font-size: 9px; padding: 2px 6px; border-radius: 3px;">ENFORCED</span>
              </div>
              <p style="font-size: 11.5px; color: var(--ink-3); line-height: 1.5;">
                Incompatible students are <b>never</b> placed together. The optimizer will fail if this cannot be satisfied — no compromises.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderWeightSliders() {
  if (!config.properties) return '<p style="color: var(--ink-3);">Loading...</p>';

  const descriptions = {
    gender: 'Even distribution of girls and boys per class.',
    behavior: 'Balance cooperative and disruptive behaviors.',
    independence: 'Distribute high and low independence levels.',
    iep: 'Spread IEP students evenly across classes.',
    '504': 'Balance 504 plan students across classes.',
    esl: 'Distribute ESL students evenly.',
    gate: 'Balance GATE students across classes.',
    math: 'Balance high / medium / low math levels.',
    reading: 'Balance reading proficiency tiers.',
    friends: 'Keep friends together when possible (soft constraint).'
  };

  return config.properties.map(prop => {
    const weight = Math.round(prop.weight / 20); // Convert 0-100 to 0-5 scale
    const enabled = prop.enabled !== false; // Default to true if not specified
    return `
    <div style="padding: 12px 0; border-bottom: 1px solid var(--line-soft); ${!enabled ? 'opacity: 0.5;' : ''}">
      <div style="display: grid; grid-template-columns: 40px 160px 1fr 80px; gap: 12px; align-items: center;">
        <label class="toggle">
          <input type="checkbox" ${enabled ? 'checked' : ''} onchange="toggleProperty('${prop.name}', this.checked)">
          <span class="toggle-slider"></span>
        </label>
        <div>
          <div style="font-weight: 500; font-size: 13px; color: var(--terra);">${prop.display_name}</div>
          <div style="font-size: 11px; color: var(--ink-3);">${descriptions[prop.name] || ''}</div>
        </div>
        <input type="range" min="0" max="5" step="1" class="slider" value="${weight}" onchange="updateWeight('${prop.name}', this.value)" ${!enabled ? 'disabled' : ''}>
        <div style="font-family: var(--t-mono); font-size: 10px; text-align: right; text-transform: uppercase; color: var(--terra);">
          ${['Off', 'Low', 'Mild', 'Medium', 'High', 'Critical'][weight]}
        </div>
      </div>
    </div>
    `;
  }).join('');
}

async function updateWeight(key, value) {
  const weight = parseInt(value) * 20; // Convert 0-5 scale back to 0-100

  if (key === 'friend') {
    config.friend_weight = weight;
  } else {
    // Update property weight
    const prop = config.properties.find(p => p.name === key);
    if (prop) {
      prop.weight = weight;
    }
  }

  // Save to server
  await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });

  if (currentScreen === 'config') {
    showScreen('config'); // Re-render
  }
}

async function toggleProperty(propertyName, enabled) {
  const prop = config.properties.find(p => p.name === propertyName);
  if (prop) {
    prop.enabled = enabled;
  }

  // Save to server
  await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });

  // Refresh the config screen
  showScreen('config');
}

// Students Screen
async function renderStudentsScreen() {
  // Fetch students for current grade
  const res = await fetch(`/api/grades/${currentGrade.id}/students`);
  const data = await res.json();
  const students = data.students || [];

  // Also check if assignments exist
  const assignRes = await fetch(`/api/grades/${currentGrade.id}/assignments`);
  const assignData = await assignRes.json();
  const hasAssignments = assignData.assignments && assignData.assignments.length > 0;

  // Store assignments globally so roster tab can access them
  if (hasAssignments) {
    window.currentAssignments = assignData.assignments;
  }

  if (students.length === 0) {
    return `
      <div class="canvas">
        <div style="text-align: center; padding: 80px 20px;">
          <p style="color: var(--ink-3); font-size: 15px;">No students imported yet</p>
          <button class="btn terra" style="margin-top: 20px;" onclick="showImportModal()">📥 Import Students</button>
        </div>
      </div>
    `;
  }

  // Calculate stats
  const girls = students.filter(s => s.gender === 'g').length;
  const boys = students.filter(s => s.gender === 'b').length;
  const iepCount = students.filter(s => s.iep === true || s.iep === 'true').length;
  const plan504Count = students.filter(s => s['504'] === true || s['504'] === 'true').length;
  const eslCount = students.filter(s => s.esl === true || s.esl === 'true').length;
  const gateCount = students.filter(s => s.gate === true || s.gate === 'true').length;

  // Store students globally for detail panel
  window.currentStudents = students;

  return `
    <div class="canvas">
      <!-- Page Title -->
      <div class="page-title">
        <h1>${currentGrade.name} <span class="year-label">${config.active_school_year || config.school_year}</span></h1>
      </div>

      <!-- Grade tabs -->
      <div class="grade-tabs">
        <button class="grade-tab on">
          <em>Roster</em> <span class="gt-count">${students.length} students</span>
        </button>
        <button class="grade-tab" onclick="showScreen('results')">
          Assignment <span class="gt-count">${hasAssignments ? `${assignData.num_classes} classes` : 'not run'}</span>
        </button>
        <div class="grade-meta">
          <button class="btn ghost" onclick="showImportModal()">↑ Re‑import</button>
          <button class="btn ghost" onclick="exportCSV()">↓ Export</button>
          <button class="btn terra" onclick="runAssignment()">▶ Run optimizer</button>
        </div>
      </div>

      <!-- Quick stats strip -->
      <div class="panel" style="margin-bottom: 16px;">
        <div class="panel-b stats-strip">
          <div class="stat">
            <div class="stat-label">Total</div>
            <div class="stat-value">${students.length}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Girls</div>
            <div class="stat-value">${girls}</div>
            <div class="stat-sub">${Math.round(girls/students.length*100)}%</div>
          </div>
          <div class="stat">
            <div class="stat-label">Boys</div>
            <div class="stat-value">${boys}</div>
            <div class="stat-sub">${Math.round(boys/students.length*100)}%</div>
          </div>
          <div class="stat">
            <div class="stat-label">IEP</div>
            <div class="stat-value">${iepCount}</div>
          </div>
          <div class="stat">
            <div class="stat-label">504 Plan</div>
            <div class="stat-value">${plan504Count}</div>
          </div>
          <div class="stat">
            <div class="stat-label">ESL</div>
            <div class="stat-value">${eslCount}</div>
          </div>
          <div class="stat">
            <div class="stat-label">GATE</div>
            <div class="stat-value">${gateCount}</div>
          </div>
        </div>
      </div>

      <!-- Secondary tabs -->
      <div class="tabs">
        <button class="tab ${currentStudentTab === 'roster' ? 'active' : ''}" onclick="switchStudentTab('roster')">Roster <span class="ct">${students.length}</span></button>
        <button class="tab ${currentStudentTab === 'friendships' ? 'active' : ''}" onclick="switchStudentTab('friendships')">Friendships <span class="ct">${students.reduce((sum, s) => sum + (s.friends ? s.friends.split(',').filter(f => f.trim()).length : 0), 0)}</span></button>
        <button class="tab ${currentStudentTab === 'incompatibilities' ? 'active' : ''}" onclick="switchStudentTab('incompatibilities')">Incompatibilities <span class="ct">${students.reduce((sum, s) => sum + (s.incompatible ? s.incompatible.split(',').filter(f => f.trim()).length : 0), 0)}</span></button>
      </div>

      <!-- Tab content -->
      <div id="studentTabContent">
        ${renderStudentTabContent(students)}
      </div>
    </div>
  `;
}

// Render content based on active tab
function renderStudentTabContent(students) {
  if (currentStudentTab === 'roster') {
    return renderRosterTab(students);
  } else if (currentStudentTab === 'friendships') {
    return renderFriendshipsTab(students);
  } else if (currentStudentTab === 'incompatibilities') {
    return renderIncompatibilitiesTab(students);
  }
}

// Switch student tab
function switchStudentTab(tab) {
  currentStudentTab = tab;
  showScreen('students'); // Re-render
}

// Roster tab (original student list)
function renderRosterTab(students) {
  // Get all properties from config
  const properties = config.properties?.filter(p => p.enabled && p.type !== 'relationship') || [];

  // Check if assignments exist
  const hasAssignments = window.currentAssignments && window.currentAssignments.length > 0;

  // Build dynamic column headers
  const numColumns = 2 + properties.length + (hasAssignments ? 1 : 0) + 1; // avatar + name + properties + [assigned class] + arrow
  const gridColumns = `40px 1.5fr ${properties.map(p => '100px').join(' ')} ${hasAssignments ? '100px ' : ''}40px`;

  // Auto-sort by name
  const sortedStudents = [...students].sort((a, b) => a.name.localeCompare(b.name));

  return `
      <div class="panel">
        <div class="panel-h" style="padding: 10px 16px;">
          <div style="display: flex; gap: 10px; align-items: center;">
            <input class="search-input" placeholder="Search students…" onkeyup="filterStudents(this.value)" />
          </div>
          <span class="sub">${students.length} shown</span>
        </div>

        <div class="student-list" style="border-top: 1px solid var(--line-soft); overflow-x: auto;">
          <!-- Header row -->
          <div class="student-row" style="padding: 7px 12px; background: var(--bg-2); cursor: default; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-3); font-weight: 500; display: grid; grid-template-columns: ${gridColumns}; gap: 10px;">
            <div></div>
            <div>Student</div>
            ${properties.map(p => `<div>${p.display_name === '504 Plan' ? '504' : p.display_name}</div>`).join('')}
            ${hasAssignments ? '<div>Assigned</div>' : ''}
            <div></div>
          </div>
          <!-- Student rows -->
          ${sortedStudents.map(s => {
            const initials = s.name.split(' ').map(n => n[0]).join('');

            // Find assigned class if exists
            let assignedClass = null;
            if (hasAssignments) {
              const assignment = window.currentAssignments.find(a => a.name === s.name);
              if (assignment) {
                assignedClass = assignment.assigned_class;
              }
            }

            return `
              <div class="student-row" data-student-name="${s.name.replace(/"/g, '&quot;')}" onclick="showStudentDetail(this.getAttribute('data-student-name'))" style="display: grid; grid-template-columns: ${gridColumns}; gap: 10px;">
                <div class="avatar ${s.gender}">${initials}</div>
                <div><div class="sn">${s.name}</div></div>
                ${properties.map(p => {
                  const value = s[p.name];
                  const displayValue = formatPropertyValue(p, value);
                  return `<div style="text-align: center;">${displayValue}</div>`;
                }).join('')}
                ${hasAssignments ? `<div style="text-align: center;"><span class="chip" style="font-size: 10px; background: var(--bg-3); font-weight: 600;">Class ${assignedClass || '—'}</span></div>` : ''}
                <div style="display:flex; align-items:center; justify-content:flex-end;">
                  <span style="color: var(--ink-4);">›</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
  `;
}

// Helper to format property values for display
function formatPropertyValue(property, value) {
  if (!value) return '—';

  // Boolean properties
  if (typeof value === 'boolean' || value === 'true' || value === 'false') {
    const isTrue = value === true || value === 'true';
    // Show the property display name, but shorten "504 Plan" to "504"
    const displayText = property.display_name === '504 Plan' ? '504' : property.display_name;
    return isTrue ? `<span class="chip" style="font-size: 9px; background: var(--terra-soft); color: var(--terra-ink); padding: 2px 6px;">${displayText}</span>` : '—';
  }

  // Level properties (h/m/l)
  if (['h', 'm', 'l'].includes(value)) {
    const labels = { h: 'High', m: 'Med', l: 'Low' };
    const colors = { h: 'high', m: 'med', l: 'low' };
    return `<span class="chip ${colors[value]}" style="font-size: 10px;">${labels[value]}</span>`;
  }

  // String values
  return `<span style="font-size: 11px;">${value}</span>`;
}

// Friendships tab
function renderFriendshipsTab(students) {
  // Build friendship list grouped by student
  const studentFriendships = [];

  students.forEach(student => {
    if (student.friends) {
      const friendNames = student.friends.split(',').map(f => f.trim()).filter(f => f);
      if (friendNames.length > 0) {
        // Check which friends exist in roster
        const friendsData = friendNames.map(friendName => {
          const found = students.find(s => s.name === friendName);
          return {
            name: friendName,
            found: !!found
          };
        });

        studentFriendships.push({
          studentName: student.name,
          friends: friendsData,
          count: friendNames.length
        });
      }
    }
  });

  // Sort by student name
  studentFriendships.sort((a, b) => a.studentName.localeCompare(b.studentName));

  const totalConnections = studentFriendships.reduce((sum, sf) => sum + sf.count, 0);

  return `
    <div class="panel">
      <div class="panel-h" style="padding: 10px 16px;">
        <span class="sub">${studentFriendships.length} students with friends · ${totalConnections} total connections</span>
      </div>

      <div class="student-list" style="border-top: 1px solid var(--line-soft);">
        <!-- Header row -->
        <div class="student-row" style="padding: 7px 12px; background: var(--bg-2); cursor: default; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-3); font-weight: 500; grid-template-columns: 200px 1fr;">
          <div>Student</div>
          <div>Friends</div>
        </div>

        ${studentFriendships.length === 0 ? `
          <div style="padding: 40px; text-align: center; color: var(--ink-3);">
            No friendships defined yet
          </div>
        ` : studentFriendships.map(sf => `
          <div class="student-row" style="grid-template-columns: 200px 1fr; align-items: start;">
            <div onclick="showStudentDetail('${sf.studentName.replace(/'/g, "\\'")}')" style="cursor: pointer; padding-top: 2px;">
              <div class="sn">${sf.studentName}</div>
              <div class="sm" style="color: var(--ink-3);">${sf.count} friend${sf.count !== 1 ? 's' : ''}</div>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px; padding-top: 2px;">
              ${sf.friends.map(friend => `
                <span
                  class="friend-pill"
                  style="
                    display: inline-block;
                    padding: 4px 10px;
                    background: ${friend.found ? 'var(--bg-3)' : 'var(--rose-soft)'};
                    border: 1px solid ${friend.found ? 'var(--line-soft)' : 'var(--rose)'};
                    border-radius: 12px;
                    font-size: 12px;
                    color: ${friend.found ? 'var(--ink)' : 'var(--rose)'};
                    cursor: ${friend.found ? 'pointer' : 'default'};
                    transition: all 0.15s;
                  "
                  ${friend.found ? `onclick="showStudentDetail('${friend.name.replace(/'/g, "\\'")}')"` : ''}
                  ${friend.found ? 'onmouseover="this.style.background=\'var(--terra-soft)\'; this.style.borderColor=\'var(--terra)\'"' : ''}
                  ${friend.found ? 'onmouseout="this.style.background=\'var(--bg-3)\'; this.style.borderColor=\'var(--line-soft)\'"' : ''}
                >
                  ${friend.name}${!friend.found ? ' ⚠' : ''}
                </span>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Incompatibilities tab
function renderIncompatibilitiesTab(students) {
  // Build incompatibility list grouped by student
  const studentIncompatibilities = [];

  students.forEach(student => {
    if (student.incompatible) {
      const incompNames = student.incompatible.split(',').map(f => f.trim()).filter(f => f);
      if (incompNames.length > 0) {
        // Check which incompatible students exist in roster
        const incompData = incompNames.map(incompName => {
          const found = students.find(s => s.name === incompName);
          return {
            name: incompName,
            found: !!found
          };
        });

        studentIncompatibilities.push({
          studentName: student.name,
          incompatible: incompData,
          count: incompNames.length
        });
      }
    }
  });

  // Sort by student name
  studentIncompatibilities.sort((a, b) => a.studentName.localeCompare(b.studentName));

  const totalRules = studentIncompatibilities.reduce((sum, si) => sum + si.count, 0);

  return `
    <div class="panel">
      <div class="panel-h" style="padding: 10px 16px;">
        <span class="sub">${studentIncompatibilities.length} students with incompatibilities · ${totalRules} total rules</span>
      </div>

      <div class="student-list" style="border-top: 1px solid var(--line-soft);">
        <!-- Header row -->
        <div class="student-row" style="padding: 7px 12px; background: var(--bg-2); cursor: default; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-3); font-weight: 500; grid-template-columns: 200px 1fr;">
          <div>Student</div>
          <div>Cannot be with</div>
        </div>

        ${studentIncompatibilities.length === 0 ? `
          <div style="padding: 40px; text-align: center; color: var(--ink-3);">
            No incompatibilities defined yet
          </div>
        ` : studentIncompatibilities.map(si => `
          <div class="student-row" style="grid-template-columns: 200px 1fr; align-items: start;">
            <div onclick="showStudentDetail('${si.studentName.replace(/'/g, "\\'")}')" style="cursor: pointer; padding-top: 2px;">
              <div class="sn">${si.studentName}</div>
              <div class="sm" style="color: var(--ink-3);">${si.count} rule${si.count !== 1 ? 's' : ''}</div>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px; padding-top: 2px;">
              ${si.incompatible.map(incomp => `
                <span
                  class="incomp-pill"
                  style="
                    display: inline-block;
                    padding: 4px 10px;
                    background: var(--rose-soft);
                    border: 1px solid var(--rose);
                    border-radius: 12px;
                    font-size: 12px;
                    color: var(--rose);
                    cursor: ${incomp.found ? 'pointer' : 'default'};
                    transition: all 0.15s;
                    ${!incomp.found ? 'opacity: 0.6; text-decoration: line-through;' : ''}
                  "
                  ${incomp.found ? `onclick="showStudentDetail('${incomp.name.replace(/'/g, "\\'")}')"` : ''}
                  ${incomp.found ? 'onmouseover="this.style.background=\'var(--rose)\'; this.style.color=\'white\'"' : ''}
                  ${incomp.found ? 'onmouseout="this.style.background=\'var(--rose-soft)\'; this.style.color=\'var(--rose)\'"' : ''}
                >
                  ${incomp.name}${!incomp.found ? ' ⚠' : ''}
                </span>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Results Screen
async function renderResultsScreen() {
  // Fetch assignment data
  const res = await fetch(`/api/grades/${currentGrade.id}/students`);
  const data = await res.json();
  const students = data.students || [];

  // Fetch assignments - but use in-memory version if we have unsaved changes
  let assignments, assignData;
  if (window.hasUnsavedChanges && window.currentAssignments) {
    // Use in-memory assignments that have been modified
    assignments = window.currentAssignments;
    assignData = {
      assignments: assignments,
      solver_baseline: window.solverBaseline,
      num_classes: window.numClasses
    };
  } else {
    // Fetch fresh from server
    const assignRes = await fetch(`/api/grades/${currentGrade.id}/assignments`);
    assignData = await assignRes.json();
    assignments = assignData.assignments || [];
  }

  const hasAssignments = assignments.length > 0;

  return `
    <div class="canvas">
      <!-- Page Title -->
      <div class="page-title">
        <h1>${currentGrade.name} <span class="year-label">${config.active_school_year || config.school_year}</span></h1>
      </div>

      <!-- Grade tabs -->
      <div class="grade-tabs">
        <button class="grade-tab" onclick="showScreen('students')">
          <em>Roster</em> <span class="gt-count">${students.length} students</span>
        </button>
        <button class="grade-tab on">
          Assignment <span class="gt-count">${hasAssignments ? `${data.num_classes} classes` : 'not run'}</span>
        </button>
        <div class="grade-meta">
          ${hasAssignments ? '<button class="btn ghost" onclick="exportAssignmentCSV()">↓ Export</button>' : ''}
          <button class="btn terra" onclick="runAssignment()">▶ ${hasAssignments ? 'Re-run' : 'Run'} optimizer</button>
        </div>
      </div>

      <!-- Assignment info panel -->
      <div class="panel" style="margin-bottom: 16px;">
        <div class="panel-h">
          <h3>Assignment Configuration</h3>
          <button class="btn ghost sm" onclick="showGradeSettings('${currentGrade.id}')">Edit settings</button>
        </div>
        <div class="panel-b" style="display: flex; gap: 24px; padding: 16px;">
          <div>
            <div class="stat-label">Target classes</div>
            <div class="stat-value" style="font-size: 24px;">${data.num_classes}</div>
          </div>
          <div>
            <div class="stat-label">Class size range</div>
            <div class="stat-value" style="font-size: 24px;">${data.min_students}–${data.max_students}</div>
            <div class="stat-sub">${data.enforce_class_size ? 'Hard constraint' : 'Soft constraint'}</div>
          </div>
          <div>
            <div class="stat-label">Students to assign</div>
            <div class="stat-value" style="font-size: 24px;">${students.length}</div>
          </div>
          <div>
            <div class="stat-label">Avg per class</div>
            <div class="stat-value" style="font-size: 24px;">${(students.length / data.num_classes).toFixed(1)}</div>
          </div>
        </div>
      </div>

      ${hasAssignments ? renderAssignmentResults(assignments, data.num_classes, assignData) : renderNoAssignments()}
    </div>
  `;
}

// Calculate balance statistics for assignments
function calculateBalanceStats(classesList) {
  if (!classesList || classesList.length === 0) return '';

  // Collect all properties to analyze (from enabled config)
  const propertiesToAnalyze = config.properties?.filter(p => p.enabled && p.type !== 'relationship') || [];

  const statCards = propertiesToAnalyze.map(prop => {
    const propName = prop.name;
    const displayName = prop.display_name;

    // Count values per class
    const classBreakdowns = classesList.map(cls => {
      const students = cls.students;
      const counts = {};

      students.forEach(s => {
        const value = s[propName];
        if (value) {
          counts[value] = (counts[value] || 0) + 1;
        }
      });

      return { classNum: cls.number, counts, total: students.length };
    });

    // Check if property exists in data
    const hasData = classBreakdowns.some(cb => Object.keys(cb.counts).length > 0);
    if (!hasData) return '';

    // Calculate balance score (lower is better)
    let balanceScore = 'Perfect';
    let balanceColor = 'var(--terra)';

    // Get all unique values across all classes
    const allValues = new Set();
    classBreakdowns.forEach(cb => Object.keys(cb.counts).forEach(v => allValues.add(v)));

    // Calculate variance for each value and collect detailed stats
    const varianceDetails = [];
    allValues.forEach(value => {
      const countsForValue = classBreakdowns.map(cb => cb.counts[value] || 0);
      const totalCount = countsForValue.reduce((a, b) => a + b, 0);
      const avg = totalCount / countsForValue.length;
      const variance = countsForValue.reduce((sum, count) => sum + Math.pow(count - avg, 2), 0) / countsForValue.length;
      const stdDev = Math.sqrt(variance);

      // Calculate theoretical minimum variance (best case: as even as possible)
      const numClasses = countsForValue.length;
      const baseCount = Math.floor(totalCount / numClasses);
      const remainder = totalCount % numClasses;
      const bestCaseDistribution = new Array(numClasses).fill(baseCount);
      // Distribute remainder evenly
      for (let i = 0; i < remainder; i++) {
        bestCaseDistribution[i]++;
      }
      const minVariance = bestCaseDistribution.reduce((sum, count) => sum + Math.pow(count - avg, 2), 0) / bestCaseDistribution.length;
      const minStdDev = Math.sqrt(minVariance);

      // Calculate theoretical maximum variance (worst case: all in one class)
      const worstCaseDistribution = new Array(numClasses).fill(0);
      worstCaseDistribution[0] = totalCount;
      const maxVariance = worstCaseDistribution.reduce((sum, count) => sum + Math.pow(count - avg, 2), 0) / worstCaseDistribution.length;
      const maxStdDev = Math.sqrt(maxVariance);

      varianceDetails.push({ value, stdDev, avg, counts: countsForValue, minStdDev, maxStdDev, totalCount });
    });

    // Find max standard deviation
    const maxStdDev = Math.max(...varianceDetails.map(v => v.stdDev));

    if (maxStdDev > 2) {
      balanceScore = 'Unbalanced';
      balanceColor = 'var(--rose)';
    } else if (maxStdDev > 1) {
      balanceScore = 'Good';
      balanceColor = 'var(--terra)';
    }

    // Create breakdown display with variance slider
    const breakdownHTML = varianceDetails.map(detail => {
      // Calculate position on slider (0 = best, 100 = worst)
      const range = detail.maxStdDev - detail.minStdDev;
      const position = range > 0 ? ((detail.stdDev - detail.minStdDev) / range * 100) : 0;
      const achievedPerfection = detail.stdDev <= detail.minStdDev + 0.01;

      return `
        <div style="margin-bottom: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <div style="font-size: 11px; color: var(--ink-3);">${detail.value} (${detail.totalCount} total)</div>
            <div style="font-size: 10px; font-family: var(--t-mono); color: ${achievedPerfection ? 'var(--terra)' : 'var(--ink-3)'}; font-weight: 500;">
              σ = ${detail.stdDev.toFixed(2)}
            </div>
          </div>

          <!-- Variance slider -->
          <div style="position: relative; height: 20px; margin-bottom: 6px;">
            <!-- Track -->
            <div style="position: absolute; top: 9px; left: 0; right: 0; height: 4px; background: linear-gradient(to right, var(--terra), var(--amber), var(--rose)); border-radius: 2px; opacity: 0.3;"></div>

            <!-- Min marker -->
            <div style="position: absolute; left: 0; top: 7px; width: 2px; height: 8px; background: var(--terra); border-radius: 1px;"></div>

            <!-- Max marker -->
            <div style="position: absolute; right: 0; top: 7px; width: 2px; height: 8px; background: var(--rose); border-radius: 1px;"></div>

            <!-- Current position dot -->
            <div style="position: absolute; left: ${position}%; top: 6px; transform: translateX(-50%); width: 10px; height: 10px; background: ${achievedPerfection ? 'var(--terra)' : 'var(--ink)'}; border: 2px solid var(--panel); border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.2);"></div>
          </div>

          <!-- Labels -->
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <div style="font-size: 9px; font-family: var(--t-mono); color: var(--terra);">min ${detail.minStdDev.toFixed(2)}</div>
            <div style="font-size: 9px; font-family: var(--t-mono); color: var(--rose);">max ${detail.maxStdDev.toFixed(2)}</div>
          </div>

          <!-- Class counts -->
          <div style="display: flex; gap: 4px;">
            ${detail.counts.map((count, idx) => {
              const deviation = Math.abs(count - detail.avg);
              const intensity = Math.min(deviation / (detail.avg || 1), 1);
              const bgColor = intensity > 0.3 ? 'var(--rose-soft)' : 'var(--bg-2)';
              return `
                <div style="flex: 1; text-align: center; padding: 4px; background: ${bgColor}; border-radius: 4px; font-size: 12px; font-weight: 500;">
                  ${count}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');

    // Count how many values are at optimal
    const optimalCount = varianceDetails.filter(v => v.stdDev <= v.minStdDev + 0.01).length;
    const totalValues = varianceDetails.length;
    const allOptimal = optimalCount === totalValues;

    return `
      <div class="panel">
        <div class="panel-h">
          <div>
            <h3>${displayName}</h3>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="sub" style="color: ${balanceColor};">${balanceScore}</span>
              ${allOptimal ? '<span style="font-size: 12px; color: var(--terra);">All values at optimal balance</span>' : `<span style="font-size: 12px; color: var(--ink-3);">${optimalCount}/${totalValues} values at optimal</span>`}
            </div>
          </div>
        </div>
        <div class="panel-b" style="font-size: 12px;">
          ${breakdownHTML}
          <div style="display: flex; gap: 4px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--line-soft);">
            ${classesList.map(cls => `
              <div style="flex: 1; text-align: center; font-size: 10px; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.05em;">
                Class ${cls.number}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }).filter(html => html).join('');

  // Add friendship and incompatibility stats
  const relationshipStats = calculateRelationshipStats(classesList);

  if (!statCards && !relationshipStats) return '';

  return `
    <div style="margin-bottom: 24px;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
        <h2 style="margin: 0;">Balance Statistics</h2>
        <button onclick="showBalanceExplanationModal()" style="background: none; border: 1px solid var(--line); border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 11px; color: var(--ink-3); transition: all 0.15s;" onmouseover="this.style.borderColor='var(--ink)'; this.style.color='var(--ink)';" onmouseout="this.style.borderColor='var(--line)'; this.style.color='var(--ink-3)';">?</button>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin-bottom: 24px;">
        ${statCards}
        ${relationshipStats}
      </div>
    </div>
  `;
}

// Calculate friendship and incompatibility statistics
function calculateRelationshipStats(classesList) {
  if (!classesList || classesList.length === 0) return '';

  const allStudents = classesList.flatMap(cls => cls.students);

  // Friendship satisfaction stats
  let friendshipHTML = '';
  if (allStudents.some(s => 'has_friend_in_class' in s)) {
    const friendStats = classesList.map(cls => {
      const students = cls.students;
      const withFriend = students.filter(s => s.has_friend_in_class).length;
      const total = students.length;
      const percentage = total > 0 ? (withFriend / total * 100) : 0;
      return { classNum: cls.number, withFriend, total, percentage };
    });

    const totalWithFriend = friendStats.reduce((sum, s) => sum + s.withFriend, 0);
    const totalStudents = friendStats.reduce((sum, s) => sum + s.total, 0);

    // Calculate how many students COULD have gotten a friend (had friends defined)
    const studentsWithFriendsDefined = allStudents.filter(s => {
      const friends = s.friends;
      // Check if friends is defined and not empty string or "[]"
      return friends && friends.length > 0 && friends !== '[]';
    }).length;
    const achievementRate = studentsWithFriendsDefined > 0 ? (totalWithFriend / studentsWithFriendsDefined * 100) : 0;

    const avgPercentage = totalStudents > 0 ? (totalWithFriend / totalStudents * 100) : 0;

    // Calculate variance in percentages
    const avg = friendStats.reduce((sum, s) => sum + s.percentage, 0) / friendStats.length;
    const variance = friendStats.reduce((sum, s) => sum + Math.pow(s.percentage - avg, 2), 0) / friendStats.length;
    const stdDev = Math.sqrt(variance);

    // Quality is based on how balanced distribution is (stdDev), not achievement rate
    let qualityColor = 'var(--terra)';
    let qualityLabel = 'Good';
    if (stdDev < 5) {
      qualityLabel = 'Excellent';
      qualityColor = 'var(--terra)';
    } else if (stdDev > 15) {
      qualityLabel = 'Unbalanced';
      qualityColor = 'var(--rose)';
    }

    friendshipHTML = `
      <div class="panel">
        <div class="panel-h">
          <div>
            <h3>Friendships</h3>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="sub" style="color: ${qualityColor};">${qualityLabel} balance</span>
              <span style="font-size: 12px; font-family: var(--t-mono); color: var(--ink-3);">σ: ${stdDev.toFixed(2)}%</span>
              <span style="font-size: 12px; color: var(--ink-3);">·</span>
              <span style="font-size: 12px; font-family: var(--t-mono); color: var(--terra); font-weight: 600;">${totalWithFriend}/${studentsWithFriendsDefined} placed (${achievementRate.toFixed(0)}%)</span>
            </div>
          </div>
        </div>
        <div class="panel-b" style="font-size: 12px;">
          <div style="margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
              <div style="font-size: 11px; color: var(--ink-3);">Distribution across classes</div>
              <div style="font-size: 10px; font-family: var(--t-mono); color: var(--ink-3);">
                ${studentsWithFriendsDefined} students had friends defined
              </div>
            </div>
            <div style="display: flex; gap: 4px;">
              ${friendStats.map(s => {
                const deviation = Math.abs(s.percentage - avg);
                const bgColor = deviation > 10 ? 'var(--rose-soft)' : 'var(--bg-2)';
                return `
                  <div style="flex: 1; text-align: center; padding: 4px; background: ${bgColor}; border-radius: 4px; font-size: 11px; font-weight: 500;">
                    ${s.withFriend}/${s.total}<br>
                    <span style="font-size: 10px; color: var(--ink-3);">${s.percentage.toFixed(0)}%</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
          <div style="display: flex; gap: 4px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--line-soft);">
            ${classesList.map(cls => `
              <div style="flex: 1; text-align: center; font-size: 10px; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.05em;">
                Class ${cls.number}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // Incompatibility verification stats
  let incompatibilityHTML = '';
  const studentsWithIncompat = allStudents.filter(s => s.incompatible && s.incompatible.length > 0);

  if (studentsWithIncompat.length > 0) {
    // Build unique pairs to avoid double-counting mutual incompatibilities
    const uniquePairs = new Set();
    allStudents.forEach(student => {
      if (student.incompatible) {
        const incompatList = typeof student.incompatible === 'string'
          ? student.incompatible.split(',').map(n => n.trim()).filter(n => n)
          : student.incompatible || [];

        incompatList.forEach(incompName => {
          // Create a canonical pair key (alphabetically sorted to avoid duplicates)
          const pair = [student.name, incompName].sort().join('|||');
          uniquePairs.add(pair);
        });
      }
    });

    // Check for violations
    const violations = [];
    const violationPairs = new Set();
    classesList.forEach(cls => {
      const studentsInClass = cls.students;
      const nameSet = new Set(studentsInClass.map(s => s.name));

      studentsInClass.forEach(student => {
        if (student.incompatible) {
          const incompatList = typeof student.incompatible === 'string'
            ? student.incompatible.split(',').map(n => n.trim()).filter(n => n)
            : student.incompatible;

          incompatList.forEach(incompName => {
            if (nameSet.has(incompName)) {
              const pair = [student.name, incompName].sort().join('|||');
              if (!violationPairs.has(pair)) {
                violationPairs.add(pair);
                violations.push({
                  class: cls.number,
                  student1: student.name,
                  student2: incompName
                });
              }
            }
          });
        }
      });
    });

    const totalPairs = uniquePairs.size;
    const violationCount = violations.length;
    const successRate = totalPairs > 0 ? ((totalPairs - violationCount) / totalPairs * 100) : 100;

    let qualityColor = violationCount === 0 ? 'var(--terra)' : 'var(--rose)';
    let qualityLabel = violationCount === 0 ? 'Perfect' : 'VIOLATIONS';

    incompatibilityHTML = `
      <div class="panel">
        <div class="panel-h">
          <div>
            <h3>Incompatibilities</h3>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="sub" style="color: ${qualityColor};">${qualityLabel}</span>
              <span style="font-size: 12px; font-family: var(--t-mono); color: var(--ink-3);">${studentsWithIncompat.length} students</span>
            </div>
          </div>
        </div>
        <div class="panel-b" style="font-size: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div style="font-size: 11px; color: var(--ink-3);">Unique pairs</div>
            <div style="font-size: 13px; font-family: var(--t-mono); color: var(--ink); font-weight: 500;">
              ${totalPairs}
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div style="font-size: 11px; color: var(--ink-3);">Success rate</div>
            <div style="font-size: 14px; font-family: var(--t-mono); color: ${qualityColor}; font-weight: 600;">
              ${successRate.toFixed(1)}%
            </div>
          </div>
          ${violationCount > 0 ? `
            <div style="padding: 8px; background: var(--rose-soft); border-radius: 4px; border: 1px solid var(--rose); margin-bottom: 8px;">
              <div style="font-weight: 600; color: var(--rose); margin-bottom: 4px;">${violationCount} Violation${violationCount !== 1 ? 's' : ''} Found</div>
              ${violations.slice(0, 3).map(v => `
                <div style="font-size: 11px; color: var(--ink); margin-top: 4px;">
                  • Class ${v.class}: ${v.student1} ↔ ${v.student2}
                </div>
              `).join('')}
              ${violations.length > 3 ? `<div style="font-size: 11px; color: var(--ink-3); margin-top: 4px;">... and ${violations.length - 3} more</div>` : ''}
            </div>
          ` : `
            <div style="padding: 8px; background: var(--terra-soft); border-radius: 4px; border: 1px solid var(--terra);">
              <div style="font-weight: 600; color: var(--terra);">All pairs kept apart</div>
              <div style="font-size: 11px; color: var(--ink-3); margin-top: 4px;">${totalPairs} incompatible ${totalPairs === 1 ? 'pair' : 'pairs'} successfully separated</div>
            </div>
          `}
        </div>
      </div>
    `;
  }

  return friendshipHTML + incompatibilityHTML;
}

// Render assignment results (when assignments exist)
function renderAssignmentResults(assignments, numClasses, assignData) {
  // Group students by class
  const classesList = Array.from({length: numClasses}, (_, i) => ({
    number: i + 1,
    students: assignments.filter(a => a.assigned_class === i + 1)
  }));

  // Store assignments globally for drag/drop
  window.currentAssignments = assignments;
  // If no baseline exists yet, treat current assignments as baseline
  window.solverBaseline = assignData?.solver_baseline || assignments;
  window.numClasses = numClasses;
  window.editMode = window.editMode || false;
  window.hasUnsavedChanges = window.hasUnsavedChanges || false;

  // Calculate balance statistics
  const balanceStats = calculateBalanceStats(classesList);

  const hasBaseline = window.solverBaseline && window.solverBaseline.length > 0;

  return `
    <!-- Edit Mode Controls -->
    ${hasBaseline ? `
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding: 12px 16px; background: var(--bg-2); border-radius: var(--rad); border: 1px solid var(--line-soft);">
        <div style="flex: 1; display: flex; align-items: center; gap: 12px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;">
            <input type="checkbox" id="editModeToggle" ${window.editMode ? 'checked' : ''} onchange="toggleEditMode(this.checked)" style="width: 16px; height: 16px; cursor: pointer;">
            <span style="font-weight: 500; color: var(--ink);">Edit Mode</span>
          </label>
          <span style="font-size: 11px; color: var(--ink-3);">Enable to manually adjust class assignments</span>
        </div>
        <div id="editModeActions" style="display: ${window.editMode ? 'flex' : 'none'}; gap: 8px;">
          <button class="btn ghost sm" onclick="revertToSolver()" ${!window.hasUnsavedChanges ? 'disabled' : ''}>Revert to Solver</button>
          <button class="btn primary sm" onclick="saveManualChanges()" ${!window.hasUnsavedChanges ? 'disabled' : ''}>Save Changes</button>
        </div>
      </div>
    ` : ''}

    <!-- Class Cards -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 32px;" id="classCardsContainer">
      ${classesList.map(cls => `
        <div class="panel class-drop-zone" data-class-number="${cls.number}" ondrop="handleDrop(event)" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)">
          <div class="panel-h">
            <h3>Class ${cls.number}</h3>
            <span class="sub class-count">${cls.students.length} students</span>
          </div>
          <div class="panel-b" style="padding: 0;">
            <div class="student-list" style="max-height: 400px; overflow-y: auto;">
              ${cls.students.map(s => {
                const initials = s.name.split(' ').map(n => n[0]).join('');
                return `
                  <div class="student-row ${window.editMode ? 'draggable-student' : ''}"
                       data-student-name="${s.name}"
                       data-current-class="${cls.number}"
                       draggable="${window.editMode}"
                       ${window.editMode ? 'ondragstart="handleDragStart(event)" ondragend="handleDragEnd(event)"' : ''}
                       style="display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--line-soft); ${window.editMode ? 'cursor: move;' : ''}">
                    <div class="avatar ${s.gender}">${initials}</div>
                    <div onclick="showStudentDetail('${s.name.replace(/'/g, "\\'")}'); event.stopPropagation();" style="flex: 1; cursor: pointer;">
                      <div class="sn">${s.name}</div>
                    </div>
                    <div style="display:flex; gap:4px;">
                      ${s.iep ? '<span class="chip" style="font-size: 9px;">IEP</span>' : ''}
                      ${s['504'] ? '<span class="chip" style="font-size: 9px;">504</span>' : ''}
                      ${s.esl ? '<span class="chip" style="font-size: 9px;">ESL</span>' : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Balance Statistics -->
    <div id="balanceStatsContainer">
      ${balanceStats}
    </div>
  `;
}

// Render no assignments state
function renderNoAssignments() {
  return `
    <div class="panel">
      <div style="padding: 60px 20px; text-align: center;">
        <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;">📋</div>
        <h3 style="margin-bottom: 8px;">No assignments yet</h3>
        <p style="color: var(--ink-3); margin-bottom: 24px;">Run the optimizer to create balanced class assignments</p>
        <button class="btn terra" onclick="runAssignment()">▶ Run optimizer</button>
      </div>
    </div>
  `;
}

// Run assignment
async function runAssignment() {
  if (!currentGrade) {
    alert('No grade selected');
    return;
  }

  // Show loading state
  const btn = event?.target;
  const originalText = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Running optimizer...';
  }

  try {
    // Call the assignment API
    const response = await fetch(`/api/assign/${currentGrade.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const result = await response.json();

    if (response.ok && result.status === 'success') {
      // Reload grades to update status
      await loadGrades();

      // Show results screen
      await showScreen('results');

      alert(`✓ Success! Created ${result.num_classes || 'balanced'} class assignments for ${result.student_count || 'all'} students.`);
    } else {
      throw new Error(result.error || 'Assignment failed');
    }
  } catch (error) {
    console.error('Assignment error:', error);
    alert(`Assignment failed: ${error.message}\n\nPlease check that all student data is valid and try again.`);
  } finally {
    // Restore button
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
}

// Modal functions
function showImportModal() {
  document.getElementById('importModal').classList.add('open');
}

function closeImportModal() {
  document.getElementById('importModal').classList.remove('open');
}

function closeBalanceInfoModal() {
  document.getElementById('balanceInfoModal').classList.remove('open');
}

// Detail panel
function showStudentDetail(name) {
  console.log('showStudentDetail called with:', name);
  console.log('window.currentStudents:', window.currentStudents);
  const student = window.currentStudents?.find(s => s.name === name);
  console.log('Found student:', student);
  if (!student) {
    console.error('Student not found:', name);
    return;
  }

  const panel = document.getElementById('detailPanel');
  const initials = student.name.split(' ').map(n => n[0]).join('');

  panel.innerHTML = `
    <div class="detail-h">
      <div>
        <div class="nm">${student.name}</div>
        <div class="gr">${currentGrade?.name || 'Grade'}</div>
      </div>
      <button class="btn ghost sm" onclick="closeStudentDetail()">✕</button>
    </div>
    <div class="detail-b">
      <div class="detail-section" data-student-name="${student.name.replace(/"/g, '&quot;')}">
        <h5>Properties</h5>
        <div class="prop-row">
          <span class="k">Gender</span>
          <div class="segmented">
            <button class="seg ${student.gender === 'g' ? 'active' : ''}" data-property="gender" data-value="g">Girl</button>
            <button class="seg ${student.gender === 'b' ? 'active' : ''}" data-property="gender" data-value="b">Boy</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="k">Behavior</span>
          <div class="segmented">
            <button class="seg ${student.behavior === 'cooperative' ? 'active' : ''}" data-property="behavior" data-value="cooperative">Cooperative</button>
            <button class="seg ${student.behavior === 'neutral' ? 'active' : ''}" data-property="behavior" data-value="neutral">Neutral</button>
            <button class="seg ${student.behavior === 'disruptive' ? 'active' : ''}" data-property="behavior" data-value="disruptive">Disruptive</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="k">Independence</span>
          <div class="segmented">
            <button class="seg ${student.independence === 'high' ? 'active' : ''}" data-property="independence" data-value="high">High</button>
            <button class="seg ${student.independence === 'neutral' ? 'active' : ''}" data-property="independence" data-value="neutral">Neutral</button>
            <button class="seg ${student.independence === 'low' ? 'active' : ''}" data-property="independence" data-value="low">Low</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="k">IEP</span>
          <div class="segmented">
            <button class="seg ${student.iep === false ? 'active' : ''}" data-property="iep" data-value="false">No</button>
            <button class="seg ${student.iep === true ? 'active' : ''}" data-property="iep" data-value="true">Yes</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="k">504 Plan</span>
          <div class="segmented">
            <button class="seg ${student['504'] === false ? 'active' : ''}" data-property="504" data-value="false">No</button>
            <button class="seg ${student['504'] === true ? 'active' : ''}" data-property="504" data-value="true">Yes</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="k">ESL</span>
          <div class="segmented">
            <button class="seg ${student.esl === false ? 'active' : ''}" data-property="esl" data-value="false">No</button>
            <button class="seg ${student.esl === true ? 'active' : ''}" data-property="esl" data-value="true">Yes</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="k">GATE</span>
          <div class="segmented">
            <button class="seg ${student.gate === false ? 'active' : ''}" data-property="gate" data-value="false">No</button>
            <button class="seg ${student.gate === true ? 'active' : ''}" data-property="gate" data-value="true">Yes</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="k">Math level</span>
          <div class="segmented">
            <button class="seg ${student.math === 'l' ? 'active' : ''}" data-property="math" data-value="l">Low</button>
            <button class="seg ${student.math === 'm' ? 'active' : ''}" data-property="math" data-value="m">Med</button>
            <button class="seg ${student.math === 'h' ? 'active' : ''}" data-property="math" data-value="h">High</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="k">Reading level</span>
          <div class="segmented">
            <button class="seg ${student.reading === 'l' ? 'active' : ''}" data-property="reading" data-value="l">Low</button>
            <button class="seg ${student.reading === 'm' ? 'active' : ''}" data-property="reading" data-value="m">Med</button>
            <button class="seg ${student.reading === 'h' ? 'active' : ''}" data-property="reading" data-value="h">High</button>
          </div>
        </div>
      </div>

      <div class="detail-section">
        <h5>Friends (${student.friends ? student.friends.split(',').filter(f => f.trim()).length : 0})</h5>
        <div>
          ${student.friends ? student.friends.split(',').filter(f => f.trim()).map(fname => {
            const fname_trimmed = fname.trim();
            const friend = window.currentStudents?.find(s => s.name === fname_trimmed);
            if (!friend) return `<span class="muted">${fname_trimmed}</span>`;
            const fInitials = friend.name.split(' ').map(n => n[0]).join('');
            return `
              <span class="friend-pill" data-student-name="${friend.name.replace(/"/g, '&quot;')}" onclick="showStudentDetail(this.getAttribute('data-student-name'))">
                <span class="avatar ${friend.gender}">${fInitials}</span>
                <span>${friend.name}</span>
              </span>
            `;
          }).join('') : '<span class="muted">None listed.</span>'}
        </div>
      </div>

      ${student.incompatible && student.incompatible.trim() ? `
        <div class="detail-section">
          <h5>Cannot be paired with</h5>
          <div>
            ${student.incompatible.split(',').filter(f => f.trim()).map(fname => {
              const fname_trimmed = fname.trim();
              const incomp = window.currentStudents?.find(s => s.name === fname_trimmed);
              if (!incomp) return `<span class="muted">${fname_trimmed}</span>`;
              const iInitials = incomp.name.split(' ').map(n => n[0]).join('');
              return `
                <span class="friend-pill" style="border-color: var(--rose-soft);" data-student-name="${incomp.name.replace(/"/g, '&quot;')}" onclick="showStudentDetail(this.getAttribute('data-student-name'))">
                  <span class="avatar ${incomp.gender}">${iInitials}</span>
                  <span>${incomp.name}</span>
                </span>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  panel.classList.add('open');

  // Add event listeners for segmented controls
  panel.querySelectorAll('.seg[data-property]').forEach(btn => {
    btn.addEventListener('click', function() {
      const studentName = this.closest('[data-student-name]').getAttribute('data-student-name');
      const property = this.getAttribute('data-property');
      const value = this.getAttribute('data-value');
      updateStudentProperty(studentName, property, value);
    });
  });
}

function closeStudentDetail() {
  document.getElementById('detailPanel').classList.remove('open');
}

async function updateStudentProperty(studentName, property, value) {
  if (!currentGrade) return;

  // Update in memory
  const student = window.currentStudents?.find(s => s.name === studentName);
  if (student) {
    // Convert boolean strings to actual booleans
    if (value === 'true') {
      student[property] = true;
    } else if (value === 'false') {
      student[property] = false;
    } else {
      student[property] = value;
    }
  }

  // Update on server
  try {
    const res = await fetch(`/api/grades/${currentGrade.id}/students`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ students: window.currentStudents })
    });

    if (res.ok) {
      // Refresh the view to show updated data
      showScreen('students');
      // Reopen detail panel
      setTimeout(() => showStudentDetail(studentName), 100);
    }
  } catch (err) {
    console.error('Failed to update student:', err);
    alert('Failed to save changes');
  }
}

function filterStudents(value) {
  const searchTerm = value.toLowerCase().trim();
  const rows = document.querySelectorAll('.student-row[data-student-name]');

  rows.forEach(row => {
    const name = row.querySelector('.sn')?.textContent.toLowerCase() || '';
    if (name.includes(searchTerm)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

let currentSort = 'name'; // Track current sort

function sortStudents(sortBy) {
  console.log('sortStudents called with:', sortBy);
  if (!window.currentStudents) {
    console.log('No currentStudents found');
    return;
  }

  currentSort = sortBy;
  const students = [...window.currentStudents];

  switch(sortBy) {
    case 'name':
      students.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'gender':
      students.sort((a, b) => a.gender.localeCompare(b.gender) || a.name.localeCompare(b.name));
      break;
    case 'math':
      const mathOrder = { h: 0, m: 1, l: 2 };
      students.sort((a, b) => (mathOrder[a.math] - mathOrder[b.math]) || a.name.localeCompare(b.name));
      break;
    case 'flags':
      students.sort((a, b) => {
        const aFlags = (a.problematic === 'y' ? 2 : 0) + (a.special_needs === 'y' ? 1 : 0);
        const bFlags = (b.problematic === 'y' ? 2 : 0) + (b.special_needs === 'y' ? 1 : 0);
        return bFlags - aFlags || a.name.localeCompare(b.name);
      });
      break;
  }

  // Update the stored students
  window.currentStudents = students;

  // Reorder DOM elements
  const studentList = document.querySelector('.student-list');
  const rows = Array.from(studentList.querySelectorAll('.student-row[data-student-name]'));

  // Sort rows based on the new order
  const sortedRows = students.map(student => {
    return rows.find(row => row.getAttribute('data-student-name') === student.name);
  }).filter(row => row); // Filter out any nulls

  // Append in new order (this moves them in the DOM)
  sortedRows.forEach(row => {
    studentList.appendChild(row);
  });

  // Update button active states
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.querySelector(`.sort-btn[data-sort="${sortBy}"]`);
  if (activeBtn) {
    activeBtn.classList.add('active');
  }
}

function exportCSV() {
  // Export student roster
  if (!window.currentStudents) return;

  const csv = convertToCSV(window.currentStudents);
  downloadCSV(csv, `${currentGrade.name}_roster.csv`);
}

function exportAssignmentCSV() {
  // Export assignment results
  alert('Assignment export coming soon - will include class assignments and balance report');
}

function convertToCSV(data) {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const rows = data.map(row =>
    headers.map(header => {
      const value = row[header] || '';
      return `"${String(value).replace(/"/g, '""')}"`;
    }).join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

window.showScreen = showScreen;
window.selectGrade = selectGrade;
window.showImportModal = showImportModal;
window.closeImportModal = closeImportModal;
window.closeBalanceInfoModal = closeBalanceInfoModal;
window.updateWeight = updateWeight;
window.toggleProperty = toggleProperty;
window.runAssignment = runAssignment;
window.showStudentDetail = showStudentDetail;
window.closeStudentDetail = closeStudentDetail;
window.updateStudentProperty = updateStudentProperty;
window.filterStudents = filterStudents;
window.sortStudents = sortStudents;
window.exportCSV = exportCSV;
window.exportAssignmentCSV = exportAssignmentCSV;
window.switchSchoolYear = switchSchoolYear;
window.createNextYear = createNextYear;
window.clearSchoolYear = clearSchoolYear;
window.showGradeSettings = showGradeSettings;
window.closeGradeSettings = closeGradeSettings;
window.saveGradeSettings = saveGradeSettings;
window.switchStudentTab = switchStudentTab;

// Drag and drop handlers
let draggedStudent = null;

function handleDragStart(event) {
  draggedStudent = {
    name: event.target.dataset.studentName,
    currentClass: parseInt(event.target.dataset.currentClass)
  };
  event.target.style.opacity = '0.4';
  event.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(event) {
  event.target.style.opacity = '1';
}

function handleDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';

  // Find the closest class-drop-zone
  let dropZone = event.target.closest('.class-drop-zone');
  if (dropZone) {
    dropZone.style.background = 'var(--terra-soft)';
    dropZone.style.borderColor = 'var(--terra)';
  }
}

function handleDragLeave(event) {
  let dropZone = event.target.closest('.class-drop-zone');
  if (dropZone && !dropZone.contains(event.relatedTarget)) {
    dropZone.style.background = '';
    dropZone.style.borderColor = '';
  }
}

async function handleDrop(event) {
  event.preventDefault();
  event.stopPropagation();

  // Only allow drops in edit mode
  if (!window.editMode) {
    return;
  }

  let dropZone = event.target.closest('.class-drop-zone');
  if (!dropZone) return;

  // Reset styles
  dropZone.style.background = '';
  dropZone.style.borderColor = '';

  const targetClass = parseInt(dropZone.dataset.classNumber);

  if (!draggedStudent || targetClass === draggedStudent.currentClass) {
    return;
  }

  // Update assignment in memory (don't save yet)
  const student = window.currentAssignments.find(s => s.name === draggedStudent.name);
  if (student) {
    console.log(`Moving ${student.name} from class ${student.assigned_class} to class ${targetClass}`);
    student.assigned_class = targetClass;

    // Mark as having unsaved changes
    window.hasUnsavedChanges = true;

    // Refresh the results screen to show updated assignments and stats
    // Keep edit mode active
    const currentEditMode = window.editMode;
    const currentHasUnsaved = window.hasUnsavedChanges;
    await showScreen('results');
    window.editMode = currentEditMode;
    window.hasUnsavedChanges = currentHasUnsaved;

    // Restore UI state
    const checkbox = document.getElementById('editModeToggle');
    if (checkbox) checkbox.checked = currentEditMode;

    const actionsDiv = document.getElementById('editModeActions');
    if (actionsDiv) actionsDiv.style.display = currentEditMode ? 'flex' : 'none';

    // Enable save/revert buttons
    const saveBtn = actionsDiv?.querySelector('button.primary');
    const revertBtn = actionsDiv?.querySelector('button.ghost');
    if (saveBtn) saveBtn.disabled = false;
    if (revertBtn) revertBtn.disabled = false;
  }

  draggedStudent = null;
}

window.handleDragStart = handleDragStart;
window.handleDragEnd = handleDragEnd;
window.handleDragOver = handleDragOver;
window.handleDragLeave = handleDragLeave;
window.handleDrop = handleDrop;

// Balance explanation modal
function showBalanceExplanationModal() {
  document.getElementById('balanceExplanationModal').classList.add('open');
}

function closeBalanceExplanationModal() {
  document.getElementById('balanceExplanationModal').classList.remove('open');
}

window.showBalanceExplanationModal = showBalanceExplanationModal;
window.closeBalanceExplanationModal = closeBalanceExplanationModal;

// Edit mode functions
async function toggleEditMode(enabled) {
  window.editMode = enabled;

  // Re-render to update draggable state
  await showScreen('results');

  // Restore checkbox and button state after render
  const checkbox = document.getElementById('editModeToggle');
  if (checkbox) {
    checkbox.checked = enabled;
  }

  const actionsDiv = document.getElementById('editModeActions');
  if (actionsDiv) {
    actionsDiv.style.display = enabled ? 'flex' : 'none';
  }
}

async function saveManualChanges() {
  try {
    const response = await fetch(`/api/grades/${currentGrade.id}/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments: window.currentAssignments })
    });

    if (response.ok) {
      window.hasUnsavedChanges = false;
      showScreen('results');
      alert('Changes saved successfully!');
    } else {
      alert('Failed to save changes');
    }
  } catch (error) {
    console.error('Error saving changes:', error);
    alert('Failed to save changes');
  }
}

async function revertToSolver() {
  if (!confirm('Are you sure you want to revert all manual changes and restore the solver results?')) {
    return;
  }

  try {
    const response = await fetch(`/api/grades/${currentGrade.id}/assignments/revert`, {
      method: 'POST'
    });

    if (response.ok) {
      window.hasUnsavedChanges = false;
      window.editMode = false;
      showScreen('results');
      alert('Reverted to solver results');
    } else {
      alert('Failed to revert');
    }
  } catch (error) {
    console.error('Error reverting:', error);
    alert('Failed to revert');
  }
}

window.toggleEditMode = toggleEditMode;
window.saveManualChanges = saveManualChanges;
window.revertToSolver = revertToSolver;
