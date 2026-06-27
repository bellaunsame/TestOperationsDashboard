import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key')
    FIREBASE_CREDENTIALS = os.getenv('FIREBASE_CREDENTIALS', 'firebase-credentials.json')
    GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
    EMAILJS_PUBLIC_KEY = os.getenv('EMAILJS_PUBLIC_KEY')
    EMAILJS_SERVICE_ID = os.getenv('EMAILJS_SERVICE_ID')
    EMAILJS_TEMPLATE_ID = os.getenv('EMAILJS_TEMPLATE_ID')