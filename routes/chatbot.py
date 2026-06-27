from flask import Blueprint, request, jsonify
from services.ai_service import get_ai_response

chatbot_bp = Blueprint('chatbot', __name__)

@chatbot_bp.route('/api/chatbot', methods=['POST'])
def chat():
    """Handle chatbot messages"""
    data = request.get_json()
    user_message = data.get('message', '').strip()
    history = data.get('history', [])
    
    if not user_message:
        return jsonify({
            'success': False,
            'response': 'Please send a message.',
        }), 400
    
    result = get_ai_response(user_message, history)
    return jsonify(result)