Sangareddy

# PURE Energy - Dealer Lead Router MIS

Production-ready Lead Management & Regional Dealer Routing System built for PURE Energy (PURE EV). Automates customer lead intake, duplicate prevention, regional dealer routing by pincode prefixes, real-time analytics, and legacy dataset reconciliation.

---

## 1. How to Run

### Prerequisites
- **Node.js** (v16+)
- **Python 3.8+** (for legacy data migration and reconciliation script)

### Step 1: Start the Web Application (Part A)
```bash
# Install dependencies
npm install

# Start the application server
npm start
```
Open your browser and navigate to:
**`http://localhost:3000`**

The server serves the responsive MIS frontend and provides REST endpoints for lead intake, duplicate phone checking, dealer lookup, and lead status updates. It automatically operates with Firestore integration when credentials are configured, with seamless JSON local persistence fallback.

### Step 2: Run the Legacy Lead Ingestion Pipeline (Part B)
```bash
# Execute the cleaning, reconciliation, and import script
python import_legacy_leads.py
```
This processes `data/legacy_leads.csv`, cleans and validates records, merges duplicates, routes leads to regional dealers from `data/dealers.csv`, imports eligible records into Firestore, and outputs the audit report to:
`reports/reconciliation.csv`

---

## 2. Key Assumptions

1. **Dealer Routing Logic:**
   - Lead routing is based on the first 3 digits of the 6-digit Indian PIN code matching dealer prefixes in `dealers.csv`.
   - Any valid PIN code whose prefix is not mapped to an active regional dealer is assigned to **"In-house Sales" (Headquarters)**.

2. **Lead Uniqueness:**
   - A customer's phone number represents their primary identifier. To prevent duplicate follow-ups, duplicate phone submissions are blocked atomically.

3. **Status Lifecycle:**
   - Standard lead statuses are: `New`, `Contacted`, `Converted`, `Lost`. Status transitions are tracked in real-time.

4. **Date Normalization:**
   - All dates are normalized to the ISO standard `YYYY-MM-DD`.
   - Dates formatted as `DD/MM/YYYY` are transformed to `YYYY-MM-DD`.

5. **Authentication:**
   - As per requirements, no login page is required for the internal MIS operational portal.

---

## 3. Data Problems Found in `legacy_leads.csv`

During the execution and analysis of `data/legacy_leads.csv`, 8 distinct data quality issues were identified across the 40 records:

1. **Missing Customer Name:**
   - `L1026` had an empty customer name. 
   - *Action:* **Rejected** (Name is mandatory).

2. **Invalid Phone Number Lengths:**
   - `L1009` contained `12345` (only 5 digits).
   - *Action:* **Rejected** (Mobile must be exactly 10 digits).

3. **Malformed Phone Number Formats:**
   - `L1004` had extra spaces (`98480 22 431`).
   - `L1006` included country prefix and hyphens (`+91-9000012345`).
   - *Action:* **Fixed** by stripping whitespaces, non-numeric characters, and country codes to yield valid 10-digit numbers.

4. **Invalid PIN Code Lengths:**
   - `L1012` contained `5000` (4 digits instead of 6).
   - *Action:* **Rejected** (PIN codes must strictly be 6 digits).

5. **Impossible Calendar Dates:**
   - `L1018` contained `31/09/2026` (September only has 30 days).
   - *Action:* **Fixed** by clamping to the last valid day of the month (`2026-09-30`).

6. **Inconsistent Casing & Formatting:**
   - `L1023`: Product entered as `"Pure power 5 kwh"` -> **Fixed** to canonical `"PuREPower Home 5kWh"`.
   - `L1028`: Source entered in lowercase `"website"` -> **Fixed** to title case `"Website"`.
   - `L1020`: Status entered with trailing spaces `"converted "` -> **Fixed** to `"Converted"`.

7. **Out-of-Coverage PIN Code (No Matching Dealer):**
   - `L1015` used PIN code `110001` (Delhi prefix `110`), which has no regional dealer in Telangana / Andhra Pradesh.
   - *Action:* Assigned to **"In-house Sales" (Headquarters)**.

8. **Duplicate Customer Records & Confirmed Resubmissions:**
   - `L1036`: Resubmission of `9565623510` (Original: `L1003`).
   - `L1037`: Resubmission with country prefix `+91 9633021001` (Original: `L1010`).
   - `L1038`: Uppercase customer name `SATISH P` with same phone (Original: `L1031`).
   - `L1039`: Duplicate entry for `9680557051` (Original: `L1007`).
   - Row 41 re-used lead ID `L1033` with phone `9663925448` (Original: `L1013`).
   - *Action:* **Merged** with the original lead record; duplicate entries excluded from redundant re-import.
  
<img width="1878" height="868" alt="image" src="https://github.com/user-attachments/assets/d1f58c91-f14b-495c-8580-cb5e31145247" />
<img width="1902" height="895" alt="image" src="https://github.com/user-attachments/assets/29f5fdb2-28bc-407b-a27d-f7a21a8ca0cd" />
<img width="1891" height="906" alt="image" src="https://github.com/user-attachments/assets/ef2a89f6-30bb-4b48-8835-93afe8d69ad2" />
<img width="1880" height="875" alt="image" src="https://github.com/user-attachments/assets/4060507a-c59c-46d4-95ee-ee7cd3141102" />
<img width="1920" height="887" alt="image" src="https://github.com/user-attachments/assets/c5a7ec9f-e7f6-4ba0-ab2f-64ed4a475ffc" />
<img width="1821" height="853" alt="image" src="https://github.com/user-attachments/assets/341373af-f17f-43e1-b17c-8059dcca8f07" />
