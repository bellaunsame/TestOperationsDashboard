"""
AI Service powered by Google Gemini.
Provides contextual responses about test operations data.
"""
import google.generativeai as genai
from config import Config
from models.test_case import TestCase
from datetime import date, datetime

# Configure Gemini
genai.configure(api_key=Config.GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-2.0-flash-exp')

def build_context():
    """Build a context summary of current test operations data."""
    test_cases = TestCase.get_all()
    today = date.today()
    
    if not test_cases:
        return "No test cases in the system yet."
    
    context = f"Today's date: {today.isoformat()}\n\n"
    context += f"Total test cases: {len(test_cases)}\n\n"
    context += "=== TEST CASES ===\n"
    
    for tc in test_cases:
        start = datetime.fromisoformat(tc['start_date']).date()
        end = datetime.fromisoformat(tc['end_date']).date()
        days_remaining = (end - today).days
        
        context += f"\n• {tc['name']}\n"
        context += f"  - Owner: {tc.get('owner', 'N/A')}\n"
        context += f"  - Category: {tc.get('category', 'N/A')}\n"
        context += f"  - Priority: {tc.get('priority', 'N/A')}\n"
        context += f"  - Status: {tc.get('status', 'N/A')}\n"
        context += f"  - Progress: {tc.get('progress', 0)}%\n"
        context += f"  - Schedule: {tc['start_date']} to {tc['end_date']}\n"
        context += f"  - Days remaining: {days_remaining}\n"
    
    return context

def get_ai_response(user_message, chat_history=None):
    """
    Get AI response with context about test operations.
    
    Args:
        user_message (str): User's question
        chat_history (list, optional): Previous messages [{role, content}]
    
    Returns:
        dict: { 'success': bool, 'response': str, 'error': str }
    """
    try:
        context = build_context()
        
        system_prompt = f"""You are a helpful AI assistant for a Test Operations Dashboard. 
You have access to current test case data and help users understand their testing operations.

Be concise, friendly, and data-driven. Use emojis sparingly. Format with line breaks for readability.

Current operations data:
{context}

Answer the user's question based on this data. If the question is unrelated to testing operations, 
politely redirect them or provide general assistance.
"""
        
        # Build full prompt with history
        full_prompt = system_prompt + "\n\n"
        
        if chat_history:
            for msg in chat_history[-5:]:  # Last 5 messages for context
                role = "User" if msg['role'] == 'user' else "Assistant"
                full_prompt += f"{role}: {msg['content']}\n"
        
        full_prompt += f"User: {user_message}\nAssistant:"
        
        response = model.generate_content(full_prompt)
        
        return {
            'success': True,
            'response': response.text,
        }
    
    except Exception as e:
        return {
            'success': False,
            'response': "Sorry, I'm having trouble right now. Please try again.",
            'error': str(e),
        }