from firebase_config import db
from datetime import datetime

COLLECTION = 'users'

class User:
    @staticmethod
    def create(data):
        data['created_at'] = datetime.utcnow().isoformat()
        doc_ref = db.collection(COLLECTION).add(data)
        return doc_ref[1].id
    
    @staticmethod
    def get_all():
        docs = db.collection(COLLECTION).stream()
        result = []
        for doc in docs:
            user = doc.to_dict()
            user['id'] = doc.id
            result.append(user)
        return result
    
    @staticmethod
    def delete_all():
        docs = db.collection(COLLECTION).stream()
        for doc in docs:
            doc.reference.delete()