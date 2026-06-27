"""
Service that performs automatic calculations for Gantt chart data:
- Expected progress based on date
- Variance (actual vs expected)
- Health status (on-track, behind, ahead, etc.)
- Days remaining
"""
from datetime import date, datetime

def calculate_gantt_data(test_cases):
    """
    Enrich test case data with calculated fields for Gantt chart.
    """
    today = date.today()
    enriched = []
    
    for tc in test_cases:
        # Parse dates from ISO format
        start = datetime.fromisoformat(tc['start_date']).date()
        end = datetime.fromisoformat(tc['end_date']).date()
        
        # Calculate duration metrics
        total_days = (end - start).days + 1
        days_elapsed = (today - start).days
        days_remaining = (end - today).days
        
        # Calculate expected progress (linear over time)
        if today < start:
            expected_progress = 0.0
        elif today > end:
            expected_progress = 100.0
        else:
            expected_progress = round((days_elapsed / total_days) * 100, 1)
        
        # Calculate variance (actual - expected)
        actual_progress = tc.get('progress', 0.0)
        variance = round(actual_progress - expected_progress, 1)
        
        # Determine health status
        if tc['status'] == 'Completed':
            health = 'completed'
        elif tc['status'] == 'Blocked':
            health = 'blocked'
        elif tc['status'] == 'Not Started' and today < start:
            health = 'upcoming'
        elif variance >= 5:
            health = 'ahead'
        elif variance >= -5:
            health = 'on-track'
        elif variance >= -15:
            health = 'at-risk'
        else:
            health = 'delayed'
        
        enriched.append({
            'id': tc['id'],
            'name': tc['name'],
            'start': tc['start_date'],
            'end': tc['end_date'],
            'progress': actual_progress,
            'expected_progress': expected_progress,
            'variance': variance,
            'health': health,
            'status': tc['status'],
            'priority': tc.get('priority', 'Medium'),
            'owner': tc.get('owner', 'Unassigned'),
            'category': tc.get('category', 'General'),
            'description': tc.get('description', ''),
            'total_days': total_days,
            'days_elapsed': max(0, days_elapsed),
            'days_remaining': max(0, days_remaining),
            'dependencies': '',
        })
    
    # Sort by start date
    enriched.sort(key=lambda x: x['start'])
    
    return enriched