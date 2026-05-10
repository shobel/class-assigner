// Homeroom App - Main Controller

let currentGrade = null;
let currentScreen = "welcome";
let currentStudentTab = "roster"; // roster, friendships, incompatibilities
let grades = [];
let config = {
  enabled: {
    gender: true,
    problematic: true,
    specialNeeds: true,
    mathLevel: true,
    readingLevel: true,
  },
  weights: {
    gender: 3,
    problematic: 5,
    specialNeeds: 5,
    mathLevel: 4,
    readingLevel: 4,
    friend: 2,
  },
  school_name: "School",
  school_year: "2025–26",
};

// Load config from server
async function loadConfig() {
  const res = await fetch("/api/config");
  config = await res.json();

  // Load available school years
  const yearsRes = await fetch("/api/school-years");
  const yearsData = await yearsRes.json();

  // Update school year list
  const yearNav = document.getElementById("schoolYearNav");
  const years =
    yearsData.years.length > 0 ? yearsData.years : [config.school_year];

  yearNav.innerHTML = years
    .map(
      (year) => `
    <div class="nav-item year-nav-item ${year === yearsData.active ? "year-active" : ""}" onclick="switchSchoolYear('${year}')">
      <span class="nav-label">${year}</span>
      ${year === yearsData.current ? '<span class="nav-count" style="font-size: 9px; padding: 2px 5px;">current</span>' : ""}
      <div class="year-nav-actions">
        ${year !== yearsData.current ? `<button class="btn-tiny ghost" onclick="event.stopPropagation(); setCurrentYear('${year}')" title="Mark as current year" style="font-size: 9px;">set current</button>` : ""}
        <button class="nav-clear" onclick="event.stopPropagation(); clearSchoolYear('${year}')" title="Clear all data"><span style="font-size: 9px; opacity: 0.7;">[dev]</span> ×</button>
      </div>
    </div>
  `,
    )
    .join("");

  // Update UI elements
  document.getElementById("crumb-school").textContent =
    yearsData.active || config.school_name || "School";
  const brandSchoolName = document.getElementById("brand-school-name");
  if (brandSchoolName)
    brandSchoolName.textContent =
      config.school_name && config.school_name !== "School"
        ? config.school_name
        : "";
}

// Switch school year
async function switchSchoolYear(year) {
  await fetch(`/api/school-years/${year}`, { method: "POST" });
  await loadConfig();
  await loadGrades();
  showScreen(currentScreen); // Refresh current screen
}

// Mark a year as "current" (visual only)
async function setCurrentYear(year) {
  await fetch(`/api/school-years/${encodeURIComponent(year)}/set-current`, {
    method: "POST",
  });
  await loadConfig();
}
window.setCurrentYear = setCurrentYear;

// Create next school year
async function createNextYear() {
  showTransitionWizard();
}

// Clear school year data
async function clearSchoolYear(year) {
  const ok = await showConfirm(
    `Clear all data for ${year}?<br><br>This will delete all students, grades, and assignments for this school year. This cannot be undone.`,
    { confirmLabel: "Clear", destructive: true },
  );
  if (!ok) return;

  try {
    const res = await fetch(`/api/school-years/${year}/clear`, {
      method: "POST",
    });
    if (res.ok) {
      window.location.reload();
    } else {
      showNotice("Failed to clear school year data.", "error");
    }
  } catch (err) {
    console.error("Error clearing school year:", err);
    showNotice("Error clearing school year data.", "error");
  }
}

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
  // Check if onboarding is needed
  const needsOnboarding = await checkOnboarding();

  if (!needsOnboarding) {
    // Normal app flow
    await loadConfig();
    await loadGrades();
    showScreen("welcome");
  } else {
    // Setup onboarding UI
    setupDropZone();
  }
});

// Load grades from server
async function loadGrades() {
  const res = await fetch("/api/grades");
  grades = await res.json();
  renderGradeNav();
  updateStudentCount();
}

// Render grade navigation
function renderGradeNav() {
  const nav = document.getElementById("gradeNav");
  nav.innerHTML = grades
    .map((g) => {
      let statusText = "";
      if (g.status === "assigned") {
        statusText = `${g.classes} class${g.classes !== 1 ? "es" : ""}`;
      } else if (g.status === "imported") {
        statusText = "not assigned";
      } else {
        statusText = "empty";
      }

      return `
    <div class="grade-row ${g.id === currentGrade?.id ? "active" : ""}" onclick="selectGrade('${g.id}')">
      <div style="flex:1; min-width:0">
        <div class="gn">${g.name}</div>
        <div class="gm">
          ${g.students} student${g.students !== 1 ? "s" : ""} · ${statusText}
        </div>
      </div>
      <button class="grade-delete-btn" title="Delete grade"
        onclick="event.stopPropagation(); confirmDeleteGrade('${g.id}', '${g.name.replace(/'/g, "\\'")}')">×</button>
    </div>
  `;
    })
    .join("");
}

// Select grade
function selectGrade(gradeId) {
  currentGrade = grades.find((g) => g.id === gradeId);
  // Clear grade-specific globals so stale data from previous grade never bleeds through
  window.currentAssignments = null;
  window.currentStudents = null;
  window.solverBaseline = null;
  window.hasUnsavedChanges = false;
  window.editMode = false;
  renderGradeNav();
  showScreen("students");
}

// Update student count in topbar
function updateStudentCount() {
  const total = grades.reduce((sum, g) => sum + g.students, 0);
  document.getElementById("student-count").textContent = total;
}

// Sync currentGrade student count from in-memory roster and refresh sidebar
function syncGradeStudentCount() {
  if (!currentGrade || !window.currentStudents) return;
  const gradeEntry = grades.find((g) => g.id === currentGrade.id);
  if (gradeEntry) {
    gradeEntry.students = window.currentStudents.length;
    renderGradeNav();
    updateStudentCount();
  }
}

// Grade settings modal
let currentGradeSettings = null;

async function showGradeSettings(gradeId) {
  const grade = grades.find((g) => g.id === gradeId);
  if (!grade) return;

  // Fetch full grade data
  const res = await fetch(`/api/grades/${gradeId}/students`);
  const data = await res.json();

  const numStudents = (data.students || []).length;
  const numClasses = data.num_classes || 5;
  const avg = numStudents / numClasses;
  const defaultMin = Math.max(1, Math.floor(avg) - 2);
  const defaultMax = Math.ceil(avg) + 2;

  currentGradeSettings = {
    gradeId: gradeId,
    num_classes: numClasses,
    num_students: numStudents,
    min_students: data.min_students ?? defaultMin,
    max_students: data.max_students ?? defaultMax,
    enforce_class_size: data.enforce_class_size === true,
  };

  document.getElementById("gradeSettingsTitle").textContent =
    `${grade.name} Settings`;
  document.getElementById("gradeSettingsBody").innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 20px;">
      <div>
        <label style="display: block; font-weight: 500; margin-bottom: 8px;">Number of classes</label>
        <input type="number" id="numClasses" value="${currentGradeSettings.num_classes}" min="1" max="10"
          style="width: 100px; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font: inherit;" oninput="checkClassSizeFeasibility()">
        <p style="font-size: 12px; color: var(--ink-3); margin-top: 4px;">How many classes to create for this grade</p>
      </div>

      <div>
        <label style="display: block; font-weight: 500; margin-bottom: 8px;">Class size constraints</label>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <label style="display: block; font-size: 12px; color: var(--ink-3); margin-bottom: 4px;">Minimum per class</label>
            <input type="number" id="minStudents" value="${currentGradeSettings.min_students}" min="1" max="50"
              style="width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font: inherit;" oninput="checkClassSizeFeasibility()">
          </div>
          <div>
            <label style="display: block; font-size: 12px; color: var(--ink-3); margin-bottom: 4px;">Maximum per class</label>
            <input type="number" id="maxStudents" value="${currentGradeSettings.max_students}" min="1" max="50"
              style="width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font: inherit;" oninput="checkClassSizeFeasibility()">
          </div>
        </div>

        <div style="margin-top: 12px; padding: 12px; background: var(--bg-2); border-radius: 6px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="checkbox" id="enforceClassSize" ${currentGradeSettings.enforce_class_size ? "checked" : ""}
              style="width: 16px; height: 16px; cursor: pointer;" onchange="checkClassSizeFeasibility()">
            <span style="font-size: 12px; font-weight: 500;">Enforce as hard constraint</span>
          </label>
          <p style="font-size: 11px; color: var(--ink-3); margin: 6px 0 0 24px; line-height: 1.4;">
            <strong>Checked:</strong> Optimizer fails if limits can't be met<br>
            <strong>Unchecked:</strong> Optimizer tries its best but allows flexibility
          </p>
          <div id="classSizeFeasibilityWarning" style="display:none; margin-top:8px; padding:8px 10px; background:var(--rose-soft); border-radius:5px; font-size:11px; color:var(--terra-ink); line-height:1.5;"></div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("gradeSettingsModal").classList.add("open");
}

function checkClassSizeFeasibility() {
  const enforced = document.getElementById("enforceClassSize")?.checked;
  const min = parseInt(document.getElementById("minStudents")?.value) || 0;
  const max = parseInt(document.getElementById("maxStudents")?.value) || 0;
  const classes = parseInt(document.getElementById("numClasses")?.value) || 0;
  const students = currentGradeSettings?.num_students || 0;
  const warning = document.getElementById("classSizeFeasibilityWarning");
  if (!warning) return;

  if (enforced && classes > 0) {
    const minNeeded = min * classes;
    const maxAllowed = max * classes;
    if (students < minNeeded) {
      warning.style.display = "block";
      warning.textContent = `${students} students can't fill ${classes} classes of at least ${min} — needs ${minNeeded}+. Lower the minimum or turn off hard enforcement.`;
    } else if (students > maxAllowed) {
      warning.style.display = "block";
      warning.textContent = `${students} students won't fit in ${classes} classes of at most ${max} — max capacity ${maxAllowed}. Raise the maximum or turn off hard enforcement.`;
    } else {
      warning.style.display = "none";
    }
  } else {
    warning.style.display = "none";
  }
}
window.checkClassSizeFeasibility = checkClassSizeFeasibility;

function closeGradeSettings() {
  document.getElementById("gradeSettingsModal").classList.remove("open");
  currentGradeSettings = null;
}

async function saveGradeSettings() {
  if (!currentGradeSettings) return;

  const numClasses = parseInt(document.getElementById("numClasses").value);
  const minStudents = parseInt(document.getElementById("minStudents").value);
  const maxStudents = parseInt(document.getElementById("maxStudents").value);
  const enforceClassSize = document.getElementById("enforceClassSize").checked;

  if (minStudents > maxStudents) {
    showNotice(
      "Minimum students cannot be greater than maximum students",
      "error",
    );
    return;
  }

  if (enforceClassSize && currentGradeSettings?.num_students) {
    const n = currentGradeSettings.num_students;
    if (n < minStudents * numClasses) {
      showNotice(
        `${n} students can't fill ${numClasses} classes of at least ${minStudents} (needs ${minStudents * numClasses}+). Lower the minimum or turn off hard enforcement.`,
        "error",
      );
      return;
    }
    if (n > maxStudents * numClasses) {
      showNotice(
        `${n} students won't fit in ${numClasses} classes of at most ${maxStudents} (max ${maxStudents * numClasses}). Raise the maximum or turn off hard enforcement.`,
        "error",
      );
      return;
    }
  }

  // Save to server
  try {
    const res = await fetch(
      `/api/grades/${currentGradeSettings.gradeId}/settings`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          num_classes: numClasses,
          min_students: minStudents,
          max_students: maxStudents,
          enforce_class_size: enforceClassSize,
        }),
      },
    );

    if (res.ok) {
      closeGradeSettings();
      await loadGrades();
      // Refresh current screen to show updated settings
      if (currentScreen === "results") {
        await showScreen("results");
      }
    } else {
      showNotice("Failed to save settings", "error");
    }
  } catch (err) {
    console.error("Error saving settings:", err);
    showNotice("Error saving settings", "error");
  }
}

// Show screen
async function showScreen(screen) {
  currentScreen = screen;

  // Update nav active state
  document
    .querySelectorAll(".nav-item")
    .forEach((el) => el.classList.remove("active"));
  if (screen === "config")
    document.getElementById("nav-config")?.classList.add("active");
  if (screen === "welcome")
    document.getElementById("nav-welcome")?.classList.add("active");
  if (screen === "school-config")
    document.getElementById("nav-school-config")?.classList.add("active");

  // Update breadcrumbs
  document.getElementById("crumb-grade").textContent =
    currentGrade?.name || "...";
  const screenNames = {
    welcome: "Welcome",
    config: "Configuration",
    "school-config": "School config",
    import: "Import students",
    students: "Roster",
    results: "Class assignments",
  };
  document.getElementById("crumb-screen").textContent =
    screenNames[screen] || screen;

  // Render screen
  const main = document.getElementById("mainContent");
  const detailPanel = document.getElementById("detailPanel");

  let content = "";
  if (screen === "welcome") {
    content = renderWelcomeScreen();
  } else if (screen === "config") {
    content = renderConfigScreen();
  } else if (screen === "school-config") {
    content = renderSchoolConfigScreen();
  } else if (screen === "students") {
    content = await renderStudentsScreen();
  } else if (screen === "results") {
    content = await renderResultsScreen();
  }

  // Update content but preserve detail panel
  main.innerHTML = content;
  if (detailPanel) {
    main.appendChild(detailPanel);
  }
  renderIcons();
}

// Welcome Screen
function renderWelcomeScreen() {
  const totalStudents = grades.reduce((sum, g) => sum + g.students, 0);
  const totalGrades = grades.length;

  return `
    <div class="welcome">
      <div class="muted" style="font-family:var(--t-mono); font-size:11px; letter-spacing:0.07em; text-transform:uppercase; margin-bottom:18px">
        Class Assignment Optimizer · ${totalGrades} grade${totalGrades !== 1 ? "s" : ""} · ${totalStudents} students
      </div>
      <h1>Three steps to <em>balanced</em> classes.</h1>
      <p class="lede">
        Manual class assignment means balancing gender, behavior, special needs, education plans, math and reading levels — plus
        keeping friends together and difficult pairs apart. What can take teachers hours to do, classify can solve in seconds.
      </p>

      <div class="steps">
        <div class="step">
          <span class="num">i.</span>
          <h3>Configure rules</h3>
          <p>Tell the optimizer which factors matter most by setting priority weights. Saved per‑school.</p>
        </div>
        <div class="step">
          <span class="num">ii.</span>
          <h3>Import a grade</h3>
          <p>Drop in a CSV. Map the columns. Preview the first rows before you commit.</p>
        </div>
        <div class="step">
          <span class="num">iii.</span>
          <h3>Run the assigner</h3>
          <p>One click. Watch the phases. Get a balance report you can defend in any meeting.</p>
        </div>
      </div>

      <div class="panel">
        <div class="panel-h">
          <h3>What Classify balances</h3>
          <span class="sub">9 factors · 1 hard constraint</span>
        </div>
        <div class="panel-b" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:14px">
          <div style="display:flex; flex-direction:column; gap:2px">
            <div style="font-weight:500; font-size:13px">Gender</div>
            <div class="muted" style="font-size:12px">Even split of girls and boys per class</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:2px">
            <div style="font-weight:500; font-size:13px">Behavior</div>
            <div class="muted" style="font-size:12px">Avoid clustering of disruptive students</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:2px">
            <div style="font-weight:500; font-size:13px">Independence</div>
            <div class="muted" style="font-size:12px">Spread high- and low-independence students evenly</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:2px">
            <div style="font-weight:500; font-size:13px">IEP &amp; 504</div>
            <div class="muted" style="font-size:12px">Distribute students with plans across classes</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:2px">
            <div style="font-weight:500; font-size:13px">ESL &amp; GATE</div>
            <div class="muted" style="font-size:12px">Balance language learners and gifted students</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:2px">
            <div style="font-weight:500; font-size:13px">Math &amp; Reading level</div>
            <div class="muted" style="font-size:12px">Mix high / medium / low across classes</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:2px">
            <div style="font-weight:500; font-size:13px">Friendships</div>
            <div class="muted" style="font-size:12px">Keep at least one friend per student where possible</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:2px">
            <div style="font-weight:500; font-size:13px">Incompatible pairs</div>
            <div class="muted" style="font-size:12px">Hard constraint — guaranteed to separate</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Config Screen
function renderSchoolConfigScreen() {
  const grades = ['Kindergarten','1st Grade','2nd Grade','3rd Grade','4th Grade','5th Grade','6th Grade','7th Grade','8th Grade'];
  return `
    <div class="canvas">
      <div class="page-hd">
        <div>
          <h1>School <em>config</em></h1>
          <p class="lede">Settings that apply across all grades and school years.</p>
        </div>
      </div>
      <div style="max-width:560px">
        <div class="panel" style="margin-bottom:16px">
          <div class="panel-h">
            <h3>School name</h3>
          </div>
          <div class="panel-b">
            <div style="display:flex;align-items:center;gap:10px">
              <input type="text" id="schoolNameInput" value="${config.school_name || ''}" placeholder="e.g. Lincoln Elementary"
                style="flex:1;padding:8px 10px;border:1px solid var(--line);border-radius:6px;font:inherit;font-size:13px;background:var(--panel)">
              <button class="btn sm ghost" onclick="saveSchoolName()">Save</button>
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-h">
            <h3>Highest grade</h3>
          </div>
          <div class="panel-b">
            <div class="prop-row" style="margin-bottom:12px">
              <span class="k" style="font-size:12px">Highest grade in school</span>
              <select onchange="updateMaxGrade(this.value)"
                style="padding:4px 8px;border:1px solid var(--line-soft);border-radius:6px;font-size:12px;background:var(--bg-2);color:var(--ink);cursor:pointer">
                ${grades.map(g => `<option value="${g}" ${(config.max_grade || '8th Grade') === g ? 'selected' : ''}>${g}</option>`).join('')}
              </select>
            </div>
            <p style="font-size:11px;color:var(--ink-3);line-height:1.5">
              Students at the highest grade are graduated out when creating a new school year.
            </p>
          </div>
        </div>
      </div>
    </div>
  `;
}

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
            <span class="sub">${config.properties?.filter((p) => p.enabled !== false).length || 0} active</span>
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
  if (!config.properties)
    return '<p style="color: var(--ink-3);">Loading...</p>';

  const descriptions = {
    gender: "Even distribution of girls and boys per class.",
    behavior: "Balance cooperative and disruptive behaviors.",
    independence: "Distribute high and low independence levels.",
    iep: "Spread IEP students evenly across classes.",
    504: "Balance 504 plan students across classes.",
    esl: "Distribute ESL students evenly.",
    gate: "Balance GATE students across classes.",
    math: "Balance high / medium / low math levels.",
    reading: "Balance reading proficiency tiers.",
    friends: "Keep friends together when possible (soft constraint).",
  };

  return config.properties
    .map((prop) => {
      const weight = Math.round(prop.weight / 20); // Convert 0-100 to 0-5 scale
      const enabled = prop.enabled !== false; // Default to true if not specified
      return `
    <div style="padding: 12px 0; border-bottom: 1px solid var(--line-soft); ${!enabled ? "opacity: 0.5;" : ""}">
      <div style="display: grid; grid-template-columns: 40px 160px 1fr 80px; gap: 12px; align-items: center;">
        <label class="toggle">
          <input type="checkbox" ${enabled ? "checked" : ""} onchange="toggleProperty('${prop.name}', this.checked)">
          <span class="toggle-slider"></span>
        </label>
        <div>
          <div style="font-weight: 500; font-size: 13px; color: var(--terra);">${prop.display_name}</div>
          <div style="font-size: 11px; color: var(--ink-3);">${descriptions[prop.name] || ""}</div>
        </div>
        <input type="range" min="0" max="5" step="1" class="slider" value="${weight}" onchange="updateWeight('${prop.name}', this.value)" ${!enabled ? "disabled" : ""}>
        <div style="font-family: var(--t-mono); font-size: 10px; text-align: right; text-transform: uppercase; color: var(--terra);">
          ${["Off", "Low", "Mild", "Medium", "High", "Critical"][weight]}
        </div>
      </div>
    </div>
    `;
    })
    .join("");
}

async function updateWeight(key, value) {
  const weight = parseInt(value) * 20; // Convert 0-5 scale back to 0-100

  if (key === "friend") {
    config.friend_weight = weight;
  } else {
    // Update property weight
    const prop = config.properties.find((p) => p.name === key);
    if (prop) {
      prop.weight = weight;
    }
  }

  // Save to server
  await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });

  if (currentScreen === "config") {
    showScreen("config"); // Re-render
  }
}

async function updateMaxGrade(value) {
  config.max_grade = value;
  await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
}

async function saveSchoolName() {
  const name = document.getElementById('schoolNameInput')?.value.trim();
  if (!name) return;
  config.school_name = name;
  await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  // Update sidebar brand
  document.getElementById('brand-school-name').textContent = name;
  showNotice('School name saved.');
}
window.saveSchoolName = saveSchoolName;

async function toggleProperty(propertyName, enabled) {
  const prop = config.properties.find((p) => p.name === propertyName);
  if (prop) {
    prop.enabled = enabled;
  }

  // Save to server
  await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });

  // Refresh the config screen
  showScreen("config");
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
  const hasAssignments =
    assignData.assignments && assignData.assignments.length > 0;

  // Always reset globals for the current grade — never carry over from a previous grade
  window.currentAssignments = hasAssignments ? assignData.assignments : null;
  window.solverBaseline = hasAssignments ? assignData.solver_baseline : null;
  window.hasUnsavedChanges = false;
  window.editMode = false;

  if (students.length === 0) {
    return `
      <div class="canvas">
        <div class="page-title">
          <h1>${currentGrade.name} <span class="year-label">${config.active_school_year || config.school_year}</span></h1>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:600px;margin-top:8px">
          <div class="panel" style="cursor:pointer"
            onclick="document.getElementById('grade-csv-input').click()"
            ondragover="event.preventDefault(); this.style.borderColor='var(--terra)'"
            ondragleave="this.style.borderColor=''"
            ondrop="event.preventDefault(); this.style.borderColor=''; handleGradeCSVFile(event.dataTransfer.files[0])">
            <div class="panel-b" style="text-align:center;padding:32px 16px">
              <i data-lucide="upload" style="width:24px;height:24px;margin-bottom:10px;color:var(--ink-3)"></i>
              <div style="font-weight:600;font-size:14px;margin-bottom:6px">Import CSV</div>
              <div class="muted" style="font-size:12px">Drop a file or click to upload a student roster</div>
            </div>
          </div>
          <div class="panel" style="cursor:pointer" onclick="openAddStudentModal()">
            <div class="panel-b" style="text-align:center;padding:32px 16px">
              <i data-lucide="user-plus" style="width:24px;height:24px;margin-bottom:10px;color:var(--ink-3)"></i>
              <div style="font-weight:600;font-size:14px;margin-bottom:6px">Add manually</div>
              <div class="muted" style="font-size:12px">Add students one at a time</div>
            </div>
          </div>
        </div>
        <input id="grade-csv-input" type="file" accept=".csv" style="display:none" onchange="handleGradeCSVFile(this.files[0])">
        <div id="grade-csv-error" style="margin-top:12px;font-size:12px;color:var(--rose)"></div>
      </div>
    `;
  }

  // Calculate stats
  const girls = students.filter((s) => s.gender === "g").length;
  const boys = students.filter((s) => s.gender === "b").length;
  const iepCount = students.filter(
    (s) => s.iep === true || s.iep === "true",
  ).length;
  const plan504Count = students.filter(
    (s) => s["504"] === true || s["504"] === "true",
  ).length;
  const eslCount = students.filter(
    (s) => s.esl === true || s.esl === "true",
  ).length;
  const gateCount = students.filter(
    (s) => s.gate === true || s.gate === "true",
  ).length;

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
          Assignment <span class="gt-count">${hasAssignments ? `${assignData.num_classes} classes` : "not run"}</span>
        </button>
        <div class="grade-meta">
          <button class="btn ghost" onclick="showImportModal()"><i data-lucide="upload" style="width:13px;height:13px;display:inline-block;vertical-align:middle;margin-right:4px"></i>Re‑import</button>
          <button class="btn ghost" onclick="exportCSV()"><i data-lucide="download" style="width:13px;height:13px;display:inline-block;vertical-align:middle;margin-right:4px"></i>Export</button>
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
            <div class="stat-sub">${Math.round((girls / students.length) * 100)}%</div>
          </div>
          <div class="stat">
            <div class="stat-label">Boys</div>
            <div class="stat-value">${boys}</div>
            <div class="stat-sub">${Math.round((boys / students.length) * 100)}%</div>
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
        <button class="tab ${currentStudentTab === "roster" ? "active" : ""}" onclick="switchStudentTab('roster')">Roster <span class="ct">${students.length}</span></button>
        <button class="tab ${currentStudentTab === "friendships" ? "active" : ""}" onclick="switchStudentTab('friendships')">Friendships <span class="ct">${students.reduce((sum, s) => sum + (s.friends ? s.friends.split(",").filter((f) => f.trim()).length : 0), 0)}</span></button>
        <button class="tab ${currentStudentTab === "incompatibilities" ? "active" : ""}" onclick="switchStudentTab('incompatibilities')">Incompatibilities <span class="ct">${students.reduce((sum, s) => sum + (s.incompatible ? s.incompatible.split(",").filter((f) => f.trim()).length : 0), 0)}</span></button>
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
  if (currentStudentTab === "roster") {
    return renderRosterTab(students);
  } else if (currentStudentTab === "friendships") {
    return renderFriendshipsTab(students);
  } else if (currentStudentTab === "incompatibilities") {
    return renderIncompatibilitiesTab(students);
  }
}

// Switch student tab
function switchStudentTab(tab) {
  currentStudentTab = tab;
  showScreen("students"); // Re-render
}

// Roster tab (original student list)
function renderRosterTab(students) {
  // Get all properties from config
  const properties =
    config.properties?.filter((p) => p.enabled && p.type !== "relationship") ||
    [];

  // Check if assignments exist
  const hasAssignments =
    window.currentAssignments && window.currentAssignments.length > 0;

  // Build dynamic column headers
  const numColumns = 2 + properties.length + (hasAssignments ? 1 : 0) + 1; // avatar + name + properties + [assigned class] + arrow
  const gridColumns = `40px 1.5fr ${properties.map((p) => "100px").join(" ")} ${hasAssignments ? "100px " : ""}40px`;

  // Auto-sort by name
  const sortedStudents = [...students].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return `
      <div class="panel">
        <div class="panel-h" style="padding: 10px 16px;">
          <div style="display: flex; gap: 10px; align-items: center;">
            <input class="search-input" placeholder="Search students…" onkeyup="filterStudents(this.value)" />
            <button class="btn sm" onclick="openAddStudentModal()">+ Add student</button>
          </div>
          <span class="sub">${students.length} shown</span>
        </div>

        <div class="student-list" style="border-top: 1px solid var(--line-soft); overflow-x: auto;">
          <!-- Header row -->
          <div class="student-row" style="padding: 7px 12px; background: var(--bg-2); cursor: default; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-3); font-weight: 500; display: grid; grid-template-columns: ${gridColumns}; gap: 10px;">
            <div></div>
            <div>Student</div>
            ${properties.map((p) => `<div style="text-align:center">${p.display_name === "504 Plan" ? "504" : p.display_name}</div>`).join("")}
            ${hasAssignments ? '<div style="text-align:center">Assigned</div>' : ""}
            <div></div>
          </div>
          <!-- Student rows -->
          ${sortedStudents
            .map((s) => {
              const initials = s.name
                .split(" ")
                .map((n) => n[0])
                .join("");

              // Find assigned class if exists
              let assignedClass = null;
              if (hasAssignments) {
                const assignment = window.currentAssignments.find(
                  (a) => a.name === s.name,
                );
                if (assignment) {
                  assignedClass = assignment.assigned_class;
                }
              }

              return `
              <div class="student-row" data-student-name="${s.name.replace(/"/g, "&quot;")}" onclick="showStudentDetail(this.getAttribute('data-student-name'))" style="display: grid; grid-template-columns: ${gridColumns}; gap: 10px;">
                <div class="avatar ${s.gender}">${initials}</div>
                <div><div class="sn">${s.name}</div></div>
                ${properties
                  .map((p) => {
                    const value = s[p.name];
                    const displayValue = formatPropertyValue(p, value);
                    return `<div style="text-align: center;">${displayValue}</div>`;
                  })
                  .join("")}
                ${hasAssignments ? `<div style="text-align: center;"><span class="chip" style="font-size: 10px; background: var(--bg-3); font-weight: 600;">Class ${assignedClass || "—"}</span></div>` : ""}
                <div style="display:flex; align-items:center; justify-content:flex-end;">
                  <span style="color: var(--ink-4);">›</span>
                </div>
              </div>
            `;
            })
            .join("")}
        </div>
      </div>
  `;
}

// Helper to format property values for display
function formatPropertyValue(property, value) {
  if (!value) return "—";

  // Boolean properties
  if (typeof value === "boolean" || value === "true" || value === "false") {
    const isTrue = value === true || value === "true";
    // Show the property display name, but shorten "504 Plan" to "504"
    const displayText =
      property.display_name === "504 Plan" ? "504" : property.display_name;
    return isTrue
      ? `<span class="chip" style="font-size: 9px; background: var(--terra-soft); color: var(--terra-ink); padding: 2px 6px;">${displayText}</span>`
      : "—";
  }

  // Level properties (h/m/l)
  if (["h", "m", "l"].includes(value)) {
    const labels = { h: "High", m: "Med", l: "Low" };
    const colors = { h: "high", m: "med", l: "low" };
    return `<span class="chip ${colors[value]}" style="font-size: 10px;">${labels[value]}</span>`;
  }

  // String values
  return `<span style="font-size: 11px;">${value}</span>`;
}

// Friendships tab
function renderFriendshipsTab(students) {
  // Build friendship list grouped by student
  const studentFriendships = [];

  students.forEach((student) => {
    if (student.friends) {
      const friendNames = student.friends
        .split(",")
        .map((f) => f.trim())
        .filter((f) => f);
      if (friendNames.length > 0) {
        // Check which friends exist in roster
        const friendsData = friendNames.map((friendName) => {
          const found = students.find((s) => s.name === friendName);
          return {
            name: friendName,
            found: !!found,
          };
        });

        studentFriendships.push({
          studentName: student.name,
          friends: friendsData,
          count: friendNames.length,
        });
      }
    }
  });

  // Sort by student name
  studentFriendships.sort((a, b) => a.studentName.localeCompare(b.studentName));

  const totalConnections = studentFriendships.reduce(
    (sum, sf) => sum + sf.count,
    0,
  );

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

        ${
          studentFriendships.length === 0
            ? `
          <div style="padding: 40px; text-align: center; color: var(--ink-3);">
            No friendships defined yet
          </div>
        `
            : studentFriendships
                .map(
                  (sf) => `
          <div class="student-row" style="grid-template-columns: 200px 1fr; align-items: start;">
            <div onclick="showStudentDetail('${sf.studentName.replace(/'/g, "\\'")}')" style="cursor: pointer; padding-top: 2px;">
              <div class="sn">${sf.studentName}</div>
              <div class="sm" style="color: var(--ink-3);">${sf.count} friend${sf.count !== 1 ? "s" : ""}</div>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px; padding-top: 2px;">
              ${sf.friends
                .map(
                  (friend) => `
                <span
                  class="friend-pill"
                  style="
                    display: inline-block;
                    padding: 4px 10px;
                    background: ${friend.found ? "var(--bg-3)" : "var(--rose-soft)"};
                    border: 1px solid ${friend.found ? "var(--line-soft)" : "var(--rose)"};
                    border-radius: 12px;
                    font-size: 12px;
                    color: ${friend.found ? "var(--ink)" : "var(--rose)"};
                    cursor: ${friend.found ? "pointer" : "default"};
                    transition: all 0.15s;
                  "
                  ${friend.found ? `onclick="showStudentDetail('${friend.name.replace(/'/g, "\\'")}')"` : ""}
                  ${friend.found ? "onmouseover=\"this.style.background='var(--terra-soft)'; this.style.borderColor='var(--terra)'\"" : ""}
                  ${friend.found ? "onmouseout=\"this.style.background='var(--bg-3)'; this.style.borderColor='var(--line-soft)'\"" : ""}
                >
                  ${friend.name}${!friend.found ? " ⚠" : ""}
                </span>
              `,
                )
                .join("")}
            </div>
          </div>
        `,
                )
                .join("")
        }
      </div>
    </div>
  `;
}

// Incompatibilities tab
function renderIncompatibilitiesTab(students) {
  // Build incompatibility list grouped by student
  const studentIncompatibilities = [];

  students.forEach((student) => {
    if (student.incompatible) {
      const incompNames = student.incompatible
        .split(",")
        .map((f) => f.trim())
        .filter((f) => f);
      if (incompNames.length > 0) {
        // Check which incompatible students exist in roster
        const incompData = incompNames.map((incompName) => {
          const found = students.find((s) => s.name === incompName);
          return {
            name: incompName,
            found: !!found,
          };
        });

        studentIncompatibilities.push({
          studentName: student.name,
          incompatible: incompData,
          count: incompNames.length,
        });
      }
    }
  });

  // Sort by student name
  studentIncompatibilities.sort((a, b) =>
    a.studentName.localeCompare(b.studentName),
  );

  const totalRules = studentIncompatibilities.reduce(
    (sum, si) => sum + si.count,
    0,
  );

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

        ${
          studentIncompatibilities.length === 0
            ? `
          <div style="padding: 40px; text-align: center; color: var(--ink-3);">
            No incompatibilities defined yet
          </div>
        `
            : studentIncompatibilities
                .map(
                  (si) => `
          <div class="student-row" style="grid-template-columns: 200px 1fr; align-items: start;">
            <div onclick="showStudentDetail('${si.studentName.replace(/'/g, "\\'")}')" style="cursor: pointer; padding-top: 2px;">
              <div class="sn">${si.studentName}</div>
              <div class="sm" style="color: var(--ink-3);">${si.count} rule${si.count !== 1 ? "s" : ""}</div>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px; padding-top: 2px;">
              ${si.incompatible
                .map(
                  (incomp) => `
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
                    cursor: ${incomp.found ? "pointer" : "default"};
                    transition: all 0.15s;
                    ${!incomp.found ? "opacity: 0.6; text-decoration: line-through;" : ""}
                  "
                  ${incomp.found ? `onclick="showStudentDetail('${incomp.name.replace(/'/g, "\\'")}')"` : ""}
                  ${incomp.found ? "onmouseover=\"this.style.background='var(--rose)'; this.style.color='white'\"" : ""}
                  ${incomp.found ? "onmouseout=\"this.style.background='var(--rose-soft)'; this.style.color='var(--rose)'\"" : ""}
                >
                  ${incomp.name}${!incomp.found ? " ⚠" : ""}
                </span>
              `,
                )
                .join("")}
            </div>
          </div>
        `,
                )
                .join("")
        }
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
      num_classes: window.numClasses,
    };
  } else {
    // Fetch fresh from server
    const assignRes = await fetch(`/api/grades/${currentGrade.id}/assignments`);
    assignData = await assignRes.json();
    assignments = assignData.assignments || [];
  }

  const hasAssignments = assignments.length > 0;

  // Always keep currentStudents fresh for the detail panel
  window.currentStudents = students;

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
          Assignment <span class="gt-count">${hasAssignments ? `${data.num_classes} classes` : "not run"}</span>
        </button>
        <div class="grade-meta">
          ${hasAssignments ? '<button class="btn ghost" onclick="exportAssignmentCSV()"><i data-lucide="download" style="width:13px;height:13px;display:inline-block;vertical-align:middle;margin-right:4px"></i>Export</button>' : ""}
          <button class="btn terra" onclick="runAssignment()"><i data-lucide="play" style="width:13px;height:13px;display:inline-block;vertical-align:middle;margin-right:4px"></i>${hasAssignments ? "Re-assign" : "Assign"}</button>
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
            <div class="stat-sub">${data.enforce_class_size ? "Hard constraint" : "Soft constraint"}</div>
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
  if (!classesList || classesList.length === 0) return "";

  // Collect all properties to analyze (from enabled config)
  const propertiesToAnalyze =
    config.properties?.filter((p) => p.enabled && p.type !== "relationship") ||
    [];

  const statCards = propertiesToAnalyze
    .map((prop) => {
      const propName = prop.name;
      const displayName = prop.display_name;

      // Count values per class
      const classBreakdowns = classesList.map((cls) => {
        const students = cls.students;
        const counts = {};

        students.forEach((s) => {
          const value = s[propName];
          if (value) {
            counts[value] = (counts[value] || 0) + 1;
          }
        });

        return { classNum: cls.number, counts, total: students.length };
      });

      // Check if property exists in data
      const hasData = classBreakdowns.some(
        (cb) => Object.keys(cb.counts).length > 0,
      );
      if (!hasData) return "";

      // Calculate balance score (lower is better)
      let balanceScore = "Perfect";
      let balanceColor = "var(--terra)";

      // Get all unique values across all classes
      const allValues = new Set();
      classBreakdowns.forEach((cb) =>
        Object.keys(cb.counts).forEach((v) => allValues.add(v)),
      );

      // Calculate variance for each value and collect detailed stats
      const varianceDetails = [];
      allValues.forEach((value) => {
        const countsForValue = classBreakdowns.map(
          (cb) => cb.counts[value] || 0,
        );
        const totalCount = countsForValue.reduce((a, b) => a + b, 0);
        const avg = totalCount / countsForValue.length;
        const variance =
          countsForValue.reduce(
            (sum, count) => sum + Math.pow(count - avg, 2),
            0,
          ) / countsForValue.length;
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
        const minVariance =
          bestCaseDistribution.reduce(
            (sum, count) => sum + Math.pow(count - avg, 2),
            0,
          ) / bestCaseDistribution.length;
        const minStdDev = Math.sqrt(minVariance);

        // Calculate theoretical maximum variance (worst case: all in one class)
        const worstCaseDistribution = new Array(numClasses).fill(0);
        worstCaseDistribution[0] = totalCount;
        const maxVariance =
          worstCaseDistribution.reduce(
            (sum, count) => sum + Math.pow(count - avg, 2),
            0,
          ) / worstCaseDistribution.length;
        const maxStdDev = Math.sqrt(maxVariance);

        varianceDetails.push({
          value,
          stdDev,
          avg,
          counts: countsForValue,
          minStdDev,
          maxStdDev,
          totalCount,
        });
      });

      // Find max standard deviation
      const maxStdDev = Math.max(...varianceDetails.map((v) => v.stdDev));

      if (maxStdDev > 2) {
        balanceScore = "Unbalanced";
        balanceColor = "var(--rose)";
      } else if (maxStdDev > 1) {
        balanceScore = "Good";
        balanceColor = "var(--terra)";
      }

      // Create breakdown display with variance slider
      const breakdownHTML = varianceDetails
        .map((detail) => {
          // Calculate position on slider (0 = best, 100 = worst)
          const range = detail.maxStdDev - detail.minStdDev;
          const position =
            range > 0 ? ((detail.stdDev - detail.minStdDev) / range) * 100 : 0;
          const achievedPerfection = detail.stdDev <= detail.minStdDev + 0.01;

          return `
        <div style="margin-bottom: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <div style="font-size: 11px; color: var(--ink-3);">${detail.value} (${detail.totalCount} total)</div>
            <div style="font-size: 10px; font-family: var(--t-mono); color: ${achievedPerfection ? "var(--terra)" : "var(--ink-3)"}; font-weight: 500;">
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
            <div style="position: absolute; left: ${position}%; top: 6px; transform: translateX(-50%); width: 10px; height: 10px; background: ${achievedPerfection ? "var(--terra)" : "var(--ink)"}; border: 2px solid var(--panel); border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.2);"></div>
          </div>

          <!-- Labels -->
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <div style="font-size: 9px; font-family: var(--t-mono); color: var(--terra);">min ${detail.minStdDev.toFixed(2)}</div>
            <div style="font-size: 9px; font-family: var(--t-mono); color: var(--rose);">max ${detail.maxStdDev.toFixed(2)}</div>
          </div>

          <!-- Class counts -->
          <div style="display: flex; gap: 4px;">
            ${detail.counts
              .map((count, idx) => {
                const deviation = Math.abs(count - detail.avg);
                const intensity = Math.min(deviation / (detail.avg || 1), 1);
                const bgColor =
                  intensity > 0.3 ? "var(--rose-soft)" : "var(--bg-2)";
                return `
                <div style="flex: 1; text-align: center; padding: 4px; background: ${bgColor}; border-radius: 4px; font-size: 12px; font-weight: 500;">
                  ${count}
                </div>
              `;
              })
              .join("")}
          </div>
        </div>
      `;
        })
        .join("");

      // Count how many values are at optimal
      const optimalCount = varianceDetails.filter(
        (v) => v.stdDev <= v.minStdDev + 0.01,
      ).length;
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
            ${classesList
              .map(
                (cls) => `
              <div style="flex: 1; text-align: center; font-size: 10px; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.05em;">
                Class ${cls.number}
              </div>
            `,
              )
              .join("")}
          </div>
        </div>
      </div>
    `;
    })
    .filter((html) => html)
    .join("");

  // Add friendship and incompatibility stats
  const relationshipStats = calculateRelationshipStats(classesList);

  if (!statCards && !relationshipStats) return "";

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
  if (!classesList || classesList.length === 0) return "";

  const allStudents = classesList.flatMap((cls) => cls.students);

  // Friendship satisfaction stats
  let friendshipHTML = "";
  if (allStudents.some((s) => "has_friend_in_class" in s)) {
    const friendStats = classesList.map((cls) => {
      const students = cls.students;
      const withFriend = students.filter((s) => s.has_friend_in_class).length;
      const total = students.length;
      const percentage = total > 0 ? (withFriend / total) * 100 : 0;
      return { classNum: cls.number, withFriend, total, percentage };
    });

    const totalWithFriend = friendStats.reduce(
      (sum, s) => sum + s.withFriend,
      0,
    );
    const totalStudents = friendStats.reduce((sum, s) => sum + s.total, 0);

    // Calculate how many students COULD have gotten a friend (had friends defined)
    const studentsWithFriendsDefined = allStudents.filter((s) => {
      const friends = s.friends;
      // Check if friends is defined and not empty string or "[]"
      return friends && friends.length > 0 && friends !== "[]";
    }).length;
    const achievementRate =
      studentsWithFriendsDefined > 0
        ? (totalWithFriend / studentsWithFriendsDefined) * 100
        : 0;

    const avgPercentage =
      totalStudents > 0 ? (totalWithFriend / totalStudents) * 100 : 0;

    // Calculate variance in percentages
    const avg =
      friendStats.reduce((sum, s) => sum + s.percentage, 0) /
      friendStats.length;
    const variance =
      friendStats.reduce((sum, s) => sum + Math.pow(s.percentage - avg, 2), 0) /
      friendStats.length;
    const stdDev = Math.sqrt(variance);

    // Quality is based on how balanced distribution is (stdDev), not achievement rate
    let qualityColor = "var(--terra)";
    let qualityLabel = "Good";
    if (stdDev < 5) {
      qualityLabel = "Excellent";
      qualityColor = "var(--terra)";
    } else if (stdDev > 15) {
      qualityLabel = "Unbalanced";
      qualityColor = "var(--rose)";
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
              ${friendStats
                .map((s) => {
                  const deviation = Math.abs(s.percentage - avg);
                  const bgColor =
                    deviation > 10 ? "var(--rose-soft)" : "var(--bg-2)";
                  return `
                  <div style="flex: 1; text-align: center; padding: 4px; background: ${bgColor}; border-radius: 4px; font-size: 11px; font-weight: 500;">
                    ${s.withFriend}/${s.total}<br>
                    <span style="font-size: 10px; color: var(--ink-3);">${s.percentage.toFixed(0)}%</span>
                  </div>
                `;
                })
                .join("")}
            </div>
          </div>
          <div style="display: flex; gap: 4px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--line-soft);">
            ${classesList
              .map(
                (cls) => `
              <div style="flex: 1; text-align: center; font-size: 10px; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.05em;">
                Class ${cls.number}
              </div>
            `,
              )
              .join("")}
          </div>
        </div>
      </div>
    `;
  }

  // Incompatibility verification stats
  let incompatibilityHTML = "";
  const studentsWithIncompat = allStudents.filter(
    (s) => s.incompatible && s.incompatible.length > 0,
  );

  if (studentsWithIncompat.length > 0) {
    // Build unique pairs to avoid double-counting mutual incompatibilities
    const uniquePairs = new Set();
    allStudents.forEach((student) => {
      if (student.incompatible) {
        const incompatList =
          typeof student.incompatible === "string"
            ? student.incompatible
                .split(",")
                .map((n) => n.trim())
                .filter((n) => n)
            : student.incompatible || [];

        incompatList.forEach((incompName) => {
          // Create a canonical pair key (alphabetically sorted to avoid duplicates)
          const pair = [student.name, incompName].sort().join("|||");
          uniquePairs.add(pair);
        });
      }
    });

    // Check for violations
    const violations = [];
    const violationPairs = new Set();
    classesList.forEach((cls) => {
      const studentsInClass = cls.students;
      const nameSet = new Set(studentsInClass.map((s) => s.name));

      studentsInClass.forEach((student) => {
        if (student.incompatible) {
          const incompatList =
            typeof student.incompatible === "string"
              ? student.incompatible
                  .split(",")
                  .map((n) => n.trim())
                  .filter((n) => n)
              : student.incompatible;

          incompatList.forEach((incompName) => {
            if (nameSet.has(incompName)) {
              const pair = [student.name, incompName].sort().join("|||");
              if (!violationPairs.has(pair)) {
                violationPairs.add(pair);
                violations.push({
                  class: cls.number,
                  student1: student.name,
                  student2: incompName,
                });
              }
            }
          });
        }
      });
    });

    const totalPairs = uniquePairs.size;
    const violationCount = violations.length;
    const successRate =
      totalPairs > 0 ? ((totalPairs - violationCount) / totalPairs) * 100 : 100;

    let qualityColor = violationCount === 0 ? "var(--terra)" : "var(--rose)";
    let qualityLabel = violationCount === 0 ? "Perfect" : "VIOLATIONS";

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
          ${
            violationCount > 0
              ? `
            <div style="padding: 8px; background: var(--rose-soft); border-radius: 4px; border: 1px solid var(--rose); margin-bottom: 8px;">
              <div style="font-weight: 600; color: var(--rose); margin-bottom: 4px;">${violationCount} Violation${violationCount !== 1 ? "s" : ""} Found</div>
              ${violations
                .slice(0, 3)
                .map(
                  (v) => `
                <div style="font-size: 11px; color: var(--ink); margin-top: 4px;">
                  • Class ${v.class}: ${v.student1} ↔ ${v.student2}
                </div>
              `,
                )
                .join("")}
              ${violations.length > 3 ? `<div style="font-size: 11px; color: var(--ink-3); margin-top: 4px;">... and ${violations.length - 3} more</div>` : ""}
            </div>
          `
              : `
            <div style="padding: 8px; background: var(--terra-soft); border-radius: 4px; border: 1px solid var(--terra);">
              <div style="font-weight: 600; color: var(--terra);">All pairs kept apart</div>
              <div style="font-size: 11px; color: var(--ink-3); margin-top: 4px;">${totalPairs} incompatible ${totalPairs === 1 ? "pair" : "pairs"} successfully separated</div>
            </div>
          `
          }
        </div>
      </div>
    `;
  }

  return friendshipHTML + incompatibilityHTML;
}

// Render assignment results (when assignments exist)
function renderAssignmentResults(assignments, numClasses, assignData) {
  // Group students by class
  const classesList = Array.from({ length: numClasses }, (_, i) => ({
    number: i + 1,
    students: assignments.filter((a) => a.assigned_class === i + 1),
  }));

  // Find roster students not in assignments
  const assignedNames = new Set(assignments.map((a) => a.name));
  const unassignedStudents = (window.currentStudents || []).filter(
    (s) => !assignedNames.has(s.name),
  );

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
  const isOptimal = assignData?.solver_status === "OPTIMAL";
  const solverElapsed = assignData?.solver_elapsed;
  const solverCombinations = assignData?.solver_combinations;

  return `
    <!-- Optimal Banner -->
    ${
      isOptimal && solverCombinations
        ? `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;padding:11px 16px;background:var(--ink);border-radius:var(--rad);color:var(--bg)">
        <div style="width:28px;height:28px;border-radius:50%;background:var(--terra);flex-shrink:0;display:flex;align-items:center;justify-content:center">
          <i data-lucide="check" style="width:14px;height:14px;color:#fff"></i>
        </div>
        <div style="flex:1;min-width:0">
          <span style="font-weight:600;font-size:13px;color:var(--terra)">Optimal assignment</span>
          <span style="font-size:12px;color:oklch(0.72 0.01 60);margin-left:8px">Best possible arrangement out of ${solverCombinations} combinations · found in ${solverElapsed}s</span>
        </div>
      </div>
    `
        : ""
    }

    <!-- Edit Mode Controls -->
    ${
      hasBaseline
        ? `
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding: 12px 16px; background: var(--bg-2); border-radius: var(--rad); border: 1px solid var(--line-soft);">
        <div style="flex: 1; display: flex; align-items: center; gap: 12px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;">
            <input type="checkbox" id="editModeToggle" ${window.editMode ? "checked" : ""} onchange="toggleEditMode(this.checked)" style="width: 16px; height: 16px; cursor: pointer;">
            <span style="font-weight: 500; color: var(--ink);">Edit Mode</span>
          </label>
          <span style="font-size: 11px; color: var(--ink-3);">Enable to manually adjust class assignments</span>
        </div>
        <div id="editModeActions" style="display: ${window.editMode ? "flex" : "none"}; gap: 8px;">
          <button class="btn ghost sm" onclick="revertToSolver()" ${!window.hasUnsavedChanges ? "disabled" : ""}>Revert to last save</button>
          <button class="btn primary sm" onclick="saveManualChanges()" ${!window.hasUnsavedChanges ? "disabled" : ""}>Save Changes</button>
        </div>
      </div>
    `
        : ""
    }

    <!-- Unassigned Students (only shown when roster has students not in assignment) -->
    ${
      unassignedStudents.length > 0
        ? `
      <div style="margin-bottom: 16px; padding: 12px 16px; background: var(--amber-soft, var(--bg-2)); border: 1px dashed var(--amber, var(--line-soft)); border-radius: var(--rad);">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px">
          <div>
            <span style="font-weight:600; font-size:13px">Unassigned</span>
            <span style="font-size:11px; color:var(--ink-3); margin-left:8px">${unassignedStudents.length} student${unassignedStudents.length !== 1 ? "s" : ""} added after last run — drag to a class or re-run the optimizer</span>
          </div>
        </div>
        <div class="class-drop-zone" data-class-number="0" ondrop="handleDrop(event)" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)"
          style="display:flex; flex-wrap:wrap; gap:6px; min-height:36px">
          ${unassignedStudents
            .map((s) => {
              const initials = s.name
                .split(" ")
                .map((n) => n[0])
                .join("");
              return `
              <div class="draggable-student"
                   data-student-name="${s.name}"
                   data-current-class="0"
                   draggable="true"
                   ondragstart="handleDragStart(event)" ondragend="handleDragEnd(event)"
                   style="display:inline-flex; align-items:center; gap:6px; padding:5px 10px; background:var(--panel); border:1px solid var(--line-soft); border-radius:6px; cursor:move; font-size:12px">
                <span class="avatar ${s.gender}" style="width:20px;height:20px;font-size:9px">${initials}</span>
                <span onclick="showStudentDetail('${s.name.replace(/'/g, "\\'")}'); event.stopPropagation();" style="cursor:pointer">${s.name}</span>
              </div>
            `;
            })
            .join("")}
        </div>
      </div>
    `
        : ""
    }

    <!-- Class Cards -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 32px;" id="classCardsContainer">
      ${classesList
        .map(
          (cls) => `
        <div class="panel class-drop-zone" data-class-number="${cls.number}" ondrop="handleDrop(event)" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)">
          <div class="panel-h">
            <h3>Class ${cls.number}</h3>
            <span class="sub class-count">${cls.students.length} students</span>
          </div>
          <div class="panel-b" style="padding: 0;">
            <div class="student-list" style="max-height: 400px; overflow-y: auto;">
              ${cls.students
                .map((s) => {
                  const initials = s.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("");
                  return `
                  <div class="student-row ${window.editMode ? "draggable-student" : ""}"
                       data-student-name="${s.name}"
                       data-current-class="${cls.number}"
                       draggable="${window.editMode}"
                       ${window.editMode ? 'ondragstart="handleDragStart(event)" ondragend="handleDragEnd(event)"' : ""}
                       style="display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--line-soft); ${window.editMode ? "cursor: move;" : ""}">
                    <div class="avatar ${s.gender}">${initials}</div>
                    <div onclick="showStudentDetail('${s.name.replace(/'/g, "\\'")}'); event.stopPropagation();" style="flex: 1; cursor: pointer;">
                      <div class="sn">${s.name}</div>
                    </div>
                    <div style="display:flex; gap:4px;">
                      ${s.iep ? '<span class="chip" style="font-size: 9px;">IEP</span>' : ""}
                      ${s["504"] ? '<span class="chip" style="font-size: 9px;">504</span>' : ""}
                      ${s.esl ? '<span class="chip" style="font-size: 9px;">ESL</span>' : ""}
                    </div>
                  </div>
                `;
                })
                .join("")}
            </div>
          </div>
        </div>
      `,
        )
        .join("")}
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

        <h3 style="margin-bottom: 8px;">No assignments yet</h3>
        <p style="color: var(--ink-3); margin-bottom: 24px;">Run the optimizer to create balanced class assignments</p>
        <button class="btn terra" onclick="runAssignment()"><i data-lucide="play" style="width:13px;height:13px;display:inline-block;vertical-align:middle;margin-right:4px"></i>Assign</button>
      </div>
    </div>
  `;
}

// Run assignment
async function runAssignment() {
  if (!currentGrade) {
    showNotice("No grade selected", "error");
    return;
  }

  // Show loading state
  const btn = event?.target;
  const originalHTML = btn?.innerHTML;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML =
      '<i data-lucide="loader" style="width:13px;height:13px;display:inline-block;vertical-align:middle;margin-right:5px"></i>Running...';
    renderIcons();
  }

  try {
    // Call the assignment API
    const response = await fetch(`/api/assign/${currentGrade.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const result = await response.json();

    if (response.ok && result.status === "success") {
      // Reload grades to update status
      await loadGrades();

      // Show results screen
      await showScreen("results");

      const isOptimal = result.solver_status === "OPTIMAL";
      const elapsed = result.elapsed ? `${result.elapsed}s` : "";
      const combos = result.combinations || "";

      if (isOptimal && combos) {
        showOptimalNotice(
          elapsed,
          combos,
          result.num_classes,
          result.student_count,
        );
      } else {
        showNotice(
          combos
            ? `Solution found in ${elapsed} out of ${combos} possible combinations.<br><small style="color:var(--ink-3)">Not mathematically proven optimal — re-running may improve results.</small>`
            : `Created ${result.num_classes || "balanced"} classes for ${result.student_count || "all"} students.`,
          "success",
        );
      }
    } else {
      throw new Error(result.error || "Assignment failed");
    }
  } catch (error) {
    console.error("Assignment error:", error);
    showNotice(error.message, "error");
  } finally {
    // Restore button
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  }
}

// Modal functions
function showImportModal() {
  document.getElementById("importModalBody").innerHTML = `
    <div
      id="import-modal-dropzone"
      style="border:2px dashed var(--line-soft);border-radius:8px;padding:40px;text-align:center;cursor:pointer;color:var(--ink-3);font-size:13px;margin-bottom:16px"
      onclick="document.getElementById('import-modal-file').click()"
      ondragover="event.preventDefault(); this.style.borderColor='var(--terra)'"
      ondragleave="this.style.borderColor='var(--line-soft)'"
      ondrop="event.preventDefault(); this.style.borderColor='var(--line-soft)'; _handleImportModalFile(event.dataTransfer.files[0])">
      <i data-lucide="upload" style="width:22px;height:22px;margin-bottom:10px;color:var(--ink-3)"></i>
      <div style="font-weight:600;font-size:14px;margin-bottom:6px">Drop CSV or click to upload</div>
      <div style="font-size:12px;color:var(--rose)">This will overwrite all current students and assignments for this grade</div>
    </div>
    <input id="import-modal-file" type="file" accept=".csv" style="display:none" onchange="_handleImportModalFile(this.files[0])">
    <div style="background:var(--bg-2);border-radius:6px;padding:12px 14px;font-size:11px;color:var(--ink-3);line-height:1.7;font-family:var(--t-mono)">
      name, grade, gender, math, reading, behavior, independence, iep, 504, esl, gate, friends, incompatible
    </div>
    <div id="import-modal-status" style="margin-top:12px;font-size:12px"></div>
  `;
  document.getElementById("importModal").classList.add("open");
}

function closeImportModal() {
  document.getElementById("importModal").classList.remove("open");
}

function closeBalanceInfoModal() {
  document.getElementById("balanceInfoModal").classList.remove("open");
}

// Detail panel
function showStudentDetail(name) {
  console.log("showStudentDetail called with:", name);
  console.log("window.currentStudents:", window.currentStudents);
  const student = window.currentStudents?.find((s) => s.name === name);
  console.log("Found student:", student);
  if (!student) {
    console.error("Student not found:", name);
    return;
  }

  const panel = document.getElementById("detailPanel");
  const initials = student.name
    .split(" ")
    .map((n) => n[0])
    .join("");

  panel.innerHTML = `
    <div class="detail-h">
      <div>
        <div class="nm">${student.name}</div>
        <div class="gr">${currentGrade?.name || "Grade"}</div>
      </div>
      <button class="btn ghost sm" onclick="closeStudentDetail()">✕</button>
    </div>
    <div class="detail-b">
      <div class="detail-section" data-student-name="${student.name.replace(/"/g, "&quot;")}">
        <h5>Properties</h5>
        <div class="prop-row">
          <span class="k">Gender</span>
          <div class="segmented">
            <button class="seg ${student.gender === "g" ? "active" : ""}" data-property="gender" data-value="g">Girl</button>
            <button class="seg ${student.gender === "b" ? "active" : ""}" data-property="gender" data-value="b">Boy</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="k">Behavior</span>
          <div class="segmented">
            <button class="seg ${student.behavior === "cooperative" ? "active" : ""}" data-property="behavior" data-value="cooperative">Cooperative</button>
            <button class="seg ${student.behavior === "neutral" ? "active" : ""}" data-property="behavior" data-value="neutral">Neutral</button>
            <button class="seg ${student.behavior === "disruptive" ? "active" : ""}" data-property="behavior" data-value="disruptive">Disruptive</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="k">Independence</span>
          <div class="segmented">
            <button class="seg ${student.independence === "high" ? "active" : ""}" data-property="independence" data-value="high">High</button>
            <button class="seg ${student.independence === "neutral" ? "active" : ""}" data-property="independence" data-value="neutral">Neutral</button>
            <button class="seg ${student.independence === "low" ? "active" : ""}" data-property="independence" data-value="low">Low</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="k">IEP</span>
          <div class="segmented">
            <button class="seg ${student.iep === false ? "active" : ""}" data-property="iep" data-value="false">No</button>
            <button class="seg ${student.iep === true ? "active" : ""}" data-property="iep" data-value="true">Yes</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="k">504 Plan</span>
          <div class="segmented">
            <button class="seg ${student["504"] === false ? "active" : ""}" data-property="504" data-value="false">No</button>
            <button class="seg ${student["504"] === true ? "active" : ""}" data-property="504" data-value="true">Yes</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="k">ESL</span>
          <div class="segmented">
            <button class="seg ${student.esl === false ? "active" : ""}" data-property="esl" data-value="false">No</button>
            <button class="seg ${student.esl === true ? "active" : ""}" data-property="esl" data-value="true">Yes</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="k">GATE</span>
          <div class="segmented">
            <button class="seg ${student.gate === false ? "active" : ""}" data-property="gate" data-value="false">No</button>
            <button class="seg ${student.gate === true ? "active" : ""}" data-property="gate" data-value="true">Yes</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="k">Math level</span>
          <div class="segmented">
            <button class="seg ${student.math === "l" ? "active" : ""}" data-property="math" data-value="l">Low</button>
            <button class="seg ${student.math === "m" ? "active" : ""}" data-property="math" data-value="m">Med</button>
            <button class="seg ${student.math === "h" ? "active" : ""}" data-property="math" data-value="h">High</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="k">Reading level</span>
          <div class="segmented">
            <button class="seg ${student.reading === "l" ? "active" : ""}" data-property="reading" data-value="l">Low</button>
            <button class="seg ${student.reading === "m" ? "active" : ""}" data-property="reading" data-value="m">Med</button>
            <button class="seg ${student.reading === "h" ? "active" : ""}" data-property="reading" data-value="h">High</button>
          </div>
        </div>
      </div>

      <div class="detail-section">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px">
          <h5 style="margin:0">Friends (${student.friends ? student.friends.split(",").filter((f) => f.trim()).length : 0})</h5>
          <button class="btn ghost sm" onclick="openRelationModal('${student.name.replace(/'/g, "\\'")}', 'friends')">+ Add</button>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:6px">
          ${
            student.friends
              ? student.friends
                  .split(",")
                  .filter((f) => f.trim())
                  .map((fname) => {
                    const fname_trimmed = fname.trim();
                    const friend = window.currentStudents?.find(
                      (s) => s.name === fname_trimmed,
                    );
                    if (!friend)
                      return `<span class="muted">${fname_trimmed}</span>`;
                    const fInitials = friend.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("");
                    return `
              <span class="friend-pill" style="display:inline-flex; align-items:center; gap:4px">
                <span data-student-name="${friend.name.replace(/"/g, "&quot;")}" onclick="showStudentDetail(this.getAttribute('data-student-name'))" style="display:inline-flex; align-items:center; gap:4px; cursor:pointer">
                  <span class="avatar ${friend.gender}">${fInitials}</span>
                  <span>${friend.name}</span>
                </span>
                <button onclick="removeRelation('${student.name.replace(/'/g, "\\'")}', 'friends', '${fname_trimmed.replace(/'/g, "\\'")}')" style="background:none; border:none; cursor:pointer; padding:0 2px; color:var(--ink-3); font-size:12px; line-height:1" title="Remove">×</button>
              </span>
            `;
                  })
                  .join("")
              : '<span class="muted" style="font-size:12px">None listed.</span>'
          }
        </div>
      </div>

      <div class="detail-section">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px">
          <h5 style="margin:0">Cannot be with (${student.incompatible ? student.incompatible.split(",").filter((f) => f.trim()).length : 0})</h5>
          <button class="btn ghost sm" onclick="openRelationModal('${student.name.replace(/'/g, "\\'")}', 'incompatible')">+ Add</button>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:6px">
          ${
            student.incompatible
              ? student.incompatible
                  .split(",")
                  .filter((f) => f.trim())
                  .map((fname) => {
                    const fname_trimmed = fname.trim();
                    const incomp = window.currentStudents?.find(
                      (s) => s.name === fname_trimmed,
                    );
                    if (!incomp)
                      return `<span class="muted">${fname_trimmed}</span>`;
                    const iInitials = incomp.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("");
                    return `
              <span class="friend-pill" style="border-color: var(--rose-soft); display:inline-flex; align-items:center; gap:4px">
                <span data-student-name="${incomp.name.replace(/"/g, "&quot;")}" onclick="showStudentDetail(this.getAttribute('data-student-name'))" style="display:inline-flex; align-items:center; gap:4px; cursor:pointer">
                  <span class="avatar ${incomp.gender}">${iInitials}</span>
                  <span>${incomp.name}</span>
                </span>
                <button onclick="removeRelation('${student.name.replace(/'/g, "\\'")}', 'incompatible', '${fname_trimmed.replace(/'/g, "\\'")}')" style="background:none; border:none; cursor:pointer; padding:0 2px; color:var(--ink-3); font-size:12px; line-height:1" title="Remove">×</button>
              </span>
            `;
                  })
                  .join("")
              : '<span class="muted" style="font-size:12px">None listed.</span>'
          }
        </div>
      </div>
      <div class="detail-section" style="margin-top:auto; padding-top:16px; border-top:1px solid var(--line-soft)">
        <button class="btn ghost sm" style="color:var(--rose); border-color:var(--rose-soft); width:100%"
          onclick="confirmDeleteStudent('${student.name.replace(/'/g, "\\'")}')">
          Remove from roster
        </button>
      </div>
    </div>
  `;

  panel.classList.add("open");

  // Add event listeners for segmented controls
  panel.querySelectorAll(".seg[data-property]").forEach((btn) => {
    btn.addEventListener("click", function () {
      const studentName = this.closest("[data-student-name]").getAttribute(
        "data-student-name",
      );
      const property = this.getAttribute("data-property");
      const value = this.getAttribute("data-value");
      updateStudentProperty(studentName, property, value);
    });
  });
}

function closeStudentDetail() {
  document.getElementById("detailPanel").classList.remove("open");
}

async function updateStudentProperty(studentName, property, value) {
  if (!currentGrade) return;

  // Update in memory
  const student = window.currentStudents?.find((s) => s.name === studentName);
  if (student) {
    // Convert boolean strings to actual booleans
    if (value === "true") {
      student[property] = true;
    } else if (value === "false") {
      student[property] = false;
    } else {
      student[property] = value;
    }
  }

  // Update on server
  try {
    const res = await fetch(`/api/grades/${currentGrade.id}/students`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ students: window.currentStudents }),
    });

    if (res.ok) {
      // Refresh the view to show updated data
      showScreen("students");
      // Reopen detail panel
      setTimeout(() => showStudentDetail(studentName), 100);
    }
  } catch (err) {
    console.error("Failed to update student:", err);
    showNotice("Failed to save changes", "error");
  }
}

// ── Relation modal (friends / incompatible) ──────────────────────────────────

let _relationModal = null;

function openRelationModal(studentName, type) {
  if (_relationModal) _relationModal.remove();

  const student = window.currentStudents?.find((s) => s.name === studentName);
  if (!student) return;

  // Build current list so we can exclude already-added names + the student themselves
  const currentList =
    (type === "friends" ? student.friends : student.incompatible) || "";
  const currentNames = new Set(
    currentList
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean),
  );
  currentNames.add(studentName);

  const candidates = (window.currentStudents || []).filter(
    (s) => !currentNames.has(s.name),
  );

  const label = type === "friends" ? "friend" : "student to separate";
  const titleLabel = type === "friends" ? "Add Friend" : "Add Incompatible";

  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:1000;display:flex;align-items:center;justify-content:center";
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  overlay.innerHTML = `
    <div style="background:var(--panel);border-radius:12px;width:360px;max-height:480px;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.18)">
      <div style="padding:16px 20px 12px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line-soft)">
        <div>
          <div style="font-weight:600;font-size:14px">${titleLabel}</div>
          <div style="font-size:11px;color:var(--ink-3);margin-top:2px">for ${studentName}</div>
        </div>
        <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--ink-3);padding:0 4px">×</button>
      </div>
      <div style="padding:12px 16px;border-bottom:1px solid var(--line-soft)">
        <input id="relation-search" type="text" placeholder="Search by name…" autocomplete="off"
          style="width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid var(--line-soft);border-radius:6px;font-size:13px;background:var(--bg-2);color:var(--ink);outline:none"
          oninput="filterRelationList(this.value)">
      </div>
      <div id="relation-list" style="overflow-y:auto;flex:1;padding:8px 0">
        ${
          candidates.length === 0
            ? `<div style="padding:16px 20px;font-size:13px;color:var(--ink-3)">No other students available.</div>`
            : candidates
                .map((s) => {
                  const initials = s.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("");
                  return `
                <div class="relation-candidate" data-name="${s.name.replace(/"/g, "&quot;")}"
                  onclick="addRelation('${studentName.replace(/'/g, "\\'")}', '${type}', this.getAttribute('data-name'))"
                  style="display:flex;align-items:center;gap:10px;padding:9px 20px;cursor:pointer"
                  onmouseover="this.style.background='var(--bg-2)'" onmouseout="this.style.background=''">
                  <span class="avatar ${s.gender}">${initials}</span>
                  <span style="font-size:13px">${s.name}</span>
                </div>
              `;
                })
                .join("")
        }
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  _relationModal = overlay;
  overlay.querySelector("#relation-search").focus();
}

function filterRelationList(query) {
  const q = query.toLowerCase();
  document.querySelectorAll(".relation-candidate").forEach((el) => {
    el.style.display = el.dataset.name.toLowerCase().includes(q) ? "" : "none";
  });
}

async function addRelation(studentName, type, targetName) {
  if (_relationModal) {
    _relationModal.remove();
    _relationModal = null;
  }

  const student = window.currentStudents?.find((s) => s.name === studentName);
  if (!student) return;

  const current = (student[type] || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  if (!current.includes(targetName)) {
    current.push(targetName);
    student[type] = current.join(",");
  }

  await _saveAndReopenDetail(studentName);
}

async function removeRelation(studentName, type, targetName) {
  const student = window.currentStudents?.find((s) => s.name === studentName);
  if (!student) return;

  const current = (student[type] || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  student[type] = current.filter((n) => n !== targetName).join(",");

  await _saveAndReopenDetail(studentName);
}

async function _handleImportModalFile(file) {
  const statusEl = document.getElementById("import-modal-status");
  if (statusEl) {
    statusEl.textContent = "Parsing…";
    statusEl.style.color = "var(--ink-3)";
  }

  // Temporarily swap the error target so handleGradeCSVFile can write status
  const orig = document.getElementById("grade-csv-error");

  // Inline the same parsing + save, then close modal on success
  if (!file || !currentGrade) return;

  const text = await file.text();
  const lines = text
    .trim()
    .split("\n")
    .filter((l) => l.trim());
  if (lines.length < 2) {
    if (statusEl) {
      statusEl.textContent = "CSV is empty.";
      statusEl.style.color = "var(--rose)";
    }
    return;
  }

  const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
  const nameIdx = headers.findIndex(
    (h) => h.includes("name") || h === "student",
  );
  const gradeIdx = headers.findIndex((h) => h === "grade");
  const genderIdx = headers.findIndex(
    (h) => h.includes("gender") || h.includes("sex"),
  );
  const mathIdx = headers.findIndex((h) => h === "math");
  const readingIdx = headers.findIndex((h) => h === "reading");
  const behaviorIdx = headers.findIndex((h) => h.includes("behavior"));
  const indepIdx = headers.findIndex((h) => h.includes("independence"));
  const iepIdx = headers.findIndex((h) => h === "iep");
  const plan504Idx = headers.findIndex((h) => h === "504");
  const eslIdx = headers.findIndex((h) => h === "esl");
  const gateIdx = headers.findIndex((h) => h === "gate");
  const friendsIdx = headers.findIndex((h) => h.includes("friend"));
  const incompIdx = headers.findIndex((h) => h.includes("incompatible"));

  if (nameIdx === -1) {
    if (statusEl) {
      statusEl.textContent = 'CSV must have a "name" column.';
      statusEl.style.color = "var(--rose)";
    }
    return;
  }

  const students = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    if (!cells[nameIdx]?.trim()) continue;
    if (gradeIdx !== -1) {
      const rowGrade = normalizeGradeName(cells[gradeIdx] || "");
      if (rowGrade && rowGrade !== currentGrade.name) continue;
    }
    students.push({
      name: cells[nameIdx].trim(),
      gender: genderIdx !== -1 ? normalizeGender(cells[genderIdx]) : "b",
      behavior:
        behaviorIdx !== -1 ? normalizeBehavior(cells[behaviorIdx]) : "neutral",
      independence:
        indepIdx !== -1 ? normalizeIndependence(cells[indepIdx]) : "neutral",
      iep: iepIdx !== -1 ? normalizeYesNo(cells[iepIdx]) === "y" : false,
      504:
        plan504Idx !== -1 ? normalizeYesNo(cells[plan504Idx]) === "y" : false,
      esl: eslIdx !== -1 ? normalizeYesNo(cells[eslIdx]) === "y" : false,
      gate: gateIdx !== -1 ? normalizeYesNo(cells[gateIdx]) === "y" : false,
      math: mathIdx !== -1 ? normalizeLevelHML(cells[mathIdx]) : "m",
      reading: readingIdx !== -1 ? normalizeLevelHML(cells[readingIdx]) : "m",
      friends: friendsIdx !== -1 ? (cells[friendsIdx] || "").trim() : "",
      incompatible: incompIdx !== -1 ? (cells[incompIdx] || "").trim() : "",
    });
  }

  if (students.length === 0) {
    if (statusEl) {
      statusEl.textContent = "No matching students found.";
      statusEl.style.color = "var(--rose)";
    }
    return;
  }

  if (statusEl)
    statusEl.textContent = `Found ${students.length} students — saving…`;

  const res = await fetch(`/api/grades/${currentGrade.id}/students`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ students }),
  });

  if (res.ok) {
    closeImportModal();
    await loadGrades();
    showScreen("students");
  } else {
    if (statusEl) {
      statusEl.textContent = "Failed to save.";
      statusEl.style.color = "var(--rose)";
    }
  }
}
window._handleImportModalFile = _handleImportModalFile;

// ── Grade CSV import (empty-state screen) ─────────────────────────────────────

async function handleGradeCSVFile(file) {
  if (!file || !currentGrade) return;
  const errorEl = document.getElementById("grade-csv-error");

  const text = await file.text();
  const lines = text
    .trim()
    .split("\n")
    .filter((l) => l.trim());
  if (lines.length < 2) {
    if (errorEl) errorEl.textContent = "CSV is empty.";
    return;
  }

  const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
  const nameIdx = headers.findIndex(
    (h) => h.includes("name") || h === "student",
  );
  const gradeIdx = headers.findIndex((h) => h === "grade");
  const genderIdx = headers.findIndex(
    (h) => h.includes("gender") || h.includes("sex"),
  );
  const mathIdx = headers.findIndex((h) => h === "math");
  const readingIdx = headers.findIndex((h) => h === "reading");
  const behaviorIdx = headers.findIndex((h) => h.includes("behavior"));
  const indepIdx = headers.findIndex((h) => h.includes("independence"));
  const iepIdx = headers.findIndex((h) => h === "iep");
  const plan504Idx = headers.findIndex((h) => h === "504");
  const eslIdx = headers.findIndex((h) => h === "esl");
  const gateIdx = headers.findIndex((h) => h === "gate");
  const friendsIdx = headers.findIndex((h) => h.includes("friend"));
  const incompIdx = headers.findIndex((h) => h.includes("incompatible"));

  if (nameIdx === -1) {
    if (errorEl) errorEl.textContent = 'CSV must have a "name" column.';
    return;
  }
  if (errorEl) errorEl.textContent = "";

  const students = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    if (!cells[nameIdx]?.trim()) continue;
    if (gradeIdx !== -1) {
      const rowGrade = normalizeGradeName(cells[gradeIdx] || "");
      if (rowGrade && rowGrade !== currentGrade.name) continue;
    }
    students.push({
      name: cells[nameIdx].trim(),
      gender: genderIdx !== -1 ? normalizeGender(cells[genderIdx]) : "b",
      behavior:
        behaviorIdx !== -1 ? normalizeBehavior(cells[behaviorIdx]) : "neutral",
      independence:
        indepIdx !== -1 ? normalizeIndependence(cells[indepIdx]) : "neutral",
      iep: iepIdx !== -1 ? normalizeYesNo(cells[iepIdx]) === "y" : false,
      504:
        plan504Idx !== -1 ? normalizeYesNo(cells[plan504Idx]) === "y" : false,
      esl: eslIdx !== -1 ? normalizeYesNo(cells[eslIdx]) === "y" : false,
      gate: gateIdx !== -1 ? normalizeYesNo(cells[gateIdx]) === "y" : false,
      math: mathIdx !== -1 ? normalizeLevelHML(cells[mathIdx]) : "m",
      reading: readingIdx !== -1 ? normalizeLevelHML(cells[readingIdx]) : "m",
      friends: friendsIdx !== -1 ? (cells[friendsIdx] || "").trim() : "",
      incompatible: incompIdx !== -1 ? (cells[incompIdx] || "").trim() : "",
    });
  }

  if (students.length === 0) {
    if (errorEl) errorEl.textContent = "No matching students found in CSV.";
    return;
  }

  const res = await fetch(`/api/grades/${currentGrade.id}/students`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ students }),
  });

  if (res.ok) {
    await loadGrades();
    showScreen("students");
  } else {
    if (errorEl) errorEl.textContent = "Failed to save students.";
  }
}

// ── Notice modal (replaces browser alert for key actions) ────────────────────

function showConfirm(
  message,
  { confirmLabel = "Confirm", destructive = false } = {},
) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:2000;display:flex;align-items:center;justify-content:center";

    const confirmColor = destructive ? "var(--rose)" : "var(--terra)";

    overlay.innerHTML = `
      <div style="background:var(--panel);border-radius:12px;width:360px;padding:24px 24px 20px;box-shadow:0 12px 40px rgba(0,0,0,0.2)">
        <div style="font-size:14px;color:var(--ink);line-height:1.5;margin-bottom:20px">${message}</div>
        <div style="display:flex;justify-content:flex-end;gap:8px">
          <button class="btn ghost sm" id="confirm-cancel">Cancel</button>
          <button class="btn sm" id="confirm-ok" style="background:${confirmColor};color:#fff;border-color:${confirmColor}">${confirmLabel}</button>
        </div>
      </div>
    `;

    overlay.querySelector("#confirm-cancel").addEventListener("click", () => {
      overlay.remove();
      resolve(false);
    });
    overlay.querySelector("#confirm-ok").addEventListener("click", () => {
      overlay.remove();
      resolve(true);
    });

    document.body.appendChild(overlay);
    overlay.querySelector("#confirm-ok").focus();
  });
}
window.showConfirm = showConfirm;

function showNotice(message, type = "success") {
  const isError = type === "error";
  const iconName = isError ? "x" : "check";
  const accentColor = isError ? "var(--rose)" : "var(--terra)";
  const accentSoft = isError ? "var(--rose-soft)" : "var(--terra-soft)";

  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:2000;display:flex;align-items:center;justify-content:center";
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  overlay.innerHTML = `
    <div style="background:var(--panel);border-radius:14px;width:420px;padding:32px 28px 24px;box-shadow:0 12px 40px rgba(0,0,0,0.2);text-align:center">
      <div style="width:48px;height:48px;border-radius:50%;background:${accentSoft};border:2px solid ${accentColor};display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:${accentColor}">
        <i data-lucide="${iconName}" style="width:22px;height:22px"></i>
      </div>
      <div style="font-size:14px;color:var(--ink);line-height:1.6;margin-bottom:20px">${message}</div>
      <button class="btn sm" style="background:${accentColor};color:#fff;border-color:${accentColor};min-width:80px" onclick="this.closest('[style*=fixed]').remove()">OK</button>
    </div>
  `;

  document.body.appendChild(overlay);
  renderIcons();
  overlay.querySelector("button").focus();
}
window.showNotice = showNotice;

function showOptimalNotice(elapsed, combinations, numClasses, studentCount) {
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2000;display:flex;align-items:center;justify-content:center";
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  overlay.innerHTML = `
    <div style="background:var(--ink);border-radius:18px;width:460px;padding:40px 36px 32px;box-shadow:0 24px 64px rgba(0,0,0,0.5);text-align:center;position:relative;overflow:hidden">

      <!-- subtle radial glow behind the icon -->
      <div style="position:absolute;top:-40px;left:50%;transform:translateX(-50%);width:280px;height:280px;background:radial-gradient(circle, oklch(0.62 0.13 40 / 0.18) 0%, transparent 70%);pointer-events:none"></div>

      <!-- icon -->
      <div style="width:56px;height:56px;border-radius:50%;background:var(--terra-soft);border:2px solid var(--terra);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;position:relative">
        <i data-lucide="check" style="width:26px;height:26px;color:var(--terra)"></i>
      </div>

      <!-- wordmark -->
      <div style="font-family:var(--t-mono);font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:var(--terra);margin-bottom:8px">Mathematically proven</div>
      <div style="font-family:var(--t-display);font-size:42px;letter-spacing:-0.03em;color:var(--bg);line-height:1;margin-bottom:6px">Optimal</div>
      <div style="font-size:13px;color:oklch(0.68 0.008 60);margin-bottom:28px">Best possible arrangement for ${studentCount} students across ${numClasses} classes.</div>

      <!-- stat pills -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:28px">
        <div style="background:oklch(0.28 0.018 60);border-radius:10px;padding:14px 12px">
          <div style="font-family:var(--t-mono);font-size:22px;font-weight:600;color:var(--bg);letter-spacing:-0.02em">${elapsed}</div>
          <div style="font-size:11px;color:oklch(0.55 0.01 60);margin-top:3px;text-transform:uppercase;letter-spacing:0.08em">Solve time</div>
        </div>
        <div style="background:oklch(0.28 0.018 60);border-radius:10px;padding:14px 12px">
          <div style="font-family:var(--t-mono);font-size:14px;font-weight:600;color:var(--terra);letter-spacing:-0.01em;line-height:1.2;margin-bottom:2px">${combinations}</div>
          <div style="font-size:11px;color:oklch(0.55 0.01 60);margin-top:3px;text-transform:uppercase;letter-spacing:0.08em">Possible combinations</div>
        </div>
      </div>

      <button style="background:var(--terra);color:#fff;border:none;border-radius:8px;padding:10px 32px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--t-ui)" onclick="this.closest('[style*=fixed]').remove()">Got it</button>
    </div>
  `;

  document.body.appendChild(overlay);
  renderIcons();
  overlay.querySelector("button").focus();
}
window.showOptimalNotice = showOptimalNotice;

// ── Add grade modal ───────────────────────────────────────────────────────────

function openAddGradeModal() {
  const allGrades = [
    "Kindergarten",
    "1st Grade",
    "2nd Grade",
    "3rd Grade",
    "4th Grade",
    "5th Grade",
    "6th Grade",
    "7th Grade",
    "8th Grade",
  ];
  const maxGrade = config.max_grade || "8th Grade";
  const maxIdx = allGrades.indexOf(maxGrade);
  const cappedGrades = maxIdx >= 0 ? allGrades.slice(0, maxIdx + 1) : allGrades;

  const existingNames = new Set(grades.map((g) => g.name));
  const available = cappedGrades.filter((g) => !existingNames.has(g));

  if (available.length === 0) {
    showNotice("All grades up to " + maxGrade + " already exist.", "error");
    return;
  }

  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:1000;display:flex;align-items:center;justify-content:center";
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  overlay.innerHTML = `
    <div style="background:var(--panel);border-radius:12px;width:420px;max-height:90vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.18)">
      <div style="padding:20px 24px 16px;border-bottom:1px solid var(--line-soft);display:flex;align-items:center;justify-content:space-between">
        <div style="font-weight:600;font-size:15px">Add grade</div>
        <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--ink-3);padding:0 4px">×</button>
      </div>
      <div style="padding:20px 24px;display:flex;flex-direction:column;gap:16px">
        <div>
          <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:6px">Grade</label>
          <select id="add-grade-name" style="width:100%;padding:8px 10px;border:1px solid var(--line-soft);border-radius:6px;font-size:13px;background:var(--bg-2);color:var(--ink)">
            ${available.map((g) => `<option value="${g}">${g}</option>`).join("")}
          </select>
        </div>

        <div>
          <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:6px">Student roster (CSV)</label>
          <div id="add-grade-dropzone"
            style="border:2px dashed var(--line-soft);border-radius:8px;padding:24px;text-align:center;cursor:pointer;color:var(--ink-3);font-size:13px;transition:border-color 0.15s"
            onclick="document.getElementById('add-grade-file').click()"
            ondragover="event.preventDefault(); this.style.borderColor='var(--terra)'"
            ondragleave="this.style.borderColor='var(--line-soft)'"
            ondrop="event.preventDefault(); this.style.borderColor='var(--line-soft)'; handleAddGradeFile(event.dataTransfer.files[0])">
            Drop CSV or click to upload
          </div>
          <input id="add-grade-file" type="file" accept=".csv" style="display:none" onchange="handleAddGradeFile(this.files[0])">
          <div id="add-grade-preview" style="margin-top:10px;font-size:12px;color:var(--ink-3)"></div>
        </div>

        <div id="add-grade-error" style="font-size:12px;color:var(--rose);display:none"></div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid var(--line-soft);display:flex;justify-content:flex-end;gap:8px">
        <button class="btn ghost sm" onclick="this.closest('[style*=fixed]').remove()">Cancel</button>
        <button class="btn sm" style="background:var(--terra);color:#fff;border-color:var(--terra)" onclick="submitAddGrade()">Create grade</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  window._addGradeOverlay = overlay;
  window._addGradeStudents = [];
}

function handleAddGradeFile(file) {
  if (!file) return;
  const overlay = window._addGradeOverlay;
  const preview = overlay.querySelector("#add-grade-preview");
  const errorEl = overlay.querySelector("#add-grade-error");
  const gradeName = overlay.querySelector("#add-grade-name").value;

  file.text().then((text) => {
    // Use onboarding's CSV parser (already loaded globally)
    const lines = text
      .trim()
      .split("\n")
      .filter((l) => l.trim());
    if (lines.length < 2) {
      errorEl.textContent = "CSV is empty.";
      errorEl.style.display = "block";
      return;
    }

    const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
    const nameIdx = headers.findIndex(
      (h) => h.includes("name") || h === "student",
    );
    const gradeIdx = headers.findIndex((h) => h === "grade");
    const genderIdx = headers.findIndex(
      (h) => h.includes("gender") || h.includes("sex"),
    );
    const mathIdx = headers.findIndex((h) => h === "math");
    const readingIdx = headers.findIndex((h) => h === "reading");
    const behaviorIdx = headers.findIndex((h) => h.includes("behavior"));
    const independenceIdx = headers.findIndex((h) =>
      h.includes("independence"),
    );
    const iepIdx = headers.findIndex((h) => h === "iep");
    const plan504Idx = headers.findIndex((h) => h === "504");
    const eslIdx = headers.findIndex((h) => h === "esl");
    const gateIdx = headers.findIndex((h) => h === "gate");
    const friendsIdx = headers.findIndex((h) => h.includes("friend"));
    const incompIdx = headers.findIndex((h) => h.includes("incompatible"));

    if (nameIdx === -1) {
      errorEl.textContent = 'CSV must have a "name" column.';
      errorEl.style.display = "block";
      return;
    }
    errorEl.style.display = "none";

    const students = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i]);
      if (!cells[nameIdx]?.trim()) continue;

      // If CSV has a grade column, filter to the selected grade
      if (gradeIdx !== -1) {
        const rowGrade = normalizeGradeName(cells[gradeIdx] || "");
        if (rowGrade && rowGrade !== gradeName) continue;
      }

      students.push({
        name: cells[nameIdx].trim(),
        gender: genderIdx !== -1 ? normalizeGender(cells[genderIdx]) : "b",
        behavior:
          behaviorIdx !== -1
            ? normalizeBehavior(cells[behaviorIdx])
            : "neutral",
        independence:
          independenceIdx !== -1
            ? normalizeIndependence(cells[independenceIdx])
            : "neutral",
        iep: iepIdx !== -1 ? normalizeYesNo(cells[iepIdx]) === "y" : false,
        504:
          plan504Idx !== -1 ? normalizeYesNo(cells[plan504Idx]) === "y" : false,
        esl: eslIdx !== -1 ? normalizeYesNo(cells[eslIdx]) === "y" : false,
        gate: gateIdx !== -1 ? normalizeYesNo(cells[gateIdx]) === "y" : false,
        math: mathIdx !== -1 ? normalizeLevelHML(cells[mathIdx]) : "m",
        reading: readingIdx !== -1 ? normalizeLevelHML(cells[readingIdx]) : "m",
        friends: friendsIdx !== -1 ? (cells[friendsIdx] || "").trim() : "",
        incompatible: incompIdx !== -1 ? (cells[incompIdx] || "").trim() : "",
      });
    }

    window._addGradeStudents = students;
    overlay.querySelector("#add-grade-dropzone").style.borderColor =
      "var(--terra)";
    preview.textContent = `${students.length} student${students.length !== 1 ? "s" : ""} ready to import`;
    preview.style.color = "var(--terra)";
  });
}

async function submitAddGrade() {
  const overlay = window._addGradeOverlay;
  if (!overlay) return;

  const gradeName = overlay.querySelector("#add-grade-name").value;
  const students = window._addGradeStudents || [];
  const res = await fetch("/api/grades/add-grade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grade_name: gradeName, students }),
  });

  if (res.ok) {
    overlay.remove();
    window._addGradeOverlay = null;
    await loadGrades();
    const newGrade = grades.find((g) => g.name === gradeName);
    if (newGrade) selectGrade(newGrade.id);
  } else {
    overlay.querySelector("#add-grade-error").textContent =
      "Failed to create grade.";
    overlay.querySelector("#add-grade-error").style.display = "block";
  }
}

async function confirmDeleteGrade(gradeId, gradeName) {
  const ok = await showConfirm(
    `Delete ${gradeName}? This will remove all students and assignments for this grade.`,
    { confirmLabel: "Delete", destructive: true },
  );
  if (!ok) return;

  const res = await fetch(`/api/grades/${gradeId}`, { method: "DELETE" });
  if (res.ok) {
    if (currentGrade?.id === gradeId) {
      currentGrade = null;
      showScreen("welcome");
    }
    await loadGrades();
  } else {
    showNotice("Failed to delete grade.", "error");
  }
}

function openAddStudentModal() {
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:1000;display:flex;align-items:center;justify-content:center";
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  overlay.innerHTML = `
    <div style="background:var(--panel);border-radius:12px;width:400px;max-height:90vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.18)">
      <div style="padding:20px 24px 16px;border-bottom:1px solid var(--line-soft);display:flex;align-items:center;justify-content:space-between">
        <div style="font-weight:600;font-size:15px">Add student</div>
        <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--ink-3);padding:0 4px">×</button>
      </div>
      <div style="padding:20px 24px;display:flex;flex-direction:column;gap:16px">

        <div>
          <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:6px">Name</label>
          <input id="new-student-name" type="text" placeholder="Full name" autocomplete="off"
            style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--line-soft);border-radius:6px;font-size:13px;background:var(--bg-2);color:var(--ink);outline:none"
            onkeydown="if(event.key==='Enter') submitAddStudent()">
        </div>

        <div>
          <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:6px">Gender</label>
          <div class="segmented">
            <button class="seg active" data-field="gender" data-value="g">Girl</button>
            <button class="seg" data-field="gender" data-value="b">Boy</button>
          </div>
        </div>

        <div>
          <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:6px">Behavior</label>
          <div class="segmented">
            <button class="seg active" data-field="behavior" data-value="cooperative">Cooperative</button>
            <button class="seg" data-field="behavior" data-value="neutral">Neutral</button>
            <button class="seg" data-field="behavior" data-value="disruptive">Disruptive</button>
          </div>
        </div>

        <div>
          <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:6px">Independence</label>
          <div class="segmented">
            <button class="seg" data-field="independence" data-value="high">High</button>
            <button class="seg active" data-field="independence" data-value="neutral">Neutral</button>
            <button class="seg" data-field="independence" data-value="low">Low</button>
          </div>
        </div>

        <div>
          <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:6px">Math level</label>
          <div class="segmented">
            <button class="seg" data-field="math" data-value="h">High</button>
            <button class="seg active" data-field="math" data-value="m">Medium</button>
            <button class="seg" data-field="math" data-value="l">Low</button>
          </div>
        </div>

        <div>
          <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:6px">Reading level</label>
          <div class="segmented">
            <button class="seg" data-field="reading" data-value="h">High</button>
            <button class="seg active" data-field="reading" data-value="m">Medium</button>
            <button class="seg" data-field="reading" data-value="l">Low</button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px">
          ${[
            ["iep", "IEP"],
            ["504", "504"],
            ["esl", "ESL"],
            ["gate", "GATE"],
          ]
            .map(
              ([field, label]) => `
            <div>
              <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:6px">${label}</label>
              <div class="segmented" style="flex-direction:column">
                <button class="seg active" data-field="${field}" data-value="false">No</button>
                <button class="seg" data-field="${field}" data-value="true">Yes</button>
              </div>
            </div>
          `,
            )
            .join("")}
        </div>

        <div id="add-student-error" style="font-size:12px;color:var(--rose);display:none"></div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid var(--line-soft);display:flex;justify-content:flex-end;gap:8px">
        <button class="btn ghost sm" onclick="this.closest('[style*=fixed]').remove()">Cancel</button>
        <button class="btn sm" style="background:var(--terra);color:#fff;border-color:var(--terra)" onclick="submitAddStudent()">Add student</button>
      </div>
    </div>
  `;

  // Wire up segmented controls inside the modal
  overlay.querySelectorAll(".seg[data-field]").forEach((btn) => {
    btn.addEventListener("click", function () {
      const field = this.getAttribute("data-field");
      overlay
        .querySelectorAll(`.seg[data-field="${field}"]`)
        .forEach((b) => b.classList.remove("active"));
      this.classList.add("active");
    });
  });

  document.body.appendChild(overlay);
  overlay.querySelector("#new-student-name").focus();
  window._addStudentOverlay = overlay;
}

async function submitAddStudent() {
  const overlay = window._addStudentOverlay;
  if (!overlay || !currentGrade) return;

  const nameInput = overlay.querySelector("#new-student-name");
  const name = nameInput.value.trim();
  const errorEl = overlay.querySelector("#add-student-error");

  if (!name) {
    errorEl.textContent = "Please enter a name.";
    errorEl.style.display = "block";
    nameInput.focus();
    return;
  }

  if (
    window.currentStudents?.some(
      (s) => s.name.toLowerCase() === name.toLowerCase(),
    )
  ) {
    errorEl.textContent = "A student with that name already exists.";
    errorEl.style.display = "block";
    nameInput.focus();
    return;
  }

  // Collect selected values
  const fields = {};
  overlay.querySelectorAll(".seg.active[data-field]").forEach((btn) => {
    fields[btn.getAttribute("data-field")] = btn.getAttribute("data-value");
  });

  const newStudent = {
    name,
    gender: fields.gender || "g",
    behavior: fields.behavior || "cooperative",
    independence: fields.independence || "neutral",
    math: fields.math || "m",
    reading: fields.reading || "m",
    iep: fields.iep === "true",
    504: fields["504"] === "true",
    esl: fields.esl === "true",
    gate: fields.gate === "true",
    friends: "",
    incompatible: "",
  };

  window.currentStudents = [...(window.currentStudents || []), newStudent];

  try {
    const res = await fetch(`/api/grades/${currentGrade.id}/students`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ students: window.currentStudents }),
    });
    if (res.ok) {
      overlay.remove();
      window._addStudentOverlay = null;
      syncGradeStudentCount();
      showScreen("students");
      setTimeout(() => showStudentDetail(name), 100);
    } else {
      errorEl.textContent = "Failed to save. Please try again.";
      errorEl.style.display = "block";
    }
  } catch (err) {
    console.error("Failed to add student:", err);
    errorEl.textContent = "Failed to save. Please try again.";
    errorEl.style.display = "block";
  }
}

function confirmDeleteStudent(studentName) {
  const hasAssignment = window.currentAssignments?.some(
    (a) => a.name === studentName,
  );
  const warning = hasAssignment
    ? "This student has been assigned to a class. Removing them will affect the current assignment."
    : "This will permanently remove the student from the roster.";

  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:1000;display:flex;align-items:center;justify-content:center";
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  overlay.innerHTML = `
    <div style="background:var(--panel);border-radius:12px;width:340px;padding:24px;box-shadow:0 8px 32px rgba(0,0,0,0.18)">
      <div style="font-weight:600;font-size:15px;margin-bottom:8px">Remove ${studentName}?</div>
      <div style="font-size:13px;color:var(--ink-3);line-height:1.5;margin-bottom:20px">${warning}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn ghost sm" onclick="this.closest('[style*=fixed]').remove()">Cancel</button>
        <button class="btn sm" style="background:var(--rose);color:#fff;border-color:var(--rose)"
          onclick="this.closest('[style*=fixed]').remove(); deleteStudent('${studentName.replace(/'/g, "\\'")}')">
          Remove
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
}

async function deleteStudent(studentName) {
  if (!currentGrade) return;

  // Remove from students list
  window.currentStudents = (window.currentStudents || []).filter(
    (s) => s.name !== studentName,
  );

  // Remove this student's name from all other students' friends/incompatible lists
  window.currentStudents.forEach((s) => {
    if (s.friends) {
      s.friends = s.friends
        .split(",")
        .map((n) => n.trim())
        .filter((n) => n && n !== studentName)
        .join(",");
    }
    if (s.incompatible) {
      s.incompatible = s.incompatible
        .split(",")
        .map((n) => n.trim())
        .filter((n) => n && n !== studentName)
        .join(",");
    }
  });

  // Remove from assignments
  if (window.currentAssignments) {
    window.currentAssignments = window.currentAssignments.filter(
      (a) => a.name !== studentName,
    );
  }

  try {
    // Save updated students
    const studentsRes = await fetch(`/api/grades/${currentGrade.id}/students`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ students: window.currentStudents }),
    });
    if (!studentsRes.ok) throw new Error("Failed to save students");

    // Save updated assignments if they exist
    if (window.currentAssignments) {
      const assignRes = await fetch(`/api/grades/${currentGrade.id}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments: window.currentAssignments }),
      });
      if (!assignRes.ok) throw new Error("Failed to save assignments");
    }

    closeStudentDetail();
    syncGradeStudentCount();
    showScreen("students");
  } catch (err) {
    console.error("Failed to delete student:", err);
    showNotice("Failed to delete student. Please try again.", "error");
  }
}

async function _saveAndReopenDetail(studentName) {
  if (!currentGrade) return;
  try {
    const res = await fetch(`/api/grades/${currentGrade.id}/students`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ students: window.currentStudents }),
    });
    if (res.ok) {
      showScreen("students");
      setTimeout(() => showStudentDetail(studentName), 100);
    } else {
      showNotice("Failed to save changes. Please try again.", "error");
    }
  } catch (err) {
    console.error("Failed to save:", err);
    showNotice("Failed to save changes. Please try again.", "error");
  }
}

function filterStudents(value) {
  const searchTerm = value.toLowerCase().trim();
  const rows = document.querySelectorAll(".student-row[data-student-name]");

  rows.forEach((row) => {
    const name = row.querySelector(".sn")?.textContent.toLowerCase() || "";
    if (name.includes(searchTerm)) {
      row.style.display = "";
    } else {
      row.style.display = "none";
    }
  });
}

let currentSort = "name"; // Track current sort

function sortStudents(sortBy) {
  console.log("sortStudents called with:", sortBy);
  if (!window.currentStudents) {
    console.log("No currentStudents found");
    return;
  }

  currentSort = sortBy;
  const students = [...window.currentStudents];

  switch (sortBy) {
    case "name":
      students.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "gender":
      students.sort(
        (a, b) =>
          a.gender.localeCompare(b.gender) || a.name.localeCompare(b.name),
      );
      break;
    case "math":
      const mathOrder = { h: 0, m: 1, l: 2 };
      students.sort(
        (a, b) =>
          mathOrder[a.math] - mathOrder[b.math] || a.name.localeCompare(b.name),
      );
      break;
    case "flags":
      students.sort((a, b) => {
        const aFlags =
          (a.problematic === "y" ? 2 : 0) + (a.special_needs === "y" ? 1 : 0);
        const bFlags =
          (b.problematic === "y" ? 2 : 0) + (b.special_needs === "y" ? 1 : 0);
        return bFlags - aFlags || a.name.localeCompare(b.name);
      });
      break;
  }

  // Update the stored students
  window.currentStudents = students;

  // Reorder DOM elements
  const studentList = document.querySelector(".student-list");
  const rows = Array.from(
    studentList.querySelectorAll(".student-row[data-student-name]"),
  );

  // Sort rows based on the new order
  const sortedRows = students
    .map((student) => {
      return rows.find(
        (row) => row.getAttribute("data-student-name") === student.name,
      );
    })
    .filter((row) => row); // Filter out any nulls

  // Append in new order (this moves them in the DOM)
  sortedRows.forEach((row) => {
    studentList.appendChild(row);
  });

  // Update button active states
  document.querySelectorAll(".sort-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  const activeBtn = document.querySelector(`.sort-btn[data-sort="${sortBy}"]`);
  if (activeBtn) {
    activeBtn.classList.add("active");
  }
}

function exportCSV() {
  // Export student roster
  if (!window.currentStudents) return;

  const csv = convertToCSV(window.currentStudents);
  downloadCSV(csv, `${currentGrade.name}_roster.csv`);
}

function exportAssignmentCSV() {
  if (!window.currentAssignments || window.currentAssignments.length === 0) {
    showNotice("No assignment to export. Run the assignment first.", "error");
    return;
  }

  const levelLabel = { h: "High", m: "Medium", l: "Low" };
  const genderLabel = { b: "Boy", g: "Girl" };

  const rows = window.currentAssignments
    .slice()
    .sort((a, b) => (a.assigned_class || 0) - (b.assigned_class || 0))
    .map((s) => ({
      Class: s.assigned_class || "Unassigned",
      Name: s.name || "",
      Gender: genderLabel[s.gender] || s.gender || "",
      Math: levelLabel[s.math] || s.math || "",
      Reading: levelLabel[s.reading] || s.reading || "",
      Behavior: s.behavior || "",
      Independence: s.independence || "",
      IEP: s.iep ? "Yes" : "No",
      "504 Plan": s["504"] ? "Yes" : "No",
      ESL: s.esl ? "Yes" : "No",
      GATE: s.gate ? "Yes" : "No",
    }));

  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => `"${String(row[h]).replace(/"/g, '""')}"`)
        .join(","),
    ),
  ];

  const gradeName = currentGrade?.name || "grade";
  downloadCSV(csvLines.join("\n"), `${gradeName}_assignment.csv`);
}

function convertToCSV(data) {
  if (data.length === 0) return "";

  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers
      .map((header) => {
        const value = row[header] || "";
        return `"${String(value).replace(/"/g, '""')}"`;
      })
      .join(","),
  );

  return [headers.join(","), ...rows].join("\n");
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
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
window.updateMaxGrade = updateMaxGrade;
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
window.handleGradeCSVFile = handleGradeCSVFile;
window.openAddGradeModal = openAddGradeModal;
window.handleAddGradeFile = handleAddGradeFile;
window.submitAddGrade = submitAddGrade;
window.confirmDeleteGrade = confirmDeleteGrade;
window.openAddStudentModal = openAddStudentModal;
window.submitAddStudent = submitAddStudent;
window.confirmDeleteStudent = confirmDeleteStudent;
window.deleteStudent = deleteStudent;
window.openRelationModal = openRelationModal;
window.filterRelationList = filterRelationList;
window.addRelation = addRelation;
window.removeRelation = removeRelation;

// Drag and drop handlers
let draggedStudent = null;

function handleDragStart(event) {
  draggedStudent = {
    name: event.target.dataset.studentName,
    currentClass: parseInt(event.target.dataset.currentClass),
  };
  event.target.style.opacity = "0.4";
  event.dataTransfer.effectAllowed = "move";
}

function handleDragEnd(event) {
  event.target.style.opacity = "1";
}

function handleDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";

  // Find the closest class-drop-zone
  let dropZone = event.target.closest(".class-drop-zone");
  if (dropZone) {
    dropZone.style.background = "var(--terra-soft)";
    dropZone.style.borderColor = "var(--terra)";
  }
}

function handleDragLeave(event) {
  let dropZone = event.target.closest(".class-drop-zone");
  if (dropZone && !dropZone.contains(event.relatedTarget)) {
    dropZone.style.background = "";
    dropZone.style.borderColor = "";
  }
}

async function handleDrop(event) {
  event.preventDefault();
  event.stopPropagation();

  // Only allow drops in edit mode, unless the drag involves the unassigned pool
  const isUnassignedDrag = draggedStudent?.currentClass === 0;
  if (!window.editMode && !isUnassignedDrag) {
    return;
  }

  let dropZone = event.target.closest(".class-drop-zone");
  if (!dropZone) return;

  // Reset styles
  dropZone.style.background = "";
  dropZone.style.borderColor = "";

  const targetClass = parseInt(dropZone.dataset.classNumber);

  if (!draggedStudent || targetClass === draggedStudent.currentClass) {
    return;
  }

  let involvedUnassigned = false;
  if (targetClass === 0) {
    // Dragging back to unassigned — remove from assignments
    window.currentAssignments = (window.currentAssignments || []).filter(
      (s) => s.name !== draggedStudent.name,
    );
    involvedUnassigned = true;
  } else if (draggedStudent.currentClass === 0) {
    // Dragging from unassigned into a class — add to assignments
    const rosterStudent = (window.currentStudents || []).find(
      (s) => s.name === draggedStudent.name,
    );
    if (rosterStudent) {
      window.currentAssignments = [
        ...(window.currentAssignments || []),
        { ...rosterStudent, assigned_class: targetClass },
      ];
      involvedUnassigned = true;
    }
  }

  // Update assignment in memory for class-to-class moves
  if (draggedStudent.currentClass !== 0 && targetClass !== 0) {
    const student = window.currentAssignments.find(
      (s) => s.name === draggedStudent.name,
    );
    if (student) {
      console.log(
        `Moving ${student.name} from class ${student.assigned_class} to class ${targetClass}`,
      );
      student.assigned_class = targetClass;
      window.hasUnsavedChanges = true;
    }
  }

  // Auto-save all drag/drop changes immediately
  try {
    const res = await fetch(`/api/grades/${currentGrade.id}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments: window.currentAssignments }),
    });
    if (res.ok) {
      window.hasUnsavedChanges = false;
    }
  } catch (err) {
    console.error("Failed to save assignment change:", err);
    showNotice("Move saved in memory but failed to persist. Try saving manually.", "error");
  }

  // Refresh the results screen to show updated assignments and stats
  const currentEditMode = window.editMode;
  const currentHasUnsaved = window.hasUnsavedChanges;
  await showScreen("results");
  window.editMode = currentEditMode;
  window.hasUnsavedChanges = currentHasUnsaved;

  // Restore UI state
  const checkbox = document.getElementById("editModeToggle");
  if (checkbox) checkbox.checked = currentEditMode;

  const actionsDiv = document.getElementById("editModeActions");
  if (actionsDiv) actionsDiv.style.display = currentEditMode ? "flex" : "none";

  const saveBtn = actionsDiv?.querySelector("button.primary");
  const revertBtn = actionsDiv?.querySelector("button.ghost");
  if (saveBtn) saveBtn.disabled = !currentHasUnsaved;
  if (revertBtn) revertBtn.disabled = !currentHasUnsaved;

  draggedStudent = null;
}

window.handleDragStart = handleDragStart;
window.handleDragEnd = handleDragEnd;
window.handleDragOver = handleDragOver;
window.handleDragLeave = handleDragLeave;
window.handleDrop = handleDrop;

// Balance explanation modal
function showBalanceExplanationModal() {
  document.getElementById("balanceExplanationModal").classList.add("open");
}

function closeBalanceExplanationModal() {
  document.getElementById("balanceExplanationModal").classList.remove("open");
}

window.showBalanceExplanationModal = showBalanceExplanationModal;
window.closeBalanceExplanationModal = closeBalanceExplanationModal;

// Edit mode functions
async function toggleEditMode(enabled) {
  window.editMode = enabled;

  // Re-render to update draggable state
  await showScreen("results");

  // Restore checkbox and button state after render
  const checkbox = document.getElementById("editModeToggle");
  if (checkbox) {
    checkbox.checked = enabled;
  }

  const actionsDiv = document.getElementById("editModeActions");
  if (actionsDiv) {
    actionsDiv.style.display = enabled ? "flex" : "none";
  }
}

async function saveManualChanges() {
  try {
    const response = await fetch(`/api/grades/${currentGrade.id}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments: window.currentAssignments }),
    });

    if (response.ok) {
      window.hasUnsavedChanges = false;
      showScreen("results");
      showNotice("Changes saved successfully!");
    } else {
      showNotice("Failed to save changes", "error");
    }
  } catch (error) {
    console.error("Error saving changes:", error);
    showNotice("Failed to save changes", "error");
  }
}

async function revertToSolver() {
  const ok = await showConfirm(
    "Revert to last saved assignment? Any unsaved changes will be lost.",
  );
  if (!ok) return;

  try {
    const response = await fetch(
      `/api/grades/${currentGrade.id}/assignments/revert`,
      {
        method: "POST",
      },
    );

    if (response.ok) {
      window.hasUnsavedChanges = false;
      window.editMode = false;
      showScreen("results");
      showNotice("Reverted to last saved assignment");
    } else {
      showNotice("Failed to revert", "error");
    }
  } catch (error) {
    console.error("Error reverting:", error);
    showNotice("Failed to revert", "error");
  }
}

window.toggleEditMode = toggleEditMode;
window.saveManualChanges = saveManualChanges;
window.revertToSolver = revertToSolver;

// Re-run Lucide icon replacement after every dynamic render
function renderIcons() {
  if (window.lucide) window.lucide.createIcons();
}
window.renderIcons = renderIcons;
