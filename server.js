const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const STORE_FILE = path.join(DATA_DIR, 'leads_store.json');

// MIME types for static assets
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

// Default dealers matching data/dealers.csv for resilient prefix routing
const DEFAULT_DEALERS = [
  { dealer_id: 'D01', dealer_name: 'Sri Sai Power Solutions', city: 'Hyderabad', prefixes: ['500'], pincode_prefixes_str: '500', contact_email: 'd01@example.com' },
  { dealer_id: 'D02', dealer_name: 'Kandi Energy Point', city: 'Sangareddy', prefixes: ['502'], pincode_prefixes_str: '502', contact_email: 'd02@example.com' },
  { dealer_id: 'D03', dealer_name: 'Warangal Green Systems', city: 'Warangal', prefixes: ['506'], pincode_prefixes_str: '506', contact_email: 'd03@example.com' },
  { dealer_id: 'D04', dealer_name: 'Karimnagar Solar Hub', city: 'Karimnagar', prefixes: ['505'], pincode_prefixes_str: '505', contact_email: 'd04@example.com' },
  { dealer_id: 'D05', dealer_name: 'Vizag Home Power', city: 'Visakhapatnam', prefixes: ['530', '531'], pincode_prefixes_str: '530 | 531', contact_email: 'd05@example.com' },
  { dealer_id: 'D06', dealer_name: 'Krishna Energy Store', city: 'Vijayawada', prefixes: ['520', '521'], pincode_prefixes_str: '520 | 521', contact_email: 'd06@example.com' },
  { dealer_id: 'D07', dealer_name: 'Guntur Battery World', city: 'Guntur', prefixes: ['522'], pincode_prefixes_str: '522', contact_email: 'd07@example.com' },
  { dealer_id: 'D08', dealer_name: 'Tirupati PowerHouse', city: 'Tirupati', prefixes: ['517'], pincode_prefixes_str: '517', contact_email: 'd08@example.com' }
];

// Dealers Data Structure initialized with default dealers
let dealers = [...DEFAULT_DEALERS];
// Leads Data Structure
let leads = [];

// Clean and normalize phone numbers (strip +91, dashes, spaces)
function cleanPhoneNumber(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[\s\-\+]/g, '');
  if (cleaned.startsWith('91') && cleaned.length > 10) {
    cleaned = cleaned.substring(2);
  }
  return cleaned;
}

// Normalize Status
function normalizeStatus(status) {
  if (!status) return 'New';
  const s = status.trim().toLowerCase();
  if (s === 'contacted') return 'Contacted';
  if (s === 'converted') return 'Converted';
  if (s === 'lost') return 'Lost';
  return 'New';
}

// Automatically assign dealers using the first three digits of the pincode from data/dealers.csv.
// If no dealer matches, assign In-house Sales.
function assignDealer(pincode) {
  if (!pincode) {
    return {
      dealer_id: 'INHOUSE',
      dealer_name: 'In-house Sales',
      city: 'Headquarters',
      contact_email: 'sales@pureenergy.example',
      is_inhouse: true
    };
  }
  const cleanPin = String(pincode).trim();
  if (cleanPin.length < 3) {
    return {
      dealer_id: 'INHOUSE',
      dealer_name: 'In-house Sales',
      city: 'Headquarters',
      contact_email: 'sales@pureenergy.example',
      is_inhouse: true
    };
  }
  const prefix = cleanPin.substring(0, 3);
  const activeDealers = (dealers && dealers.length > 0) ? dealers : DEFAULT_DEALERS;
  const matched = activeDealers.find(d => d.prefixes && Array.isArray(d.prefixes) && d.prefixes.includes(prefix));
  if (matched) {
    return {
      dealer_id: matched.dealer_id,
      dealer_name: matched.dealer_name,
      city: matched.city,
      contact_email: matched.contact_email,
      is_inhouse: false
    };
  }

  // Not matched to dealer -> In-house Sales
  return {
    dealer_id: 'INHOUSE',
    dealer_name: 'In-house Sales',
    city: 'Headquarters',
    contact_email: 'sales@pureenergy.example',
    is_inhouse: true
  };
}

// Parse dealers.csv
function loadDealers() {
  const filePath = path.join(DATA_DIR, 'dealers.csv');
  if (!fs.existsSync(filePath)) {
    console.error('dealers.csv not found at', filePath);
    dealers = [];
    return;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
  const header = lines[0].split(',');

  dealers = lines.slice(1).map(line => {
    const parts = line.split(',');
    const dealer_id = (parts[0] || '').trim();
    const dealer_name = (parts[1] || '').trim();
    const city = (parts[2] || '').trim();
    const pincode_prefixes_raw = (parts[3] || '').trim();
    const contact_email = (parts[4] || '').trim();
    const prefixes = pincode_prefixes_raw.split('|').map(p => p.trim()).filter(Boolean);

    return {
      dealer_id,
      dealer_name,
      city,
      prefixes,
      pincode_prefixes_str: prefixes.join(' | '),
      contact_email
    };
  });

  console.log(`Loaded ${dealers.length} dealers from dealers.csv`);
}

// Parse legacy_leads.csv
function parseLegacyLeads() {
  const filePath = path.join(DATA_DIR, 'legacy_leads.csv');
  if (!fs.existsSync(filePath)) {
    console.error('legacy_leads.csv not found at', filePath);
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
  
  const parsedLeads = lines.slice(1).map((line, index) => {
    const parts = line.split(',');
    const raw_lead_id = (parts[0] || '').trim();
    const name = (parts[1] || '').trim() || 'Unknown Customer';
    const raw_phone = (parts[2] || '').trim();
    const pincode = (parts[3] || '').trim();
    const product = (parts[4] || '').trim() || 'PuREPower Home 5kWh';
    const source = (parts[5] || '').trim() || 'Website';
    const created_on = (parts[6] || '').trim() || '2026-09-01';
    const status = normalizeStatus(parts[7]);

    const cleaned_phone = cleanPhoneNumber(raw_phone);
    const assigned = assignDealer(pincode);

    return {
      lead_id: raw_lead_id || `L${1000 + index + 1}`,
      name,
      phone: cleaned_phone,
      raw_phone,
      pincode,
      product,
      source,
      created_on,
      status,
      dealer_id: assigned.dealer_id,
      dealer_name: assigned.dealer_name,
      dealer_city: assigned.city,
      notes: [
        {
          timestamp: new Date().toISOString(),
          status: status,
          note: 'Initial import from legacy leads system'
        }
      ]
    };
  });

  return parsedLeads;
}

// Load leads from storage or fallback to legacy CSV
function loadLeads() {
  if (fs.existsSync(STORE_FILE)) {
    try {
      const data = fs.readFileSync(STORE_FILE, 'utf-8');
      leads = JSON.parse(data);
      console.log(`Loaded ${leads.length} leads from persistent store.`);
      return;
    } catch (err) {
      console.warn('Failed to parse leads_store.json, reloading from legacy_leads.csv', err.message);
    }
  }

  leads = parseLegacyLeads();
  saveLeadsStore();
  console.log(`Initialized ${leads.length} leads from legacy_leads.csv`);
}

// Save leads to persistent store
function saveLeadsStore() {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(leads, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save leads to store:', err.message);
  }
}

// Background sync dealer to Cloud Firestore via REST API
async function syncDealerToFirestoreREST(dealer) {
  if (!dealer || !dealer.dealer_id) return;
  try {
    const docUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/dealers/${encodeURIComponent(dealer.dealer_id)}?key=${FIREBASE_API_KEY}`;
    const body = {
      fields: {
        dealer_id: { stringValue: String(dealer.dealer_id) },
        dealer_name: { stringValue: String(dealer.dealer_name || '') },
        city: { stringValue: String(dealer.city || '') },
        pincode_prefixes: { stringValue: String(dealer.pincode_prefixes_str || dealer.pincode_prefixes || '') },
        prefixes: {
          arrayValue: {
            values: (dealer.prefixes || []).map(p => ({ stringValue: String(p) }))
          }
        },
        contact_email: { stringValue: String(dealer.contact_email || '') }
      }
    };
    await fetch(docUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (err) {
    console.warn('Firestore REST dealer sync notice:', err.message);
  }
}

// Background sync lead to Cloud Firestore via REST API
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyBW6vdHPwqStPPg67YkZPx-8jZkZ7O_Oqg';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'pure-energy-lead-router';

async function syncLeadToFirestoreREST(lead) {
  if (!lead || !lead.lead_id) return;
  try {
    const docUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/leads/${encodeURIComponent(lead.lead_id)}?key=${FIREBASE_API_KEY}`;
    const body = {
      fields: {
        lead_id: { stringValue: String(lead.lead_id) },
        name: { stringValue: String(lead.name || '') },
        phone: { stringValue: String(lead.phone || '') },
        pincode: { stringValue: String(lead.pincode || '') },
        product: { stringValue: String(lead.product || '') },
        source: { stringValue: String(lead.source || '') },
        dealer: { stringValue: String(lead.dealer_name || '') },
        dealer_name: { stringValue: String(lead.dealer_name || '') },
        status: { stringValue: String(lead.status || 'New') },
        created_on: { stringValue: String(lead.created_on || '') }
      }
    };
    await fetch(docUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (err) {
    console.warn('Firestore REST background sync notice:', err.message);
  }
}

// Helper to send JSON responses
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

// Parse request body
function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Serve static file
function serveStaticFile(res, filePath) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

// Create HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // ===================== API ROUTES =====================
  
  // 1. GET /api/dealers - list of dealers with stats
  if (method === 'GET' && pathname === '/api/dealers') {
    const dealerCounts = {};
    leads.forEach(l => {
      const dName = l.dealer_name || 'In-house Sales';
      dealerCounts[dName] = (dealerCounts[dName] || 0) + 1;
    });

    const result = dealers.map(d => ({
      ...d,
      lead_count: dealerCounts[d.dealer_name] || 0
    }));

    // Also include In-house Sales & Unassigned/Other
    const inhouseCount = dealerCounts['In-house Sales'] || 0;
    const otherCount = Object.keys(dealerCounts).reduce((acc, name) => {
      if (!dealers.some(d => d.dealer_name === name) && name !== 'In-house Sales') {
        return acc + dealerCounts[name];
      }
      return acc;
    }, 0);

    return sendJSON(res, 200, {
      dealers: result,
      summary: {
        total_dealers: dealers.length,
        inhouse_count: inhouseCount,
        other_count: otherCount
      }
    });
  }

  // 1b. POST /api/dealers - add a new dealer
  if (method === 'POST' && pathname === '/api/dealers') {
    try {
      const data = await parseRequestBody(req);
      const dealer_name = (data.dealer_name || '').trim();
      const city = (data.city || '').trim();
      const pincode_prefixes_raw = (data.pincode_prefixes || '').trim();
      const contact_email = (data.contact_email || '').trim();

      if (!dealer_name) {
        return sendJSON(res, 400, { error: 'Dealer Name is required.' });
      }
      if (!pincode_prefixes_raw) {
        return sendJSON(res, 400, { error: 'At least one 3-digit pincode prefix is required.' });
      }

      const prefixes = pincode_prefixes_raw.split('|').map(p => p.trim()).filter(Boolean);
      let maxNum = 8;
      dealers.forEach(d => {
        const m = d.dealer_id.match(/D(\d+)/i);
        if (m) {
          const num = parseInt(m[1], 10);
          if (num > maxNum) maxNum = num;
        }
      });
      const newDealerId = `D${String(maxNum + 1).padStart(2, '0')}`;

      const newDealer = {
        dealer_id: newDealerId,
        dealer_name,
        city: city || 'Headquarters',
        prefixes,
        pincode_prefixes_str: prefixes.join(' | '),
        contact_email: contact_email || `${newDealerId.toLowerCase()}@example.com`
      };

      dealers.push(newDealer);

      // Background sync to Cloud Firestore
      syncDealerToFirestoreREST(newDealer);

      return sendJSON(res, 201, {
        success: true,
        message: 'Dealer added successfully',
        dealer: newDealer
      });
    } catch (err) {
      return sendJSON(res, 500, { error: err.message || 'Internal Server Error' });
    }
  }

  // 2. GET /api/leads - list of all leads with optional filter & search
  if (method === 'GET' && pathname === '/api/leads') {
    const statusQuery = parsedUrl.searchParams.get('status');
    const dealerQuery = parsedUrl.searchParams.get('dealer');
    const searchQuery = (parsedUrl.searchParams.get('search') || '').trim().toLowerCase();

    let filtered = leads;

    if (statusQuery && statusQuery !== 'All') {
      filtered = filtered.filter(l => l.status.toLowerCase() === statusQuery.toLowerCase());
    }

    if (dealerQuery && dealerQuery !== 'All') {
      filtered = filtered.filter(l => l.dealer_name.toLowerCase() === dealerQuery.toLowerCase());
    }

    if (searchQuery) {
      filtered = filtered.filter(l => {
        return (
          (l.name && l.name.toLowerCase().includes(searchQuery)) ||
          (l.lead_id && l.lead_id.toLowerCase().includes(searchQuery)) ||
          (l.phone && l.phone.includes(searchQuery)) ||
          (l.pincode && l.pincode.includes(searchQuery)) ||
          (l.dealer_name && l.dealer_name.toLowerCase().includes(searchQuery))
        );
      });
    }

    // Calculate metrics
    const stats = {
      total: leads.length,
      new_count: leads.filter(l => l.status === 'New').length,
      contacted_count: leads.filter(l => l.status === 'Contacted').length,
      converted_count: leads.filter(l => l.status === 'Converted').length,
      lost_count: leads.filter(l => l.status === 'Lost').length
    };

    return sendJSON(res, 200, {
      leads: filtered,
      total_unfiltered: leads.length,
      stats
    });
  }

  // 3. POST /api/leads - create new lead
  if (method === 'POST' && pathname === '/api/leads') {
    try {
      const data = await parseRequestBody(req);
      const name = (data.name || '').trim();
      const rawMobile = (data.mobile || data.phone || '').trim();
      const rawPincode = (data.pincode || '').trim();
      const product = (data.product || '').trim();
      const source = (data.source || '').trim();

      // Validation 1: Customer Name
      if (!name) {
        return sendJSON(res, 400, { error: 'Customer Name is required.' });
      }

      // Validation 2: Mobile Number (must be exactly 10 digits)
      const cleanMobile = cleanPhoneNumber(rawMobile);
      if (!/^\d{10}$/.test(cleanMobile)) {
        return sendJSON(res, 400, {
          error: 'Invalid Mobile Number: Must be exactly 10 digits (digits only).'
        });
      }

      // Validation 3: Duplicate Mobile Number Check
      const existingLead = leads.find(l => cleanPhoneNumber(l.phone) === cleanMobile);
      if (existingLead) {
        return sendJSON(res, 400, {
          error: `Duplicate Mobile Number: Lead already exists (${existingLead.lead_id} - ${existingLead.name}).`
        });
      }

      // Validation 4: Pincode (must be exactly 6 digits)
      if (!/^\d{6}$/.test(rawPincode)) {
        return sendJSON(res, 400, {
          error: 'Invalid Pincode: Must be exactly 6 digits.'
        });
      }

      // Validation 5: Product & Source
      if (!product) {
        return sendJSON(res, 400, { error: 'Please select a product.' });
      }
      if (!source) {
        return sendJSON(res, 400, { error: 'Please select a lead source.' });
      }

      // Auto-assign dealer based on first 3 digits of pincode
      const assigned = assignDealer(rawPincode);

      // Generate new sequential lead ID
      let maxNum = 1000;
      leads.forEach(l => {
        const match = l.lead_id.match(/L(\d+)/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      });
      const newLeadId = `L${maxNum + 1}`;

      const now = new Date();
      const dateFormatted = now.toISOString().split('T')[0];

      const newLead = {
        lead_id: newLeadId,
        name,
        phone: cleanMobile,
        raw_phone: rawMobile,
        pincode: rawPincode,
        product,
        source,
        created_on: dateFormatted,
        status: 'New',
        dealer_id: assigned.dealer_id,
        dealer_name: assigned.dealer_name,
        dealer_city: assigned.city,
        notes: [
          {
            timestamp: now.toISOString(),
            status: 'New',
            note: `Lead created via Add Lead form. Assigned to ${assigned.dealer_name} based on pincode prefix ${rawPincode.substring(0, 3)}.`
          }
        ]
      };

      leads.unshift(newLead);
      saveLeadsStore();

      // Background sync to Cloud Firestore
      syncLeadToFirestoreREST(newLead);

      return sendJSON(res, 201, {
        success: true,
        message: 'Lead created successfully',
        lead: newLead
      });
    } catch (err) {
      console.error('Error creating lead:', err);
      return sendJSON(res, 500, { error: err.message || 'Internal Server Error' });
    }
  }

  // 4. PUT /api/leads/:id/status - update lead status and notes
  const updateMatch = pathname.match(/^\/api\/leads\/([^\/]+)\/status$/) || pathname.match(/^\/api\/leads\/([^\/]+)$/);
  if (method === 'PUT' && updateMatch) {
    try {
      const leadId = decodeURIComponent(updateMatch[1]);
      const data = await parseRequestBody(req);
      const newStatus = normalizeStatus(data.status);
      const noteText = (data.note || data.notes || '').trim();

      const leadIndex = leads.findIndex(l => l.lead_id === leadId);
      if (leadIndex === -1) {
        return sendJSON(res, 404, { error: `Lead with ID "${leadId}" not found.` });
      }

      const prevStatus = leads[leadIndex].status;
      leads[leadIndex].status = newStatus;

      if (!leads[leadIndex].notes) {
        leads[leadIndex].notes = [];
      }

      const updateRecord = {
        timestamp: new Date().toISOString(),
        previous_status: prevStatus,
        new_status: newStatus,
        note: noteText || `Status updated from ${prevStatus} to ${newStatus}`
      };

      leads[leadIndex].notes.push(updateRecord);
      saveLeadsStore();

      // Background sync to Cloud Firestore
      syncLeadToFirestoreREST(leads[leadIndex]);

      return sendJSON(res, 200, {
        success: true,
        message: `Lead ${leadId} status updated to ${newStatus}`,
        lead: leads[leadIndex]
      });
    } catch (err) {
      console.error('Error updating lead status:', err);
      return sendJSON(res, 500, { error: err.message || 'Internal Server Error' });
    }
  }

  // 5. POST /api/check-pincode - helper for real-time dealer preview
  if (method === 'POST' && pathname === '/api/check-pincode') {
    try {
      const data = await parseRequestBody(req);
      const pincode = String(data.pincode || '').trim();
      const prefix = pincode.substring(0, 3);
      const assigned = assignDealer(pincode);
      return sendJSON(res, 200, {
        prefix,
        assigned
      });
    } catch (err) {
      return sendJSON(res, 400, { error: 'Invalid request' });
    }
  }

  // 6. POST /api/reset - reset data back to legacy_leads.csv
  if (method === 'POST' && pathname === '/api/reset') {
    leads = parseLegacyLeads();
    saveLeadsStore();
    return sendJSON(res, 200, {
      success: true,
      message: 'Reset leads to legacy dataset',
      total: leads.length
    });
  }

  // ===================== STATIC FILES =====================
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, safePath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return serveStaticFile(res, filePath);
  }

  // Check root directory if not found in public
  const rootFilePath = path.join(__dirname, safePath);
  if (fs.existsSync(rootFilePath) && fs.statSync(rootFilePath).isFile()) {
    return serveStaticFile(res, rootFilePath);
  }

  // Fallback to index.html for SPA behavior (check public then root)
  const fallbackIndex = fs.existsSync(path.join(PUBLIC_DIR, 'index.html'))
    ? path.join(PUBLIC_DIR, 'index.html')
    : path.join(__dirname, 'index.html');
  if (fs.existsSync(fallbackIndex)) {
    return serveStaticFile(res, fallbackIndex);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 Not Found');
});

// Initialize and Start Server
loadDealers();
loadLeads();

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` PURE Energy - Dealer Lead Router MIS Application`);
  console.log(` Server is running on: http://localhost:${PORT}`);
  console.log(`=======================================================`);
});
