from flask import Blueprint, jsonify, render_template
from models.test_case import TestCase
from services.gantt_calculator import calculate_gantt_data

gantt_bp = Blueprint('gantt', __name__)

@gantt_bp.route('/gantt')
def gantt_page():
    """Render the Gantt chart page"""
    return render_template('gantt.html')

@gantt_bp.route('/api/gantt/data')
def gantt_data():
    """Return Gantt chart data as JSON"""
    test_cases = TestCase.get_all()
    enriched_data = calculate_gantt_data(test_cases)
    
    return jsonify({
        'success': True,
        'data': enriched_data,
        'total': len(enriched_data)
    })