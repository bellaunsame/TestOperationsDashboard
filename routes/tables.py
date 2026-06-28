from flask import Blueprint, jsonify, render_template, request
from models.table import Table
from models.table_row import TableRow

tables_bp = Blueprint('tables', __name__)

# ─────────────────────────────────────────────
#  PAGE ROUTES
# ─────────────────────────────────────────────

@tables_bp.route('/tables')
def tables_page():
    """Render the project-tables list page."""
    return render_template('tables.html')


@tables_bp.route('/tables/<table_id>')
def table_view_page(table_id):
    """Render the Excel-style spreadsheet view for a single table."""
    table = Table.get_by_id(table_id)
    if not table:
        return "Table not found", 404

    # Find previous and next active tables (sorted by created_at descending)
    try:
        all_tables = Table.get_all()
        active_tables = [t for t in all_tables if not t.get('is_archived', False)]
        active_tables.sort(key=lambda x: x.get('created_at', ''), reverse=True)

        prev_table_id = None
        next_table_id = None

        current_idx = next(i for i, t in enumerate(active_tables) if t['id'] == table_id)
        if current_idx > 0:
            prev_table_id = active_tables[current_idx - 1]['id']
        if current_idx < len(active_tables) - 1:
            next_table_id = active_tables[current_idx + 1]['id']
    except Exception:
        prev_table_id = None
        next_table_id = None

    return render_template(
        'table_view.html',
        table=table,
        prev_table_id=prev_table_id,
        next_table_id=next_table_id
    )


# ─────────────────────────────────────────────
#  TABLE (PROJECT) API
# ─────────────────────────────────────────────

@tables_bp.route('/api/tables', methods=['GET'])
def get_tables():
    """Return paginated, searchable, archive-filtered list of project tables."""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 9, type=int)
    search_query = request.args.get('search', '').lower().strip()
    show_archived = request.args.get('archived', 'false').lower() == 'true'

    try:
        all_tables = Table.get_all()

        # Filter archive state
        filtered = [t for t in all_tables if t.get('is_archived', False) == show_archived]

        # Search by project name or description
        if search_query:
            filtered = [
                t for t in filtered
                if search_query in t.get('project_name', '').lower()
                or search_query in t.get('description', '').lower()
            ]

        # Newest first
        filtered.sort(key=lambda x: x.get('created_at', ''), reverse=True)

        # Attach row count to each table
        for t in filtered:
            t['row_count'] = TableRow.count(t['id'])

        total = len(filtered)
        start = (page - 1) * per_page
        paginated = filtered[start:start + per_page]

        return jsonify({
            'success': True,
            'data': paginated,
            'page': page,
            'per_page': per_page,
            'total': total,
            'total_pages': (total + per_page - 1) // per_page if total > 0 else 0
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@tables_bp.route('/api/tables', methods=['POST'])
def create_table():
    """Create a new project table."""
    data = request.get_json() or {}
    project_name = data.get('project_name', '').strip()
    if not project_name:
        return jsonify({'success': False, 'message': 'Project name is required'}), 400

    table_data = {
        'project_name': project_name,
        'description': data.get('description', '').strip(),
    }
    try:
        table_id = Table.create(table_data)
        table_data['id'] = table_id
        table_data['row_count'] = 0
        return jsonify({'success': True, 'data': table_data}), 201
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@tables_bp.route('/api/tables/<table_id>', methods=['PUT'])
def update_table(table_id):
    """Rename or update description of a project table."""
    existing = Table.get_by_id(table_id)
    if not existing:
        return jsonify({'success': False, 'message': 'Table not found'}), 404

    data = request.get_json() or {}
    project_name = data.get('project_name', '').strip()
    if not project_name:
        return jsonify({'success': False, 'message': 'Project name is required'}), 400

    update_data = {
        'project_name': project_name,
        'description': data.get('description', existing.get('description', '')).strip(),
    }
    try:
        Table.update(table_id, update_data)
        update_data['id'] = table_id
        return jsonify({'success': True, 'data': update_data})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@tables_bp.route('/api/tables/<table_id>/archive', methods=['POST'])
def archive_table(table_id):
    """Toggle archive / restore a project table."""
    existing = Table.get_by_id(table_id)
    if not existing:
        return jsonify({'success': False, 'message': 'Table not found'}), 404

    try:
        new_status = not existing.get('is_archived', False)
        Table.update(table_id, {'is_archived': new_status})
        action = 'archived' if new_status else 'restored'
        return jsonify({'success': True, 'message': f'Table {action}', 'is_archived': new_status})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@tables_bp.route('/api/tables/<table_id>', methods=['DELETE'])
def delete_table(table_id):
    """Permanently delete a project table and all its rows."""
    existing = Table.get_by_id(table_id)
    if not existing:
        return jsonify({'success': False, 'message': 'Table not found'}), 404

    try:
        TableRow.delete_all(table_id)   # cascade delete rows
        Table.delete(table_id)
        return jsonify({'success': True, 'message': 'Table deleted'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ─────────────────────────────────────────────
#  ROW API  (subcollection)
# ─────────────────────────────────────────────

@tables_bp.route('/api/tables/<table_id>/rows', methods=['GET'])
def get_rows(table_id):
    """Return all rows for a project table."""
    if not Table.get_by_id(table_id):
        return jsonify({'success': False, 'message': 'Table not found'}), 404
    try:
        rows = TableRow.get_all(table_id)
        return jsonify({'success': True, 'data': rows})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@tables_bp.route('/api/tables/<table_id>/rows', methods=['POST'])
def create_row(table_id):
    """Add a new (empty) row to a project table."""
    if not Table.get_by_id(table_id):
        return jsonify({'success': False, 'message': 'Table not found'}), 404
    data = request.get_json() or {}
    try:
        row_id = TableRow.create(table_id, data)
        row = TableRow.get_by_id(table_id, row_id)
        return jsonify({'success': True, 'data': row}), 201
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@tables_bp.route('/api/tables/<table_id>/rows/<row_id>', methods=['PUT'])
def update_row(table_id, row_id):
    """Update one row in a project table (auto-save from inline editing)."""
    if not TableRow.get_by_id(table_id, row_id):
        return jsonify({'success': False, 'message': 'Row not found'}), 404
    data = request.get_json() or {}
    # Strip timestamps so they don't get overwritten by caller
    data.pop('created_at', None)
    data.pop('id', None)
    try:
        TableRow.update(table_id, row_id, data)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@tables_bp.route('/api/tables/<table_id>/rows/<row_id>', methods=['DELETE'])
def delete_row(table_id, row_id):
    """Delete a single row from a project table."""
    if not TableRow.get_by_id(table_id, row_id):
        return jsonify({'success': False, 'message': 'Row not found'}), 404
    try:
        TableRow.delete(table_id, row_id)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@tables_bp.route('/api/tables/<table_id>/rows/bulk', methods=['POST'])
def create_rows_bulk(table_id):
    """Bulk import rows into a project table using Firestore batch writes."""
    if not Table.get_by_id(table_id):
        return jsonify({'success': False, 'message': 'Table not found'}), 404

    data = request.get_json() or {}
    rows = data.get('rows', [])
    if not isinstance(rows, list):
        return jsonify({'success': False, 'message': 'Invalid rows format'}), 400

    from firebase_config import db
    from datetime import datetime

    try:
        fields = [
            'category', 'test_method', 'test_number',
            'proto_week', 'proto_day',
            'dvt_week', 'dvt_day',
            'evt_week', 'evt_day',
            'pvt_week', 'pvt_day',
            'others'
        ]

        collection_ref = db.collection('tables').document(table_id).collection('rows')
        created_rows = []

        # Firestore batch size limit is 500 operations
        chunk_size = 500
        for i in range(0, len(rows), chunk_size):
            chunk = rows[i:i + chunk_size]
            batch = db.batch()

            for r in chunk:
                row_data = {}
                for f in fields:
                    row_data[f] = str(r.get(f, '')).strip()
                row_data['created_at'] = datetime.utcnow().isoformat()
                row_data['updated_at'] = datetime.utcnow().isoformat()

                doc_ref = collection_ref.document()
                batch.set(doc_ref, row_data)

                row_data['id'] = doc_ref.id
                created_rows.append(row_data)

            batch.commit()

        return jsonify({'success': True, 'data': created_rows}), 201
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500
