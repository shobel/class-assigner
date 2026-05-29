// School Year Transition Wizard

let transitionData = {
  nextYear: '',
  grades: {},
  gradeSettings: {}  // num_classes, available_teachers per grade
};

// Show transition wizard
async function showTransitionWizard() {
  const config = await (await fetch('/api/config')).json();
  const currentYear = config.active_school_year;

  // Calculate next year
  const startYear = parseInt(currentYear.split('–')[0]);
  const nextYear = `${startYear + 1}–${String(startYear + 2).slice(-2)}`;

  transitionData.nextYear = nextYear;
  transitionData.maxGrade = config.max_grade || '8th Grade';
  document.getElementById('next-year-name').textContent = nextYear;

  // Load current year data
  const currentData = await (await fetch(`/api/grades`)).json();

  // Prepare promoted grades
  const allGradeOrder = ['Kindergarten', '1st Grade', '2nd Grade', '3rd Grade', '4th Grade', '5th Grade', '6th Grade', '7th Grade', '8th Grade'];
  const maxGrade = config.max_grade || '8th Grade';
  const maxGradeIdx = allGradeOrder.indexOf(maxGrade);

  const fullGradeMap = {
    'kindergarten': '1st Grade',
    '1st_grade': '2nd Grade',
    '2nd_grade': '3rd Grade',
    '3rd_grade': '4th Grade',
    '4th_grade': '5th Grade',
    '5th_grade': '6th Grade',
    '6th_grade': '7th Grade',
    '7th_grade': '8th Grade'
  };

  // Only include promotions that land at or below max_grade
  const gradeMap = {};
  for (const [from, to] of Object.entries(fullGradeMap)) {
    if (allGradeOrder.indexOf(to) <= maxGradeIdx) {
      gradeMap[from] = to;
    }
    // Students at max grade are graduated — simply omit them
  }

  transitionData.grades = {
    'Kindergarten': []  // Empty for new students
  };
  transitionData.gradeSettings = {};

  // Carry Kindergarten's own settings forward (it keeps its slot, just gets new students)
  const kinderGrade = currentData.find(g => g.id === 'kindergarten');
  if (kinderGrade) {
    const kinderRes = await fetch(`/api/grades/kindergarten/students`);
    const kinderData = await kinderRes.json();
    transitionData.gradeSettings['Kindergarten'] = {
      num_classes: kinderData.num_classes || 3,
      available_teachers: kinderData.available_teachers || [],
    };
  }

  // Load students and promote them
  for (const grade of currentData) {
    const nextGradeName = gradeMap[grade.id];
    if (nextGradeName) {
      // Fetch students (includes teachers list and grade settings)
      const studentsRes = await fetch(`/api/grades/${grade.id}/students`);
      const studentsData = await studentsRes.json();
      const teachers = studentsData.teachers || [];

      // Carry grade settings to the promoted grade
      transitionData.gradeSettings[nextGradeName] = {
        num_classes: studentsData.num_classes || 5,
        available_teachers: studentsData.available_teachers || [],
      };

      // Fetch assignments to know which class each student was in
      const assignRes = await fetch(`/api/grades/${grade.id}/assignments`);
      const assignData = await assignRes.json();
      const assignmentMap = {};
      for (const a of (assignData.assignments || [])) {
        assignmentMap[a.name] = a.assigned_class;
      }

      transitionData.grades[nextGradeName] = studentsData.students.map(s => {
        // Look up this student's teacher from their assigned class
        const assignedClass = assignmentMap[s.name];
        const teacher = assignedClass ? (teachers[assignedClass - 1] || '') : '';

        // Merge into previous_teachers
        const existing = Array.isArray(s.previous_teachers)
          ? s.previous_teachers
          : (s.previous_teachers ? String(s.previous_teachers).split('|').map(t => t.trim()).filter(Boolean) : []);
        const updatedTeachers = teacher && !existing.includes(teacher)
          ? [...existing, teacher]
          : existing;

        return {
          ...s,
          previous_teachers: updatedTeachers,
          fromGrade: grade.name,
          removed: false,
          isNew: false
        };
      });
    }
  }

  renderTransitionGrades();
  document.getElementById('transitionWizard').classList.add('open');
}

function _transitionStudentListHTML(gradeName, students) {
  if (students.length === 0) {
    return `<div class="empty-grade">No students yet${gradeName === 'Kindergarten' ? '. Import CSV' : ''}.</div>`;
  }
  const searchTerm = (window.transitionSearchTerm || '').toLowerCase();
  return students.map((s, idx) => {
    const initials = s.name.split(' ').map(n => n[0]).join('');
    const isVisible = !searchTerm || s.name.toLowerCase().includes(searchTerm);
    const flags = [];
    if (s.iep) flags.push('IEP');
    if (s['504']) flags.push('504');
    if (s.esl) flags.push('ESL');
    if (s.gate) flags.push('GATE');
    const esc = gradeName.replace(/'/g, "\\'");
    return `
      <div
        class="transition-student ${s.removed ? 'removed' : ''} ${!isVisible ? 'hidden' : ''}"
        id="student-${gradeName}-${idx}"
        draggable="${!s.removed ? 'true' : 'false'}"
        ondragstart="handleTransitionDragStart(event, '${esc}', ${idx})"
        ondragend="handleTransitionDragEnd(event)"
      >
        <div class="student-main">
          <div class="drag-handle">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <circle cx="5" cy="4" r="1" fill="currentColor"/>
              <circle cx="5" cy="8" r="1" fill="currentColor"/>
              <circle cx="5" cy="12" r="1" fill="currentColor"/>
              <circle cx="11" cy="4" r="1" fill="currentColor"/>
              <circle cx="11" cy="8" r="1" fill="currentColor"/>
              <circle cx="11" cy="12" r="1" fill="currentColor"/>
            </svg>
          </div>
          <div class="avatar ${s.gender}">${initials}</div>
          <div class="student-info">
            <div class="name">${s.name}</div>
            ${s.fromGrade ? `<div class="from-grade">from ${s.fromGrade}</div>` : ''}
          </div>
          ${s.isNew ? `<span class="chip-new">NEW</span>` : ''}
        </div>
        <div class="student-flags">
          ${flags.map(flag => `<span class="flag-chip">${flag}</span>`).join('')}
        </div>
        <div class="actions">
          ${!s.removed ? `
            <button class="student-remove-btn" onclick="removeStudent('${esc}', ${idx})" title="Remove student">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          ` : `
            <button class="student-undo-btn" onclick="restoreStudent('${esc}', ${idx})">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style="margin-right: 4px;">
                <path d="M3 8h10M6 5l-3 3 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Undo
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');
}

// Targeted refresh: only rebuild the student list for the given grade names.
// Much faster than renderTransitionGrades() when only 1–2 grades change.
function _refreshTransitionGrade(gradeName) {
  const students = transitionData.grades[gradeName] || [];
  const activeCount = students.filter(s => !s.removed).length;

  const studentsEl = document.querySelector(`.transition-students[data-grade="${CSS.escape(gradeName)}"]`);
  if (studentsEl) studentsEl.innerHTML = _transitionStudentListHTML(gradeName, students);

  const gradeCol = studentsEl?.closest('.transition-grade');
  if (gradeCol) {
    const countEl = gradeCol.querySelector('.count');
    if (countEl) countEl.textContent = `${activeCount} student${activeCount !== 1 ? 's' : ''}`;
  }

  updateStudentCount();
}

function renderTransitionGrades() {
  const container = document.getElementById('transitionGrades');

  const allGradeOrder = ['Kindergarten', '1st Grade', '2nd Grade', '3rd Grade', '4th Grade', '5th Grade', '6th Grade', '7th Grade', '8th Grade'];
  const maxGrade = (window.config || {}).max_grade || transitionData.maxGrade || '8th Grade';
  const maxGradeIdx = allGradeOrder.indexOf(maxGrade);
  const gradeOrder = maxGradeIdx >= 0 ? allGradeOrder.slice(0, maxGradeIdx + 1) : allGradeOrder;

  container.innerHTML = gradeOrder.map(gradeName => {
    if (!transitionData.grades[gradeName]) return '';

    const students = transitionData.grades[gradeName];
    const activeStudents = students.filter(s => !s.removed);
    const esc = gradeName.replace(/'/g, "\\'");

    return `
      <div class="transition-grade">
        <div class="transition-grade-header">
          <h3>${gradeName}</h3>
          <span class="count">${activeStudents.length} student${activeStudents.length !== 1 ? 's' : ''}</span>
          <button class="btn ghost sm" onclick="showTransitionAddStudent('${esc}')"
            style="padding:2px 8px;font-size:15px;line-height:1;margin-left:auto;flex-shrink:0;" title="Add student">+</button>
        </div>
        <div
          class="transition-students"
          data-grade="${gradeName}"
          ondragover="handleTransitionDragOver(event)"
          ondrop="handleTransitionDrop(event, '${esc}')"
          ondragenter="handleTransitionDragEnter(event)"
          ondragleave="handleTransitionDragLeave(event)"
        >${_transitionStudentListHTML(gradeName, students)}</div>
      </div>
    `;
  }).filter(Boolean).join('');

  updateStudentCount();
}

function searchTransitionStudents(searchTerm) {
  window.transitionSearchTerm = searchTerm;

  // Show/hide clear button
  const clearBtn = document.getElementById('transitionSearchClear');
  if (clearBtn) {
    clearBtn.style.display = searchTerm ? 'flex' : 'none';
  }

  renderTransitionGrades();
}

function clearTransitionSearch() {
  const input = document.getElementById('transitionSearchInput');
  if (input) {
    input.value = '';
    searchTransitionStudents('');
  }
}

// Drag and drop handlers
let draggedTransitionStudent = null;

function handleTransitionDragStart(event, gradeName, idx) {
  draggedTransitionStudent = { gradeName, idx };
  event.target.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/html', event.target.innerHTML);
}

function handleTransitionDragEnd(event) {
  event.target.classList.remove('dragging');
  // Remove all drag-over classes
  document.querySelectorAll('.transition-students').forEach(el => {
    el.classList.remove('drag-over');
  });
}

function handleTransitionDragOver(event) {
  if (event.preventDefault) {
    event.preventDefault();
  }
  event.dataTransfer.dropEffect = 'move';
  return false;
}

function handleTransitionDragEnter(event) {
  if (event.currentTarget.classList.contains('transition-students')) {
    event.currentTarget.classList.add('drag-over');
  }
}

function handleTransitionDragLeave(event) {
  if (event.currentTarget.classList.contains('transition-students') &&
      !event.currentTarget.contains(event.relatedTarget)) {
    event.currentTarget.classList.remove('drag-over');
  }
}

function handleTransitionDrop(event, toGrade) {
  if (event.stopPropagation) {
    event.stopPropagation();
  }
  event.preventDefault();

  event.currentTarget.classList.remove('drag-over');

  if (!draggedTransitionStudent) return false;

  const { gradeName: fromGrade, idx } = draggedTransitionStudent;

  // Don't do anything if dropping in the same grade
  if (fromGrade === toGrade) {
    draggedTransitionStudent = null;
    return false;
  }

  // Block if target grade already has a student with the same name
  const student = transitionData.grades[fromGrade][idx];
  const conflict = (transitionData.grades[toGrade] || []).some(s => !s.removed && s.name === student.name);
  if (conflict) {
    showNotice(`${toGrade} already has a student named "${student.name}"`, 'error');
    draggedTransitionStudent = null;
    return false;
  }

  transitionData.grades[toGrade].push({ ...student, fromGrade: fromGrade });
  transitionData.grades[fromGrade].splice(idx, 1);

  draggedTransitionStudent = null;
  _refreshTransitionGrade(fromGrade);
  _refreshTransitionGrade(toGrade);

  return false;
}

function moveStudent(fromGrade, idx, toGrade) {
  if (!toGrade) return;

  const student = transitionData.grades[fromGrade][idx];
  const conflict = (transitionData.grades[toGrade] || []).some(s => !s.removed && s.name === student.name);
  if (conflict) {
    showNotice(`${toGrade} already has a student named "${student.name}"`, 'error');
    return;
  }

  transitionData.grades[toGrade].push({ ...student, fromGrade: fromGrade });
  transitionData.grades[fromGrade].splice(idx, 1);

  _refreshTransitionGrade(fromGrade);
  _refreshTransitionGrade(toGrade);
}

function removeStudent(gradeName, idx) {
  transitionData.grades[gradeName][idx].removed = true;
  _refreshTransitionGrade(gradeName);
}

function restoreStudent(gradeName, idx) {
  transitionData.grades[gradeName][idx].removed = false;
  _refreshTransitionGrade(gradeName);
}

async function importKindergartenCSV(event, gradeName) {
  const file = event.target.files[0];
  if (!file) return;

  const text = await file.text();
  const lines = text.split('\n').filter(l => l.trim());

  // Parse CSV (simple parser - assumes first row is header)
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('student'));
  const genderIdx = headers.findIndex(h => h.includes('gender') || h.includes('sex'));

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.trim());
    if (cells.length < 2) continue;

    const name = cells[nameIdx] || cells[0];
    const gender = cells[genderIdx] || '';

    transitionData.grades[gradeName].push({
      name: name,
      gender: gender.toLowerCase().startsWith('f') || gender.toLowerCase().startsWith('g') ? 'g' : 'b',
      behavior: 'neutral',
      independence: 'neutral',
      iep: false,
      '504': false,
      esl: false,
      gate: false,
      math: 'm',
      reading: 'm',
      friends: '',
      incompatible: '',
      removed: false,
      isNew: true
    });
  }

  _refreshTransitionGrade(gradeName);
}

function updateStudentCount() {
  let total = 0;
  Object.values(transitionData.grades).forEach(students => {
    total += students.filter(s => !s.removed).length;
  });
  document.getElementById('transition-total-students').textContent = total;
}

function closeTransitionWizard() {
  document.getElementById('transitionWizard').classList.remove('open');
}

async function confirmTransition() {
  const total = document.getElementById('transition-total-students').textContent;
  const ok = await showConfirm(`Create ${transitionData.nextYear} with ${total} students?`, { confirmLabel: 'Create' });
  if (!ok) return;

  // Prepare data for new year
  const newYearData = {};

  for (const [gradeName, students] of Object.entries(transitionData.grades)) {
    const activeStudents = students.filter(s => !s.removed).map(s => {
      const { fromGrade, removed, isNew, ...cleanStudent } = s;
      return cleanStudent;
    });

    if (activeStudents.length > 0 || gradeName === 'Kindergarten') {
      const settings = transitionData.gradeSettings[gradeName] || {};
      newYearData[gradeName] = {
        students: activeStudents,
        num_classes: settings.num_classes || (gradeName === 'Kindergarten' ? 3 : 5),
        available_teachers: settings.available_teachers || [],
        assignments: []
      };
    }
  }

  // Save new year via API
  const res = await fetch('/api/school-years/create-next-manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      year: transitionData.nextYear,
      data: newYearData
    })
  });

  if (res.ok) {
    closeTransitionWizard();
    await loadConfig();
    await loadGrades();
    showScreen('welcome');
    showNotice(`${transitionData.nextYear} created successfully!`);
  } else {
    showNotice('Error creating school year', 'error');
  }
}

function showTransitionAddStudent(gradeName) {
  // Build local state — mirrors the student object shape
  const studentData = {
    gender: 'b', behavior: 'neutral', independence: 'neutral',
    iep: false, '504': false, esl: false, gate: false,
    math: 'm', reading: 'm', friends: '', incompatible: '', notes: '',
  };

  const customProps = (window.config?.properties || []).filter(p => p.custom && p.enabled !== false);

  // Build prop-rows for each built-in field
  const builtinRows = [
    { label: 'Gender',       key: 'gender',       opts: [{v:'g',l:'Girl'},{v:'b',l:'Boy'}] },
    { label: 'Behavior',     key: 'behavior',      opts: [{v:'cooperative',l:'Cooperative'},{v:'neutral',l:'Neutral'},{v:'disruptive',l:'Disruptive'}] },
    { label: 'Independence', key: 'independence',  opts: [{v:'high',l:'High'},{v:'neutral',l:'Neutral'},{v:'low',l:'Low'}] },
    { label: 'IEP',          key: 'iep',           opts: [{v:'false',l:'No'},{v:'true',l:'Yes'}] },
    { label: '504 Plan',     key: '504',           opts: [{v:'false',l:'No'},{v:'true',l:'Yes'}] },
    { label: 'ESL',          key: 'esl',           opts: [{v:'false',l:'No'},{v:'true',l:'Yes'}] },
    { label: 'GATE',         key: 'gate',          opts: [{v:'false',l:'No'},{v:'true',l:'Yes'}] },
    { label: 'Math level',   key: 'math',          opts: [{v:'l',l:'Low'},{v:'m',l:'Med'},{v:'h',l:'High'}] },
    { label: 'Reading level',key: 'reading',       opts: [{v:'l',l:'Low'},{v:'m',l:'Med'},{v:'h',l:'High'}] },
  ].map(({label, key, opts}) => {
    const def = String(studentData[key]);
    return `<div class="prop-row" data-key="${key}">
      <span class="k">${label}</span>
      <div class="segmented">
        ${opts.map(o => `<button class="seg${o.v === def ? ' active' : ''}" data-value="${o.v}">${o.l}</button>`).join('')}
      </div>
    </div>`;
  }).join('');

  const customRows = customProps.map(prop => {
    const opts = prop.type === 'boolean'
      ? [{v:'false',l:'No'},{v:'true',l:'Yes'}]
      : (prop.values || []).map(v => ({v, l:v}));
    studentData[prop.name] = prop.type === 'boolean' ? false : (prop.values?.[0] ?? '');
    const def = String(studentData[prop.name]);
    return `<div class="prop-row" data-key="${prop.name}">
      <span class="k">${prop.display_name}</span>
      <div class="segmented">
        ${opts.map(o => `<button class="seg${o.v === def ? ' active' : ''}" data-value="${o.v}">${o.l}</button>`).join('')}
      </div>
    </div>`;
  }).join('');

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:2000;display:flex;align-items:center;justify-content:center;';

  const card = document.createElement('div');
  card.style.cssText = 'background:var(--bg);border:1px solid var(--line);border-radius:var(--rad-lg);width:460px;max-width:calc(100vw - 32px);max-height:calc(100vh - 64px);display:flex;flex-direction:column;box-shadow:0 4px 24px rgba(0,0,0,0.12);';

  card.innerHTML = `
    <div style="padding:16px 20px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
      <span style="font-weight:600;font-size:14px;">Add student to ${gradeName}</span>
      <button id="trans-add-cancel" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--ink-3);line-height:1;">✕</button>
    </div>
    <div style="overflow-y:auto;padding:20px;flex:1;">
      <div style="margin-bottom:16px;">
        <label style="font-size:12px;font-weight:600;color:var(--ink-3);display:block;margin-bottom:4px;">Name</label>
        <input id="trans-add-name" type="text" placeholder="Full name"
          style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--line);border-radius:var(--rad);font-size:13px;font-family:inherit;background:var(--bg);color:var(--ink);outline:none;">
      </div>
      <div style="font-size:12px;font-weight:600;color:var(--ink-3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">Properties</div>
      <div class="detail-section" style="border:1px solid var(--line);border-radius:var(--rad);overflow:hidden;margin-bottom:16px;">
        ${builtinRows}
        ${customRows}
      </div>
      ${customProps.length === 0 ? '' : ''}
      <div>
        <label style="font-size:12px;font-weight:600;color:var(--ink-3);display:block;margin-bottom:4px;">Notes</label>
        <textarea id="trans-add-notes" rows="2" placeholder="Optional notes about this student…"
          style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--line);border-radius:var(--rad);font-size:13px;font-family:inherit;background:var(--bg);color:var(--ink);resize:vertical;outline:none;"></textarea>
      </div>
      <div id="trans-add-err" style="font-size:12px;color:var(--rose);margin-top:8px;display:none;"></div>
    </div>
    <div style="padding:14px 20px;border-top:1px solid var(--line);display:flex;gap:8px;flex-shrink:0;">
      <button id="trans-add-confirm" style="flex:1;padding:9px;border:none;border-radius:var(--rad);font-size:13px;font-family:inherit;background:var(--terra);color:#fff;font-weight:500;cursor:pointer;">Add student</button>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // Segmented button interaction — updates studentData
  card.querySelectorAll('.segmented').forEach(group => {
    const key = group.closest('[data-key]').dataset.key;
    group.addEventListener('click', e => {
      const btn = e.target.closest('.seg');
      if (!btn) return;
      group.querySelectorAll('.seg').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const raw = btn.dataset.value;
      studentData[key] = raw === 'true' ? true : raw === 'false' ? false : raw;
    });
  });

  const nameInput = card.querySelector('#trans-add-name');
  const errEl = card.querySelector('#trans-add-err');
  nameInput.addEventListener('input', () => { errEl.style.display = 'none'; });

  const close = () => overlay.remove();

  const confirm = () => {
    const name = nameInput.value.trim();
    if (!name) { errEl.textContent = 'Please enter a name.'; errEl.style.display = 'block'; nameInput.focus(); return; }
    const conflict = (transitionData.grades[gradeName] || []).some(s => !s.removed && s.name === name);
    if (conflict) { errEl.textContent = `${gradeName} already has a student named "${name}".`; errEl.style.display = 'block'; return; }
    transitionData.grades[gradeName].push({
      ...studentData,
      name,
      notes: card.querySelector('#trans-add-notes').value.trim(),
      friends: '', incompatible: '',
      removed: false, isNew: true,
    });
    close();
    _refreshTransitionGrade(gradeName);
  };

  card.querySelector('#trans-add-confirm').addEventListener('click', confirm);
  card.querySelector('#trans-add-cancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  nameInput.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  nameInput.focus();
}

window.showTransitionWizard = showTransitionWizard;
window.closeTransitionWizard = closeTransitionWizard;
window.confirmTransition = confirmTransition;
window.showTransitionAddStudent = showTransitionAddStudent;
window.moveStudent = moveStudent;
window.removeStudent = removeStudent;
window.restoreStudent = restoreStudent;
window.importKindergartenCSV = importKindergartenCSV;
window.searchTransitionStudents = searchTransitionStudents;
window.clearTransitionSearch = clearTransitionSearch;
window.handleTransitionDragStart = handleTransitionDragStart;
window.handleTransitionDragEnd = handleTransitionDragEnd;
window.handleTransitionDragOver = handleTransitionDragOver;
window.handleTransitionDragEnter = handleTransitionDragEnter;
window.handleTransitionDragLeave = handleTransitionDragLeave;
window.handleTransitionDrop = handleTransitionDrop;
