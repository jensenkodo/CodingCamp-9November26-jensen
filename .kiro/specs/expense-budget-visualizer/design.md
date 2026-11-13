# Design Document

## Overview

The Expense & Budget Visualizer is a fully client-side, single-page web application (SPA) that lets users record, view, and delete personal expense transactions. It displays a running total balance and a pie chart that breaks down spending across three fixed categories: Food, Transport, and Fun.

The application runs entirely in the browser with no build toolchain, no backend, and no external dependencies beyond vanilla HTML, CSS, and JavaScript. All data is persisted in the browser's Local Storage API so the user's transaction history survives page refreshes and browser restarts.

**Key design goals:**
- Zero-dependency: no frameworks, no bundlers, no CDN libraries.
- Single-file deployment: one HTML file, one CSS file, one JavaScript file.
- Immediate feedback: every add/delete operation updates the balance and chart within the required latency budgets (< 300 ms for balance/list, < 1 s for chart).
- Resilience: Local Storage errors are caught and surfaced to the user without crashing the app.
- Accessibility: WCAG 2.1 Level AA compliance with proper ARIA labels and keyboard navigation.

---

## Architecture

The application follows a unidirectional data-flow pattern adapted to vanilla JavaScript:

```
User Action
    │
    ▼
Input Validation (Validator)
    │
    ▼
State Mutation (TransactionStore)
    │
    ├─── Storage (LocalStorageAdapter) ◄──── App Init (read)
    │
    ▼
UI Render (Renderer)
    ├── TransactionList
    ├── BalanceDisplay
    └── Chart (PieChart)
```

1. **User actions** (form submit, delete button click) are captured by event listeners in `main.js`.
2. **Validator** runs synchronous field-level checks before any state change.
3. **TransactionStore** holds the in-memory array of transactions and exposes `add` / `remove` / `getAll` methods. Each mutation persists to `LocalStorageAdapter` before returning.
4. **Renderer** is called after every mutation and re-renders the three UI regions from the current store state.
5. On **initialisation**, `LocalStorageAdapter.load()` hydrates the store; parse/validation errors are caught and trigger a dismissible warning banner.

This keeps rendering logic separate from business logic and storage, making each layer independently testable.

### File Structure

```
index.html          — Single HTML shell; imports styles.css and main.js
styles.css          — All visual styling (no inline styles)
main.js             — All client-side logic (no inline scripts)
```

---

## Components and Interfaces

### 1. TransactionStore

Owns the canonical in-memory list of transactions.

```js
// Public interface
TransactionStore.add(transaction)       → { ok: true } | { ok: false, error: string }
TransactionStore.remove(id)             → { ok: true } | { ok: false, error: string }
TransactionStore.getAll()               → Transaction[]
TransactionStore.load()                 → { ok: true, skipped: number } | { ok: false, error: string }
```

- `add` appends to the front of the internal array (most-recent-first order) and calls `LocalStorageAdapter.save`.
- `remove` splices by `id` and calls `LocalStorageAdapter.save`.
- `load` calls `LocalStorageAdapter.load`, validates each record, skips invalid ones, and returns the count of skipped records.

### 2. LocalStorageAdapter

Thin wrapper around `window.localStorage` to isolate storage I/O.

```js
LocalStorageAdapter.save(transactions)  → { ok: true } | { ok: false, error: string }
LocalStorageAdapter.load()              → { ok: true, data: RawRecord[] } | { ok: false, error: string }
```

- Uses a single key `"expense_budget_transactions"`.
- `save` serialises the array to JSON.
- `load` parses JSON and returns raw objects; it does **not** validate schema (that is TransactionStore's responsibility).

### 3. Validator

Stateless module; each function returns a result object.

```js
Validator.validateName(value)   → { valid: true } | { valid: false, message: string }
Validator.validateAmount(value) → { valid: true } | { valid: false, message: string }
Validator.validateCategory(value) → { valid: true } | { valid: false, message: string }
Validator.validateTransaction(fields) → { valid: true, transaction: Transaction } | { valid: false, errors: FieldErrors }
```

### 4. Renderer

Responsible for all DOM mutations after a state change.

```js
Renderer.renderAll(transactions)         → void   // calls all three below
Renderer.renderTransactionList(transactions) → void
Renderer.renderBalanceDisplay(transactions) → void
Renderer.renderChart(transactions)        → void
```

`renderAll` is the primary entry point called from event handlers.

### 5. PieChart

Encapsulated SVG-based pie chart module.

```js
PieChart.render(containerEl, slices)  → void
// slices: Array<{ label: string, value: number, color: string }>
```

- Computes arc angles from values.
- Renders `<path>` elements inside an inline `<svg>`.
- Handles the single-category full-circle edge case.
- Renders a text placeholder when `slices` is empty.

### 6. InputForm (UI Component)

Binds to `<form id="transaction-form">`.

- Attaches a `submit` event listener.
- On submit: calls `Validator.validateTransaction`, shows inline field errors if invalid, or calls `TransactionStore.add` + `Renderer.renderAll` if valid, then resets the form.

### 7. ConfirmationDialog

Lightweight modal to confirm deletions.

```js
ConfirmationDialog.show(message, onConfirm, onCancel) → void
ConfirmationDialog.hide() → void
```

- Rendered as a `<dialog>` element for native accessibility.
- Keyboard-accessible (Enter to confirm, Escape to cancel).

### 8. NotificationBanner

Displays dismissible error/warning messages.

```js
NotificationBanner.show(message, type) → void  // type: 'error' | 'warning'
NotificationBanner.dismiss()           → void
```

---

## Data Models

### Transaction (runtime object)

```js
{
  id:        string,   // crypto.randomUUID() — 36-char UUID v4
  name:      string,   // 1–100 characters, trimmed
  amount:    number,   // 0.01–999999999.99, stored as a float
  category:  "Food" | "Transport" | "Fun",
  createdAt: number    // Date.now() timestamp (ms since epoch)
}
```

### RawRecord (shape stored in Local Storage)

Identical to `Transaction` but typed as `unknown` on load; `TransactionStore.load` validates each field before accepting a record.

### FieldErrors (validation result)

```js
{
  name?:     string,   // error message if name is invalid
  amount?:   string,   // error message if amount is invalid
  category?: string    // error message if category is invalid
}
```

### Slice (input to PieChart)

```js
{
  label:   string,   // category name
  value:   number,   // sum of transaction amounts in that category
  color:   string    // CSS colour string (one per category)
}
```

### Category Colour Map

| Category  | Colour |
|-----------|--------|
| Food      | `#FF6384` |
| Transport | `#36A2EB` |
| Fun       | `#FFCE56` |

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Transaction persistence round-trip

*For any* valid transaction (any name 1–100 chars, any amount 0.01–999,999,999.99, any valid category), serialising the transaction collection to Local Storage and then deserialising it should produce a collection containing an equivalent transaction.

**Validates: Requirements 6.1, 6.2, 6.3**

### Property 2: Balance equals sum of amounts

*For any* collection of transactions, the value rendered by `Balance_Display` shall equal the arithmetic sum of all transaction amounts, regardless of the number, order, or category of those transactions.

**Validates: Requirements 4.1, 4.2, 4.3**

### Property 3: Validation rejects out-of-range amounts

*For any* amount value outside the range 0.01–999,999,999.99 (including zero, negative numbers, values with more than 2 decimal places, and non-numeric strings), `Validator.validateAmount` shall return `{ valid: false }`.

**Validates: Requirements 1.3, 1.4**

### Property 4: Validation rejects invalid names

*For any* name that is an empty string or is composed entirely of whitespace, or any name exceeding 100 characters, `Validator.validateName` shall return `{ valid: false }`.

**Validates: Requirements 1.3, 1.4**

### Property 5: Pie chart slice percentages sum to 100

*For any* non-empty collection of transactions spanning one or more categories, the percentage labels rendered on the pie chart shall sum to 100 (allowing for rounding to the nearest whole number, i.e., the sum is in the range [99, 101]).

**Validates: Requirements 5.1, 5.5**

### Property 6: Pie chart slice arc is proportional to category share

*For any* non-empty collection of transactions, each category slice's arc angle (in degrees) shall equal (category sum / total sum × 360°), within floating-point rounding tolerance of ±0.001°.

**Validates: Requirements 5.1**

### Property 7: Add then delete returns to original state

*For any* transaction collection state and any valid new transaction, adding that transaction and then immediately deleting it shall leave the collection in a state equivalent to the original (same items, same total balance, same chart distribution).

**Validates: Requirements 1.2, 3.3, 4.2, 5.2, 6.1, 6.2**

### Property 8: Invalid records are skipped on load

*For any* array stored in Local Storage that contains a mixture of valid and invalid transaction records, `TransactionStore.load` shall include exactly the valid records and exclude the invalid ones, with the count of skipped records matching the number of invalid entries.

**Validates: Requirements 6.5**

---

## Error Handling

| Scenario | Detection | Response |
|---|---|---|
| Form submitted with empty field(s) | Validator returns `valid: false` | Inline error message per field; form NOT submitted |
| Form submitted with out-of-range amount | Validator returns `valid: false` | Inline error on amount field; form NOT submitted |
| Local Storage `setItem` throws (e.g., quota exceeded) | `LocalStorageAdapter.save` catches exception | `NotificationBanner.show('error')` shown; transaction NOT added to in-memory list |
| Local Storage `getItem` throws on init | `LocalStorageAdapter.load` catches exception | `NotificationBanner.show('error')` shown; app initialises with empty list |
| Local Storage contains unparseable JSON on init | `JSON.parse` throws inside `load` | Same as above |
| Some stored records fail schema validation on init | `TransactionStore.load` skips invalid records | `NotificationBanner.show('warning')` with count of skipped records |
| `localStorage.removeItem` throws during deletion | `LocalStorageAdapter.save` catches exception | `NotificationBanner.show('error')` shown; transaction preserved in list |
| SVG rendering failure in PieChart | Try/catch around SVG construction | Fallback text "Chart unavailable" rendered |

All error messages are dismissible via a close button on the `NotificationBanner`. Storage errors are surfaced immediately (before the next user interaction) as required by Requirements 1.6, 2.5, 3.4, and 6.4.

---

## Testing Strategy

### Unit Testing

Using **Vitest** (zero-config, ESM-compatible, no bundler required for plain JS modules via `--environment jsdom`).

Focus areas for unit tests:
- `Validator`: concrete valid and invalid examples for each field type (boundary values, empty strings, max-length strings).
- `TransactionStore`: add/remove/load with mocked `LocalStorageAdapter`.
- `LocalStorageAdapter`: behaviour when `localStorage` throws (mocked via `vi.spyOn`).
- `PieChart`: arc-angle computation function (pure logic extracted from DOM rendering).
- `Renderer.renderBalanceDisplay`: verifies correct currency formatting for edge amounts (0, 1 cent, max value).

### Property-Based Testing

Using **fast-check** (available as a single CDN import or npm package; works with Vitest).

Each property test is configured with a minimum of **100 iterations**. Tests are tagged with comments in the format:

```
// Feature: expense-budget-visualizer, Property N: <property text>
```

| Property | Generator Strategy |
|---|---|
| P1 – Persistence round-trip | Generate `fc.record({ name: fc.string({minLength:1,maxLength:100}), amount: fc.float({min:0.01,max:999999999.99}), category: fc.constantFrom('Food','Transport','Fun') })` |
| P2 – Balance equals sum | Generate `fc.array(validTransactionArb)` and compare `sum(amounts)` to rendered balance |
| P3 – Validation rejects bad amounts | Generate out-of-range values via `fc.oneof(fc.float({max:0}), fc.float({min:1e9}), ...)` |
| P4 – Validation rejects bad names | Generate `fc.string({maxLength:0})` and `fc.stringMatching(/^\s+$/)` and strings of length > 100 |
| P5 – Percentages sum to 100 | Generate valid transaction arrays, compute pie data, check sum of `Math.round(pct)` |
| P6 – Arc proportionality | Generate valid transaction arrays, verify arc degrees per category |
| P7 – Add-then-delete idempotence | Generate initial state + new transaction; verify state equivalence after add+delete |
| P8 – Invalid records skipped | Generate arrays mixing valid and invalid raw records; verify only valid ones loaded |

### Integration / Smoke Tests

Manual browser smoke tests (checklist in `README.md`):
- App loads in Chrome, Firefox, Edge, and Safari latest.
- Responsive layout at 375 px viewport width.
- Screen reader announces form fields and error messages (manual test with NVDA / VoiceOver).
- Local Storage key is written after each add/delete.
- Pie chart renders correctly with 1, 2, and 3 active categories.
