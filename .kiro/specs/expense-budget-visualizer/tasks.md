# Implementation Plan: Expense & Budget Visualizer

## Overview

Implement a zero-dependency, single-page expense tracker using vanilla HTML, CSS, and JavaScript. The implementation follows a unidirectional data-flow pattern: user actions → validation → state mutation (with Local Storage persistence) → UI re-render. All logic lives in `js/app.js`, all styling in `css/styles.css`, and the HTML shell in `index.html`.

## Tasks

- [x] 1. Scaffold project structure and HTML shell
  - Create `index.html` with semantic landmarks: a `<header>` for the balance display, a `<main>` split into form/list/chart sections, and a notification banner slot
  - Add `<form id="transaction-form">` with labelled `<input>` for name, `<input type="number">` for amount, `<select>` for category (Food, Transport, Fun), and a submit `<button>` — each field with an associated `<label>` and an empty `<span>` for inline errors
  - Add `<div id="transaction-list">` and `<div id="chart-container">` and `<div id="balance-display">` placeholders
  - Add `<dialog id="confirm-dialog">` and `<div id="notification-banner">` elements
  - Link `<link rel="stylesheet" href="css/styles.css">` and `<script src="js/app.js" type="module">` (no inline styles or scripts)
  - Create empty `css/styles.css` and `js/app.js` files
  - _Requirements: 7.2, 7.5_

- [x] 2. Implement data models and LocalStorageAdapter
  - [x] 2.1 Define the `Transaction` schema and `LocalStorageAdapter` module in `js/app.js`
    - Implement `LocalStorageAdapter.save(transactions)` — JSON-serialises and writes to key `"expense_budget_transactions"`; catches `setItem` exceptions and returns `{ ok: false, error }`
    - Implement `LocalStorageAdapter.load()` — reads and JSON-parses the key; catches missing key and parse exceptions; returns `{ ok: true, data: RawRecord[] }` or `{ ok: false, error }`
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 3. Implement Validator module
  - [x] 3.1 Implement `Validator.validateName`, `Validator.validateAmount`, `Validator.validateCategory`, and `Validator.validateTransaction` in `js/app.js`
    - `validateName`: rejects empty string, whitespace-only, and strings > 100 chars; returns `{ valid: false, message }` for failures
    - `validateAmount`: rejects values ≤ 0, values > 999,999,999.99, values with more than 2 decimal places, and non-numeric input; returns `{ valid: false, message }` for failures
    - `validateCategory`: rejects any value not in `["Food", "Transport", "Fun"]`
    - `validateTransaction`: calls all three; returns `{ valid: true, transaction }` (with generated UUID and timestamp) or `{ valid: false, errors: FieldErrors }`
    - _Requirements: 1.3, 1.4_

- [x] 4. Implement TransactionStore
  - [x] 4.1 Implement `TransactionStore` module in `js/app.js`
    - `add(transaction)`: prepends to in-memory array, calls `LocalStorageAdapter.save`; on save failure returns `{ ok: false, error }` and does NOT modify in-memory state
    - `remove(id)`: splices by id, calls `LocalStorageAdapter.save`; on save failure restores the removed item and returns `{ ok: false, error }`
    - `getAll()`: returns a shallow copy of the in-memory array
    - `load()`: calls `LocalStorageAdapter.load`, validates each raw record against the Transaction schema (id: string, name: 1–100 chars, amount: in range, category: valid, createdAt: number), skips invalid records, hydrates in-memory array, returns `{ ok: true, skipped: N }` or `{ ok: false, error }`
    - _Requirements: 1.2, 1.6, 2.4, 3.3, 3.4, 6.1, 6.2, 6.3, 6.5_

- [x] 5. Checkpoint — core data layer
  - Ensure all Validator and TransactionStore unit/property tests pass. Ask the user if any questions arise before continuing.

- [x] 6. Implement PieChart module
  - [x] 6.1 Implement `PieChart.render(containerEl, slices)` using inline SVG in `js/app.js`
    - Compute arc angles: `angle = value / total * 360` for each slice; convert to SVG arc path `d` attribute using `Math.cos`/`Math.sin`
    - Handle single-category full-circle edge case (use a full `<circle>` instead of a `<path>` with arc)
    - Render a `<text>` placeholder "No data available" when `slices` is empty
    - Render `<text>` labels per slice showing category name and `Math.round(pct)%`; wrap computation in try/catch and fall back to "Chart unavailable" text on error
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6_

- [x] 7. Implement Renderer module
  - [x] 7.1 Implement `Renderer.renderTransactionList(transactions)` in `js/app.js`
    - Render each transaction as a list item showing: name, amount formatted as `$1,234.56` via `Intl.NumberFormat`, category, and a delete `<button>` with `data-id` attribute
    - Render empty-state message when array is empty
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 7.2 Implement `Renderer.renderBalanceDisplay(transactions)` in `js/app.js`
    - Sum all `transaction.amount` values; format with `Intl.NumberFormat` to 2 decimal places with currency symbol; write to `#balance-display`
    - Show `$0.00` when array is empty
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 7.4 Implement `Renderer.renderChart(transactions)` and `Renderer.renderAll(transactions)` in `js/app.js`
    - Aggregate transaction amounts by category; build `Slice[]` array (omit zero-value categories); call `PieChart.render`
    - `renderAll` calls `renderTransactionList`, `renderBalanceDisplay`, `renderChart` in sequence
    - _Requirements: 5.1, 5.2, 5.6_

- [x] 8. Implement UI components — ConfirmationDialog and NotificationBanner
  - [x] 8.1 Implement `ConfirmationDialog.show(message, onConfirm, onCancel)` and `ConfirmationDialog.hide()` in `js/app.js`
    - Bind to `<dialog id="confirm-dialog">`; call `dialog.showModal()` / `dialog.close()`
    - Wire Enter key to confirm and Escape key to cancel via `keydown` listener
    - _Requirements: 3.2_

  - [x] 8.2 Implement `NotificationBanner.show(message, type)` and `NotificationBanner.dismiss()` in `js/app.js`
    - Set `data-type` attribute to `'error'` or `'warning'` for CSS colour styling
    - Render a dismiss `<button>` that calls `NotificationBanner.dismiss()`
    - _Requirements: 1.6, 2.5, 3.4, 6.4, 6.5_

- [x] 9. Wire event handlers and app initialisation in `js/app.js`
  - [x] 9.1 Attach `submit` listener to `#transaction-form`
    - Call `Validator.validateTransaction`; on failure render inline field errors and return; on success call `TransactionStore.add` and on storage error call `NotificationBanner.show('error')`; on success call `Renderer.renderAll` and reset the form
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 9.2 Attach delegated `click` listener on `#transaction-list` for delete buttons
    - Read `data-id` from the clicked delete button; call `ConfirmationDialog.show`; on confirm call `TransactionStore.remove`; on storage error call `NotificationBanner.show('error')`; otherwise call `Renderer.renderAll`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 9.3 Implement `initApp()` and call it on `DOMContentLoaded`
    - Call `TransactionStore.load()`; on `ok: false` call `NotificationBanner.show('error')`; if `skipped > 0` call `NotificationBanner.show('warning')`; call `Renderer.renderAll` with loaded transactions
    - _Requirements: 2.4, 2.5, 6.3, 6.4, 6.5_

- [x] 10. Checkpoint — functional app
  - Ensure form submission, deletion flow, balance update, and chart update all work end-to-end with the browser dev tools open. Ask the user if any questions arise before continuing.

- [x] 11. Implement CSS styling and responsive layout
  - [x] 11.1 Write base styles in `css/styles.css`
    - Set `font-size` ≥ 14 px for all transaction data and balance values; ensure contrast ratio ≥ 4.5:1 for all text/background pairings
    - Style `#notification-banner` with distinct colours for `[data-type="error"]` and `[data-type="warning"]`
    - Style `<dialog>` as a centred modal overlay; style focus indicators for all interactive elements
    - _Requirements: 7.3_

  - [x] 11.2 Implement responsive single-column layout for viewports < 600 px
    - Use a CSS media query `@media (max-width: 599px)` to reflow `#transaction-form`, `#transaction-list`, and `#chart-container` into a single column
    - Ensure no horizontal scroll at 375 px viewport width
    - _Requirements: 7.4_

  - [x] 11.3 Verify accessibility of form controls
    - Confirm every `<input>` and `<select>` has a matching `<label for>` or `aria-labelledby`
    - Confirm all interactive elements receive a visible `:focus` outline and are reachable via Tab key
    - Add `aria-live="polite"` to the notification banner and `role="status"` to `#balance-display`
    - _Requirements: 7.5_

- [x] 12. Final checkpoint — full verification
  - Ensure all automated tests pass. Verify the app loads, adds, deletes, and persists transactions correctly in a browser. Ask the user if any questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Property tests require **fast-check** (`npm install fast-check` or CDN import in test file); unit tests use **Vitest** with `--environment jsdom`
- Run tests with `npx vitest --run` (single-pass, non-watch mode)
- Each task references specific requirements for full traceability
- The `PieChart` single-category edge case (Property 5/6) must be handled explicitly in SVG rendering
- All storage errors must be surfaced before the next user interaction per Requirements 1.6, 2.5, 3.4, 6.4

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1"] },
    { "id": 1, "tasks": ["3.1", "2.2"] },
    { "id": 2, "tasks": ["3.2", "3.3", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "6.1"] },
    { "id": 4, "tasks": ["6.2", "6.3", "7.1", "7.2"] },
    { "id": 5, "tasks": ["7.3", "7.4", "8.1", "8.2"] },
    { "id": 6, "tasks": ["9.1", "9.2"] },
    { "id": 7, "tasks": ["9.3"] },
    { "id": 8, "tasks": ["11.1", "11.2"] },
    { "id": 9, "tasks": ["11.3"] }
  ]
}
```
