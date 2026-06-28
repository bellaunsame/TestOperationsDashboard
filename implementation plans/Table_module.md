# Implementation Plan — Tables Module Redesign (Excel-style)

## Overview

We are completely redesigning the Tables module into a **two-level experience**:

1. **Tables List Page** (`/tables`) — A card-grid or list showing all project tables. Each card represents one *Project* (named by `project_name`). User can create, rename, archive, or delete project tables here.

2. **Table View Page** (`/tables/<id>`) — Clicking a project table opens an Excel-style spreadsheet view, where the **Project Name** is the title and the spreadsheet has grouped/merged column headers across two header rows, matching this exact structure:

```
┌────────────┬─────────────┬─────────────┬────────────────┬──────────────────┬──────────────────┬──────────────────┬────────┐
│  Category  │ Test Method │ Test Number │     Proto      │       DVT        │       EVT        │       PVT        │ Others │
│            │             │             ├────────┬───────┼────────┬─────────┼────────┬─────────┼────────┬─────────┤        │
│            │             │             │ Week   │  Day  │  Week  │   Day   │  Week  │   Day   │  Week  │   Day   │        │
├────────────┼─────────────┼─────────────┼────────┼───────┼────────┼─────────┼────────┼─────────┼────────┼─────────┼────────┤
│            │             │             │        │       │        │         │        │         │        │         │        │
```

Users can **add rows** of data to the spreadsheet, **edit cells inline** (click to edit), and **delete rows**.

---

## User Review Required

> [!IMPORTANT]
> The redesign completely replaces the existing flat per-record model. A table (project) now stores **only metadata** (name, description, archived status). Row data is stored in a **subcollection** under each table document in Firestore: `tables/{table_id}/rows/{row_id}`.

> [!NOTE]
> The **Tables List Page** (`/tables`) is being simplified — the old fields (Category Name, Column Name, Date Day/Week per table) are removed from the table-level schema. The "create table" modal now only asks for `Project Name` + optional `Description`. All data entry happens inside the Table View page.

---

## New Firestore Data Schema

### `tables` collection (unchanged collection name)
```json
{
  "project_name": "My Test Project",
  "description": "Optional notes",
  "is_archived": false,
  "created_at": "...",
  "updated_at": "..."
}
```

### `tables/{id}/rows` subcollection (NEW)
Each row stores one data entry for the spreadsheet:
```json
{
  "category": "Performance",
  "test_method": "Load Test",
  "test_number": "TC-001",
  "proto_week": "Week 24",
  "proto_day": "2026-06-10",
  "dvt_week": "Week 25",
  "dvt_day": "2026-06-17",
  "evt_week": "Week 26",
  "evt_day": "2026-06-24",
  "pvt_week": "Week 27",
  "pvt_day": "2026-07-01",
  "others": "Pending review",
  "row_order": 1,
  "created_at": "...",
  "updated_at": "..."
}
```

---

## Proposed Changes

### Database Layer

#### [MODIFY] [table.py](file:///c:/Users/SONIA/test-ops-dashboard/models/table.py)
Simplify the `Table` model to only hold project-level metadata (`project_name`, `description`, `is_archived`). Remove flat column/date fields.

#### [NEW] [table_row.py](file:///c:/Users/SONIA/test-ops-dashboard/models/table_row.py)
New model representing a single spreadsheet row within a table. Uses Firestore subcollection `tables/{table_id}/rows`. Methods:
- `create(table_id, data)`
- `get_all(table_id)` — returns all rows sorted by `row_order`
- `get_by_id(table_id, row_id)`
- `update(table_id, row_id, data)`
- `delete(table_id, row_id)`
- `delete_all(table_id)` — used when deleting parent table

---

### Routing Layer

#### [MODIFY] [routes/tables.py](file:///c:/Users/SONIA/test-ops-dashboard/routes/tables.py)
**Update existing routes:**
- `GET /tables` → renders the simplified list page
- `POST /api/tables` → only accepts `project_name` + `description`
- `PUT /api/tables/<id>` → only updates `project_name` + `description`
- `DELETE /api/tables/<id>` → also deletes all rows in the subcollection

**Add new routes for row management:**
- `GET /tables/<id>` → render the Excel-style Table View page
- `GET /api/tables/<id>/rows` → return all rows for the table (sorted by row_order)
- `POST /api/tables/<id>/rows` → add a new row
- `PUT /api/tables/<id>/rows/<row_id>` → update a row
- `DELETE /api/tables/<id>/rows/<row_id>` → delete a row

---

### Frontend

#### [MODIFY] [templates/tables.html](file:///c:/Users/SONIA/test-ops-dashboard/templates/tables.html)
Redesign the list page:
- Show tables as **cards** (Project Name, row count, creation date, action buttons).
- Simplified "New Table" modal: only **Project Name** + **Description**.
- Click on a card to navigate to `/tables/<id>` (the Excel view).
- Keep search, Active/Archived tabs, and pagination.

#### [NEW] [templates/table_view.html](file:///c:/Users/SONIA/test-ops-dashboard/templates/table_view.html)
The Excel-style spreadsheet page for a single table:
- Large title showing the Project Name with a back button `← Tables`.
- A **two-row merged header table**:
  - Row 1: `Category`, `Test Method`, `Test Number`, `Proto` (spans 2), `DVT` (spans 2), `EVT` (spans 2), `PVT` (spans 2), `Others`
  - Row 2 (sub-headers): `Week`, `Day` under each of Proto / DVT / EVT / PVT
- **Scrollable horizontally** for wide tables.
- **Inline editable cells** — click any cell to type, press Enter or blur to save.
- **"Add Row" button** — appends a new empty row at the bottom.
- **Row delete button** — trash icon at the end of each row.
- **Frozen header rows** — headers stay visible when scrolling.
- **Alternating row shading** for readability.

#### [MODIFY] [static/js/tables.js](file:///c:/Users/SONIA/test-ops-dashboard/static/js/tables.js)
Update the list page JS:
- Remove old field handling (category_name, column_name, date_day, date_week).
- Render project cards with a click-to-navigate interaction.

#### [NEW] [static/js/table_view.js](file:///c:/Users/SONIA/test-ops-dashboard/static/js/table_view.js)
New JS for the spreadsheet view:
- Fetch rows from `GET /api/tables/<id>/rows` on page load.
- Render table body with editable `<td contenteditable="true">` cells.
- On cell blur/Enter: auto-save via `PUT /api/tables/<id>/rows/<row_id>`.
- "Add Row" button: calls `POST /api/tables/<id>/rows` and inserts new empty row.
- Delete row button: calls `DELETE /api/tables/<id>/rows/<row_id>`, removes the row from DOM.
- Visual save feedback: cell briefly flashes green on save, red on error.

#### [MODIFY] [static/css/style.css](file:///c:/Users/SONIA/test-ops-dashboard/static/css/style.css)
Update/add styles:
- **Project Cards** for the list page (hover lift, status badge, row count chip).
- **Excel table** styles: merged headers, sticky headers, cell borders, editable cell focus ring.
- **Row delete** button (hidden by default, shows on row hover).
- **Add Row** button at the bottom of the spreadsheet.
- Responsive horizontal scroll wrapper.

---

## Verification Plan

### Manual Verification
1. Navigate to `/tables` — verify cards layout with project names.
2. Create a new table with just a Project Name — verify card appears.
3. Click the card — navigate to `/tables/<id>`.
4. Verify the two-row merged header structure renders correctly.
5. Click "Add Row" — a new empty row appears.
6. Click a cell and type data — press Enter or click away — verify auto-save (cell flashes green).
7. Add 5+ rows, verify all persist on page reload.
8. Click the row delete button — row is removed.
9. Navigate back to the list, archive the table, switch tabs.
