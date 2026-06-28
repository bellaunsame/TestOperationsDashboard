/**
 * script.js — Combined Frontend Controller
 * Handles global selector, tables spreadsheet, charts, gantt, chatbot, and reports.
 */
document.addEventListener('DOMContentLoaded', () => {
    // ── Elements & State ──────────────────────────────────────────────────
    const globalSelect = document.getElementById('globalProjectSelect');
    let projects = [];
    let selectedProjectId = localStorage.getItem('selectedProjectId') || '';
    
    // Page paths
    const isSpreadsheetPage = document.getElementById('spreadsheetContainer') !== null;
    const isDashboardPage = document.getElementById('dashboardDataContainer') !== null;

    // Table Fields
    const FIELDS = [
        'category', 'test_method', 'test_number',
        'proto_week', 'proto_day', 'proto_qty',
        'dvt_week',   'dvt_day',   'dvt_qty',
        'evt_week',   'evt_day',   'evt_qty',
        'pvt_week',   'pvt_day',   'pvt_qty',
        'others'
    ];
    let rows = [];

    // Chart.js instances
    let statusChartInstance = null;
    let categoryChartInstance = null;
    
    // Gantt instance
    let ganttInstance = null;
    let currentGanttMode = 'Day';

    // ── Global Boot ───────────────────────────────────────────────────────
    async function boot() {
        await fetchProjects();
        setupChatbot();
        
        if (isSpreadsheetPage) {
            setupSpreadsheetPage();
        } else if (isDashboardPage) {
            setupDashboardPage();
        }
    }

    // ── Fetch Projects & Global Selection ──────────────────────────────────
    async function fetchProjects() {
        try {
            const res = await fetch('/api/tables');
            const result = await res.json();
            if (result.success) {
                projects = result.data || [];
                populateGlobalSelector();
            }
        } catch (err) {
            console.error('Failed to fetch projects list', err);
        }
    }

    function populateGlobalSelector() {
        if (!globalSelect) return;
        globalSelect.innerHTML = '';
        
        if (projects.length === 0) {
            globalSelect.innerHTML = '<option value="">No active projects</option>';
            return;
        }

        // Validate selected project ID, default to first if invalid/missing
        const valid = projects.some(p => p.id === selectedProjectId);
        if (!valid) {
            selectedProjectId = projects[0].id;
            localStorage.setItem('selectedProjectId', selectedProjectId);
        }

        projects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.project_name;
            if (p.id === selectedProjectId) opt.selected = true;
            globalSelect.appendChild(opt);
        });

        // Add change listener
        globalSelect.removeEventListener('change', handleProjectChange);
        globalSelect.addEventListener('change', handleProjectChange);

        // Update navigation chevrons on spreadsheet page
        if (isSpreadsheetPage) {
            updateNavChevrons();
        }
    }

    function handleProjectChange(e) {
        selectedProjectId = e.target.value;
        localStorage.setItem('selectedProjectId', selectedProjectId);
        
        if (isSpreadsheetPage) {
            loadSpreadsheetData();
            updateNavChevrons();
        } else if (isDashboardPage) {
            loadDashboardData();
        }
    }

    // ── Spreadsheet/Table Module (home.html) ──────────────────────────────
    function setupSpreadsheetPage() {
        const newProjectBtn = document.getElementById('newProjectBtn');
        const projectModal = document.getElementById('projectModal');
        const cancelProjectBtn = document.getElementById('cancelProjectBtn');
        const saveProjectBtn = document.getElementById('saveProjectBtn');
        const addRowBtn = document.getElementById('addRowBtn');
        const importRowsBtn = document.getElementById('importRowsBtn');
        const importInput = document.getElementById('importRowsInput');

        // New Project Dialog
        newProjectBtn.addEventListener('click', () => projectModal.classList.remove('hidden'));
        cancelProjectBtn.addEventListener('click', () => projectModal.classList.add('hidden'));
        saveProjectBtn.addEventListener('click', createNewProject);

        // Row operations
        addRowBtn.addEventListener('click', addNewRow);
        
        // Excel file import
        if (importRowsBtn && importInput) {
            importRowsBtn.addEventListener('click', () => importInput.click());
            importInput.addEventListener('change', handleExcelImport);
        }

        // Load project data
        loadSpreadsheetData();
    }

    async function createNewProject() {
        const nameInput = document.getElementById('newProjectName');
        const descInput = document.getElementById('newProjectDesc');
        const name = nameInput.value.trim();
        const desc = descInput.value.trim();

        if (!name) {
            alert('Project Name is required.');
            return;
        }

        try {
            const res = await fetch('/api/tables', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project_name: name, description: desc })
            });
            const result = await res.json();
            if (result.success) {
                // Select new project
                selectedProjectId = result.data.id;
                localStorage.setItem('selectedProjectId', selectedProjectId);
                nameInput.value = '';
                descInput.value = '';
                document.getElementById('projectModal').classList.add('hidden');
                
                // Reboot selector
                await fetchProjects();
                loadSpreadsheetData();
            } else {
                alert('Failed to create project: ' + result.message);
            }
        } catch {
            alert('Error creating project');
        }
    }

    async function loadSpreadsheetData() {
        const container = document.getElementById('spreadsheetContainer');
        const noProjState = document.getElementById('noProjectState');
        const emptyRowsState = document.getElementById('emptyRowsState');
        const addRowBtn = document.getElementById('addRowBtn');
        const importRowsBtn = document.getElementById('importRowsBtn');
        const excelBody = document.getElementById('excelBody');

        if (!selectedProjectId) {
            container.classList.add('hidden');
            noProjState.classList.remove('hidden');
            emptyRowsState.classList.add('hidden');
            addRowBtn.style.display = 'none';
            importRowsBtn.style.display = 'none';
            return;
        }

        noProjState.classList.add('hidden');
        
        // Show title in dashboard header
        const currentProj = projects.find(p => p.id === selectedProjectId);
        if (currentProj) {
            document.getElementById('currentProjectTitle').textContent = currentProj.project_name;
            document.getElementById('currentProjectDesc').textContent = currentProj.description || 'Project table spreadsheet editor';
        }

        // Fetch rows
        excelBody.innerHTML = '<tr><td colspan="19" class="loading-cell">Loading spreadsheet rows…</td></tr>';
        container.classList.remove('hidden');

        try {
            const res = await fetch(`/api/tables/${selectedProjectId}/rows`);
            const result = await res.json();
            if (result.success) {
                rows = result.data || [];
                renderSpreadsheetGrid();
                
                // Show actions
                addRowBtn.style.display = 'inline-flex';
                importRowsBtn.style.display = 'inline-flex';
            } else {
                excelBody.innerHTML = `<tr><td colspan="19" class="error-cell">${result.message}</td></tr>`;
            }
        } catch {
            excelBody.innerHTML = '<tr><td colspan="19" class="error-cell">Failed to connect to server.</td></tr>';
        }
    }

    function renderSpreadsheetGrid() {
        const excelBody = document.getElementById('excelBody');
        const container = document.getElementById('spreadsheetContainer');
        const emptyRowsState = document.getElementById('emptyRowsState');

        excelBody.innerHTML = '';
        
        if (rows.length === 0) {
            container.classList.add('hidden');
            emptyRowsState.classList.remove('hidden');
            return;
        }

        emptyRowsState.classList.add('hidden');
        container.classList.remove('hidden');

        rows.forEach((row, idx) => {
            const tr = document.createElement('tr');
            tr.className = 'excel-row';
            tr.dataset.id = row.id;

            // Row count
            const rNum = document.createElement('td');
            rNum.className = 'cell-rownum';
            rNum.textContent = idx + 1;
            tr.appendChild(rNum);

            // Data Cells
            FIELDS.forEach(field => {
                const td = document.createElement('td');
                td.className = 'excel-cell';
                td.contentEditable = 'true';
                td.dataset.field = field;
                td.dataset.rowId = row.id;
                td.textContent = row[field] || '';
                td.spellcheck = false;

                // Event handlers for auto save
                td.addEventListener('blur', () => saveCell(td, row.id, field));
                td.addEventListener('keydown', e => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        td.blur();
                    }
                });
                td.addEventListener('input', () => td.classList.add('cell-dirty'));

                tr.appendChild(td);
            });

            // Action delete button
            const actTd = document.createElement('td');
            actTd.className = 'cell-delete';
            const delBtn = document.createElement('button');
            delBtn.className = 'row-delete-btn';
            delBtn.title = 'Delete row';
            delBtn.textContent = '🗑️';
            delBtn.addEventListener('click', () => deleteRow(row.id, tr));
            actTd.appendChild(delBtn);
            tr.appendChild(actTd);

            excelBody.appendChild(tr);
        });
    }

    async function saveCell(td, rowId, field) {
        if (!td.classList.contains('cell-dirty')) return;
        td.classList.remove('cell-dirty');

        const value = td.textContent.trim();
        try {
            const res = await fetch(`/api/tables/${selectedProjectId}/rows/${rowId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: value })
            });
            const result = await res.json();
            if (result.success) {
                flashCell(td, 'success');
                showStatus('Saved cells ✓', 'success');
            } else {
                flashCell(td, 'error');
                showStatus('Saving failed: ' + result.message, 'error');
            }
        } catch {
            flashCell(td, 'error');
            showStatus('Network error — save failed', 'error');
        }
    }

    async function addNewRow() {
        try {
            const res = await fetch(`/api/tables/${selectedProjectId}/rows`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const result = await res.json();
            if (result.success) {
                rows.push(result.data);
                
                // Show table grid if empty state was active
                document.getElementById('emptyRowsState').classList.add('hidden');
                document.getElementById('spreadsheetContainer').classList.remove('hidden');
                
                // Re-render
                renderSpreadsheetGrid();
                
                // Focus first cell of new row
                const excelBody = document.getElementById('excelBody');
                const lastRow = excelBody.lastElementChild;
                if (lastRow) {
                    const firstCell = lastRow.querySelector('.excel-cell');
                    if (firstCell) firstCell.focus();
                    lastRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        } catch {
            showStatus('Failed to add row', 'error');
        }
    }

    async function deleteRow(rowId, tr) {
        if (!confirm('Delete this test operations row?')) return;
        try {
            const res = await fetch(`/api/tables/${selectedProjectId}/rows/${rowId}`, {
                method: 'DELETE'
            });
            const result = await res.json();
            if (result.success) {
                rows = rows.filter(r => r.id !== rowId);
                tr.classList.add('row-fade-out');
                setTimeout(() => {
                    tr.remove();
                    reNumberRows();
                    if (rows.length === 0) {
                        document.getElementById('spreadsheetContainer').classList.add('hidden');
                        document.getElementById('emptyRowsState').classList.remove('hidden');
                    }
                }, 250);
            }
        } catch {
            showStatus('Delete row failed', 'error');
        }
    }

    function reNumberRows() {
        document.querySelectorAll('.cell-rownum').forEach((td, idx) => {
            td.textContent = idx + 1;
        });
    }

    function handleExcelImport(e) {
        const file = e.target.files[0];
        if (!file) return;

        showStatus('Parsing Excel spreadsheet...', 'success');
        const reader = new FileReader();
        reader.onload = async evt => {
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const rawRows = XLSX.utils.sheet_to_json(worksheet);

                if (!rawRows.length) {
                    alert('No rows found in uploaded sheet.');
                    return;
                }

                const mapped = rawRows.map(mapExcelHeaders);
                showStatus(`Migrating ${mapped.length} rows to database...`, 'success');

                const importRes = await fetch(`/api/tables/${selectedProjectId}/rows/bulk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rows: mapped })
                });
                const importResult = await importRes.json();
                
                if (importResult.success) {
                    showStatus(`Successfully imported ${mapped.length} test cases!`, 'success');
                    loadSpreadsheetData();
                } else {
                    alert('Bulk import failed: ' + importResult.message);
                }
            } catch (err) {
                alert('Excel parsing error: ' + err.message);
            } finally {
                e.target.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function mapExcelHeaders(row) {
        const keys = Object.keys(row);
        function findVal(headers) {
            const match = keys.find(k => {
                const normalized = k.toLowerCase().replace(/[^a-z0-9]/g, '');
                return headers.includes(normalized);
            });
            return match ? String(row[match]).trim() : '';
        }
        
        return {
            category: findVal(['category', 'cat']),
            test_method: findVal(['testmethod', 'method', 'test_method']),
            test_number: findVal(['testnumber', 'testno', 'number', 'test_number', 'tc']),
            proto_week: findVal(['protoweek', 'protodateweek', 'proto_week']),
            proto_day: findVal(['protoday', 'protodateday', 'proto_day']),
            proto_qty: findVal(['protoqty', 'proto_qty', 'protoquantity', 'proto_quantity']),
            dvt_week: findVal(['dvtweek', 'dvtdateweek', 'dvt_week']),
            dvt_day: findVal(['dvtday', 'dvtdateday', 'dvt_day']),
            dvt_qty: findVal(['dvtqty', 'dvt_qty', 'dvtquantity', 'dvt_quantity']),
            evt_week: findVal(['evtweek', 'evtdateweek', 'evt_week']),
            evt_day: findVal(['evtday', 'evtdateday', 'evt_day']),
            evt_qty: findVal(['evtqty', 'evt_qty', 'evtquantity', 'evt_quantity']),
            pvt_week: findVal(['pvtweek', 'pvtdateweek', 'pvt_week']),
            pvt_day: findVal(['pvtday', 'pvtdateday', 'pvt_day']),
            pvt_qty: findVal(['pvtqty', 'pvt_qty', 'pvtquantity', 'pvt_quantity']),
            others: findVal(['others', 'other', 'notes', 'remarks', 'remark'])
        };
    }

    function updateNavChevrons() {
        const leftArrow = document.getElementById('navArrowLeft');
        const rightArrow = document.getElementById('navArrowRight');
        if (!leftArrow || !rightArrow || projects.length <= 1) {
            leftArrow?.classList.add('hidden');
            rightArrow?.classList.add('hidden');
            return;
        }

        const idx = projects.findIndex(p => p.id === selectedProjectId);
        if (idx === -1) {
            leftArrow.classList.add('hidden');
            rightArrow.classList.add('hidden');
            return;
        }

        // Left Arrow
        const prevIdx = idx > 0 ? idx - 1 : projects.length - 1;
        leftArrow.dataset.targetId = projects[prevIdx].id;
        leftArrow.classList.remove('hidden');

        // Right Arrow
        const nextIdx = idx < projects.length - 1 ? idx + 1 : 0;
        rightArrow.dataset.targetId = projects[nextIdx].id;
        rightArrow.classList.remove('hidden');

        // Bind clicks once
        [leftArrow, rightArrow].forEach(arr => {
            arr.removeEventListener('click', handleChevronClick);
            arr.addEventListener('click', handleChevronClick);
        });
    }

    function handleChevronClick(e) {
        e.preventDefault();
        const targetId = e.currentTarget.dataset.targetId;
        selectedProjectId = targetId;
        localStorage.setItem('selectedProjectId', selectedProjectId);
        
        // Select it in dropdown
        if (globalSelect) globalSelect.value = targetId;
        
        loadSpreadsheetData();
        updateNavChevrons();
    }

    // ── Dashboard Metrics & Timeline Module (dashboard.html) ─────────────
    function setupDashboardPage() {
        const pdfBtn = document.getElementById('pdfReportBtn');
        const emailBtn = document.getElementById('emailReportBtn');
        const emailModal = document.getElementById('emailModal');
        const cancelEmailBtn = document.getElementById('cancelEmailBtn');
        const sendEmailBtn = document.getElementById('sendEmailBtn');

        // Export events
        pdfBtn.addEventListener('click', triggerPDFDownload);
        emailBtn.addEventListener('click', () => emailModal.classList.remove('hidden'));
        cancelEmailBtn.addEventListener('click', () => emailModal.classList.add('hidden'));
        sendEmailBtn.addEventListener('click', triggerEmailSend);

        // Timeline mode toggles
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                currentGanttMode = e.target.dataset.mode;
                loadGanttTimeline();
            });
        });

        loadDashboardData();
    }

    async function loadDashboardData() {
        const noProjState = document.getElementById('dashboardNoProjectState');
        const dataContainer = document.getElementById('dashboardDataContainer');
        const pdfBtn = document.getElementById('pdfReportBtn');
        const emailBtn = document.getElementById('emailReportBtn');

        if (!selectedProjectId) {
            noProjState.classList.remove('hidden');
            dataContainer.classList.add('hidden');
            pdfBtn.style.display = 'none';
            emailBtn.style.display = 'none';
            return;
        }

        noProjState.classList.add('hidden');
        dataContainer.classList.remove('hidden');
        pdfBtn.style.display = 'inline-flex';
        emailBtn.style.display = 'inline-flex';

        const currentProj = projects.find(p => p.id === selectedProjectId);
        if (currentProj) {
            document.getElementById('currentDashboardTitle').textContent = `${currentProj.project_name} Overview`;
        }

        // Fetch Gantt data and calculate metrics from it
        await loadGanttTimeline();
    }

    async function loadGanttTimeline() {
        const ganttContainer = document.getElementById('gantt');
        ganttContainer.innerHTML = '<div style="padding:2rem; text-align:center; color:#64748b;">Loading timeline chart…</div>';

        try {
            const res = await fetch(`/api/gantt/data/${selectedProjectId}`);
            const result = await res.json();
            
            if (result.success && result.data.length > 0) {
                const data = result.data;
                
                // 1. Calculate KPI Metrics from row data
                updateKPIMetrics(data);

                // 2. Refresh Chart.js visuals
                renderCharts(data);

                // 3. Render Gantt
                ganttContainer.innerHTML = '';
                const tasks = data.map(d => ({
                    id: d.id,
                    name: d.name,
                    start: d.start,
                    end: d.end,
                    progress: d.progress,
                    custom_class: getPhaseClass(d.phase),
                    dependencies: '' // Suppress arrows
                }));

                ganttInstance = new Gantt('#gantt', tasks, {
                    view_mode: currentGanttMode,
                    bar_height: 30,
                    padding: 18,
                    readonly: true,
                    custom_popup_html: function(task) {
                        const tc = data.find(item => item.id === task.id);
                        if (!tc) return '';
                        return `
                            <div class="gantt-tooltip">
                                <h4>${tc.name}</h4>
                                <p><strong>Category:</strong> ${tc.category}</p>
                                <p><strong>Method:</strong> ${tc.test_method}</p>
                                <p><strong>Number:</strong> ${tc.test_number}</p>
                                <p><strong>Progress:</strong> ${tc.progress}%</p>
                                <p><strong>Days Remaining:</strong> ${tc.days_remaining}</p>
                                ${tc.others ? `<p><strong>Notes:</strong> ${tc.others}</p>` : ''}
                            </div>
                        `;
                    }
                });
            } else {
                ganttContainer.innerHTML = `
                    <div class="excel-empty" style="padding: 4rem 2rem; border:none; box-shadow:none;">
                        <div style="font-size: 3rem; margin-bottom: 1rem;">📅</div>
                        <p>No timeline data available. Ensure rows and milestone dates are populated in the Spreadsheet tab.</p>
                    </div>
                `;
                // Empty KPI
                updateKPIMetrics([]);
                renderCharts([]);
            }
        } catch (err) {
            ganttContainer.innerHTML = '<div style="padding:2rem; color:#ef4444; text-align:center;">Failed to render Gantt timeline.</div>';
        }
    }

    function getPhaseClass(phase) {
        const map = {
            'Proto': 'bar-proto',
            'DVT': 'bar-dvt',
            'EVT': 'bar-evt',
            'PVT': 'bar-pvt',
            'Planning': 'bar-planning'
        };
        return map[phase] || 'bar-proto';
    }

    function updateKPIMetrics(tasks) {
        const kpiTotal = document.getElementById('kpiTotal');
        const kpiOnTrack = document.getElementById('kpiOnTrack');
        const kpiUpcoming = document.getElementById('kpiUpcoming');
        const kpiDelayed = document.getElementById('kpiDelayed');
        const kpiCompleted = document.getElementById('kpiCompleted');

        if (tasks.length === 0) {
            [kpiTotal, kpiOnTrack, kpiUpcoming, kpiDelayed, kpiCompleted].forEach(el => el.textContent = '0');
            return;
        }

        // Count unique test cases (since each row generates 4 tasks, group tasks by prefix of ID)
        const uniqueRowIds = new Set(tasks.map(t => t.id.split('_')[0]));
        kpiTotal.textContent = uniqueRowIds.size;

        // Group status counts
        let completed = 0;
        let onTrack = 0;
        let delayed = 0;
        let upcoming = 0;

        tasks.forEach(t => {
            if (t.health === 'completed') completed++;
            else if (t.health === 'on-track') onTrack++;
            else if (t.health === 'upcoming') upcoming++;
            else if (t.health === 'delayed') delayed++;
        });

        // Map counts
        kpiOnTrack.textContent = onTrack;
        kpiUpcoming.textContent = upcoming;
        kpiDelayed.textContent = delayed;
        kpiCompleted.textContent = completed;
    }

    function renderCharts(tasks) {
        const statusCtx = document.getElementById('statusChart').getContext('2d');
        const catCtx = document.getElementById('categoryChart').getContext('2d');

        // Destroy previous instances to avoid memory leaks
        if (statusChartInstance) statusChartInstance.destroy();
        if (categoryChartInstance) categoryChartInstance.destroy();

        if (tasks.length === 0) return;

        // 1. Status Distribution Doughnut Chart
        let completed = 0;
        let onTrack = 0;
        let upcoming = 0;
        let delayed = 0;

        tasks.forEach(t => {
            if (t.health === 'completed') completed++;
            else if (t.health === 'on-track') onTrack++;
            else if (t.health === 'upcoming') upcoming++;
            else if (t.health === 'delayed') delayed++;
        });

        statusChartInstance = new Chart(statusCtx, {
            type: 'doughnut',
            data: {
                labels: ['Completed', 'On Track', 'Upcoming', 'Delayed'],
                datasets: [{
                    data: [completed, onTrack, upcoming, delayed],
                    backgroundColor: ['#22c55e', '#3b82f6', '#94a3b8', '#ef4444'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, font: { weight: 600 } } }
                }
            }
        });

        // 2. Bar chart: count of test cases by category
        const catMap = {};
        tasks.forEach(t => {
            const cat = t.category || 'General';
            catMap[cat] = (catMap[cat] || 0) + 1;
        });

        const labels = Object.keys(catMap);
        const dataVals = Object.values(catMap);

        categoryChartInstance = new Chart(catCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Active Milestones',
                    data: dataVals,
                    backgroundColor: '#1e3a8a',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 } }
                }
            }
        });
    }

    function triggerPDFDownload() {
        if (!selectedProjectId) return;
        window.location.href = `/api/report/pdf/${selectedProjectId}`;
    }

    async function triggerEmailSend() {
        const emailInput = document.getElementById('recipientEmail');
        const recipient = emailInput.value.trim();

        if (!recipient) {
            alert('Please specify recipient email.');
            return;
        }

        showStatus('Sending report email via SMTP...', 'success');
        document.getElementById('emailModal').classList.add('hidden');

        try {
            const res = await fetch(`/api/report/email/${selectedProjectId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: recipient })
            });
            const result = await res.json();
            if (result.success) {
                showStatus(result.message, 'success');
                emailInput.value = '';
            } else {
                alert('Email transmission failed: ' + result.message);
                showStatus('Failed to send email', 'error');
            }
        } catch {
            showStatus('SMTP server connection error', 'error');
        }
    }

    // ── AI Chatbot Widget Module ──────────────────────────────────────────
    function setupChatbot() {
        const chatbotToggle = document.getElementById('chatbot-toggle');
        const chatbotClose = document.getElementById('chatbot-close');
        const chatbotWindow = document.getElementById('chatbot-window');
        const chatbotInput = document.getElementById('chatbot-input');
        const chatbotSend = document.getElementById('chatbot-send');
        const chatbotMessages = document.getElementById('chatbot-messages');

        let chatHistory = [];

        chatbotToggle.addEventListener('click', () => {
            chatbotWindow.classList.toggle('hidden');
            if (!chatbotWindow.classList.contains('hidden')) {
                chatbotInput.focus();
            }
        });

        chatbotClose.addEventListener('click', () => chatbotWindow.classList.add('hidden'));

        chatbotSend.addEventListener('click', sendMessage);
        chatbotInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
        });

        async function sendMessage() {
            const message = chatbotInput.value.trim();
            if (!message) return;

            // Render user message
            appendMessage(message, 'user');
            chatbotInput.value = '';
            
            // Show loading placeholder
            const typingIndicator = appendMessage('Thinking...', 'bot typing');
            chatbotMessages.scrollTop = chatbotMessages.scrollHeight;

            try {
                const res = await fetch('/api/chatbot', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: message,
                        history: chatHistory,
                        table_id: selectedProjectId
                    })
                });
                const result = await res.json();
                
                // Remove indicator
                typingIndicator.remove();

                if (result.success) {
                    appendMessage(result.response, 'bot');
                    chatHistory.push({ role: 'user', content: message });
                    chatHistory.push({ role: 'model', content: result.response });
                } else {
                    appendMessage('Sorry, I encountered an issue: ' + result.response, 'bot');
                }
            } catch {
                typingIndicator.remove();
                appendMessage('Failed to communicate with AI Assistant.', 'bot');
            }
            chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
        }

        function appendMessage(text, sender) {
            const div = document.createElement('div');
            div.className = `chat-message ${sender === 'user' ? 'user-message' : 'bot-message'}`;
            
            // Format newlines as breaks
            div.innerHTML = text.replace(/\n/g, '<br/>');
            chatbotMessages.appendChild(div);
            return div;
        }
    }

    // ── Visual Status Helpers ──────────────────────────────────────────────
    function flashCell(td, type) {
        td.classList.add(type === 'success' ? 'cell-flash-ok' : 'cell-flash-err');
        setTimeout(() => {
            td.classList.remove('cell-flash-ok', 'cell-flash-err');
        }, 700);
    }

    let statusTimer;
    function showStatus(msg, type) {
        const saveStatus = document.getElementById('saveStatus');
        if (!saveStatus) return;
        saveStatus.textContent = msg;
        saveStatus.className = `save-status save-status-${type}`;
        saveStatus.classList.remove('hidden');
        
        clearTimeout(statusTimer);
        statusTimer = setTimeout(() => saveStatus.classList.add('hidden'), 2500);
    }

    // Initialize boot sequence
    boot();
});
