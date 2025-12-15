/**
 * AXIOM PLATFORM NAVIGATION BLUEPRINT
 * Single Source of Truth for "Where", "How", and "What" questions.
 */

export const PLATFORM_BLUEPRINT = `
PLATFORM NAVIGATION BLUEPRINT

SECTION 1: OVERALL PLATFORM STRUCTURE

1. Dashboard
   • Purpose: Executive overview of school health.
   • Access: Principal, Accountant.
   • Actions: View real-time stats (Students, Staff, Income, Expenses, Net Profit). View recent payments and pending fees.
   • Decisions: Identify fee collection gaps, monitor expense trends, check daily profitability.

2. Students
   • Purpose: Central registry for all student records.
   • Access: Principal, Accountant, Cashier, Teacher (View Only).
   • Actions: View, Add, Edit, Delete, Batch Import, Bulk Edit.
   • Key Data: Name, Class, Fee Type, Guardian Contact, Payment Status.

3. Staff
   • Purpose: Employee management and payroll tracking.
   • Access: Principal Only.
   • Actions: Add new staff, Edit details, Delete records, View salary info.
   • Privacy: Salary data is visible only to Principals.

4. Payments
   • Purpose: Record fee collections.
   • Access: Principal, Accountant, Cashier.
   • Actions: Record new payment, View history, Download receipts.
   • Note: You generally record a payment for a specific student here.

5. Expenses
   • Purpose: Track operational costs (Salaries, Maintenance, Utilities).
   • Access: Principal, Accountant.
   • Actions: Log new expense, details, delete entry.

6. Attendance
   • Purpose: Track daily student presence.
   • Access: Principal, Teacher.
   • Actions: Mark today's attendance, View monthly history.
   • Note: Teachers can only mark their own assigned classes or all if allowed.

7. Remaining Fees (Pending Fees)
   • Purpose: Dedicated list of defaulters.
   • Access: Principal, Accountant, Cashier.
   • Actions: Filter by class, Send WhatsApp reminders (if integration active), View total dues.

8. Reports
   • Purpose: Deep dive analytics.
   • Access: Principal, Accountant.
   • Actions: Export data, View long-term trends.

9. AI Assistant (Super AI)
   • Purpose: You are here. Ask questions, analyze data, draft content.
   • Access: Principal Only.

SECTION 2: PAGE-BY-PAGE NAVIGATION

[STUDENTS PAGE]
• Location: Sidebar → Students
• How to ADD a student: Click blue "+" button (top right) → Fill "Add Student" form → Click "Add Student".
• How to EDIT a student: Find row → Click "Edit" icon (pencil) → Update details → Click "Save".
• How to DELETE a student: Find row → Click "Trash" icon → Confirm warning.
• How to BULK EDIT: Click "Bulk Edit" button → Make changes in grid → Save.

[STAFF PAGE]
• Location: Sidebar → Staff
• How to ADD staff: Click "Add Staff" → Fill details (Name, Role, Salary) → Save.
• How to MANAGE SALARIES: Salary is part of the staff profile. Edit the staff member to change salary.

[ATTENDANCE PAGE]
• Location: Sidebar → Attendance
• How to MARK attendance: Select DATE → Select CLASS → Click checkboxes for ABSENT students → Click "Save Attendance".
• Note: default is "Present". You uncheck for "Absent" (or check for absent depending on UI toggle). Verify strictly on screen.

[PAYMENTS PAGE]
• Location: Sidebar → Payments
• How to COLLECT fees: Click "New Payment" → Select Student → Enter Amount → Select Method (Cash/UPI) → Save.
• Receipt: Automatically generated upon saving.

[EXPENSES PAGE]
• Location: Sidebar → Expenses
• How to LOG expense: Click "Add Expense" → Enter Title, Amount, Category, Date → Save.

SECTION 3: COMMON PRINCIPAL QUESTIONS → WHERE TO GO

"How do I check today’s attendance?"
→ Go to Sidebar → Attendance. Select Today's Date. Select the Class you want to check.

"How do I add a new teacher?"
→ Go to Sidebar → Staff. Click the "Add Staff" button on the top right.

"How do I see pending fees?"
→ Go to Sidebar → Remaining Fees. This list shows all students with outstanding balances.

"How do I see our profit?"
→ Go to Sidebar → Dashboard. Look for the "Net Profit" card in the top row.

"How can I download a report?"
→ Go to Sidebar → Reports. Select the report type. Click "Export" or "Download".

"Where do I change the fee structure?"
→ Fee structure is currently defined per student in the Students page, or via bulk edit. (Check Settings if global structure exists).

SECTION 4: PERMISSIONS & LIMITS

[PRINCIPAL]
• Power Level: Unlimited.
• Can View: Everything.
• Can Edit: Everything.
• Can Delete: Everything (Use caution).

[TEACHER]
• Power Level: Restricted.
• Can View: Attendance, My Classes, Students (limited).
• Can Edit: Attendance (for their classes).
• Cannot: See Salaries, See School Financials, Edit Fees.

[ACCOUNTANT]
• Power Level: Financial.
• Can View: Students, Payments, Expenses, Reports.
• Can Edit: Payments, Expenses, Student Fees.
• Cannot: Delete Students (usually restricted), Manage Staff.

[CASHIER]
• Power Level: Transactional.
• Can: Collect Fees, View Students.
• Cannot: Edit past records, View Profit/Loss.

SECTION 5: LANGUAGE & TERMINOLOGY

• "Class": Refers to the academic Grade (e.g., Class 10, Class 5).
• "Section": sub-division (e.g., Class 10-A). Currently implied in class name or separate field.
• "Staff": Includes Teachers, Admins, Helpers.
• "Guardian": Parent or local guardian responsible for fees.
• "Fee Type": Currently supports "Monthly" or "Annually".
• "Join Date": The day the student was admitted (affects reports).

WARNING: If a user asks for an action NOT listed here (e.g., "Change School Logo", "Edit CSS"), verify if it exists in Settings. If not found in this document:
RESPONSE: "This action isn’t documented in the Platform Blueprint yet."
`;
