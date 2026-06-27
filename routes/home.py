from flask import Blueprint, render_template, jsonify
from models.test_case import TestCase
from models.daily_log import DailyLog
from datetime import datetime, date, timedelta
from collections import defaultdict

home_bp = Blueprint('home', __name__)

@home_bp.route('/')
def index():
    """Render the home dashboard page"""
    return render_template('home.html')

@home_bp.route('/api/dashboard/stats')
def dashboard_stats():
    """Return dashboard statistics as JSON"""
    test_cases = TestCase.get_all()
    daily_logs = DailyLog.get_all()
    today = date.today()
    
    # ===== KPI Stats =====
    total = len(test_cases)
    in_progress = sum(1 for tc in test_cases if tc.get('status') == 'In Progress')
    completed = sum(1 for tc in test_cases if tc.get('status') == 'Completed')
    delayed = sum(1 for tc in test_cases if tc.get('status') in ['Delayed', 'Blocked'])
    not_started = sum(1 for tc in test_cases if tc.get('status') == 'Not Started')
    
    # Calculate overall progress
    avg_progress = round(sum(tc.get('progress', 0) for tc in test_cases) / total, 1) if total > 0 else 0
    
    # ===== Status Distribution (for doughnut chart) =====
    status_counts = defaultdict(int)
    for tc in test_cases:
        status_counts[tc.get('status', 'Unknown')] += 1
    
    # ===== Progress by Category (for bar chart) =====
    category_progress = defaultdict(list)
    for tc in test_cases:
        category = tc.get('category', 'Uncategorized')
        category_progress[category].append(tc.get('progress', 0))
    
    category_avg = {
        cat: round(sum(progs) / len(progs), 1) 
        for cat, progs in category_progress.items()
    }
    
    # ===== Daily Completion Trend (last 7 days) =====
    trend_data = defaultdict(float)
    for i in range(7):
        day = today - timedelta(days=6-i)
        trend_data[day.isoformat()] = 0.0
    
    for log in daily_logs:
        log_date = log.get('log_date')
        if log_date in trend_data:
            trend_data[log_date] += log.get('progress_made', 0)
    
    # ===== Recent Activity (last 5 logs) =====
    sorted_logs = sorted(daily_logs, key=lambda x: x.get('log_date', ''), reverse=True)[:5]
    
    # Map logs to test case names
    tc_map = {tc['id']: tc['name'] for tc in test_cases}
    recent_activity = []
    for log in sorted_logs:
        recent_activity.append({
            'test_name': tc_map.get(log.get('test_case_id'), 'Unknown'),
            'date': log.get('log_date'),
            'progress_made': log.get('progress_made', 0),
            'notes': log.get('notes', ''),
        })
    
    # ===== Alerts =====
    alerts = []
    for tc in test_cases:
        end_date = datetime.fromisoformat(tc['end_date']).date()
        days_to_end = (end_date - today).days
        progress = tc.get('progress', 0)
        
        if tc.get('status') == 'Blocked':
            alerts.append({
                'type': 'danger',
                'title': f"⛔ {tc['name']} is BLOCKED",
                'message': f"Owner: {tc.get('owner', 'Unassigned')}",
            })
        elif tc.get('status') == 'Delayed':
            alerts.append({
                'type': 'warning',
                'title': f"⚠️ {tc['name']} is DELAYED",
                'message': f"Progress: {progress}%, Days left: {days_to_end}",
            })
        elif 0 <= days_to_end <= 3 and progress < 80 and tc.get('status') != 'Completed':
            alerts.append({
                'type': 'warning',
                'title': f"🔔 {tc['name']} due soon",
                'message': f"Only {days_to_end} days left, {progress}% complete",
            })
    
    return jsonify({
        'success': True,
        'kpis': {
            'total': total,
            'in_progress': in_progress,
            'completed': completed,
            'delayed': delayed,
            'not_started': not_started,
            'avg_progress': avg_progress,
        },
        'status_distribution': dict(status_counts),
        'category_progress': category_avg,
        'daily_trend': dict(trend_data),
        'recent_activity': recent_activity,
        'alerts': alerts[:5],  # Limit to 5 alerts
    })