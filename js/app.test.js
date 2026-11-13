/**
 * Unit and property-based tests for the Expense & Budget Visualizer core data layer.
 * Covers: LocalStorageAdapter, Validator, TransactionStore
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fc from "fast-check";
import {
  LocalStorageAdapter,
  STORAGE_KEY,
  Validator,
  VALID_CATEGORIES,
  TransactionStore,
} from "./app.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid Transaction object (without hitting crypto). */
function makeTransaction(overrides = {}) {
  return {
    id: "test-uuid-" + Math.random().toString(36).slice(2),
    name: "Coffee",
    amount: 5.5,
    category: "Food",
    createdAt: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// LocalStorageAdapter
// ---------------------------------------------------------------------------

describe("LocalStorageAdapter", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("save", () => {
    it("returns { ok: true } and writes JSON to the correct key", () => {
      const tx = makeTransaction();
      const result = LocalStorageAdapter.save([tx]);
      expect(result.ok).toBe(true);
      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe(tx.id);
    });

    it("returns { ok: true } when saving an empty array", () => {
      const result = LocalStorageAdapter.save([]);
      expect(result.ok).toBe(true);
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toEqual([]);
    });

    it("returns { ok: false, error } when localStorage.setItem throws", () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
      const result = LocalStorageAdapter.save([makeTransaction()]);
      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
      vi.restoreAllMocks();
    });
  });

  describe("load", () => {
    it("returns { ok: true, data: [] } when key is absent", () => {
      const result = LocalStorageAdapter.load();
      expect(result.ok).toBe(true);
      expect(result.data).toEqual([]);
    });

    it("returns { ok: true, data: [...] } with stored records", () => {
      const tx = makeTransaction();
      localStorage.setItem(STORAGE_KEY, JSON.stringify([tx]));
      const result = LocalStorageAdapter.load();
      expect(result.ok).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(tx.id);
    });

    it("returns { ok: false } when stored JSON is malformed", () => {
      localStorage.setItem(STORAGE_KEY, "{ not valid json }");
      const result = LocalStorageAdapter.load();
      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it("returns { ok: false } when stored value is not an array", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: "bar" }));
      const result = LocalStorageAdapter.load();
      expect(result.ok).toBe(false);
    });

    it("returns { ok: false } when localStorage.getItem throws", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("SecurityError");
      });
      const result = LocalStorageAdapter.load();
      expect(result.ok).toBe(false);
      vi.restoreAllMocks();
    });
  });
});

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

describe("Validator", () => {
  // ---- validateName ----

  describe("validateName", () => {
    it("accepts a normal name", () => {
      expect(Validator.validateName("Coffee at Starbucks").valid).toBe(true);
    });

    it("accepts a single-character name", () => {
      expect(Validator.validateName("A").valid).toBe(true);
    });

    it("accepts a name that is exactly 100 characters", () => {
      expect(Validator.validateName("x".repeat(100)).valid).toBe(true);
    });

    it("rejects an empty string", () => {
      const r = Validator.validateName("");
      expect(r.valid).toBe(false);
      expect(r.message).toBeTruthy();
    });

    it("rejects a whitespace-only string", () => {
      expect(Validator.validateName("   ").valid).toBe(false);
    });

    it("rejects a name that is 101 characters", () => {
      expect(Validator.validateName("x".repeat(101)).valid).toBe(false);
    });

    it("rejects a non-string value", () => {
      expect(Validator.validateName(42).valid).toBe(false);
    });

    it("rejects null", () => {
      expect(Validator.validateName(null).valid).toBe(false);
    });

    // Property 4: Validation rejects invalid names
    it("property: rejects empty and whitespace-only names", () => {
      // Feature: expense-budget-visualizer, Property 4: Validation rejects bad names
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(""),
            fc.string({ maxLength: 20 }).map((s) => s.replace(/\S/g, " ")).filter((s) => s.trim() === "")
          ),
          (name) => {
            return Validator.validateName(name).valid === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    it("property: rejects names longer than 100 chars", () => {
      // Feature: expense-budget-visualizer, Property 4: Validation rejects bad names
      fc.assert(
        fc.property(
          fc.string({ minLength: 101, maxLength: 200 }),
          (name) => {
            return Validator.validateName(name).valid === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    it("property: accepts valid names (1-100 non-whitespace chars)", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length >= 1),
          (name) => {
            return Validator.validateName(name).valid === true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ---- validateAmount ----

  describe("validateAmount", () => {
    it("accepts a normal positive amount", () => {
      expect(Validator.validateAmount(10).valid).toBe(true);
    });

    it("accepts the minimum valid amount 0.01", () => {
      expect(Validator.validateAmount(0.01).valid).toBe(true);
      expect(Validator.validateAmount("0.01").valid).toBe(true);
    });

    it("accepts the maximum valid amount 999999999.99", () => {
      expect(Validator.validateAmount(999999999.99).valid).toBe(true);
    });

    it("accepts integer amounts", () => {
      expect(Validator.validateAmount(100).valid).toBe(true);
    });

    it("accepts string representations of valid amounts", () => {
      expect(Validator.validateAmount("25.50").valid).toBe(true);
    });

    it("rejects zero", () => {
      expect(Validator.validateAmount(0).valid).toBe(false);
    });

    it("rejects negative numbers", () => {
      expect(Validator.validateAmount(-5).valid).toBe(false);
    });

    it("rejects amount greater than 999999999.99", () => {
      expect(Validator.validateAmount(1000000000).valid).toBe(false);
    });

    it("rejects an amount with 3 decimal places", () => {
      expect(Validator.validateAmount(1.001).valid).toBe(false);
      expect(Validator.validateAmount("1.001").valid).toBe(false);
    });

    it("rejects non-numeric string", () => {
      expect(Validator.validateAmount("abc").valid).toBe(false);
    });

    it("rejects an empty string", () => {
      expect(Validator.validateAmount("").valid).toBe(false);
    });

    it("rejects null", () => {
      expect(Validator.validateAmount(null).valid).toBe(false);
    });

    it("rejects undefined", () => {
      expect(Validator.validateAmount(undefined).valid).toBe(false);
    });

    it("rejects boolean", () => {
      expect(Validator.validateAmount(true).valid).toBe(false);
    });

    // Property 3: Validation rejects out-of-range amounts
    it("property: rejects values ≤ 0", () => {
      // Feature: expense-budget-visualizer, Property 3: Validation rejects bad amounts
      fc.assert(
        fc.property(
          fc.oneof(
            fc.float({ max: 0, noNaN: true }),
            fc.constant(0)
          ),
          (val) => {
            return Validator.validateAmount(val).valid === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    it("property: rejects values greater than 999999999.99", () => {
      // Feature: expense-budget-visualizer, Property 3: Validation rejects bad amounts
      fc.assert(
        fc.property(
          fc.float({ min: 1000000000, noNaN: true }),
          (val) => {
            return Validator.validateAmount(val).valid === false;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ---- validateCategory ----

  describe("validateCategory", () => {
    it.each(VALID_CATEGORIES)("accepts '%s'", (cat) => {
      expect(Validator.validateCategory(cat).valid).toBe(true);
    });

    it("rejects an unknown category string", () => {
      expect(Validator.validateCategory("Entertainment").valid).toBe(false);
    });

    it("rejects an empty string", () => {
      expect(Validator.validateCategory("").valid).toBe(false);
    });

    it("rejects null", () => {
      expect(Validator.validateCategory(null).valid).toBe(false);
    });

    it("rejects undefined", () => {
      expect(Validator.validateCategory(undefined).valid).toBe(false);
    });

    it("is case-sensitive — rejects 'food' (lowercase)", () => {
      expect(Validator.validateCategory("food").valid).toBe(false);
    });
  });

  // ---- validateTransaction ----

  describe("validateTransaction", () => {
    it("returns { valid: true, transaction } for a fully valid input", () => {
      const result = Validator.validateTransaction({
        name: "Lunch",
        amount: "12.50",
        category: "Food",
      });
      expect(result.valid).toBe(true);
      expect(result.transaction).toMatchObject({
        name: "Lunch",
        amount: 12.5,
        category: "Food",
      });
      expect(typeof result.transaction.id).toBe("string");
      expect(typeof result.transaction.createdAt).toBe("number");
    });

    it("trims the name in the resulting transaction", () => {
      const result = Validator.validateTransaction({
        name: "  Bus Ride  ",
        amount: "2.00",
        category: "Transport",
      });
      expect(result.valid).toBe(true);
      expect(result.transaction.name).toBe("Bus Ride");
    });

    it("returns { valid: false, errors } when name is invalid", () => {
      const result = Validator.validateTransaction({
        name: "",
        amount: "10",
        category: "Fun",
      });
      expect(result.valid).toBe(false);
      expect(result.errors.name).toBeTruthy();
    });

    it("returns { valid: false, errors } when amount is invalid", () => {
      const result = Validator.validateTransaction({
        name: "Movie",
        amount: "-1",
        category: "Fun",
      });
      expect(result.valid).toBe(false);
      expect(result.errors.amount).toBeTruthy();
    });

    it("returns { valid: false, errors } when category is invalid", () => {
      const result = Validator.validateTransaction({
        name: "Movie",
        amount: "15",
        category: "Sports",
      });
      expect(result.valid).toBe(false);
      expect(result.errors.category).toBeTruthy();
    });

    it("collects all field errors at once", () => {
      const result = Validator.validateTransaction({
        name: "",
        amount: "0",
        category: "",
      });
      expect(result.valid).toBe(false);
      expect(result.errors.name).toBeTruthy();
      expect(result.errors.amount).toBeTruthy();
      expect(result.errors.category).toBeTruthy();
    });

    it("handles null/undefined fields argument gracefully", () => {
      const result = Validator.validateTransaction(null);
      expect(result.valid).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// TransactionStore
// ---------------------------------------------------------------------------

describe("TransactionStore", () => {
  /**
   * Reset the store to empty before each test by reloading with a fresh
   * localStorage state.
   */
  beforeEach(() => {
    localStorage.clear();
    // Load from empty storage to reset the in-memory array.
    TransactionStore.load();
  });

  describe("add", () => {
    it("returns { ok: true } and store contains the new transaction", () => {
      const tx = makeTransaction();
      const result = TransactionStore.add(tx);
      expect(result.ok).toBe(true);
      const all = TransactionStore.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe(tx.id);
    });

    it("prepends: most recently added transaction is at index 0", () => {
      const tx1 = makeTransaction({ id: "id-1", name: "First" });
      const tx2 = makeTransaction({ id: "id-2", name: "Second" });
      TransactionStore.add(tx1);
      TransactionStore.add(tx2);
      const all = TransactionStore.getAll();
      expect(all[0].id).toBe("id-2");
      expect(all[1].id).toBe("id-1");
    });

    it("persists to localStorage after add", () => {
      const tx = makeTransaction();
      TransactionStore.add(tx);
      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).not.toBeNull();
      const stored = JSON.parse(raw);
      expect(stored.some((r) => r.id === tx.id)).toBe(true);
    });

    it("does NOT modify in-memory state when localStorage.setItem throws", () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
      const before = TransactionStore.getAll().length;
      const tx = makeTransaction();
      const result = TransactionStore.add(tx);
      expect(result.ok).toBe(false);
      expect(TransactionStore.getAll().length).toBe(before);
      vi.restoreAllMocks();
    });
  });

  describe("remove", () => {
    it("removes a transaction by id", () => {
      const tx = makeTransaction({ id: "del-me" });
      TransactionStore.add(tx);
      expect(TransactionStore.getAll()).toHaveLength(1);

      const result = TransactionStore.remove("del-me");
      expect(result.ok).toBe(true);
      expect(TransactionStore.getAll()).toHaveLength(0);
    });

    it("is idempotent — returns { ok: true } when id is not found", () => {
      const result = TransactionStore.remove("does-not-exist");
      expect(result.ok).toBe(true);
    });

    it("persists the updated array to localStorage after remove", () => {
      const tx = makeTransaction({ id: "rm-persist" });
      TransactionStore.add(tx);
      TransactionStore.remove("rm-persist");
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      expect(stored.some((r) => r.id === "rm-persist")).toBe(false);
    });

    it("restores the item in memory when localStorage.setItem throws during remove", () => {
      const tx = makeTransaction({ id: "restore-me" });
      TransactionStore.add(tx);

      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

      const result = TransactionStore.remove("restore-me");
      expect(result.ok).toBe(false);
      // In-memory state should be restored
      const all = TransactionStore.getAll();
      expect(all.some((t) => t.id === "restore-me")).toBe(true);
      vi.restoreAllMocks();
    });
  });

  describe("getAll", () => {
    it("returns a shallow copy, not the internal array reference", () => {
      const tx = makeTransaction();
      TransactionStore.add(tx);
      const copy1 = TransactionStore.getAll();
      copy1.push(makeTransaction({ id: "injected" }));
      const copy2 = TransactionStore.getAll();
      expect(copy2.some((t) => t.id === "injected")).toBe(false);
    });

    it("returns an empty array when store is empty", () => {
      expect(TransactionStore.getAll()).toEqual([]);
    });
  });

  describe("load", () => {
    it("hydrates in-memory array from localStorage", () => {
      const tx = makeTransaction({ id: "hydrate-me" });
      localStorage.setItem(STORAGE_KEY, JSON.stringify([tx]));
      const result = TransactionStore.load();
      expect(result.ok).toBe(true);
      expect(result.skipped).toBe(0);
      expect(TransactionStore.getAll()[0].id).toBe("hydrate-me");
    });

    it("skips invalid records and reports the count", () => {
      const valid = makeTransaction({ id: "valid-1" });
      const invalid = { id: "", name: null, amount: -1, category: "Unknown", createdAt: "bad" };
      localStorage.setItem(STORAGE_KEY, JSON.stringify([valid, invalid]));

      const result = TransactionStore.load();
      expect(result.ok).toBe(true);
      expect(result.skipped).toBe(1);
      const all = TransactionStore.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe("valid-1");
    });

    it("skips ALL records when every record is invalid", () => {
      const bad = [
        { id: null },
        { name: 123, amount: "nope" },
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bad));
      const result = TransactionStore.load();
      expect(result.ok).toBe(true);
      expect(result.skipped).toBe(2);
      expect(TransactionStore.getAll()).toEqual([]);
    });

    it("returns { ok: false } when localStorage.getItem throws", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("SecurityError");
      });
      const result = TransactionStore.load();
      expect(result.ok).toBe(false);
      vi.restoreAllMocks();
    });

    it("returns { ok: true, data: [] } and empty store when storage is empty", () => {
      const result = TransactionStore.load();
      expect(result.ok).toBe(true);
      expect(result.skipped).toBe(0);
      expect(TransactionStore.getAll()).toEqual([]);
    });

    // Property 1: Transaction persistence round-trip
    it("property: valid transactions survive a save → load round-trip", () => {
      // Feature: expense-budget-visualizer, Property 1: Persistence round-trip
      fc.assert(
        fc.property(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length >= 1),
            amount: fc
              .float({ min: 0.01, max: 999999999.99, noNaN: true })
              .map((n) => Math.round(n * 100) / 100)
              .filter((n) => n > 0 && n <= 999999999.99),
            category: fc.constantFrom("Food", "Transport", "Fun"),
          }),
          ({ name, amount, category }) => {
            localStorage.clear();
            const id = `prop-${Math.random()}`;
            const tx = { id, name: name.trim(), amount, category, createdAt: Date.now() };

            LocalStorageAdapter.save([tx]);
            const loaded = LocalStorageAdapter.load();

            if (!loaded.ok) return false;
            const found = loaded.data.find((r) => r.id === id);
            if (!found) return false;
            return (
              found.name === tx.name &&
              found.amount === tx.amount &&
              found.category === tx.category
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    // Property 8: Invalid records are skipped on load
    it("property: exactly the valid records are hydrated after load", () => {
      // Feature: expense-budget-visualizer, Property 8: Invalid records skipped on load
      const validRecordArb = fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length >= 1),
        amount: fc
          .float({ min: 0.01, max: 999999999.99, noNaN: true })
          .map((n) => Math.round(n * 100) / 100)
          .filter((n) => n > 0 && n <= 999999999.99),
        category: fc.constantFrom("Food", "Transport", "Fun"),
        createdAt: fc.integer({ min: 0 }),
      });

      const invalidRecordArb = fc.oneof(
        fc.constant(null),
        fc.constant({}),
        fc.record({ id: fc.constant(""), name: fc.string(), amount: fc.constant(-1), category: fc.constant("Bad"), createdAt: fc.constant(0) }),
      );

      fc.assert(
        fc.property(
          fc.array(validRecordArb, { minLength: 0, maxLength: 5 }),
          fc.array(invalidRecordArb, { minLength: 0, maxLength: 5 }),
          (validRecords, invalidRecords) => {
            // Interleave valid and invalid records randomly
            const mixed = [...validRecords, ...invalidRecords].sort(() => Math.random() - 0.5);
            localStorage.clear();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(mixed));

            const result = TransactionStore.load();
            if (!result.ok) return false;

            expect(result.skipped).toBe(invalidRecords.length);
            expect(TransactionStore.getAll().length).toBe(validRecords.length);
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Property 7: Add then delete returns to original state
  describe("add + remove idempotency", () => {
    it("property: adding then removing a transaction returns to original state", () => {
      // Feature: expense-budget-visualizer, Property 7: Add-then-delete idempotence
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length >= 1),
              amount: fc
                .float({ min: 0.01, max: 999999999, noNaN: true })
                .map((n) => Math.round(n * 100) / 100)
                .filter((n) => n > 0 && n <= 999999999.99),
              category: fc.constantFrom("Food", "Transport", "Fun"),
            }),
            { minLength: 0, maxLength: 5 }
          ),
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length >= 1),
            amount: fc
              .float({ min: 0.01, max: 999999999, noNaN: true })
              .map((n) => Math.round(n * 100) / 100)
              .filter((n) => n > 0 && n <= 999999999.99),
            category: fc.constantFrom("Food", "Transport", "Fun"),
          }),
          (initialItems, newItem) => {
            // Reset and seed store
            localStorage.clear();
            TransactionStore.load();
            for (const item of initialItems) {
              const tx = { id: `seed-${Math.random()}`, createdAt: Date.now(), ...item };
              TransactionStore.add(tx);
            }

            const originalIds = TransactionStore.getAll().map((t) => t.id).sort();
            const originalTotal = TransactionStore.getAll().reduce((s, t) => s + t.amount, 0);

            // Add new transaction and immediately remove it
            const newTx = { id: `new-${Math.random()}`, createdAt: Date.now(), ...newItem };
            TransactionStore.add(newTx);
            TransactionStore.remove(newTx.id);

            const afterIds = TransactionStore.getAll().map((t) => t.id).sort();
            const afterTotal = TransactionStore.getAll().reduce((s, t) => s + t.amount, 0);

            expect(afterIds).toEqual(originalIds);
            expect(Math.abs(afterTotal - originalTotal)).toBeLessThan(0.001);
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
