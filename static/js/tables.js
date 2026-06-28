document.addEventListener('DOMContentLoaded', () => {
  // ── State ──────────────────────────────────────────────
  let currentPage = 1;
  const PER_PAGE  = 9;
  let searchQuery  = '';
  let showArchived = false;

  // ── DOM ────────────────────────────────────────────────
  const cardsGrid         = document.getElementById('cardsGrid');
  const tableSearchInput  = document.getElementById('tableSearchInput');
  const searchBtn         = document.getElementById('searchBtn');
  const tabActive         = document.getElementById('tabActive');
  const tabArchived       = document.getElementById('tabArchived');
  const btnPrev           = document.getElementById('btnPrev');
  const btnNext           = document.getElementById('btnNext');
  const pageNumbers       = document.getElementById('pageNumbers');
  const paginationInfo    = document.getElementById('paginationInfo');

  // Modal
  const tableModal        = document.getElementById('tableModal');
  const openCreateBtn     = document.getElementById('openCreateModalBtn');
  const closeModalBtn     = document.getElementById('closeModalBtn');
  const cancelModalBtn    = document.getElementById('cancelModalBtn');
  const tableForm         = document.getElementById('tableForm');
  const modalTitle        = document.getElementById('modalTitle');
  const tableIdInput      = document.getElementById('tableIdInput');
  const projectNameInput  = document.getElementById('projectName');
  const descriptionInput  = document.getElementById('description');

  // ── Fetch & Render ─────────────────────────────────────
  async function fetchTables() {
    cardsGrid.innerHTML = '<div class="card-loading">Loading projects…</div>';
    try {
      const url = `/api/tables?page=${currentPage}&per_page=${PER_PAGE}`
                + `&search=${encodeURIComponent(searchQuery)}&archived=${showArchived}`;
      const res    = await fetch(url);
      const result = await res.json();

      if (result.success) {
        renderCards(result.data);
        updatePagination(result.page, result.total_pages, result.total);
      } else {
        cardsGrid.innerHTML = `<div class="card-error">Error: ${result.message}</div>`;
      }
    } catch (err) {
      cardsGrid.innerHTML = '<div class="card-error">Failed to load. Is the server running?</div>';
    }
  }

  function renderCards(tables) {
    if (!tables.length) {
      cardsGrid.innerHTML = `
        <div class="cards-empty">
          <p>No ${showArchived ? 'archived' : 'active'} tables found.</p>
        </div>`;
      return;
    }

    cardsGrid.innerHTML = tables.map(t => {
      const date    = t.created_at ? new Date(t.created_at).toLocaleDateString() : '—';
      const rows    = t.row_count ?? 0;
      const rowWord = rows === 1 ? 'row' : 'rows';
      return `
        <div class="project-card" data-id="${t.id}">
          <div class="project-card-body" onclick="window.location='/tables/${t.id}'">
            <div class="project-card-icon">📋</div>
            <h3 class="project-card-name">${escapeHTML(t.project_name)}</h3>
            ${t.description ? `<p class="project-card-desc">${escapeHTML(t.description)}</p>` : ''}
            <div class="project-card-meta">
              <span class="meta-chip">${rows} ${rowWord}</span>
              <span class="meta-date">Created ${date}</span>
            </div>
          </div>
          <div class="project-card-footer">
            <button class="card-action-btn edit-card-btn"    data-id="${t.id}" title="Rename">✏️ Rename</button>
            <button class="card-action-btn archive-card-btn" data-id="${t.id}" title="${showArchived ? 'Restore' : 'Archive'}">
              ${showArchived ? '🔄 Restore' : '📦 Archive'}
            </button>
            <button class="card-action-btn delete-card-btn"  data-id="${t.id}" title="Delete">🗑️</button>
          </div>
        </div>`;
    }).join('');

    // Attach card button listeners
    cardsGrid.querySelectorAll('.edit-card-btn').forEach(btn =>
      btn.addEventListener('click', e => { e.stopPropagation(); openEditModal(btn.dataset.id, tables); }));
    cardsGrid.querySelectorAll('.archive-card-btn').forEach(btn =>
      btn.addEventListener('click', e => { e.stopPropagation(); toggleArchive(btn.dataset.id); }));
    cardsGrid.querySelectorAll('.delete-card-btn').forEach(btn =>
      btn.addEventListener('click', e => { e.stopPropagation(); deleteTable(btn.dataset.id); }));
  }

  // ── Pagination ─────────────────────────────────────────
  function updatePagination(page, totalPages, total) {
    currentPage = page;
    btnPrev.disabled = currentPage <= 1;
    btnNext.disabled = currentPage >= totalPages || totalPages === 0;

    const start = total === 0 ? 0 : (currentPage - 1) * PER_PAGE + 1;
    const end   = Math.min(currentPage * PER_PAGE, total);
    paginationInfo.textContent = `Showing ${start}–${end} of ${total}`;

    pageNumbers.innerHTML = '';
    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement('button');
      btn.className   = `page-num-btn${i === currentPage ? ' active' : ''}`;
      btn.textContent = i;
      btn.addEventListener('click', () => { currentPage = i; fetchTables(); });
      pageNumbers.appendChild(btn);
    }
  }

  // ── Modal ──────────────────────────────────────────────
  function showModal(isEdit = false) {
    tableModal.classList.remove('hidden');
    modalTitle.textContent = isEdit ? '✏️ Rename Table' : '➕ New Project Table';
  }
  function hideModal() {
    tableModal.classList.add('hidden');
    tableForm.reset();
    tableIdInput.value = '';
  }

  function openEditModal(id, tables) {
    const t = tables.find(x => x.id === id);
    if (!t) return;
    tableIdInput.value      = t.id;
    projectNameInput.value  = t.project_name;
    descriptionInput.value  = t.description || '';
    showModal(true);
  }

  // ── Form Submit ────────────────────────────────────────
  tableForm.addEventListener('submit', async e => {
    e.preventDefault();
    const id     = tableIdInput.value;
    const isEdit = !!id;
    const payload = {
      project_name: projectNameInput.value.trim(),
      description:  descriptionInput.value.trim()
    };
    try {
      const res    = await fetch(isEdit ? `/api/tables/${id}` : '/api/tables', {
        method:  isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload)
      });
      const result = await res.json();
      if (result.success) { hideModal(); fetchTables(); }
      else alert(`Error: ${result.message}`);
    } catch { alert('Save failed. Please try again.'); }
  });

  // ── Archive / Delete ───────────────────────────────────
  async function toggleArchive(id) {
    try {
      const res = await fetch(`/api/tables/${id}/archive`, { method: 'POST' });
      if ((await res.json()).success) fetchTables();
    } catch { /* silent */ }
  }

  async function deleteTable(id) {
    if (!confirm('Delete this project table and ALL its rows? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/tables/${id}`, { method: 'DELETE' });
      if ((await res.json()).success) fetchTables();
    } catch { /* silent */ }
  }

  // ── Search ─────────────────────────────────────────────
  searchBtn.addEventListener('click', () => {
    searchQuery  = tableSearchInput.value.trim();
    currentPage  = 1;
    fetchTables();
  });
  tableSearchInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') { searchQuery = tableSearchInput.value.trim(); currentPage = 1; fetchTables(); }
  });

  // ── Tabs ───────────────────────────────────────────────
  tabActive.addEventListener('click', () => {
    tabActive.classList.add('active'); tabArchived.classList.remove('active');
    showArchived = false; currentPage = 1; fetchTables();
  });
  tabArchived.addEventListener('click', () => {
    tabArchived.classList.add('active'); tabActive.classList.remove('active');
    showArchived = true;  currentPage = 1; fetchTables();
  });

  // ── Pagination buttons ─────────────────────────────────
  btnPrev.addEventListener('click', () => { if (currentPage > 1) { currentPage--; fetchTables(); } });
  btnNext.addEventListener('click', () => { currentPage++; fetchTables(); });

  // ── Modal open/close ───────────────────────────────────
  openCreateBtn.addEventListener('click', () => showModal(false));
  closeModalBtn.addEventListener('click', hideModal);
  cancelModalBtn.addEventListener('click', hideModal);
  window.addEventListener('click', e => { if (e.target === tableModal) hideModal(); });

  // ── Helpers ────────────────────────────────────────────
  function escapeHTML(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
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
  const importTableBtn   = document.getElementById('importTableBtn');
  const importTableInput = document.getElementById('importTableInput');

  if (importTableBtn && importTableInput) {
    importTableBtn.addEventListener('click', () => importTableInput.click());
    importTableInput.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;

      cardsGrid.innerHTML = '<div class="card-loading">Parsing Excel file and migrating data...</div>';

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
            fetchTables();
            return;
          }

          const mappedRows = rawRows.map(row => mapExcelRow(row));
          const projectName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;

          const createRes = await fetch('/api/tables', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              project_name: projectName,
              description: `Imported from ${file.name}`
            })
          });
          const createResult = await createRes.json();
          if (!createResult.success) {
            alert(`Failed to create table: ${createResult.message}`);
            fetchTables();
            return;
          }

          const tableId = createResult.data.id;

          const importRes = await fetch(`/api/tables/${tableId}/rows/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows: mappedRows })
          });
          const importResult = await importRes.json();

          if (importResult.success) {
            alert(`Successfully imported table "${projectName}" with ${mappedRows.length} rows.`);
          } else {
            alert(`Table created, but row import failed: ${importResult.message}`);
          }
        } catch (err) {
          alert(`Error parsing file: ${err.message}`);
        } finally {
          importTableInput.value = '';
          fetchTables();
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  // ── Boot ───────────────────────────────────────────────
  fetchTables();
});
