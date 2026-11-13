# Requirements Document

## Introduction

The Expense & Budget Visualizer is a client-side web application that allows users to track personal spending by adding, viewing, and deleting expense transactions. It provides an at-a-glance total balance and a pie chart showing spending distribution across categories. The application is built with HTML, CSS, and vanilla JavaScript, using the browser's Local Storage API for persistence — no backend or build toolchain required.

## Glossary

- **App**: The Expense & Budget Visualizer web application.
- **Transaction**: A single expense entry consisting of an item name, a monetary amount, and a category.
- **Category**: A classification label for a transaction. Valid values are: Food, Transport, Fun.
- **Transaction_List**: The scrollable UI component that displays all stored transactions.
- **Input_Form**: The HTML form component used to create a new transaction.
- **Balance_Display**: The UI element at the top of the page that shows the computed total of all transaction amounts.
- **Chart**: The pie chart component that visualises spending distribution by category.
- **Storage**: The browser's Local Storage API used to persist transaction data client-side.
- **Validator**: The client-side validation logic that checks Input_Form fields before submission.

---

## Requirements

### Requirement 1: Add a Transaction

**User Story:** As a user, I want to fill in a form with an item name, amount, and category so that I can record a new expense transaction.

#### Acceptance Criteria

1. THE Input_Form SHALL contain a text field for the item name (maximum 100 characters), a numeric field for the amount (accepting values from 0.01 to 999,999,999.99 with up to 2 decimal places), and a dropdown selector for the category (Food, Transport, Fun).
2. WHEN the user submits the Input_Form with all fields filled and a valid amount between 0.01 and 999,999,999.99, THE App SHALL add the new Transaction to the Transaction_List and persist it to Storage.
3. WHEN the user submits the Input_Form, THE Validator SHALL verify that the item name field is not empty and does not exceed 100 characters, the amount field contains a numeric value between 0.01 and 999,999,999.99 with no more than 2 decimal places, and a category has been selected.
4. IF the Validator detects that any required field is empty, the item name exceeds 100 characters, or the amount is outside the range 0.01–999,999,999.99, THEN THE Input_Form SHALL display an inline error message identifying the invalid field and SHALL NOT add a Transaction.
5. WHEN a Transaction is successfully added, THE Input_Form SHALL reset the item name field to empty, the amount field to empty, and the category dropdown to its unselected placeholder state.
6. IF Storage fails to persist a new Transaction, THEN THE App SHALL display an error message indicating the save was unsuccessful and SHALL NOT add the Transaction to the Transaction_List.

---

### Requirement 2: View Transaction List

**User Story:** As a user, I want to see a scrollable list of all my recorded transactions so that I can review my spending history.

#### Acceptance Criteria

1. THE Transaction_List SHALL display all stored Transactions ordered from most recently added to oldest, each showing the item name (up to 100 characters), amount formatted with a currency symbol and two decimal places (e.g., $1,234.56), and category.
2. WHEN the number of Transactions exceeds the visible area of the Transaction_List, THE Transaction_List SHALL be scrollable to reveal all entries.
3. WHEN the Storage contains no Transactions, THE Transaction_List SHALL display an empty-state message indicating that no transactions have been added yet.
4. WHEN the App is loaded or reloaded in the browser, THE Transaction_List SHALL restore and display all Transactions previously persisted to Storage.
5. IF Storage is unavailable or cannot be read when the App is loaded or reloaded, THEN THE Transaction_List SHALL display an error message indicating that transaction history could not be loaded and show zero transactions.

---

### Requirement 3: Delete a Transaction

**User Story:** As a user, I want to delete individual transactions so that I can remove incorrect or unwanted entries.

#### Acceptance Criteria

1. THE Transaction_List SHALL render a delete control (button or icon) for each Transaction entry.
2. WHEN the user activates the delete control for a Transaction, THE App SHALL display a confirmation prompt before proceeding with deletion.
3. WHEN the user confirms deletion, THE App SHALL remove that Transaction from Storage and re-render the Transaction_List without the deleted entry within 300 ms.
4. IF Storage fails to remove the Transaction, THEN THE App SHALL display an error message indicating the deletion was unsuccessful and preserve the Transaction in the Transaction_List.
5. WHEN a Transaction is deleted, THE Balance_Display SHALL update to reflect the revised total within 300 ms of the deletion being confirmed.
6. WHEN a Transaction is deleted, THE Chart SHALL update to reflect the revised category distribution within 300 ms of the deletion being confirmed.

---

### Requirement 4: Display Total Balance

**User Story:** As a user, I want to see the total of all my recorded expenses at the top of the page so that I know how much I have spent in total.

#### Acceptance Criteria

1. THE Balance_Display SHALL be positioned above the Transaction list and SHALL show the sum of all Transaction amounts as a numeric value with exactly 2 decimal places preceded by a currency symbol.
2. WHEN a Transaction is added or deleted, THE Balance_Display SHALL update to reflect the new sum of all Transaction amounts without requiring a page reload.
3. IF the Storage contains no Transactions, THEN THE Balance_Display SHALL show a total of zero displayed in the same currency format as criterion 1.

---

### Requirement 5: Visualise Spending by Category

**User Story:** As a user, I want to see a pie chart of my spending by category so that I can quickly understand where my money is going.

#### Acceptance Criteria

1. THE Chart SHALL render a pie chart where each slice's arc size is proportional to that category's share of total spending, calculated as (category sum / total sum × 360°), for each of the three categories (Food, Transport, Fun) that contain at least one Transaction.
2. WHEN a Transaction is added or deleted, THE Chart SHALL update automatically to reflect the current category distribution within 1 second without requiring a page reload.
3. WHEN only one category contains Transactions, THE Chart SHALL render a single full-circle slice for that category.
4. WHEN the Storage contains no Transactions, THE Chart SHALL display a text message indicating no data is available in place of the chart.
5. THE Chart SHALL label each slice with the category name and its percentage of total spending rounded to the nearest whole number, with all slice percentages summing to 100%.
6. IF a category contains no Transactions, THEN THE Chart SHALL omit that category's slice entirely rather than rendering a zero-value slice.

---

### Requirement 6: Persist Data Across Sessions

**User Story:** As a user, I want my transactions to be saved between browser sessions so that I do not lose my spending history when I close or refresh the page.

#### Acceptance Criteria

1. WHEN a Transaction is added, THE App SHALL write the updated Transaction collection to Storage before the next user interaction is processed.
2. WHEN a Transaction is deleted, THE App SHALL write the updated Transaction collection to Storage before the next user interaction is processed.
3. WHEN the App is initialised, THE App SHALL read all Transactions from Storage and render the Transaction_List, Balance_Display, and Chart with the retrieved data.
4. IF Storage is unavailable or returns a parse error on initialisation, THEN THE App SHALL initialise with an empty Transaction collection and display a dismissible warning message that does not obscure the main content area.
5. IF Storage contains one or more individual Transaction entries that fail schema validation on initialisation, THEN THE App SHALL skip the invalid entries, initialise with the remaining valid Transactions, and display a dismissible warning message indicating that some records could not be loaded.

---

### Requirement 7: Responsive and Accessible UI

**User Story:** As a user, I want the interface to be clean, readable, and usable across modern browsers so that I can access it on any device.

#### Acceptance Criteria

1. THE App SHALL load and function correctly in the latest stable release of Chrome, Firefox, Edge, and Safari at the time of testing.
2. THE App SHALL load all styling from a single CSS file and all client-side logic from a single JavaScript file, with no inline styles or inline scripts in the HTML.
3. THE App SHALL render Transaction data and Balance_Display values in a font size no smaller than 14 px, with a contrast ratio of at least 4.5:1 between text and its background, so that each value is visually distinct from its surrounding label or section heading.
4. WHEN the App renders on a viewport narrower than 600 px, THE App SHALL reflow the Input_Form, Transaction_List, and Chart into a single-column layout so that all interactive controls and displayed values are fully visible without horizontal scrolling.
5. THE Input_Form controls SHALL each have a programmatically associated label so that every field and button is reachable via the Tab key, receives a visible focus indicator, and is announced correctly by screen readers conforming to WCAG 2.1 Level AA.
