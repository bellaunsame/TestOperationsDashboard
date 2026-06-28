/* table_view.js — Excel-style inline spreadsheet logic */
document.addEventListener('DOMContentLoaded', () => {
  const TABLE_ID   = window.TABLE_ID;
  const excelBody  = document.getElementById('excelBody');
  const addRowBtn  = document.getElementById('addRowBtn');
  const saveStatus = document.getElementById('saveStatus');
  const emptyState = document.getElementById('emptyState');

  // Column field keys in DOM order (matches header columns 2-14)
  const FIELDS = [
    'category', 'test_method', 'test_number',
    'proto_week', 'proto_day',
    'dvt_week',   'dvt_day',
    'evt_week',   'evt_day',
    'pvt_week',   'pvt_day',
    'others'
  ];

  let rows = [];   // local mirror of Firestore rows

  // ── Fetch all rows ─────────────────────────────────────
  async function fetchRows() {
    excelBody.innerHTML = `<tr><td colspan="15" class="loading-cell">Loading…</td></tr>`;
    try {
      const res    = await fetch(`/api/tables/${TABLE_ID}/rows`);
      const result = await res.json();
      if (result.success) {
        rows = result.data;
        renderAll();
      } else {
        excelBody.innerHTML = `<tr><td colspan="15" class="error-cell">${result.message}</td></tr>`;
      }
    } catch (err) {
      excelBody.innerHTML = `<tr><td colspan="15" class="error-cell">Failed to load rows.</td></tr>`;
    }
  }

  // ── Render all rows ────────────────────────────────────
  function renderAll() {
    if (!rows.length) {
      excelBody.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }
    emptyState.classList.add('hidden');
    excelBody.innerHTML = '';
    rows.forEach((row, idx) => appendRow(row, idx + 1));
  }

  // ── Build one <tr> ─────────────────────────────────────
  function appendRow(row, rowNum) {
    const tr = document.createElement('tr');
    tr.className   = 'excel-row';
    tr.dataset.id  = row.id;

    // Row number cell
    const numTd    = document.createElement('td');
    numTd.className = 'cell-rownum';
    numTd.textContent = rowNum;
    tr.appendChild(numTd);

    // Editable data cells
    FIELDS.forEach(field => {
      const td = document.createElement('td');
      td.className         = 'excel-cell';
      td.contentEditable   = 'true';
      td.dataset.field     = field;
      td.dataset.rowId     = row.id;
      td.textContent       = row[field] || '';
      td.spellcheck        = false;

      // Save on blur
      td.addEventListener('blur',    () => saveCell(td, row.id, field));
      // Save on Enter (prevent newline)
      td.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); td.blur(); }
      });
      // Visual: mark dirty
      td.addEventListener('input', () => td.classList.add('cell-dirty'));

      tr.appendChild(td);
    });

    // Delete button cell
    const delTd  = document.createElement('td');
    delTd.className = 'cell-delete';
    const delBtn = document.createElement('button');
    delBtn.className   = 'row-delete-btn';
    delBtn.title       = 'Delete row';
    delBtn.textContent = '🗑️';
    delBtn.addEventListener('click', () => deleteRow(row.id, tr));
    delTd.appendChild(delBtn);
    tr.appendChild(delTd);

    excelBody.appendChild(tr);
  }

  // ── Auto-save a single cell ────────────────────────────
  async function saveCell(td, rowId, field) {
    if (!td.classList.contains('cell-dirty')) return;  // nothing changed
    td.classList.remove('cell-dirty');

    const value = td.textContent.trim();
    try {
      const res    = await fetch(`/api/tables/${TABLE_ID}/rows/${rowId}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ [field]: value })
      });
      const result = await res.json();
      if (result.success) {
        flashCell(td, 'success');
        showStatus('Saved ✓', 'success');
      } else {
        flashCell(td, 'error');
        showStatus('Save failed: ' + result.message, 'error');
      }
    } catch {
      flashCell(td, 'error');
      showStatus('Network error — save failed', 'error');
    }
  }

  // ── Add a new empty row ────────────────────────────────
  addRowBtn.addEventListener('click', async () => {
    try {
      const res    = await fetch(`/api/tables/${TABLE_ID}/rows`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({})
      });
      const result = await res.json();
      if (result.success) {
        rows.push(result.data);
        emptyState.classList.add('hidden');
        appendRow(result.data, rows.length);
        // Scroll to bottom and focus first cell of new row
        const newRow   = excelBody.lastElementChild;
        const firstCell = newRow.querySelector('.excel-cell');
        if (firstCell) { firstCell.focus(); }
        newRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } catch {
      showStatus('Failed to add row', 'error');
    }
  });

  // ── Delete a row ───────────────────────────────────────
  async function deleteRow(rowId, tr) {
    if (!confirm('Delete this row?')) return;
    try {
      const res    = await fetch(`/api/tables/${TABLE_ID}/rows/${rowId}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        rows = rows.filter(r => r.id !== rowId);
        tr.classList.add('row-fade-out');
        setTimeout(() => {
          tr.remove();
          reNumberRows();
          if (!rows.length) emptyState.classList.remove('hidden');
        }, 300);
      }
    } catch {
      showStatus('Delete failed', 'error');
    }
  }

  // ── Re-number row cells after a delete ─────────────────
  function reNumberRows() {
    excelBody.querySelectorAll('.cell-rownum').forEach((td, idx) => {
      td.textContent = idx + 1;
    });
  }

  // ── Visual helpers ─────────────────────────────────────
  function flashCell(td, type) {
    td.classList.add(type === 'success' ? 'cell-flash-ok' : 'cell-flash-err');
    setTimeout(() => {
      td.classList.remove('cell-flash-ok', 'cell-flash-err');
    }, 800);
  }

  let statusTimer;
  function showStatus(msg, type) {
    saveStatus.textContent = msg;
    saveStatus.className   = `save-status save-status-${type}`;
    saveStatus.classList.remove('hidden');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => saveStatus.classList.add('hidden'), 2500);
  }

  // Smart mapper to map Excel row object to database fields
  function mapExcelRow(row) {
    const mapped = {};
    const keys = Object.keys(row);

    function findVal(possibleHeaders) {
      const match = keys.find(k => {
        const normalized = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        return possibleHeaders.includes(normalized);
      });
      return match ? row[match] : '';
    }

    mapped.category = findVal(['category', 'cat']);
    mapped.test_method = findVal(['testmethod', 'method', 'test_method']);
    mapped.test_number = findVal(['testnumber', 'testno', 'number', 'test_number', 'tc']);
    
    mapped.proto_week = findVal(['protoweek', 'protodateweek', 'proto_week']);
    mapped.proto_day = findVal(['protoday', 'protodateday', 'proto_day']);
    
    mapped.dvt_week = findVal(['dvtweek', 'dvtdateweek', 'dvt_week']);
    mapped.dvt_day = findVal(['dvtday', 'dvtdateday', 'dvt_day']);
    
    mapped.evt_week = findVal(['evtweek', 'evtdateweek', 'evt_week']);
    mapped.evt_day = findVal(['evtday', 'evtdateday', 'evt_day']);
    
    mapped.pvt_week = findVal(['pvtweek', 'pvtdateweek', 'pvt_week']);
    mapped.pvt_day = findVal(['pvtday', 'pvtdateday', 'pvt_day']);
    
    mapped.others = findVal(['others', 'other', 'notes', 'remarks', 'remark']);

    return mapped;
  }

  // ── Excel Import ───────────────────────────────────────
  const importRowsBtn   = document.getElementById('importRowsBtn');
  const importRowsInput = document.getElementById('importRowsInput');

  if (importRowsBtn && importRowsInput) {
    importRowsBtn.addEventListener('click', () => importRowsInput.click());
    importRowsInput.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;

      showStatus('Parsing Excel file...', 'success');

      const reader = new FileReader();
      reader.onload = async evt => {
        try {
          const data = new Uint8Array(evt.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          const rawRows = XLSX.utils.sheet_to_json(worksheet);
          if (!rawRows.length) {
            alert('No data found in the Excel file.');
            return;
          }

          const mappedRows = rawRows.map(row => mapExcelRow(row));
          showStatus(`Importing ${mappedRows.length} rows...`, 'success');

          const importRes = await fetch(`/api/tables/${TABLE_ID}/rows/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows: mappedRows })
          });
          const importResult = await importRes.json();

          if (importResult.success) {
            showStatus(`Successfully imported ${mappedRows.length} rows!`, 'success');
            // Append new rows to local array and DOM
            const startIdx = rows.length;
            importResult.data.forEach((newRow, idx) => {
              rows.push(newRow);
              appendRow(newRow, startIdx + idx + 1);
            });
            emptyState.classList.add('hidden');
          } else {
            alert(`Import failed: ${importResult.message}`);
          }
        } catch (err) {
          alert(`Error parsing file: ${err.message}`);
        } finally {
          importRowsInput.value = '';
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  // ── Boot ───────────────────────────────────────────────
  fetchRows();
});
