from firebase_config import db
from datetime import datetime

COLLECTION = 'tables'

class Table:
    @staticmethod
    def create(data):
        data['is_archived'] = data.get('is_archived', False)
        data['created_at'] = datetime.utcnow().isoformat()
        data['updated_at'] = datetime.utcnow().isoformat()
        doc_ref = db.collection(COLLECTION).add(data)
        return doc_ref[1].id

    @staticmethod
    def get_all():
        docs = db.collection(COLLECTION).stream()
        result = []
        for doc in docs:
            t = doc.to_dict()
            t['id'] = doc.id
            result.append(t)
        return result

    @staticmethod
    def get_by_id(doc_id):
        doc = db.collection(COLLECTION).document(doc_id).get()
        if doc.exists:
            data = doc.to_dict()
            data['id'] = doc.id
            return data
        return None

    @staticmethod
    def update(doc_id, data):
        data['updated_at'] = datetime.utcnow().isoformat()
        db.collection(COLLECTION).document(doc_id).update(data)

    @staticmethod
    def delete(doc_id):
        db.collection(COLLECTION).document(doc_id).delete()

    @staticmethod
    def delete_all():
        docs = db.collection(COLLECTION).stream()
        for doc in docs:
            doc.reference.delete()
