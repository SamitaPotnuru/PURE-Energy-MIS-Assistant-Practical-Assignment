# AI_LOG.md

## 1. AI Tools Used

- **ChatGPT / Gemini:** Used for project planning, understanding requirements, generating code suggestions, debugging, and preparing documentation.
- **Antigravity / AI-assisted coding environment:** Used to inspect project structure, implement and review the application, run validation checks, and verify reports.

## 2. Three Useful Prompts

### Prompt 1: Part A — Web Application
"Build a responsive Dealer Lead Router using React and Firebase Firestore. Include a lead entry form, mobile and pincode validation, duplicate mobile prevention, automatic dealer assignment based on pincode prefixes, dashboard analytics, and lead status updates. Do not create a login page."

### Prompt 2: Part B — Data Cleaning
"Write a Python script to clean legacy lead records from legacy_leads.csv, validate mobile numbers and pincodes, identify confirmed duplicates, assign dealers using dealers.csv, import eligible records into Firestore, and generate reports/reconciliation.csv with exactly lead_id, action, and reason columns."

### Prompt 3: Testing and Security
"Review the Dealer Lead Router for validation errors, duplicate imports, incorrect dealer assignments, Firestore security issues, and reconciliation report accuracy. Suggest fixes and test cases."

## 3. Incorrect AI Answer and Correction

**Incorrect AI answer:** An initial implementation suggestion relied only on checking for an existing mobile number in the frontend before saving a lead.

**Why it was incorrect:** Two simultaneous requests could pass the check and create duplicate records. A frontend-only check is not sufficient to guarantee duplicate prevention.

**Correction:** Use a trusted backend operation with an appropriate transaction or atomic uniqueness mechanism to enforce duplicate prevention. Validate the operation with simultaneous-submission tests and ensure Firestore rules prevent unauthorized writes.

## 4. Verification

AI-generated code and suggestions must be reviewed and tested against the actual assignment requirements and supplied CSV files before submission.
