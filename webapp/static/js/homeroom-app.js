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
    const res = await fetch(`${SUPABASE_URL}/functions/v1/validate-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ code }),
    });

    const data = await res.json();

    if (data.valid) {
      // Save activation locally
      await fetch("/api/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      // Offer restore from backup before starting
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
      statusEl.style.color = "var(--sage-ink)";
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
  if (!needsOnboarding) {
    await loadConfig();
    await loadGrades();
    showScreen("welcome");
  } else {
    setupDropZone();
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
      <button class="grade-delete-btn" title="Delete grade"
        onclick="event.stopPropagation(); confirmDeleteGrade('${g.id}', '${g.name.replace(/'/g, "\\'")}')">×</button>
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
    showNotice(`${name} is assigned to a class — unassign them first`, "error");
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
      await releaseLock(window.currentGradeId);
      window.currentGradeId = null;
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
    import: "Import students",
    students: "Roster",
    results: "Class assignments",
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
  } else if (screen === "students" || screen === "results") {
    content = await renderStudentsScreen();
  } else if (screen === "grade-settings") {
    content = await renderGradeSettingsScreen();
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
  // Default weights based on slider values (1-5 scale = 20-100 weight)
  const defaults = {
    gender: 40, // 2 = Medium
    behavior: 100, // 5 = Critical
    independence: 60, // 3 = Medium
    iep: 100, // 5 = Critical
    504: 100, // 5 = Critical
    esl: 80, // 4 = High
    gate: 60, // 3 = Medium
    math: 60, // 3 = Medium
    reading: 60, // 3 = Medium
    friends: 20, // 1 = Mild
  };

  // Update config properties
  config.properties.forEach((prop) => {
    if (defaults[prop.name] !== undefined) {
      prop.weight = defaults[prop.name];
    }
  });

  // Update friend_weight
  if (config.friend_weight !== undefined) {
    config.friend_weight = defaults["friends"];
  }

  // Save to server
  await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });

  // Re-render config screen
  showScreen("config");
  showNotice("Reset to default weights");
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

  // Prepare rules to display (custom or global)
  const rulesProperties = hasCustomRules
    ? data.custom_rules.properties
    : config.properties;

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
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:600px;margin-top:8px">
          <div class="panel" style="cursor:pointer" data-mutates="true"
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
          <div class="panel" style="cursor:pointer" onclick="openAddStudentModal()" data-mutates="true">
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
          <span style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--terra);font-weight:600;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="8" r="6"/>
              <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>
            </svg>
            Optimal assignment
          </span>
        `
            : ""
        }
        <div style="flex:1;min-width:8px;"></div>
        <button class="btn ghost" onclick="showScreen('grade-settings')" data-mutates="true"><i data-lucide="settings" style="width:13px;height:13px;display:inline-block;vertical-align:middle;margin-right:4px"></i>Settings</button>
        <button class="btn ghost" onclick="showImportModal()" data-mutates="true"><i data-lucide="upload" style="width:13px;height:13px;display:inline-block;vertical-align:middle;margin-right:4px"></i>Re‑import</button>
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
              const active = (window.assignmentFilterFlags || new Set()).has(
                p.name,
              );
              return `<button data-filter-flag="${p.name}" onclick="toggleAssignmentFilter('${p.name}')"
              style="height:30px;padding:0 10px;font-size:11px;border:1px solid var(--line);border-radius:var(--rad);cursor:pointer;transition:all 0.1s;background:${active ? "var(--ink)" : "transparent"};color:${active ? "#fff" : "var(--ink-3)"};">${label}</button>`;
            })
            .join("")}
          <button data-filter-flag="no_friends" onclick="toggleAssignmentFilter('no_friends')"
            style="height:30px;padding:0 10px;font-size:11px;border:1px solid var(--line);border-radius:var(--rad);cursor:pointer;transition:all 0.1s;background:${(window.assignmentFilterFlags || new Set()).has('no_friends') ? "var(--ink)" : "transparent"};color:${(window.assignmentFilterFlags || new Set()).has('no_friends') ? "#fff" : "var(--ink-3)"};">No friends</button>
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
    (s) => s.incompatible && s.incompatible.length > 0,
  );
  if (studentsWithIncompat.length > 0) {
    hardConstraints.push({
      name: "Incompatibility separation",
      isMandatory: true,
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

  // Check for class size constraint (if enforce_class_size is true)
  // Note: This would need to be passed from the grade data

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
          }

          return `
        <div style="margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 13px; font-weight: 500; color: var(--ink);">${stat.name}</span>
              ${stat.weightChanged ? '<span title="Weight changed since assignment" style="display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border-radius: 50%; background: var(--amber-soft); color: var(--amber-ink); font-size: 9px; font-weight: 700;">!</span>' : ""}
            </div>
            <span style="font-size: 11px; font-family: var(--t-mono); color: ${isMandatory ? "var(--terra)" : "var(--ink-3)"}; font-weight: 600;">
              ${isMandatory ? "✓ Met" : Math.round(optimality) + "% optimal"}
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
  if (allStudents.some((s) => "has_friend_in_class" in s)) {
    const studentsWithFriendsDefined = allStudents.filter((s) => {
      const friends = s.friends;
      return friends && friends.length > 0 && friends !== "[]";
    }).length;

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
    (s) => s.incompatible && s.incompatible.length > 0,
  );
  if (studentsWithIncompat.length > 0) {
    hardConstraints.push({
      name: "Incompatibility",
      isMandatory: true,
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

  // Add friendship stats
  if (allStudents.some((s) => "has_friend_in_class" in s)) {
    const studentsWithFriendsDefined = allStudents.filter((s) => {
      const friends = s.friends;
      return friends && friends.length > 0 && friends !== "[]";
    }).length;

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

          // Status indicator
          let status = "";
          let statusColor = "var(--ink-3)";
          if (isMandatory) {
            status = "✓ Met";
            statusColor = "var(--terra)";
          } else {
            const rounded = Math.round(optimality);
            status = `${rounded}%`;
            if (optimality >= 90) {
              statusColor = "var(--terra)";
            } else if (optimality >= 70) {
              statusColor = "var(--amber)";
            } else {
              statusColor = "var(--rose)";
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
    const qualityLabel = violationCount === 0 ? "Perfect" : "Violations";

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
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding: 12px 16px; background: ${window.hasUnsavedChanges ? "var(--amber-soft, var(--bg-2))" : "var(--bg-2)"}; border-radius: var(--rad); border: 1px solid ${window.hasUnsavedChanges ? "var(--amber, var(--line-soft))" : "var(--line-soft)"};">
        <div style="flex: 1; display: flex; align-items: center; gap: 12px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;" data-mutates="true">
            <input type="checkbox" id="editModeToggle" ${window.editMode ? "checked" : ""} onchange="toggleEditMode(this.checked)" style="width: 16px; height: 16px; cursor: pointer;" data-mutates="true">
            <span style="font-weight: 500; color: var(--ink);">Edit Mode</span>
          </label>
          ${
            window.hasUnsavedChanges && !window.editMode
              ? `<span style="font-size: 11px; color: var(--amber, var(--ink-3)); font-weight: 500;">● Unsaved changes</span>`
              : `<span style="font-size: 11px; color: var(--ink-3);">Enable to manually adjust class assignments</span>`
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

      ${classesList
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

                            // Abbreviation mapping
                            const abbrev = {
                              behavior: "BEH",
                              independence: "IND",
                              math: "MATH",
                              reading: "READ"
                            };
                            const label = abbrev[p.name] || p.display_name.slice(0, 4).toUpperCase();

                            // Behavior: red=disruptive, green=cooperative
                            // Independence: green=independent, red=dependent
                            // Academic: green=high, red=low
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
        .join("")}
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
      <div>
        <div class="nm" style="cursor:pointer;" title="Click to rename" data-mutates="true" onclick="startStudentNameEdit(this, '${student.name.replace(/'/g, "\\'")}')">${student.name}</div>
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

      <div class="detail-section" style="margin-top:auto; padding-top:16px; border-top:1px solid var(--line-soft)">
        <button class="btn ghost sm" style="color:var(--rose); border-color:var(--rose-soft); width:100%"
          onclick="confirmDeleteStudent('${student.name.replace(/'/g, "\\'")}')" data-mutates="true">
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

function startStudentNameEdit(el, currentName) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = currentName;
  input.style.cssText =
    "font:inherit;font-size:inherit;font-weight:inherit;color:inherit;background:transparent;border:none;border-bottom:1px solid var(--terra);outline:none;width:200px;padding:0;";
  el.replaceWith(input);
  input.focus();
  input.select();

  const finish = async () => {
    const newName = input.value.trim();
    if (!newName || newName === currentName) {
      input.replaceWith(el);
      return;
    }
    // Check for duplicate
    if ((window.currentStudents || []).some((s) => s.name === newName)) {
      showNotice("A student with that name already exists", "error");
      input.replaceWith(el);
      return;
    }
    await renameStudent(currentName, newName);
  };

  input.addEventListener("blur", finish);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") {
      input.value = currentName;
      input.blur();
    }
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

  const customCols = (config.properties || [])
    .filter((p) => p.custom)
    .map((prop) => ({
      prop,
      idx: headers.findIndex(
        (h) =>
          h === prop.name ||
          h === prop.display_name.toLowerCase().replace(/\s+/g, "_"),
      ),
    }));

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
    const customData = {};
    customCols.forEach(({ prop, idx }) => {
      if (prop.type === "boolean") {
        customData[prop.name] =
          idx !== -1 ? normalizeYesNo(cells[idx]) === "y" : false;
      } else {
        customData[prop.name] =
          idx !== -1
            ? cells[idx]?.trim() || prop.values?.[0] || ""
            : prop.values?.[0] || "";
      }
    });
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
      ...customData,
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

  const customCols = (config.properties || [])
    .filter((p) => p.custom)
    .map((prop) => ({
      prop,
      idx: headers.findIndex(
        (h) =>
          h === prop.name ||
          h === prop.display_name.toLowerCase().replace(/\s+/g, "_"),
      ),
    }));

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
    const customData = {};
    customCols.forEach(({ prop, idx }) => {
      if (prop.type === "boolean") {
        customData[prop.name] =
          idx !== -1 ? normalizeYesNo(cells[idx]) === "y" : false;
      } else {
        customData[prop.name] =
          idx !== -1
            ? cells[idx]?.trim() || prop.values?.[0] || ""
            : prop.values?.[0] || "";
      }
    });
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
      ...customData,
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
          You can view students and assignments in <strong>read-only mode</strong>, but you won't be able to make changes until they finish.
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
      statusEl.style.color = "var(--sage-ink)";
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
  } else {
    // Class-to-class move inside edit mode — requires explicit save
    window.hasUnsavedChanges = true;
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
  applyAssignmentFilters();
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
