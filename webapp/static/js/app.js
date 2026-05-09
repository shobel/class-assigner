// Global state
let config = null;
let students = {};
let currentGrade = null;
let csvPreviewData = null;
let csvFullData = null;

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();
    await loadStudents();
    renderGradeList();
    checkInitialState();
});

// ============================================================================
// Config Management
// ============================================================================

async function loadConfig() {
    const response = await fetch('/api/config');
    config = await response.json();
}

async function saveConfig() {
    const properties = config.properties.map((prop, idx) => {
        return {
            ...prop,
            weight: parseInt(document.getElementById(`weight_${idx}`).value)
        };
    });

    config.properties = properties;
    config.friend_weight = parseInt(document.getElementById('friendWeight').value);

    await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    });

    closeConfigModal();
    alert('Configuration saved!');
}

function showConfigModal() {
    const modal = document.getElementById('configModal');
    const list = document.getElementById('configPropertiesList');

    list.innerHTML = `
        <table class="config-table">
            <thead>
                <tr>
                    <th>Property</th>
                    <th>Values</th>
                    <th style="text-align: right;">Weight</th>
                </tr>
            </thead>
            <tbody>
                ${config.properties.map((prop, idx) => `
                    <tr class="config-row">
                        <td>
                            <span class="config-icon">${prop.icon}</span>
                            <span class="config-name">${prop.display_name}</span>
                        </td>
                        <td class="config-values">${prop.values.join(', ')}</td>
                        <td class="config-weight-cell">
                            <input type="number" id="weight_${idx}" value="${prop.weight}"
                                   min="0" max="200" step="10" class="weight-input">
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>

        <div class="config-divider"></div>

        <div class="config-friend-row">
            <div>
                <span class="config-icon">🤝</span>
                <span class="config-name">Friend Placement Weight</span>
            </div>
            <input type="number" id="friendWeight" value="${config.friend_weight}"
                   min="0" max="200" step="10" class="weight-input">
        </div>

        <div class="config-help">
            <strong>💡 Quick Guide:</strong> Higher weights = higher priority.
            Problematic & Special Needs at 100 ensures balanced distribution.
            Friend weight at 30 means "nice to have, but not at expense of balance."
        </div>
    `;

    modal.classList.add('open');
}

function closeConfigModal() {
    document.getElementById('configModal').classList.remove('open');
}

function showBalanceInfoModal() {
    document.getElementById('balanceInfoModal').classList.add('open');
}

function closeBalanceInfoModal() {
    document.getElementById('balanceInfoModal').classList.remove('open');
}

// ============================================================================
// Students Management
// ============================================================================

async function loadStudents() {
    const response = await fetch('/api/students');
    students = await response.json();
}

function renderGradeList() {
    const list = document.getElementById('gradeList');

    if (Object.keys(students).length === 0) {
        list.innerHTML = '<p style="color: var(--text-secondary); font-size: 13px; padding: 8px;">No grades imported yet</p>';
        return;
    }

    list.innerHTML = Object.keys(students).map(grade => {
        const data = students[grade];
        return `
            <div class="grade-item ${grade === currentGrade ? 'active' : ''}"
                 onclick="selectGrade('${grade}')">
                <div class="grade-item-header">
                    <span>${grade}</span>
                </div>
                <div class="grade-item-meta">
                    ${data.students.length} students • ${data.num_classes} classes
                </div>
            </div>
        `;
    }).join('');
}

async function selectGrade(grade) {
    currentGrade = grade;
    renderGradeList();
    await showAssignScreen();
}

// ============================================================================
// UI State Management
// ============================================================================

function checkInitialState() {
    const hasConfig = config && config.properties && config.properties.length > 0;
    const hasGrades = Object.keys(students).length > 0;

    document.getElementById('welcomeScreen').style.display = 'none';
    document.getElementById('configRequiredScreen').style.display = 'none';
    document.getElementById('assignScreen').style.display = 'none';

    if (!hasConfig && !hasGrades) {
        document.getElementById('welcomeScreen').style.display = 'block';
    } else if (hasGrades && currentGrade) {
        showAssignScreen();
    } else if (hasGrades && !currentGrade) {
        // Has grades but none selected - show select prompt
        showSelectGradePrompt();
    }
}

function showSelectGradePrompt() {
    // Hide other screens
    document.getElementById('welcomeScreen').style.display = 'none';
    document.getElementById('configRequiredScreen').style.display = 'none';
    document.getElementById('assignScreen').style.display = 'none';

    // Show or create select prompt
    let promptDiv = document.getElementById('selectGradePrompt');
    if (!promptDiv) {
        promptDiv = document.createElement('div');
        promptDiv.id = 'selectGradePrompt';
        promptDiv.className = 'select-grade-prompt';
        document.querySelector('.main-content').appendChild(promptDiv);
    }

    const gradeCount = Object.keys(students).length;
    promptDiv.innerHTML = `
        <div class="prompt-content">
            <div class="prompt-badge">${gradeCount} ${gradeCount === 1 ? 'Grade' : 'Grades'} Ready</div>
            <h2>Select a grade to get started</h2>
            <p class="prompt-subtitle">
                Choose from the sidebar to view students, run assignments, or export results
            </p>
            <button class="btn btn-secondary" onclick="showImportModal()">
                ➕ Import Another Grade
            </button>
        </div>
    `;
    promptDiv.style.display = 'flex';
}

async function showAssignScreen() {
    const gradeData = students[currentGrade];

    // Hide other screens
    document.getElementById('welcomeScreen').style.display = 'none';
    document.getElementById('configRequiredScreen').style.display = 'none';
    const selectPrompt = document.getElementById('selectGradePrompt');
    if (selectPrompt) selectPrompt.style.display = 'none';

    document.getElementById('assignScreen').style.display = 'block';

    document.getElementById('assignGradeName').textContent = currentGrade;
    document.getElementById('numClasses').value = gradeData.num_classes;

    // Check if there's an existing assignment
    try {
        const response = await fetch(`/api/assignments/${currentGrade}`);
        const assignments = await response.json();

        if (assignments && assignments.length > 0) {
            // Has assignment - show student list but enable "View Assignment" button
            window.currentAssignments = assignments; // Store for later
            document.getElementById('assignmentStatus').innerHTML =
                '<span class="status-badge status-assigned">✓ Assigned</span>';
            document.getElementById('assignBtn').textContent = '🔄 Re-assign Classes';
            document.getElementById('viewAssignmentBtn').style.display = 'inline-flex';
            document.getElementById('exportBtn').style.display = 'inline-flex';
            document.getElementById('backToListBtn').style.display = 'none';
        } else {
            // No assignment
            document.getElementById('assignmentStatus').innerHTML =
                '<span class="status-badge status-pending">⏳ Not Yet Assigned</span>';
            document.getElementById('assignBtn').textContent = '🎯 Assign Classes';
            document.getElementById('viewAssignmentBtn').style.display = 'none';
            document.getElementById('exportBtn').style.display = 'none';
            document.getElementById('backToListBtn').style.display = 'none';
        }

        // Always show student list by default
        renderStudentList(gradeData.students);

    } catch (error) {
        // If error loading assignment, show student list
        renderStudentList(gradeData.students);
    }
}

function viewAssignment() {
    if (!window.currentAssignments) {
        alert('No assignment found');
        return;
    }

    // Show assignment view, hide student list
    document.getElementById('studentListView').style.display = 'none';
    document.getElementById('assignmentResultView').style.display = 'block';
    document.getElementById('iconLegend').style.display = 'block';

    // Update buttons
    document.getElementById('viewAssignmentBtn').style.display = 'none';
    document.getElementById('backToListBtn').style.display = 'inline-flex';

    renderAssignmentResults(window.currentAssignments);
}

function backToStudentList() {
    const gradeData = students[currentGrade];

    // Hide assignment view, show student list
    document.getElementById('studentListView').style.display = 'grid';
    document.getElementById('assignmentResultView').style.display = 'none';
    document.getElementById('iconLegend').style.display = 'none';

    // Update buttons
    document.getElementById('viewAssignmentBtn').style.display = 'inline-flex';
    document.getElementById('backToListBtn').style.display = 'none';

    renderStudentList(gradeData.students);
}

function renderStudentList(studentList) {
    const container = document.getElementById('studentListView');
    container.style.display = 'grid';
    document.getElementById('assignmentResultView').style.display = 'none';

    container.innerHTML = studentList.map(student => `
        <div class="student-card" onclick='showStudentDetail(${JSON.stringify(student)})'>
            <div class="student-card-name">${student.name}</div>
            <div class="student-card-properties">
                ${getStudentIcons(student)}
            </div>
        </div>
    `).join('');
}

function getStudentIcons(student) {
    let icons = [];

    config.properties.forEach(prop => {
        const value = student[prop.name];
        if (prop.name === 'gender') {
            icons.push(value === 'g' ? '♀️' : '♂️');
        } else if (prop.name === 'problematic' && value === 'y') {
            icons.push('⚠️');
        } else if (prop.name === 'special_needs' && value === 'y') {
            icons.push('🎯');
        } else if (prop.name === 'math') {
            icons.push(`📐${value.toUpperCase()}`);
        } else if (prop.name === 'reading') {
            icons.push(`📚${value.toUpperCase()}`);
        }
    });

    // Add friend indicator if they have a friend in their assigned class
    if (student.has_friend_in_class === 1) {
        icons.push('🤝');
    }

    return icons.join(' ');
}

// ============================================================================
// Student Detail Panel
// ============================================================================

function showStudentDetail(student) {
    const panel = document.getElementById('studentDetailPanel');
    const body = document.getElementById('studentDetailBody');

    document.getElementById('studentDetailName').textContent = student.name;

    body.innerHTML = config.properties.map(prop => `
        <div class="property-row">
            <label>${prop.icon} ${prop.display_name}</label>
            <div class="value">${formatPropertyValue(prop, student[prop.name])}</div>
        </div>
    `).join('') + `
        <div class="property-row">
            <label>🤝 Friends</label>
            <div class="value">${student.friends || 'None listed'}</div>
        </div>
        <div class="property-row">
            <label>🚫 Incompatible</label>
            <div class="value">${student.incompatible || 'None listed'}</div>
        </div>
    `;

    panel.classList.add('open');
}

function closeStudentDetail() {
    document.getElementById('studentDetailPanel').classList.remove('open');
}

function formatPropertyValue(prop, value) {
    const labels = {
        'g': 'Girl', 'b': 'Boy',
        'y': 'Yes', 'n': 'No',
        'h': 'High', 'm': 'Medium', 'l': 'Low'
    };
    return labels[value] || value;
}

// ============================================================================
// Import Flow
// ============================================================================

function showImportModal() {
    document.getElementById('importModal').classList.add('open');
    document.getElementById('importStep1').style.display = 'block';
    document.getElementById('importStep2').style.display = 'none';
    document.getElementById('importNextBtn').style.display = 'inline-block';
    document.getElementById('importConfirmBtn').style.display = 'none';
}

function closeImportModal() {
    document.getElementById('importModal').classList.remove('open');
    document.getElementById('csvFile').value = '';
    document.getElementById('csvPreview').style.display = 'none';
    csvPreviewData = null;
}

async function previewCSV() {
    const fileInput = document.getElementById('csvFile');
    const file = fileInput.files[0];

    if (!file) return;

    // Read the full CSV file
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());

    // Parse CSV manually (simple parser)
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const row = {};
        headers.forEach((header, idx) => {
            row[header] = values[idx] ? values[idx].trim() : '';
        });
        rows.push(row);
    }

    csvFullData = rows;

    // Send to backend for column detection
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/import/preview', {
        method: 'POST',
        body: formData
    });

    const data = await response.json();
    csvPreviewData = data;

    // Show preview
    const preview = document.getElementById('csvPreview');
    const table = document.getElementById('csvPreviewTable');

    table.innerHTML = `
        <table>
            <thead>
                <tr>${data.columns.map(col => `<th>${col}</th>`).join('')}</tr>
            </thead>
            <tbody>
                ${data.preview.map(row =>
                    `<tr>${data.columns.map(col => `<td>${row[col] || ''}</td>`).join('')}</tr>`
                ).join('')}
            </tbody>
        </table>
        <p class="mt-4">Total rows: ${rows.length} students</p>
    `;

    preview.style.display = 'block';
    document.getElementById('importNextBtn').disabled = false;
}

function importNext() {
    document.getElementById('importStep1').style.display = 'none';
    document.getElementById('importStep2').style.display = 'block';
    document.getElementById('importNextBtn').style.display = 'none';
    document.getElementById('importConfirmBtn').style.display = 'inline-block';

    renderColumnMappings();
}

function renderColumnMappings() {
    const container = document.getElementById('columnMappings');
    const mappings = csvPreviewData.suggested_mappings;

    const fields = [
        { key: 'name', label: 'Student Name', required: true },
        ...config.properties.map(p => ({ key: p.name, label: p.display_name, required: false })),
        { key: 'friends', label: 'Friends', required: false },
        { key: 'incompatible', label: 'Incompatible Students', required: false }
    ];

    container.innerHTML = fields.map(field => `
        <div class="form-group">
            <label>${field.label}${field.required ? ' *' : ''}</label>
            <select id="mapping_${field.key}">
                <option value="">-- Skip --</option>
                ${csvPreviewData.columns.map(col =>
                    `<option value="${col}" ${mappings[field.key] === col ? 'selected' : ''}>${col}</option>`
                ).join('')}
            </select>
        </div>
    `).join('');
}

async function confirmImport() {
    const grade = document.getElementById('importGradeName').value;
    const numClasses = parseInt(document.getElementById('importNumClasses').value);

    if (!grade) {
        alert('Please enter a grade name');
        return;
    }

    const mappings = {};
    const fields = ['name', ...config.properties.map(p => p.name), 'friends', 'incompatible'];

    fields.forEach(field => {
        const select = document.getElementById(`mapping_${field}`);
        if (select && select.value) {
            mappings[field] = select.value;
        }
    });

    if (!mappings.name) {
        alert('Student name column is required');
        return;
    }

    const response = await fetch('/api/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grade: grade,
            mappings: mappings,
            csv_data: csvFullData, // Full CSV data
            num_classes: numClasses
        })
    });

    const result = await response.json();

    if (result.error) {
        alert('Import failed: ' + result.error);
        return;
    }

    alert(`Successfully imported ${result.count} students!`);
    closeImportModal();
    await loadStudents();
    renderGradeList();
    selectGrade(grade);
}

// ============================================================================
// Assignment
// ============================================================================

function updateNumClasses() {
    const numClasses = parseInt(document.getElementById('numClasses').value);
    students[currentGrade].num_classes = numClasses;
}

async function runAssignment() {
    if (!currentGrade) return;

    const btn = document.getElementById('assignBtn');
    const hasExisting = btn.textContent.includes('Re-assign');

    // Confirm if re-assigning
    if (hasExisting) {
        if (!confirm('This will overwrite existing assignments. Continue?')) {
            return;
        }
    }

    btn.disabled = true;

    // Store grade info for progress modal
    const gradeData = students[currentGrade];
    window.currentGradeStudents = gradeData.students.length;
    window.currentNumClasses = gradeData.num_classes;

    // Show progress modal
    const progress = new AssignmentProgress();
    const progressPromise = progress.show();

    try {
        // Run the actual assignment
        const response = await fetch(`/api/assign/${currentGrade}`, {
            method: 'POST'
        });

        const result = await response.json();

        // Wait for progress animation to complete
        await progressPromise;

        if (result.error) {
            progress.hide();
            alert('Assignment failed: ' + result.error);
            btn.disabled = false;
            return;
        }

        // Store assignments
        window.latestAssignments = result.assignments;
        window.currentAssignments = result.assignments;

        // Calculate stats for success notification
        const friendCount = result.assignments.filter(s => s.has_friend_in_class === 1).length;
        const friendPct = Math.round((friendCount / result.assignments.length) * 100);

        // Show success notification
        const success = new SuccessNotification();
        success.show({
            total: result.assignments.length,
            friendPct: friendPct,
            balance: 'Perfect',
            classes: gradeData.num_classes
        });

        // Update UI state
        document.getElementById('assignmentStatus').innerHTML =
            '<span class="status-badge status-assigned">✓ Assigned</span>';
        btn.textContent = '🔄 Re-assign Classes';
        document.getElementById('viewAssignmentBtn').style.display = 'inline-flex';
        document.getElementById('exportBtn').style.display = 'inline-flex';

    } catch (error) {
        progress.hide();
        alert('Error: ' + error.message);
    } finally {
        btn.disabled = false;
    }
}

function renderAssignmentResults(assignments) {
    // Store assignments globally for click handlers
    window.currentAssignments = assignments;

    // Group by class
    const classes = {};
    assignments.forEach(student => {
        const classNum = student.assigned_class;
        if (!classes[classNum]) classes[classNum] = [];
        classes[classNum].push(student);
    });

    // Calculate statistics
    const stats = calculateAssignmentStats(classes, assignments);

    // Render balance bar + class cards
    const statsContainer = document.getElementById('assignmentStats');
    statsContainer.innerHTML = renderBalanceBar(stats);

    const classContainer = document.getElementById('classBoxesContainer');
    classContainer.className = 'class-grid';
    classContainer.innerHTML = renderClassCards(classes, stats);
}

function toggleStudentList(classNum) {
    const studentList = document.getElementById(`students-${classNum}`);
    const icon = document.getElementById(`toggle-icon-${classNum}`);
    const button = event.target.closest('button');

    if (studentList.style.display === 'none') {
        studentList.style.display = 'flex';
        icon.textContent = '▼';
        button.innerHTML = `<span id="toggle-icon-${classNum}">▼</span> Hide Student List`;
    } else {
        studentList.style.display = 'none';
        icon.textContent = '▶';
        button.innerHTML = `<span id="toggle-icon-${classNum}">▶</span> Show Student List`;
    }
}

function calculateAssignmentStats(classes, assignments) {
    const stats = {
        total: assignments.length,
        byClass: {},
        overall: {
            girls: 0,
            boys: 0,
            problematic: 0,
            special_needs: 0,
            math_h: 0, math_m: 0, math_l: 0,
            reading_h: 0, reading_m: 0, reading_l: 0,
            with_friends: 0
        }
    };

    // Calculate per-class stats
    Object.keys(classes).forEach(classNum => {
        const students = classes[classNum];
        const classStats = {
            girls: students.filter(s => s.gender === 'g').length,
            boys: students.filter(s => s.gender === 'b').length,
            problematic: students.filter(s => s.problematic === 'y').length,
            special_needs: students.filter(s => s.special_needs === 'y').length,
            math_h: students.filter(s => s.math === 'h').length,
            math_m: students.filter(s => s.math === 'm').length,
            math_l: students.filter(s => s.math === 'l').length,
            reading_h: students.filter(s => s.reading === 'h').length,
            reading_m: students.filter(s => s.reading === 'm').length,
            reading_l: students.filter(s => s.reading === 'l').length,
            with_friends: students.filter(s => s.has_friend_in_class === 1).length
        };
        stats.byClass[classNum] = classStats;

        // Add to overall
        stats.overall.girls += classStats.girls;
        stats.overall.boys += classStats.boys;
        stats.overall.problematic += classStats.problematic;
        stats.overall.special_needs += classStats.special_needs;
        stats.overall.math_h += classStats.math_h;
        stats.overall.math_m += classStats.math_m;
        stats.overall.math_l += classStats.math_l;
        stats.overall.reading_h += classStats.reading_h;
        stats.overall.reading_m += classStats.reading_m;
        stats.overall.reading_l += classStats.reading_l;
        stats.overall.with_friends += classStats.with_friends;
    });

    // Calculate balance metrics (standard deviation)
    const numClasses = Object.keys(classes).length;
    stats.balance = {
        gender: calculateStdDev(Object.values(stats.byClass).map(c => c.girls)),
        problematic: calculateStdDev(Object.values(stats.byClass).map(c => c.problematic)),
        special_needs: calculateStdDev(Object.values(stats.byClass).map(c => c.special_needs)),
        math: (
            calculateStdDev(Object.values(stats.byClass).map(c => c.math_h)) +
            calculateStdDev(Object.values(stats.byClass).map(c => c.math_m)) +
            calculateStdDev(Object.values(stats.byClass).map(c => c.math_l))
        ) / 3,
        reading: (
            calculateStdDev(Object.values(stats.byClass).map(c => c.reading_h)) +
            calculateStdDev(Object.values(stats.byClass).map(c => c.reading_m)) +
            calculateStdDev(Object.values(stats.byClass).map(c => c.reading_l))
        ) / 3
    };

    return stats;
}

function calculateStdDev(values) {
    if (values.length === 0) return 0;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;
    return Math.sqrt(variance);
}

function renderOverallStats(stats) {
    const friendPct = Math.round(stats.overall.with_friends / stats.total * 100);

    const getBalanceLabel = (stddev) => {
        if (stddev < 0.5) return { text: 'Perfect', class: 'excellent' };
        if (stddev < 1.0) return { text: 'Excellent', class: 'excellent' };
        if (stddev < 1.5) return { text: 'Good', class: 'good' };
        return { text: 'Fair', class: 'fair' };
    };

    const genderLabel = getBalanceLabel(stats.balance.gender);
    const problemLabel = getBalanceLabel(stats.balance.problematic);
    const specialLabel = getBalanceLabel(stats.balance.special_needs);
    const mathLabel = getBalanceLabel(stats.balance.math);
    const readingLabel = getBalanceLabel(stats.balance.reading);

    return `
        <div class="overall-stats-header">
            <h3>✅ Assignment Complete - Balance Report <button class="info-icon-btn" onclick="showBalanceInfoModal()" title="What do these metrics mean?">ⓘ</button></h3>
            <p class="stats-subtitle">Optimized ${stats.total} students across ${Object.keys(stats.byClass).length} classes</p>
        </div>

        <div class="overall-stats-grid">
            <div class="stat-card">
                <div class="stat-card-header">
                    <span class="stat-card-icon">👥</span>
                    <span class="stat-card-title">Gender Balance</span>
                </div>
                <div class="stat-card-value">${genderLabel.text}</div>
                <div class="stat-card-detail">
                    ${stats.overall.girls} girls / ${stats.overall.boys} boys
                    <br>Variance: ${stats.balance.gender.toFixed(2)}
                </div>
                <div class="stat-card-badge badge-${genderLabel.class}">✓</div>
            </div>

            <div class="stat-card">
                <div class="stat-card-header">
                    <span class="stat-card-icon">⚠️</span>
                    <span class="stat-card-title">Problematic Distribution</span>
                </div>
                <div class="stat-card-value">${problemLabel.text}</div>
                <div class="stat-card-detail">
                    ${stats.overall.problematic} total students
                    <br>Variance: ${stats.balance.problematic.toFixed(2)}
                </div>
                <div class="stat-card-badge badge-${problemLabel.class}">✓</div>
            </div>

            <div class="stat-card">
                <div class="stat-card-header">
                    <span class="stat-card-icon">🎯</span>
                    <span class="stat-card-title">Special Needs Distribution</span>
                </div>
                <div class="stat-card-value">${specialLabel.text}</div>
                <div class="stat-card-detail">
                    ${stats.overall.special_needs} total students
                    <br>Variance: ${stats.balance.special_needs.toFixed(2)}
                </div>
                <div class="stat-card-badge badge-${specialLabel.class}">✓</div>
            </div>

            <div class="stat-card">
                <div class="stat-card-header">
                    <span class="stat-card-icon">📐</span>
                    <span class="stat-card-title">Math Balance</span>
                </div>
                <div class="stat-card-value">${mathLabel.text}</div>
                <div class="stat-card-detail">
                    ${stats.overall.math_h}H / ${stats.overall.math_m}M / ${stats.overall.math_l}L
                    <br>Variance: ${stats.balance.math.toFixed(2)}
                </div>
                <div class="stat-card-badge badge-${mathLabel.class}">✓</div>
            </div>

            <div class="stat-card">
                <div class="stat-card-header">
                    <span class="stat-card-icon">📚</span>
                    <span class="stat-card-title">Reading Balance</span>
                </div>
                <div class="stat-card-value">${readingLabel.text}</div>
                <div class="stat-card-detail">
                    ${stats.overall.reading_h}H / ${stats.overall.reading_m}M / ${stats.overall.reading_l}L
                    <br>Variance: ${stats.balance.reading.toFixed(2)}
                </div>
                <div class="stat-card-badge badge-${readingLabel.class}">✓</div>
            </div>

            <div class="stat-card stat-card-highlight">
                <div class="stat-card-header">
                    <span class="stat-card-icon">🤝</span>
                    <span class="stat-card-title">Friend Satisfaction</span>
                </div>
                <div class="stat-card-value">${friendPct}%</div>
                <div class="stat-card-detail">
                    ${stats.overall.with_friends} of ${stats.total} students
                    <br>have ≥1 friend in their class
                </div>
                <div class="stat-card-badge badge-${friendPct >= 85 ? 'excellent' : friendPct >= 70 ? 'good' : 'fair'}">✓</div>
            </div>
        </div>
    `;
}

function showStudentDetailByName(name) {
    const student = window.currentAssignments.find(s => s.name === name);
    if (student) {
        showStudentDetail(student);
    }
}

// ============================================================================
// Quality of Life Features
// ============================================================================

function showGradeActions() {
    document.getElementById('gradeActionsModal').classList.add('open');
}

function closeGradeActions() {
    document.getElementById('gradeActionsModal').classList.remove('open');
}

function reImportGrade() {
    if (!confirm('This will replace ALL current students in this grade. Continue?')) {
        return;
    }
    closeGradeActions();
    // Pre-fill the import modal with current grade
    document.getElementById('importGradeName').value = currentGrade;
    document.getElementById('importNumClasses').value = students[currentGrade].num_classes;
    showImportModal();
}

async function confirmDeleteGrade() {
    if (!confirm(`Delete "${currentGrade}" and all its data? This cannot be undone.`)) {
        return;
    }

    try {
        await fetch(`/api/students/${currentGrade}`, {
            method: 'DELETE'
        });

        alert('Grade deleted successfully');
        closeGradeActions();

        // Reload and reset
        currentGrade = null;
        await loadStudents();
        renderGradeList();
        checkInitialState();
    } catch (error) {
        alert('Error deleting grade: ' + error.message);
    }
}

async function exportAssignments() {
    if (!window.currentAssignments) {
        alert('No assignments to export');
        return;
    }

    // Convert to CSV
    const assignments = window.currentAssignments;
    const headers = ['name', 'assigned_class', 'gender', 'problematic', 'special_needs',
                     'math', 'reading', 'friends', 'incompatible', 'has_friend_in_class'];

    let csv = headers.join(',') + '\n';

    assignments.forEach(student => {
        const row = headers.map(header => {
            let value = student[header] || '';
            // Escape commas and quotes
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                value = '"' + value.replace(/"/g, '""') + '"';
            }
            return value;
        });
        csv += row.join(',') + '\n';
    });

    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentGrade}_assignments.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}
