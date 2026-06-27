from firebase_config import db
from datetime import datetime

COLLECTION = 'daily_logs'

class DailyLog:
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
            log = doc.to_dict()
            log['id'] = doc.id
            result.append(log)
        return result
    
    @staticmethod
    def get_by_test_case(test_case_id):
        docs = db.collection(COLLECTION).where('test_case_id', '==', test_case_id).stream()
        result = []
        for doc in docs:
            log = doc.to_dict()
            log['id'] = doc.id
            result.append(log)
        return result
    
    @staticmethod
    def delete_all():
        docs = db.collection(COLLECTION).stream()
        for doc in docs:
            doc.reference.delete()