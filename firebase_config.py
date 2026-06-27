import firebase_admin
from firebase_admin import credentials, firestore
from config import Config

def init_firebase():
    """Initialize Firebase Admin SDK (only once)"""
    if not firebase_admin._apps:
        cred = credentials.Certificate(Config.FIREBASE_CREDENTIALS)
        firebase_admin.initialize_app(cred)
    return firestore.client()

# Initialize and expose Firestore client
db = init_firebase()