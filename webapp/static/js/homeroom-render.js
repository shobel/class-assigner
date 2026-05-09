// Homeroom-style rendering functions

function renderClassCards(classes, stats) {
    return Object.keys(classes).sort((a, b) => parseInt(a) - parseInt(b)).map(classNum => {
        const studentList = classes[classNum];
        const cs = stats.byClass[classNum];

        const mathH = Math.round((cs.math_h / studentList.length) * 100);
        const mathM = Math.round((cs.math_m / studentList.length) * 100);
        const mathL = Math.round((cs.math_l / studentList.length) * 100);

        const readH = Math.round((cs.reading_h / studentList.length) * 100);
        const readM = Math.round((cs.reading_m / studentList.length) * 100);
        const readL = Math.round((cs.reading_l / studentList.length) * 100);

        return `
            <div class="class-card">
                <div class="class-card-h">
                    <div class="ct">
                        <h4>Class ${classNum}</h4>
                        <span class="ce">${studentList.length} STUDENTS</span>
                    </div>
                </div>

                <div class="cstats">
                    <div class="cstat">
                        <span class="lbl">Gender</span>
                        <span class="val">${cs.girls}<small>g</small> ${cs.boys}<small>b</small></span>
                    </div>
                    <div class="cstat">
                        <span class="lbl">Prob</span>
                        <span class="val">${cs.problematic}</span>
                    </div>
                    <div class="cstat">
                        <span class="lbl">Special</span>
                        <span class="val">${cs.special_needs}</span>
                    </div>
                    <div class="cstat">
                        <span class="lbl">Friends</span>
                        <span class="val">${cs.with_friends}<small>/${studentList.length}</small></span>
                    </div>
                </div>

                <div class="dist-bar">
                    <i class="h" style="flex: ${mathH}"></i>
                    <i class="m" style="flex: ${mathM}"></i>
                    <i class="l" style="flex: ${mathL}"></i>
                </div>

                <div class="croster collapsed" id="roster-${classNum}">
                    ${studentList.map(s => `
                        <div class="student-row-mini" onclick="showStudentDetailByName('${s.name}')">
                            <div class="avatar ${s.gender}">${s.gender.toUpperCase()}</div>
                            <span class="sn">${s.name}</span>
                            <span class="icons">${getStudentIcons(s)}</span>
                        </div>
                    `).join('')}
                </div>

                <div class="class-card-foot">
                    <button class="toggle-roster" onclick="toggleRoster(${classNum})">
                        <span id="roster-toggle-${classNum}">Show roster</span>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderBalanceBar(stats) {
    const friendPct = Math.round(stats.overall.with_friends / stats.total * 100);

    const getLabel = (stddev) => {
        if (stddev < 0.5) return 'Perfect';
        if (stddev < 1.0) return 'Excellent';
        if (stddev < 1.5) return 'Good';
        return 'Fair';
    };

    return `
        <div class="balance-bar">
            <span class="bb-label">Balance</span>
            <div class="bb-metrics">
                <div class="bb-metric">
                    <span class="label">Gender:</span>
                    <span class="value excellent">${getLabel(stats.balance.gender)}</span>
                </div>
                <div class="bb-metric">
                    <span class="label">Prob:</span>
                    <span class="value excellent">${getLabel(stats.balance.problematic)}</span>
                </div>
                <div class="bb-metric">
                    <span class="label">Special:</span>
                    <span class="value excellent">${getLabel(stats.balance.special_needs)}</span>
                </div>
                <div class="bb-metric">
                    <span class="label">Math:</span>
                    <span class="value excellent">${getLabel(stats.balance.math)}</span>
                </div>
                <div class="bb-metric">
                    <span class="label">Reading:</span>
                    <span class="value excellent">${getLabel(stats.balance.reading)}</span>
                </div>
                <div class="bb-metric">
                    <span class="label">Friends:</span>
                    <span class="value">${friendPct}%</span>
                </div>
            </div>
            <button class="bb-toggle" onclick="toggleBalanceDetails()">
                <span id="balance-toggle">Show details</span>
            </button>
        </div>

        <div class="balance-details collapsed" id="balance-details">
            <div class="balance-detail-item">
                <span class="label">Gender Balance</span>
                <span class="value">${getLabel(stats.balance.gender)}</span>
                <span class="sub">${stats.overall.girls}g / ${stats.overall.boys}b · σ=${stats.balance.gender.toFixed(2)}</span>
            </div>
            <div class="balance-detail-item">
                <span class="label">Problematic</span>
                <span class="value">${getLabel(stats.balance.problematic)}</span>
                <span class="sub">${stats.overall.problematic} total · σ=${stats.balance.problematic.toFixed(2)}</span>
            </div>
            <div class="balance-detail-item">
                <span class="label">Special Needs</span>
                <span class="value">${getLabel(stats.balance.special_needs)}</span>
                <span class="sub">${stats.overall.special_needs} total · σ=${stats.balance.special_needs.toFixed(2)}</span>
            </div>
            <div class="balance-detail-item">
                <span class="label">Math Levels</span>
                <span class="value">${getLabel(stats.balance.math)}</span>
                <span class="sub">${stats.overall.math_h}H ${stats.overall.math_m}M ${stats.overall.math_l}L · σ=${stats.balance.math.toFixed(2)}</span>
            </div>
            <div class="balance-detail-item">
                <span class="label">Reading Levels</span>
                <span class="value">${getLabel(stats.balance.reading)}</span>
                <span class="sub">${stats.overall.reading_h}H ${stats.overall.reading_m}M ${stats.overall.reading_l}L · σ=${stats.balance.reading.toFixed(2)}</span>
            </div>
            <div class="balance-detail-item">
                <span class="label">Friend Satisfaction</span>
                <span class="value">${friendPct}%</span>
                <span class="sub">${stats.overall.with_friends} of ${stats.total} students</span>
            </div>
        </div>
    `;
}

function toggleRoster(classNum) {
    const roster = document.getElementById(`roster-${classNum}`);
    const toggle = document.getElementById(`roster-toggle-${classNum}`);

    if (roster.classList.contains('collapsed')) {
        roster.classList.remove('collapsed');
        toggle.textContent = 'Hide roster';
    } else {
        roster.classList.add('collapsed');
        toggle.textContent = 'Show roster';
    }
}

function toggleBalanceDetails() {
    const details = document.getElementById('balance-details');
    const toggle = document.getElementById('balance-toggle');

    if (details.classList.contains('collapsed')) {
        details.classList.remove('collapsed');
        toggle.textContent = 'Hide details';
    } else {
        details.classList.add('collapsed');
        toggle.textContent = 'Show details';
    }
}

// Global for access
window.toggleRoster = toggleRoster;
window.toggleBalanceDetails = toggleBalanceDetails;
