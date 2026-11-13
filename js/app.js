// Expense & Budget Visualizer — js/app.js
// Zero-dependency vanilla JS, ESM module.

// ---------------------------------------------------------------------------
// Transaction schema (JSDoc for IDE assistance)
// ---------------------------------------------------------------------------
/**
 * @typedef {Object} Transaction
 * @property {string} id         - crypto.randomUUID() — 36-char UUID v4
 * @property {string} name       - 1–100 characters, trimmed
 * @property {number} amount     - 0.01–999999999.99, stored as a float
 * @property {"Food"|"Transport"|"Fun"} category
 * @property {number} createdAt  - Date.now() timestamp (ms since epoch)
 */

/**
 * @typedef {Object} RawRecord
 * Any value read back from JSON — not yet validated against Transaction schema.
 */

// ---------------------------------------------------------------------------
// LocalStorageAdapter
// Thin wrapper around window.localStorage; isolates all storage I/O.
// Key: "expense_budget_transactions"
// ---------------------------------------------------------------------------
const STORAGE_KEY = "expense_budget_transactions";

const LocalStorageAdapter = {
  /**
   * Serialise `transactions` to JSON and write to Local Storage.
   * @param {Transaction[]} transactions
   * @returns {{ ok: true } | { ok: false, error: string }}
   */
  save(transactions) {
    try {
      const json = JSON.stringify(transactions);
      window.localStorage.setItem(STORAGE_KEY, json);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  /**
   * Read and JSON-parse the stored transaction array.
   * Returns raw (unvalidated) records so the caller can apply schema checks.
   * @returns {{ ok: true, data: RawRecord[] } | { ok: false, error: string }}
   */
  load() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      // Key absent → treat as empty list (not an error)
      if (raw === null) {
        return { ok: true, data: [] };
      }
      const parsed = JSON.parse(raw);
      // Ensure the top-level value is an array
      if (!Array.isArray(parsed)) {
        return { ok: false, error: "Stored data is not an array." };
      }
      return { ok: true, data: parsed };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};

// ---------------------------------------------------------------------------
// Validator
// Stateless validation module. Each method returns a plain result object.
// ---------------------------------------------------------------------------

/** Valid categories accepted by the application. */
const VALID_CATEGORIES = ["Food", "Transport", "Fun"];

const Validator = {
  /**
   * Validate the transaction name field.
   * Rules:
   *   - Must not be empty or whitespace-only
   *   - Must not exceed 100 characters (after trimming)
   *
   * @param {unknown} value
   * @returns {{ valid: true } | { valid: false, message: string }}
   */
  validateName(value) {
    if (typeof value !== "string" || value.trim().length === 0) {
      return { valid: false, message: "Name is required." };
    }
    if (value.trim().length > 100) {
      return { valid: false, message: "Name must not exceed 100 characters." };
    }
    return { valid: true };
  },

  /**
   * Validate the transaction amount field.
   * Rules:
   *   - Must be numeric (string digits or actual number)
   *   - Must be > 0
   *   - Must be ≤ 999,999,999.99
   *   - Must have no more than 2 decimal places
   *
   * @param {unknown} value
   * @returns {{ valid: true } | { valid: false, message: string }}
   */
  validateAmount(value) {
    // Reject non-numeric types (arrays, objects, booleans, null, undefined, etc.)
    if (value === null || value === undefined || typeof value === "boolean") {
      return { valid: false, message: "Amount must be a valid number." };
    }

    const str = String(value).trim();

    // Reject empty strings and strings that aren't a valid decimal number
    if (str === "" || !/^-?\d+(\.\d+)?$/.test(str)) {
      return { valid: false, message: "Amount must be a valid number." };
    }

    const num = parseFloat(str);

    if (!isFinite(num) || isNaN(num)) {
      return { valid: false, message: "Amount must be a valid number." };
    }

    if (num <= 0) {
      return { valid: false, message: "Amount must be greater than 0." };
    }

    if (num > 999_999_999.99) {
      return { valid: false, message: "Amount must not exceed 999,999,999.99." };
    }

    // Check decimal places: at most 2 digits after the decimal point
    const dotIndex = str.indexOf(".");
    if (dotIndex !== -1 && str.length - dotIndex - 1 > 2) {
      return { valid: false, message: "Amount must have no more than 2 decimal places." };
    }

    return { valid: true };
  },

  /**
   * Validate the transaction category field.
   * Rules:
   *   - Must be one of "Food", "Transport", "Fun"
   *
   * @param {unknown} value
   * @returns {{ valid: true } | { valid: false, message: string }}
   */
  validateCategory(value) {
    if (!VALID_CATEGORIES.includes(value)) {
      return {
        valid: false,
        message: `Category must be one of: ${VALID_CATEGORIES.join(", ")}.`,
      };
    }
    return { valid: true };
  },

  /**
   * Validate all three fields together and, on success, build a Transaction.
   *
   * @param {{ name: unknown, amount: unknown, category: unknown }} fields
   * @returns {{ valid: true, transaction: Transaction } | { valid: false, errors: import('./app.js').FieldErrors }}
   */
  validateTransaction(fields) {
    const { name, amount, category } = fields ?? {};

    const nameResult     = Validator.validateName(name);
    const amountResult   = Validator.validateAmount(amount);
    const categoryResult = Validator.validateCategory(category);

    const errors = {};
    if (!nameResult.valid)     errors.name     = nameResult.message;
    if (!amountResult.valid)   errors.amount   = amountResult.message;
    if (!categoryResult.valid) errors.category = categoryResult.message;

    if (Object.keys(errors).length > 0) {
      return { valid: false, errors };
    }

    /** @type {Transaction} */
    const transaction = {
      id:        crypto.randomUUID(),
      name:      String(name).trim(),
      amount:    parseFloat(String(amount).trim()),
      category:  /** @type {"Food"|"Transport"|"Fun"} */ (category),
      createdAt: Date.now(),
    };

    return { valid: true, transaction };
  },
};

// ---------------------------------------------------------------------------
// TransactionStore
// Owns the canonical in-memory list of transactions. All mutations are
// persisted to LocalStorageAdapter before returning to the caller.
// ---------------------------------------------------------------------------

const TransactionStore = (() => {
  /** @type {Transaction[]} */
  let _transactions = [];

  /**
   * Validate a raw record from Local Storage against the Transaction schema.
   * Rules mirror the Transaction typedef:
   *   - id:        non-empty string
   *   - name:      string, 1–100 chars (trimmed)
   *   - amount:    finite number, > 0, ≤ 999999999.99
   *   - category:  one of VALID_CATEGORIES
   *   - createdAt: finite number
   *
   * @param {unknown} record
   * @returns {boolean}
   */
  function _isValidRecord(record) {
    if (record === null || typeof record !== "object" || Array.isArray(record)) {
      return false;
    }

    const r = /** @type {Record<string, unknown>} */ (record);

    // id: non-empty string
    if (typeof r.id !== "string" || r.id.trim().length === 0) {
      return false;
    }

    // name: string, 1–100 chars (trimmed)
    if (typeof r.name !== "string" || r.name.trim().length < 1 || r.name.trim().length > 100) {
      return false;
    }

    // amount: finite number, > 0, ≤ 999999999.99
    if (
      typeof r.amount !== "number" ||
      !isFinite(r.amount) ||
      r.amount <= 0 ||
      r.amount > 999_999_999.99
    ) {
      return false;
    }

    // category: one of VALID_CATEGORIES
    if (!VALID_CATEGORIES.includes(r.category)) {
      return false;
    }

    // createdAt: finite number
    if (typeof r.createdAt !== "number" || !isFinite(r.createdAt)) {
      return false;
    }

    return true;
  }

  return {
    /**
     * Prepend `transaction` to the in-memory array and persist.
     * If persistence fails, the in-memory state is NOT modified.
     *
     * @param {Transaction} transaction
     * @returns {{ ok: true } | { ok: false, error: string }}
     */
    add(transaction) {
      const next = [transaction, ..._transactions];
      const result = LocalStorageAdapter.save(next);
      if (!result.ok) {
        // Do NOT modify in-memory state on save failure
        return result;
      }
      _transactions = next;
      return { ok: true };
    },

    /**
     * Remove the transaction with the given `id` and persist.
     * If persistence fails, the removed item is restored and the error is returned.
     *
     * @param {string} id
     * @returns {{ ok: true } | { ok: false, error: string }}
     */
    remove(id) {
      const index = _transactions.findIndex((t) => t.id === id);
      if (index === -1) {
        // Nothing to remove — treat as success (idempotent)
        return { ok: true };
      }

      // Splice out the item and attempt to persist
      const removed = _transactions.splice(index, 1)[0];
      const result = LocalStorageAdapter.save(_transactions);

      if (!result.ok) {
        // Restore the removed item to its original position
        _transactions.splice(index, 0, removed);
        return result;
      }

      return { ok: true };
    },

    /**
     * Return a shallow copy of the current in-memory transaction array.
     *
     * @returns {Transaction[]}
     */
    getAll() {
      return [..._transactions];
    },

    /**
     * Load transactions from Local Storage, validate each record against the
     * Transaction schema, skip invalid records, and hydrate the in-memory array.
     *
     * @returns {{ ok: true, skipped: number } | { ok: false, error: string }}
     */
    load() {
      const result = LocalStorageAdapter.load();

      if (!result.ok) {
        return result;
      }

      let skipped = 0;
      const valid = /** @type {Transaction[]} */ ([]);

      for (const record of result.data) {
        if (_isValidRecord(record)) {
          valid.push(/** @type {Transaction} */ (record));
        } else {
          skipped++;
        }
      }

      _transactions = valid;
      return { ok: true, skipped };
    },
  };
})();

// ---------------------------------------------------------------------------
// PieChart
// Renders an inline SVG pie chart into a provided container element.
// SVG viewport: 200×200, centre (100,100), radius 80.
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Slice
 * @property {string} label  - Category name
 * @property {number} value  - Sum of transaction amounts for this category
 * @property {string} color  - CSS colour string
 */

const PieChart = {
  /**
   * Render a pie chart SVG into `containerEl`.
   *
   * - Empty `slices` → renders a "No data available" text placeholder.
   * - Single slice   → renders a full `<circle>` (arc path would degenerate).
   * - Multi-slice    → renders `<path>` arcs computed from angles.
   * - Each slice gets a `<text>` label: "Category N%".
   * - Wraps all computation in try/catch; on error renders "Chart unavailable".
   *
   * @param {Element} containerEl  - DOM element to render into (innerHTML replaced)
   * @param {Slice[]} slices       - Non-empty means at least one category has data
   * @returns {void}
   */
  render(containerEl, slices) {
    try {
      // Validate arguments
      if (!containerEl) {
        throw new Error("containerEl is required");
      }

      // Guard: empty slices → "No data available"
      if (!Array.isArray(slices) || slices.length === 0) {
        containerEl.innerHTML = `
          <svg viewBox="0 0 200 200" width="200" height="200"
               role="img" aria-label="No data available">
            <text x="100" y="105" text-anchor="middle"
                  font-size="14" fill="#666">No data available</text>
          </svg>`;
        return;
      }

      const cx = 100;
      const cy = 100;
      const r  = 80;

      const total = slices.reduce((sum, s) => sum + s.value, 0);

      // Single-category full-circle edge case
      if (slices.length === 1) {
        const s   = slices[0];
        const pct = 100;
        containerEl.innerHTML = `
          <svg viewBox="0 0 200 200" width="200" height="200"
               role="img" aria-label="Pie chart: ${s.label} 100%">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="${s.color}" />
            <text x="${cx}" y="${cy + 5}" text-anchor="middle"
                  font-size="12" fill="#fff" font-weight="bold">
              ${s.label} ${pct}%
            </text>
          </svg>`;
        return;
      }

      // Multi-slice: build arc paths
      // We iterate through slices, tracking cumulative angle (degrees).
      // Angles start at -90° (12 o'clock) so the first slice begins at the top.
      const DEG_TO_RAD = Math.PI / 180;

      /**
       * Convert polar angle (degrees, 0 = right) to Cartesian x,y on the circle.
       * @param {number} angleDeg
       * @returns {{ x: number, y: number }}
       */
      function polarToCartesian(angleDeg) {
        const rad = angleDeg * DEG_TO_RAD;
        return {
          x: cx + r * Math.cos(rad),
          y: cy + r * Math.sin(rad),
        };
      }

      let svgParts = [
        `<svg viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="Expense pie chart">`,
      ];

      let startAngle = -90; // start at 12 o'clock

      for (const slice of slices) {
        const sliceAngle = (slice.value / total) * 360;
        const endAngle   = startAngle + sliceAngle;

        // Arc endpoints
        const start = polarToCartesian(startAngle);
        const end   = polarToCartesian(endAngle);

        // large-arc-flag: 1 if the arc spans more than 180°
        const largeArc = sliceAngle > 180 ? 1 : 0;

        // SVG arc path: move to centre, line to arc start, arc to arc end, close
        const d = [
          `M ${cx} ${cy}`,
          `L ${start.x.toFixed(4)} ${start.y.toFixed(4)}`,
          `A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(4)} ${end.y.toFixed(4)}`,
          `Z`,
        ].join(" ");

        svgParts.push(`<path d="${d}" fill="${slice.color}" />`);

        // Label: position at the midpoint angle, at 60% of the radius
        const midAngle   = startAngle + sliceAngle / 2;
        const midRad     = midAngle * DEG_TO_RAD;
        const labelR     = r * 0.6;
        const lx         = (cx + labelR * Math.cos(midRad)).toFixed(2);
        const ly         = (cy + labelR * Math.sin(midRad)).toFixed(2);
        const pct        = Math.round((slice.value / total) * 100);

        svgParts.push(
          `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle"` +
          ` font-size="11" fill="#fff" font-weight="bold">${slice.label} ${pct}%</text>`
        );

        startAngle = endAngle;
      }

      svgParts.push(`</svg>`);
      containerEl.innerHTML = svgParts.join("\n");
    } catch (_err) {
      // Fallback: render "Chart unavailable" so the UI never shows a broken state
      if (containerEl) {
        containerEl.innerHTML = `
          <svg viewBox="0 0 200 200" width="200" height="200"
               role="img" aria-label="Chart unavailable">
            <text x="100" y="105" text-anchor="middle"
                  font-size="14" fill="#c00">Chart unavailable</text>
          </svg>`;
      }
    }
  },
};

// ---------------------------------------------------------------------------
// Renderer
// Responsible for all DOM mutations after a state change.
// Each method reads from the DOM and writes to it; no state is held here.
// ---------------------------------------------------------------------------

/** Currency formatter — en-US locale, USD, always 2 decimal places. */
const _currencyFormatter = new Intl.NumberFormat("en-US", {
  style:    "currency",
  currency: "USD",
});

/**
 * Escape special HTML characters to prevent XSS when inserting user-provided
 * strings into innerHTML.
 *
 * @param {string} str
 * @returns {string}
 */
function _escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const Renderer = {
  /**
   * Update #balance-display with the sum of all transaction amounts.
   *
   * - Sums every `transaction.amount` in the provided array.
   * - Formats the total with `Intl.NumberFormat` (en-US, USD, 2 dp).
   * - Shows `$0.00` when the array is empty.
   * - Writes to `element.textContent` so the value is screen-reader
   *   accessible via the existing `role="status"` on that element.
   *
   * @param {Transaction[]} transactions
   * @returns {void}
   */
  renderBalanceDisplay(transactions) {
    const total = Array.isArray(transactions)
      ? transactions.reduce((sum, t) => sum + t.amount, 0)
      : 0;

    const formatted = _currencyFormatter.format(total);

    const el = document.querySelector("#balance-display");
    if (el) {
      el.textContent = formatted;
    }
  },

  /**
   * Render the transaction list into `#transaction-list`.
   *
   * - Empty array → shows an empty-state message (Requirement 2.3).
   * - Non-empty   → renders one `<li>` per transaction in the order supplied
   *                 (TransactionStore.add prepends, so index 0 is most recent).
   *
   * Each item contains:
   *   - Item name
   *   - Amount formatted as USD currency via Intl.NumberFormat (e.g. $1,234.56)
   *   - Category badge
   *   - Delete button with `data-id` attribute (Requirement 3.1)
   *
   * @param {Transaction[]} transactions
   * @returns {void}
   */
  renderTransactionList(transactions) {
    const container = document.getElementById("transaction-list");
    if (!container) {
      return;
    }

    // Empty state — Requirement 2.3
    if (!Array.isArray(transactions) || transactions.length === 0) {
      container.innerHTML = `
        <p class="empty-state" aria-live="polite">
          No transactions added yet.
        </p>`;
      return;
    }

    const items = transactions.map((t) => {
      const formattedAmount = _currencyFormatter.format(t.amount);
      return `<li class="transaction-item" data-id="${t.id}">
        <span class="transaction-name">${_escapeHtml(t.name)}</span>
        <span class="transaction-amount">${formattedAmount}</span>
        <span class="transaction-category category-badge" data-category="${_escapeHtml(t.category)}">${_escapeHtml(t.category)}</span>
        <button
          class="btn-delete"
          data-id="${t.id}"
          aria-label="Delete transaction: ${_escapeHtml(t.name)}"
        >Delete</button>
      </li>`;
    });

    container.innerHTML = `<ul class="transaction-list-inner">${items.join("")}</ul>`;
  },

  /**
   * Re-render the pie chart in the DOM.
   * Aggregates transaction amounts by category and delegates to PieChart.render.
   * Requirements: 5.1, 5.2, 5.6
   *
   * @param {Transaction[]} transactions
   * @returns {void}
   */
  renderChart(transactions) {
    /** @type {Record<string, string>} Category-to-colour mapping */
    const CATEGORY_COLOURS = {
      Food:      "#FF6384",
      Transport: "#36A2EB",
      Fun:       "#FFCE56",
    };

    // Aggregate amounts by category — Requirement 5.1
    const totals = { Food: 0, Transport: 0, Fun: 0 };
    if (Array.isArray(transactions)) {
      transactions.forEach((t) => {
        if (Object.prototype.hasOwnProperty.call(totals, t.category)) {
          totals[t.category] += t.amount;
        }
      });
    }

    // Build Slice[] omitting zero-value categories — Requirement 5.2
    const slices = Object.keys(totals)
      .filter((category) => totals[category] > 0)
      .map((category) => ({
        label: category,
        value: totals[category],
        color: CATEGORY_COLOURS[category],
      }));

    const containerEl = document.getElementById("chart-container");
    PieChart.render(containerEl, slices);
  },

  /**
   * Convenience method: calls all three render methods in sequence.
   * Requirements: 5.6
   *
   * @param {Transaction[]} transactions
   * @returns {void}
   */
  renderAll(transactions) {
    Renderer.renderTransactionList(transactions);
    Renderer.renderBalanceDisplay(transactions);
    Renderer.renderChart(transactions);
  },
};

// ---------------------------------------------------------------------------
// NotificationBanner
// Displays a dismissible error or warning message in the #notification-banner
// element. Uses data-type for CSS colour styling ('error' | 'warning').
// ---------------------------------------------------------------------------

const NotificationBanner = {
  /**
   * Show a dismissible notification message in the banner element.
   *
   * - Sets `data-type` to `type` ('error' or 'warning') for CSS colour styling.
   * - Escapes `message` to prevent XSS.
   * - Renders a dismiss button that calls `NotificationBanner.dismiss()`.
   * - Removes the `hidden` attribute so the banner becomes visible.
   *
   * @param {string} message - The notification text to display.
   * @param {'error'|'warning'} type - Controls CSS colour via `data-type`.
   * @returns {void}
   */
  show(message, type) {
    const banner = document.getElementById("notification-banner");
    if (!banner) {
      return;
    }

    banner.setAttribute("data-type", type);
    banner.innerHTML =
      `<span class="notification-message">${_escapeHtml(message)}</span>` +
      `<button class="notification-dismiss" aria-label="Dismiss notification">Dismiss</button>`;
    // Attach dismiss handler via addEventListener so it works inside a module scope
    // (inline onclick can't reach module-scoped variables via window).
    const dismissBtn = banner.querySelector(".notification-dismiss");
    if (dismissBtn) {
      dismissBtn.addEventListener("click", () => NotificationBanner.dismiss(), { once: true });
    }
    banner.removeAttribute("hidden");
  },

  /**
   * Hide the notification banner and clear its contents.
   *
   * - Adds the `hidden` attribute back so the banner is no longer visible.
   * - Clears innerHTML to remove the previous message and dismiss button.
   *
   * @returns {void}
   */
  dismiss() {
    const banner = document.getElementById("notification-banner");
    if (!banner) {
      return;
    }

    banner.setAttribute("hidden", "");
    banner.innerHTML = "";
  },
};

// ---------------------------------------------------------------------------
// ConfirmationDialog
// Lightweight modal to confirm deletions (Requirement 3.2).
// Binds to <dialog id="confirm-dialog"> which must exist in the DOM.
//
// Usage:
//   ConfirmationDialog.show("Delete this?", () => doDelete(), () => {});
//   ConfirmationDialog.hide();
// ---------------------------------------------------------------------------

const ConfirmationDialog = (() => {
  /** @type {(() => void) | null} Callback fired when the user confirms. */
  let _onConfirm = null;

  /** @type {(() => void) | null} Callback fired when the user cancels. */
  let _onCancel = null;

  // ----- Internal event handlers (stored as named refs so they can be removed) -----

  /** Handle the Confirm button click and Enter key: call onConfirm then hide. */
  function _handleConfirm() {
    const cb = _onConfirm;
    ConfirmationDialog.hide();
    if (typeof cb === "function") {
      cb();
    }
  }

  /** Handle the Cancel button click and native dialog cancel event: call onCancel then hide. */
  function _handleCancel() {
    const cb = _onCancel;
    ConfirmationDialog.hide();
    if (typeof cb === "function") {
      cb();
    }
  }

  /**
   * Keydown listener attached to the dialog element while it is open.
   * - Enter  → confirm
   * - Escape is handled via the native `cancel` event (see show()).
   *
   * @param {KeyboardEvent} e
   */
  function _handleKeydown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      _handleConfirm();
    }
  }

  /**
   * Native `cancel` event fired by the browser when Escape is pressed while
   * a <dialog> is open.  We preventDefault to stop the browser closing the
   * dialog before our callback runs, then delegate to _handleCancel.
   *
   * @param {Event} e
   */
  function _handleNativeCancel(e) {
    e.preventDefault();
    _handleCancel();
  }

  // ---------------------------------------------------------------------------

  return {
    /**
     * Open the confirmation dialog with the given message and register
     * one-time confirm / cancel callbacks.
     *
     * Previous listeners are always removed before new ones are attached, so
     * repeated calls to show() never stack handlers.
     *
     * @param {string}      message    - Text to display inside the dialog.
     * @param {() => void}  onConfirm  - Called when the user confirms.
     * @param {() => void}  [onCancel] - Called when the user cancels (optional).
     * @returns {void}
     */
    show(message, onConfirm, onCancel) {
      const dialog = /** @type {HTMLDialogElement|null} */ (document.getElementById("confirm-dialog"));
      const msgEl  = document.getElementById("confirm-message");
      const yesBtn = document.getElementById("confirm-yes");
      const noBtn  = document.getElementById("confirm-no");

      if (!dialog || !msgEl || !yesBtn || !noBtn) {
        // DOM elements missing — fall back to immediate confirmation so the
        // caller's workflow is not silently blocked.
        if (typeof onConfirm === "function") {
          onConfirm();
        }
        return;
      }

      // Store callbacks at module scope so the named handler functions can reach them.
      _onConfirm = typeof onConfirm === "function" ? onConfirm : null;
      _onCancel  = typeof onCancel  === "function" ? onCancel  : null;

      // Defensively remove any leftover listeners from a previous show() call.
      yesBtn.removeEventListener("click",   _handleConfirm);
      noBtn.removeEventListener("click",    _handleCancel);
      dialog.removeEventListener("keydown", _handleKeydown);
      dialog.removeEventListener("cancel",  _handleNativeCancel);

      // Set the prompt text.
      msgEl.textContent = message;

      // Attach fresh listeners.
      yesBtn.addEventListener("click",   _handleConfirm);
      noBtn.addEventListener("click",    _handleCancel);
      dialog.addEventListener("keydown", _handleKeydown);
      dialog.addEventListener("cancel",  _handleNativeCancel);

      // Open as a modal — traps focus, adds ::backdrop, blocks page interaction.
      dialog.showModal();
    },

    /**
     * Close the dialog and tear down all event listeners added by show().
     * Safe to call even if the dialog is already closed.
     *
     * @returns {void}
     */
    hide() {
      const dialog = /** @type {HTMLDialogElement|null} */ (document.getElementById("confirm-dialog"));
      const yesBtn = document.getElementById("confirm-yes");
      const noBtn  = document.getElementById("confirm-no");

      // Remove listeners before closing so they cannot fire during teardown.
      if (yesBtn) yesBtn.removeEventListener("click",   _handleConfirm);
      if (noBtn)  noBtn.removeEventListener("click",    _handleCancel);
      if (dialog) {
        dialog.removeEventListener("keydown", _handleKeydown);
        dialog.removeEventListener("cancel",  _handleNativeCancel);
        // dialog.close() is a no-op when the dialog is already closed.
        dialog.close();
      }

      // Clear module-level callback references.
      _onConfirm = null;
      _onCancel  = null;
    },
  };
})();

// ---------------------------------------------------------------------------
// attachFormListener
// Binds to <form id="transaction-form"> and handles the submit event.
// Validates input, adds to store, re-renders UI, or surfaces errors.
// Called by initApp (task 9.3) during application initialisation.
// ---------------------------------------------------------------------------

/**
 * Attach the `submit` event listener to `#transaction-form`.
 *
 * Flow:
 *  1. Prevent default form submission.
 *  2. Read name, amount, category from the form fields.
 *  3. Clear any inline field errors left from a previous attempt.
 *  4. Call Validator.validateTransaction({ name, amount, category }).
 *     - Invalid → write error messages into the per-field <span> elements and return.
 *  5. Call TransactionStore.add(transaction) with the validated transaction.
 *     - Storage error → call NotificationBanner.show(error, 'error') and return.
 *  6. Call Renderer.renderAll(TransactionStore.getAll()) and reset the form.
 *
 * @returns {void}
 */
function attachFormListener() {
  const form = /** @type {HTMLFormElement|null} */ (document.getElementById("transaction-form"));
  if (!form) {
    return;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    // --- Read field values ---
    const nameInput     = /** @type {HTMLInputElement|null}  */ (document.getElementById("name-input"));
    const amountInput   = /** @type {HTMLInputElement|null}  */ (document.getElementById("amount-input"));
    const categorySelect = /** @type {HTMLSelectElement|null} */ (document.getElementById("category-select"));

    const name     = nameInput     ? nameInput.value     : "";
    const amount   = amountInput   ? amountInput.value   : "";
    const category = categorySelect ? categorySelect.value : "";

    // --- Clear previous inline errors ---
    const nameErrorEl     = document.getElementById("name-error");
    const amountErrorEl   = document.getElementById("amount-error");
    const categoryErrorEl = document.getElementById("category-error");

    if (nameErrorEl)     nameErrorEl.textContent     = "";
    if (amountErrorEl)   amountErrorEl.textContent   = "";
    if (categoryErrorEl) categoryErrorEl.textContent = "";

    // --- Validate ---
    const validation = Validator.validateTransaction({ name, amount, category });

    if (!validation.valid) {
      // Write per-field error messages into the companion <span> elements
      const { errors } = validation;
      if (errors.name     && nameErrorEl)     nameErrorEl.textContent     = errors.name;
      if (errors.amount   && amountErrorEl)   amountErrorEl.textContent   = errors.amount;
      if (errors.category && categoryErrorEl) categoryErrorEl.textContent = errors.category;
      return;
    }

    // --- Persist ---
    const storeResult = TransactionStore.add(validation.transaction);

    if (!storeResult.ok) {
      NotificationBanner.show(storeResult.error, "error");
      return;
    }

    // --- Success: re-render and reset ---
    Renderer.renderAll(TransactionStore.getAll());
    form.reset();
  });
}

// ---------------------------------------------------------------------------
// attachDeleteListener
// Attaches a delegated click listener on #transaction-list to handle delete
// button clicks. Uses event delegation so it works for dynamically rendered
// list items (Requirements 3.1–3.6).
// ---------------------------------------------------------------------------

/**
 * Attach a single delegated `click` listener to the `#transaction-list`
 * element. When a `.btn-delete` button (or its descendant) is clicked:
 *   1. Reads `data-id` from the button.
 *   2. Opens a ConfirmationDialog asking the user to confirm deletion.
 *   3. On confirm: calls `TransactionStore.remove(id)`.
 *      - If the store returns `{ ok: false }`, shows the error via
 *        `NotificationBanner.show(error, 'error')`.
 *      - Otherwise re-renders everything via `Renderer.renderAll`.
 *   4. On cancel: no-op.
 *
 * Safe to call even if the container element is absent — returns early.
 *
 * @returns {void}
 */
function attachDeleteListener() {
  const list = document.getElementById("transaction-list");
  if (!list) {
    return;
  }

  list.addEventListener("click", (event) => {
    // Walk up from the actual click target to find a .btn-delete ancestor.
    // This handles clicks on child elements inside the button.
    const btn = /** @type {Element} */ (event.target).closest(".btn-delete");
    if (!btn) {
      return; // Click was not on or inside a delete button — ignore.
    }

    const id = btn.getAttribute("data-id");
    if (!id) {
      return; // No id attribute — nothing to delete.
    }

    /** Called when the user confirms deletion in the dialog. */
    function onConfirm() {
      const result = TransactionStore.remove(id);
      if (!result.ok) {
        NotificationBanner.show(result.error, "error");
      } else {
        Renderer.renderAll(TransactionStore.getAll());
      }
    }

    // onCancel is a deliberate no-op.
    ConfirmationDialog.show("Delete this transaction?", onConfirm, () => {});
  });
}

// ---------------------------------------------------------------------------
// initApp
// Application entry point. Wires up event listeners, loads persisted data,
// surfaces any storage issues via NotificationBanner, then renders the UI.
// Requirements: 2.4, 2.5, 6.3, 6.4, 6.5
// ---------------------------------------------------------------------------

/**
 * Initialise the Expense & Budget Visualizer application.
 *
 * Steps:
 *  1. Attach form and delete event listeners.
 *  2. Load transactions from Local Storage via TransactionStore.load().
 *     - { ok: false }          → show an error banner (Req 2.5).
 *     - { ok: true, skipped }  → if skipped > 0, show a warning banner (Req 6.4).
 *  3. Render the full UI with whatever valid transactions were loaded (Req 2.4).
 *
 * @returns {void}
 */
function initApp() {
  // Wire up interactive event handlers first so the UI is immediately responsive.
  attachFormListener();
  attachDeleteListener();

  // Load persisted transactions from Local Storage.
  const result = TransactionStore.load();

  if (!result.ok) {
    // Storage could not be read — inform the user and start with zero transactions.
    NotificationBanner.show(
      "Could not load transaction history. Starting fresh.",
      "error"
    );
  } else if (result.skipped > 0) {
    // Some records were invalid and were silently dropped during load.
    NotificationBanner.show(
      `${result.skipped} record(s) could not be loaded and were skipped.`,
      "warning"
    );
  }

  // Render whatever valid transactions are now in memory (may be empty).
  Renderer.renderAll(TransactionStore.getAll());
}

document.addEventListener("DOMContentLoaded", initApp);

// ---------------------------------------------------------------------------
// Exports (future modules will import from here)
// ---------------------------------------------------------------------------
export { LocalStorageAdapter, STORAGE_KEY, Validator, VALID_CATEGORIES, TransactionStore, PieChart, Renderer, NotificationBanner, ConfirmationDialog, attachFormListener, attachDeleteListener, initApp };
