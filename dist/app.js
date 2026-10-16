// PURE Energy - Dealer Lead Router Client Application with Firebase Firestore Integration

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  getDocs, 
  addDoc, 
  setDoc,
  doc, 
  updateDoc, 
  onSnapshot,
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ===================== FIREBASE CONFIGURATION =====================
const firebaseConfig = {
  apiKey: "AIzaSyBW6vdHPwqStPPg67YkZPx-8jZkZ7O_Oqg",
  authDomain: "pure-energy-lead-router.firebaseapp.com",
  projectId: "pure-energy-lead-router",
  storageBucket: "pure-energy-lead-router.firebasestorage.app",
  messagingSenderId: "238982236693",
  appId: "1:238982236693:web:16e4d294d79219c0729c1c",
  measurementId: "G-SPMHVZY722"
};

let db = null;
let isFirestoreLive = false;

try {
  const firebaseApp = initializeApp(firebaseConfig);
  db = getFirestore(firebaseApp);
} catch (e) {
  console.warn("Firebase initialization notice:", e);
}

// Default regional dealers from data/dealers.csv for immediate client-side prefix matching
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

// ===================== APPLICATION STATE =====================
let allLeads = [];
let allDealers = [...DEFAULT_DEALERS];
let activeView = 'dashboard';
let currentEditingLead = null;

// Pagination and Filter State
let currentPage = 1;
const pageSize = 5; // Matches reference UI showing 5 items per page
let searchQuery = '';
let statusFilter = 'All';
let dealerFilter = 'All';

// Distinct colors for dealers in charts
const DEALER_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#64748b', // slate
  '#f97316'  // orange
];

const STATUS_COLORS = {
  New: '#f59e0b',
  Contacted: '#3b82f6',
  Converted: '#10b981',
  Lost: '#ef4444'
};

/**
 * Automatically assign dealers using the first three digits of the pincode from data/dealers.csv.
 * If no dealer matches, assign In-house Sales.
 * @param {string|number} pincode 
 * @returns {Object} Assigned dealer details
 */
function assignDealerByPincode(pincode) {
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
  const dealerPool = (allDealers && allDealers.length > 0) ? allDealers : DEFAULT_DEALERS;
  const matched = dealerPool.find(d => d.prefixes && Array.isArray(d.prefixes) && d.prefixes.includes(prefix));
  if (matched) {
    return {
      dealer_id: matched.dealer_id,
      dealer_name: matched.dealer_name,
      city: matched.city,
      contact_email: matched.contact_email,
      is_inhouse: false
    };
  }
  return {
    dealer_id: 'INHOUSE',
    dealer_name: 'In-house Sales',
    city: 'Headquarters',
    contact_email: 'sales@pureenergy.example',
    is_inhouse: true
  };
}

// Expose navigation and action functions to window for inline onclick handlers
window.switchView = switchView;
window.goToPage = goToPage;
window.openUpdateModal = openUpdateModal;
window.openAddDealerModal = openAddDealerModal;
window.closeAddDealerModal = closeAddDealerModal;
window.assignDealerByPincode = assignDealerByPincode;

// ===================== INITIALIZATION =====================
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupLiveClock();
  setupAddLeadForm();
  setupAddDealerModal();
  setupUpdateStatusModal();
  setupFiltersAndSearch();
  setupResetButton();
  setupFirebaseSyncButton();
  
  // Initial load
  loadData();

  // Initialize Real-time Firestore sync
  initFirestoreSync();
});

// ===================== LIVE CLOCK =====================
function setupLiveClock() {
  const clockEl = document.getElementById('live-datetime');
  function updateTime() {
    const now = new Date();
    const options = {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    };
    clockEl.innerHTML = now.toLocaleString('en-US', options).replace(',', '');
  }
  updateTime();
  setInterval(updateTime, 1000);
}

// ===================== NAVIGATION =====================
function setupNavigation() {
  const navButtons = document.querySelectorAll('.sidebar-nav .nav-item');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      switchView(view);
    });
  });

  const refreshBtn = document.getElementById('btn-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadData();
      showToast('Data refreshed', 'info');
    });
  }
}

function switchView(viewName) {
  activeView = viewName;

  // Update Nav buttons
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // Update View Sections
  document.querySelectorAll('.view-section').forEach(section => {
    section.classList.toggle('active', section.id === `view-${viewName}`);
  });

  // Re-render view-specific components
  if (viewName === 'dashboard') {
    renderDashboard();
  } else if (viewName === 'dealers') {
    renderDealersTable();
  } else if (viewName === 'reports') {
    renderReports();
  } else if (viewName === 'leads') {
    renderLeadsTable();
  }
}

// ===================== DATA FETCHING =====================
async function loadData() {
  try {
    const [dealersRes, leadsRes] = await Promise.all([
      fetch('/api/dealers'),
      fetch('/api/leads')
    ]);

    if (!dealersRes.ok || !leadsRes.ok) {
      throw new Error('Failed to fetch data from server');
    }

    const dealersData = await dealersRes.json();
    const leadsData = await leadsRes.json();

    allDealers = dealersData.dealers || [];

    // If Firestore hasn't loaded leads yet, use server/csv leads
    if (!isFirestoreLive || allLeads.length === 0) {
      allLeads = leadsData.leads || [];
    }

    populateDealerFilterDropdown();
    updateLiveMetrics();
    renderDashboard();
    renderDealersTable();
    renderReports();
    renderLeadsTable();
  } catch (err) {
    console.error('Error loading data:', err);
    showToast('Failed to load application data', 'error');
  }
}

// ===================== FIRESTORE REAL-TIME SYNC =====================
function initFirestoreSync() {
  const statusPill = document.getElementById('firebase-status-pill');
  const statusText = document.getElementById('firebase-status-text');

  if (!db) {
    if (statusPill) statusPill.className = 'firebase-status-pill error';
    if (statusText) statusText.textContent = 'Firestore: Offline';
    return;
  }

  try {
    const leadsCol = collection(db, 'leads');
    onSnapshot(leadsCol, (snapshot) => {
      isFirestoreLive = true;
      if (statusPill) statusPill.className = 'firebase-status-pill connected';
      if (statusText) statusText.textContent = 'Firestore: Connected';

      if (!snapshot.empty) {
        const firestoreLeads = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          // Skip empty template document if user created one without name/phone
          if (!data.name && !data.phone && !data.pincode) return;

          firestoreLeads.push({
            firestore_id: docSnap.id,
            lead_id: data.lead_id || docSnap.id,
            name: data.name || 'Unknown',
            phone: data.phone || '',
            pincode: data.pincode || '',
            dealer_name: data.dealer || data.dealer_name || 'In-house Sales',
            dealer_id: data.dealer_id || '',
            product: data.product || 'PuREPower Home 5kWh',
            source: data.source || 'Website',
            status: data.status || 'New',
            created_on: data.created_on || new Date().toISOString().split('T')[0],
            notes: data.notes || []
          });
        });

        if (firestoreLeads.length > 0) {
          allLeads = firestoreLeads;
          updateLiveMetrics();
          renderDashboard();
          renderDealersTable();
          renderReports();
          renderLeadsTable();
        }
      }
    }, (error) => {
      console.warn("Firestore sync notification:", error.code, error.message);
      isFirestoreLive = false;
      if (statusPill) statusPill.className = 'firebase-status-pill warning';
      if (statusText) {
        statusText.textContent = error.code === 'permission-denied'
          ? 'Firestore: Check Rules'
          : 'Firestore: Disconnected';
      }
      if (error.code === 'permission-denied') {
        showToast("Firestore access blocked. Please update your Rules in Firebase Console.", "error");
      }
    });
    // Listen for dealers in Cloud Firestore
    const dealersCol = collection(db, 'dealers');
    onSnapshot(dealersCol, (snapshot) => {
      if (!snapshot.empty) {
        const firestoreDealers = [];
        snapshot.forEach(docSnap => {
          const d = docSnap.data();
          if (!d.dealer_name) return;
          const prefixes = Array.isArray(d.prefixes)
            ? d.prefixes
            : String(d.pincode_prefixes || '').split('|').map(p => p.trim()).filter(Boolean);

          firestoreDealers.push({
            dealer_id: d.dealer_id || docSnap.id,
            dealer_name: d.dealer_name,
            city: d.city || '',
            prefixes: prefixes,
            pincode_prefixes_str: prefixes.join(' | '),
            contact_email: d.contact_email || ''
          });
        });

        if (firestoreDealers.length > 0) {
          allDealers = firestoreDealers;
          populateDealerFilterDropdown();
          renderDealerBarChart();
          renderDealersTable();
        }
      }
    }, (error) => {
      console.warn("Firestore dealers listener notice:", error.message);
    });
  } catch (err) {
    console.warn("Failed to attach Firestore snapshot listener:", err);
  }
}

// ===================== METRICS UPDATE =====================
function updateLiveMetrics(stats) {
  if (!stats) {
    stats = {
      total: allLeads.length,
      new_count: allLeads.filter(l => l.status === 'New').length,
      contacted_count: allLeads.filter(l => l.status === 'Contacted').length,
      converted_count: allLeads.filter(l => l.status === 'Converted').length,
      lost_count: allLeads.filter(l => l.status === 'Lost').length
    };
  }

  document.getElementById('stat-total').textContent = stats.total;
  document.getElementById('stat-new').textContent = stats.new_count;
  document.getElementById('stat-contacted').textContent = stats.contacted_count;
  document.getElementById('stat-converted').textContent = stats.converted_count;
  document.getElementById('stat-lost').textContent = stats.lost_count;

  document.getElementById('donut-total-count').textContent = stats.total;
  document.getElementById('reports-donut-total').textContent = stats.total;
  document.getElementById('dealers-total-count').textContent = stats.total;
  document.getElementById('summary-count-total').textContent = stats.total;
}

// ===================== SCREEN 1: DASHBOARD =====================
function renderDashboard() {
  renderDealerBarChart();
  renderStatusDonut('status-donut-chart', 'status-donut-legend');
}

function getDealerLeadCounts() {
  const counts = {};
  allDealers.forEach(d => {
    counts[d.dealer_name] = 0;
  });
  counts['In-house Sales'] = 0;
  counts['Other'] = 0;

  allLeads.forEach(lead => {
    const dName = lead.dealer_name || 'In-house Sales';
    if (counts.hasOwnProperty(dName)) {
      counts[dName]++;
    } else if (dName.toLowerCase().includes('in-house')) {
      counts['In-house Sales']++;
    } else {
      counts['Other']++;
    }
  });

  return Object.entries(counts)
    .filter(([_, count]) => count > 0 || allDealers.some(d => d.dealer_name === _))
    .sort((a, b) => b[1] - a[1]);
}

function renderDealerBarChart() {
  const svg = document.getElementById('dealer-bar-chart');
  const legend = document.getElementById('dealer-chart-legend');
  if (!svg || !legend) return;

  const dealerCounts = getDealerLeadCounts();
  const maxCount = Math.max(...dealerCounts.map(d => d[1]), 10);
  
  // Dimensions
  const width = 380;
  const height = 230;
  const paddingLeft = 30;
  const paddingBottom = 30;
  const paddingTop = 20;
  const chartHeight = height - paddingTop - paddingBottom;
  const chartWidth = width - paddingLeft - 20;

  const barCount = dealerCounts.length;
  const barWidth = Math.min(24, Math.floor((chartWidth / barCount) * 0.6));
  const step = chartWidth / barCount;

  // Render SVG Elements
  let svgContent = '';

  // Background Grid Lines & Y Axis Labels (0, 2, 4, 6, 8, 10...)
  const gridSteps = 5;
  for (let i = 0; i <= gridSteps; i++) {
    const val = Math.round((maxCount / gridSteps) * i);
    const y = height - paddingBottom - (val / maxCount) * chartHeight;
    svgContent += `
      <line x1="${paddingLeft}" y1="${y}" x2="${width - 10}" y2="${y}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3,3" />
      <text x="${paddingLeft - 8}" y="${y + 4}" font-size="10" fill="#94a3b8" text-anchor="end">${val}</text>
    `;
  }

  // Draw Bars
  let legendContent = '';

  dealerCounts.forEach((item, index) => {
    const [name, count] = item;
    const color = DEALER_COLORS[index % DEALER_COLORS.length];
    const barH = (count / maxCount) * chartHeight;
    const x = paddingLeft + index * step + (step - barWidth) / 2;
    const y = height - paddingBottom - barH;

    // Bar
    svgContent += `
      <g class="bar-group">
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" rx="4" fill="${color}" opacity="0.9">
          <title>${name}: ${count} leads</title>
        </rect>
        <text x="${x + barWidth / 2}" y="${y - 5}" font-size="10" font-weight="600" fill="#475569" text-anchor="middle">${count}</text>
      </g>
    `;

    // Legend item
    legendContent += `
      <div class="legend-item" title="${name}">
        <div class="legend-dot-label">
          <span class="legend-dot" style="background-color: ${color};"></span>
          <span>${name}</span>
        </div>
        <span class="legend-count">${count}</span>
      </div>
    `;
  });

  svg.innerHTML = svgContent;
  legend.innerHTML = legendContent;
}

function renderStatusDonut(chartId, legendId) {
  const svg = document.getElementById(chartId);
  const legend = document.getElementById(legendId);
  if (!svg) return;

  const counts = {
    New: allLeads.filter(l => l.status === 'New').length,
    Contacted: allLeads.filter(l => l.status === 'Contacted').length,
    Converted: allLeads.filter(l => l.status === 'Converted').length,
    Lost: allLeads.filter(l => l.status === 'Lost').length
  };

  const total = allLeads.length || 1;
  const radius = 80;
  const strokeWidth = 24;
  const center = 120;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;
  let svgPaths = '';
  let legendHtml = '';

  const order = ['New', 'Contacted', 'Converted', 'Lost'];

  order.forEach(statusKey => {
    const count = counts[statusKey];
    const percent = total > 0 ? (count / total) * 100 : 0;
    const segmentLength = (percent / 100) * circumference;
    const offset = -(accumulatedPercent / 100) * circumference;
    accumulatedPercent += percent;

    const color = STATUS_COLORS[statusKey];

    if (count > 0) {
      svgPaths += `
        <circle
          cx="${center}"
          cy="${center}"
          r="${radius}"
          fill="transparent"
          stroke="${color}"
          stroke-width="${strokeWidth}"
          stroke-dasharray="${segmentLength} ${circumference}"
          stroke-dashoffset="${offset}"
          stroke-linecap="round"
        >
          <title>${statusKey}: ${count} (${percent.toFixed(1)}%)</title>
        </circle>
      `;
    }

    if (legend) {
      legendHtml += `
        <div class="status-legend-item">
          <div class="legend-dot-label">
            <span class="status-indicator-dot dot-${statusKey.toLowerCase()}"></span>
            <span>${statusKey}</span>
          </div>
          <span class="legend-count">${count} (${percent.toFixed(1)}%)</span>
        </div>
      `;
    }
  });

  // Base subtle circle track
  svg.innerHTML = `
    <circle cx="${center}" cy="${center}" r="${radius}" fill="transparent" stroke="#f1f5f9" stroke-width="${strokeWidth}" />
    ${svgPaths}
  `;

  if (legend) {
    legend.innerHTML = legendHtml;
  }
}

// ===================== SCREEN 2: ADD LEAD =====================
function setupAddLeadForm() {
  const form = document.getElementById('add-lead-form');
  const nameInput = document.getElementById('lead-name');
  const mobileInput = document.getElementById('lead-mobile');
  const pincodeInput = document.getElementById('lead-pincode');
  const productSelect = document.getElementById('lead-product');
  const sourceSelect = document.getElementById('lead-source');

  // Real-time Mobile Number Validation & Duplicate Check
  mobileInput.addEventListener('input', () => {
    const cleaned = mobileInput.value.replace(/\D/g, '').substring(0, 10);
    mobileInput.value = cleaned;
    validateMobileField(cleaned);
  });

  // Real-time Pincode Validation & Auto Dealer Assignment Preview
  pincodeInput.addEventListener('input', () => {
    const cleaned = pincodeInput.value.replace(/\D/g, '').substring(0, 6);
    pincodeInput.value = cleaned;
    validatePincodeField(cleaned);
    previewAutoAssignment(cleaned);
  });

  // Form Submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = nameInput.value.trim();
    const mobile = mobileInput.value.trim();
    const pincode = pincodeInput.value.trim();
    const product = productSelect.value;
    const source = sourceSelect.value;

    const isMobileValid = validateMobileField(mobile);
    const isPincodeValid = validatePincodeField(pincode);

    if (!name) {
      document.getElementById('err-name').textContent = 'Please enter customer name.';
      nameInput.classList.add('is-invalid');
      return;
    } else {
      document.getElementById('err-name').textContent = '';
      nameInput.classList.remove('is-invalid');
    }

    if (!isMobileValid || !isPincodeValid || !product || !source) {
      showToast('Please fix validation errors before saving.', 'error');
      return;
    }

    try {
      let resultLead = null;

      // 1. Try saving to Backend REST API
      try {
        const res = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, mobile, pincode, product, source })
        });
        if (res.ok) {
          const result = await res.json();
          resultLead = result.lead;
        }
      } catch (backendErr) {
        console.warn("Backend API not reachable, routing client-side:", backendErr);
      }

      // If backend was unreachable or returned an error, assign dealer using pincode prefixes from dealers.csv:
      if (!resultLead) {
        const assigned = assignDealerByPincode(pincode);
        let maxNum = 1000;
        allLeads.forEach(l => {
          const match = (l.lead_id || '').match(/L(\d+)/i);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
          }
        });
        const now = new Date();
        const dateFormatted = now.toISOString().split('T')[0];
        resultLead = {
          lead_id: `L${maxNum + 1}`,
          name,
          phone: mobile,
          pincode,
          product,
          source,
          dealer: assigned.dealer_name,
          dealer_name: assigned.dealer_name,
          dealer_id: assigned.dealer_id,
          dealer_city: assigned.city,
          status: 'New',
          created_on: dateFormatted,
          notes: [{
            timestamp: now.toISOString(),
            action: 'lead_created',
            note: `Lead created via Add Lead form. Assigned to ${assigned.dealer_name} based on pincode prefix ${pincode.substring(0, 3)}.`
          }]
        };
        allLeads.unshift(resultLead);
      }

      // 2. Also save directly to Cloud Firestore collection 'leads'
      if (db) {
        try {
          const docRef = await addDoc(collection(db, "leads"), {
            lead_id: resultLead.lead_id,
            name: name,
            phone: mobile,
            pincode: pincode,
            product: product,
            source: source,
            dealer: resultLead.dealer_name,
            dealer_name: resultLead.dealer_name,
            dealer_city: resultLead.dealer_city,
            status: 'New',
            created_on: resultLead.created_on,
            notes: resultLead.notes || []
          });
          console.log("Lead synced to Firestore document:", docRef.id);
        } catch (fsErr) {
          console.warn("Firestore direct write error:", fsErr);
        }
      }

      showToast(`Lead saved and routed to ${resultLead.dealer_name}`, 'success');
      form.reset();
      resetValidationIndicators();

      // Refresh data
      try {
        await loadData();
      } catch (e) {
        updateLiveMetrics();
        renderDashboard();
        renderDealersTable();
        renderReports();
        renderLeadsTable();
      }

      // Switch to Leads tab to see the newly created lead
      setTimeout(() => switchView('leads'), 600);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function validateMobileField(mobile) {
  const ruleMobile = document.getElementById('rule-mobile');
  const ruleDup = document.getElementById('rule-duplicate');
  const errMobile = document.getElementById('err-mobile');

  const is10Digits = /^\d{10}$/.test(mobile);
  ruleMobile.classList.toggle('valid', is10Digits);

  const isDuplicate = allLeads.some(l => l.phone === mobile);
  ruleDup.classList.toggle('valid', is10Digits && !isDuplicate);

  if (!mobile) {
    errMobile.textContent = '';
    return false;
  }
  if (!is10Digits) {
    errMobile.textContent = 'Mobile number must be exactly 10 digits.';
    return false;
  }
  if (isDuplicate) {
    errMobile.textContent = 'Mobile number already registered to another lead.';
    return false;
  }

  errMobile.textContent = '';
  return true;
}

function validatePincodeField(pincode) {
  const rulePincode = document.getElementById('rule-pincode');
  const errPincode = document.getElementById('err-pincode');

  const is6Digits = /^\d{6}$/.test(pincode);
  rulePincode.classList.toggle('valid', is6Digits);

  if (!pincode) {
    errPincode.textContent = '';
    return false;
  }
  if (!is6Digits) {
    errPincode.textContent = 'Pincode must be exactly 6 digits.';
    return false;
  }

  errPincode.textContent = '';
  return true;
}

function previewAutoAssignment(pincode) {
  const previewBox = document.getElementById('assignment-preview');
  const nameEl = document.getElementById('preview-dealer-name');
  const detailEl = document.getElementById('preview-dealer-detail');

  if (!pincode || String(pincode).trim().length < 3) {
    previewBox.classList.remove('matched');
    nameEl.textContent = 'Type pincode to preview assignment';
    detailEl.textContent = 'Matches prefix: None';
    return;
  }

  const cleanPin = String(pincode).trim();
  const prefix = cleanPin.substring(0, 3);
  const assigned = assignDealerByPincode(cleanPin);

  previewBox.classList.add('matched');
  if (!assigned.is_inhouse) {
    nameEl.textContent = assigned.dealer_name;
    detailEl.textContent = `City: ${assigned.city} • Prefix: ${prefix}`;
  } else {
    nameEl.textContent = 'In-house Sales';
    detailEl.textContent = `No regional dealer for prefix ${prefix} (Direct routing)`;
  }
}

function resetValidationIndicators() {
  document.getElementById('rule-mobile').classList.remove('valid');
  document.getElementById('rule-duplicate').classList.remove('valid');
  document.getElementById('rule-pincode').classList.remove('valid');
  document.getElementById('assignment-preview').classList.remove('matched');
  document.getElementById('preview-dealer-name').textContent = 'Type pincode to preview assignment';
  document.getElementById('preview-dealer-detail').textContent = 'Matches prefix: None';
}

// ===================== SCREEN 3: LEADS BY DEALER =====================
function renderDealersTable() {
  const tbody = document.getElementById('dealers-table-body');
  if (!tbody) return;

  const dealerCounts = getDealerLeadCounts();
  let total = 0;

  let rowsHtml = '';
  dealerCounts.forEach(([name, count], index) => {
    total += count;
    const dealerObj = allDealers.find(d => d.dealer_name === name);
    const prefixes = dealerObj ? dealerObj.pincode_prefixes_str : '—';

    rowsHtml += `
      <tr>
        <td style="color: var(--text-muted); font-weight: 500;">${index + 1}</td>
        <td style="font-weight: 600; color: var(--text-primary);">${name}</td>
        <td style="color: var(--text-secondary);">${prefixes}</td>
        <td style="text-align: right; font-weight: 700;">${count}</td>
      </tr>
    `;
  });

  tbody.innerHTML = rowsHtml;
  document.getElementById('dealers-total-count').textContent = total;
}

// ===================== SCREEN 4: LEADS BY STATUS (REPORTS) =====================
function renderReports() {
  renderStatusDonut('reports-donut-chart', 'reports-status-legend');

  const newCount = allLeads.filter(l => l.status === 'New').length;
  const contactedCount = allLeads.filter(l => l.status === 'Contacted').length;
  const convertedCount = allLeads.filter(l => l.status === 'Converted').length;
  const lostCount = allLeads.filter(l => l.status === 'Lost').length;
  const total = allLeads.length;

  document.getElementById('summary-count-new').textContent = newCount;
  document.getElementById('summary-count-contacted').textContent = contactedCount;
  document.getElementById('summary-count-converted').textContent = convertedCount;
  document.getElementById('summary-count-lost').textContent = lostCount;
  document.getElementById('summary-count-total').textContent = total;
}

// ===================== SCREEN 5: ALL LEADS TABLE =====================
function setupFiltersAndSearch() {
  const searchInput = document.getElementById('lead-search-input');
  const statusSelect = document.getElementById('filter-status');
  const dealerSelect = document.getElementById('filter-dealer');

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    currentPage = 1;
    renderLeadsTable();
  });

  statusSelect.addEventListener('change', (e) => {
    statusFilter = e.target.value;
    currentPage = 1;
    renderLeadsTable();
  });

  dealerSelect.addEventListener('change', (e) => {
    dealerFilter = e.target.value;
    currentPage = 1;
    renderLeadsTable();
  });
}

function populateDealerFilterDropdown() {
  const dealerSelect = document.getElementById('filter-dealer');
  if (!dealerSelect) return;

  const currentVal = dealerSelect.value;
  let options = '<option value="All">All Dealers</option>';
  allDealers.forEach(d => {
    options += `<option value="${d.dealer_name}">${d.dealer_name}</option>`;
  });
  options += '<option value="In-house Sales">In-house Sales</option>';
  dealerSelect.innerHTML = options;
  dealerSelect.value = currentVal || 'All';
}

function getFilteredLeads() {
  return allLeads.filter(lead => {
    // Status Filter
    if (statusFilter !== 'All' && lead.status.toLowerCase() !== statusFilter.toLowerCase()) {
      return false;
    }

    // Dealer Filter
    if (dealerFilter !== 'All' && lead.dealer_name !== dealerFilter) {
      return false;
    }

    // Search Query (name, mobile, pincode, lead_id, dealer)
    if (searchQuery) {
      const match = (
        (lead.name && lead.name.toLowerCase().includes(searchQuery)) ||
        (lead.lead_id && lead.lead_id.toLowerCase().includes(searchQuery)) ||
        (lead.phone && lead.phone.includes(searchQuery)) ||
        (lead.raw_phone && lead.raw_phone.includes(searchQuery)) ||
        (lead.pincode && lead.pincode.includes(searchQuery)) ||
        (lead.dealer_name && lead.dealer_name.toLowerCase().includes(searchQuery))
      );
      if (!match) return false;
    }

    return true;
  });
}

function renderLeadsTable() {
  const tbody = document.getElementById('leads-table-body');
  if (!tbody) return;

  const filtered = getFilteredLeads();
  const totalCount = filtered.length;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCount);
  const pagedLeads = filtered.slice(startIndex, endIndex);

  if (pagedLeads.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 36px; color: var(--text-muted);">
          No leads found matching your search and filter criteria.
        </td>
      </tr>
    `;
  } else {
    tbody.innerHTML = pagedLeads.map(lead => {
      const statusClass = `status-${lead.status.toLowerCase()}`;
      return `
        <tr>
          <td style="font-weight: 600; color: #1e293b;">${lead.lead_id}</td>
          <td style="font-weight: 600;">${lead.name}</td>
          <td style="color: #475569;">${lead.phone || lead.raw_phone}</td>
          <td>${lead.pincode}</td>
          <td>${lead.dealer_name || 'In-house Sales'}</td>
          <td>
            <span class="status-pill ${statusClass}">${lead.status}</span>
          </td>
          <td style="color: #64748b;">${formatDate(lead.created_on)}</td>
          <td style="text-align: center;">
            <button class="btn-action-edit" onclick="openUpdateModal('${lead.lead_id}')">Edit</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Update Pagination Controls
  const infoEl = document.getElementById('pagination-info');
  if (totalCount === 0) {
    infoEl.textContent = 'Showing 0 of 0';
  } else {
    infoEl.textContent = `Showing ${startIndex + 1}-${endIndex} of ${totalCount}`;
  }

  renderPaginationButtons(totalPages);
}

function renderPaginationButtons(totalPages) {
  const container = document.getElementById('pagination-buttons');
  if (!container) return;

  let html = `
    <button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${currentPage - 1})">
      &lsaquo;
    </button>
  `;

  for (let i = 1; i <= totalPages; i++) {
    html += `
      <button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">
        ${i}
      </button>
    `;
  }

  html += `
    <button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${currentPage + 1})">
      &rsaquo;
    </button>
  `;

  container.innerHTML = html;
}

function goToPage(page) {
  currentPage = page;
  renderLeadsTable();
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  // If formatted like 2026-09-03
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }
  return dateStr;
}

// ===================== SCREEN 6: UPDATE STATUS MODAL =====================
function setupUpdateStatusModal() {
  const modal = document.getElementById('update-status-modal');
  const closeBtn = document.getElementById('modal-close');
  const cancelBtn = document.getElementById('modal-cancel-btn');
  const saveBtn = document.getElementById('modal-save-btn');
  const newStatusSelect = document.getElementById('modal-new-status');
  const notesInput = document.getElementById('modal-notes');

  function closeModal() {
    modal.classList.remove('open');
    currentEditingLead = null;
  }

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  // Close when clicking backdrop
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  saveBtn.addEventListener('click', async () => {
    if (!currentEditingLead) return;

    const newStatus = newStatusSelect.value;
    const noteText = notesInput.value.trim();

    try {
      // 1. Update Backend REST API
      const res = await fetch(`/api/leads/${encodeURIComponent(currentEditingLead.lead_id)}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, note: noteText })
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Failed to update status');
      }

      // 2. Also update in Cloud Firestore if available
      if (db) {
        try {
          const docTargetId = currentEditingLead.firestore_id || currentEditingLead.lead_id;
          await updateDoc(doc(db, "leads", docTargetId), {
            status: newStatus,
            notes: [
              ...(currentEditingLead.notes || []),
              {
                timestamp: new Date().toISOString(),
                previous_status: currentEditingLead.status,
                new_status: newStatus,
                note: noteText || `Status updated from ${currentEditingLead.status} to ${newStatus}`
              }
            ]
          });
        } catch (fsErr) {
          console.warn("Firestore update notice:", fsErr);
        }
      }

      showToast(`Lead ${currentEditingLead.lead_id} updated to ${newStatus}`, 'success');
      closeModal();

      // Refresh application state
      await loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function openUpdateModal(leadId) {
  const lead = allLeads.find(l => l.lead_id === leadId);
  if (!lead) return;

  currentEditingLead = lead;

  document.getElementById('modal-lead-id').textContent = lead.lead_id;
  document.getElementById('modal-lead-name').textContent = lead.name;

  const currentBadge = document.getElementById('modal-current-status-badge');
  currentBadge.textContent = lead.status;
  currentBadge.className = `status-pill status-${lead.status.toLowerCase()}`;

  document.getElementById('modal-new-status').value = lead.status;
  document.getElementById('modal-notes').value = '';

  // Render History List
  const historyList = document.getElementById('modal-history-list');
  if (lead.notes && lead.notes.length > 0) {
    historyList.innerHTML = lead.notes.slice().reverse().map(n => `
      <div class="history-item">
        <div style="font-weight: 600; color: #1e293b;">${n.status ? `[${n.status}] ` : ''}${n.note || 'Status updated'}</div>
        <div class="history-time">${formatDate(n.timestamp)}</div>
      </div>
    `).join('');
  } else {
    historyList.innerHTML = '<div style="color: var(--text-muted); font-size: 0.78rem;">No previous activity logged.</div>';
  }

  document.getElementById('update-status-modal').classList.add('open');
}

// ===================== RESET DATA =====================
function setupResetButton() {
  const btn = document.getElementById('btn-reset-data');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to reset all leads back to the original legacy CSV dataset?')) {
      return;
    }

    try {
      const res = await fetch('/api/reset', { method: 'POST' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      showToast('Reset dataset back to original CSV data', 'success');
      await loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// ===================== SYNC TO CLOUD FIRESTORE =====================
function setupFirebaseSyncButton() {
  const syncBtn = document.getElementById('btn-sync-firebase');
  if (!syncBtn) return;

  syncBtn.addEventListener('click', async () => {
    if (!db) {
      showToast('Firestore is not initialized', 'error');
      return;
    }

    syncBtn.disabled = true;
    const originalText = syncBtn.innerHTML;
    syncBtn.innerHTML = 'Syncing...';

    try {
      showToast('Syncing all leads into Cloud Firestore...', 'info');
      let successCount = 0;

      for (const lead of allLeads) {
        // Use lead_id as the document ID in 'leads' collection
        await setDoc(doc(db, "leads", lead.lead_id), {
          lead_id: lead.lead_id,
          name: lead.name,
          phone: lead.phone || lead.raw_phone,
          pincode: lead.pincode,
          product: lead.product,
          source: lead.source,
          dealer: lead.dealer_name,
          dealer_name: lead.dealer_name,
          status: lead.status,
          created_on: lead.created_on,
          notes: lead.notes || []
        }, { merge: true });
        successCount++;
      }

      showToast(`Success! Synced ${successCount} leads to Firestore. Check Firebase Console!`, 'success');
    } catch (err) {
      console.error("Sync error:", err);
      if (err.code === 'permission-denied') {
        showToast('Firestore Rules blocked write: Go to Rules tab and allow read/write.', 'error');
      } else {
        showToast(`Sync failed: ${err.message}`, 'error');
      }
    } finally {
      syncBtn.disabled = false;
      syncBtn.innerHTML = originalText;
    }
  });
}

// ===================== ADD DEALER MODAL =====================
function openAddDealerModal() {
  const modal = document.getElementById('add-dealer-modal');
  if (modal) modal.classList.add('open');
}

function closeAddDealerModal() {
  const modal = document.getElementById('add-dealer-modal');
  if (modal) {
    modal.classList.remove('open');
    const form = document.getElementById('add-dealer-form');
    if (form) form.reset();
  }
}

window.openAddDealerModal = openAddDealerModal;
window.closeAddDealerModal = closeAddDealerModal;

function setupAddDealerModal() {
  const openBtn = document.getElementById('btn-open-add-dealer');
  const modal = document.getElementById('add-dealer-modal');
  const closeBtn = document.getElementById('dealer-modal-close');
  const cancelBtn = document.getElementById('dealer-modal-cancel');
  const form = document.getElementById('add-dealer-form');

  if (!modal || !form) return;

  if (openBtn) openBtn.addEventListener('click', openAddDealerModal);
  if (closeBtn) closeBtn.addEventListener('click', closeAddDealerModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeAddDealerModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeAddDealerModal();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dealer_name = document.getElementById('new-dealer-name').value.trim();
    const city = document.getElementById('new-dealer-city').value.trim();
    const pincode_prefixes = document.getElementById('new-dealer-prefixes').value.trim();
    const contact_email = document.getElementById('new-dealer-email').value.trim();

    if (!dealer_name || !pincode_prefixes) {
      showToast('Please fill all required dealer fields.', 'error');
      return;
    }

    try {
      const prefixes = pincode_prefixes.split('|').map(p => p.trim()).filter(Boolean);
      let newDealerId = `D${String(allDealers.length + 1).padStart(2, '0')}`;

      // 1. Try Post to Backend (if server restarted)
      try {
        const res = await fetch('/api/dealers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dealer_name, city, pincode_prefixes, contact_email })
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.dealer && data.dealer.dealer_id) {
            newDealerId = data.dealer.dealer_id;
          }
        }
      } catch (backendErr) {
        console.warn('Backend dealer endpoint notice:', backendErr.message);
      }

      // 2. Save directly to Cloud Firestore 'dealers' collection
      if (db) {
        try {
          await setDoc(doc(db, "dealers", newDealerId), {
            dealer_id: newDealerId,
            dealer_name,
            city: city || 'Headquarters',
            pincode_prefixes,
            prefixes,
            contact_email
          });
        } catch (fsErr) {
          console.warn("Firestore direct dealer write notice:", fsErr);
        }
      }

      // 3. Immediately update client state
      const newDealerObj = {
        dealer_id: newDealerId,
        dealer_name,
        city: city || 'Headquarters',
        prefixes,
        pincode_prefixes_str: prefixes.join(' | '),
        contact_email: contact_email || `${newDealerId.toLowerCase()}@example.com`
      };

      if (!allDealers.some(d => d.dealer_name === dealer_name)) {
        allDealers.push(newDealerObj);
      }

      showToast(`Dealer "${dealer_name}" added and synced to Firestore!`, 'success');
      closeAddDealerModal();

      populateDealerFilterDropdown();
      renderDealerBarChart();
      renderDealersTable();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// ===================== TOAST SYSTEM =====================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
      ${type === 'success' 
        ? '<polyline points="20 6 9 17 4 12"></polyline>' 
        : type === 'error' 
        ? '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>'
        : '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>'
      }
    </svg>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
