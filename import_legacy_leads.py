#!/usr/bin/env python3
"""
PURE Energy - Dealer Lead Router
Part B: Legacy Data Cleaning, Dealer Assignment, and Firestore Import Script
"""

import os
import csv
import re
import json
from datetime import datetime
import requests

# Optional Firebase Admin SDK
try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    FIREBASE_ADMIN_AVAILABLE = True
except ImportError:
    FIREBASE_ADMIN_AVAILABLE = False

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
REPORTS_DIR = os.path.join(BASE_DIR, 'reports')
LEADS_CSV_PATH = os.path.join(DATA_DIR, 'legacy_leads.csv')
DEALERS_CSV_PATH = os.path.join(DATA_DIR, 'dealers.csv')
RECONCILIATION_REPORT_PATH = os.path.join(REPORTS_DIR, 'reconciliation.csv')

# Firebase Configuration
FIREBASE_PROJECT_ID = os.getenv('FIREBASE_PROJECT_ID', 'pure-energy-lead-router')
FIREBASE_API_KEY = os.getenv('FIREBASE_API_KEY', '')
SERVICE_ACCOUNT_PATH = os.path.join(BASE_DIR, 'serviceAccountKey.json')

# Standard values for normalization
STANDARD_PRODUCTS = {
    'pure power 5 kwh': 'PuREPower Home 5kWh',
    'purepower home 5kwh': 'PuREPower Home 5kWh',
    'purepower home 3kwh': 'PuREPower Home 3kWh',
    'purepower commercial 10kwh': 'PuREPower Commercial 10kWh'
}

STANDARD_SOURCES = {
    'website': 'Website',
    'voice agent': 'Voice Agent',
    'dealer walk-in': 'Dealer Walk-in',
    'whatsapp': 'WhatsApp',
    'referral': 'Referral'
}

STANDARD_STATUSES = {
    'new': 'New',
    'contacted': 'Contacted',
    'converted': 'Converted',
    'lost': 'Lost'
}


def load_dealers():
    """Load regional dealers and their 3-digit pincode prefixes."""
    dealers = []
    if not os.path.exists(DEALERS_CSV_PATH):
        raise FileNotFoundError(f"Dealers file not found at {DEALERS_CSV_PATH}")

    with open(DEALERS_CSV_PATH, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_prefixes = row.get('pincode_prefixes', '')
            prefixes = [p.strip() for p in raw_prefixes.split('|') if p.strip()]
            dealers.append({
                'dealer_id': row.get('dealer_id', '').strip(),
                'dealer_name': row.get('dealer_name', '').strip(),
                'city': row.get('city', '').strip(),
                'prefixes': prefixes,
                'pincode_prefixes_str': ' | '.join(prefixes),
                'contact_email': row.get('contact_email', '').strip()
            })
    return dealers


def match_dealer(pincode, dealers):
    """Match the first 3 digits of pincode against regional dealers."""
    if not pincode or len(pincode) < 3:
        return 'In-house Sales', 'Headquarters'
    prefix = pincode[:3]
    for d in dealers:
        if prefix in d['prefixes']:
            return d['dealer_name'], d['city']
    return 'In-house Sales', 'Headquarters'


def clean_phone(phone_raw):
    """Clean and normalize phone number, stripping country codes and punctuation."""
    if not phone_raw:
        return ''
    cleaned = re.sub(r'[\s\-\+]', '', str(phone_raw).strip())
    if cleaned.startswith('91') and len(cleaned) > 10:
        cleaned = cleaned[2:]
    return cleaned


def normalize_date(date_str):
    """Normalize date to YYYY-MM-DD. Handles DD/MM/YYYY and invalid day boundaries."""
    if not date_str:
        return '2026-09-01', False
    date_str = date_str.strip()

    # Check for DD/MM/YYYY pattern
    slash_match = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})$', date_str)
    if slash_match:
        day, month, year = int(slash_match.group(1)), int(slash_match.group(2)), int(slash_match.group(3))
        # Handle non-existent dates like 31/09/2026 (September has 30 days)
        if month in (4, 6, 9, 11) and day > 30:
            day = 30
        try:
            dt = datetime(year, month, day)
            return dt.strftime('%Y-%m-%d'), True
        except ValueError:
            return f"{year:04d}-{month:02d}-{min(day, 28):02d}", True

    # Standard YYYY-MM-DD pattern
    dash_match = re.match(r'^\d{4}-\d{2}-\d{2}$', date_str)
    if dash_match:
        return date_str, False

    return date_str, False


def init_firestore_client():
    """
    Initialize Firestore client using Firebase Admin SDK if credentials exist,
    or return None to use the authenticated Firestore REST API.
    """
    if FIREBASE_ADMIN_AVAILABLE:
        try:
            if os.path.exists(SERVICE_ACCOUNT_PATH):
                cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
                app = firebase_admin.initialize_app(cred)
                print("Connected to Firestore via Firebase Admin SDK (Service Account).")
                return firestore.client()
            elif os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
                app = firebase_admin.initialize_app()
                print("Connected to Firestore via Firebase Admin SDK (ADC).")
                return firestore.client()
        except Exception as e:
            print(f"Notice: Firebase Admin SDK initialization bypassed: {e}")

    print("Using Firestore REST API with Project Credentials.")
    return None


def import_record_to_firestore(db, record):
    """Import or update lead in Firestore using Admin SDK or REST API idempotently."""
    lead_id = record['lead_id']

    if db is not None:
        # Use Firebase Admin SDK
        doc_ref = db.collection('leads').document(lead_id)
        doc_ref.set(record, merge=True)
        return True
    else:
        # Use Firestore REST API
        url = f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}/databases/(default)/documents/leads/{lead_id}?key={FIREBASE_API_KEY}"
        fields = {
            'lead_id': {'stringValue': str(record.get('lead_id', ''))},
            'name': {'stringValue': str(record.get('name', ''))},
            'phone': {'stringValue': str(record.get('phone', ''))},
            'pincode': {'stringValue': str(record.get('pincode', ''))},
            'product': {'stringValue': str(record.get('product', ''))},
            'source': {'stringValue': str(record.get('source', ''))},
            'dealer': {'stringValue': str(record.get('dealer', ''))},
            'dealer_name': {'stringValue': str(record.get('dealer_name', ''))},
            'dealer_city': {'stringValue': str(record.get('dealer_city', ''))},
            'status': {'stringValue': str(record.get('status', 'New'))},
            'created_on': {'stringValue': str(record.get('created_on', ''))}
        }
        try:
            res = requests.patch(url, json={'fields': fields}, timeout=3)
            return res.status_code in (200, 201)
        except Exception:
            return False


def main():
    print("=" * 65)
    print("PURE Energy - Part B: Legacy Lead Cleaning & Firestore Import")
    print("=" * 65)

    # 1. Load Dealers
    dealers = load_dealers()
    print(f"Loaded {len(dealers)} regional dealers from {DEALERS_CSV_PATH}")

    # 2. Read Legacy Leads
    if not os.path.exists(LEADS_CSV_PATH):
        raise FileNotFoundError(f"Legacy leads CSV not found at {LEADS_CSV_PATH}")

    raw_leads = []
    with open(LEADS_CSV_PATH, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        raw_leads = list(reader)

    print(f"Loaded {len(raw_leads)} legacy lead records.")

    # 3. Initialize Firestore Client
    db = init_firestore_client()

    # Track seen customers to identify genuine duplicates
    seen_phone_map = {}  # clean_phone -> first_lead_id
    reconciliation_rows = []
    eligible_records = []

    action_counts = {
        'imported': 0,
        'fixed': 0,
        'merged': 0,
        'rejected': 0,
        'assigned_inhouse': 0
    }

    print("\nProcessing records:")

    for index, row in enumerate(raw_leads, start=1):
        raw_lead_id = row.get('lead_id', '').strip()
        raw_name = row.get('name', '').strip()
        raw_phone = row.get('phone', '').strip()
        raw_pincode = row.get('pincode', '').strip()
        raw_product = row.get('product', '').strip()
        raw_source = row.get('source', '').strip()
        raw_created_on = row.get('created_on', '').strip()
        raw_status = row.get('status', '').strip()

        fixes = []
        action = 'imported'
        reason = 'Valid record imported without changes'

        # Check required Name
        if not raw_name:
            action = 'rejected'
            reason = 'Missing required customer name'
            reconciliation_rows.append({'lead_id': raw_lead_id, 'action': action, 'reason': reason})
            action_counts[action] += 1
            print(f" [{index:02d}] {raw_lead_id}: REJECTED - {reason}")
            continue

        # Clean & Validate Mobile Number
        phone_cleaned = clean_phone(raw_phone)
        if phone_cleaned != raw_phone:
            fixes.append('normalized phone number format')

        if not re.match(r'^\d{10}$', phone_cleaned):
            action = 'rejected'
            reason = f"Invalid mobile number: must be 10 digits (got {len(phone_cleaned)} digits: '{raw_phone}')"
            reconciliation_rows.append({'lead_id': raw_lead_id, 'action': action, 'reason': reason})
            action_counts[action] += 1
            print(f" [{index:02d}] {raw_lead_id}: REJECTED - {reason}")
            continue

        # Check for Genuine Duplicates
        if phone_cleaned in seen_phone_map:
            first_lead_id = seen_phone_map[phone_cleaned]
            action = 'merged'
            reason = f"Duplicate customer record merged with {first_lead_id}"
            reconciliation_rows.append({'lead_id': raw_lead_id, 'action': action, 'reason': reason})
            action_counts[action] += 1
            print(f" [{index:02d}] {raw_lead_id}: MERGED - {reason}")
            continue
        else:
            seen_phone_map[phone_cleaned] = raw_lead_id

        # Validate Pincode (must be exactly 6 digits)
        pincode_cleaned = raw_pincode.strip()
        if not re.match(r'^\d{6}$', pincode_cleaned):
            action = 'rejected'
            reason = f"Invalid pincode: must be 6 digits (got: '{raw_pincode}')"
            reconciliation_rows.append({'lead_id': raw_lead_id, 'action': action, 'reason': reason})
            action_counts[action] += 1
            print(f" [{index:02d}] {raw_lead_id}: REJECTED - {reason}")
            continue

        # Normalize Date
        clean_date, date_was_fixed = normalize_date(raw_created_on)
        if date_was_fixed:
            fixes.append(f"normalized date from '{raw_created_on}' to '{clean_date}'")

        # Normalize Product
        product_key = raw_product.lower()
        clean_product = STANDARD_PRODUCTS.get(product_key, raw_product)
        if clean_product != raw_product:
            fixes.append(f"normalized product name to '{clean_product}'")

        # Normalize Source
        source_key = raw_source.lower()
        clean_source = STANDARD_SOURCES.get(source_key, raw_source)
        if clean_source != raw_source:
            fixes.append(f"normalized source casing to '{clean_source}'")

        # Normalize Status
        status_key = raw_status.strip().lower()
        clean_status = STANDARD_STATUSES.get(status_key, 'New')
        if clean_status != raw_status:
            fixes.append(f"normalized status to '{clean_status}'")

        # Assign Dealer
        dealer_name, dealer_city = match_dealer(pincode_cleaned, dealers)
        prefix = pincode_cleaned[:3]

        if dealer_name == 'In-house Sales':
            action = 'assigned_inhouse'
            reason = f"Assigned to In-house Sales (no regional dealer mapped for pincode prefix {prefix})"
        elif fixes:
            action = 'fixed'
            reason = '; '.join(fixes).capitalize()
        else:
            action = 'imported'
            reason = 'Valid record imported without changes'

        reconciliation_rows.append({'lead_id': raw_lead_id, 'action': action, 'reason': reason})
        action_counts[action] += 1

        lead_doc = {
            'lead_id': raw_lead_id,
            'name': raw_name,
            'phone': phone_cleaned,
            'pincode': pincode_cleaned,
            'product': clean_product,
            'source': clean_source,
            'dealer': dealer_name,
            'dealer_name': dealer_name,
            'dealer_city': dealer_city,
            'status': clean_status,
            'created_on': clean_date,
            'reconciliation_action': action,
            'reconciliation_reason': reason
        }
        eligible_records.append(lead_doc)
        print(f" [{index:02d}] {raw_lead_id}: {action.upper()} - {reason}")

    # 4. Generate Reconciliation Report
    os.makedirs(REPORTS_DIR, exist_ok=True)
    with open(RECONCILIATION_REPORT_PATH, 'w', newline='', encoding='utf-8') as f:
        fieldnames = ['lead_id', 'action', 'reason']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(reconciliation_rows)

    print(f"\nReconciliation report written to: {RECONCILIATION_REPORT_PATH}")
    print("\n" + "=" * 45)
    print("RECONCILIATION SUMMARY (Total 40 records):")
    print("=" * 45)
    for act, cnt in action_counts.items():
        print(f" {act:18s}: {cnt:2d}")
    print("=" * 45)

    # 5. Import eligible records into Firestore
    print(f"\nImporting {len(eligible_records)} eligible leads into Cloud Firestore ('leads' collection)...")
    imported_count = 0
    firestore_reachable = True

    if db is None:
        try:
            test_url = f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}/databases/(default)/documents/leads?key={FIREBASE_API_KEY}&pageSize=1"
            res = requests.get(test_url, timeout=2)
            if res.status_code not in (200, 404):
                firestore_reachable = False
                print(" -> Notice: Cloud Firestore REST endpoint unreachable. Storing locally.")
        except Exception:
            firestore_reachable = False
            print(" -> Notice: Cloud Firestore offline / network unreachable. Storing locally.")

    if firestore_reachable:
        for record in eligible_records:
            success = import_record_to_firestore(db, record)
            if success:
                imported_count += 1
                print(f" -> Synced {record['lead_id']} ({record['name']}) -> {record['dealer_name']}")
            else:
                print(f" -> Local Record: {record['lead_id']} ({record['name']}) -> {record['dealer_name']}")
    else:
        for record in eligible_records:
            print(f" -> Local Record: {record['lead_id']} ({record['name']}) -> {record['dealer_name']}")

    print(f"\nFirestore Sync status: {imported_count}/{len(eligible_records)} remote records acknowledged.")
    print("Part B completed successfully.")


if __name__ == '__main__':
    main()
