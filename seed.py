"""
Seed script to populate Firestore with sample test data.
Run this once: python seed.py
"""
from models.test_case import TestCase
from models.daily_log import DailyLog
from models.user import User
from datetime import date, timedelta
import random

def seed_database():
    print("🗑️  Clearing existing data...")
    TestCase.delete_all()
    DailyLog.delete_all()
    User.delete_all()
    
    print("👥 Creating users...")
    users_data = [
        {'name': 'Alice Johnson', 'email': 'alice@testops.com', 'role': 'Lead'},
        {'name': 'Bob Smith', 'email': 'bob@testops.com', 'role': 'Tester'},
        {'name': 'Charlie Davis', 'email': 'charlie@testops.com', 'role': 'Tester'},
        {'name': 'Diana Wilson', 'email': 'diana@testops.com', 'role': 'Manager'},
    ]
    for user in users_data:
        User.create(user)
    
    print("🧪 Creating test cases...")
    today = date.today()
    
    test_cases_data = [
        {
            'name': 'Login Authentication Test',
            'description': 'Verify user login flow with valid/invalid credentials',
            'owner': 'Alice Johnson',
            'category': 'Functional',
            'start_date': (today - timedelta(days=5)).isoformat(),
            'end_date': (today + timedelta(days=5)).isoformat(),
            'status': 'In Progress',
            'progress': 50.0,
            'priority': 'High',
        },
        {
            'name': 'Payment Gateway Integration',
            'description': 'Test Stripe payment integration end-to-end',
            'owner': 'Bob Smith',
            'category': 'Integration',
            'start_date': (today - timedelta(days=10)).isoformat(),
            'end_date': (today + timedelta(days=3)).isoformat(),
            'status': 'In Progress',
            'progress': 75.0,
            'priority': 'Critical',
        },
        {
            'name': 'Dashboard Performance Test',
            'description': 'Load testing with 1000 concurrent users',
            'owner': 'Charlie Davis',
            'category': 'Performance',
            'start_date': (today - timedelta(days=2)).isoformat(),
            'end_date': (today + timedelta(days=8)).isoformat(),
            'status': 'In Progress',
            'progress': 20.0,
            'priority': 'Medium',
        },
        {
            'name': 'Security Penetration Test',
            'description': 'SQL injection and XSS vulnerability scan',
            'owner': 'Alice Johnson',
            'category': 'Security',
            'start_date': (today + timedelta(days=2)).isoformat(),
            'end_date': (today + timedelta(days=12)).isoformat(),
            'status': 'Not Started',
            'progress': 0.0,
            'priority': 'Critical',
        },
        {
            'name': 'Mobile App UI Test',
            'description': 'Cross-device responsive UI verification',
            'owner': 'Bob Smith',
            'category': 'UI',
            'start_date': (today - timedelta(days=15)).isoformat(),
            'end_date': (today - timedelta(days=1)).isoformat(),
            'status': 'Completed',
            'progress': 100.0,
            'priority': 'Medium',
        },
        {
            'name': 'API Endpoint Regression',
            'description': 'Regression test for all REST API endpoints',
            'owner': 'Charlie Davis',
            'category': 'Regression',
            'start_date': (today - timedelta(days=7)).isoformat(),
            'end_date': (today + timedelta(days=1)).isoformat(),
            'status': 'Delayed',
            'progress': 40.0,
            'priority': 'High',
        },
        {
            'name': 'Database Backup Recovery',
            'description': 'Test backup restoration procedures',
            'owner': 'Diana Wilson',
            'category': 'Infrastructure',
            'start_date': (today + timedelta(days=5)).isoformat(),
            'end_date': (today + timedelta(days=15)).isoformat(),
            'status': 'Not Started',
            'progress': 0.0,
            'priority': 'Low',
        },
        {
            'name': 'Email Notification System',
            'description': 'Verify all transactional emails fire correctly',
            'owner': 'Alice Johnson',
            'category': 'Functional',
            'start_date': (today - timedelta(days=3)).isoformat(),
            'end_date': (today + timedelta(days=4)).isoformat(),
            'status': 'Blocked',
            'progress': 30.0,
            'priority': 'Medium',
        },
    ]
    
    test_case_ids = []
    for tc_data in test_cases_data:
        tc_id = TestCase.create(tc_data)
        test_case_ids.append((tc_id, tc_data['status'], tc_data['name']))
    
    print("📝 Creating daily logs...")
    for tc_id, status, name in test_case_ids:
        if status in ['In Progress', 'Completed', 'Delayed']:
            for i in range(random.randint(3, 5)):
                log_date = today - timedelta(days=i)
                log_data = {
                    'test_case_id': tc_id,
                    'log_date': log_date.isoformat(),
                    'hours_worked': round(random.uniform(2.0, 8.0), 1),
                    'progress_made': round(random.uniform(5.0, 20.0), 1),
                    'notes': f'Day {i+1} progress on {name}',
                    'blockers': 'None' if random.random() > 0.3 else 'Waiting on dependency',
                }
                DailyLog.create(log_data)
    
    print("\n✅ Firestore seeded successfully!")
    print(f"   Users: {len(User.get_all())}")
    print(f"   Test Cases: {len(TestCase.get_all())}")
    print(f"   Daily Logs: {len(DailyLog.get_all())}")

if __name__ == '__main__':
    seed_database()