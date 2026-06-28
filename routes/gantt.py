from flask import Blueprint, jsonify, render_template
from models.table import Table
from models.table_row import TableRow
from datetime import date, datetime, timedelta
import re

gantt_bp = Blueprint('gantt', __name__)

@gantt_bp.route('/gantt')
def gantt_page():
    """Render the Gantt chart page."""
    return render_template('gantt.html')


@gantt_bp.route('/api/gantt/projects')
def gantt_projects():
    """Return all active project tables for the project selector."""
    try:
        all_tables = Table.get_all()
        active = [t for t in all_tables if not t.get('is_archived', False)]
        active.sort(key=lambda x: x.get('project_name', '').lower())
        return jsonify({
            'success': True,
            'data': [{'id': t['id'], 'name': t['project_name']} for t in active]
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


def parse_week_to_date(week_str, default_year=2026):
    """Parse a week string (e.g. 'Week 26', 'W26', '2026-W26', '26') to a Date (Monday)."""
    if not week_str:
        return None
    week_str = str(week_str).strip()
    # Check for YYYY-Wxx
    match = re.search(r'(\d{4})[-_]?[wW](\d+)', week_str)
    if match:
        year = int(match.group(1))
        week = int(match.group(2))
    else:
        # Check for just digits
        match = re.search(r'(\d+)', week_str)
        if not match:
            return None
        year = default_year
        week = int(match.group(1))
    
    if week < 1 or week > 53:
        return None
    try:
        return datetime.strptime(f"{year}-W{week}-1", "%G-W%V-%u").date()
    except Exception:
        return None


@gantt_bp.route('/api/gantt/data/<table_id>')
def gantt_data(table_id):
    """Return Gantt chart data specifying Proto, DVT, EVT, and PVT phases for each row, estimating missing dates."""
    try:
        table = Table.get_by_id(table_id)
        if not table:
            return jsonify({'success': False, 'message': 'Table not found'}), 404

        rows = TableRow.get_all(table_id)
        today = date.today()
        gantt_tasks = []

        def parse_db_date(d_str):
            if not d_str:
                return None
            try:
                return datetime.strptime(d_str.strip(), '%Y-%m-%d').date()
            except ValueError:
                return None

        for row in rows:
            # 1. Try parsing Day dates
            p = parse_db_date(row.get('proto_day'))
            d = parse_db_date(row.get('dvt_day'))
            e = parse_db_date(row.get('evt_day'))
            v = parse_db_date(row.get('pvt_day'))

            # 2. Try parsing Week dates as fallback
            if not p: p = parse_week_to_date(row.get('proto_week'))
            if not d: d = parse_week_to_date(row.get('dvt_week'))
            if not e: e = parse_week_to_date(row.get('evt_week'))
            if not v: v = parse_week_to_date(row.get('pvt_week'))

            # 3. Perform estimation pass if any date is missing
            # If all are missing, default to a sequence starting today
            if not any([p, d, e, v]):
                p = today
                d = p + timedelta(days=7)
                e = d + timedelta(days=7)
                v = e + timedelta(days=7)
            else:
                # Resolve missing dates sequentially
                # Forward pass
                if p and not d: d = p + timedelta(days=7)
                if d and not e: e = d + timedelta(days=7)
                if e and not v: v = e + timedelta(days=7)
                
                # Backward pass
                if v and not e: e = v - timedelta(days=7)
                if e and not d: d = e - timedelta(days=7)
                if d and not p: p = d - timedelta(days=7)

            # Base name for tasks
            parts = []
            if row.get('category'):
                parts.append(f"[{row['category']}]")
            if row.get('test_method'):
                parts.append(row['test_method'])
            if row.get('test_number'):
                parts.append(f"({row['test_number']})")
            
            row_display_name = " ".join(parts) if parts else f"Row #{row.get('id')[:6]}"
            row_id = row['id']

            # Helper to add a phase task
            def add_phase_task(phase_id, phase_name, start_dt, end_dt, dep_id):
                # Ensure start is before end
                if start_dt >= end_dt:
                    start_dt = end_dt - timedelta(days=7)

                # progress
                if today < start_dt:
                    prog = 0
                elif today > end_dt:
                    prog = 100
                else:
                    total_days = (end_dt - start_dt).days
                    prog = int(((today - start_dt).days / total_days) * 100) if total_days > 0 else 100

                gantt_tasks.append({
                    'id': f"{row_id}_{phase_id}",
                    'name': f"{row_display_name} - {phase_name}",
                    'start': start_dt.isoformat(),
                    'end': end_dt.isoformat(),
                    'progress': prog,
                    'health': 'completed' if prog == 100 else ('on-track' if today >= start_dt else 'upcoming'),
                    'phase': phase_name,
                    'dependencies': dep_id,
                    'category': row.get('category', 'General'),
                    'test_method': row.get('test_method', 'N/A'),
                    'test_number': row.get('test_number', 'N/A'),
                    'others': row.get('others', ''),
                    'days_remaining': max(0, (end_dt - today).days)
                })

            # Add the 4 phases
            add_phase_task('proto', 'Proto', p - timedelta(days=7), p, '')
            add_phase_task('dvt', 'DVT', p, d, f"{row_id}_proto")
            add_phase_task('evt', 'EVT', d, e, f"{row_id}_dvt")
            add_phase_task('pvt', 'PVT', e, v, f"{row_id}_evt")

        # Sort all tasks by start date
        gantt_tasks.sort(key=lambda x: x['start'])

        return jsonify({
            'success': True,
            'data': gantt_tasks,
            'total': len(gantt_tasks)
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500