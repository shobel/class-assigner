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

    return `
      <div class="transition-grade">
        <div class="transition-grade-header">
          <h3>${gradeName}</h3>
          <span class="count">${activeStudents.length} student${activeStudents.length !== 1 ? 's' : ''}</span>
        </div>

        ${gradeName === 'Kindergarten' ? `
          <div class="transition-grade-actions">
            <label class="btn" style="cursor: pointer;">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="flex-shrink: 0;">
                <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              Import CSV
              <input type="file" accept=".csv" style="display:none" onchange="importKindergartenCSV(event, '${gradeName}')">
            </label>
          </div>
        ` : ''}

        <div
          class="transition-students"
          ondragover="handleDragOver(event)"
          ondrop="handleDrop(event, '${gradeName}')"
          ondragenter="handleDragEnter(event)"
          ondragleave="handleDragLeave(event)"
        >
          ${students.length === 0 ? `
            <div class="empty-grade">No students yet${gradeName === 'Kindergarten' ? '. Import CSV' : ''}.</div>
          ` : students.map((s, idx) => {
            const initials = s.name.split(' ').map(n => n[0]).join('');
            const displayName = s.name.toLowerCase();
            const searchTerm = (window.transitionSearchTerm || '').toLowerCase();
            const isVisible = !searchTerm || displayName.includes(searchTerm);

            // Build flags array
            const flags = [];
            if (s.iep) flags.push('IEP');
            if (s['504']) flags.push('504');
            if (s.esl) flags.push('ESL');
            if (s.gate) flags.push('GATE');

            return `
              <div
                class="transition-student ${s.removed ? 'removed' : ''} ${!isVisible ? 'hidden' : ''}"
                id="student-${gradeName}-${idx}"
                draggable="${!s.removed ? 'true' : 'false'}"
                ondragstart="handleDragStart(event, '${gradeName}', ${idx})"
                ondragend="handleDragEnd(event)"
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
                    <button class="student-remove-btn" onclick="removeStudent('${gradeName}', ${idx})" title="Remove student">
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                      </svg>
                    </button>
                  ` : `
                    <button class="student-undo-btn" onclick="restoreStudent('${gradeName}', ${idx})">
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style="margin-right: 4px;">
                        <path d="M3 8h10M6 5l-3 3 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                      Undo
                    </button>
                  `}
                </div>
              </div>
            `;
          }).join('')}
        </div>
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

function handleDragStart(event, gradeName, idx) {
  draggedTransitionStudent = { gradeName, idx };
  event.target.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/html', event.target.innerHTML);
}

function handleDragEnd(event) {
  event.target.classList.remove('dragging');
  // Remove all drag-over classes
  document.querySelectorAll('.transition-students').forEach(el => {
    el.classList.remove('drag-over');
  });
}

function handleDragOver(event) {
  if (event.preventDefault) {
    event.preventDefault();
  }
  event.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDragEnter(event) {
  if (event.currentTarget.classList.contains('transition-students')) {
    event.currentTarget.classList.add('drag-over');
  }
}

function handleDragLeave(event) {
  if (event.currentTarget.classList.contains('transition-students') &&
      !event.currentTarget.contains(event.relatedTarget)) {
    event.currentTarget.classList.remove('drag-over');
  }
}

function handleDrop(event, toGrade) {
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

  // Move the student
  const student = transitionData.grades[fromGrade][idx];
  transitionData.grades[toGrade].push({ ...student, fromGrade: fromGrade });
  transitionData.grades[fromGrade].splice(idx, 1);

  draggedTransitionStudent = null;
  renderTransitionGrades();

  return false;
}

function moveStudent(fromGrade, idx, toGrade) {
  if (!toGrade) return;

  const student = transitionData.grades[fromGrade][idx];
  transitionData.grades[toGrade].push({ ...student, fromGrade: fromGrade });
  transitionData.grades[fromGrade].splice(idx, 1);

  renderTransitionGrades();
}

function removeStudent(gradeName, idx) {
  transitionData.grades[gradeName][idx].removed = true;
  renderTransitionGrades();
}

function restoreStudent(gradeName, idx) {
  transitionData.grades[gradeName][idx].removed = false;
  renderTransitionGrades();
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

  renderTransitionGrades();
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

window.showTransitionWizard = showTransitionWizard;
window.closeTransitionWizard = closeTransitionWizard;
window.confirmTransition = confirmTransition;
window.moveStudent = moveStudent;
window.removeStudent = removeStudent;
window.restoreStudent = restoreStudent;
window.importKindergartenCSV = importKindergartenCSV;
window.searchTransitionStudents = searchTransitionStudents;
window.clearTransitionSearch = clearTransitionSearch;
window.handleDragStart = handleDragStart;
window.handleDragEnd = handleDragEnd;
window.handleDragOver = handleDragOver;
window.handleDragEnter = handleDragEnter;
window.handleDragLeave = handleDragLeave;
window.handleDrop = handleDrop;
