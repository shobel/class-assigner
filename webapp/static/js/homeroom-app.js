// Homeroom App - Main Controller

let currentGrade = null;
let currentScreen = "welcome";
let currentStudentTab = "roster"; // roster, friendships, incompatibilities

// Assignment filter / display state (persists across card re-renders)
window.assignmentSearch = "";
window.assignmentFilterFlags = new Set();
window.cleanView = false;
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

// Keep a backup of the global config
let globalConfig = null;

// Load config from server
async function loadConfig() {
  const res = await fetch("/api/config");
  config = await res.json();
  globalConfig = JSON.parse(JSON.stringify(config)); // Deep copy

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

// Load and merge grade-specific custom properties into config
async function loadGradeCustomProperties(gradeId) {
  if (!globalConfig) {
    globalConfig = JSON.parse(JSON.stringify(config));
  }

  // Reset to global config first
  config = JSON.parse(JSON.stringify(globalConfig));

  // Fetch grade data to get custom properties
  const res = await fetch(`/api/grades/${gradeId}/students`);
  const data = await res.json();

  if (data.custom_rules?.properties) {
    // Merge custom properties into config
    const customProps = data.custom_rules.properties.filter(p => p.custom);

    if (customProps.length > 0) {
      // Add custom properties to config.properties
      if (!config.properties) config.properties = [];

      // Add custom properties that don't already exist
      customProps.forEach(customProp => {
        const exists = config.properties.find(p => p.name === customProp.name);
        if (!exists) {
          config.properties.push(customProp);
        }
      });
    }
  }
}

// Switch school year
async function switchSchoolYear(year) {
  await fetch(`/api/school-years/${year}`, { method: "POST" });
  await loadConfig();
  await loadGrades();
  if (grades.length === 0) showScreen('welcome');
  else showScreen(currentScreen);
}

// Mark a year as "current" (visual only)
async function setCurrentYear(year) {
  await fetch(`/api/school-years/${encodeURIComponent(year)}/set-current`, {
    method: "POST",
  });
  await loadConfig();
}
window.setCurrentYear = setCurrentYear;

// Create next school year (admin only)
async function createNextYear() {
  if (!window.classifyIsAdmin) return;
  showTransitionWizard();
}

// Clear school year data
async function clearSchoolYear(year) {
  const ok = await showConfirm(
    `Clear all data for ${year}?<br><br>This will delete all students, grades, and placements for this school year. This cannot be undone.`,
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
// ── Activation ───────────────────────────────────────────────────────────────

// Replace with your Supabase project URL and anon key
const SUPABASE_URL = "https://vvswzymqizfninwuoumw.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2c3d6eW1xaXpmbmlud3VvdW13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzODg5MTcsImV4cCI6MjA5Mzk2NDkxN30.JuXEoKfKw5VNQHSMweVryNgj0qo19DscnZhK6bLy-Ps";

async function checkActivation() {
  const res = await fetch("/api/activation-status");
  const data = await res.json();
  return data.activated;
}

async function submitActivationCode() {
  const input = document.getElementById("activation-input");
  const errorEl = document.getElementById("activation-error");
  const btn = document.getElementById("activation-btn");
  const code = input.value.trim().toUpperCase();

  if (!code) {
    errorEl.textContent = "Please enter your activation code.";
    errorEl.style.display = "block";
    return;
  }

  btn.textContent = "Checking…";
  btn.disabled = true;
  errorEl.style.display = "none";

  try {
    const res = await fetch("/api/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();

    if (res.ok) {
      showRestoreOption();
    } else {
      errorEl.textContent = data.error || "Invalid or already used code.";
      errorEl.style.display = "block";
      btn.textContent = "Activate";
      btn.disabled = false;
    }
  } catch (err) {
    errorEl.textContent =
      "Could not reach activation server. Check your internet connection.";
    errorEl.style.display = "block";
    btn.textContent = "Activate";
    btn.disabled = false;
  }
}

function showRestoreOption() {
  document.getElementById("activation-box").innerHTML = `
    <div style="font-family:'Instrument Serif',serif;font-size:32px;font-style:italic;margin-bottom:6px">
      <span style="color:var(--terra)">Class</span>ify
    </div>
    <div style="font-size:14px;font-weight:500;color:var(--ink);margin-bottom:6px">Activated!</div>
    <div style="font-size:13px;color:var(--ink-3);margin-bottom:24px">
      Are you transferring from another computer?
    </div>
    <label class="btn" style="display:block;width:100%;box-sizing:border-box;text-align:center;cursor:pointer;margin-bottom:10px;background:var(--terra);color:#fff;border-color:var(--terra)">
      Restore from backup
      <input type="file" accept=".classify" style="display:none" onchange="handleActivationImport(this)">
    </label>
    <button class="btn ghost" style="width:100%" onclick="document.getElementById('activation-overlay').classList.add('hidden');startApp()">
      Start fresh
    </button>
    <div id="restore-status" style="display:none;margin-top:12px;font-size:12px;text-align:center"></div>
  `;
}

async function handleActivationImport(input) {
  const file = input.files[0];
  if (!file) return;
  const statusEl = document.getElementById("restore-status");
  statusEl.textContent = "Restoring…";
  statusEl.style.color = "var(--ink-3)";
  statusEl.style.display = "block";

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch("/api/import-data", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (res.ok) {
      statusEl.textContent = "Restored! Starting app…";
      statusEl.style.color = "var(--sage)";
      setTimeout(() => {
        document.getElementById("activation-overlay").classList.add("hidden");
        startApp();
      }, 1000);
    } else {
      statusEl.textContent =
        data.error || "Restore failed. Try again or start fresh.";
      statusEl.style.color = "var(--rose)";
    }
  } catch (err) {
    statusEl.textContent = "Restore failed. Check the file and try again.";
    statusEl.style.color = "var(--rose)";
  }
}

async function startApp() {
  const needsOnboarding = await checkOnboarding();
  await loadConfig();
  await loadGrades();
  showScreen("welcome");
  // Show bookmark reminder once
  if (!localStorage.getItem('classify_bookmarked')) {
    const banner = document.getElementById('bookmark-banner');
    const urlEl = document.getElementById('bookmark-url');
    if (banner && urlEl) {
      urlEl.textContent = window.location.host;
      banner.style.display = '';
    }
  }

  // Check for updates on load and every 30 minutes (host machine admins only)
  if (window.classifyIsAdmin) {
    checkForUpdate();
    setInterval(checkForUpdate, 30 * 60 * 1000);
  }
}

async function checkForUpdate() {
  try {
    const res = await fetch('/api/check-update');
    const data = await res.json();
    if (data.update_available && data.is_local) {
      const banner = document.getElementById('update-banner');
      const msg = document.getElementById('update-msg');
      const link = document.getElementById('update-link');
      msg.textContent = `Classify ${data.latest} is available (you have ${data.current}).${data.notes ? ' ' + data.notes : ''}`;
      link.href = data.download_url || '#';
      if (!data.download_url) link.style.display = 'none';
      banner.style.display = '';
    }
  } catch (e) {
    // Silent fail — update check is best-effort
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const activated = await checkActivation();
  if (!activated) {
    // Show activation overlay, app stays hidden until code is entered
    document.getElementById("activation-overlay").classList.remove("hidden");
    document.getElementById("activation-input").focus();
  } else {
    document.getElementById("activation-overlay").classList.add("hidden");
    await startApp();
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
      ${window.classifyIsAdmin ? `<button class="grade-delete-btn" title="Delete grade"
        onclick="event.stopPropagation(); confirmDeleteGrade('${g.id}', '${g.name.replace(/'/g, "\\'")}')">×</button>` : ''}
    </div>
  `;
    })
    .join("");
}

// Select grade
async function selectGrade(gradeId) {
  const grade = grades.find((g) => g.id === gradeId);
  if (!grade) return;

  // Check lock status BEFORE switching
  if (typeof tryAcquireLock === "function") {
    const lockResponse = await fetch(
      `/api/lock/status?session=${sessionId}&grade_id=${gradeId}`,
    );
    const lockStatus = await lockResponse.json();

    // If locked by someone else, show modal and wait for decision
    if (lockStatus.locked && !lockStatus.is_holder) {
      const decision = await showReadOnlyModal(grade.name, lockStatus.held_by);
      if (decision === "cancel") {
        // User canceled - don't switch grades at all
        return;
      }
      // User chose to view read-only - continue with switch
    }
  }

  // Proceed with grade switch
  currentGrade = grade;

  // Load grade's custom properties and merge with global config
  await loadGradeCustomProperties(gradeId);

  // Clear grade-specific globals so stale data from previous grade never bleeds through
  window.currentAssignments = null;
  window.currentStudents = null;
  window.solverBaseline = null;
  window.classNames = {};
  window.hasUnsavedChanges = false;
  window.editMode = false;
  window.assignmentSearch = "";
  window.assignmentFilterFlags = new Set();
  window.cleanView = false;
  document.body.classList.remove("clean-view");
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

// Teacher bar (shown between grade title and tabs on all grade screens)
function renderTeacherBar(teachers) {
  const list = (teachers || []).filter((t) => t && t.trim());
  return `
    <div id="teacherBar" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
      ${list
        .map((t) => {
          const initials = t
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
          return `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px 4px 6px;background:var(--bg-2);border:1px solid var(--line);border-radius:20px;font-size:12px;font-weight:500;">
          <span class="avatar t" style="width:20px;height:20px;font-size:8px;flex-shrink:0;">${initials}</span>
          ${t}
          <button data-mutates="true" onclick="removeGradeTeacher('${t.replace(/'/g, "\\'")}')" style="background:none;border:none;cursor:pointer;color:var(--ink-4);padding:0;font-size:13px;line-height:1;margin-left:2px;" title="Remove">×</button>
        </span>`;
        })
        .join("")}
      <button class="btn ghost sm" id="addTeacherBtn" onclick="startAddGradeTeacher(this)" data-mutates="true">+ Add teacher</button>
    </div>
  `;
}

function startAddGradeTeacher(btn) {
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Teacher name";
  input.style.cssText =
    "height:28px;padding:0 10px;border:1px solid var(--terra);border-radius:20px;font:inherit;font-size:12px;outline:none;background:var(--panel);color:var(--ink);width:160px;";
  btn.replaceWith(input);
  input.focus();

  const finish = async () => {
    const name = input.value.trim();
    if (name) await addGradeTeacher(name);
    else
      showScreen(
        document.querySelector(".grade-tab.on") ? "students" : "results",
      );
  };
  input.addEventListener("blur", finish);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") {
      input.value = "";
      input.blur();
    }
  });
}

async function addGradeTeacher(name) {
  if (!currentGrade) return;
  const updated = [...(window.currentAvailableTeachers || []), name];
  window.currentAvailableTeachers = updated;
  await fetch(`/api/grades/${currentGrade.id}/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ available_teachers: updated }),
  });
  const bar = document.getElementById("teacherBar");
  if (bar) bar.outerHTML = renderTeacherBar(updated);
}

async function removeGradeTeacher(name) {
  if (!currentGrade) return;
  const assignedToClass = (window.currentTeachers || []).includes(name);
  if (assignedToClass) {
    showNotice(`${name} is placed in a class — remove their placement first`, "error");
    return;
  }
  const updated = (window.currentAvailableTeachers || []).filter(
    (t) => t !== name,
  );
  window.currentAvailableTeachers = updated;
  await fetch(`/api/grades/${currentGrade.id}/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ available_teachers: updated }),
  });
  const bar = document.getElementById("teacherBar");
  if (bar) bar.outerHTML = renderTeacherBar(updated);
}

window.startAddGradeTeacher = startAddGradeTeacher;
window.addGradeTeacher = addGradeTeacher;
window.removeGradeTeacher = removeGradeTeacher;

// Obsolete modal functions removed - grade settings now a full screen view

function checkClassSizeFeasibility() {
  const enforced = document.getElementById("enforceClassSize")?.checked;
  const min = parseInt(document.getElementById("minStudents")?.value) || 0;
  const max = parseInt(document.getElementById("maxStudents")?.value) || 0;
  const classes = parseInt(document.getElementById("numClasses")?.value) || 0;
  const students = window.currentGradeSettings?.num_students || 0;
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
      if (currentScreen === "results" || currentScreen === "students") {
        await showScreen(currentScreen);
      }
    } else {
      showNotice("Failed to save settings", "error");
    }
  } catch (err) {
    console.error("Error saving settings:", err);
    showNotice("Error saving settings", "error");
  }
}

async function autoSaveGradeSettings() {
  if (!window.currentGradeSettings) return;

  const numClasses = parseInt(document.getElementById("numClasses").value);
  const minStudents = parseInt(document.getElementById("minStudents").value);
  const maxStudents = parseInt(document.getElementById("maxStudents").value);
  const enforceClassSize = document.getElementById("enforceClassSize").checked;

  if (minStudents > maxStudents) {
    // Don't save invalid state, but don't show error on every keystroke
    return;
  }

  // Save to server silently in background
  try {
    const res = await fetch(
      `/api/grades/${window.currentGradeSettings.gradeId}/settings`,
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
      await loadGrades(); // Update sidebar counts
    }
  } catch (err) {
    console.error("Error auto-saving settings:", err);
  }
}
window.autoSaveGradeSettings = autoSaveGradeSettings;

// Grade-specific weight/property handlers
async function toggleGradeProperty(propertyName, enabled) {
  if (!window.currentGradeSettings) return;

  // Get or create custom rules
  if (!window.currentGradeSettings.custom_rules) {
    window.currentGradeSettings.custom_rules = {
      properties: JSON.parse(JSON.stringify(config.properties)),
    };
  }

  const prop = window.currentGradeSettings.custom_rules.properties.find(
    (p) => p.name === propertyName,
  );
  if (prop) {
    prop.enabled = enabled;
  }

  // Save to server - don't re-render, just save in background
  fetch(`/api/grades/${window.currentGradeSettings.gradeId}/custom-rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      custom_rules: window.currentGradeSettings.custom_rules,
    }),
  });
}
window.toggleGradeProperty = toggleGradeProperty;

async function updateGradeWeight(propertyName, value) {
  if (!window.currentGradeSettings) return;

  const weight = parseInt(value) * 20;

  // Get or create custom rules
  if (!window.currentGradeSettings.custom_rules) {
    console.log("Creating custom rules from global config");
    window.currentGradeSettings.custom_rules = {
      properties: JSON.parse(JSON.stringify(config.properties)),
    };
  }

  const prop = window.currentGradeSettings.custom_rules.properties.find(
    (p) => p.name === propertyName,
  );
  if (prop) {
    prop.weight = weight;
    console.log(`Updated ${propertyName} weight to ${weight}`);
  } else {
    console.error(`Property ${propertyName} not found in custom rules`);
  }

  // Save to server - don't re-render, just save in background
  console.log("Saving custom rules:", window.currentGradeSettings.custom_rules);
  const res = await fetch(
    `/api/grades/${window.currentGradeSettings.gradeId}/custom-rules`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        custom_rules: window.currentGradeSettings.custom_rules,
      }),
    },
  );

  console.log("Save response:", res.ok ? "success" : "failed", res.status);
}
window.updateGradeWeight = updateGradeWeight;

async function resetToGlobalRulesInline() {
  if (!window.currentGradeSettings) return;

  const confirmed = await showConfirm(
    "Reset to global rules? This will discard all custom rules for this grade and revert to the default rules & weights.",
    { confirmLabel: "Reset to Global", destructive: true },
  );

  if (!confirmed) return;

  try {
    const res = await fetch(
      `/api/grades/${window.currentGradeSettings.gradeId}/custom-rules`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      },
    );

    if (res.ok) {
      window.currentGradeSettings.custom_rules = null;
      showNotice("Reset to global rules");
      showScreen("grade-settings"); // Re-render
    } else {
      showNotice("Failed to reset rules", "error");
    }
  } catch (e) {
    showNotice("Failed to reset rules", "error");
  }
}
window.resetToGlobalRulesInline = resetToGlobalRulesInline;

// Custom property management
// Show screen
async function showScreen(screen) {
  // Guard: navigating away from the grade screen with unsaved changes
  const onGradeScreen =
    currentScreen === "results" || currentScreen === "students";
  const leavingGradeScreen = screen !== "results" && screen !== "students";
  if (onGradeScreen && leavingGradeScreen && window.hasUnsavedChanges) {
    const action = await showSavePrompt(
      "Save your manual changes before leaving?",
    );
    if (action === "cancel") return;
    if (action === "save") {
      try {
        const res = await fetch(`/api/grades/${currentGrade.id}/assignments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assignments: window.currentAssignments,
            update_baseline: true,
          }),
        });
        if (res.ok) {
          window.hasUnsavedChanges = false;
          window.editMode = false;
          showNotice("Changes saved!");
        } else {
          showNotice("Failed to save changes", "error");
          return;
        }
      } catch (e) {
        showNotice("Failed to save changes", "error");
        return;
      }
    }
    if (action === "discard") {
      window.hasUnsavedChanges = false;
      window.editMode = false;
    }
  }

  currentScreen = screen;

  // Grade screens: students, results, grade-settings
  const isGradeScreen = ["students", "results", "grade-settings"].includes(
    screen,
  );

  // Per-grade lock: Try to acquire lock when opening a grade
  if (isGradeScreen && currentGrade && typeof tryAcquireLock === "function") {
    const newGradeId = currentGrade.id;

    // Release previous grade lock if switching grades
    if (
      window.currentGradeId &&
      window.currentGradeId !== newGradeId &&
      typeof releaseLock === "function"
    ) {
      await releaseLock(window.currentGradeId);
    }

    window.currentGradeId = newGradeId;

    // Only try to acquire lock on students screen (entry point)
    if (screen === "students") {
      const acquired = await tryAcquireLock(newGradeId);
      // Lock acquisition result is handled - modal was already shown in selectGrade if needed
    }
    // For results and grade-settings, lock is already held from students screen
  } else {
    // Not on a grade screen - release current lock and clear selection
    if (window.currentGradeId && typeof releaseLock === "function") {
      const gradeToRelease = window.currentGradeId;
      window.currentGradeId = null; // clear first so updateLockUI hides the indicator
      await releaseLock(gradeToRelease);
    }
    // Clear currentGrade so no grade appears selected
    if (!isGradeScreen) {
      currentGrade = null;
      renderGradeNav();
    }
  }

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
  if (screen === "history")
    document.getElementById("nav-history")?.classList.add("active");
  if (screen === "users")
    document.getElementById("nav-users")?.classList.add("active");

  // Update breadcrumbs
  const crumbGrade = document.getElementById("crumb-grade");
  crumbGrade.textContent = currentGrade?.name || "...";

  // Make grade breadcrumb clickable when we have a current grade
  if (currentGrade) {
    crumbGrade.style.cursor = "pointer";
    crumbGrade.onclick = () => showScreen("students");
  } else {
    crumbGrade.style.cursor = "default";
    crumbGrade.onclick = null;
  }

  const screenNames = {
    welcome: "Welcome",
    config: "Configuration",
    "school-config": "School config",
    "history": "History",
    "users": "Users",
    import: "Import students",
    students: "Roster",
    results: "Class placements",
    "grade-settings": "Settings",
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
    setTimeout(populateServerUrl, 0);
  } else if (screen === "students" || screen === "results") {
    content = await renderStudentsScreen();
  } else if (screen === "grade-settings") {
    content = await renderGradeSettingsScreen();
  } else if (screen === "history") {
    content = await renderHistoryScreen();
  } else if (screen === "users") {
    content = await renderUsersScreen();
  }

  // Update content but preserve detail panel
  main.innerHTML = content;
  if (detailPanel) {
    main.appendChild(detailPanel);
  }
  renderIcons();

  // Attach drag listeners after DOM is updated
  if (screen === "students" || screen === "results") {
    requestAnimationFrame(() => {
      attachDragListeners();
    });
  }

  // Re-apply any active search/filter after re-renders
  if (
    window.assignmentSearch ||
    (window.assignmentFilterFlags && window.assignmentFilterFlags.size > 0)
  ) {
    requestAnimationFrame(applyAssignmentFilters);
  }
}

// Welcome Screen
function renderWelcomeScreen() {
  const totalStudents = grades.reduce((sum, g) => sum + g.students, 0);
  const totalGrades = grades.length;

  if (totalGrades === 0) {
    if (!window.classifyIsAdmin) {
      return `
        <div class="welcome">
          <h1>Nothing here yet.</h1>
          <p class="lede" style="max-width:480px;">
            Your admin hasn't set up this school year yet. Check back soon — once grades are imported you'll see them here.
          </p>
        </div>`;
    }
    return `
      <div class="welcome">
        <h1>Ready to import students?</h1>
        <p class="lede" style="max-width:480px;">
          No grades have been set up yet. Import your student roster to get started — we'll walk you through mapping your columns and values.
        </p>
        <button class="btn terra" style="margin-top:8px;" onclick="showImportModal('schoolYear')">Import student roster</button>
      </div>`;
  }

  return `
    <div class="welcome">
      <div class="muted" style="font-family:var(--t-mono); font-size:11px; letter-spacing:0.07em; text-transform:uppercase; margin-bottom:18px">
        Class Assignment Optimizer · ${totalGrades} grade${totalGrades !== 1 ? "s" : ""} · ${totalStudents} students
      </div>
      <h1>Three steps to <em>balanced</em> classes.</h1>
      <p class="lede">
        Manual class placement means balancing gender, behavior, special needs, education plans, math and reading levels — plus
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
const HISTORY_ACTION_LABELS = {
  run_optimizer:              { label: 'Ran optimizer',                     icon: '▶' },
  save_manual:                { label: 'Saved manual edits',                icon: '✎' },
  update_rules:               { label: 'Updated grade rules',               icon: '⚖' },
  reset_rules:                { label: 'Reset rules to global',             icon: '↺' },
  update_settings:            { label: 'Updated grade settings',            icon: '⚙' },
  rename_classes:             { label: 'Renamed classes',                   icon: '✎' },
  add_student:                { label: 'Added student',                     icon: '+' },
  remove_student:             { label: 'Removed student',                   icon: '−' },
  edit_student:               { label: 'Edited student',                    icon: '✎' },
  add_teacher:                { label: 'Added teacher',                     icon: '+' },
  remove_teacher:             { label: 'Removed teacher',                   icon: '−' },
  update_teacher_assignments: { label: 'Updated class–teacher assignments', icon: '✎' },
};

const HISTORY_CATEGORY_COLOR = {
  assignment: 'var(--terra)',
  students:   'var(--sage)',
  teachers:   'var(--amber)',
};

function historyRelativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  const hr  = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);
  if (min < 1)  return 'just now';
  if (min < 60) return `${min}m ago`;
  if (hr  < 24) return `${hr}h ago`;
  if (day < 7)  return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

const SETTINGS_KEY_LABELS = {
  num_classes: 'Classes',
  min_students: 'Min students',
  max_students: 'Max students',
  enforce_class_size: 'Enforce size',
};

function historyDetailText(e) {
  const d = e.details || {};
  if (e.action === 'run_optimizer') {
    const s = d.solver_status === 'OPTIMAL' ? ' · Optimal' : '';
    return `${d.num_classes} classes · ${d.student_count} students${s}`;
  }
  if (e.action === 'update_rules' && d.changes && d.changes.length) return d.changes.join(', ');
  if (e.action === 'update_settings') {
    return Object.entries(d).map(([k, v]) => {
      const label = SETTINGS_KEY_LABELS[k] || k.replace(/_/g, ' ');
      return `${label} → ${v}`;
    }).join(', ');
  }
  if (e.action === 'rename_classes' && d.class_names) {
    const parts = Object.entries(d.class_names).map(([k, v]) => `Class ${k} → "${v}"`);
    return parts.join(', ');
  }
  if (e.action === 'edit_student') {
    const students = d.students || [];
    if (!students.length) return '';
    const first = students[0];
    if (typeof first !== 'object') return first; // legacy format
    const name = first.name;
    let fieldStr = '';
    if (first.changes && first.changes.length) {
      const fmt = v => v === true ? 'Yes' : v === false ? 'No' : (v == null ? 'none' : String(v));
      const FIELD_LABELS = { iep: 'IEP', ell: 'ELL', gifted: 'Gifted', gender: 'Gender', class: 'Class' };
      fieldStr = ' (' + first.changes.map(c => {
        const label = FIELD_LABELS[c.field] || c.field;
        return `${label}: ${fmt(c.from)} → ${fmt(c.to)}`;
      }).join(', ') + ')';
    } else if (first.fields && first.fields.length) {
      // legacy {name, fields} format
      fieldStr = ` (${first.fields.join(', ')})`;
    }
    const more = students.length > 1 ? ` +${students.length - 1} more` : '';
    return `${name}${fieldStr}${more}`;
  }
  if (['add_student','remove_student','add_teacher','remove_teacher'].includes(e.action)) {
    const names = d.students || d.teachers || [];
    if (!names.length) return '';
    return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1} more`;
  }
  return '';
}

function historyGetStartDate(range) {
  const now = new Date();
  if (range === 'week')    { const d = new Date(now); d.setDate(d.getDate() - 7); return d; }
  if (range === 'month')   return new Date(now.getFullYear(), now.getMonth(), 1);
  if (range === 'quarter') { const d = new Date(now); d.setMonth(d.getMonth() - 3); return d; }
  if (range === 'year')    return new Date(now.getFullYear(), 0, 1);
  return null;
}

function renderHistoryEntries() {
  const entries = window.historyAllEntries || [];
  const tab = window.historyTab || 'assignment';
  const range = window.historyRange || 'month';
  const startDate = historyGetStartDate(range);
  const color = HISTORY_CATEGORY_COLOR[tab] || 'var(--ink-3)';

  const filtered = entries.filter(e => {
    if (e.category !== tab) return false;
    if (startDate && new Date(e.timestamp) < startDate) return false;
    return true;
  });

  const container = document.getElementById('historyEntries');
  if (!container) return;

  if (!filtered.length) {
    container.innerHTML = `<div class="panel"><div class="panel-b" style="padding:40px;text-align:center;color:var(--ink-4);font-size:13px;">No activity in this period</div></div>`;
    return;
  }

  const rows = filtered.map(e => {
    const action = HISTORY_ACTION_LABELS[e.action] || { label: e.action, icon: '·' };
    const detail = historyDetailText(e);
    return `<div style="display:flex;align-items:baseline;gap:12px;padding:10px 16px;border-bottom:1px solid var(--line-soft);">
      <span style="flex:0 0 20px;font-size:13px;color:${color};text-align:center;">${action.icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;color:var(--ink);">${action.label}${e.grade ? ` <span style="color:var(--ink-3);">· ${e.grade}</span>` : ''}</div>
        ${detail ? `<div style="font-size:11px;color:var(--ink-4);margin-top:2px;">${detail}</div>` : ''}
      </div>
      <div style="flex:0 0 auto;text-align:right;">
        <div style="font-size:11px;color:var(--ink-3);">${e.session_name}</div>
        <div style="font-size:10px;color:var(--ink-4);">${historyRelativeTime(e.timestamp)}</div>
      </div>
    </div>`;
  }).join('');

  container.innerHTML = `<div class="panel"><div class="panel-b" style="padding:0">${rows}</div></div>`;
}

function switchHistoryTab(tab) {
  window.historyTab = tab;
  document.querySelectorAll('[id^="histTab_"]').forEach(btn => {
    const active = btn.id === 'histTab_' + tab;
    btn.style.borderBottomColor = active ? 'var(--ink)' : 'transparent';
    btn.style.color = active ? 'var(--ink)' : 'var(--ink-3)';
    btn.style.fontWeight = active ? '600' : '400';
  });
  renderHistoryEntries();
}

function switchHistoryRange(range) {
  window.historyRange = range;
  renderHistoryEntries();
}

async function renderHistoryScreen() {
  if (!window.historyTab) window.historyTab = 'assignment';
  if (!window.historyRange) window.historyRange = 'month';

  try {
    const res = await fetch('/api/history');
    window.historyAllEntries = await res.json();
  } catch (e) {
    window.historyAllEntries = [];
  }

  const TABS = [
    { id: 'assignment', label: 'Placement'    },
    { id: 'students',   label: 'Student data'  },
    { id: 'teachers',   label: 'Teacher data'  },
  ];

  const RANGES = [
    { id: 'week',    label: 'This week'     },
    { id: 'month',   label: 'This month'    },
    { id: 'quarter', label: 'Last 3 months' },
    { id: 'year',    label: 'This year'     },
    { id: 'all',     label: 'All time'      },
  ];

  const html = `
    <div class="canvas">
      <div class="page-hd">
        <div>
          <h1>Activity <em>history</em></h1>
          <p class="lede">A log of every change made across all grades.</p>
        </div>
      </div>
      <div style="display:flex;align-items:center;margin-bottom:16px;border-bottom:1px solid var(--line);">
        ${TABS.map(t => `
          <button id="histTab_${t.id}" onclick="switchHistoryTab('${t.id}')"
            style="padding:8px 16px;font-size:13px;background:none;border:none;border-bottom:2px solid ${window.historyTab === t.id ? 'var(--ink)' : 'transparent'};color:${window.historyTab === t.id ? 'var(--ink)' : 'var(--ink-3)'};cursor:pointer;font-weight:${window.historyTab === t.id ? '600' : '400'};margin-bottom:-1px;transition:all 0.1s;">${t.label}</button>`).join('')}
        <div style="flex:1;"></div>
        <select onchange="switchHistoryRange(this.value)"
          style="height:28px;padding:0 8px;font-size:12px;border:1px solid var(--line);border-radius:var(--rad);background:var(--panel);color:var(--ink);font-family:inherit;margin-bottom:4px;">
          ${RANGES.map(r => `<option value="${r.id}" ${window.historyRange === r.id ? 'selected' : ''}>${r.label}</option>`).join('')}
        </select>
      </div>
      <div id="historyEntries" style="max-width:680px"></div>
    </div>`;

  // Render entries after DOM is set
  requestAnimationFrame(renderHistoryEntries);
  return html;
}

// ── Users screen ─────────────────────────────────────────────────────────────

function escAttr(s) { return String(s).replace(/&/g,'&amp;').replace(/'/g,'&#39;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function renderUsersScreen() {
  const res = await fetch('/api/users');
  const users = await res.json();
  const me = await fetch('/api/me').then(r => r.json());

  return `
    <div class="canvas">
      <div class="page-hd">
        <div>
          <h1>User <em>accounts</em></h1>
          <p class="lede">Manage who can sign in to Classify.</p>
        </div>
        <button class="btn primary" onclick="openCreateUserModal()">+ Add user</button>
      </div>
      <div class="panel" style="max-width:560px;">
        <div class="panel-b" style="padding:0;">
          ${users.map(u => `
            <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--line-soft);">
              <div style="width:32px;height:32px;border-radius:50%;background:${u.pending ? 'var(--bg-3)' : 'var(--terra-soft)'};color:${u.pending ? 'var(--ink-4)' : 'var(--terra)'};font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                ${u.pending ? '?' : u.username[0].toUpperCase()}
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:500;color:var(--ink);display:flex;align-items:center;gap:6px;">
                  ${u.pending ? '<span style="color:var(--ink-4);font-style:italic;">Pending setup</span>' : u.username}
                  ${u.id === me.id ? ' <span style="font-size:11px;color:var(--ink-4);font-weight:400;">(you)</span>' : ''}
                </div>
                <div style="font-size:11px;color:var(--ink-4);">${u.is_admin ? 'Admin' : 'Teacher'} · invited ${new Date(u.created_at).toLocaleDateString()}</div>
              </div>
              <div style="display:flex;gap:6px;">
                ${!u.has_password
                  ? `<button class="btn ghost sm" onclick="regenerateInvite(${u.id})">New invite</button>`
                  : `<button class="btn ghost sm" onclick="openChangePasswordModal(${u.id}, '${escAttr(u.username)}', ${u.id === me.id})">Change password</button>`
                }
                ${u.id !== me.id ? `<button class="btn ghost sm" onclick="toggleUserRole(${u.id}, ${!u.is_admin})" title="${u.is_admin ? 'Demote to teacher' : 'Promote to admin'}">${u.is_admin ? 'Make teacher' : 'Make admin'}</button>` : ''}
                ${u.id !== me.id ? `<button class="btn ghost sm" style="color:var(--rose);" onclick="deleteUser(${u.id}, '${escAttr(u.username || '')}')">Remove</button>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>`;
}
window.renderUsersScreen = renderUsersScreen;

async function openCreateUserModal() {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
  modal.innerHTML = `
    <div style="background:var(--bg);border-radius:var(--rad-lg);padding:28px;max-width:420px;width:90%;box-shadow:0 4px 24px rgba(0,0,0,0.15);">
      <div style="font-size:16px;font-weight:600;margin-bottom:8px;">Add user</div>
      <div style="font-size:13px;color:var(--ink-3);margin-bottom:20px;line-height:1.5;">
        An invite code will be generated. The user will choose their own username and password when they set up their account.
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink-2);margin-bottom:20px;cursor:pointer;">
        <input type="checkbox" id="newUserAdmin"> Grant admin privileges
      </label>
      <div id="createUserError" style="display:none;color:var(--rose);font-size:12px;margin-bottom:10px;"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn ghost" onclick="this.closest('[style*=fixed]').remove()">Cancel</button>
        <button class="btn primary" onclick="submitCreateUser()">Generate invite code</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}
window.openCreateUserModal = openCreateUserModal;

async function submitCreateUser() {
  const is_admin = document.getElementById('newUserAdmin').checked;
  const errEl = document.getElementById('createUserError');

  const res = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_admin }),
  });
  const d = await res.json();
  if (res.ok) {
    const box = document.querySelector('[style*=fixed] > div');
    const setupUrl = await _getSetupUrl();
    box.innerHTML = `
      <div style="font-size:16px;font-weight:600;margin-bottom:8px;">Invite code generated</div>
      <div style="font-size:13px;color:var(--ink-3);margin-bottom:16px;line-height:1.5;">
        Share this code. They go to <a href="${setupUrl}" target="_blank" style="color:var(--terra);">${setupUrl}</a> and enter it to choose their username and password. Expires in 7 days.
      </div>
      <div style="background:var(--bg-2);border:1px solid var(--line);border-radius:var(--rad);padding:14px 16px;font-family:'JetBrains Mono',monospace;font-size:18px;letter-spacing:0.05em;text-align:center;margin-bottom:16px;cursor:pointer;user-select:all;" id="inviteCodeBox" title="Click to copy">
        ${escAttr(d.invite_code)}
      </div>
      <div id="copyConfirm" style="text-align:center;font-size:12px;color:var(--ink-4);margin-bottom:16px;">Click the code to copy</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <a class="btn ghost" href="${_inviteMailto(d.invite_code, setupUrl)}" target="_blank">Send via email</a>
        <button class="btn primary" onclick="this.closest('[style*=fixed]').remove(); showScreen('users');">Done</button>
      </div>
    `;
    document.getElementById('inviteCodeBox').addEventListener('click', () => {
      navigator.clipboard.writeText(d.invite_code).then(() => {
        document.getElementById('copyConfirm').textContent = 'Copied!';
        setTimeout(() => { const el = document.getElementById('copyConfirm'); if (el) el.textContent = 'Click the code to copy'; }, 2000);
      });
    });
  } else {
    errEl.textContent = d.error || 'Failed to create invite.';
    errEl.style.display = '';
  }
}
window.submitCreateUser = submitCreateUser;

async function _getSetupUrl() {
  if (window.location.hostname === '127.0.0.1') {
    const info = await fetch('/api/server-info').then(r => r.json()).catch(() => null);
    if (info) {
      const base = info.local_url || info.url;
      return `${base}/setup`;
    }
  }
  return `${window.location.origin}/setup`;
}

function _inviteMailto(code, setupUrl) {
  const subject = encodeURIComponent('Your Classify invite');
  const body = encodeURIComponent(
    `You've been invited to Classify. Follow these steps to set up your account:\n\n` +
    `1. Go to: ${setupUrl}\n` +
    `2. Enter your invite code: ${code}\n` +
    `3. Choose a username and password\n\n` +
    `Your invite code expires in 7 days.\n\nWelcome aboard!`
  );
  return `mailto:?subject=${subject}&body=${body}`;
}

async function deleteUser(id, username) {
  if (!confirm(`Remove ${username}? They will no longer be able to sign in.`)) return;
  const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
  if (res.ok) {
    showScreen('users');
  } else {
    const d = await res.json();
    showNotice(d.error || 'Failed to remove user.', 'error');
  }
}
window.deleteUser = deleteUser;

async function toggleUserRole(id, makeAdmin) {
  const label = makeAdmin ? 'admin' : 'teacher';
  if (!confirm(`Change this user's role to ${label}?`)) return;
  const res = await fetch(`/api/users/${id}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_admin: makeAdmin }),
  });
  if (res.ok) {
    showScreen('users');
  } else {
    const d = await res.json();
    showNotice(d.error || 'Failed to change role.', 'error');
  }
}
window.toggleUserRole = toggleUserRole;

async function regenerateInvite(userId, username) {
  const res = await fetch(`/api/users/${userId}/invite`, { method: 'POST' });
  const d = await res.json();
  if (!res.ok) { showNotice(d.error || 'Failed to generate invite.', 'error'); return; }

  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
  const setupUrl = await _getSetupUrl();
  modal.innerHTML = `
    <div style="background:var(--bg);border-radius:var(--rad-lg);padding:28px;max-width:420px;width:90%;box-shadow:0 4px 24px rgba(0,0,0,0.15);">
      <div style="font-size:16px;font-weight:600;margin-bottom:8px;">New invite code</div>
      <div style="font-size:13px;color:var(--ink-3);margin-bottom:16px;line-height:1.5;">
        Have them go to <a href="${setupUrl}" target="_blank" style="color:var(--terra);">${setupUrl}</a> and enter this code. Expires in 7 days.
      </div>
      <div style="background:var(--bg-2);border:1px solid var(--line);border-radius:var(--rad);padding:14px 16px;font-family:'JetBrains Mono',monospace;font-size:18px;letter-spacing:0.05em;text-align:center;margin-bottom:16px;cursor:pointer;user-select:all;" id="reInviteCodeBox" title="Click to copy">
        ${d.invite_code}
      </div>
      <div id="reCopyConfirm" style="text-align:center;font-size:12px;color:var(--ink-4);margin-bottom:16px;">Click the code to copy</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <a class="btn ghost" href="${_inviteMailto(d.invite_code, setupUrl)}" target="_blank">Send via email</a>
        <button class="btn primary" onclick="this.closest('[style*=fixed]').remove()">Done</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.getElementById('reInviteCodeBox').addEventListener('click', () => {
    navigator.clipboard.writeText(d.invite_code).then(() => {
      document.getElementById('reCopyConfirm').textContent = 'Copied!';
      setTimeout(() => { const el = document.getElementById('reCopyConfirm'); if (el) el.textContent = 'Click the code to copy'; }, 2000);
    });
  });
}
window.regenerateInvite = regenerateInvite;

async function openChangePasswordModal(userId, username, isSelf) {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
  modal.innerHTML = `
    <div style="background:var(--bg);border-radius:var(--rad-lg);padding:28px;max-width:380px;width:90%;box-shadow:0 4px 24px rgba(0,0,0,0.15);">
      <div style="font-size:16px;font-weight:600;margin-bottom:20px;">Change password · ${username}</div>
      ${isSelf && !window.classifyIsAdmin ? `
        <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:5px;">Current password</label>
        <input id="cpCurrent" type="password"
          style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--line);border-radius:var(--rad);font-size:14px;font-family:inherit;background:var(--bg-2);color:var(--ink);outline:none;margin-bottom:14px;">
      ` : ''}
      <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:5px;">New password</label>
      <input id="cpNew" type="password" placeholder="At least 6 characters"
        style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--line);border-radius:var(--rad);font-size:14px;font-family:inherit;background:var(--bg-2);color:var(--ink);outline:none;margin-bottom:20px;">
      <div id="cpError" style="display:none;color:var(--rose);font-size:12px;margin-bottom:10px;"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn ghost" onclick="this.closest('[style*=fixed]').remove()">Cancel</button>
        <button class="btn primary" onclick="submitChangePassword(${userId}, ${isSelf && !window.classifyIsAdmin})">Save</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  setTimeout(() => document.getElementById('cpCurrent')?.focus() || document.getElementById('cpNew')?.focus(), 50);
}
window.openChangePasswordModal = openChangePasswordModal;

async function submitChangePassword(userId, requireCurrent) {
  const newPass = document.getElementById('cpNew').value;
  const body = { new_password: newPass };
  if (requireCurrent) body.current_password = document.getElementById('cpCurrent')?.value || '';
  const errEl = document.getElementById('cpError');

  const res = await fetch(`/api/users/${userId}/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    document.querySelector('[style*=fixed]')?.remove();
    showNotice('Password updated.');
  } else {
    const d = await res.json();
    errEl.textContent = d.error || 'Failed to update password.';
    errEl.style.display = '';
  }
}
window.submitChangePassword = submitChangePassword;

// ── Feedback (bug report / feature request) ───────────────────────────────────

async function openFeedbackModal(type) {
  const isBug = type === 'bug';
  const title = isBug ? 'Report a bug' : 'Request a feature';
  const placeholder = isBug
    ? 'Describe what happened and what you expected…'
    : 'Describe the feature you\u2019d like to see\u2026';

  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
  modal.innerHTML = `
    <div style="background:var(--bg);border-radius:var(--rad-lg);padding:28px;max-width:440px;width:90%;box-shadow:0 4px 24px rgba(0,0,0,0.15);">
      <div style="font-size:16px;font-weight:600;margin-bottom:8px;">${title}</div>
      <textarea id="feedbackMsg" placeholder="${placeholder}"
        style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--line);border-radius:var(--rad);font-size:13px;font-family:inherit;background:var(--bg-2);color:var(--ink);outline:none;resize:vertical;min-height:100px;margin-bottom:6px;line-height:1.4;"></textarea>
      <div id="feedbackError" style="display:none;color:var(--rose);font-size:12px;margin-bottom:10px;"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn ghost" onclick="this.closest('[style*=fixed]').remove()">Cancel</button>
        <button class="btn primary" id="feedbackSubmitBtn" onclick="submitFeedback('${type}')">Submit</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  setTimeout(() => document.getElementById('feedbackMsg')?.focus(), 50);
}
window.openFeedbackModal = openFeedbackModal;

async function submitFeedback(type) {
  const msg = document.getElementById('feedbackMsg')?.value.trim();
  const errEl = document.getElementById('feedbackError');
  const btn = document.getElementById('feedbackSubmitBtn');
  if (!msg) {
    errEl.textContent = 'Please enter a message.';
    errEl.style.display = '';
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Sending…';

  let schoolName = '';
  try {
    const cfg = await fetch('/api/config').then(r => r.json());
    schoolName = cfg.school_name || '';
  } catch (_) {}

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        type,
        message: msg,
        app_version: window.classifyVersion || '',
        school_name: schoolName,
      }),
    });
    if (res.ok || res.status === 201) {
      document.querySelector('[style*=fixed] > div').innerHTML = `
        <div style="font-size:16px;font-weight:600;margin-bottom:8px;">Thanks!</div>
        <div style="font-size:13px;color:var(--ink-3);margin-bottom:20px;">Your ${type === 'bug' ? 'bug report' : 'feature request'} was submitted.</div>
        <div style="display:flex;justify-content:flex-end;">
          <button class="btn primary" onclick="this.closest('[style*=fixed]').remove()">Done</button>
        </div>`;
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (e) {
    errEl.textContent = 'Failed to submit. Please try again.';
    errEl.style.display = '';
    btn.disabled = false;
    btn.textContent = 'Submit';
  }
}
window.submitFeedback = submitFeedback;

async function populateServerUrl() {
  let url = window.location.origin;
  let localUrl = null;
  try {
    const r = await fetch('/api/server-info');
    if (r.ok) { const d = await r.json(); url = d.url; localUrl = d.local_url || null; }
  } catch (_) {}
  const primaryUrl = localUrl || url;
  const disp = document.getElementById('server-url-display');
  const copy = document.getElementById('server-url-copy');
  const mailto = document.getElementById('server-url-mailto');
  const fallback = document.getElementById('server-url-fallback');
  if (!disp) return;
  disp.textContent = primaryUrl;
  copy._url = primaryUrl;
  if (fallback) {
    if (localUrl && localUrl !== url) {
      fallback.textContent = `IP fallback: ${url}`;
      fallback.style.display = '';
    } else {
      fallback.style.display = 'none';
    }
  }
  const mailtoBody = encodeURIComponent(`Hi,\n\nYou can access Classify from any device on the school network at:\n${primaryUrl}\n\nLog in with the credentials your admin set up for you.`);
  mailto.href = `mailto:?subject=${encodeURIComponent('Your Classify access link')}&body=${mailtoBody}`;
}

function copyServerUrl() {
  const btn = document.getElementById('server-url-copy');
  const url = btn?._url || document.getElementById('server-url-display')?.textContent;
  if (!url) return;
  navigator.clipboard.writeText(url).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
  });
}

function renderSchoolConfigScreen() {
  const grades = [
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
  return `
    <div class="canvas">
      <div class="page-hd">
        <div>
          <h1>School <em>config</em></h1>
          <p class="lede">Settings that apply across all grades and school years.</p>
        </div>
      </div>
      <div style="max-width:560px">
        <div class="panel" style="margin-bottom:16px" id="server-url-panel">
          <div class="panel-h">
            <h3>Teacher access</h3>
            <span class="sub">share with your staff</span>
          </div>
          <div class="panel-b">
            <p style="font-size:12px;color:var(--ink-3);line-height:1.6;margin-bottom:12px">
              Teachers can access Classify from any device on your school network using this address.
            </p>
            <div style="background:var(--bg-2);border:1px solid var(--line);border-radius:var(--rad);padding:9px 12px;font-family:'JetBrains Mono',monospace;font-size:13px;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
              <span id="server-url-display" style="word-break:break-all;color:var(--ink-2);">Loading…</span>
              <button id="server-url-copy" onclick="copyServerUrl()" style="flex-shrink:0;padding:4px 10px;background:var(--terra);color:#fff;border:none;border-radius:var(--rad);font-size:12px;cursor:pointer;font-family:inherit;">Copy</button>
            </div>
            <div id="server-url-fallback" style="font-size:11px;color:var(--ink-4);margin-bottom:8px;display:none;"></div>
            <a id="server-url-mailto" href="#" style="font-size:13px;color:var(--ink-3);text-decoration:none;">✉ Email teachers this link</a>
          </div>
        </div>

        <div class="panel" style="margin-bottom:16px">
          <div class="panel-h">
            <h3>School name</h3>
          </div>
          <div class="panel-b">
            <div style="display:flex;align-items:center;gap:10px">
              <input type="text" id="schoolNameInput" value="${config.school_name || ""}" placeholder="e.g. Lincoln Elementary"
                style="flex:1;padding:8px 10px;border:1px solid var(--line);border-radius:6px;font:inherit;font-size:13px;background:var(--panel)">
              <button class="btn sm ghost" onclick="saveSchoolName()" data-mutates="true">Save</button>
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
                ${grades.map((g) => `<option value="${g}" ${(config.max_grade || "8th Grade") === g ? "selected" : ""}>${g}</option>`).join("")}
              </select>
            </div>
            <p style="font-size:11px;color:var(--ink-3);line-height:1.5">
              Students at the highest grade are graduated out when creating a new school year.
            </p>
          </div>
        </div>

        <div class="panel" style="margin-top:16px">
          <div class="panel-h">
            <h3>Roster</h3>
            <span class="sub">all grades · current year</span>
          </div>
          <div class="panel-b" style="display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
              <p style="margin:0;font-size:12px;color:var(--ink-3);line-height:1.6;">
                Download a single CSV with every student across all grades, including class assignments where available.
              </p>
              <button class="btn sm ghost" style="white-space:nowrap;flex-shrink:0;" onclick="exportAllGradesCSV()">Export all grades</button>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:10px;border-top:1px solid var(--line-soft);">
              <p style="margin:0;font-size:12px;color:var(--ink-3);line-height:1.6;">
                Replace all grades and students by uploading a new CSV. Existing assignments will be cleared.
              </p>
              <button class="btn sm ghost" style="white-space:nowrap;flex-shrink:0;" onclick="showImportModal('schoolYear')">Re-import roster</button>
            </div>
          </div>
        </div>

        <div class="panel" style="margin-top:16px">
          <div class="panel-h">
            <h3>Computer transfer</h3>
          </div>
          <div class="panel-b">
            <p style="font-size:12px;color:var(--ink-3);line-height:1.6;margin-bottom:14px">
              Moving to a new computer? Export a backup file and import it on the new machine after activation.
            </p>
            <div style="display:flex;gap:10px;align-items:center">
              <button class="btn sm" onclick="exportAllData()">Export backup</button>
              <label class="btn sm ghost" style="cursor:pointer">
                Import backup
                <input type="file" accept=".classify" style="display:none" onchange="importAllData(this)">
              </label>
            </div>
            <div id="import-status" style="display:none;margin-top:10px;font-size:12px"></div>
          </div>
        </div>

        <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--line-soft);display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:12px;color:var(--ink-4);">Classify v${window.classifyVersion || '—'}</span>
          <button class="btn sm ghost" onclick="checkForUpdate().then(() => { const b = document.getElementById('update-banner'); if (b && b.style.display === 'none') showNotice('You\\'re on the latest version.', 'success'); })">Check for updates</button>
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
          <button class="btn ghost" onclick="resetWeightsToDefaults()">↻ Reset defaults</button>
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
    teacher_uniqueness:
      "Students are never assigned to a teacher they've had before.",
  };

  const renderRow = (prop, isCustom) => {
    const weight = Math.round(prop.weight / 20);
    const enabled = prop.enabled !== false;
    const isHard = isCustom && prop.constraint === "hard";
    const isHardToggle = prop.type === "hard_toggle";
    const typeDesc = isCustom
      ? prop.type === "boolean"
        ? "Yes / No"
        : (prop.values || []).join(", ")
      : descriptions[prop.name] || "";

    return `
    <div style="padding: 12px 0; border-bottom: 1px solid var(--line-soft); ${!enabled ? "opacity: 0.5;" : ""}">
      <div style="display: grid; grid-template-columns: 40px 160px 1fr 80px${isCustom ? " 24px" : ""}; gap: 12px; align-items: center;">
        <label class="toggle">
          <input type="checkbox" ${enabled ? "checked" : ""} onchange="toggleProperty('${prop.name}', this.checked)">
          <span class="toggle-slider"></span>
        </label>
        <div>
          <div style="font-weight: 500; font-size: 13px; color: var(--terra);">${prop.display_name}</div>
          <div style="font-size: 11px; color: var(--ink-3); display:flex; align-items:center; gap:6px;">
            <span>${typeDesc}</span>
            ${isCustom ? `<span onclick="toggleCustomConstraint('${prop.name}')" style="cursor:pointer; padding:1px 5px; border-radius:3px; font-size:9px; font-weight:700; text-transform:uppercase; background:${isHard ? "var(--rose)" : "var(--line-soft)"}; color:${isHard ? "#fff" : "var(--ink-3)"};">${isHard ? "Hard" : "Soft"}</span>` : ""}
          </div>
        </div>
        ${
          isHardToggle
            ? `
          <div style="font-size:11px; color:var(--ink-3); font-style:italic;">
            Hard constraint — students never repeat a teacher
          </div>
          <div></div>
        `
            : isHard
              ? `
          <div style="font-size:11px; color:var(--ink-3); font-style:italic;">Always enforced at maximum priority</div>
          <div></div>
        `
              : `
          <input type="range" min="1" max="5" step="1" class="slider" value="${weight}" onchange="updateWeight('${prop.name}', this.value)" ${!enabled ? "disabled" : ""}>
          <div style="font-family: var(--t-mono); font-size: 10px; text-align: right; text-transform: uppercase; color: var(--terra);">
            ${["", "Mild", "Medium", "High", "Critical"][weight - 1] || "Mild"}
          </div>
        `
        }
        ${isCustom ? `<button onclick="deleteCustomAttribute('${prop.name.replace(/'/g, "\\'")}')" title="Remove" style="background:none;border:none;cursor:pointer;color:var(--ink-3);font-size:16px;padding:0;line-height:1;align-self:center;">×</button>` : ""}
      </div>
    </div>`;
  };

  const builtinHtml = config.properties
    .filter((p) => !p.custom)
    .map((p) => renderRow(p, false))
    .join("");

  const customProps = config.properties.filter((p) => p.custom);
  const customHtml = customProps.map((p) => renderRow(p, true)).join("");

  return `
    ${builtinHtml}
    <div style="padding: 20px 0 8px; display:flex; align-items:center; justify-content:space-between;">
      <span style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:var(--ink-3);">Custom attributes</span>
      <button class="btn ghost sm" onclick="openAddCustomAttributeModal()">+ Add</button>
    </div>
    ${customProps.length === 0 ? `<div style="font-size:12px; color:var(--ink-3); padding-bottom:12px;">No custom attributes yet. Add one to track school-specific factors.</div>` : customHtml}
  `;
}

function openAddCustomAttributeModal() {
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:1000;display:flex;align-items:center;justify-content:center";
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  overlay.innerHTML = `
    <div style="background:var(--panel);border-radius:12px;width:440px;max-height:90vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.18)">
      <div style="padding:20px 24px 16px;border-bottom:1px solid var(--line-soft);display:flex;align-items:center;justify-content:space-between">
        <div style="font-weight:600;font-size:15px">Add custom attribute</div>
        <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--ink-3);padding:0 4px">×</button>
      </div>
      <div style="padding:20px 24px;display:flex;flex-direction:column;gap:16px">

        <div>
          <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:6px">Attribute name</label>
          <input id="custom-attr-name" type="text" placeholder="e.g. Language Group" autocomplete="off"
            style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--line-soft);border-radius:6px;font-size:13px;background:var(--bg-2);color:var(--ink);outline:none">
        </div>

        <div>
          <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:6px">Type</label>
          <div class="segmented" data-mutates="true">
            <button class="seg active" data-field="custom-type" data-value="boolean">Yes / No</button>
            <button class="seg" data-field="custom-type" data-value="categorical">Multiple values</button>
          </div>
        </div>

        <div id="custom-values-row" style="display:none">
          <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:6px">Values <span style="font-weight:400;">(comma-separated)</span></label>
          <input id="custom-attr-values" type="text" placeholder="e.g. Spanish, Mandarin, None" autocomplete="off"
            style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--line-soft);border-radius:6px;font-size:13px;background:var(--bg-2);color:var(--ink);outline:none">
        </div>

        <div>
          <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:6px">Constraint</label>
          <div class="segmented" data-mutates="true">
            <button class="seg active" data-field="custom-constraint" data-value="soft">Soft — balance by importance</button>
            <button class="seg" data-field="custom-constraint" data-value="hard">Hard — always enforced</button>
          </div>
        </div>

        <div id="custom-weight-row">
          <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:6px">Importance</label>
          <div style="display:grid;grid-template-columns:1fr 70px;gap:8px;align-items:center">
            <input id="custom-attr-weight" type="range" min="1" max="5" step="1" class="slider" value="3"
              oninput="document.getElementById('custom-weight-label').textContent=['','Low','Mild','Medium','High','Critical'][this.value]">
            <div id="custom-weight-label" style="font-family:var(--t-mono);font-size:10px;text-transform:uppercase;color:var(--terra);text-align:right">Medium</div>
          </div>
        </div>

        <div id="custom-attr-error" style="font-size:12px;color:var(--rose);display:none"></div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid var(--line-soft);display:flex;justify-content:flex-end;gap:8px">
        <button class="btn ghost sm" onclick="this.closest('[style*=fixed]').remove()">Cancel</button>
        <button class="btn sm" style="background:var(--terra);color:#fff;border-color:var(--terra)" onclick="submitAddCustomAttribute()">Add attribute</button>
      </div>
    </div>
  `;

  overlay.querySelectorAll(".seg[data-field]").forEach((btn) => {
    btn.addEventListener("click", function () {
      const field = this.dataset.field;
      overlay
        .querySelectorAll(`.seg[data-field="${field}"]`)
        .forEach((b) => b.classList.remove("active"));
      this.classList.add("active");
      if (field === "custom-type") {
        document.getElementById("custom-values-row").style.display =
          this.dataset.value === "categorical" ? "block" : "none";
      }
      if (field === "custom-constraint") {
        document.getElementById("custom-weight-row").style.display =
          this.dataset.value === "soft" ? "block" : "none";
      }
    });
  });

  document.body.appendChild(overlay);
  document.getElementById("custom-attr-name").focus();
  window._customAttrOverlay = overlay;
}
window.openAddCustomAttributeModal = openAddCustomAttributeModal;

async function submitAddCustomAttribute() {
  const overlay = window._customAttrOverlay;
  if (!overlay) return;

  const displayName = document.getElementById("custom-attr-name").value.trim();
  const errorEl = document.getElementById("custom-attr-error");
  errorEl.style.display = "none";

  if (!displayName) {
    errorEl.textContent = "Please enter an attribute name.";
    errorEl.style.display = "block";
    return;
  }

  const name = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  if (config.properties.find((p) => p.name === name)) {
    errorEl.textContent = `An attribute named "${name}" already exists.`;
    errorEl.style.display = "block";
    return;
  }

  const type =
    overlay.querySelector('.seg.active[data-field="custom-type"]')?.dataset
      .value || "boolean";
  const constraint =
    overlay.querySelector('.seg.active[data-field="custom-constraint"]')
      ?.dataset.value || "soft";
  const weight =
    parseInt(document.getElementById("custom-attr-weight").value) * 20;

  const newProp = {
    name,
    display_name: displayName,
    type,
    constraint,
    weight,
    enabled: true,
    custom: true,
  };

  if (type === "categorical") {
    const valuesStr = document
      .getElementById("custom-attr-values")
      .value.trim();
    const values = valuesStr
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (values.length === 0) {
      errorEl.textContent = "Please enter at least one value.";
      errorEl.style.display = "block";
      return;
    }
    newProp.values = values;
  }

  config.properties.push(newProp);

  // Save to server
  await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });

  overlay.remove();
  showScreen("config");
  showNotice(`"${displayName}" attribute added.`);
}
window.submitAddCustomAttribute = submitAddCustomAttribute;

async function deleteCustomAttribute(name) {
  const prop = config.properties.find((p) => p.name === name);
  if (!prop) return;
  const ok = await showConfirm(`Remove "${prop.display_name}" attribute?`);
  if (!ok) return;
  config.properties = config.properties.filter((p) => p.name !== name);

  // Save to server
  await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });

  showScreen("config");
  showNotice(`"${prop.display_name}" removed.`);
}
window.deleteCustomAttribute = deleteCustomAttribute;

async function toggleCustomConstraint(name) {
  const prop = config.properties.find((p) => p.name === name);
  if (!prop) return;
  prop.constraint = prop.constraint === "hard" ? "soft" : "hard";

  // Save to server
  await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });

  showScreen("config");
}
window.toggleCustomConstraint = toggleCustomConstraint;

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

async function resetWeightsToDefaults() {
  const ok = await showConfirm('Reset all rules & weights to factory defaults? This will re-enable all properties and remove any custom attributes.', { confirmLabel: 'Reset' });
  if (!ok) return;

  const defaults = {
    gender: 40, behavior: 100, independence: 60, iep: 100,
    '504': 100, esl: 80, gate: 60, math: 60, reading: 60, friends: 20,
  };

  // Remove custom properties, reset weights and re-enable all standard ones
  config.properties = config.properties
    .filter(p => !p.custom)
    .map(p => ({ ...p, weight: defaults[p.name] ?? p.weight, enabled: true }));

  config.friend_weight = defaults.friends;

  await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });

  showScreen("config");
  showNotice("Rules & weights reset to factory defaults");
}

async function saveSchoolName() {
  const name = document.getElementById("schoolNameInput")?.value.trim();
  if (!name) return;
  config.school_name = name;
  await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  // Update sidebar brand
  document.getElementById("brand-school-name").textContent = name;
  showNotice("School name saved.");
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

// Grade Settings Screen
async function renderGradeSettingsScreen() {
  if (!currentGrade) {
    return '<div class="canvas"><p>No grade selected</p></div>';
  }

  // Fetch full grade data
  const res = await fetch(`/api/grades/${currentGrade.id}/students`);
  const data = await res.json();

  console.log("Fetched grade data, custom_rules:", data.custom_rules);

  const numStudents = (data.students || []).length;
  const numClasses = data.num_classes || 5;
  const avg = numStudents / numClasses;
  const defaultMin = Math.max(1, Math.floor(avg) - 2);
  const defaultMax = Math.ceil(avg) + 2;

  const hasCustomRules = data.custom_rules && data.custom_rules.properties;

  // Store current settings globally for save operations
  window.currentGradeSettings = {
    gradeId: currentGrade.id,
    num_classes: numClasses,
    num_students: numStudents,
    min_students: data.min_students ?? defaultMin,
    max_students: data.max_students ?? defaultMax,
    enforce_class_size: data.enforce_class_size === true,
    custom_rules: data.custom_rules || null,
  };

  // Prepare rules to display. When custom rules exist, merge with global so that
  // any new global rules added after customization appear (disabled) rather than vanishing.
  let rulesProperties;
  if (hasCustomRules) {
    const customByName = Object.fromEntries(
      data.custom_rules.properties.map((p) => [p.name, p])
    );
    rulesProperties = config.properties.map(
      (globalProp) => customByName[globalProp.name] || { ...globalProp, enabled: false }
    );
    // Keep the in-memory custom_rules in sync so toggle/weight handlers can find all properties
    window.currentGradeSettings.custom_rules.properties = rulesProperties;
  } else {
    rulesProperties = config.properties;
  }

  // Render weight sliders inline
  const renderWeightSlider = (prop) => {
    const weight = Math.round(prop.weight / 20);
    const enabled = prop.enabled !== false;
    const weightLabels = ["", "Mild", "Medium", "High", "Critical"];

    return `
      <div style="padding: 14px 0; border-bottom: 1px solid var(--line-soft); ${!enabled ? "opacity: 0.5;" : ""}">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 10px;">
          <label class="toggle">
            <input type="checkbox" ${enabled ? "checked" : ""} onchange="toggleGradeProperty('${prop.name}', this.checked)" data-mutates="true">
            <span class="toggle-slider"></span>
          </label>
          <div style="flex: 1;">
            <div style="font-weight: 500; font-size: 13px; color: var(--terra);">${prop.display_name}</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 12px; padding-left: 52px;">
          <input type="range" min="1" max="5" step="1" class="slider" value="${weight}"
            onchange="updateGradeWeight('${prop.name}', this.value)" ${!enabled ? "disabled" : ""} style="flex: 1;" data-mutates="true">
          <div style="font-family: var(--t-mono); font-size: 10px; text-transform: uppercase; color: var(--terra); width: 60px; text-align: right;">
            ${weightLabels[weight] || "Mild"}
          </div>
        </div>
      </div>
    `;
  };

  const weightSlidersHtml = rulesProperties
    .filter((p) => p.type !== "hard_toggle")
    .map(renderWeightSlider)
    .join("");

  return `
    <div class="canvas">
      <!-- Page Title with Back Button -->
      <div class="page-title">
        <div style="display: flex; align-items: center; gap: 12px;">
          <button onclick="showScreen('students')"
            style="width:32px;height:32px;border-radius:6px;border:1px solid var(--line);background:transparent;cursor:pointer;color:var(--ink-3);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all 0.15s;"
            onmouseover="this.style.borderColor='var(--ink)';this.style.color='var(--ink)';this.style.background='var(--bg-2)';"
            onmouseout="this.style.borderColor='var(--line)';this.style.color='var(--ink-3)';this.style.background='transparent';"
            title="Back to ${currentGrade.name}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
          <div>
            <h1 style="margin: 0;">${currentGrade.name} Settings</h1>
          </div>
        </div>
      </div>

      <div style="max-width: 700px;">
        <!-- Number of Classes -->
        <div class="panel" style="margin-bottom: 16px;">
          <div class="panel-h">
            <h3>Number of classes</h3>
          </div>
          <div class="panel-b">
            <input type="number" id="numClasses" value="${window.currentGradeSettings.num_classes}" min="1" max="10"
              style="width: 120px; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font: inherit; font-size: 14px;" oninput="checkClassSizeFeasibility()" onchange="autoSaveGradeSettings()" data-mutates="true">
            <p style="font-size: 12px; color: var(--ink-3); margin-top: 8px;">How many classes to create for this grade</p>
          </div>
        </div>

        <!-- Class Size Constraints -->
        <div class="panel" style="margin-bottom: 16px;">
          <div class="panel-h">
            <h3>Class size constraints</h3>
          </div>
          <div class="panel-b">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
              <div>
                <label style="display: block; font-size: 12px; font-weight: 500; color: var(--ink-3); margin-bottom: 6px;">Minimum per class</label>
                <input type="number" id="minStudents" value="${window.currentGradeSettings.min_students}" min="1" max="50"
                  style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font: inherit; font-size: 14px;" oninput="checkClassSizeFeasibility()" onchange="autoSaveGradeSettings()" data-mutates="true">
              </div>
              <div>
                <label style="display: block; font-size: 12px; font-weight: 500; color: var(--ink-3); margin-bottom: 6px;">Maximum per class</label>
                <input type="number" id="maxStudents" value="${window.currentGradeSettings.max_students}" min="1" max="50"
                  style="width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 6px; font: inherit; font-size: 14px;" oninput="checkClassSizeFeasibility()" onchange="autoSaveGradeSettings()" data-mutates="true">
              </div>
            </div>

            <div style="padding: 14px; background: var(--bg-2); border-radius: 6px;">
              <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                <input type="checkbox" id="enforceClassSize" ${window.currentGradeSettings.enforce_class_size ? "checked" : ""}
                  style="width: 18px; height: 18px; cursor: pointer;" onchange="checkClassSizeFeasibility(); autoSaveGradeSettings();" data-mutates="true">
                <span style="font-size: 13px; font-weight: 500;">Enforce as hard constraint</span>
              </label>
              <p style="font-size: 11px; color: var(--ink-3); margin: 8px 0 0 28px; line-height: 1.5;">
                <strong>Checked:</strong> Optimizer fails if limits can't be met<br>
                <strong>Unchecked:</strong> Optimizer tries its best but allows flexibility
              </p>
              <div id="classSizeFeasibilityWarning" style="display:none; margin-top:10px; padding:10px 12px; background:var(--rose-soft); border-radius:6px; font-size:12px; color:var(--ink); line-height:1.5;"></div>
            </div>
          </div>
        </div>

        <!-- Rules & Weights - inline editor will go here -->
        <div class="panel">
          <div class="panel-h">
            <h3>Rules & Weights</h3>
            <span class="sub">for this grade</span>
          </div>
          <div class="panel-b">
            <p style="font-size: 13px; color: var(--ink-2); margin-bottom: 16px;">
              ${
                hasCustomRules
                  ? `<strong>Custom rules</strong> — these override the global defaults for ${currentGrade.name}.`
                  : `<strong>Currently using global defaults</strong> — any changes you make will create custom rules for this grade only.`
              }
            </p>
            <div id="rulesWeightsContainer">
              ${weightSlidersHtml}
            </div>
            ${
              hasCustomRules
                ? `<button class="btn ghost sm" onclick="resetToGlobalRulesInline()" data-mutates="true" style="margin-top: 12px;">Reset to Global Defaults</button>`
                : `<p style="font-size: 12px; color: var(--ink-3); margin-top: 12px; font-style: italic;">Tip: Once you adjust any rule, custom rules will be created automatically.</p>`
            }
          </div>
        </div>

      </div>
    </div>
  `;
}

// Students Screen
async function renderStudentsScreen() {
  const res = await fetch(`/api/grades/${currentGrade.id}/students`);
  const data = await res.json();
  const students = data.students || [];

  // Handle in-memory assignments for unsaved edit mode changes
  let assignments, assignData;
  if (window.hasUnsavedChanges && window.currentAssignments) {
    assignments = window.currentAssignments;
    assignData = {
      assignments,
      solver_baseline: window.solverBaseline,
      num_classes: window.numClasses,
      class_names: window.classNames || {},
      solver_status: window.solverStatus,
      solver_elapsed: window.solverElapsed,
      solver_combinations: window.solverCombinations,
    };
  } else {
    const assignRes = await fetch(`/api/grades/${currentGrade.id}/assignments`);
    assignData = await assignRes.json();
    assignments = assignData.assignments || [];
    // Store solver metadata globally
    window.solverStatus = assignData.solver_status;
    window.solverElapsed = assignData.solver_elapsed;
    window.solverCombinations = assignData.solver_combinations;
    window.assignmentConfig = assignData.assignment_config;
    window.assignmentStale = assignData.assignment_stale || false;
  }

  const hasAssignments = assignments.length > 0;

  console.log("DEBUG renderStudentsScreen - hasAssignments:", hasAssignments);
  console.log("DEBUG renderStudentsScreen - assignData:", assignData);
  console.log(
    "DEBUG renderStudentsScreen - solver_status:",
    assignData?.solver_status,
  );

  // Set globals (don't overwrite in-memory assignment state when editing)
  window.currentStudents = students;
  window.currentTeachers = data.teachers || [];
  window.currentAvailableTeachers = data.available_teachers || [];
  // Cache grade size settings for use in stats (generateCompactBalanceStrip etc.)
  window.gradeMinStudents = data.min_students;
  window.gradeMaxStudents = data.max_students;
  window.gradeEnforceClassSize = data.enforce_class_size === true;
  if (!window.hasUnsavedChanges) {
    window.currentAssignments = hasAssignments ? assignments : null;
    window.solverBaseline = hasAssignments ? assignData.solver_baseline : null;
    window.classNames = assignData.class_names || {};
  }

  if (students.length === 0) {
    return `
      <div class="canvas">
        <div class="page-title">
          <h1 style="flex:1;">${currentGrade.name} <span class="year-label">${config.active_school_year || config.school_year}</span></h1>
          <button onclick="showGradeInfoModal()" title="Legend & info"
            style="width:28px;height:28px;border-radius:50%;border:1px solid var(--line);background:transparent;cursor:pointer;font-size:13px;color:var(--ink-3);display:flex;align-items:center;justify-content:center;flex-shrink:0;"
            onmouseover="this.style.borderColor='var(--ink)';this.style.color='var(--ink)';"
            onmouseout="this.style.borderColor='var(--line)';this.style.color='var(--ink-3)';">?</button>
        </div>
        ${renderTeacherBar(window.currentAvailableTeachers)}
        <div style="display:flex;gap:16px;max-width:600px;margin-top:8px;flex-wrap:wrap;">
          <div class="panel" style="cursor:pointer;flex:1;min-width:180px;" onclick="openAddStudentModal()" data-mutates="true">
            <div class="panel-b" style="text-align:center;padding:32px 16px">
              <i data-lucide="user-plus" style="width:24px;height:24px;margin-bottom:10px;color:var(--ink-3)"></i>
              <div style="font-weight:600;font-size:14px;margin-bottom:6px">Add manually</div>
              <div class="muted" style="font-size:12px">Add students one at a time</div>
            </div>
          </div>
          ${window.classifyIsAdmin ? `
          <div class="panel" style="cursor:pointer;flex:1;min-width:180px;" onclick="showImportModal('schoolYear')" data-mutates="true">
            <div class="panel-b" style="text-align:center;padding:32px 16px">
              <i data-lucide="upload" style="width:24px;height:24px;margin-bottom:10px;color:var(--ink-3)"></i>
              <div style="font-weight:600;font-size:14px;margin-bottom:6px">Import CSV</div>
              <div class="muted" style="font-size:12px">Import all grades from a student roster</div>
            </div>
          </div>` : ''}
        </div>
      </div>
    `;
  }

  // Stats
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

  const numClasses = data.num_classes;

  // Boolean filter flags from config
  const boolFlags = (config.properties || []).filter(
    (p) => p.enabled && p.type === "boolean",
  );

  return `
    <div class="canvas">
      <!-- Page Title -->
      <div class="page-title">
        <h1 style="flex:1;">${currentGrade.name} <span class="year-label">${config.active_school_year || config.school_year}</span></h1>
        <button onclick="showGradeInfoModal()" title="Legend & info"
          style="width:28px;height:28px;border-radius:50%;border:1px solid var(--line);background:transparent;cursor:pointer;font-size:13px;color:var(--ink-3);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all 0.15s;"
          onmouseover="this.style.borderColor='var(--ink)';this.style.color='var(--ink)';"
          onmouseout="this.style.borderColor='var(--line)';this.style.color='var(--ink-3)';">?</button>
      </div>

      <!-- Teacher bar -->
      ${renderTeacherBar(window.currentAvailableTeachers)}

      <!-- Action toolbar -->
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
        <span style="font-size:12px;color:var(--ink-3);">${students.length} students</span>
        ${hasAssignments ? `<span style="color:var(--line-soft);">·</span><span style="font-size:12px;color:var(--ink-3);">${numClasses} classes</span>` : ""}
        ${data.custom_rules && data.custom_rules.properties ? `<span style="color:var(--line-soft);">·</span><span style="font-size:11px;padding:2px 6px;border-radius:3px;background:var(--terra-soft);color:var(--terra);font-weight:600;">Custom rules</span>` : ""}
        ${
          hasAssignments && assignData?.solver_status === "OPTIMAL"
            ? `
          <span style="color:var(--line-soft);">·</span>
          <span id="optimalBadge" style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--terra);font-weight:600;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="8" r="6"/>
              <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>
            </svg>
            Optimal placement
          </span>
        `
            : ""
        }
        ${
          hasAssignments && window.assignmentStale
            ? `
          <span style="color:var(--line-soft);">·</span>
          <span style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--amber);font-weight:500;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Student data changed since last run
          </span>
        `
            : ""
        }
        <div style="flex:1;min-width:8px;"></div>
        <button class="btn ghost" onclick="showScreen('grade-settings')" data-mutates="true"><i data-lucide="settings" style="width:13px;height:13px;display:inline-block;vertical-align:middle;margin-right:4px"></i>Settings</button>
        ${
          hasAssignments
            ? `<button class="btn ghost" onclick="exportAssignmentCSV()"><i data-lucide="download" style="width:13px;height:13px;display:inline-block;vertical-align:middle;margin-right:4px"></i>Export</button>`
            : `<button class="btn ghost" onclick="exportCSV()"><i data-lucide="download" style="width:13px;height:13px;display:inline-block;vertical-align:middle;margin-right:4px"></i>Export</button>`
        }
        <button class="btn terra" onclick="runAssignment()" data-mutates="true"><i data-lucide="play" style="width:13px;height:13px;display:inline-block;vertical-align:middle;margin-right:4px"></i>${hasAssignments ? "Re-assign" : "Assign"}</button>
      </div>

      <!-- Content area -->
      ${
        hasAssignments
          ? `
        <!-- Search + filter bar -->
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:14px;flex-wrap:wrap;">
          <div style="position:relative;display:inline-block;">
            <input id="assignmentSearch" type="text" placeholder="Search students…" data-readonly-ok
              oninput="filterAssignmentStudents(this.value); updateAssignmentSearchClear()"
              value="${(window.assignmentSearch || "").replace(/"/g, "&quot;")}"
              style="height:30px;padding:0 28px 0 10px;border:1px solid var(--line);border-radius:var(--rad);background:var(--panel);color:var(--ink);font:inherit;font-size:12px;width:180px;">
            <button id="assignmentSearchClear" onclick="document.getElementById('assignmentSearch').value=''; window.assignmentSearch=''; filterAssignmentStudents(''); updateAssignmentSearchClear();" style="display:${window.assignmentSearch ? "flex" : "none"};position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--ink-3);font-size:16px;line-height:1;padding:0;width:16px;height:16px;align-items:center;justify-content:center;" title="Clear search">×</button>
          </div>
          ${boolFlags
            .map((p) => {
              const label =
                p.display_name === "504 Plan" ? "504" : p.display_name;
              const count = students.filter(
                (s) => s[p.name] === true || s[p.name] === "true",
              ).length;
              if (count === 0) return "";
              const active = (window.assignmentFilterFlags || new Set()).has(p.name);
              return `<button data-filter-flag="${p.name}" onclick="toggleAssignmentFilter('${p.name}')"
              style="height:30px;padding:0 10px;font-size:11px;border:1px solid var(--line);border-radius:var(--rad);cursor:pointer;transition:all 0.1s;background:${active ? "var(--ink)" : "transparent"};color:${active ? "#fff" : "var(--ink-3)"};">${label} <span style="opacity:0.6;font-size:10px;">${count}</span></button>`;
            })
            .join("")}
          ${(() => {
            const noFriendsCount = assignments.filter((s) => {
              const hasFriendsDefined = s.friends && s.friends.length > 0 && s.friends !== "[]";
              const hasFriendInClass = s.has_friend_in_class === 1 || s.has_friend_in_class === true;
              return hasFriendsDefined && !hasFriendInClass;
            }).length;
            if (noFriendsCount === 0) return "";
            const active = (window.assignmentFilterFlags || new Set()).has('no_friends');
            return `<button data-filter-flag="no_friends" onclick="toggleAssignmentFilter('no_friends')"
              style="height:30px;padding:0 10px;font-size:11px;border:1px solid var(--line);border-radius:var(--rad);cursor:pointer;transition:all 0.1s;background:${active ? "var(--ink)" : "transparent"};color:${active ? "#fff" : "var(--ink-3)"};">No friends <span style="opacity:0.6;font-size:10px;">${noFriendsCount}</span></button>`;
          })()}
          <button id="clearFiltersBtn" onclick="clearAssignmentFilters()"
            style="display:${window.assignmentSearch || (window.assignmentFilterFlags && window.assignmentFilterFlags.size > 0) ? "" : "none"};height:30px;padding:0 10px;font-size:11px;border:1px solid var(--line);border-radius:var(--rad);cursor:pointer;background:transparent;color:var(--rose);">× Clear</button>
          <div style="flex:1;"></div>
          <button id="cleanViewBtn" onclick="toggleCleanView()"
            style="height:30px;padding:0 12px;font-size:11px;border:1px solid var(--line);border-radius:var(--rad);cursor:pointer;background:${window.cleanView ? "var(--ink)" : "transparent"};color:${window.cleanView ? "#fff" : "var(--ink-3)"};">Clean view</button>
        </div>

        ${renderAssignmentResults(assignments, numClasses, assignData)}
      `
          : `
        <!-- Pre-assignment: flat roster for data entry -->
        <div class="panel" style="margin-bottom: 16px;">
          <div class="panel-b stats-strip">
            <div class="stat"><div class="stat-label">Total</div><div class="stat-value">${students.length}</div></div>
            <div class="stat"><div class="stat-label">Girls</div><div class="stat-value">${girls}</div><div class="stat-sub">${Math.round((girls / students.length) * 100)}%</div></div>
            <div class="stat"><div class="stat-label">Boys</div><div class="stat-value">${boys}</div><div class="stat-sub">${Math.round((boys / students.length) * 100)}%</div></div>
            <div class="stat"><div class="stat-label">IEP</div><div class="stat-value">${iepCount}</div></div>
            <div class="stat"><div class="stat-label">504 Plan</div><div class="stat-value">${plan504Count}</div></div>
            <div class="stat"><div class="stat-label">ESL</div><div class="stat-value">${eslCount}</div></div>
            <div class="stat"><div class="stat-label">GATE</div><div class="stat-value">${gateCount}</div></div>
          </div>
        </div>

        <div class="tabs">
          <button class="tab ${currentStudentTab === "roster" ? "active" : ""}" onclick="switchStudentTab('roster')">Roster <span class="ct">${students.length}</span></button>
          <button class="tab ${currentStudentTab === "friendships" ? "active" : ""}" onclick="switchStudentTab('friendships')">Friendships <span class="ct">${students.reduce((sum, s) => sum + (s.friends ? s.friends.split(",").filter((f) => f.trim()).length : 0), 0)}</span></button>
          <button class="tab ${currentStudentTab === "incompatibilities" ? "active" : ""}" onclick="switchStudentTab('incompatibilities')">Incompatibilities <span class="ct">${students.reduce((sum, s) => sum + (s.incompatible ? s.incompatible.split(",").filter((f) => f.trim()).length : 0), 0)}</span></button>
        </div>

        <div id="studentTabContent">
          ${renderStudentTabContent(students)}
        </div>
      `
      }
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
  showScreen("students");
}

// Roster tab (original student list)
function renderRosterTab(students) {
  // Split properties: skip gender and hard_toggle; separate booleans (flags) from categoricals
  const allProps =
    config.properties?.filter(
      (p) =>
        p.enabled &&
        p.type !== "relationship" &&
        p.type !== "hard_toggle" &&
        p.name !== "gender",
    ) || [];
  const flagProps = allProps.filter((p) => p.type === "boolean");
  const catProps = allProps.filter((p) => p.type !== "boolean");

  const hasAssignments =
    window.currentAssignments && window.currentAssignments.length > 0;
  const hasFlags = flagProps.length > 0;

  // Grid: avatar | name | categorical cols | [flags] | [assigned] | arrow
  const gridColumns = [
    "40px",
    "1.5fr",
    ...catProps.map(() => "80px"),
    ...(hasFlags ? ["110px"] : []),
    ...(hasAssignments ? ["90px"] : []),
    "40px",
  ].join(" ");

  // Auto-sort by name
  const sortedStudents = [...students].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return `
      <div class="panel">
        <div class="panel-h" style="padding: 10px 16px;">
          <div style="display: flex; gap: 10px; align-items: center;">
            <div style="position:relative;display:inline-block;">
              <input id="rosterSearch" class="search-input" placeholder="Search students…" oninput="filterStudents(this.value); updateRosterSearchClear()" data-readonly-ok style="padding-right:28px;" />
              <button id="rosterSearchClear" onclick="document.getElementById('rosterSearch').value=''; filterStudents(''); updateRosterSearchClear();" style="display:none;position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--ink-3);font-size:16px;line-height:1;padding:0;width:16px;height:16px;align-items:center;justify-content:center;" title="Clear search">×</button>
            </div>
            <button class="btn sm" onclick="openAddStudentModal()" data-mutates="true">+ Add student</button>
          </div>
          <span class="sub">${students.length} shown</span>
        </div>

        <div class="student-list" style="border-top: 1px solid var(--line-soft); overflow-x: auto;">
          <!-- Header row -->
          <div class="student-row" style="padding: 7px 12px; background: var(--bg-2); cursor: default; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-3); font-weight: 500; display: grid; grid-template-columns: ${gridColumns}; gap: 10px;">
            <div></div>
            <div>Student</div>
            ${catProps.map((p) => `<div style="text-align:center">${p.display_name}</div>`).join("")}
            ${hasFlags ? "<div>Flags</div>" : ""}
            ${hasAssignments ? '<div style="text-align:center">Class</div>' : ""}
            <div></div>
          </div>
          <!-- Student rows -->
          ${sortedStudents
            .map((s) => {
              const initials = s.name
                .split(" ")
                .map((n) => n[0])
                .join("");

              let assignedClass = null;
              if (hasAssignments) {
                const assignment = window.currentAssignments.find(
                  (a) => a.name === s.name,
                );
                if (assignment) assignedClass = assignment.assigned_class;
              }

              const flagsHtml = flagProps
                .filter((p) => s[p.name] === true || s[p.name] === "true")
                .map((p) => {
                  const label =
                    p.display_name === "504 Plan" ? "504" : p.display_name;
                  return `<span class="chip" style="font-size:9px;">${label}</span>`;
                })
                .join("");

              return `
              <div class="student-row" data-student-name="${s.name.replace(/"/g, "&quot;")}" onclick="showStudentDetail(this.getAttribute('data-student-name'))" style="display: grid; grid-template-columns: ${gridColumns}; gap: 10px;">
                <div class="avatar ${s.gender}">${initials}</div>
                <div><div class="sn">${s.name}</div></div>
                ${catProps
                  .map((p) => {
                    const displayValue = formatPropertyValue(p, s[p.name]);
                    return `<div style="text-align: center;">${displayValue}</div>`;
                  })
                  .join("")}
                ${hasFlags ? `<div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">${flagsHtml || "—"}</div>` : ""}
                ${hasAssignments ? `<div style="text-align: center;"><span class="chip" data-class-chip="${assignedClass}" style="font-size: 10px; background: var(--bg-3); font-weight: 600;">${assignedClass ? window.classNames[assignedClass] || `Class ${assignedClass}` : "—"}</span></div>` : ""}
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
      solver_status: window.solverStatus,
      solver_elapsed: window.solverElapsed,
      solver_combinations: window.solverCombinations,
      assignment_config: window.assignmentConfig,
    };
  } else {
    // Fetch fresh from server
    const assignRes = await fetch(`/api/grades/${currentGrade.id}/assignments`);
    assignData = await assignRes.json();
    assignments = assignData.assignments || [];
    // Store assignment config for balance stats and solver metadata
    window.assignmentConfig = assignData.assignment_config;
    window.solverStatus = assignData.solver_status;
    window.solverElapsed = assignData.solver_elapsed;
    window.solverCombinations = assignData.solver_combinations;
  }

  const hasAssignments = assignments.length > 0;

  // Always keep currentStudents fresh for the detail panel
  window.currentStudents = students;
  window.currentTeachers = data.teachers || [];
  window.currentAvailableTeachers = data.available_teachers || [];

  // Cache grade size settings for use in stats (generateCompactBalanceStrip etc.)
  window.gradeMinStudents = data.min_students;
  window.gradeMaxStudents = data.max_students;
  window.gradeEnforceClassSize = data.enforce_class_size === true;

  console.log("DEBUG renderResultsScreen - hasAssignments:", hasAssignments);
  console.log("DEBUG renderResultsScreen - assignData:", assignData);
  console.log(
    "DEBUG renderResultsScreen - solver_status:",
    assignData?.solver_status,
  );

  return `
    <div class="canvas">
      <!-- Page Title -->
      <div class="page-title">
        <h1>${currentGrade.name} <span class="year-label">${config.active_school_year || config.school_year}</span></h1>
      </div>

      <!-- Teacher bar -->
      ${renderTeacherBar(window.currentAvailableTeachers)}

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
          <button class="btn terra" onclick="runAssignment()" data-mutates="true"><i data-lucide="play" style="width:13px;height:13px;display:inline-block;vertical-align:middle;margin-right:4px"></i>${hasAssignments ? "Re-assign" : "Assign"}</button>
        </div>
      </div>

      <!-- Assignment config strip -->
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:14px;padding:8px 12px;background:var(--bg-2);border:1px solid var(--line-soft);border-radius:var(--rad);font-size:12px;">
        <span style="color:var(--ink-3);">Classes <strong style="color:var(--ink);margin-left:4px;">${data.num_classes}</strong></span>
        <span style="color:var(--line);">|</span>
        <span style="color:var(--ink-3);">Students <strong style="color:var(--ink);margin-left:4px;">${students.length}</strong></span>
        <span style="color:var(--line);">|</span>
        <span style="color:var(--ink-3);">Avg <strong style="color:var(--ink);margin-left:4px;">${(students.length / data.num_classes).toFixed(1)}</strong></span>
        <span style="color:var(--line);">|</span>
        <span style="color:var(--ink-3);">Size <strong style="color:var(--ink);margin-left:4px;">${data.min_students}–${data.max_students}</strong><span style="color:var(--ink-4);margin-left:4px;">${data.enforce_class_size ? "hard" : "soft"}</span></span>
        ${
          hasAssignments && assignData?.solver_status === "OPTIMAL"
            ? `
          <span style="color:var(--line);">|</span>
          <span style="display:flex;align-items:center;gap:6px;color:var(--terra);font-weight:600;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="8" r="6"/>
              <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>
            </svg>
            Optimal
          </span>
        `
            : ""
        }
        <button class="btn ghost sm" data-mutates="true" onclick="showGradeSettings('${currentGrade.id}')" style="margin-left:auto;">Edit</button>
      </div>

      ${hasAssignments ? renderAssignmentResults(assignments, data.num_classes, assignData) : renderNoAssignments()}
    </div>
  `;
}

// Toggle between simple and advanced balance stats view
async function toggleBalanceStatsView() {
  window.balanceStatsAdvancedView = !window.balanceStatsAdvancedView;
  // Re-render current screen (merged view)
  await showScreen("students");
}

// Parse incompatible names from any storage format:
// - comma-separated string: "Ryan Lewis, John Smith"
// - Python list string: "['Ryan Lewis', 'John Smith']"
// - actual array: ["Ryan Lewis"]
function parseIncompatNames(incompatible) {
  if (!incompatible) return [];
  if (Array.isArray(incompatible)) return incompatible.map((n) => String(n).trim()).filter(Boolean);
  const s = String(incompatible).trim();
  if (!s || s === "[]") return [];
  if (s.startsWith("[")) {
    const matches = s.match(/['"]([^'"]+)['"]/g);
    if (matches) return matches.map((m) => m.replace(/['"]/g, "").trim()).filter(Boolean);
  }
  return s.split(",").map((n) => n.trim()).filter(Boolean);
}

// Generate minimal balance statistics view
function generateMinimalStats(
  propertiesToAnalyze,
  classesList,
  relationshipStatsHTML,
  configAtAssignment,
  assignmentConfig,
) {
  // Helper to check if a property weight has changed since assignment
  const hasWeightChanged = (propName, currentWeight) => {
    if (!assignmentConfig) return false;
    const currentProp = config.properties?.find((p) => p.name === propName);
    const assignmentProp = assignmentConfig.properties?.find(
      (p) => p.name === propName,
    );
    if (!currentProp || !assignmentProp) return false;
    return currentProp.weight !== assignmentProp.weight;
  };

  // Group properties by weight (priority)
  const getConstraintLevel = (weight) => {
    if (weight >= 100) return { label: "Critical", order: 1 };
    if (weight >= 80) return { label: "High", order: 2 };
    if (weight >= 60) return { label: "Medium", order: 3 };
    if (weight >= 40) return { label: "Mild", order: 4 };
    return { label: "Mild", order: 4 };
  };

  // Add hard constraints first
  const hardConstraints = [];

  // Check for incompatibilities
  const allStudents = classesList.flatMap((cls) => cls.students);
  const studentsWithIncompat = allStudents.filter(
    (s) => parseIncompatNames(s.incompatible).length > 0,
  );
  if (studentsWithIncompat.length > 0) {
    const violationPairs = new Set();
    classesList.forEach((cls) => {
      const nameSet = new Set(cls.students.map((s) => s.name));
      cls.students.forEach((student) => {
        parseIncompatNames(student.incompatible).forEach((incompName) => {
          if (nameSet.has(incompName)) {
            violationPairs.add([student.name, incompName].sort().join("|||"));
          }
        });
      });
    });
    hardConstraints.push({
      name: "Incompatibility separation",
      isMandatory: true,
      violated: violationPairs.size > 0,
      violationCount: violationPairs.size,
      level: { label: "Mandatory requirements", order: 0 },
    });
  }

  // Check for teacher uniqueness (hard_toggle type)
  const teacherUniqueness = config.properties?.find(
    (p) => p.type === "hard_toggle" && p.enabled,
  );
  if (teacherUniqueness) {
    hardConstraints.push({
      name: teacherUniqueness.display_name || "Teacher uniqueness",
      isMandatory: true,
      level: { label: "Mandatory requirements", order: 0 },
    });
  }

  // Process each property and calculate its optimization percentage
  const propertyStats = propertiesToAnalyze
    .map((prop) => {
      const propName = prop.name;
      const displayName = prop.display_name;
      const weight = prop.weight || 20;
      const level = getConstraintLevel(weight);
      const weightChanged = hasWeightChanged(propName, weight);

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
      if (!hasData) return null;

      // Get all unique values across all classes
      const allValues = new Set();
      classBreakdowns.forEach((cb) =>
        Object.keys(cb.counts).forEach((v) => allValues.add(v)),
      );

      // Calculate optimization percentage (0-100%)
      let totalOptimality = 0;
      let valueCount = 0;

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

        // Calculate theoretical minimum variance
        const numClasses = countsForValue.length;
        const baseCount = Math.floor(totalCount / numClasses);
        const remainder = totalCount % numClasses;
        const bestCaseDistribution = new Array(numClasses).fill(baseCount);
        for (let i = 0; i < remainder; i++) {
          bestCaseDistribution[i]++;
        }
        const minVariance =
          bestCaseDistribution.reduce(
            (sum, count) => sum + Math.pow(count - avg, 2),
            0,
          ) / bestCaseDistribution.length;
        const minStdDev = Math.sqrt(minVariance);

        // Calculate theoretical maximum variance
        const worstCaseDistribution = new Array(numClasses).fill(0);
        worstCaseDistribution[0] = totalCount;
        const maxVariance =
          worstCaseDistribution.reduce(
            (sum, count) => sum + Math.pow(count - avg, 2),
            0,
          ) / worstCaseDistribution.length;
        const maxStdDev = Math.sqrt(maxVariance);

        // Calculate optimality (0-100%, where 100% = perfect)
        const range = maxStdDev - minStdDev;
        const optimality =
          range > 0
            ? Math.max(0, Math.min(100, ((maxStdDev - stdDev) / range) * 100))
            : 100;

        totalOptimality += optimality;
        valueCount++;
      });

      const avgOptimality = valueCount > 0 ? totalOptimality / valueCount : 0;

      return {
        name: displayName,
        weight,
        level,
        optimality: avgOptimality,
        isMandatory: false, // Soft constraints are never truly mandatory
        weightChanged,
      };
    })
    .filter(Boolean);

  // Add class size — hard goes to mandatory, soft goes to property stats
  const _csMin = window.gradeMinStudents;
  const _csMax = window.gradeMaxStudents;
  const _csEnforce = window.gradeEnforceClassSize;
  if (_csMin != null && _csMax != null) {
    const _sizeViolations = classesList.filter(
      (cls) => cls.students.length < _csMin || cls.students.length > _csMax,
    ).length;
    if (_csEnforce) {
      hardConstraints.push({
        name: `Class size (${_csMin}–${_csMax})`,
        isMandatory: true,
        violated: _sizeViolations > 0,
        violationCount: _sizeViolations,
        level: { label: "Mandatory requirements", order: 0 },
      });
    } else {
      const _pct = classesList.length > 0
        ? ((classesList.length - _sizeViolations) / classesList.length) * 100
        : 100;
      propertyStats.push({
        name: `Class size (${_csMin}–${_csMax})`,
        level: { label: "Mild", order: 4 },
        optimality: _pct,
        isMandatory: false,
        weightChanged: false,
      });
    }
  }

  // Group by constraint level
  const grouped = {};

  // Add hard constraints first
  hardConstraints.forEach((stat) => {
    const levelLabel = stat.level.label;
    if (!grouped[levelLabel]) {
      grouped[levelLabel] = { order: stat.level.order, stats: [] };
    }
    grouped[levelLabel].stats.push(stat);
  });

  // Add soft constraints
  propertyStats.forEach((stat) => {
    const levelLabel = stat.level.label;
    if (!grouped[levelLabel]) {
      grouped[levelLabel] = { order: stat.level.order, stats: [] };
    }
    grouped[levelLabel].stats.push(stat);
  });

  // Sort groups by order and generate HTML
  const sortedGroups = Object.entries(grouped).sort(
    (a, b) => a[1].order - b[1].order,
  );

  const groupsHTML = sortedGroups
    .map(([label, data]) => {
      const statsHTML = data.stats
        .map((stat) => {
          const optimality =
            stat.optimality !== undefined ? stat.optimality : 100;
          const isMandatory = stat.isMandatory;

          // Color based on optimality
          let barColor = "var(--terra)";
          if (!isMandatory) {
            if (optimality < 70) barColor = "var(--amber)";
            if (optimality < 50) barColor = "var(--rose)";
          } else if (stat.violated) {
            barColor = "var(--rose)";
          }

          const mandatoryLabel = stat.violated
            ? `✗ ${stat.violationCount} violation${stat.violationCount !== 1 ? "s" : ""}`
            : "✓ Met";
          const mandatoryColor = stat.violated ? "var(--rose)" : "var(--terra)";

          return `
        <div style="margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 13px; font-weight: 500; color: var(--ink);">${stat.name}</span>
              ${stat.weightChanged ? '<span title="Weight changed since assignment" style="display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border-radius: 50%; background: var(--amber-soft); color: var(--amber-ink); font-size: 9px; font-weight: 700;">!</span>' : ""}
            </div>
            <span style="font-size: 11px; font-family: var(--t-mono); color: ${isMandatory ? mandatoryColor : "var(--ink-3)"}; font-weight: 600;">
              ${isMandatory ? mandatoryLabel : Math.round(optimality) + "% optimal"}
            </span>
          </div>
          <div style="height: 6px; background: var(--bg-2); border-radius: 3px; overflow: hidden;">
            <div style="height: 100%; width: ${isMandatory ? 100 : optimality}%; background: ${barColor}; border-radius: 3px; transition: width 0.3s;"></div>
          </div>
        </div>
      `;
        })
        .join("");

      return `
      <div style="margin-bottom: 20px;">
        <h4 style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-3); margin-bottom: 12px; font-weight: 600;">
          ${label}
        </h4>
        ${statsHTML}
      </div>
    `;
    })
    .join("");

  // Calculate friendship stats for minimal view
  let relationshipHTML = "";
  // allStudents already declared above
  const studentsWithFriendsDefined_minimal = allStudents.filter((s) => {
    const friends = s.friends;
    return friends && friends.length > 0 && friends !== "[]";
  }).length;
  if (allStudents.some((s) => "has_friend_in_class" in s) && studentsWithFriendsDefined_minimal > 0) {
    const studentsWithFriendsDefined = studentsWithFriendsDefined_minimal;

    const totalWithFriend = allStudents.filter(
      (s) => s.has_friend_in_class,
    ).length;
    const achievementRate =
      studentsWithFriendsDefined > 0
        ? (totalWithFriend / studentsWithFriendsDefined) * 100
        : 0;

    // Color based on achievement rate
    let barColor = "var(--terra)";
    if (achievementRate < 70) barColor = "var(--amber)";
    if (achievementRate < 50) barColor = "var(--rose)";

    relationshipHTML = `
      <div style="margin-bottom: 20px;">
        <h4 style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-3); margin-bottom: 12px; font-weight: 600;">
          Relationships
        </h4>
        <div style="margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 13px; font-weight: 500; color: var(--ink);">Friendships</span>
            <span style="font-size: 11px; font-family: var(--t-mono); color: var(--ink-3); font-weight: 600;">
              ${Math.round(achievementRate)}% placed
            </span>
          </div>
          <div style="height: 6px; background: var(--bg-2); border-radius: 3px; overflow: hidden;">
            <div style="height: 100%; width: ${achievementRate}%; background: ${barColor}; border-radius: 3px; transition: width 0.3s;"></div>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="panel" style="max-width: 800px;">
      <div class="panel-b">
        ${groupsHTML}
        ${relationshipHTML}
      </div>
    </div>
  `;
}

// Generate compact balance statistics strip
function generateCompactBalanceStrip(
  propertiesToAnalyze,
  classesList,
  configAtAssignment,
  assignmentConfig,
) {
  // Group properties by weight (priority)
  const getConstraintLevel = (weight) => {
    if (weight >= 100) return { label: "CRITICAL", order: 1 };
    if (weight >= 80) return { label: "HIGH", order: 2 };
    if (weight >= 60) return { label: "MEDIUM", order: 3 };
    return { label: "MEDIUM", order: 3 };
  };

  // Add hard constraints first
  const hardConstraints = [];

  // Check for incompatibilities
  const allStudents = classesList.flatMap((cls) => cls.students);
  const studentsWithIncompat = allStudents.filter(
    (s) => parseIncompatNames(s.incompatible).length > 0,
  );
  if (studentsWithIncompat.length > 0) {
    const violationPairs = new Set();
    classesList.forEach((cls) => {
      const nameSet = new Set(cls.students.map((s) => s.name));
      cls.students.forEach((student) => {
        parseIncompatNames(student.incompatible).forEach((incompName) => {
          if (nameSet.has(incompName)) {
            violationPairs.add([student.name, incompName].sort().join("|||"));
          }
        });
      });
    });
    hardConstraints.push({
      name: "Incompatibility",
      isMandatory: true,
      violated: violationPairs.size > 0,
      violationCount: violationPairs.size,
      level: { label: "MANDATORY", order: 0 },
    });
  }

  // Check for teacher uniqueness (hard_toggle type)
  const teacherUniqueness = config.properties?.find(
    (p) => p.type === "hard_toggle" && p.enabled,
  );
  if (teacherUniqueness) {
    hardConstraints.push({
      name: "Unique teacher",
      isMandatory: true,
      level: { label: "MANDATORY", order: 0 },
    });
  }

  // Process each property and calculate its optimization percentage
  const propertyStats = propertiesToAnalyze
    .map((prop) => {
      const propName = prop.name;
      const displayName = prop.display_name;
      const weight = prop.weight || 20;
      const level = getConstraintLevel(weight);

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
      if (!hasData) return null;

      // Get all unique values across all classes
      const allValues = new Set();
      classBreakdowns.forEach((cb) =>
        Object.keys(cb.counts).forEach((v) => allValues.add(v)),
      );

      // Calculate optimization percentage (0-100%)
      let totalOptimality = 0;
      let valueCount = 0;

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

        // Calculate theoretical minimum variance
        const numClasses = countsForValue.length;
        const baseCount = Math.floor(totalCount / numClasses);
        const remainder = totalCount % numClasses;
        const bestCaseDistribution = new Array(numClasses).fill(baseCount);
        for (let i = 0; i < remainder; i++) {
          bestCaseDistribution[i]++;
        }
        const minVariance =
          bestCaseDistribution.reduce(
            (sum, count) => sum + Math.pow(count - avg, 2),
            0,
          ) / bestCaseDistribution.length;
        const minStdDev = Math.sqrt(minVariance);

        // Calculate theoretical maximum variance
        const worstCaseDistribution = new Array(numClasses).fill(0);
        worstCaseDistribution[0] = totalCount;
        const maxVariance =
          worstCaseDistribution.reduce(
            (sum, count) => sum + Math.pow(count - avg, 2),
            0,
          ) / worstCaseDistribution.length;
        const maxStdDev = Math.sqrt(maxVariance);

        // Calculate optimality (0-100%, where 100% = perfect)
        const range = maxStdDev - minStdDev;
        const optimality =
          range > 0
            ? Math.max(0, Math.min(100, ((maxStdDev - stdDev) / range) * 100))
            : 100;

        totalOptimality += optimality;
        valueCount++;
      });

      const avgOptimality = valueCount > 0 ? totalOptimality / valueCount : 0;

      return {
        name: displayName,
        level,
        optimality: avgOptimality,
        isMandatory: false,
      };
    })
    .filter(Boolean);

  // Add class size — hard goes to mandatory, soft goes to property stats
  const csMin = window.gradeMinStudents;
  const csMax = window.gradeMaxStudents;
  const csEnforce = window.gradeEnforceClassSize;
  if (csMin != null && csMax != null) {
    const sizeViolations = classesList.filter(
      (cls) => cls.students.length < csMin || cls.students.length > csMax,
    ).length;
    if (csEnforce) {
      hardConstraints.push({
        name: `Class size (${csMin}–${csMax})`,
        isMandatory: true,
        violated: sizeViolations > 0,
        violationCount: sizeViolations,
        level: { label: "MANDATORY", order: 0 },
      });
    } else {
      const pct = classesList.length > 0
        ? ((classesList.length - sizeViolations) / classesList.length) * 100
        : 100;
      propertyStats.push({
        name: `Class size (${csMin}–${csMax})`,
        level: { label: "MEDIUM", order: 3 },
        optimality: pct,
        isMandatory: false,
      });
    }
  }

  // Group by constraint level
  const grouped = {};

  // Add hard constraints first
  hardConstraints.forEach((stat) => {
    const levelLabel = stat.level.label;
    if (!grouped[levelLabel]) {
      grouped[levelLabel] = { order: stat.level.order, stats: [] };
    }
    grouped[levelLabel].stats.push(stat);
  });

  // Add soft constraints
  propertyStats.forEach((stat) => {
    const levelLabel = stat.level.label;
    if (!grouped[levelLabel]) {
      grouped[levelLabel] = { order: stat.level.order, stats: [] };
    }
    grouped[levelLabel].stats.push(stat);
  });

  // Add newly-enabled properties not present in the historical config
  if (assignmentConfig && typeof config !== "undefined") {
    const historicalNames = new Set(
      (assignmentConfig.properties || [])
        .filter((p) => p.enabled && p.type !== "relationship")
        .map((p) => p.name)
    );
    const newProps = (config.properties || []).filter(
      (p) => p.enabled && p.type !== "relationship" && !historicalNames.has(p.name)
    );
    if (newProps.length > 0) {
      if (!grouped["NEW"]) grouped["NEW"] = { order: 99, stats: [] };
      newProps.forEach((p) => {
        grouped["NEW"].stats.push({ name: p.display_name, isNA: true });
      });
    }
  }

  // Add friendship stats
  const studentsWithFriendsDefined_compact = allStudents.filter((s) => {
    const friends = s.friends;
    return friends && friends.length > 0 && friends !== "[]";
  }).length;
  if (allStudents.some((s) => "has_friend_in_class" in s) && studentsWithFriendsDefined_compact > 0) {
    const studentsWithFriendsDefined = studentsWithFriendsDefined_compact;

    const totalWithFriend = allStudents.filter(
      (s) => s.has_friend_in_class,
    ).length;
    const achievementRate =
      studentsWithFriendsDefined > 0
        ? (totalWithFriend / studentsWithFriendsDefined) * 100
        : 0;

    if (!grouped["RELATIONSHIPS"]) {
      grouped["RELATIONSHIPS"] = { order: 10, stats: [] };
    }
    grouped["RELATIONSHIPS"].stats.push({
      name: "Friendships",
      optimality: achievementRate,
      isMandatory: false,
    });
  }

  // Sort groups by order and generate HTML
  const sortedGroups = Object.entries(grouped).sort(
    (a, b) => a[1].order - b[1].order,
  );

  // Generate grouped sections
  const groupSections = sortedGroups
    .map(([label, data]) => {
      const statsRows = data.stats
        .map((stat) => {
          const optimality =
            stat.optimality !== undefined ? stat.optimality : 100;
          const isMandatory = stat.isMandatory;

          // N/A row for newly-enabled properties
          if (stat.isNA) {
            return `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid var(--line-soft);">
            <span style="font-size: 12px; color: var(--ink-3);">${stat.name}</span>
            <span style="font-size: 11px; color: var(--ink-4); font-family: var(--t-mono);">N/A</span>
          </div>
        `;
          }

          // Status indicator
          let status = "";
          let statusColor = "var(--ink-3)";
          if (isMandatory) {
            if (stat.violated) {
              status = `✗ ${stat.violationCount}`;
              statusColor = "var(--rose)";
            } else {
              status = "✓ Met";
              statusColor = "var(--sage)";
            }
          } else {
            const rounded = Math.round(optimality);
            if (rounded === 100) {
              status = "✓ Optimal";
              statusColor = "var(--sage)";
            } else {
              status = `${rounded}%`;
              if (optimality >= 85) {
                statusColor = "var(--sage)";
              } else if (optimality >= 60) {
                statusColor = "var(--amber)";
              } else {
                statusColor = "var(--terra)";
              }
            }
          }

          return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid var(--line-soft);">
          <span style="font-size: 12px; color: var(--ink);">${stat.name}</span>
          <span style="font-size: 11px; font-weight: 600; color: ${statusColor}; font-family: var(--t-mono);">${status}</span>
        </div>
      `;
        })
        .join("");

      return `
      <div>
        <div style="padding: 6px 12px; background: var(--bg-2); border-bottom: 1px solid var(--line-soft);">
          <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-4); font-weight: 600;">
            ${label}
          </div>
        </div>
        ${statsRows}
      </div>
    `;
    })
    .join("");

  return `
    <div class="panel" style="flex: 0 0 200px; position: sticky; left: 0; z-index: 5; background: var(--panel);">
      <div class="panel-h">
        <div style="display: flex; align-items: center; gap: 8px;">
          <h3 style="margin: 0;">Assignment Results</h3>
          <button onclick="showBalanceStatsModal()" style="background: none; border: 1px solid var(--line); border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 11px; color: var(--ink-3); transition: all 0.15s;" onmouseover="this.style.borderColor='var(--ink)'; this.style.color='var(--ink)';" onmouseout="this.style.borderColor='var(--line)'; this.style.color='var(--ink-3)';">?</button>
        </div>
      </div>
      <div class="panel-b" style="padding: 0;">
        ${groupSections}
      </div>
    </div>
  `;
}

// Calculate balance statistics for assignments
function calculateBalanceStats(classesList) {
  if (!classesList || classesList.length === 0) return "";

  // Check if we should show advanced view
  const showAdvanced = window.balanceStatsAdvancedView || false;

  // Use assignment config if available (historical), otherwise current config
  const assignmentConfig = window.assignmentConfig;
  const configToUse = assignmentConfig || config;

  // Collect all properties to analyze (from enabled config at assignment time)
  const propertiesToAnalyze =
    configToUse.properties?.filter(
      (p) => p.enabled && p.type !== "relationship",
    ) || [];

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
      let balanceScore = "Optimal";
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
                ${window.classNames[cls.number] || `Class ${cls.number}`}
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

  // Generate minimal stats view
  const minimalStats = generateMinimalStats(
    propertiesToAnalyze,
    classesList,
    relationshipStats,
    configToUse,
    assignmentConfig,
  );

  return `
    <div style="margin-bottom: 24px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
        <h2 style="margin: 0;">Balance Statistics</h2>
        <button onclick="showBalanceExplanationModal()" style="background: none; border: 1px solid var(--line); border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 11px; color: var(--ink-3); transition: all 0.15s;" onmouseover="this.style.borderColor='var(--ink)'; this.style.color='var(--ink)';" onmouseout="this.style.borderColor='var(--line)'; this.style.color='var(--ink-3)';">?</button>
        <button onclick="toggleBalanceStatsView()" style="padding: 4px 10px; font-size: 11px; background: var(--bg-2); border: 1px solid var(--line); border-radius: var(--rad); cursor: pointer; color: var(--ink-3); transition: all 0.15s;" onmouseover="this.style.background='var(--panel)'; this.style.color='var(--ink)';" onmouseout="this.style.background='var(--bg-2)'; this.style.color='var(--ink-3)';">
          ${showAdvanced ? "Simple view" : "Advanced metrics"}
        </button>
      </div>
      ${
        showAdvanced
          ? `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin-bottom: 24px;">
          ${statCards}
          ${relationshipStats}
        </div>
      `
          : minimalStats
      }
    </div>
  `;
}

// Calculate friendship and incompatibility statistics
function calculateRelationshipStats(classesList) {
  if (!classesList || classesList.length === 0) return "";

  const allStudents = classesList.flatMap((cls) => cls.students);

  // Friendship satisfaction stats
  let friendshipHTML = "";
  const studentsWithFriendsDefined = allStudents.filter((s) => {
    const friends = s.friends;
    return friends && friends.length > 0 && friends !== "[]";
  }).length;

  if (allStudents.some((s) => "has_friend_in_class" in s) && studentsWithFriendsDefined > 0) {
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
                ${window.classNames[cls.number] || `Class ${cls.number}`}
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
    (s) => parseIncompatNames(s.incompatible).length > 0,
  );

  if (studentsWithIncompat.length > 0) {
    // Build unique pairs to avoid double-counting mutual incompatibilities
    const uniquePairs = new Set();
    allStudents.forEach((student) => {
      parseIncompatNames(student.incompatible).forEach((incompName) => {
        const pair = [student.name, incompName].sort().join("|||");
        uniquePairs.add(pair);
      });
    });

    // Check for violations
    const violations = [];
    const violationPairs = new Set();
    classesList.forEach((cls) => {
      const studentsInClass = cls.students;
      const nameSet = new Set(studentsInClass.map((s) => s.name));

      studentsInClass.forEach((student) => {
        parseIncompatNames(student.incompatible).forEach((incompName) => {
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
      });
    });

    const totalPairs = uniquePairs.size;
    const violationCount = violations.length;
    const successRate =
      totalPairs > 0 ? ((totalPairs - violationCount) / totalPairs) * 100 : 100;

    let qualityColor = violationCount === 0 ? "var(--terra)" : "var(--rose)";
    let qualityLabel = violationCount === 0 ? "Optimal" : "VIOLATIONS";

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

  // Teacher uniqueness stats
  let teacherUniquenessHTML = "";
  const teachers = window.currentTeachers || [];
  const hasTeachers = teachers.some((t) => t && t.trim());

  if (hasTeachers) {
    // Helper to parse previous_teachers regardless of storage format
    function parsePrevTeachers(prev) {
      if (!prev) return [];
      if (Array.isArray(prev))
        return prev.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
      const s = String(prev).trim();
      if (s.startsWith("[")) {
        try {
          const match = s.match(/['"]([^'"]+)['"]/g);
          if (match)
            return match
              .map((m) => m.replace(/['"]/g, "").trim().toLowerCase())
              .filter(Boolean);
        } catch (e) {}
      }
      return s
        .split(/[|,]/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
    }

    const violations = [];
    classesList.forEach((cls) => {
      const teacher = (teachers[cls.number - 1] || "").trim();
      if (!teacher) return;
      cls.students.forEach((s) => {
        const prev = parsePrevTeachers(s.previous_teachers);
        if (prev.includes(teacher.toLowerCase())) {
          violations.push({ student: s.name, teacher, classNum: cls.number });
        }
      });
    });

    const totalStudents = classesList.reduce(
      (sum, cls) => sum + cls.students.length,
      0,
    );
    const violationCount = violations.length;
    const qualityColor = violationCount === 0 ? "var(--terra)" : "var(--rose)";
    const qualityLabel = violationCount === 0 ? "Optimal" : "Violations";

    teacherUniquenessHTML = `
      <div class="panel">
        <div class="panel-h">
          <div>
            <h3>Teacher Uniqueness</h3>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="sub" style="color: ${qualityColor};">${qualityLabel}</span>
              <span style="font-size: 12px; font-family: var(--t-mono); color: var(--ink-3);">${totalStudents} students</span>
            </div>
          </div>
        </div>
        <div class="panel-b" style="font-size: 12px;">
          ${
            violationCount === 0
              ? `
            <div style="padding: 8px; background: var(--terra-soft); border-radius: 4px; border: 1px solid var(--terra);">
              <div style="font-weight: 600; color: var(--terra);">All students have new teachers</div>
              <div style="font-size: 11px; color: var(--ink-3); margin-top: 4px;">No student is placed with a previously-had teacher</div>
            </div>
          `
              : `
            <div style="padding: 8px; background: var(--rose-soft); border-radius: 4px; border: 1px solid var(--rose); margin-bottom: 8px;">
              <div style="font-weight: 600; color: var(--rose); margin-bottom: 4px;">${violationCount} student${violationCount !== 1 ? "s" : ""} placed with previous teacher</div>
              ${violations
                .slice(0, 4)
                .map(
                  (v) => `
                <div style="font-size: 11px; color: var(--ink); margin-top: 4px;">
                  • ${v.student} → ${v.teacher} (Class ${v.classNum})
                </div>
              `,
                )
                .join("")}
              ${violations.length > 4 ? `<div style="font-size: 11px; color: var(--ink-3); margin-top: 4px;">... and ${violations.length - 4} more</div>` : ""}
            </div>
          `
          }
          <div style="display: flex; gap: 4px; margin-top: 8px;">
            ${classesList
              .map((cls) => {
                const teacher = (teachers[cls.number - 1] || "").trim();
                if (!teacher)
                  return `<div style="flex:1;text-align:center;font-size:10px;color:var(--ink-4);">—</div>`;
                const classViolations = violations.filter(
                  (v) => v.classNum === cls.number,
                ).length;
                const bg =
                  classViolations > 0 ? "var(--rose-soft)" : "var(--bg-2)";
                return `
                <div style="flex:1;text-align:center;padding:4px 2px;background:${bg};border-radius:4px;">
                  <div style="font-size:10px;font-weight:500;color:var(--ink);">${teacher
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}</div>
                  ${classViolations > 0 ? `<div style="font-size:9px;color:var(--rose);">${classViolations}✕</div>` : `<div style="font-size:9px;color:var(--terra);">✓</div>`}
                </div>
              `;
              })
              .join("")}
          </div>
          <div style="display: flex; gap: 4px; margin-top: 4px; padding-top: 6px; border-top: 1px solid var(--line-soft);">
            ${classesList
              .map(
                (cls) => `
              <div style="flex: 1; text-align: center; font-size: 10px; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.05em;">
                ${window.classNames[cls.number] || `Class ${cls.number}`}
              </div>
            `,
              )
              .join("")}
          </div>
        </div>
      </div>
    `;
  }

  return friendshipHTML + incompatibilityHTML + teacherUniquenessHTML;
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
  selectedAssignmentStudent = null;
  // If no baseline exists yet, treat current assignments as baseline
  window.solverBaseline = assignData?.solver_baseline || assignments;
  window.numClasses = numClasses;
  window.editMode = window.editMode || false;
  window.hasUnsavedChanges = window.hasUnsavedChanges || false;

  // Calculate balance statistics
  const balanceStats = calculateBalanceStats(classesList);

  // Generate compact balance strip
  const assignmentConfig = window.assignmentConfig;
  const configToUse = assignmentConfig || config;
  const propertiesToAnalyze =
    configToUse.properties?.filter(
      (p) => p.enabled && p.type !== "relationship",
    ) || [];
  const compactBalanceStrip = generateCompactBalanceStrip(
    propertiesToAnalyze,
    classesList,
    configToUse,
    assignmentConfig,
  );

  const hasBaseline = window.solverBaseline && window.solverBaseline.length > 0;
  const isOptimal = assignData?.solver_status === "OPTIMAL";
  const solverElapsed = assignData?.solver_elapsed;
  const solverCombinations = assignData?.solver_combinations;

  return `

    <!-- Edit Mode Controls -->
    ${
      hasBaseline
        ? `
      <div id="editModeBar" style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding: 12px 16px; background: ${window.hasUnsavedChanges ? "var(--amber-soft, var(--bg-2))" : "var(--bg-2)"}; border-radius: var(--rad); border: 1px solid ${window.hasUnsavedChanges ? "var(--amber, var(--line-soft))" : "var(--line-soft)"};">
        <div style="flex: 1; display: flex; align-items: center; gap: 12px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;" data-mutates="true">
            <input type="checkbox" id="editModeToggle" ${window.editMode ? "checked" : ""} onchange="toggleEditMode(this.checked)" style="width: 16px; height: 16px; cursor: pointer;" data-mutates="true">
            <span style="font-weight: 500; color: var(--ink);">Edit Mode</span>
          </label>
          ${
            window.hasUnsavedChanges && !window.editMode
              ? `<span id="editModeStatus" style="font-size: 11px; color: var(--amber, var(--ink-3)); font-weight: 500;">● Unsaved changes</span>`
              : `<span id="editModeStatus" style="font-size: 11px; color: var(--ink-3);">Enable to manually adjust class assignments</span>`
          }
        </div>
        <div id="editModeActions" style="display: ${window.editMode || window.hasUnsavedChanges ? "flex" : "none"}; gap: 8px;">
          <button class="btn ghost sm" onclick="revertToSolver()" ${!window.hasUnsavedChanges ? "disabled" : ""}>Revert</button>
          <button class="btn primary sm" onclick="saveManualChanges()" data-mutates="true" ${!window.hasUnsavedChanges ? "disabled" : ""}>Save Changes</button>
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
    <div style="display: flex; flex-direction: row; overflow-x: auto; gap: 16px; margin-bottom: 32px; padding-bottom: 8px;" id="classCardsContainer">

      <!-- Balance Stats Box (Class 0) -->
      ${compactBalanceStrip}

      ${renderClassCardsHTML(classesList)}
    </div>
  `;
}

// Render class cards HTML (extracted for targeted refresh after drag/drop)
function renderClassCardsHTML(classesList) {
  return classesList
    .map(
      (cls) => `
    <div class="panel" style="flex: 0 0 260px;">
      <div class="panel-h">
        <div>
          <h3 style="cursor:pointer;" title="Click to rename" onclick="startClassNameEdit(this, ${cls.number})">${window.classNames[cls.number] || `Class ${cls.number}`}</h3>
          <div class="teacher-label" data-class-number="${cls.number}" onclick="startTeacherEdit(this, ${cls.number})" style="font-size:11px; color:${window.currentTeachers[cls.number - 1] ? "var(--ink-3)" : "var(--ink-4)"}; cursor:pointer; margin-top:1px;">
            ${window.currentTeachers[cls.number - 1] || "+ Add teacher"}
          </div>
        </div>
        <span class="sub class-count">${cls.students.length} students</span>
      </div>
      <div class="panel-b class-drop-zone" data-class-number="${cls.number}" ondrop="handleDrop(event)" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" style="padding: 0;">
        <div class="student-list">
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
                   onclick="showStudentDetail('${s.name.replace(/'/g, "\\'")}')"
                   onmouseenter="showAssignmentHighlight('${s.name.replace(/'/g, "\\'")}')"
                   onmouseleave="clearAssignmentHighlight()"
                   style="display: flex; align-items: flex-start; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--line-soft); cursor: ${window.editMode ? "move" : "pointer"};">
                ${window.editMode ? '<div style="color: var(--ink-4); font-size: 14px; line-height: 22px; opacity: 0.6; align-self: center;">⋮⋮</div>' : ""}
                <div class="avatar ${s.gender}" style="align-self: center;">${initials}</div>
                <div style="flex: 1; min-width: 0;">
                  <div class="sn">${s.name}</div>
                  ${(() => {
                    const catProps = (config.properties || []).filter(
                      (p) =>
                        p.enabled &&
                        p.type !== "boolean" &&
                        p.type !== "relationship" &&
                        p.type !== "hard_toggle" &&
                        p.name !== "gender",
                    );
                    const chips = catProps
                      .filter(
                        (p) =>
                          s[p.name] &&
                          s[p.name] !== "m" &&
                          s[p.name] !== "neutral",
                      )
                      .map((p) => {
                        const v = s[p.name];
                        const isHigh = v === "h" || v === "high";
                        const isLow = v === "l" || v === "low";
                        if (!isHigh && !isLow) return "";
                        const abbrev = { behavior: "BEH", independence: "IND", math: "MATH", reading: "READ" };
                        const label = abbrev[p.name] || p.display_name.slice(0, 4).toUpperCase();
                        const invertedProps = ["behavior"];
                        const isInverted = invertedProps.includes(p.name);
                        let bg;
                        if (isHigh) {
                          bg = isInverted ? "var(--rose-soft)" : "var(--sage-soft)";
                        } else {
                          bg = isInverted ? "var(--sage-soft)" : "var(--rose-soft)";
                        }
                        return `<span class="chip" style="font-size:8px;padding:1px 4px;background:${bg};">${label}</span>`;
                      })
                      .join("");
                    return chips
                      ? `<div class="student-meta-chips" style="display:flex;gap:3px;flex-wrap:wrap;margin-top:2px;">${chips}</div>`
                      : "";
                  })()}
                </div>
                <div class="student-flag-chips" style="display:flex; gap:3px; flex-shrink:0;">
                  ${s.iep ? '<span class="chip" style="font-size: 9px;">IEP</span>' : ""}
                  ${s["504"] ? '<span class="chip" style="font-size: 9px;">504</span>' : ""}
                  ${s.esl ? '<span class="chip" style="font-size: 9px;">ESL</span>' : ""}
                  ${s.gate ? '<span class="chip" style="font-size: 9px;">GATE</span>' : ""}
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
    .join("");
}

// Targeted refresh of just the class cards container — avoids full page re-render and server fetch
function refreshClassCardsContainer() {
  console.time("refreshClassCards");
  const assignments = window.currentAssignments || [];
  const numClasses = window.numClasses || 0;

  const classesList = Array.from({ length: numClasses }, (_, i) => ({
    number: i + 1,
    students: assignments.filter((a) => a.assigned_class === i + 1),
  }));

  const configToUse = window.assignmentConfig || config;
  const propertiesToAnalyze = configToUse.properties?.filter(
    (p) => p.enabled && p.type !== "relationship",
  ) || [];

  console.time("generateStats");
  const compactBalanceStrip = generateCompactBalanceStrip(
    propertiesToAnalyze,
    classesList,
    configToUse,
    window.assignmentConfig,
  );
  console.timeEnd("generateStats");

  console.time("renderHTML");
  const html = compactBalanceStrip + renderClassCardsHTML(classesList);
  console.timeEnd("renderHTML");

  const container = document.getElementById("classCardsContainer");
  console.time("setInnerHTML");
  if (container) {
    container.innerHTML = html;
    renderIcons();
  }
  console.timeEnd("setInnerHTML");

  // Update edit mode bar styling to reflect unsaved changes
  const editBar = document.getElementById("editModeBar");
  if (editBar && window.hasUnsavedChanges) {
    editBar.style.background = "var(--amber-soft, var(--bg-2))";
    editBar.style.borderColor = "var(--amber, var(--line-soft))";
    const statusSpan = document.getElementById("editModeStatus");
    if (statusSpan) {
      statusSpan.style.color = "var(--amber, var(--ink-3))";
      statusSpan.style.fontWeight = "500";
      statusSpan.textContent = "● Unsaved changes";
    }
  }

  // Show actions and update button states
  const actionsDiv = document.getElementById("editModeActions");
  if (actionsDiv) {
    actionsDiv.style.display = window.editMode || window.hasUnsavedChanges ? "flex" : "none";
    const saveBtn = actionsDiv.querySelector("button.primary");
    const revertBtn = actionsDiv.querySelector("button.ghost");
    if (saveBtn) saveBtn.disabled = !window.hasUnsavedChanges;
    if (revertBtn) revertBtn.disabled = !window.hasUnsavedChanges;
  }

  applyAssignmentFilters();

  // Update "No friends" pill count
  const noFriendsBtn = document.querySelector('[data-filter-flag="no_friends"]');
  if (noFriendsBtn) {
    const count = (window.currentAssignments || []).filter((s) => {
      const hasFriendsDefined = s.friends && s.friends.length > 0 && s.friends !== "[]";
      const hasFriendInClass = s.has_friend_in_class === 1 || s.has_friend_in_class === true;
      return hasFriendsDefined && !hasFriendInClass;
    }).length;
    if (count === 0) {
      noFriendsBtn.style.display = "none";
    } else {
      noFriendsBtn.style.display = "";
      noFriendsBtn.innerHTML = `No friends <span style="opacity:0.6;font-size:10px;">${count}</span>`;
    }
  }
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

async function saveClassName(classNumber, name) {
  window.classNames[classNumber] = name;
  await fetch(`/api/grades/${currentGrade.id}/class-names`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ class_names: window.classNames }),
  });
}

function startClassNameEdit(el, classNumber) {
  const current = window.classNames[classNumber] || `Class ${classNumber}`;
  const input = document.createElement("input");
  input.type = "text";
  input.value = current;
  input.style.cssText =
    "font-size:inherit; font-weight:inherit; font-family:inherit; color:inherit; background:transparent; border:none; border-bottom:1px solid var(--terra); outline:none; width:160px; padding:0;";
  el.replaceWith(input);
  input.focus();
  input.select();

  const finish = async () => {
    const newName = input.value.trim() || `Class ${classNumber}`;
    await saveClassName(classNumber, newName);
    const h3 = document.createElement("h3");
    h3.textContent = newName;
    h3.style.cursor = "pointer";
    h3.title = "Click to rename";
    h3.onclick = () => startClassNameEdit(h3, classNumber);
    input.replaceWith(h3);
    // Also update roster chips
    document
      .querySelectorAll(`[data-class-chip="${classNumber}"]`)
      .forEach((chip) => {
        chip.textContent = newName;
      });
  };

  input.addEventListener("blur", finish);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") {
      input.value = window.classNames[classNumber] || `Class ${classNumber}`;
      input.blur();
    }
  });
}

function startTeacherEdit(el, classNumber) {
  const available = (window.currentAvailableTeachers || []).filter(
    (t) => t && t.trim(),
  );
  const current = window.currentTeachers[classNumber - 1] || "";

  // If no teachers configured, show a tooltip-style message
  if (available.length === 0) {
    const msg = document.createElement("span");
    msg.style.cssText = "font-size:11px;color:var(--ink-4);font-style:italic;";
    msg.textContent = "Add teachers above first";
    el.replaceWith(msg);
    setTimeout(() => msg.replaceWith(el), 2000);
    return;
  }

  // Build a select dropdown from available teachers, excluding those already assigned to other classes
  const assignedElsewhere = new Set(
    (window.currentTeachers || []).filter((t, i) => t && i !== classNumber - 1),
  );

  const select = document.createElement("select");
  select.style.cssText =
    "font-size:11px;font-family:inherit;color:var(--ink-3);background:var(--panel);border:1px solid var(--terra);border-radius:4px;outline:none;padding:1px 4px;max-width:160px;";

  const blankOpt = document.createElement("option");
  blankOpt.value = "";
  blankOpt.textContent = "— unassigned —";
  select.appendChild(blankOpt);

  available.forEach((t) => {
    if (assignedElsewhere.has(t)) return;
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    if (t === current) opt.selected = true;
    select.appendChild(opt);
  });

  if (!current) select.value = "";

  el.replaceWith(select);
  select.focus();

  const finish = async () => {
    const newName = select.value;
    window.currentTeachers[classNumber - 1] = newName;
    await fetch(`/api/grades/${currentGrade.id}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teachers: window.currentTeachers }),
    });
    const div = document.createElement("div");
    div.className = "teacher-label";
    div.dataset.classNumber = classNumber;
    div.style.cssText = `font-size:11px; color:${newName ? "var(--ink-3)" : "var(--ink-4)"}; cursor:pointer; margin-top:1px;`;
    div.textContent = newName || "+ Add teacher";
    div.onclick = () => startTeacherEdit(div, classNumber);
    select.replaceWith(div);
  };

  select.addEventListener("blur", finish);
  select.addEventListener("change", () => select.blur());
}
window.startTeacherEdit = startTeacherEdit;

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

// ─── Import wizard ────────────────────────────────────────────────────────────

const _IMP_FIELDS = [
  { key:'name',         label:'Student name',   type:'name',   required:true },
  { key:'gender',       label:'Gender',         type:'choice', options:[{v:'g',label:'Girl'},{v:'b',label:'Boy'}] },
  { key:'behavior',     label:'Behavior',       type:'choice', options:[{v:'cooperative',label:'Cooperative'},{v:'neutral',label:'Neutral'},{v:'disruptive',label:'Disruptive'}] },
  { key:'independence', label:'Independence',   type:'choice', options:[{v:'high',label:'High'},{v:'neutral',label:'Neutral'},{v:'low',label:'Low'}] },
  { key:'iep',          label:'IEP',            type:'boolean' },
  { key:'504',          label:'504 Plan',       type:'boolean' },
  { key:'esl',          label:'ESL / ELL',      type:'boolean' },
  { key:'gate',         label:'GATE / Gifted',  type:'boolean' },
  { key:'math',         label:'Math level',     type:'choice', options:[{v:'h',label:'High'},{v:'m',label:'Medium'},{v:'l',label:'Low'}] },
  { key:'reading',      label:'Reading level',  type:'choice', options:[{v:'h',label:'High'},{v:'m',label:'Medium'},{v:'l',label:'Low'}] },
  { key:'friends',       label:'Friends',              type:'text' },
  { key:'incompatible',  label:'Separate from',        type:'text' },
  { key:'assignedClass', label:'Current class/teacher', type:'text' },
];

const _IMP_COL_PATTERNS = {
  name:         ['name','student','student name','full name','student_name','fullname','legal name','pupil name','last, first','first last'],
  grade:        ['grade','grade level','homeroom','class','gradelevel','grade_level','enrolled grade','school grade','current grade'],
  gender:       ['gender','sex','biological sex','reported sex','gender identity','gender code','student gender','sex code'],
  behavior:     ['behavior','behaviour','conduct','beh','behavior code','beh code','behavioral','citizenship','school citizenship','classroom behavior','responsible behavior','cooperation','self-control','work habits','effort'],
  independence: ['independence','independent','indep','self-directed','self directed','self-direction','self-management','self-regulation','study skills','initiative','task completion','executive functioning','self-monitoring','works independently'],
  iep:          ['iep','special ed','sped','special education','spec ed','individualized education','special needs','disability status','exceptionality','ese','exceptional learner','specialized services','services received','specialized instruction'],
  '504':        ['504','504 plan','section 504','has 504','accommodation plan'],
  esl:          ['esl','ell','el','mll','lep','english learner','english language','language learner','english language learner','el status','ell status','english proficiency','language program','bilingual','newcomer','language support','title iii','multilingual'],
  gate:         ['gate','gifted','tag','talented','gate/gifted','gifted and talented','academically gifted','advanced learner','enrichment'],
  math:         ['math','mathematics','math level','math_level','math perf','math performance','math score','math achievement','math proficiency','mathematics level','math performance level','math benchmark','numeracy','math skill'],
  reading:      ['reading','read','ela','reading level','reading_level','reading perf','reading score','literacy','reading achievement','reading proficiency','ela level','reading performance level','reading benchmark','literacy level','language arts','reading skill','reading band'],
  friends:        ['friends','friend','friend list','requests with','friend_requests','request','friend request','friend requests','place with','together with','pair with'],
  incompatible:   ['incompatible','separate','cannot be with','keep apart','conflict','do not place','no with','keep separate','separate from','not with','avoid','apart from','not together','cannot with'],
  assignedClass:  ['teacher','teacher name','homeroom teacher','current teacher','assigned teacher','classroom teacher','class assignment','assigned class','current class','next teacher','next class'],
  firstName:    ['first name','first_name','fname','given name','preferred name','preferred first name','forename'],
  lastName:     ['last name','last_name','lname','family name','surname'],
};

function _impSuggest(field, raw) {
  const v = (raw == null ? '' : String(raw)).toLowerCase().trim();
  if (field.type === 'boolean') {
    if (['y','yes','1','true','x','✓','active','identified','*','iep','ell','el','esl','gate'].includes(v)) return 'true';
    if (['n','no','0','false','-','none','','inactive','not identified','eo','non-el','fluent','fep','rfep'].includes(v)) return 'false';
    return null;
  }
  if (field.type === 'choice') {
    const k = field.key;
    if (k === 'gender') {
      if (['f','female','girl','g','woman','w','girls'].includes(v)) return 'g';
      if (['m','male','boy','b','man','boys'].includes(v)) return 'b';
    } else if (k === 'behavior') {
      // Outstanding / Cooperative — best behavior
      if (['cooperative','c','good','positive','low concern','never',
           'outstanding','excellent','exemplary','exceeds expectations',
           'distinguished','model','consistently demonstrates',
           'star student','always'].includes(v)) return 'cooperative';
      // Neutral / Satisfactory
      if (['neutral','n','2','average','typical','moderate','mod','sometimes','occasional',
           'satisfactory','adequate','appropriate','on track','usually',
           'acceptable','meets expectations','usually demonstrates'].includes(v)) return 'neutral';
      // Disruptive / Concern
      if (['disruptive','d','challenging','problematic','bad','concern','high concern',
           'difficult','frequent','3','high',
           'unsatisfactory','poor','rarely','significant concern','below expectations',
           'needs watching','ni','needs improvement','inconsistent'].includes(v)) return 'disruptive';
    } else if (k === 'independence') {
      // High independence
      if (['high','h','3','independent','very independent','self-directed','self directed',
           'strong','4','always','self-managing','independent learner'].includes(v)) return 'high';
      // Neutral / Adequate
      if (['neutral','2','average','typical','moderate','some support',
           'satisfactory','adequate','usually','approaching independence',
           'approaching','usually demonstrates'].includes(v)) return 'neutral';
      // Low independence
      if (['low','l','1','dependent','needs support','supported','high support',
           'weak','rarely','never','emerging','not yet','significant support',
           'beginning','rarely demonstrates'].includes(v)) return 'low';
    } else if (k === 'math' || k === 'reading') {
      // High / Advanced
      if (['h','high','advanced','above','above grade','proficient+','exceeds',
           'exceeds standards','4','standard exceeded','above grade level','agl',
           'distinguished','mastery','mastered','well above benchmark','above benchmark',
           'honors','adv'].includes(v)) return 'h';
      // Medium / Proficient
      if (['m','medium','mid','proficient','on grade','grade level','on','meets',
           'meets standards','2','3','at grade level','benchmark','ogl','low risk',
           'standard met','at benchmark'].includes(v)) return 'm';
      // Low / Below
      if (['l','low','1','basic','below','below grade','needs improvement','ni',
           'approaching','does not meet','approaching standards','developing',
           'below basic','bgl','below grade level','at risk','intensive','emerging',
           'not yet ready','not meeting','strategic','some risk','nearly met',
           'standard nearly met','partially meets','beginning',
           'far below','far below basic','well below','well below benchmark',
           'fbb','0','not yet','below benchmark','approaching proficient'].includes(v)) return 'l';
    }
  }
  return null;
}

const _GRADE_OPTIONS = ['Kindergarten','1st Grade','2nd Grade','3rd Grade','4th Grade','5th Grade','6th Grade','7th Grade','8th Grade'];

function _impUnrecognizedGrades(state) {
  if (state.mode !== 'schoolYear') return [];
  const gradeCol = state.colMappings['grade'];
  if (!gradeCol) return [];
  const vals = _impUniqueVals(state.rawRows, gradeCol);
  return vals.filter(v => !normalizeGradeName(v));
}

function _impAutoDetect(csvColumns) {
  const lc = csvColumns.map(c => c.toLowerCase().trim());
  const mappings = {};
  for (const [field, patterns] of Object.entries(_IMP_COL_PATTERNS)) {
    for (const pat of patterns) {
      const idx = lc.indexOf(pat);
      if (idx !== -1) { mappings[field] = csvColumns[idx]; break; }
    }
  }
  // Fuzzy fallback for name — only when no dedicated first/last name columns were found
  if (!mappings['name'] && !mappings['firstName'] && !mappings['lastName']) {
    const idx = lc.findIndex(c => c.includes('name') && !c.includes('grade') && !c.includes('school') && !c.includes('first') && !c.includes('last'));
    if (idx !== -1) mappings['name'] = csvColumns[idx];
  }
  return mappings;
}

function _impUniqueVals(rows, col) {
  const s = new Set();
  for (const r of rows) { const v = (r[col] ?? '').trim(); if (v !== '') s.add(v); }
  return [...s];
}

function _isLikelyFreeText(rows, col) {
  const vals = rows.map(r => (r[col] || '').trim()).filter(Boolean);
  if (vals.length < 2) return false;
  const unique = new Set(vals).size;
  const avgLen = vals.reduce((s, v) => s + v.length, 0) / vals.length;
  return unique / vals.length > 0.6 || avgLen > 30;
}

function _impAllFields() {
  const customs = (config?.properties || [])
    .filter(p => p.custom)
    .map(p => ({
      key: p.name, label: p.display_name, custom: true,
      type: p.type === 'boolean' ? 'boolean' : 'choice',
      options: p.type !== 'boolean' ? (p.values || []).map(v => ({ v, label: v })) : undefined,
    }));
  return [..._IMP_FIELDS, ...customs];
}

const _IMP_KNOWN_KEYS = new Set(['name','firstName','lastName','grade','gender','behavior','independence','iep','504','esl','gate','math','reading','friends','incompatible','assignedClass','notes','previous_teachers']);

function _impExtraCols(state) {
  const mapped = new Set(Object.values(state.colMappings).filter(Boolean));
  return state.columns
    .filter(col => !mapped.has(col))
    .map(col => {
      const pref = state.extraPrefs[col] ?? {};
      const freeText = _isLikelyFreeText(state.rawRows, col);
      return { csvCol: col, label: pref.label ?? col, include: pref.include ?? !freeText, freeText };
    });
}

function _impSetExtraPref(col, key, val) {
  if (!_impState.extraPrefs[col]) _impState.extraPrefs[col] = {};
  _impState.extraPrefs[col][key] = val;
  // No full re-render needed for label edits — just update in place
  if (key !== 'include') return;
  _impRender();
}

function _impValueFields(state) {
  return _impAllFields()
    .filter(f => f.type === 'choice' || f.type === 'boolean')
    .map(f => {
      const col = state.colMappings[f.key];
      if (!col) return null;
      const vals = _impUniqueVals(state.rawRows, col);
      return { field: f, col, entries: vals.map(raw => ({ raw, suggested: _impSuggest(f, raw) })) };
    })
    .filter(Boolean);
}

function _impAllRecognized(valueFields) {
  return valueFields.every(({ entries }) => entries.every(e => e.suggested !== null));
}

function _impBuildStudents(state) {
  const gradeCol  = state.colMappings['grade'];
  const nameCol   = state.colMappings['name'];
  const firstCol  = state.colMappings['firstName'];
  const lastCol   = state.colMappings['lastName'];
  const students = [];
  for (const row of state.rawRows) {
    let name = (row[nameCol] || '').trim();
    if (!name) {
      const first = firstCol ? (row[firstCol] || '').trim() : '';
      const last  = lastCol  ? (row[lastCol]  || '').trim() : '';
      name = [first, last].filter(Boolean).join(' ');
    }
    if (!name) continue;
    if (gradeCol) {
      const rowGrade = normalizeGradeName(row[gradeCol] || '');
      if (rowGrade !== currentGrade?.name) continue;
    }
    const student = { name };
    for (const f of _impAllFields()) {
      if (f.key === 'name') continue;
      const col = state.colMappings[f.key];
      if (f.type === 'text') {
        student[f.key] = col ? (row[col] || '').trim() : '';
        continue;
      }
      if (!col) {
        student[f.key] = f.type === 'boolean' ? false : (f.options?.[0]?.v ?? '');
        continue;
      }
      const rawVal = (row[col] || '').trim();
      const mapped = state.valMappings[f.key]?.[rawVal] ?? _impSuggest(f, rawVal);
      student[f.key] = f.type === 'boolean' ? mapped === 'true' : (mapped ?? f.options?.[0]?.v ?? '');
    }
    for (const { csvCol, label, include } of _impExtraCols(state)) {
      if (include) student[label] = (row[csvCol] || '').trim();
    }
    students.push(student);
  }

  // Apply name overrides (used to resolve duplicate names)
  if (state.nameOverrides && Object.keys(state.nameOverrides).length > 0) {
    const occIdx = {};
    for (const st of students) {
      const orig = st.name;
      const i = occIdx[orig] ?? 0;
      occIdx[orig] = i + 1;
      const key = `\x1F${orig}\x1F${i}`;
      if (state.nameOverrides[key]) st.name = state.nameOverrides[key];
    }
  }

  return students;
}

// Find duplicate names within each grade (or across the single student list).
// Returns { gradeName: { studentName: count } } for names appearing more than once.
// Grade key is '' for single-grade imports.
function _impRawDups(state) {
  const tempState = { ...state, nameOverrides: {} };
  const data = state.mode === 'schoolYear'
    ? _impBuildByGrade(tempState)
    : { '': _impBuildStudents(tempState) };
  const result = {};
  for (const [grade, students] of Object.entries(data)) {
    const counts = {};
    for (const st of students) counts[st.name] = (counts[st.name] || 0) + 1;
    for (const [name, cnt] of Object.entries(counts)) {
      if (cnt > 1) { if (!result[grade]) result[grade] = {}; result[grade][name] = cnt; }
    }
  }
  return result;
}

// Returns true if all raw duplicates have been assigned unique non-empty override names.
function _impDupsResolved(state, rawDups) {
  for (const [grade, names] of Object.entries(rawDups)) {
    for (const [origName, count] of Object.entries(names)) {
      const vals = [];
      for (let i = 0; i < count; i++) {
        const key = `${grade}\x1F${origName}\x1F${i}`;
        const v = (state.nameOverrides?.[key] ?? '').trim();
        vals.push(v || origName);
      }
      if (new Set(vals).size !== count) return false;
    }
  }
  return true;
}

window._impSetNameOverride = function(grade, origName, idx, val) {
  const key = `${grade}\x1F${origName}\x1F${idx}`;
  _impState.nameOverrides[key] = val.trim();
  _impRender();
};

let _impState = null;

async function showImportModal(mode, opts = {}) {
  const yearsRes = await fetch('/api/school-years').then(r => r.json()).catch(() => null);
  const availableYears = yearsRes?.years || [config.active_school_year || config.school_year];
  const targetYear = yearsRes?.active || config.active_school_year || config.school_year;
  _impState = {
    step: 1, mode: mode || 'grade', rawRows:[], columns:[], colMappings:{}, valMappings:{},
    gradeMapping:{}, extraPrefs:{}, nameOverrides:{}, targetYear, availableYears,
    transitionGradeName: opts.transitionGradeName || null,
    transitionCallback: opts.transitionCallback || null,
  };
  _impRender();
  document.getElementById('importModal').classList.add('open');
}

function _impRender() {
  const body = document.getElementById('importModalBody');
  const s = _impState;
  const stepLabels = ['Upload','Map columns','Map values','Preview'];
  const crumb = stepLabels.map((lbl,i) => {
    const n = i+1, active = n===s.step, done = n<s.step;
    return `<span style="color:${active?'var(--ink)':done?'var(--terra)':'var(--ink-4)'};font-size:${active?'14px':'13px'};font-weight:${active?600:400};">${done?'✓ ':''}${lbl}</span>`;
  }).join('<span style="color:var(--ink-4);margin:0 5px;">›</span>');
  const stepBar = `<div style="margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid var(--line-soft);">${crumb}</div>`;

  if (s.step===1) body.innerHTML = stepBar + _impStep1HTML();
  else if (s.step===2) body.innerHTML = stepBar + _impStep2HTML();
  else if (s.step===3) body.innerHTML = stepBar + _impStep3HTML();
  else if (s.step===4) body.innerHTML = stepBar + _impStep4HTML();
}

function _impStep1HTML() {
  const s = _impState;
  const gradeLabel = s.mode === 'transition-grade' ? `<div style="margin-bottom:20px;padding:8px 12px;background:var(--bg-2);border:1px solid var(--line);border-radius:var(--rad);font-size:13px;color:var(--ink-3);">
    Importing into <strong style="color:var(--ink)">${s.transitionGradeName}</strong> for next year
  </div>` : '';
  const yearSelector = (s.mode === 'schoolYear') ? (() => {
    if (s.availableYears?.length > 1) {
      return `<div style="margin-bottom:20px;">
        <label style="font-size:13px;font-weight:600;color:var(--ink-2);display:block;margin-bottom:6px;">Import into school year</label>
        <select onchange="_impState.targetYear=this.value" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:var(--rad);font:inherit;font-size:13px;background:var(--panel);">
          ${s.availableYears.map(y => `<option value="${y}"${y===s.targetYear?' selected':''}>${y}</option>`).join('')}
        </select>
      </div>`;
    }
    return `<div style="margin-bottom:20px;padding:8px 12px;background:var(--bg-2);border:1px solid var(--line);border-radius:var(--rad);font-size:13px;color:var(--ink-3);">
      Importing into <strong style="color:var(--ink)">${s.targetYear}</strong>
    </div>`;
  })() : '';
  return gradeLabel + yearSelector + `
    <div id="imp-dropzone"
      style="border:2px dashed var(--line);border-radius:var(--rad-lg);padding:48px 24px;text-align:center;cursor:pointer;transition:border-color 0.15s;"
      onclick="document.getElementById('imp-file-input').click()"
      ondragover="event.preventDefault();this.style.borderColor='var(--terra)'"
      ondragleave="this.style.borderColor='var(--line)'"
      ondrop="event.preventDefault();this.style.borderColor='var(--line)';_impHandleFile(event.dataTransfer.files[0])">
      <div style="font-size:28px;margin-bottom:10px;color:var(--ink-4);">↑</div>
      <div style="font-weight:600;font-size:14px;color:var(--ink);margin-bottom:6px;">Drop a CSV file or click to browse</div>
      <div style="font-size:12px;color:var(--ink-4);line-height:1.5;">Works with exports from PowerSchool, Infinite Campus, Aeries, or any spreadsheet.<br>We'll walk you through mapping your columns and values.</div>
    </div>
    <input id="imp-file-input" type="file" accept=".csv,.txt" style="display:none" onchange="_impHandleFile(this.files[0])">
    <div id="imp-err" style="margin-top:10px;font-size:13px;color:var(--rose);display:none;"></div>`;
}

function _impStep2HTML() {
  const s = _impState;
  const rows = _impAllFields().map(f => {
    // Special handling for name field — may come as first + last name columns
    if (f.key === 'name') {
      if (s.nameMode === 'combined') {
        const firstCol = s.colMappings['firstName'] || '';
        const lastCol  = s.colMappings['lastName']  || '';
        const r0 = s.rawRows[0] || {};
        const sFirst = firstCol ? (r0[firstCol] || '').trim() : '';
        const sLast  = lastCol  ? (r0[lastCol]  || '').trim() : '';
        const combined = [sFirst, sLast].filter(Boolean).join(' ');
        const colOpts = col => `<option value="">— skip —</option>${s.columns.map(c=>`<option value="${escAttr(c)}" ${c===col?'selected':''}>${escAttr(c)}</option>`).join('')}`;
        const selSt = 'flex:1;padding:5px 7px;border:1px solid var(--line);border-radius:var(--rad);font-size:12px;font-family:inherit;background:var(--bg);color:var(--ink);min-width:0;';
        return `<tr style="border-top:1px solid var(--line-soft);">
          <td style="padding:8px 12px;font-size:13px;font-weight:500;white-space:nowrap;color:var(--ink);">Student name <span style="color:var(--terra)">*</span></td>
          <td style="padding:8px 12px;">
            <div style="display:flex;align-items:center;gap:5px;">
              <select onchange="_impState.colMappings.firstName=this.value||null;_impRender()" style="${selSt}">${colOpts(firstCol)}</select>
              <span style="color:var(--ink-4);font-size:11px;flex-shrink:0;">+</span>
              <select onchange="_impState.colMappings.lastName=this.value||null;_impRender()" style="${selSt}">${colOpts(lastCol)}</select>
            </div>
            <div style="margin-top:4px;"><a href="#" style="font-size:11px;color:var(--ink-4);" onclick="event.preventDefault();_impState.nameMode='single';_impState.colMappings.firstName=null;_impState.colMappings.lastName=null;_impRender()">Use a single name column instead</a></div>
          </td>
          <td style="padding:8px 12px;font-size:12px;color:var(--ink-4);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escAttr(combined)}">${combined ? escAttr(combined) : ''}</td>
        </tr>`;
      }
    }
    const sel = s.colMappings[f.key] || '';
    const sample = sel ? _impUniqueVals(s.rawRows, sel).slice(0,4).join(', ') : '';
    const splitLink = f.key === 'name'
      ? `<div style="margin-top:4px;"><a href="#" style="font-size:11px;color:var(--ink-4);" onclick="event.preventDefault();_impState.nameMode='combined';_impState.colMappings.name=null;_impRender()">My CSV has separate first and last name columns</a></div>`
      : '';
    return `<tr style="border-top:1px solid var(--line-soft);">
      <td style="padding:8px 12px;font-size:13px;font-weight:500;white-space:nowrap;color:var(--ink);">
        ${escAttr(f.label)}${f.required?` <span style="color:var(--terra)">*</span>`:''}
      </td>
      <td style="padding:8px 12px;">
        <select onchange="_impSetCol('${escAttr(f.key)}',this.value)"
          style="width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:var(--rad);font-size:13px;font-family:inherit;background:var(--bg);color:var(--ink);">
          <option value="">— skip —</option>
          ${s.columns.map(c=>`<option value="${escAttr(c)}" ${c===sel?'selected':''}>${escAttr(c)}</option>`).join('')}
        </select>
        ${splitLink}
      </td>
      <td style="padding:8px 12px;font-size:12px;color:var(--ink-4);font-style:${sample?'normal':'italic'};max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escAttr(sample)}">
        ${sample ? escAttr(sample) : 'not mapped'}
      </td>
    </tr>`;
  }).join('');

  const gradeSel = s.colMappings['grade'] || '';
  const gradeSample = gradeSel ? _impUniqueVals(s.rawRows, gradeSel).slice(0,4).join(', ') : '';

  return `
    <div style="font-size:13px;color:var(--ink-3);margin-bottom:14px;">
      <strong>${s.rawRows.length} rows</strong> detected. Match your columns to our fields — we've pre-filled our best guesses.
    </div>
    <div style="overflow-y:auto;max-height:340px;border:1px solid var(--line);border-radius:var(--rad);">
      <table style="width:100%;border-collapse:collapse;">
        <thead style="position:sticky;top:0;background:var(--bg-2);z-index:1;">
          <tr>
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);">Our field</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);">Your column</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);">Sample values</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="margin-top:12px;padding:10px 12px;background:var(--bg-2);border-radius:var(--rad);display:flex;align-items:center;gap:10px;">
      <span style="font-size:13px;font-weight:500;color:var(--ink);white-space:nowrap;">
        Grade column${s.mode==='schoolYear' ? ' <span style="color:var(--terra)">*</span>' : ''}
      </span>
      <select onchange="_impSetCol('grade',this.value)"
        style="flex:1;padding:6px 8px;border:1px solid ${s.mode==='schoolYear'&&!gradeSel?'var(--terra)':'var(--line)'};border-radius:var(--rad);font-size:13px;font-family:inherit;background:var(--bg);color:var(--ink);">
        <option value="">${s.mode==='schoolYear' ? '— required —' : '— import all rows —'}</option>
        ${s.columns.map(c=>`<option value="${escAttr(c)}" ${c===gradeSel?'selected':''}>${escAttr(c)}</option>`).join('')}
      </select>
      <span style="font-size:12px;color:var(--ink-4);white-space:nowrap;">${gradeSample ? escAttr(gradeSample) : s.mode==='schoolYear' ? 'splits students by grade' : 'filters to '+escAttr(currentGrade?.name||'this grade')}</span>
    </div>
    ${(() => {
      const extras = _impExtraCols(s);
      if (!extras.length) return '';
      const rows = extras.map(({ csvCol, label, include, freeText }) => {
        const sample = _impUniqueVals(s.rawRows, csvCol).slice(0,3).join(', ');
        const badge = freeText
          ? `<span style="font-size:10px;padding:1px 6px;background:var(--bg-3);border-radius:10px;color:var(--ink-3);margin-left:6px;white-space:nowrap;">free text</span>`
          : `<span style="font-size:10px;padding:1px 6px;background:var(--bg-3);border-radius:10px;color:var(--ink-3);margin-left:6px;white-space:nowrap;">categorical</span>`;
        const note = freeText ? `<div style="font-size:11px;color:var(--ink-4);margin-top:2px;">Stored as a note — won't affect class balancing</div>` : '';
        return `<tr style="border-top:1px solid var(--line-soft);">
          <td style="padding:8px 12px;">
            <input type="checkbox" ${include ? 'checked' : ''} onchange="_impSetExtraPref(${JSON.stringify(csvCol)},'include',this.checked)" />
          </td>
          <td style="padding:8px 12px;font-size:13px;color:var(--ink-3);white-space:nowrap;">${escAttr(csvCol)}${badge}</td>
          <td style="padding:8px 12px;">
            <input type="text" value="${escAttr(label)}"
              onchange="_impState.extraPrefs[${JSON.stringify(csvCol)}]=_impState.extraPrefs[${JSON.stringify(csvCol)}]||{};_impState.extraPrefs[${JSON.stringify(csvCol)}].label=this.value"
              style="width:100%;padding:5px 8px;border:1px solid var(--line);border-radius:var(--rad);font-size:13px;font-family:inherit;background:var(--bg);color:var(--ink);box-sizing:border-box;" />
          </td>
          <td style="padding:8px 12px;font-size:12px;color:var(--ink-4);max-width:160px;overflow:hidden;text-overflow:ellipsis;">
            <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escAttr(sample)}">${sample ? escAttr(sample) : ''}</div>
            ${note}
          </td>
        </tr>`;
      }).join('');
      return `
        <div style="margin-top:14px;">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:4px;">Unrecognized columns</div>
          <div style="font-size:12px;color:var(--ink-4);margin-bottom:8px;">Categorical columns (few distinct values) are shown as student attributes. Free text columns are stored as notes only.</div>
          <div style="border:1px solid var(--line);border-radius:var(--rad);overflow:hidden;">
            <table style="width:100%;border-collapse:collapse;">
              <thead style="background:var(--bg-2);">
                <tr>
                  <th style="padding:7px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);width:32px;">Keep</th>
                  <th style="padding:7px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);">CSV column</th>
                  <th style="padding:7px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);">Label</th>
                  <th style="padding:7px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);">Sample values</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>`;
    })()}
    <div id="imp-err" style="margin-top:10px;font-size:13px;color:var(--rose);display:none;"></div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
      <button class="btn ghost" onclick="_impState.step=1;_impRender()">Back</button>
      <button class="btn primary" onclick="_impStep2Next()">Next: Map values →</button>
    </div>`;
}

function _impSetCol(fieldKey, colName) {
  _impState.colMappings[fieldKey] = colName || null;
  _impRender();
}

function _impStep2Next() {
  const hasName = _impState.colMappings['name'] || _impState.colMappings['firstName'] || _impState.colMappings['lastName'];
  if (!hasName) { _impShowErr('You must map a student name column (or first + last name columns).'); return; }
  if (_impState.mode === 'schoolYear' && !_impState.colMappings['grade']) { _impShowErr('You must map the grade column to import across all grades.'); return; }
  const vf = _impValueFields(_impState);
  // Pre-apply suggestions without clobbering any existing manual mappings
  for (const { field, entries } of vf) {
    if (!_impState.valMappings[field.key]) _impState.valMappings[field.key] = {};
    for (const e of entries) {
      if (e.suggested && !(_impState.valMappings[field.key][e.raw])) {
        _impState.valMappings[field.key][e.raw] = e.suggested;
      }
    }
  }
  const hasUnrecognizedGrades = _impUnrecognizedGrades(_impState).length > 0;
  _impState.step = (_impAllRecognized(vf) && !hasUnrecognizedGrades) ? 4 : 3;
  _impRender();
}

function _impStep3HTML() {
  const s = _impState;
  const vf = _impValueFields(s);
  const unrecognizedFields = vf.filter(({ entries }) => entries.some(e => !e.suggested));

  const sections = unrecognizedFields.map(({ field, col, entries }) => {
    const rows = entries.map(({ raw, suggested }) => {
      const current = s.valMappings[field.key]?.[raw] ?? suggested ?? '';
      const unrecog = !suggested;
      const opts = field.type === 'boolean'
        ? [{v:'true',label:'Yes'},{v:'false',label:'No'}]
        : (field.options || []);
      return `<tr>
        <td style="padding:8px 14px;font-size:13px;font-family:var(--t-mono);color:var(--ink);border-top:1px solid var(--line-soft);">${escAttr(raw)}</td>
        <td style="padding:8px 8px;color:var(--ink-4);border-top:1px solid var(--line-soft);">→</td>
        <td style="padding:8px 14px;border-top:1px solid var(--line-soft);">
          <select data-field="${escAttr(field.key)}" data-raw="${escAttr(raw)}"
            onchange="_impSetVal('${escAttr(field.key)}','${escAttr(raw)}',this.value)"
            style="padding:5px 8px;border:1px solid ${unrecog?'var(--terra)':'var(--line)'};border-radius:var(--rad);font-size:13px;font-family:inherit;background:var(--bg);color:var(--ink);">
            ${unrecog ? '<option value="">— choose —</option>' : ''}
            ${opts.map(o=>`<option value="${escAttr(o.v)}" ${o.v===current?'selected':''}>${escAttr(o.label)}</option>`).join('')}
          </select>
        </td>
        ${unrecog ? '<td style="padding:8px 4px;font-size:11px;color:var(--terra);border-top:1px solid var(--line-soft);">needs mapping</td>' : '<td style="border-top:1px solid var(--line-soft);"></td>'}
      </tr>`;
    }).join('');
    return `
      <div style="margin-bottom:20px;">
        <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:6px;">
          ${escAttr(field.label)} <span style="font-weight:400;text-transform:none;font-size:11px;color:var(--ink-4);">from column "${escAttr(col)}"</span>
        </div>
        <table style="width:100%;border-collapse:collapse;border:1px solid var(--line);border-radius:var(--rad);overflow:hidden;">
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join('');

  const unrecogGrades = _impUnrecognizedGrades(s);
  const gradeSection = unrecogGrades.length ? `
    <div style="margin-bottom:20px;">
      <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:6px;">
        GRADE <span style="font-weight:400;text-transform:none;font-size:11px;color:var(--ink-4);">from column "${escAttr(s.colMappings['grade'])}"</span>
      </div>
      <table style="width:100%;border-collapse:collapse;border:1px solid var(--line);border-radius:var(--rad);overflow:hidden;">
        <tbody>${unrecogGrades.map(raw => {
          const current = s.gradeMapping[raw] || '';
          return `<tr>
            <td style="padding:8px 14px;font-size:13px;font-family:var(--t-mono);color:var(--ink);border-top:1px solid var(--line-soft);">${escAttr(raw)}</td>
            <td style="padding:8px 8px;color:var(--ink-4);border-top:1px solid var(--line-soft);">→</td>
            <td style="padding:8px 14px;border-top:1px solid var(--line-soft);">
              <select onchange="_impState.gradeMapping[${JSON.stringify(raw)}]=this.value"
                style="padding:5px 8px;border:1px solid ${current?'var(--line)':'var(--terra)'};border-radius:var(--rad);font-size:13px;font-family:inherit;background:var(--bg);color:var(--ink);">
                <option value="">— choose grade —</option>
                ${_GRADE_OPTIONS.map(g=>`<option value="${escAttr(g)}" ${g===current?'selected':''}>${escAttr(g)}</option>`).join('')}
              </select>
            </td>
            <td style="padding:8px 4px;font-size:11px;color:${current?'transparent':'var(--terra)'};border-top:1px solid var(--line-soft);">needs mapping</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>` : '';

  return `
    <div style="font-size:13px;color:var(--ink-3);margin-bottom:16px;">
      We couldn't automatically recognize these values. Choose what each one means.
    </div>
    <div style="max-height:380px;overflow-y:auto;">${gradeSection}${sections}</div>
    <div id="imp-err" style="margin-top:10px;font-size:13px;color:var(--rose);display:none;"></div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
      <button class="btn ghost" onclick="_impState.step=2;_impRender()">Back</button>
      <button class="btn primary" onclick="_impStep3Next()">Next: Preview →</button>
    </div>`;
}

function _impSetVal(fieldKey, rawVal, ourVal) {
  if (!_impState.valMappings[fieldKey]) _impState.valMappings[fieldKey] = {};
  _impState.valMappings[fieldKey][rawVal] = ourVal;
}

function _impStep3Next() {
  const vf = _impValueFields(_impState);
  for (const { field, entries } of vf) {
    for (const { raw, suggested } of entries) {
      if (!suggested && !_impState.valMappings[field.key]?.[raw]) {
        _impShowErr('Please map all highlighted values before continuing.'); return;
      }
    }
  }
  const unmappedGrades = _impUnrecognizedGrades(_impState).filter(g => !_impState.gradeMapping[g]);
  if (unmappedGrades.length) {
    _impShowErr(`Please map all grade values before continuing: ${unmappedGrades.join(', ')}`); return;
  }
  _impState.step = 4;
  _impRender();
}

function _impStep4HTML() {
  const s = _impState;
  const mappedFields = _impAllFields().filter(f => f.key==='name' || s.colMappings[f.key]);
  const hasUnrecognizedGrades = _impUnrecognizedGrades(s).length > 0;
  const backStep = (_impAllRecognized(_impValueFields(s)) && !hasUnrecognizedGrades) ? 2 : 3;

  // Detect duplicate names
  const rawDups = _impRawDups(s);
  const hasDups = Object.keys(rawDups).length > 0;
  const dupsResolved = !hasDups || _impDupsResolved(s, rawDups);

  let dupHTML = '';
  if (hasDups) {
    const gradeOrder = ['Kindergarten','1st Grade','2nd Grade','3rd Grade','4th Grade','5th Grade','6th Grade','7th Grade','8th Grade'];
    const gradeKeys = Object.keys(rawDups).sort((a, b) => {
      const ai = gradeOrder.indexOf(a), bi = gradeOrder.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    const inputStyle = 'padding:5px 8px;border:1px solid var(--line);border-radius:var(--rad);font-size:12px;font-family:inherit;background:var(--bg);color:var(--ink);width:220px;';

    const groupsHTML = gradeKeys.map(grade => {
      const names = rawDups[grade];
      const displayGrade = grade || 'This grade';
      const namesHTML = Object.entries(names).map(([origName, count]) => {
        const occInputs = Array.from({ length: count }, (_, i) => {
          const key = `${grade}\x1F${origName}\x1F${i}`;
          const val = (s.nameOverrides?.[key] ?? '').trim() || origName;
          const escapedGrade = escAttr(grade);
          const escapedName = escAttr(origName);
          return `<input type="text" style="${inputStyle}" value="${escAttr(val)}"
            onchange="_impSetNameOverride('${escapedGrade}', '${escapedName}', ${i}, this.value)"
            placeholder="Enter unique name">`;
        }).join('');
        return `<div style="margin-bottom:8px;">
          <div style="font-size:11px;color:var(--ink-3);margin-bottom:4px;font-style:italic;">
            "${escAttr(origName)}" appears ${count} times — give each a unique name:
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;">${occInputs}</div>
        </div>`;
      }).join('');
      return `${gradeKeys.length > 1 || grade ? `<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:6px;margin-top:8px;">${escAttr(displayGrade)}</div>` : ''}${namesHTML}`;
    }).join('');

    dupHTML = `<div style="margin-bottom:12px;padding:12px 14px;background:var(--amber-bg,#fffbf0);border:1px solid var(--amber,#d4a017);border-radius:var(--rad);">
      <div style="font-size:13px;font-weight:500;color:var(--ink);margin-bottom:10px;">
        Duplicate names detected — rename each student before importing
      </div>
      ${groupsHTML}
    </div>`;
  }

  let summary, tableHTML;

  if (s.mode === 'schoolYear') {
    const byGrade = _impBuildByGrade(s);
    const totalStudents = Object.values(byGrade).reduce((n, arr) => n + arr.length, 0);

    const gradeRows = Object.entries(byGrade).map(([g, arr]) =>
      `<tr><td style="padding:7px 12px;font-size:13px;border-top:1px solid var(--line-soft);">${escAttr(g)}</td>
           <td style="padding:7px 12px;font-size:13px;border-top:1px solid var(--line-soft);color:var(--ink-3);">${arr.length} student${arr.length!==1?'s':''}</td></tr>`
    ).join('');
    summary = `Importing <strong>${totalStudents} students</strong> across <strong>${Object.keys(byGrade).length} grades</strong>`;
    tableHTML = `<table style="width:100%;border-collapse:collapse;">
      <thead><tr>
        <th style="padding:7px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--ink-3);background:var(--bg-2);">Grade</th>
        <th style="padding:7px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--ink-3);background:var(--bg-2);">Students</th>
      </tr></thead>
      <tbody>${gradeRows}</tbody></table>`;
  } else {
    const students = _impBuildStudents(s);
    const preview = students.slice(0, 10);
    const thCells = mappedFields.map(f =>
      `<th style="padding:7px 10px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--ink-3);white-space:nowrap;background:var(--bg-2);">${escAttr(f.label)}</th>`
    ).join('');
    const trRows = preview.map(st => {
      return '<tr>' + mappedFields.map(f => {
        const val = st[f.key];
        let disp = val == null ? '—' : String(val);
        if (f.type === 'boolean') disp = val ? 'Yes' : 'No';
        if (f.type === 'choice' && f.options) disp = f.options.find(o=>o.v===val)?.label ?? disp;
        return `<td style="padding:7px 10px;font-size:12px;border-top:1px solid var(--line-soft);white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis;">${escAttr(disp)}</td>`;
      }).join('') + '</tr>';
    }).join('');
    summary = `Importing <strong>${students.length} students</strong> into <strong>${escAttr(s.transitionGradeName || currentGrade?.name||'this grade')}</strong>${students.length>10?' — showing first 10':''}`;
    tableHTML = `<table style="width:100%;border-collapse:collapse;white-space:nowrap;">
      <thead><tr>${thCells}</tr></thead>
      <tbody>${trRows}</tbody></table>`;
  }

  const confirmCount = s.mode === 'schoolYear'
    ? Object.values(_impBuildByGrade(s)).reduce((n, arr) => n + arr.length, 0)
    : _impBuildStudents(s).length;

  const hasAssignedClass = !!s.colMappings['assignedClass'];
  const assignedClassNote = hasAssignedClass
    ? `<div style="margin-bottom:10px;padding:8px 12px;background:var(--bg-2);border-radius:var(--rad);font-size:12px;color:var(--ink-3);">
        Students will be placed into their existing classes based on the <strong>${escAttr(s.colMappings['assignedClass'])}</strong> column.
        You can re-run the optimizer at any time to explore alternatives.
       </div>`
    : '';

  return `
    <div style="font-size:13px;color:var(--ink-3);margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">
      <span>${summary}</span>
      ${s.mode !== 'transition-grade' ? `<span style="font-size:12px;color:var(--rose);">Replaces existing students &amp; assignments</span>` : ''}
    </div>
    ${dupHTML}
    ${assignedClassNote}
    <div style="overflow:auto;max-height:320px;border:1px solid var(--line);border-radius:var(--rad);">${tableHTML}</div>
    <div id="imp-err" style="margin-top:10px;font-size:13px;color:var(--rose);display:none;"></div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
      <button class="btn ghost" onclick="_impState.step=${backStep};_impRender()">Back</button>
      <button class="btn primary" id="imp-confirm-btn" ${dupsResolved ? '' : 'disabled'} onclick="_impConfirm()">Import ${confirmCount} students</button>
    </div>`;
}

function _impBuildByGrade(state) {
  // Returns { gradeName: [students] } for school year mode import.
  const gradeCol  = state.colMappings['grade'];
  const nameCol   = state.colMappings['name'];
  const firstCol  = state.colMappings['firstName'];
  const lastCol   = state.colMappings['lastName'];
  const byGrade  = {};

  for (const row of state.rawRows) {
    let name = (row[nameCol] || '').trim();
    if (!name) {
      const first = firstCol ? (row[firstCol] || '').trim() : '';
      const last  = lastCol  ? (row[lastCol]  || '').trim() : '';
      name = [first, last].filter(Boolean).join(' ');
    }
    if (!name) continue;
    const rawGrade = (row[gradeCol] || '').trim();
    const gradeName = normalizeGradeName(rawGrade) || state.gradeMapping[rawGrade];
    if (!gradeName) continue;

    if (!byGrade[gradeName]) byGrade[gradeName] = [];
    const student = { name };
    for (const f of _impAllFields()) {
      if (f.key === 'name') continue;
      const col = state.colMappings[f.key];
      if (f.type === 'text') { student[f.key] = col ? (row[col] || '').trim() : ''; continue; }
      if (!col) { student[f.key] = f.type === 'boolean' ? false : (f.options?.[0]?.v ?? ''); continue; }
      const rawVal = (row[col] || '').trim();
      const mapped = state.valMappings[f.key]?.[rawVal] ?? _impSuggest(f, rawVal);
      student[f.key] = f.type === 'boolean' ? mapped === 'true' : (mapped ?? f.options?.[0]?.v ?? '');
    }
    for (const { csvCol, label, include } of _impExtraCols(state)) {
      if (include) student[label] = (row[csvCol] || '').trim();
    }
    byGrade[gradeName].push(student);
  }

  // Apply name overrides (used to resolve duplicate names)
  if (state.nameOverrides && Object.keys(state.nameOverrides).length > 0) {
    for (const [gradeName, students] of Object.entries(byGrade)) {
      const occIdx = {};
      for (const st of students) {
        const orig = st.name;
        const i = occIdx[orig] ?? 0;
        occIdx[orig] = i + 1;
        const key = `${gradeName}\x1F${orig}\x1F${i}`;
        if (state.nameOverrides[key]) st.name = state.nameOverrides[key];
      }
    }
  }

  return byGrade;
}

async function _impConfirm() {
  const s = _impState;
  const btn = document.getElementById('imp-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Importing…'; }

  let res;
  if (s.mode === 'schoolYear') {
    const byGrade = _impBuildByGrade(s);
    if (!Object.keys(byGrade).length) { _impShowErr('No students to import.'); if (btn) { btn.disabled = false; btn.textContent = 'Import students'; } return; }
    res = await fetch('/api/school-years/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grades: byGrade, target_year: s.targetYear }),
    });
  } else if (s.mode === 'transition-grade') {
    const students = _impBuildStudents(s);
    if (!students.length) { _impShowErr('No students to import.'); if (btn) { btn.disabled = false; btn.textContent = 'Import students'; } return; }
    students.forEach(st => { st.removed = false; st.isNew = true; });
    s.transitionCallback(students);
    closeImportModal();
    return;
  } else {
    const students = _impBuildStudents(s);
    if (!students.length) { _impShowErr('No students to import.'); if (btn) { btn.disabled = false; btn.textContent = `Import ${students.length} students`; } return; }
    res = await fetch(`/api/grades/${currentGrade.id}/students`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ students }),
    });
  }

  try {
    if (res.ok) {
      closeImportModal();
      await loadGrades();
      if (s.mode === 'schoolYear' && grades.length > 0) {
        await selectGrade(grades[0].id);
      } else {
        showScreen('students');
      }
    } else {
      const body = await res.json().catch(() => ({}));
      if (btn) { btn.disabled = false; btn.textContent = 'Import students'; }
      _impShowErr(body.error || 'Failed to save. Please try again.');
    }
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Import students'; }
    _impShowErr('Network error: ' + err.message);
  }
}

async function _impHandleFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const lines = text.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) { _impShowErr('CSV has no data rows.'); return; }
    const columns = parseCSVLine(lines[0]).map(h => h.trim());
    if (!columns.length) { _impShowErr('Could not read column headers.'); return; }
    const rawRows = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i]);
      const row = {};
      columns.forEach((col, ci) => { row[col] = (cells[ci] ?? '').trim(); });
      rawRows.push(row);
    }
    _impState.columns = columns;
    _impState.rawRows = rawRows;
    _impState.colMappings = _impAutoDetect(columns);
    _impState.nameMode = (_impState.colMappings['firstName'] || _impState.colMappings['lastName']) ? 'combined' : 'single';
    _impState.step = 2;
    _impRender();
  } catch (e) {
    _impShowErr('Could not parse file: ' + e.message);
  }
}

function _impShowErr(msg) {
  const el = document.getElementById('imp-err');
  if (el) { el.textContent = msg; el.style.display = ''; }
}

// Expose functions called from inline HTML handlers
window._impHandleFile  = _impHandleFile;
window._impSetCol      = _impSetCol;
window._impSetVal      = _impSetVal;
window._impSetExtraPref = _impSetExtraPref;
window._impStep2Next   = _impStep2Next;
window._impStep3Next   = _impStep3Next;
window._impConfirm     = _impConfirm;
window.showImportModal = showImportModal;

function closeImportModal() {
  document.getElementById("importModal").classList.remove("open");
}

function closeBalanceInfoModal() {
  document.getElementById("balanceInfoModal").classList.remove("open");
}

// Detail panel
function showStudentDetail(name) {
  const student = window.currentStudents?.find((s) => s.name === name);
  if (!student) {
    return;
  }

  const panel = document.getElementById("detailPanel");
  const initials = student.name
    .split(" ")
    .map((n) => n[0])
    .join("");

  panel.innerHTML = `
    <div class="detail-h">
      <div style="min-width:0;">
        <div style="display:flex;align-items:center;gap:6px;">
          <div class="nm">${student.name}</div>
          <button class="btn ghost sm" data-mutates="true" title="Rename student"
            onclick="startStudentNameEdit(this.previousElementSibling, '${student.name.replace(/'/g, "\\'")}')"
            style="padding:2px 6px;font-size:12px;flex-shrink:0;">✎</button>
        </div>
        <div class="gr">${currentGrade?.name || "Grade"}</div>
      </div>
      <button class="btn ghost sm" onclick="closeStudentDetail()">✕</button>
    </div>
    <div class="detail-b">
      <div class="detail-section" data-student-name="${student.name.replace(/"/g, "&quot;")}">
        <h5>Properties</h5>
        <div class="prop-row">
          <span class="k">Gender</span>
          <div class="segmented" data-mutates="true">
            <button class="seg ${student.gender === "g" ? "active" : ""}" data-property="gender" data-value="g">Girl</button>
            <button class="seg ${student.gender === "b" ? "active" : ""}" data-property="gender" data-value="b">Boy</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="k">Behavior</span>
          <div class="segmented" data-mutates="true">
            <button class="seg ${student.behavior === "cooperative" ? "active" : ""}" data-property="behavior" data-value="cooperative">Cooperative</button>
            <button class="seg ${student.behavior === "neutral" ? "active" : ""}" data-property="behavior" data-value="neutral">Neutral</button>
            <button class="seg ${student.behavior === "disruptive" ? "active" : ""}" data-property="behavior" data-value="disruptive">Disruptive</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="k">Independence</span>
          <div class="segmented" data-mutates="true">
            <button class="seg ${student.independence === "high" ? "active" : ""}" data-property="independence" data-value="high">High</button>
            <button class="seg ${student.independence === "neutral" ? "active" : ""}" data-property="independence" data-value="neutral">Neutral</button>
            <button class="seg ${student.independence === "low" ? "active" : ""}" data-property="independence" data-value="low">Low</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="k">IEP</span>
          <div class="segmented" data-mutates="true">
            <button class="seg ${student.iep === false ? "active" : ""}" data-property="iep" data-value="false">No</button>
            <button class="seg ${student.iep === true ? "active" : ""}" data-property="iep" data-value="true">Yes</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="k">504 Plan</span>
          <div class="segmented" data-mutates="true">
            <button class="seg ${student["504"] === false ? "active" : ""}" data-property="504" data-value="false">No</button>
            <button class="seg ${student["504"] === true ? "active" : ""}" data-property="504" data-value="true">Yes</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="k">ESL</span>
          <div class="segmented" data-mutates="true">
            <button class="seg ${student.esl === false ? "active" : ""}" data-property="esl" data-value="false">No</button>
            <button class="seg ${student.esl === true ? "active" : ""}" data-property="esl" data-value="true">Yes</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="k">GATE</span>
          <div class="segmented" data-mutates="true">
            <button class="seg ${student.gate === false ? "active" : ""}" data-property="gate" data-value="false">No</button>
            <button class="seg ${student.gate === true ? "active" : ""}" data-property="gate" data-value="true">Yes</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="k">Math level</span>
          <div class="segmented" data-mutates="true">
            <button class="seg ${student.math === "l" ? "active" : ""}" data-property="math" data-value="l">Low</button>
            <button class="seg ${student.math === "m" ? "active" : ""}" data-property="math" data-value="m">Med</button>
            <button class="seg ${student.math === "h" ? "active" : ""}" data-property="math" data-value="h">High</button>
          </div>
        </div>
        <div class="prop-row">
          <span class="k">Reading level</span>
          <div class="segmented" data-mutates="true">
            <button class="seg ${student.reading === "l" ? "active" : ""}" data-property="reading" data-value="l">Low</button>
            <button class="seg ${student.reading === "m" ? "active" : ""}" data-property="reading" data-value="m">Med</button>
            <button class="seg ${student.reading === "h" ? "active" : ""}" data-property="reading" data-value="h">High</button>
          </div>
        </div>
        ${(config.properties || [])
          .filter((p) => p.custom && p.enabled !== false)
          .map((prop) => {
            if (prop.type === "boolean") {
              const val = student[prop.name];
              return `
        <div class="prop-row">
          <span class="k">${prop.display_name}</span>
          <div class="segmented" data-mutates="true">
            <button class="seg ${!val ? "active" : ""}" data-property="${prop.name}" data-value="false">No</button>
            <button class="seg ${val ? "active" : ""}" data-property="${prop.name}" data-value="true">Yes</button>
          </div>
        </div>`;
            } else {
              const val = student[prop.name] ?? "";
              return `
        <div class="prop-row">
          <span class="k">${prop.display_name}</span>
          <div class="segmented" data-mutates="true">
            ${(prop.values || []).map((v) => `<button class="seg ${val === v ? "active" : ""}" data-property="${prop.name}" data-value="${v}">${v}</button>`).join("")}
          </div>
        </div>`;
            }
          })
          .join("")}
        ${(() => {
          const knownKeys = new Set([..._IMP_KNOWN_KEYS, ...(config.properties||[]).map(p=>p.name)]);
          const extras = Object.entries(student).filter(([k]) => !knownKeys.has(k) && k !== 'name');
          if (!extras.length) return '';
          return `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line-soft);">
            <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-4);margin-bottom:6px;">Additional info</div>
            ${extras.map(([k,v]) => v ? `<div class="prop-row"><span class="k">${k}</span><span style="font-size:13px;color:var(--ink-2);">${v}</span></div>` : '').join('')}
          </div>`;
        })()}
      </div>

      <div class="detail-section">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px">
          <h5 style="margin:0">Friends (${student.friends ? student.friends.split(",").filter((f) => f.trim()).length : 0})</h5>
          <button class="btn ghost sm" data-mutates="true" onclick="openRelationModal('${student.name.replace(/'/g, "\\'")}', 'friends')">+ Add</button>
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
                <button data-mutates="true" onclick="removeRelation('${student.name.replace(/'/g, "\\'")}', 'friends', '${fname_trimmed.replace(/'/g, "\\'")}')" style="background:none; border:none; cursor:pointer; padding:0 2px; color:var(--ink-3); font-size:12px; line-height:1" title="Remove">×</button>
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
          <button class="btn ghost sm" data-mutates="true" onclick="openRelationModal('${student.name.replace(/'/g, "\\'")}', 'incompatible')">+ Add</button>
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
                <button data-mutates="true" onclick="removeRelation('${student.name.replace(/'/g, "\\'")}', 'incompatible', '${fname_trimmed.replace(/'/g, "\\'")}')" style="background:none; border:none; cursor:pointer; padding:0 2px; color:var(--ink-3); font-size:12px; line-height:1" title="Remove">×</button>
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
          <h5 style="margin:0">Previous teachers</h5>
          <button class="btn ghost sm" data-mutates="true" onclick="addPreviousTeacher('${student.name.replace(/'/g, "\\'")}')">+ Add</button>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:6px" id="prev-teachers-list">
          ${(() => {
            const prev = student.previous_teachers;
            const list = Array.isArray(prev)
              ? prev
              : prev
                ? String(prev)
                    .split("|")
                    .map((t) => t.trim())
                    .filter(Boolean)
                : [];
            if (list.length === 0)
              return '<span class="muted" style="font-size:12px">None recorded.</span>';
            return list
              .map(
                (t) => `
              <span class="friend-pill" style="display:inline-flex; align-items:center; gap:4px">
                <span style="font-size:12px">${t}</span>
                <button data-mutates="true" onclick="removePreviousTeacher('${student.name.replace(/'/g, "\\'")}', '${t.replace(/'/g, "\\'")}')" style="background:none; border:none; cursor:pointer; padding:0 2px; color:var(--ink-3); font-size:12px; line-height:1" title="Remove">×</button>
              </span>`,
              )
              .join("");
          })()}
        </div>
      </div>

      <div class="detail-section">
        <h5 style="margin-bottom:6px;">Notes</h5>
        <textarea id="student-notes-area"
          placeholder="Notes about this student (carried to next year)…"
          style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--line);border-radius:var(--rad);font-size:13px;font-family:inherit;background:var(--bg-2);color:var(--ink);outline:none;resize:vertical;min-height:72px;line-height:1.4;${!window.classifyIsAdmin ? 'opacity:0.7;' : ''}"
          ${!window.classifyIsAdmin ? 'readonly' : ''}
        >${(student.notes || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
        ${window.classifyIsAdmin ? `<button class="btn ghost sm" style="margin-top:6px;" onclick="saveStudentNote('${student.name.replace(/'/g, "\\'")}')">Save note</button>` : ''}
      </div>

      ${window.classifyIsAdmin ? `
      <div class="detail-section" style="margin-top:auto; padding-top:16px; border-top:1px solid var(--line-soft)">
        <button class="btn ghost sm" style="color:var(--rose); border-color:var(--rose-soft); width:100%"
          onclick="confirmDeleteStudent('${student.name.replace(/'/g, "\\'")}')" data-mutates="true">
          Remove from roster
        </button>
      </div>` : ''}
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

async function saveStudentNote(studentName) {
  const text = document.getElementById('student-notes-area')?.value ?? '';
  await updateStudentProperty(studentName, 'notes', text);
}
window.saveStudentNote = saveStudentNote;

function startStudentNameEdit(el, currentName) {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "display:flex;flex-direction:column;gap:3px;";

  const input = document.createElement("input");
  input.type = "text";
  input.value = currentName;
  input.style.cssText =
    "font:inherit;font-size:inherit;font-weight:inherit;color:inherit;background:transparent;border:none;border-bottom:1px solid var(--terra);outline:none;width:200px;padding:0;";

  const errMsg = document.createElement("div");
  errMsg.style.cssText = "font-size:11px;color:var(--rose);display:none;";

  wrapper.appendChild(input);
  wrapper.appendChild(errMsg);
  el.replaceWith(wrapper);
  input.focus();
  input.select();

  // Clear error on each keystroke
  input.addEventListener("input", () => { errMsg.style.display = "none"; input.style.borderBottomColor = "var(--terra)"; });

  const cancel = () => { wrapper.replaceWith(el); };

  const finish = async () => {
    const newName = input.value.trim();
    if (!newName || newName === currentName) { cancel(); return; }
    if ((window.currentStudents || []).some((s) => s.name === newName)) {
      errMsg.textContent = "Another student in this grade already has that name.";
      errMsg.style.display = "block";
      input.style.borderBottomColor = "var(--rose)";
      input.focus();
      return;
    }
    await renameStudent(currentName, newName);
  };

  input.addEventListener("blur", finish);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); finish(); }
    if (e.key === "Escape") { input.value = currentName; cancel(); }
  });
}

async function renameStudent(oldName, newName) {
  if (!currentGrade) return;

  // Update in currentStudents
  const student = (window.currentStudents || []).find(
    (s) => s.name === oldName,
  );
  if (!student) return;
  student.name = newName;

  // Update any references in other students' friends/incompatible fields
  (window.currentStudents || []).forEach((s) => {
    if (s.friends) {
      s.friends = s.friends
        .split(",")
        .map((f) => (f.trim() === oldName ? newName : f.trim()))
        .join(",");
    }
    if (s.incompatible) {
      s.incompatible = s.incompatible
        .split(",")
        .map((f) => (f.trim() === oldName ? newName : f.trim()))
        .join(",");
    }
  });

  // Update assignments if they exist
  if (window.currentAssignments) {
    window.currentAssignments.forEach((a) => {
      if (a.name === oldName) a.name = newName;
    });
  }
  if (window.solverBaseline) {
    window.solverBaseline.forEach((a) => {
      if (a.name === oldName) a.name = newName;
    });
  }

  try {
    // Save students
    await fetch(`/api/grades/${currentGrade.id}/students`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ students: window.currentStudents }),
    });

    // Save assignments if they exist
    if (window.currentAssignments) {
      await fetch(`/api/grades/${currentGrade.id}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignments: window.currentAssignments,
          update_baseline: true,
        }),
      });
    }

    showStudentDetail(newName);
  } catch (err) {
    showNotice("Failed to rename student", "error");
  }
}

window.startStudentNameEdit = startStudentNameEdit;

function getPreviousTeacherList(student) {
  const prev = student.previous_teachers;
  if (Array.isArray(prev)) return prev.filter(Boolean);
  return prev
    ? String(prev)
        .split("|")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
}

async function savePreviousTeachers(studentName, list) {
  const student = window.currentStudents?.find((s) => s.name === studentName);
  if (!student) return;
  student.previous_teachers = list;
  await fetch(`/api/grades/${currentGrade.id}/students`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ students: window.currentStudents }),
  });
}

function addPreviousTeacher(studentName) {
  const container = document.getElementById("prev-teachers-list");
  if (!container) return;

  // Avoid opening two inputs at once
  if (container.querySelector(".prev-teacher-input")) return;

  const wrapper = document.createElement("span");
  wrapper.className = "prev-teacher-input";
  wrapper.style.cssText = "display:inline-flex; align-items:center; gap:4px;";
  wrapper.innerHTML = `
    <input type="text" placeholder="Teacher name" autocomplete="off"
      style="font-size:12px; padding:3px 7px; border:1px solid var(--terra); border-radius:5px; background:var(--bg-2); color:var(--ink); outline:none; width:140px;">
  `;
  container.appendChild(wrapper);
  const input = wrapper.querySelector("input");
  input.focus();

  const commit = async () => {
    const val = input.value.trim();
    wrapper.remove();
    if (!val) return;
    const student = window.currentStudents?.find((s) => s.name === studentName);
    if (!student) return;
    const list = getPreviousTeacherList(student);
    if (!list.includes(val)) {
      list.push(val);
      await savePreviousTeachers(studentName, list);
    }
    showStudentDetail(studentName);
  };

  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") {
      wrapper.remove();
    }
  });
}

async function removePreviousTeacher(studentName, teacherName) {
  const student = window.currentStudents?.find((s) => s.name === studentName);
  if (!student) return;
  const list = getPreviousTeacherList(student).filter((t) => t !== teacherName);
  await savePreviousTeachers(studentName, list);
  showStudentDetail(studentName);
}

window.addPreviousTeacher = addPreviousTeacher;
window.removePreviousTeacher = removePreviousTeacher;

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
        <input id="relation-search" type="text" placeholder="Search by name…" autocomplete="off" data-readonly-ok
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


// ── Grade CSV import (empty-state drop → opens wizard) ────────────────────────

function handleGradeCSVFile(file) {
  if (!file || !currentGrade) return;
  // Open the import modal wizard with the file pre-loaded
  _impState = { step:1, rawRows:[], columns:[], colMappings:{}, valMappings:{}, nameOverrides:{} };
  _impRender();
  document.getElementById('importModal').classList.add('open');
  _impHandleFile(file);
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

function showSavePrompt(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:2000;display:flex;align-items:center;justify-content:center";
    overlay.innerHTML = `
      <div style="background:var(--panel);border-radius:12px;width:380px;padding:24px 24px 20px;box-shadow:0 12px 40px rgba(0,0,0,0.2)">
        <div style="font-size:15px;font-weight:600;color:var(--ink);margin-bottom:8px">Unsaved changes</div>
        <div style="font-size:13px;color:var(--ink-3);line-height:1.5;margin-bottom:20px">${message || "You have unsaved changes to the class assignments."}</div>
        <div style="display:flex;justify-content:flex-end;gap:8px">
          <button class="btn ghost sm" id="sp-cancel">Cancel</button>
          <button class="btn ghost sm" id="sp-discard" style="color:var(--rose);border-color:var(--rose)">Discard</button>
          <button class="btn sm" id="sp-save" style="background:var(--terra);color:#fff;border-color:var(--terra)">Save changes</button>
        </div>
      </div>
    `;
    overlay.querySelector("#sp-cancel").addEventListener("click", () => {
      overlay.remove();
      resolve("cancel");
    });
    overlay.querySelector("#sp-discard").addEventListener("click", () => {
      overlay.remove();
      resolve("discard");
    });
    overlay.querySelector("#sp-save").addEventListener("click", () => {
      overlay.remove();
      resolve("save");
    });
    document.body.appendChild(overlay);
    overlay.querySelector("#sp-save").focus();
  });
}
window.showSavePrompt = showSavePrompt;

function showReadOnlyModal(gradeName, heldBy) {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
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
      <div style="background: var(--bg); border-radius: var(--rad); padding: 24px; max-width: 420px; box-shadow: 0 4px 20px rgba(0,0,0,0.2);">
        <div style="font-size: 18px; font-weight: 600; margin-bottom: 16px; color: var(--ink);">
          ${gradeName} is being edited
        </div>
        <div style="font-size: 14px; line-height: 1.6; color: var(--ink-2); margin-bottom: 20px;">
          <strong>${heldBy}</strong> is currently editing ${gradeName}.
          <br><br>
          You can view students and placements in <strong>read-only mode</strong>, but you won't be able to make changes until they finish.
          <br><br>
          If they've closed their browser, you can try clicking <strong>"Request edit"</strong> in the top right.
        </div>
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button class="btn ghost sm" id="cancelReadOnlyBtn" style="min-width: 80px;">
            Cancel
          </button>
          <button class="btn primary sm" id="viewReadOnlyBtn" style="min-width: 100px;">
            View Read-Only
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Handle button clicks
    const cancelBtn = modal.querySelector("#cancelReadOnlyBtn");
    const viewBtn = modal.querySelector("#viewReadOnlyBtn");

    cancelBtn.addEventListener("click", () => {
      modal.remove();
      // Don't switch grades - just cancel the action
      resolve("cancel");
    });

    viewBtn.addEventListener("click", () => {
      modal.remove();
      resolve("view");
    });

    // Close on backdrop click = cancel
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        cancelBtn.click();
      }
    });
  });
}

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
          <div class="segmented" data-mutates="true">
            <button class="seg active" data-field="gender" data-value="g">Girl</button>
            <button class="seg" data-field="gender" data-value="b">Boy</button>
          </div>
        </div>

        <div>
          <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:6px">Behavior</label>
          <div class="segmented" data-mutates="true">
            <button class="seg active" data-field="behavior" data-value="cooperative">Cooperative</button>
            <button class="seg" data-field="behavior" data-value="neutral">Neutral</button>
            <button class="seg" data-field="behavior" data-value="disruptive">Disruptive</button>
          </div>
        </div>

        <div>
          <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:6px">Independence</label>
          <div class="segmented" data-mutates="true">
            <button class="seg" data-field="independence" data-value="high">High</button>
            <button class="seg active" data-field="independence" data-value="neutral">Neutral</button>
            <button class="seg" data-field="independence" data-value="low">Low</button>
          </div>
        </div>

        <div>
          <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:6px">Math level</label>
          <div class="segmented" data-mutates="true">
            <button class="seg" data-field="math" data-value="h">High</button>
            <button class="seg active" data-field="math" data-value="m">Medium</button>
            <button class="seg" data-field="math" data-value="l">Low</button>
          </div>
        </div>

        <div>
          <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:6px">Reading level</label>
          <div class="segmented" data-mutates="true">
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

        ${(config.properties || [])
          .filter((p) => p.custom && p.enabled !== false)
          .map((prop) => {
            if (prop.type === "boolean") {
              return `
        <div>
          <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:6px">${prop.display_name}</label>
          <div class="segmented" data-mutates="true">
            <button class="seg active" data-field="${prop.name}" data-value="false">No</button>
            <button class="seg" data-field="${prop.name}" data-value="true">Yes</button>
          </div>
        </div>`;
            } else {
              const values = prop.values || [];
              return `
        <div>
          <label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin-bottom:6px">${prop.display_name}</label>
          <div class="segmented" data-mutates="true">
            ${values.map((v, i) => `<button class="seg ${i === 0 ? "active" : ""}" data-field="${prop.name}" data-value="${v}">${v}</button>`).join("")}
          </div>
        </div>`;
            }
          })
          .join("")}

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

  const customValues = {};
  (config.properties || [])
    .filter((p) => p.custom)
    .forEach((prop) => {
      if (prop.type === "boolean") {
        customValues[prop.name] = fields[prop.name] === "true";
      } else {
        customValues[prop.name] = fields[prop.name] ?? (prop.values?.[0] || "");
      }
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
    ...customValues,
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
    ? "This student has been placed in a class. Removing them will affect the current placement."
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
      const assignRes = await fetch(
        `/api/grades/${currentGrade.id}/assignments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignments: window.currentAssignments }),
        },
      );
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

function updateRosterSearchClear() {
  const input = document.getElementById("rosterSearch");
  const clearBtn = document.getElementById("rosterSearchClear");
  if (input && clearBtn) {
    clearBtn.style.display = input.value ? "flex" : "none";
  }
}

function updateAssignmentSearchClear() {
  const input = document.getElementById("assignmentSearch");
  const clearBtn = document.getElementById("assignmentSearchClear");
  if (input && clearBtn) {
    clearBtn.style.display = input.value ? "flex" : "none";
  }
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

async function exportAllGradesCSV() {
  if (!grades || grades.length === 0) {
    showNotice('No grades to export.', 'error');
    return;
  }

  const gradeOrder = ['Kindergarten','1st Grade','2nd Grade','3rd Grade','4th Grade','5th Grade','6th Grade','7th Grade','8th Grade'];
  const levelLabel = { h: 'High', m: 'Medium', l: 'Low' };
  const genderLabel = { b: 'Boy', g: 'Girl' };

  const allRows = [];

  for (const grade of [...grades].sort((a, b) => gradeOrder.indexOf(a.name) - gradeOrder.indexOf(b.name))) {
    const [studentsRes, assignRes] = await Promise.all([
      fetch(`/api/grades/${grade.id}/students`),
      fetch(`/api/grades/${grade.id}/assignments`),
    ]);
    const studentsData = await studentsRes.json();
    const assignData = await assignRes.json();

    const students = studentsData.students || [];
    const assignments = assignData.assignments || [];
    const classNames = assignData.class_names || {};

    const classOf = {};
    for (const a of assignments) classOf[a.name] = a.assigned_class;

    for (const s of students) {
      const classNum = classOf[s.name];
      const className = classNum ? (classNames[String(classNum)] || `Class ${classNum}`) : '';
      allRows.push({
        Grade: grade.name,
        Class: className,
        Name: s.name || '',
        Gender: genderLabel[s.gender] || s.gender || '',
        Math: levelLabel[s.math] || s.math || '',
        Reading: levelLabel[s.reading] || s.reading || '',
        Behavior: s.behavior || '',
        Independence: s.independence || '',
        IEP: s.iep ? 'Yes' : 'No',
        '504 Plan': s['504'] ? 'Yes' : 'No',
        ESL: s.esl ? 'Yes' : 'No',
        GATE: s.gate ? 'Yes' : 'No',
      });
    }
  }

  if (allRows.length === 0) {
    showNotice('No students to export.', 'error');
    return;
  }

  const headers = Object.keys(allRows[0]);
  const csvLines = [
    headers.join(','),
    ...allRows.map(row =>
      headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(',')
    ),
  ];

  const year = (config.active_school_year || config.school_year || '').replace(/[–—]/g, '-');
  downloadCSV(csvLines.join('\n'), year ? `roster_${year}.csv` : 'roster_all_grades.csv');
}

function exportCSV() {
  // Export student roster
  if (!window.currentStudents) return;

  const csv = convertToCSV(window.currentStudents);
  downloadCSV(csv, `${currentGrade.name}_roster.csv`);
}

// ── Computer transfer ─────────────────────────────────────────────────────────

function exportAllData() {
  // Trigger download via a temporary link
  const a = document.createElement("a");
  a.href = "/api/export-data";
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function importAllData(input) {
  const file = input.files[0];
  if (!file) return;
  const statusEl = document.getElementById("import-status");
  statusEl.textContent = "Importing…";
  statusEl.style.color = "var(--ink-3)";
  statusEl.style.display = "block";

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch("/api/import-data", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (res.ok) {
      statusEl.textContent = "Imported successfully. Reloading…";
      statusEl.style.color = "var(--sage)";
      setTimeout(() => window.location.reload(), 1200);
    } else {
      statusEl.textContent = data.error || "Import failed.";
      statusEl.style.color = "var(--rose)";
    }
  } catch (err) {
    statusEl.textContent =
      "Import failed. Make sure the file is a valid .classify backup.";
    statusEl.style.color = "var(--rose)";
  }
  input.value = "";
}

function exportAssignmentCSV() {
  if (!window.currentAssignments || window.currentAssignments.length === 0) {
    showNotice("No placement to export. Run placement first.", "error");
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
      headers.map((h) => `"${String(row[h]).replace(/"/g, '""')}"`).join(","),
    ),
  ];

  const gradeName = currentGrade?.name || "grade";
  const year = (config.active_school_year || config.school_year || "").replace(
    /[–—]/g,
    "-",
  );
  const filename = year
    ? `${gradeName}_${year}_assignment.csv`
    : `${gradeName}_assignment.csv`;
  downloadCSV(csvLines.join("\n"), filename);
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
window.resetWeightsToDefaults = resetWeightsToDefaults;
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
window.exportAllGradesCSV = exportAllGradesCSV;
window.switchSchoolYear = switchSchoolYear;
window.createNextYear = createNextYear;
window.clearSchoolYear = clearSchoolYear;
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

// Assignment tab: hover to highlight friends/incompatibles
function showAssignmentHighlight(name) {
  const container = document.getElementById("classCardsContainer");
  if (!container) return;

  const student = (window.currentStudents || []).find((s) => s.name === name);
  const friends = student?.friends
    ? student.friends
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean)
    : [];
  const incompatibles = student?.incompatible
    ? student.incompatible
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean)
    : [];

  container.querySelectorAll(".student-row").forEach((row) => {
    const rowName = row.dataset.studentName;
    row.querySelectorAll(".assign-indicator").forEach((el) => el.remove());

    if (friends.includes(rowName)) {
      const el = document.createElement("span");
      el.className = "assign-indicator";
      el.style.cssText =
        "font-size:10px;font-weight:700;color:var(--sage);line-height:1;flex-shrink:0;margin-left:auto;padding-left:6px;";
      el.textContent = "F";
      row.appendChild(el);
    } else if (incompatibles.includes(rowName)) {
      const el = document.createElement("span");
      el.className = "assign-indicator";
      el.style.cssText =
        "font-size:14px;color:var(--error);line-height:1;flex-shrink:0;margin-left:auto;padding-left:6px;";
      el.textContent = "⊘";
      row.appendChild(el);
    }
  });
}

function clearAssignmentHighlight() {
  document.querySelectorAll(".assign-indicator").forEach((el) => el.remove());
}

// Search and filter for class cards view
function filterAssignmentStudents(query) {
  window.assignmentSearch = query;
  applyAssignmentFilters();
}

function toggleAssignmentFilter(flag) {
  if (window.assignmentFilterFlags.has(flag)) {
    window.assignmentFilterFlags.delete(flag);
  } else {
    window.assignmentFilterFlags.add(flag);
  }
  // Update chip button appearance
  document.querySelectorAll("[data-filter-flag]").forEach((btn) => {
    const active = window.assignmentFilterFlags.has(btn.dataset.filterFlag);
    btn.style.background = active ? "var(--ink)" : "transparent";
    btn.style.color = active ? "#fff" : "var(--ink-3)";
  });
  applyAssignmentFilters();
}

function clearAssignmentFilters() {
  window.assignmentSearch = "";
  window.assignmentFilterFlags.clear();
  const input = document.getElementById("assignmentSearch");
  if (input) input.value = "";
  document.querySelectorAll("[data-filter-flag]").forEach((btn) => {
    btn.style.background = "transparent";
    btn.style.color = "var(--ink-3)";
  });
  applyAssignmentFilters();
}

function applyAssignmentFilters() {
  const query = (window.assignmentSearch || "").toLowerCase();
  const flags = window.assignmentFilterFlags || new Set();
  const allStudents = [
    ...(window.currentAssignments || []),
    ...(window.currentStudents || []),
  ];

  document
    .querySelectorAll(".student-row[data-student-name]")
    .forEach((row) => {
      const name = row.getAttribute("data-student-name");
      let matches = true;

      if (query) matches = name.toLowerCase().includes(query);

      if (matches && flags.size > 0) {
        const student = allStudents.find((s) => s.name === name);
        if (student) {
          for (const flag of flags) {
            if (flag === 'no_friends') {
              // Special case: student has friends defined but none in their class
              const hasFriendsDefined = student.friends && student.friends.length > 0 && student.friends !== "[]";
              const hasFriendInClass = student.has_friend_in_class === 1 || student.has_friend_in_class === true;

              // Only show if they have friends defined AND none in their class
              if (!hasFriendsDefined || hasFriendInClass) {
                matches = false;
                break;
              }
            } else if (!(student[flag] === true || student[flag] === "true")) {
              matches = false;
              break;
            }
          }
        } else {
          matches = false;
        }
      }

      row.style.opacity = matches ? "1" : "0.12";
      row.style.pointerEvents = matches ? "" : "none";
    });

  const clearBtn = document.getElementById("clearFiltersBtn");
  if (clearBtn) {
    clearBtn.style.display = query || flags.size > 0 ? "" : "none";
  }
}

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
  if (!event) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";

  // Find the closest class-drop-zone
  let dropZone = event.target.closest(".class-drop-zone");
  if (dropZone) {
    dropZone.style.background = "var(--sage-soft)";
    dropZone.style.border = "2px solid var(--sage)";
  }
}

function handleDragLeave(event) {
  if (!event) return;
  let dropZone = event.target.closest(".class-drop-zone");
  if (dropZone && !dropZone.contains(event.relatedTarget)) {
    dropZone.style.background = "";
    dropZone.style.border = "";
  }
}

function recomputeFriendStatus() {
  const assignments = window.currentAssignments;
  if (!assignments) return;
  const classOf = {};
  assignments.forEach((s) => { classOf[s.name] = s.assigned_class; });
  assignments.forEach((s) => {
    const friends = parseIncompatNames(s.friends);
    s.has_friend_in_class = friends.some((f) => classOf[f] === s.assigned_class) ? 1 : 0;
  });
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
  if (!dropZone) {
    return;
  }

  // Reset styles
  dropZone.style.background = "";
  dropZone.style.border = "";

  const targetClass = parseInt(dropZone.dataset.classNumber);

  if (!draggedStudent || targetClass === draggedStudent.currentClass) {
    return;
  }

  const involvesUnassigned =
    targetClass === 0 || draggedStudent.currentClass === 0;

  if (targetClass === 0) {
    // Dragging back to unassigned — remove from assignments
    window.currentAssignments = (window.currentAssignments || []).filter(
      (s) => s.name !== draggedStudent.name,
    );
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
    }
  } else {
    // Class-to-class move
    const student = window.currentAssignments.find(
      (s) => s.name === draggedStudent.name,
    );
    if (student) student.assigned_class = targetClass;
  }

  recomputeFriendStatus();

  if (involvesUnassigned) {
    // No save button in this context — auto-save immediately
    try {
      await fetch(`/api/grades/${currentGrade.id}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignments: window.currentAssignments,
          update_baseline: true,
        }),
      });
    } catch (err) {
      console.error("Failed to save assignment change:", err);
    }
    // Full re-render needed since assignment list structure changed
    const currentEditMode = window.editMode;
    await showScreen("results");
    window.editMode = currentEditMode;
    const checkbox = document.getElementById("editModeToggle");
    if (checkbox) checkbox.checked = currentEditMode;
  } else {
    // Class-to-class move inside edit mode — targeted refresh, no server fetch
    console.log("handleDrop: class-to-class, using refreshClassCardsContainer");
    window.hasUnsavedChanges = true;
    refreshClassCardsContainer();
    console.log("handleDrop: refreshClassCardsContainer done");
  }

  draggedStudent = null;
}

// Attach drag listeners using event delegation
function attachDragListeners() {
  console.log("📎 Attaching drag listeners...");

  const container = document.getElementById("classCardsContainer");
  if (!container) {
    console.log("  ❌ No classCardsContainer found");
    return;
  }

  // Remove old listeners if they exist
  if (container._dragListenersAttached) {
    console.log("  Listeners already attached, skipping");
    return;
  }

  // Use event delegation on the container
  container.addEventListener(
    "dragstart",
    (e) => {
      if (e.target.classList.contains("draggable-student")) {
        handleDragStart(e);
      }
    },
    true,
  );

  container.addEventListener(
    "dragend",
    (e) => {
      if (e.target.classList.contains("draggable-student")) {
        handleDragEnd(e);
      }
    },
    true,
  );

  container.addEventListener(
    "dragover",
    (e) => {
      handleDragOver(e);
    },
    false,
  );

  container.addEventListener(
    "dragleave",
    (e) => {
      handleDragLeave(e);
    },
    false,
  );

  container.addEventListener(
    "drop",
    (e) => {
      handleDrop(e);
    },
    false,
  );

  container._dragListenersAttached = true;
  console.log("  ✓ Attached drag listeners to container");
}

window.handleDragStart = handleDragStart;
window.refreshClassCardsContainer = refreshClassCardsContainer;
window.handleDragEnd = handleDragEnd;
window.handleDragOver = handleDragOver;
window.handleDragLeave = handleDragLeave;
window.handleDrop = handleDrop;
window.attachDragListeners = attachDragListeners;
window.showAssignmentHighlight = showAssignmentHighlight;
window.clearAssignmentHighlight = clearAssignmentHighlight;
window.filterAssignmentStudents = filterAssignmentStudents;
window.toggleAssignmentFilter = toggleAssignmentFilter;
window.clearAssignmentFilters = clearAssignmentFilters;
window.applyAssignmentFilters = applyAssignmentFilters;

function toggleCleanView() {
  window.cleanView = !window.cleanView;
  document.body.classList.toggle("clean-view", window.cleanView);
  const btn = document.getElementById("cleanViewBtn");
  if (btn) {
    btn.style.background = window.cleanView ? "var(--ink)" : "transparent";
    btn.style.color = window.cleanView ? "#fff" : "var(--ink-3)";
  }
}
window.toggleCleanView = toggleCleanView;

function showGradeInfoModal() {
  const props = (config.properties || []).filter(
    (p) =>
      p.enabled &&
      p.type !== "relationship" &&
      p.type !== "hard_toggle" &&
      p.name !== "gender",
  );
  const boolProps = props.filter((p) => p.type === "boolean");
  const catProps = props.filter((p) => p.type !== "boolean");

  const flagRows = boolProps
    .map(
      (p) => `
    <tr>
      <td style="padding:5px 10px 5px 0;font-weight:500;white-space:nowrap;">${p.display_name === "504 Plan" ? "504" : p.display_name}</td>
      <td style="padding:5px 0;color:var(--ink-3);font-size:12px;">${p.display_name}</td>
    </tr>`,
    )
    .join("");

  const catRows = catProps
    .map((p) => {
      const abbrev = {
        behavior: "BEH",
        independence: "IND",
        math: "MATH",
        reading: "READ"
      };
      const label = abbrev[p.name] || p.display_name.slice(0, 4).toUpperCase();

      // Behavior is inverted: green=cooperative, red=disruptive
      const invertedProps = ["behavior"];
      const isInverted = invertedProps.includes(p.name);

      const greenBg = "var(--sage-soft)";
      const redBg = "var(--rose-soft)";

      const highBg = isInverted ? redBg : greenBg;
      const lowBg = isInverted ? greenBg : redBg;

      const highDesc = p.name === "behavior" ? "Disruptive" : p.name === "independence" ? "Independent" : "High";
      const lowDesc = p.name === "behavior" ? "Cooperative" : p.name === "independence" ? "Dependent" : "Low";

      return `
    <tr>
      <td style="padding:5px 10px 5px 0;font-weight:500;white-space:nowrap;">
        <span class="chip" style="font-size:8px;padding:1px 4px;background:${highBg};margin-right:3px;">${label}</span>
        <span class="chip" style="font-size:8px;padding:1px 4px;background:${lowBg};">${label}</span>
      </td>
      <td style="padding:5px 0;color:var(--ink-3);font-size:12px;">${p.display_name} — Green: ${lowDesc}, Red: ${highDesc} (medium not shown)</td>
    </tr>`;
    })
    .join("");

  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:2000;display:flex;align-items:center;justify-content:center;";
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  overlay.innerHTML = `
    <div style="background:var(--panel);border-radius:12px;width:460px;max-width:90vw;max-height:80vh;overflow:auto;padding:24px;box-shadow:0 12px 40px rgba(0,0,0,0.2);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <h2 style="margin:0;font-size:18px;">Legend</h2>
        <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--ink-3);line-height:1;">×</button>
      </div>

      ${
        catProps.length > 0
          ? `
        <h3 style="font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin:0 0 10px;">Level indicators</h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px;">
          ${catRows}
        </table>
      `
          : ""
      }

      ${
        boolProps.length > 0
          ? `
        <h3 style="font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin:0 0 10px;">Flag chips</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          ${flagRows}
        </table>
      `
          : ""
      }

      <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--line-soft);">
        <h3 style="font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);margin:0 0 10px;">Hover indicators</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr><td style="padding:5px 10px 5px 0;font-weight:600;color:var(--sage);width:30px;">F</td><td style="padding:5px 0;color:var(--ink-3);font-size:12px;">Student has a friend in the same class</td></tr>
          <tr><td style="padding:5px 10px 5px 0;font-weight:600;color:var(--error);font-size:16px;">⊘</td><td style="padding:5px 0;color:var(--ink-3);font-size:12px;">Student is placed with an incompatible classmate</td></tr>
        </table>
      </div>
    </div>
  `;

  // Close button targets
  overlay.classList.add("modal-overlay");
  overlay
    .querySelector("button")
    .addEventListener("click", () => overlay.remove());

  document.body.appendChild(overlay);
}
window.showGradeInfoModal = showGradeInfoModal;

// Balance explanation modal
function showBalanceExplanationModal() {
  document.getElementById("balanceExplanationModal").classList.add("open");
}

function closeBalanceExplanationModal() {
  document.getElementById("balanceExplanationModal").classList.remove("open");
}

function showBalanceStatsModal() {
  // Get the current assignments to generate the advanced balance stats
  if (!window.currentAssignments || window.currentAssignments.length === 0) {
    return;
  }

  const numClasses = window.numClasses || 5;
  const classesList = Array.from({ length: numClasses }, (_, i) => ({
    number: i + 1,
    students: window.currentAssignments.filter(
      (a) => a.assigned_class === i + 1,
    ),
  }));

  // Generate advanced stats directly
  const assignmentConfig = window.assignmentConfig;
  const configToUse = assignmentConfig || config;
  const propertiesToAnalyze =
    configToUse.properties?.filter(
      (p) => p.enabled && p.type !== "relationship",
    ) || [];

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
      let balanceScore = "Optimal";
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

        // Calculate theoretical minimum variance
        const numClasses = countsForValue.length;
        const baseCount = Math.floor(totalCount / numClasses);
        const remainder = totalCount % numClasses;
        const bestCaseDistribution = new Array(numClasses).fill(baseCount);
        for (let i = 0; i < remainder; i++) {
          bestCaseDistribution[i]++;
        }
        const minVariance =
          bestCaseDistribution.reduce(
            (sum, count) => sum + Math.pow(count - avg, 2),
            0,
          ) / bestCaseDistribution.length;
        const minStdDev = Math.sqrt(minVariance);

        // Calculate theoretical maximum variance
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

          <div style="position: relative; height: 20px; margin-bottom: 6px;">
            <div style="position: absolute; top: 9px; left: 0; right: 0; height: 4px; background: linear-gradient(to right, var(--terra), var(--amber), var(--rose)); border-radius: 2px; opacity: 0.3;"></div>
            <div style="position: absolute; left: 0; top: 7px; width: 2px; height: 8px; background: var(--terra); border-radius: 1px;"></div>
            <div style="position: absolute; right: 0; top: 7px; width: 2px; height: 8px; background: var(--rose); border-radius: 1px;"></div>
            <div style="position: absolute; left: ${position}%; top: 6px; transform: translateX(-50%); width: 10px; height: 10px; background: ${achievedPerfection ? "var(--terra)" : "var(--ink)"}; border: 2px solid var(--panel); border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.2);"></div>
          </div>

          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <div style="font-size: 9px; font-family: var(--t-mono); color: var(--terra);">min ${detail.minStdDev.toFixed(2)}</div>
            <div style="font-size: 9px; font-family: var(--t-mono); color: var(--rose);">max ${detail.maxStdDev.toFixed(2)}</div>
          </div>

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
                ${window.classNames[cls.number] || `Class ${cls.number}`}
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

  const relationshipStats = calculateRelationshipStats(classesList);

  const advancedHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px;">
      ${statCards}
      ${relationshipStats}
    </div>
  `;

  // Create and show modal
  const modal = document.createElement("div");
  modal.className = "modal open";
  modal.innerHTML = `
    <div class="modal-backdrop" onclick="this.parentElement.remove()"></div>
    <div class="modal-content modal-large" style="max-width: 1200px;">
      <div class="modal-header">
        <h2>Detailed Balance Statistics</h2>
        <button class="btn-close" onclick="this.closest('.modal').remove()">×</button>
      </div>
      <div class="modal-body">
        ${advancedHTML}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

window.showBalanceExplanationModal = showBalanceExplanationModal;
window.closeBalanceExplanationModal = closeBalanceExplanationModal;
window.showBalanceStatsModal = showBalanceStatsModal;
window.toggleBalanceStatsView = toggleBalanceStatsView;

// Edit mode functions
async function toggleEditMode(enabled) {
  if (!enabled && window.hasUnsavedChanges) {
    const action = await showSavePrompt(
      "Save your manual changes before exiting edit mode?",
    );
    if (action === "cancel") {
      // Re-check the checkbox
      const cb = document.getElementById("editModeToggle");
      if (cb) cb.checked = true;
      return;
    }
    if (action === "save") {
      await saveManualChanges();
      return; // saveManualChanges re-renders with editMode=false
    }
    // discard: clear flag and fall through
    window.hasUnsavedChanges = false;
  }

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
      body: JSON.stringify({
        assignments: window.currentAssignments,
        update_baseline: true,
      }),
    });

    if (response.ok) {
      window.hasUnsavedChanges = false;
      window.editMode = false;
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
