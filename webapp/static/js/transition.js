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

        <div class="transition-grade-actions">
          ${gradeName === 'Kindergarten' ? `
            <label class="btn sm ghost" style="cursor: pointer;">
              Import CSV
              <input type="file" accept=".csv" style="display:none" onchange="importKindergartenCSV(event, '${gradeName}')">
            </label>
          ` : ''}
          <button class="btn sm ghost" onclick="toggleAddStudent('${gradeName}')">+ Add student</button>
        </div>

        <div class="add-student-form" id="add-form-${gradeName}">
          <div class="form-row">
            <input type="text" placeholder="First name" id="fname-${gradeName}">
            <input type="text" placeholder="Last name" id="lname-${gradeName}">
          </div>
          <div class="form-row">
            <select id="gender-${gradeName}" style="height: 28px; padding: 0 8px; border: 1px solid var(--line); border-radius: var(--rad); background: var(--panel); color: var(--ink); font: inherit; font-size: 12px;">
              <option value="g">Girl</option>
              <option value="b">Boy</option>
            </select>
            <select id="math-${gradeName}" style="height: 28px; padding: 0 8px; border: 1px solid var(--line); border-radius: var(--rad); background: var(--panel); color: var(--ink); font: inherit; font-size: 12px;">
              <option value="m">Math: Medium</option>
              <option value="h">Math: High</option>
              <option value="l">Math: Low</option>
            </select>
          </div>
          <div class="form-actions">
            <button class="btn sm ghost" onclick="toggleAddStudent('${gradeName}')">Cancel</button>
            <button class="btn sm primary" onclick="addStudent('${gradeName}')">Add</button>
          </div>
        </div>

        <div class="transition-students">
          ${students.length === 0 ? `
            <div class="empty-grade">No students yet. Import CSV or add individually.</div>
          ` : students.map((s, idx) => {
            const initials = s.name.split(' ').map(n => n[0]).join('');
            return `
              <div class="transition-student ${s.removed ? 'removed' : ''}" id="student-${gradeName}-${idx}">
                <div class="avatar ${s.gender}">${initials}</div>
                <div class="name">${s.name}</div>
                ${s.fromGrade ? `<span style="font-size: 10px; color: var(--ink-4);">from ${s.fromGrade}</span>` : ''}
                ${s.isNew ? `<span class="chip" style="background: var(--sage-soft); color: var(--sage-ink); font-size: 9px;">NEW</span>` : ''}
                <div class="actions">
                  ${!s.removed ? `
                    <select class="btn-tiny" style="height: auto; padding: 2px 4px;" onchange="moveStudent('${gradeName}', ${idx}, this.value)">
                      <option value="">Move to...</option>
                      ${gradeOrder.filter(g => g !== gradeName && transitionData.grades[g]).map(g =>
                        `<option value="${g}">${g}</option>`
                      ).join('')}
                    </select>
                    <button class="btn-tiny ghost" onclick="removeStudent('${gradeName}', ${idx})">✕</button>
                  ` : `
                    <button class="btn-tiny ghost" onclick="restoreStudent('${gradeName}', ${idx})">↶ Undo</button>
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

function toggleAddStudent(gradeName) {
  const form = document.getElementById(`add-form-${gradeName}`);
  form.classList.toggle('open');
}

function addStudent(gradeName) {
  const fname = document.getElementById(`fname-${gradeName}`).value.trim();
  const lname = document.getElementById(`lname-${gradeName}`).value.trim();
  const gender = document.getElementById(`gender-${gradeName}`).value;
  const math = document.getElementById(`math-${gradeName}`).value;

  if (!fname || !lname) {
    showNotice('Please enter first and last name', 'error');
    return;
  }

  const newStudent = {
    name: `${fname} ${lname}`,
    gender: gender,
    behavior: 'neutral',
    independence: 'neutral',
    iep: false,
    '504': false,
    esl: false,
    gate: false,
    math: math,
    reading: 'm',
    friends: '',
    incompatible: '',
    removed: false,
    isNew: true
  };

  transitionData.grades[gradeName].push(newStudent);

  // Clear form
  document.getElementById(`fname-${gradeName}`).value = '';
  document.getElementById(`lname-${gradeName}`).value = '';

  toggleAddStudent(gradeName);
  renderTransitionGrades();
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
window.toggleAddStudent = toggleAddStudent;
window.addStudent = addStudent;
window.moveStudent = moveStudent;
window.removeStudent = removeStudent;
window.restoreStudent = restoreStudent;
window.importKindergartenCSV = importKindergartenCSV;
