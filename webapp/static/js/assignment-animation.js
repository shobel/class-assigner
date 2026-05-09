// Assignment Animation System

class AssignmentProgress {
    constructor() {
        this.currentPhase = 0;
        this.phases = [
            { label: "Loading students", icon: "⏳", progress: 10, duration: 500 },
            { label: "Building constraints", icon: "🔧", progress: 30, duration: 2000,
              details: ["Gender balance rules", "Special needs distribution", "Academic level balance"] },
            { label: "Balancing demographics", icon: "⚖️", progress: 60, duration: 10000,
              details: ["Evaluating 450 possible assignments"] },
            { label: "Optimizing friend placement", icon: "🤝", progress: 90, duration: 15000,
              details: ["Maximizing social connections"] },
            { label: "Finalizing assignments", icon: "✨", progress: 100, duration: 2500,
              details: ["Writing results"] }
        ];
    }

    show() {
        // Create modal
        const modal = document.createElement('div');
        modal.id = 'progressModal';
        modal.className = 'progress-modal';
        modal.innerHTML = `
            <div class="progress-modal-content">
                <div class="progress-header">
                    <h3>🎯 Optimizing Class Assignments</h3>
                </div>
                <div class="progress-body">
                    <div class="progress-phase">
                        <span class="phase-icon">⏳</span>
                        <span class="phase-label">Starting...</span>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar" style="width: 0%"></div>
                    </div>
                    <div class="progress-percent">0%</div>
                    <div class="progress-details"></div>
                </div>
                <div class="progress-meta">
                    <span>${window.currentGradeStudents || 90} students</span>
                    <span>•</span>
                    <span>${window.currentNumClasses || 5} classes</span>
                    <span>•</span>
                    <span>18 each</span>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Start animation
        setTimeout(() => modal.classList.add('show'), 10);

        return this.runPhases();
    }

    async runPhases() {
        for (let i = 0; i < this.phases.length; i++) {
            this.currentPhase = i;
            await this.animatePhase(this.phases[i]);
        }
    }

    animatePhase(phase) {
        return new Promise(resolve => {
            const phaseEl = document.querySelector('.progress-phase');
            const iconEl = phaseEl.querySelector('.phase-icon');
            const labelEl = phaseEl.querySelector('.phase-label');
            const progressBar = document.querySelector('.progress-bar');
            const progressPercent = document.querySelector('.progress-percent');
            const detailsEl = document.querySelector('.progress-details');

            // Update phase info
            iconEl.textContent = phase.icon;
            labelEl.textContent = phase.label;

            // Show details if any
            if (phase.details) {
                detailsEl.innerHTML = phase.details.map(d =>
                    `<div class="detail-item">✓ ${d}</div>`
                ).join('');
            } else {
                detailsEl.innerHTML = '';
            }

            // Animate progress bar
            const startProgress = parseInt(progressBar.style.width) || 0;
            const duration = phase.duration;
            const startTime = Date.now();

            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const currentProgress = startProgress + (phase.progress - startProgress) * progress;

                progressBar.style.width = currentProgress + '%';
                progressPercent.textContent = Math.round(currentProgress) + '%';

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    setTimeout(resolve, 200);
                }
            };

            animate();
        });
    }

    hide() {
        const modal = document.getElementById('progressModal');
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
        }
    }
}

class SuccessNotification {
    show(stats) {
        const modal = document.getElementById('progressModal');
        if (!modal) return;

        const content = modal.querySelector('.progress-modal-content');
        content.innerHTML = `
            <div class="success-icon-wrapper">
                <div class="success-icon">✅</div>
            </div>
            <h2 class="success-title">Assignment Complete!</h2>
            <p class="success-subtitle">🎉 Successfully assigned ${stats.total} students</p>
            <div class="success-stats">
                <div class="success-stat">
                    <div class="stat-icon">🤝</div>
                    <div class="stat-value" data-target="${stats.friendPct}">0</div>
                    <div class="stat-label">Friend Satisfaction</div>
                </div>
                <div class="success-stat">
                    <div class="stat-icon">⚖️</div>
                    <div class="stat-value">${stats.balance}</div>
                    <div class="stat-label">Balance Quality</div>
                </div>
                <div class="success-stat">
                    <div class="stat-icon">📊</div>
                    <div class="stat-value">${stats.classes}</div>
                    <div class="stat-label">Classes</div>
                </div>
            </div>
            <button class="btn btn-large btn-primary" onclick="viewAssignmentResults()">
                View Results →
            </button>
        `;

        // Trigger animations
        setTimeout(() => {
            const icon = content.querySelector('.success-icon');
            icon.classList.add('bounce');
            this.countUpStats();
            this.createConfetti();
        }, 100);
    }

    countUpStats() {
        const statValues = document.querySelectorAll('.stat-value[data-target]');
        statValues.forEach(el => {
            const target = parseInt(el.dataset.target);
            let current = 0;
            const duration = 1000;
            const increment = target / (duration / 16);

            const animate = () => {
                current += increment;
                if (current < target) {
                    el.textContent = Math.round(current) + '%';
                    requestAnimationFrame(animate);
                } else {
                    el.textContent = target + '%';
                }
            };
            animate();
        });
    }

    createConfetti() {
        const colors = ['#6366F1', '#10B981', '#F59E0B'];
        const confettiCount = 40;

        for (let i = 0; i < confettiCount; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 100 + '%';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.animationDelay = Math.random() * 0.5 + 's';
            confetti.style.animationDuration = Math.random() * 1 + 1.5 + 's';
            document.body.appendChild(confetti);

            setTimeout(() => confetti.remove(), 2000);
        }
    }

    hide() {
        const modal = document.getElementById('progressModal');
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
        }
    }
}

// Global function for button
window.viewAssignmentResults = function() {
    const notification = new SuccessNotification();
    notification.hide();

    // Show results with animation
    setTimeout(() => {
        animateAssignmentResults(window.latestAssignments);
    }, 300);
};

async function animateAssignmentResults(assignments) {
    // Store for later access
    window.currentAssignments = assignments;

    // 1. Switch to assignment view
    document.getElementById('studentListView').style.display = 'none';
    document.getElementById('assignmentResultView').style.display = 'block';
    document.getElementById('iconLegend').style.display = 'block';

    document.getElementById('viewAssignmentBtn').style.display = 'none';
    document.getElementById('backToListBtn').style.display = 'inline-flex';

    // 2. Render results (initially hidden)
    renderAssignmentResults(assignments);

    // 3. Animate balance cards
    await animateBalanceCards();

    // 4. Show final class state
    await showFinalClassBoxes();
}

function animateBalanceCards() {
    return new Promise(resolve => {
        const cards = document.querySelectorAll('.stat-card');
        cards.forEach((card, i) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            setTimeout(() => {
                card.style.transition = 'all 300ms ease-out';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, i * 50);
        });
        setTimeout(resolve, cards.length * 50 + 300);
    });
}

function showFinalClassBoxes() {
    return new Promise(resolve => {
        const boxes = document.querySelectorAll('.class-box');

        // Animate boxes in
        boxes.forEach((box, i) => {
            box.style.opacity = '0';
            box.style.transform = 'scale(0.9)';
            setTimeout(() => {
                box.style.transition = 'all 300ms ease-out';
                box.style.opacity = '1';
                box.style.transform = 'scale(1)';
            }, i * 80);
        });

        setTimeout(resolve, boxes.length * 80 + 300);
    });
}

function showFinalClassState() {
    const boxes = document.querySelectorAll('.class-box');

    boxes.forEach(box => {
        // Remove loading indicator
        const loading = box.querySelector('.class-loading');
        if (loading) loading.remove();

        // Show summary and controls
        const summary = box.querySelector('.class-box-summary');
        const toggleBtn = box.querySelector('.toggle-students-btn');

        if (summary) {
            summary.style.display = 'block';
            summary.style.opacity = '0';
            setTimeout(() => {
                summary.style.transition = 'opacity 300ms ease';
                summary.style.opacity = '1';
            }, 50);
        }

        if (toggleBtn) {
            toggleBtn.style.display = 'block';
        }

        // Flash success
        box.style.borderColor = 'var(--success)';
        setTimeout(() => {
            box.style.transition = 'border-color 500ms ease';
            box.style.borderColor = 'var(--slate-200)';
        }, 300);
    });
}

// Export for use in main app
window.AssignmentProgress = AssignmentProgress;
window.SuccessNotification = SuccessNotification;
window.animateAssignmentResults = animateAssignmentResults;
