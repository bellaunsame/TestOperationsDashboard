// Dashboard Chart Configuration & Logic
let statusChart, categoryChart, trendChart;

async function fetchDashboardData() {
    try {
        const response = await fetch('/api/dashboard/stats');
        const result = await response.json();
        return result.success ? result : null;
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        return null;
    }
}

function updateKPIs(kpis) {
    document.getElementById('kpiTotal').textContent = kpis.total;
    document.getElementById('kpiInProgress').textContent = kpis.in_progress;
    document.getElementById('kpiCompleted').textContent = kpis.completed;
    document.getElementById('kpiDelayed').textContent = kpis.delayed;
    
    // Update progress bar
    const progress = kpis.avg_progress || 0;
    document.getElementById('avgProgressText').textContent = `${progress}%`;
    document.getElementById('avgProgressBar').style.width = `${progress}%`;
}

function renderStatusChart(statusData) {
    const ctx = document.getElementById('statusChart').getContext('2d');
    
    if (statusChart) statusChart.destroy();
    
    const colorMap = {
        'Not Started': '#94a3b8',
        'In Progress': '#3b82f6',
        'Completed': '#10b981',
        'Delayed': '#ef4444',
        'Blocked': '#6b7280',
    };
    
    statusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(statusData),
            datasets: [{
                data: Object.values(statusData),
                backgroundColor: Object.keys(statusData).map(k => colorMap[k] || '#94a3b8'),
                borderWidth: 2,
                borderColor: '#fff',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
            }
        }
    });
}

function renderCategoryChart(categoryData) {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    
    if (categoryChart) categoryChart.destroy();
    
    categoryChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(categoryData),
            datasets: [{
                label: 'Avg Progress %',
                data: Object.values(categoryData),
                backgroundColor: '#3b82f6',
                borderRadius: 8,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, max: 100 }
            },
            plugins: {
                legend: { display: false },
            }
        }
    });
}

function renderTrendChart(trendData) {
    const ctx = document.getElementById('trendChart').getContext('2d');
    
    if (trendChart) trendChart.destroy();
    
    // Format dates nicely
    const labels = Object.keys(trendData).map(d => {
        const date = new Date(d);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    
    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Progress Made (%)',
                data: Object.values(trendData),
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 5,
                pointBackgroundColor: '#10b981',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

function renderAlerts(alerts) {
    const container = document.getElementById('alertsList');
    
    if (!alerts || alerts.length === 0) {
        container.innerHTML = '<p class="empty-text">✅ No alerts. Everything is on track!</p>';
        return;
    }
    
    container.innerHTML = alerts.map(alert => `
        <div class="alert alert-${alert.type}">
            <div class="alert-title">${alert.title}</div>
            <div class="alert-message">${alert.message}</div>
        </div>
    `).join('');
}

function renderActivity(activities) {
    const container = document.getElementById('activityList');
    
    if (!activities || activities.length === 0) {
        container.innerHTML = '<p class="empty-text">No recent activity</p>';
        return;
    }
    
    container.innerHTML = activities.map(act => `
        <div class="activity-item">
            <div class="activity-date">${act.date}</div>
            <div class="activity-content">
                <strong>${act.test_name}</strong> - +${act.progress_made}%
                <p>${act.notes}</p>
            </div>
        </div>
    `).join('');
}

async function initDashboard() {
    const data = await fetchDashboardData();
    if (!data) {
        console.error('Failed to load dashboard data');
        return;
    }
    
    updateKPIs(data.kpis);
    renderStatusChart(data.status_distribution);
    renderCategoryChart(data.category_progress);
    renderTrendChart(data.daily_trend);
    renderAlerts(data.alerts);
    renderActivity(data.recent_activity);
}

document.getElementById('refreshDashboard').addEventListener('click', initDashboard);

initDashboard();