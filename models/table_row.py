from firebase_config import db
from datetime import datetime

COLLECTION = 'tables'
SUBCOLLECTION = 'rows'

class TableRow:
    @staticmethod
    def create(table_id, data):
        data['created_at'] = datetime.utcnow().isoformat()
        data['updated_at'] = datetime.utcnow().isoformat()
        # Default all fields to empty string if not provided
        fields = [
            'category', 'test_method', 'test_number',
            'proto_week', 'proto_day', 'proto_qty',
            'dvt_week', 'dvt_day', 'dvt_qty',
            'evt_week', 'evt_day', 'evt_qty',
            'pvt_week', 'pvt_day', 'pvt_qty',
            'others'
        ]
        for field in fields:
            data.setdefault(field, '')
        
        ref = db.collection(COLLECTION).document(table_id).collection(SUBCOLLECTION)
        doc_ref = ref.add(data)
        return doc_ref[1].id

    @staticmethod
    def get_all(table_id):
        docs = (
            db.collection(COLLECTION)
            .document(table_id)
            .collection(SUBCOLLECTION)
            .order_by('created_at')
            .stream()
        )
        result = []
        for doc in docs:
            row = doc.to_dict()
            row['id'] = doc.id
            result.append(row)
        return result

    @staticmethod
    def get_by_id(table_id, row_id):
        doc = (
            db.collection(COLLECTION)
            .document(table_id)
            .collection(SUBCOLLECTION)
            .document(row_id)
            .get()
        )
        if doc.exists:
            data = doc.to_dict()
            data['id'] = doc.id
            return data
        return None

    @staticmethod
    def update(table_id, row_id, data):
        data['updated_at'] = datetime.utcnow().isoformat()
        (
            db.collection(COLLECTION)
            .document(table_id)
            .collection(SUBCOLLECTION)
            .document(row_id)
            .update(data)
        )

    @staticmethod
    def delete(table_id, row_id):
        (
            db.collection(COLLECTION)
            .document(table_id)
            .collection(SUBCOLLECTION)
            .document(row_id)
            .delete()
        )

    @staticmethod
    def delete_all(table_id):
        docs = (
            db.collection(COLLECTION)
            .document(table_id)
            .collection(SUBCOLLECTION)
            .stream()
        )
        for doc in docs:
            doc.reference.delete()

    @staticmethod
    def count(table_id):
        docs = (
            db.collection(COLLECTION)
            .document(table_id)
            .collection(SUBCOLLECTION)
            .stream()
        )
        return sum(1 for _ in docs)
