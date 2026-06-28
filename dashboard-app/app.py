import os
import re
import io
import smtplib
from datetime import date, datetime, timedelta
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from dotenv import load_dotenv

import firebase_admin
from firebase_admin import credentials, firestore
import google.generativeai as genai

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication

# Load environment variables
load_dotenv()

# Initialize Flask
# Customizing template_folder to 'template' to match the singular request folder
app = Flask(__name__, template_folder='template')
CORS(app)

app.secret_key = os.getenv('SECRET_KEY', 'dev-secret-key')

# ── Initialize Firebase ────────────────────────────────────────────────
def init_firebase():
    """Locate and initialize Firebase Admin Certificate certificate."""
    if not firebase_admin._apps:
        # Check standard config file or search path
        cred_path = os.getenv('FIREBASE_CREDENTIALS', 'firebase-credentials.json')
        if not os.path.exists(cred_path):
            # Try parent directory
            parent_path = os.path.join('..', cred_path)
            if os.path.exists(parent_path):
                cred_path = parent_path
            else:
                # Direct check
                if os.path.exists('../firebase-credentials.json'):
                    cred_path = '../firebase-credentials.json'
        
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    return firestore.client()

db = init_firebase()
COLLECTION = 'tables'
SUBCOLLECTION = 'rows'

# ── Configure Gemini AI ────────────────────────────────────────────────
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    gemini_model = genai.GenerativeModel('gemini-2.0-flash-exp')
else:
    gemini_model = None

# ── Helper: Parse Week String ──────────────────────────────────────────
def parse_week_to_date(week_str, default_year=2026):
    """Parse a week string (e.g. 'Week 26', 'W26', '26') to a Monday Date."""
    if not week_str:
        return None
    week_str = str(week_str).strip()
    match = re.search(r'(\d{4})[-_]?[wW](\d+)', week_str)
    if match:
        year = int(match.group(1))
        week = int(match.group(2))
    else:
        match = re.search(r'(\d+)', week_str)
        if not match:
            return None
        year = default_year
        week = int(match.group(1))
    
    if week < 1 or week > 53:
        return None
    try:
        return datetime.strptime(f"{year}-W{week}-1", "%G-W%V-%u").date()
    except Exception:
        return None

# ── UI Rendering Routes ─────────────────────────────────────────────────
@app.route('/')
def home():
    """Render the Home/Spreadsheet page."""
    return render_template('home.html')

@app.route('/dashboard')
def dashboard():
    """Render the Dashboard metrics and Gantt page."""
    return render_template('dashboard.html')

# ── Project Tables REST API ─────────────────────────────────────────────
@app.route('/api/tables', methods=['GET'])
def get_tables():
    """Get active project tables."""
    try:
        archived = request.args.get('archived', 'false').lower() == 'true'
        docs = db.collection(COLLECTION).stream()
        tables = []
        for doc in docs:
            data = doc.to_dict()
            data['id'] = doc.id
            if data.get('is_archived', False) == archived:
                tables.append(data)
        
        # Sort by project name
        tables.sort(key=lambda x: x.get('project_name', '').lower())
        return jsonify({'success': True, 'data': tables})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/tables', methods=['POST'])
def create_table():
    """Create a new project table."""
    try:
        data = request.get_json() or {}
        project_name = data.get('project_name', '').strip()
        if not project_name:
            return jsonify({'success': False, 'message': 'Project name is required'}), 400
        
        doc_data = {
            'project_name': project_name,
            'description': data.get('description', '').strip(),
            'is_archived': False,
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat(),
            'row_count': 0
        }
        
        doc_ref = db.collection(COLLECTION).add(doc_data)
        new_table_id = doc_ref[1].id
        doc_data['id'] = new_table_id
        
        return jsonify({'success': True, 'data': doc_data}), 201
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/tables/<table_id>', methods=['GET'])
def get_table(table_id):
    """Retrieve details of a single table."""
    try:
        doc = db.collection(COLLECTION).document(table_id).get()
        if not doc.exists:
            return jsonify({'success': False, 'message': 'Table not found'}), 404
        data = doc.to_dict()
        data['id'] = doc.id
        return jsonify({'success': True, 'data': data})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/tables/<table_id>', methods=['PUT'])
def update_table(table_id):
    """Update a table's name or description."""
    try:
        data = request.get_json() or {}
        doc_ref = db.collection(COLLECTION).document(table_id)
        if not doc_ref.get().exists:
            return jsonify({'success': False, 'message': 'Table not found'}), 404
        
        update_data = {}
        if 'project_name' in data:
            update_data['project_name'] = data['project_name'].strip()
        if 'description' in data:
            update_data['description'] = data['description'].strip()
        
        update_data['updated_at'] = datetime.utcnow().isoformat()
        doc_ref.update(update_data)
        
        updated = doc_ref.get().to_dict()
        updated['id'] = table_id
        return jsonify({'success': True, 'data': updated})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/tables/<table_id>', methods=['DELETE'])
def delete_table(table_id):
    """Delete a table and its rows subcollection."""
    try:
        doc_ref = db.collection(COLLECTION).document(table_id)
        if not doc_ref.get().exists:
            return jsonify({'success': False, 'message': 'Table not found'}), 404
        
        # Delete subcollection rows
        rows = doc_ref.collection(SUBCOLLECTION).stream()
        for r in rows:
            r.reference.delete()
            
        doc_ref.delete()
        return jsonify({'success': True, 'message': 'Table deleted successfully'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/tables/<table_id>/archive', methods=['POST'])
def toggle_archive_table(table_id):
    """Toggle the archive state of a project table."""
    try:
        doc_ref = db.collection(COLLECTION).document(table_id)
        doc = doc_ref.get()
        if not doc.exists:
            return jsonify({'success': False, 'message': 'Table not found'}), 404
        
        current_state = doc.to_dict().get('is_archived', False)
        new_state = not current_state
        doc_ref.update({
            'is_archived': new_state,
            'updated_at': datetime.utcnow().isoformat()
        })
        return jsonify({'success': True, 'is_archived': new_state})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

# ── Rows Subcollection REST API ──────────────────────────────────────────
@app.route('/api/tables/<table_id>/rows', methods=['GET'])
def get_rows(table_id):
    """Fetch rows for a given table ID."""
    try:
        docs = db.collection(COLLECTION).document(table_id).collection(SUBCOLLECTION).order_by('created_at').stream()
        rows = []
        for doc in docs:
            r = doc.to_dict()
            r['id'] = doc.id
            rows.append(r)
        return jsonify({'success': True, 'data': rows})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/tables/<table_id>/rows', methods=['POST'])
def add_row(table_id):
    """Add a row to a table."""
    try:
        data = request.get_json() or {}
        
        fields = [
            'category', 'test_method', 'test_number',
            'proto_week', 'proto_day', 'proto_qty',
            'dvt_week', 'dvt_day', 'dvt_qty',
            'evt_week', 'evt_day', 'evt_qty',
            'pvt_week', 'pvt_day', 'pvt_qty',
            'others'
        ]
        
        row_payload = {
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }
        for field in fields:
            row_payload[field] = data.get(field, '').strip()
            
        doc_ref = db.collection(COLLECTION).document(table_id).collection(SUBCOLLECTION).add(row_payload)
        row_payload['id'] = doc_ref[1].id
        
        # Update row count
        table_ref = db.collection(COLLECTION).document(table_id)
        current = table_ref.get().to_dict() or {}
        table_ref.update({'row_count': (current.get('row_count', 0) + 1)})
        
        return jsonify({'success': True, 'data': row_payload}), 201
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/tables/<table_id>/rows/<row_id>', methods=['PUT'])
def update_row(table_id, row_id):
    """Update a specific row's cells."""
    try:
        data = request.get_json() or {}
        doc_ref = db.collection(COLLECTION).document(table_id).collection(SUBCOLLECTION).document(row_id)
        
        if not doc_ref.get().exists:
            return jsonify({'success': False, 'message': 'Row not found'}), 404
        
        data['updated_at'] = datetime.utcnow().isoformat()
        doc_ref.update(data)
        
        updated = doc_ref.get().to_dict()
        updated['id'] = row_id
        return jsonify({'success': True, 'data': updated})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/tables/<table_id>/rows/<row_id>', methods=['DELETE'])
def delete_row(table_id, row_id):
    """Delete a row."""
    try:
        doc_ref = db.collection(COLLECTION).document(table_id).collection(SUBCOLLECTION).document(row_id)
        if not doc_ref.get().exists:
            return jsonify({'success': False, 'message': 'Row not found'}), 404
            
        doc_ref.delete()
        
        # Update row count
        table_ref = db.collection(COLLECTION).document(table_id)
        current = table_ref.get().to_dict() or {}
        table_ref.update({'row_count': max(0, current.get('row_count', 0) - 1)})
        
        return jsonify({'success': True, 'message': 'Row deleted'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/tables/<table_id>/rows/bulk', methods=['POST'])
def bulk_import_rows(table_id):
    """Bulk import rows using batch writes."""
    try:
        data = request.get_json() or {}
        rows_to_import = data.get('rows', [])
        
        if not rows_to_import:
            return jsonify({'success': False, 'message': 'No rows provided'}), 400
            
        # Get reference
        table_ref = db.collection(COLLECTION).document(table_id)
        if not table_ref.get().exists:
            return jsonify({'success': False, 'message': 'Table not found'}), 404
            
        fields = [
            'category', 'test_method', 'test_number',
            'proto_week', 'proto_day', 'proto_qty',
            'dvt_week', 'dvt_day', 'dvt_qty',
            'evt_week', 'evt_day', 'evt_qty',
            'pvt_week', 'pvt_day', 'pvt_qty',
            'others'
        ]
        
        batch = db.batch()
        created_rows = []
        
        for r in rows_to_import:
            row_payload = {
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }
            for f in fields:
                row_payload[f] = str(r.get(f, '')).strip()
                
            new_ref = table_ref.collection(SUBCOLLECTION).document()
            batch.set(new_ref, row_payload)
            row_payload['id'] = new_ref.id
            created_rows.append(row_payload)
            
        batch.commit()
        
        # Update count
        current = table_ref.get().to_dict() or {}
        table_ref.update({'row_count': current.get('row_count', 0) + len(created_rows)})
        
        return jsonify({'success': True, 'data': created_rows}), 201
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

# ── Gantt Chart Data Endpoint (Automatic Day Calculation) ────────────────
@app.route('/api/gantt/data/<table_id>', methods=['GET'])
def get_gantt_data(table_id):
    """Retrieve phase tasks (Proto, DVT, EVT, PVT) for all rows, calculating durations dynamically."""
    try:
        table = db.collection(COLLECTION).document(table_id).get()
        if not table.exists:
            return jsonify({'success': False, 'message': 'Table not found'}), 404

        docs = db.collection(COLLECTION).document(table_id).collection(SUBCOLLECTION).order_by('created_at').stream()
        today = date.today()
        gantt_tasks = []

        def parse_db_date(d_str):
            if not d_str:
                return None
            try:
                return datetime.strptime(d_str.strip(), '%Y-%m-%d').date()
            except ValueError:
                return None

        for doc in docs:
            row = doc.to_dict()
            row_id = doc.id

            # Parse Day dates
            p = parse_db_date(row.get('proto_day'))
            d = parse_db_date(row.get('dvt_day'))
            e = parse_db_date(row.get('evt_day'))
            v = parse_db_date(row.get('pvt_day'))

            # Fallback to Week strings
            if not p: p = parse_week_to_date(row.get('proto_week'))
            if not d: d = parse_week_to_date(row.get('dvt_week'))
            if not e: e = parse_week_to_date(row.get('evt_week'))
            if not v: v = parse_week_to_date(row.get('pvt_week'))

            # Estimation pass
            if not any([p, d, e, v]):
                p = today
                d = p + timedelta(days=7)
                e = d + timedelta(days=7)
                v = e + timedelta(days=7)
                phase_override = 'Planning'
            else:
                phase_override = None
                # Bidirectional resolution
                if p and not d: d = p + timedelta(days=7)
                if d and not e: e = d + timedelta(days=7)
                if e and not v: v = e + timedelta(days=7)
                
                if v and not e: e = v - timedelta(days=7)
                if e and not d: d = e - timedelta(days=7)
                if d and not p: p = d - timedelta(days=7)

            parts = []
            if row.get('category'):
                parts.append(f"[{row['category']}]")
            if row.get('test_method'):
                parts.append(row['test_method'])
            if row.get('test_number'):
                parts.append(f"({row['test_number']})")
            
            row_display_name = " ".join(parts) if parts else f"Row #{row_id[:6]}"

            def add_phase_task(phase_key, phase_name, start_dt, end_dt):
                if start_dt >= end_dt:
                    start_dt = end_dt - timedelta(days=7)

                if today < start_dt:
                    prog = 0
                elif today > end_dt:
                    prog = 100
                else:
                    total_days = (end_dt - start_dt).days
                    prog = int(((today - start_dt).days / total_days) * 100) if total_days > 0 else 100

                actual_phase = phase_override if phase_override else phase_name

                gantt_tasks.append({
                    'id': f"{row_id}_{phase_key}",
                    'name': f"{row_display_name} - {actual_phase}",
                    'start': start_dt.isoformat(),
                    'end': end_dt.isoformat(),
                    'progress': prog,
                    'health': 'completed' if prog == 100 else ('on-track' if today >= start_dt else 'upcoming'),
                    'phase': actual_phase,
                    'dependencies': '',
                    'category': row.get('category', 'General'),
                    'test_method': row.get('test_method', 'N/A'),
                    'test_number': row.get('test_number', 'N/A'),
                    'others': row.get('others', ''),
                    'days_remaining': max(0, (end_dt - today).days)
                })

            # Append the 4 phase bars
            if phase_override:
                add_phase_task('plan', 'Planning', p, d)
            else:
                add_phase_task('proto', 'Proto', p - timedelta(days=7), p)
                add_phase_task('dvt', 'DVT', p, d)
                add_phase_task('evt', 'EVT', d, e)
                add_phase_task('pvt', 'PVT', e, v)

        # Sort tasks by start date
        gantt_tasks.sort(key=lambda x: x['start'])

        return jsonify({
            'success': True,
            'data': gantt_tasks,
            'total': len(gantt_tasks)
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

# ── AI Chatbot API ───────────────────────────────────────────────────────
@app.route('/api/chatbot', methods=['POST'])
def chat():
    """Process message and return Gemini AI chatbot response based on Firestore context."""
    if not gemini_model:
        return jsonify({
            'success': False,
            'response': "Gemini API key is not configured. Please add GEMINI_API_KEY to your environment variables."
        })
        
    try:
        req_data = request.get_json() or {}
        user_message = req_data.get('message', '').strip()
        history = req_data.get('history', [])
        table_id = req_data.get('table_id')

        if not user_message:
            return jsonify({'success': False, 'response': 'Message cannot be empty'}), 400

        # Build context from active Firestore rows
        context = ""
        if table_id:
            table_doc = db.collection(COLLECTION).document(table_id).get()
            if table_doc.exists:
                table_name = table_doc.to_dict().get('project_name', 'Current Project')
                docs = db.collection(COLLECTION).document(table_id).collection(SUBCOLLECTION).stream()
                rows = [d.to_dict() for d in docs]
                
                context += f"You are looking at project '{table_name}'. It has {len(rows)} test cases.\n\n"
                context += "=== DATA ROWS ===\n"
                for idx, r in enumerate(rows, 1):
                    context += f"{idx}. [{r.get('category','N/A')}] {r.get('test_method','N/A')} ({r.get('test_number','N/A')})\n"
                    context += f"   - Proto: Week={r.get('proto_week') or 'N/A'}, Day={r.get('proto_day') or 'N/A'}, Qty={r.get('proto_qty') or 'N/A'}\n"
                    context += f"   - DVT:   Week={r.get('dvt_week') or 'N/A'}, Day={r.get('dvt_day') or 'N/A'}, Qty={r.get('dvt_qty') or 'N/A'}\n"
                    context += f"   - EVT:   Week={r.get('evt_week') or 'N/A'}, Day={r.get('evt_day') or 'N/A'}, Qty={r.get('evt_qty') or 'N/A'}\n"
                    context += f"   - PVT:   Week={r.get('pvt_week') or 'N/A'}, Day={r.get('pvt_day') or 'N/A'}, Qty={r.get('pvt_qty') or 'N/A'}\n"
                    if r.get('others'):
                        context += f"   - Notes: {r['others']}\n"
                    context += "\n"
        
        if not context:
            context = "No specific project table is currently selected. Ask the user to select a project to analyze."

        system_prompt = f"""You are a helpful AI chatbot for a Test Operations Dashboard.
You have access to current test cases and milestones data in Firestore.

Be concise, technical, and data-driven. Use emojis sparingly. Format with line breaks and markdown.

Current context:
{context}

Answer the user's question clearly based on this data.
"""
        # Append history
        full_prompt = system_prompt + "\n\n"
        for msg in history[-6:]:
            role = "User" if msg.get('role') == 'user' else "Assistant"
            full_prompt += f"{role}: {msg.get('content')}\n"
            
        full_prompt += f"User: {user_message}\nAssistant:"
        
        response = gemini_model.generate_content(full_prompt)
        
        return jsonify({
            'success': True,
            'response': response.text
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'response': "Sorry, I ran into an error processing your query.",
            'error': str(e)
        }), 500

# ── Dynamic PDF Generation (ReportLab) ───────────────────────────────────
def generate_pdf_report(project_name, rows):
    """Generate in-memory PDF binary data using ReportLab."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=40, bottomMargin=40)
    story = []
    
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'DocTitle', parent=styles['Heading1'],
        fontName='Helvetica-Bold', fontSize=22, leading=26,
        textColor=colors.HexColor('#0f172a'), spaceAfter=4
    )
    
    sub_style = ParagraphStyle(
        'DocSub', parent=styles['Normal'],
        fontName='Helvetica', fontSize=9, leading=13,
        textColor=colors.HexColor('#64748b'), spaceAfter=15
    )
    
    sec_style = ParagraphStyle(
        'SecHeader', parent=styles['Heading2'],
        fontName='Helvetica-Bold', fontSize=13, leading=17,
        textColor=colors.HexColor('#1e40af'), spaceBefore=10, spaceAfter=8
    )
    
    cell_style = ParagraphStyle(
        'CellVal', parent=styles['Normal'],
        fontName='Helvetica', fontSize=8, leading=10,
        textColor=colors.HexColor('#334155')
    )
    
    header_cell_style = ParagraphStyle(
        'HeaderVal', parent=styles['Normal'],
        fontName='Helvetica-Bold', fontSize=8, leading=10,
        textColor=colors.white
    )

    # Document Header
    story.append(Paragraph(f"{project_name} - Daily Report", title_style))
    story.append(Paragraph(f"Generated on {datetime.now().strftime('%B %d, %Y at %H:%M:%S')}", sub_style))
    story.append(Spacer(1, 10))
    
    # Tables summary metrics block
    story.append(Paragraph("Project Status Summary", sec_style))
    total_rows = len(rows)
    
    # Compute counts
    # Categorize test counts by phase presence or standard groupings
    summary_data = [
        [Paragraph("<b>Metric</b>", cell_style), Paragraph("<b>Value</b>", cell_style)],
        [Paragraph("Total Test Cases", cell_style), Paragraph(str(total_rows), cell_style)]
    ]
    sum_table = Table(summary_data, colWidths=[180, 100])
    sum_table.setStyle(TableStyle([
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f1f5f9')),
        ('PADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(sum_table)
    story.append(Spacer(1, 15))

    # Main Data Table
    story.append(Paragraph("Detailed Test Operations Matrix", sec_style))
    
    headers = [
        Paragraph("Category", header_cell_style),
        Paragraph("Test Method", header_cell_style),
        Paragraph("Test Number", header_cell_style),
        Paragraph("Proto (Qty)", header_cell_style),
        Paragraph("DVT (Qty)", header_cell_style),
        Paragraph("EVT (Qty)", header_cell_style),
        Paragraph("PVT (Qty)", header_cell_style)
    ]
    table_data = [headers]
    
    for r in rows:
        proto_txt = f"{r.get('proto_week') or '-'}<br/>{r.get('proto_day') or '-'}"
        if r.get('proto_qty'): proto_txt += f" (Qty: {r['proto_qty']})"
        
        dvt_txt = f"{r.get('dvt_week') or '-'}<br/>{r.get('dvt_day') or '-'}"
        if r.get('dvt_qty'): dvt_txt += f" (Qty: {r['dvt_qty']})"
        
        evt_txt = f"{r.get('evt_week') or '-'}<br/>{r.get('evt_day') or '-'}"
        if r.get('evt_qty'): evt_txt += f" (Qty: {r['evt_qty']})"
        
        pvt_txt = f"{r.get('pvt_week') or '-'}<br/>{r.get('pvt_day') or '-'}"
        if r.get('pvt_qty'): pvt_txt += f" (Qty: {r['pvt_qty']})"

        table_data.append([
            Paragraph(r.get('category') or 'N/A', cell_style),
            Paragraph(r.get('test_method') or 'N/A', cell_style),
            Paragraph(r.get('test_number') or 'N/A', cell_style),
            Paragraph(proto_txt, cell_style),
            Paragraph(dvt_txt, cell_style),
            Paragraph(evt_txt, cell_style),
            Paragraph(pvt_txt, cell_style)
        ])
        
    t = Table(table_data, colWidths=[75, 100, 65, 75, 75, 75, 75], repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f172a')),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')]),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    
    story.append(t)
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()

@app.route('/api/report/pdf/<table_id>', methods=['GET'])
def download_pdf(table_id):
    """Generate and stream PDF report for the given project table."""
    try:
        table_doc = db.collection(COLLECTION).document(table_id).get()
        if not table_doc.exists:
            return jsonify({'success': False, 'message': 'Project not found'}), 404
        
        project_name = table_doc.to_dict().get('project_name', 'Project')
        
        # Load rows
        docs = db.collection(COLLECTION).document(table_id).collection(SUBCOLLECTION).order_by('created_at').stream()
        rows = [d.to_dict() for d in docs]
        
        pdf_data = generate_pdf_report(project_name, rows)
        
        # Stream response
        return Flask.response_class(
            pdf_data,
            mimetype='application/pdf',
            headers={'Content-Disposition': f'attachment; filename={project_name.replace(" ", "_")}_Daily_Report.pdf'}
        )
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

# ── SMTP Email Attachment Dispatch ───────────────────────────────────────
@app.route('/api/report/email/<table_id>', methods=['POST'])
def email_pdf(table_id):
    """Generate the daily PDF report and email it via SMTP."""
    try:
        table_doc = db.collection(COLLECTION).document(table_id).get()
        if not table_doc.exists:
            return jsonify({'success': False, 'message': 'Project not found'}), 404
            
        project_name = table_doc.to_dict().get('project_name', 'Project')
        
        # Read SMTP settings
        smtp_server = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
        smtp_port = int(os.getenv('SMTP_PORT', '587'))
        smtp_user = os.getenv('SMTP_USER')
        smtp_password = os.getenv('SMTP_PASSWORD')
        sender_email = os.getenv('SENDER_EMAIL', smtp_user)
        
        # Dynamically post recipient or use default SENDER
        req_data = request.get_json() or {}
        recipient_email = req_data.get('email', '').strip() or sender_email
        
        if not smtp_user or not smtp_password:
            return jsonify({
                'success': False,
                'message': 'SMTP user or password environment variables are not configured on the server.'
            }), 400

        if not recipient_email:
            return jsonify({'success': False, 'message': 'Recipient email address is required.'}), 400
            
        # Get rows
        docs = db.collection(COLLECTION).document(table_id).collection(SUBCOLLECTION).order_by('created_at').stream()
        rows = [d.to_dict() for d in docs]
        
        pdf_data = generate_pdf_report(project_name, rows)
        
        # Create Email
        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = recipient_email
        msg['Subject'] = f"Daily Operations Report: {project_name}"
        
        body = f"Hello,\n\nPlease find attached the daily test operations dashboard report for '{project_name}'.\n\nBest regards,\nTest Operations Team"
        msg.attach(MIMEText(body, 'plain'))
        
        # Attach PDF
        filename = f"{project_name.replace(' ', '_')}_Daily_Report.pdf"
        attachment = MIMEApplication(pdf_data, Name=filename)
        attachment['Content-Disposition'] = f'attachment; filename="{filename}"'
        msg.attach(attachment)
        
        # Dispatch SMTP message
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(sender_email, recipient_email, msg.as_string())
            
        return jsonify({'success': True, 'message': f'Report emailed successfully to {recipient_email}!'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

# ── Boot Server ──────────────────────────────────────────────────────────
if __name__ == '__main__':
    # Listen on all interfaces to allow local network sharing (localhost sharing)
    port = int(os.getenv('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=True)
