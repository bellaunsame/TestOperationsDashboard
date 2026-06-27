let ganttInstance = null;
let currentData = [];

async function fetchGanttData() {
    try {
        const response = await fetch('/api/gantt/data');
        const result = await response.json();
        return result.success ? result.data : [];
    } catch (error) {
        console.error('Error fetching Gantt data:', error);
        return [];
    }
}

function updateSummary(data) {
    document.getElementById('totalTests').textContent = data.length;
    document.getElementById('onTrackCount').textContent = 
        data.filter(d => d.health === 'on-track' || d.health === 'ahead').length;
    document.getElementById('atRiskCount').textContent = 
        data.filter(d => d.health === 'at-risk').length;
    document.getElementById('delayedCount').textContent = 
        data.filter(d => d.health === 'delayed' || d.health === 'blocked').length;
    document.getElementById('completedCount').textContent = 
        data.filter(d => d.health === 'completed').length;
}

function getHealthClass(health) {
    const map = {
        'on-track': 'bar-on-track',
        'ahead': 'bar-ahead',
        'at-risk': 'bar-at-risk',
        'delayed': 'bar-delayed',
        'blocked': 'bar-blocked',
        'completed': 'bar-completed',
        'upcoming': 'bar-upcoming',
    };
    return map[health] || 'bar-on-track';
}

function renderGantt(data, viewMode = 'Day') {
    const tasks = data.map(d => ({
        id: d.id,
        name: d.name,
        start: d.start,
        end: d.end,
        progress: d.progress,
        custom_class: getHealthClass(d.health),
        dependencies: d.dependencies || '',
    }));
    
    document.getElementById('gantt').innerHTML = '';
    
    ganttInstance = new Gantt('#gantt', tasks, {
        view_mode: viewMode,
        bar_height: 30,
        padding: 18,
        custom_popup_html: function(task) {
            const tc = data.find(d => d.id === task.id);
            return `
                <div class="gantt-tooltip">
                    <h4>${tc.name}</h4>
                    <p><strong>Owner:</strong> ${tc.owner}</p>
                    <p><strong>Category:</strong> ${tc.category}</p>
                    <p><strong>Priority:</strong> ${tc.priority}</p>
                    <p><strong>Status:</strong> ${tc.status}</p>
                    <p><strong>Progress:</strong> ${tc.progress}% (Expected: ${tc.expected_progress}%)</p>
                    <p><strong>Variance:</strong> ${tc.variance > 0 ? '+' : ''}${tc.variance}%</p>
                    <p><strong>Days Remaining:</strong> ${tc.days_remaining}</p>
                </div>
            `;
        }
    });
}

document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderGantt(currentData, btn.dataset.mode);
    });
});

document.getElementById('refreshBtn').addEventListener('click', async () => {
    await init();
});

async function init() {
    document.getElementById('loading').style.display = 'block';
    currentData = await fetchGanttData();
    updateSummary(currentData);
    renderGantt(currentData, 'Day');
    document.getElementById('loading').style.display = 'none';
}

init();