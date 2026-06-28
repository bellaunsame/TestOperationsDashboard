let ganttInstance = null;
let currentData = [];
let selectedProjectId = '';

// ── Fetch active projects for selector ───────────────────
async function fetchProjects() {
    try {
        const response = await fetch('/api/gantt/projects');
        const result = await response.json();
        return result.success ? result.data : [];
    } catch (error) {
        console.error('Error fetching Gantt projects:', error);
        return [];
    }
}

// ── Fetch Gantt tasks for selected project ───────────────
async function fetchGanttData(projectId) {
    if (!projectId) return [];
    try {
        const response = await fetch(`/api/gantt/data/${projectId}`);
        const result = await response.json();
        return result.success ? result.data : [];
    } catch (error) {
        console.error('Error fetching Gantt data:', error);
        return [];
    }
}

// ── Populate Project Selector ────────────────────────────
async function populateProjectSelector() {
    const projectSelect = document.getElementById('projectSelect');
    const projects = await fetchProjects();
    
    projectSelect.innerHTML = '';
    
    if (projects.length === 0) {
        projectSelect.innerHTML = '<option value="">No active projects found</option>';
        return;
    }
    
    projects.forEach((proj, idx) => {
        const opt = document.createElement('option');
        opt.value = proj.id;
        opt.textContent = proj.name;
        if (idx === 0) {
            opt.selected = true;
            selectedProjectId = proj.id;
        }
        projectSelect.appendChild(opt);
    });
}

// ── Update Summary Cards ─────────────────────────────────
function updateSummary(data) {
    document.getElementById('totalTests').textContent = data.length;
    document.getElementById('onTrackCount').textContent = 
        data.filter(d => d.health === 'on-track').length;
    document.getElementById('atRiskCount').textContent = 0; // Not used in simplified model, but kept for UI
    document.getElementById('delayedCount').textContent = 
        data.filter(d => d.health === 'delayed').length;
    document.getElementById('completedCount').textContent = 
        data.filter(d => d.health === 'completed').length;
}

function getPhaseClass(phase) {
    const map = {
        'Proto': 'bar-proto',
        'DVT': 'bar-dvt',
        'EVT': 'bar-evt',
        'PVT': 'bar-pvt',
        'Planning': 'bar-planning',
    };
    return map[phase] || 'bar-proto';
}

// ── Render Gantt Chart ───────────────────────────────────
function renderGantt(data, viewMode = 'Day') {
    const ganttContainer = document.getElementById('gantt');
    ganttContainer.innerHTML = '';
    
    if (data.length === 0) {
        ganttContainer.parentNode.innerHTML = `
            <div class="excel-empty" style="padding: 4rem 2rem; text-align: center; color: #64748b;" id="ganttEmptyState">
                <div style="font-size: 3rem; margin-bottom: 1rem;">📅</div>
                <p>No timeline rows found. Make sure to add rows and date milestones in the selected project's table.</p>
            </div>
            <svg id="gantt" class="hidden"></svg>
        `;
        return;
    }

    // Restore SVG if it was replaced by empty state
    const emptyState = document.getElementById('ganttEmptyState');
    if (emptyState) {
        emptyState.remove();
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'gantt';
        document.querySelector('.gantt-container').appendChild(svg);
    }
    
    const tasks = data.map(d => ({
        id: d.id,
        name: d.name,
        start: d.start,
        end: d.end,
        progress: d.progress,
        custom_class: getPhaseClass(d.phase),
        dependencies: '', // Remove arrows
    }));
    
    ganttInstance = new Gantt('#gantt', tasks, {
        view_mode: viewMode,
        bar_height: 30,
        padding: 18,
        readonly: true, // Make bars read-only (fixed based on table dates)
        custom_popup_html: function(task) {
            const tc = data.find(d => d.id === task.id);
            return `
                <div class="gantt-tooltip">
                    <h4>${tc.name}</h4>
                    <p><strong>Category:</strong> ${tc.category}</p>
                    <p><strong>Test Method:</strong> ${tc.test_method}</p>
                    <p><strong>Test Number:</strong> ${tc.test_number}</p>
                    <p><strong>Progress:</strong> ${tc.progress}%</p>
                    <p><strong>Days Remaining:</strong> ${tc.days_remaining}</p>
                    ${tc.others ? `<p><strong>Notes:</strong> ${tc.others}</p>` : ''}
                </div>
            `;
        }
    });
}

// ── View Mode Toggles ────────────────────────────────────
document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderGantt(currentData, btn.dataset.mode);
    });
});

// ── Refresh Button ───────────────────────────────────────
document.getElementById('refreshBtn').addEventListener('click', async () => {
    await refreshAll();
});

// ── Project Selector Change ──────────────────────────────
document.getElementById('projectSelect').addEventListener('change', async (e) => {
    selectedProjectId = e.target.value;
    await loadGanttData();
});

// ── Load Gantt Data ──────────────────────────────────────
async function loadGanttData() {
    document.getElementById('loading').style.display = 'block';
    currentData = await fetchGanttData(selectedProjectId);
    updateSummary(currentData);
    
    // Check active view mode button
    const activeBtn = document.querySelector('.view-btn.active');
    const viewMode = activeBtn ? activeBtn.dataset.mode : 'Day';
    
    renderGantt(currentData, viewMode);
    document.getElementById('loading').style.display = 'none';
}

// ── Refresh Projects and Chart ───────────────────────────
async function refreshAll() {
    document.getElementById('loading').style.display = 'block';
    await populateProjectSelector();
    await loadGanttData();
}

// ── Boot ─────────────────────────────────────────────────
refreshAll();