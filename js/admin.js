/**
 * Admin Panel Logic - Teesside Events Map
 */

let eventsData = {};
let currentEditLocationId = null;
let currentEditEventId = null;
let selectedLocationId = null;
let locationPickerMap = null;
let locationPickerMarker = null;
let editLocationPickerMap = null;
let editLocationPickerMarker = null;
let currentAdminUser = null;
let currentAdminProfile = null;
let adminUsers = [];
let attendanceReports = [];
let authObserverStarted = false;
let adminInitialized = false;
let addEventInProgress = false;

const ADMIN_USERS_COLLECTION = 'adminUsers';
const ADMIN_ROLE_ADMIN = 'admin';
const ADMIN_ROLE_GLOBAL = 'globalAdmin';
const INITIAL_GLOBAL_ADMIN_EMAIL = 'peter.cahill@biblesociety.org.uk';
const DEFAULT_LOCATION_PICKER = {
  lat: 54.5742,
  lon: -1.2348,
  zoom: 10
};
const POSTCODE_LOOKUP_ZOOM = 15;
const POSTCODE_LOOKUP_DEBOUNCE_MS = 400;
let addLocationPostcodeLookupTimer = null;
let editLocationPostcodeLookupTimer = null;

function isValidLatitudeLongitude(lat, lon) {
  return Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180;
}

function getAdminPageMode() {
  return document.body?.dataset.adminPage || 'dashboard';
}

function isAdminUsersPage() {
  return getAdminPageMode() === 'users';
}

function isAdminReportsPage() {
  return getAdminPageMode() === 'reports';
}

function updateAdminAreaNavigation() {
  const pageMode = getAdminPageMode();

  document.querySelectorAll('[data-admin-nav-link]').forEach(link => {
    const isActive = link.dataset.adminNavLink === pageMode;
    link.classList.toggle('active', isActive);

    if (isActive) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });

  document.querySelectorAll('[data-global-admin-only]').forEach(element => {
    element.hidden = !isGlobalAdmin();
  });
}

function checkAdminAuth() {
  if (authObserverStarted) {
    return;
  }

  renderSignedOut();

  try {
    initializeFirebase();
  } catch (error) {
    console.error('Firebase initialization failed:', error);
    showError('Firebase could not start. Check the site connection and Firebase setup.');
    return;
  }

  if (!auth) {
    renderSignedOut();
    showError('Firebase Auth is not available. Check that firebase-auth-compat.js is loaded.');
    return;
  }

  authObserverStarted = true;
  auth.onAuthStateChanged(user => {
    handleAuthStateChanged(user);
  }, error => {
    console.error('Firebase Auth observer failed:', error);
    currentAdminUser = null;
    currentAdminProfile = null;
    adminInitialized = false;
    renderSignedOut();
    showError('Could not start Firebase sign-in. Check the site connection and Firebase setup.');
  });
}

async function handleAuthStateChanged(user) {
  if (!user) {
    currentAdminUser = null;
    currentAdminProfile = null;
    adminInitialized = false;
    renderSignedOut();
    return;
  }

  try {
    const profile = await getAdminProfile(user);

    if (!profile || profile.disabled) {
      currentAdminUser = null;
      currentAdminProfile = null;
      renderSignedOut();
      await auth.signOut();
      showError(profile?.disabled ? 'Your admin access is disabled.' : 'Your email is not authorised for admin access.');
      return;
    }

    currentAdminUser = user;
    currentAdminProfile = profile;
  } catch (error) {
    console.error('Admin auth check failed:', error);
    currentAdminUser = null;
    currentAdminProfile = null;
    renderSignedOut();
    showError('Could not verify admin access. Check Firebase permissions.');
    return;
  }

  renderSignedIn();
  recordAdminLogin(user, currentAdminProfile);

  try {
    if (!adminInitialized) {
      adminInitialized = true;
      await initializeAdmin();
    } else if (isAdminReportsPage()) {
      await initializeReportsPage();
    } else {
      await refreshAdminUserArea();
    }
  } catch (error) {
    console.error('Admin page failed to load after sign-in:', error);
    const detail = error?.message ? ` ${error.message}` : '';
    showError(`Signed in, but this admin page could not finish loading.${detail}`);
  }
}

function renderSignedIn() {
  const loginSection = document.getElementById('loginSection');
  const adminContent = document.getElementById('adminContent');
  const logoutNav = document.getElementById('logoutNav');
  const sessionSummary = document.getElementById('adminSessionSummary');

  if (loginSection) {
    loginSection.style.display = 'none';
  }

  if (adminContent) {
    adminContent.style.display = 'block';
  }

  if (logoutNav) {
    logoutNav.style.display = 'inline-block';
  }

  if (sessionSummary && currentAdminProfile) {
    sessionSummary.textContent = `Signed in as ${currentAdminProfile.email} (${getAdminRoleLabel(currentAdminProfile.role)})`;
  }

  updateAdminAreaNavigation();
}

function renderSignedOut() {
  const loginSection = document.getElementById('loginSection');
  const adminContent = document.getElementById('adminContent');
  const logoutNav = document.getElementById('logoutNav');
  const sessionSummary = document.getElementById('adminSessionSummary');

  if (loginSection) {
    loginSection.style.display = 'block';
  }

  if (adminContent) {
    adminContent.style.display = 'none';
  }

  if (logoutNav) {
    logoutNav.style.display = 'none';
  }

  if (sessionSummary) {
    sessionSummary.textContent = '';
  }

  updateAdminAreaNavigation();
}

async function authenticate() {
  initializeFirebase();

  if (!auth) {
    showError('Firebase Auth is not available.');
    return;
  }

  const email = document.getElementById('adminEmail').value.trim();
  const password = document.getElementById('adminPassword').value;

  if (!email || !password) {
    showError('Please enter your email and password');
    return;
  }

  try {
    await auth.signInWithEmailAndPassword(email, password);
    document.getElementById('adminPassword').value = '';
  } catch (error) {
    console.error('Email sign-in failed:', error);
    document.getElementById('adminPassword').value = '';
    showError(getAuthErrorMessage(error));
  }
}

async function signInWithGoogle() {
  initializeFirebase();

  if (!auth || !firebase.auth) {
    showError('Firebase Auth is not available.');
    return;
  }

  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    await auth.signInWithPopup(provider);
  } catch (error) {
    console.error('Google sign-in failed:', error);
    showError(getAuthErrorMessage(error));
  }
}

async function logout() {
  if (auth) {
    await auth.signOut();
  }

  showInfo('Logged out');
}

function normalizeAdminEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidAdminRole(role) {
  return role === ADMIN_ROLE_ADMIN || role === ADMIN_ROLE_GLOBAL;
}

function getAdminRoleLabel(role) {
  return role === ADMIN_ROLE_GLOBAL ? 'Global admin' : 'Admin';
}

function isGlobalAdmin() {
  return currentAdminProfile?.role === ADMIN_ROLE_GLOBAL;
}

function isInitialGlobalAdminEmail(email) {
  return normalizeAdminEmail(email) === INITIAL_GLOBAL_ADMIN_EMAIL;
}

function getEffectiveAdminRole(email, role) {
  if (isInitialGlobalAdminEmail(email)) {
    return ADMIN_ROLE_GLOBAL;
  }

  return isValidAdminRole(role) ? role : ADMIN_ROLE_ADMIN;
}

function getEffectiveAdminDisabled(email, disabled) {
  if (isInitialGlobalAdminEmail(email)) {
    return false;
  }

  return disabled === true;
}

async function getAdminProfile(user) {
  const email = normalizeAdminEmail(user.email);

  if (!email) {
    return null;
  }

  if (isInitialGlobalAdminEmail(email)) {
    return {
      id: email,
      email,
      displayName: user.displayName || 'Peter Cahill',
      role: ADMIN_ROLE_GLOBAL,
      disabled: false
    };
  }

  if (!db) {
    return null;
  }

  const doc = await db.collection(ADMIN_USERS_COLLECTION).doc(email).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data() || {};
  const role = getEffectiveAdminRole(email, data.role);

  return {
    id: doc.id,
    email,
    displayName: data.displayName || user.displayName || '',
    role,
    disabled: getEffectiveAdminDisabled(email, data.disabled)
  };
}

async function recordAdminLogin(user, profile) {
  if (!db || !profile?.email || profile.role !== ADMIN_ROLE_GLOBAL) {
    return;
  }

  try {
    const payload = {
      email: profile.email,
      displayName: profile.displayName || user.displayName || '',
      uid: user.uid,
      providerIds: (user.providerData || []).map(provider => provider.providerId),
      lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (isInitialGlobalAdminEmail(profile.email)) {
      payload.role = ADMIN_ROLE_GLOBAL;
      payload.disabled = false;
      payload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      payload.updatedBy = profile.email;
    }

    await db.collection(ADMIN_USERS_COLLECTION).doc(profile.email).set(payload, { merge: true });
  } catch (error) {
    console.warn('Could not record admin login metadata:', error);
  }
}

function getAuthErrorMessage(error) {
  switch (error?.code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-login-credentials':
    case 'auth/invalid-credential':
      return 'Email or password was not recognised.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was closed before completion.';
    case 'auth/account-exists-with-different-credential':
      return 'That email already uses a different sign-in method.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-disabled':
      return 'This Firebase account has been disabled.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled in Firebase Authentication.';
    case 'auth/network-request-failed':
      return 'Firebase sign-in could not be reached. Check your connection and try again.';
    case 'auth/too-many-requests':
      return 'Too many sign-in attempts. Please wait and try again.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorised in Firebase Authentication. Use the deployed site or an authorised local server.';
    default:
      return 'Sign-in failed. Please try again.';
  }
}

async function initializeAdmin() {
  updateAdminAreaNavigation();

  if (isAdminUsersPage()) {
    await refreshAdminUserArea();
    return;
  }

  if (isAdminReportsPage()) {
    await initializeReportsPage();
    return;
  }

  // Load events data
  eventsData = await getEventsData();

  // Initialize location picker map
  initializeLocationPickerMap();

  // Populate location dropdown
  populateLocationDropdown();

  // Display locations and events lists
  displayLocationsList();
  displayEventsList();
  updateAdminSummary();
  await refreshAdminUserArea();
}

function initializeLocationPickerMap() {
  // Check if map container exists
  const mapContainer = document.getElementById('locationPickerMap');
  if (!mapContainer) {
    console.warn('Location picker map container not found');
    return;
  }

  if (typeof L === 'undefined') {
    console.warn('Leaflet did not load. Location picker map is unavailable.');
    showError('Signed in, but the map picker did not load. You can still manage existing records, or refresh to try loading the map again.');
    return;
  }

  if (locationPickerMap) {
    setTimeout(() => locationPickerMap.invalidateSize(), 0);
    return;
  }
  
  // Initialize map
  locationPickerMap = L.map('locationPickerMap').setView([DEFAULT_LOCATION_PICKER.lat, DEFAULT_LOCATION_PICKER.lon], DEFAULT_LOCATION_PICKER.zoom);
  
  // Add OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(locationPickerMap);
  
  // Add draggable marker
  locationPickerMarker = L.marker([DEFAULT_LOCATION_PICKER.lat, DEFAULT_LOCATION_PICKER.lon], {
    draggable: true,
    title: 'Drag to set location or click map'
  }).addTo(locationPickerMap);
  
  // Update coordinates when marker is dragged
  locationPickerMarker.on('dragend', function() {
    const latlng = locationPickerMarker.getLatLng();
    document.getElementById('locLat').value = latlng.lat.toFixed(4);
    document.getElementById('locLon').value = latlng.lng.toFixed(4);
  });
  
  // Allow clicking on map to place marker
  locationPickerMap.on('click', function(e) {
    const latlng = e.latlng;
    locationPickerMarker.setLatLng([latlng.lat, latlng.lng]);
    document.getElementById('locLat').value = latlng.lat.toFixed(4);
    document.getElementById('locLon').value = latlng.lng.toFixed(4);
  });
  
  // Update marker position when lat/lon inputs change
  document.getElementById('locLat').addEventListener('change', updateMarkerPosition);
  document.getElementById('locLon').addEventListener('change', updateMarkerPosition);
  setupPostcodeMapLookup({
    postcodeInputId: 'locPostcode',
    latInputId: 'locLat',
    lonInputId: 'locLon',
    getMarker: () => locationPickerMarker,
    getMap: () => locationPickerMap,
    timerKey: 'add'
  });
}

function updateMarkerPosition() {
  const lat = parseFloat(document.getElementById('locLat').value);
  const lon = parseFloat(document.getElementById('locLon').value);
  
  if (!isNaN(lat) && !isNaN(lon) && locationPickerMarker) {
    locationPickerMarker.setLatLng([lat, lon]);
    locationPickerMap.setView([lat, lon], 15);
  }
}

function normalizeAdminPostcode(value) {
  return String(value || '').trim().toUpperCase();
}

function isCompleteUkPostcode(value) {
  return /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(String(value || '').trim());
}

function setLocationPickerPosition({ lat, lon, latInputId, lonInputId, marker, map }) {
  const latInput = document.getElementById(latInputId);
  const lonInput = document.getElementById(lonInputId);

  if (latInput) {
    latInput.value = lat.toFixed(4);
  }

  if (lonInput) {
    lonInput.value = lon.toFixed(4);
  }

  if (marker && map) {
    marker.setLatLng([lat, lon]);
    map.setView([lat, lon], POSTCODE_LOOKUP_ZOOM);
  }
}

async function lookupLocationPostcode({ postcodeInputId, latInputId, lonInputId, getMarker, getMap, announceFailure = false }) {
  const postcodeInput = document.getElementById(postcodeInputId);
  const postcode = normalizeAdminPostcode(postcodeInput?.value);

  if (!postcodeInput || !postcode) {
    return;
  }

  postcodeInput.value = postcode;

  if (!isCompleteUkPostcode(postcode)) {
    if (announceFailure) {
      showError('Please enter a full UK postcode before positioning the map.');
    }
    return;
  }

  const coords = await postcodeToCoords(postcode);

  if (!coords || !isValidLatitudeLongitude(coords.lat, coords.lon)) {
    if (announceFailure) {
      showError('Could not find that postcode. You can still place the marker manually.');
    }
    return;
  }

  setLocationPickerPosition({
    lat: coords.lat,
    lon: coords.lon,
    latInputId,
    lonInputId,
    marker: getMarker(),
    map: getMap()
  });
}

function setupPostcodeMapLookup({ postcodeInputId, latInputId, lonInputId, getMarker, getMap, timerKey }) {
  const postcodeInput = document.getElementById(postcodeInputId);

  if (!postcodeInput) {
    return;
  }

  const clearTimer = function() {
    if (timerKey === 'edit') {
      clearTimeout(editLocationPostcodeLookupTimer);
      editLocationPostcodeLookupTimer = null;
      return;
    }

    clearTimeout(addLocationPostcodeLookupTimer);
    addLocationPostcodeLookupTimer = null;
  };

  const scheduleLookup = function() {
    clearTimer();

    const postcode = normalizeAdminPostcode(postcodeInput.value);
    if (!isCompleteUkPostcode(postcode)) {
      return;
    }

    const timer = setTimeout(() => {
      lookupLocationPostcode({ postcodeInputId, latInputId, lonInputId, getMarker, getMap });
    }, POSTCODE_LOOKUP_DEBOUNCE_MS);

    if (timerKey === 'edit') {
      editLocationPostcodeLookupTimer = timer;
    } else {
      addLocationPostcodeLookupTimer = timer;
    }
  };

  postcodeInput.addEventListener('input', scheduleLookup);
  postcodeInput.addEventListener('blur', function() {
    clearTimer();
    lookupLocationPostcode({ postcodeInputId, latInputId, lonInputId, getMarker, getMap, announceFailure: true });
  });
}

function populateLocationDropdown() {
  const dropdown = document.getElementById('evtLocation');
  if (!dropdown) {
    return;
  }

  dropdown.innerHTML = '<option value="">Select location</option>';

  (eventsData.locations || []).forEach(location => {
    const option = document.createElement('option');
    option.value = location.id;
    option.textContent = location.name;
    dropdown.appendChild(option);
  });
}

function getLocationById(locationId) {
  return (eventsData.locations || []).find(location => location.id === locationId);
}

function getLocationEvents(location) {
  return Array.isArray(location.events) ? location.events : [];
}

function setSelectValue(selectId, value) {
  const select = document.getElementById(selectId);
  if (!select) {
    return;
  }

  if (value && !Array.from(select.options).some(option => option.value === value)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }

  select.value = value || '';
}

function getEventStatus(event) {
  return normalizeEvent(event).status;
}

function getStatusBadge(status, label = status) {
  const safeStatus = ['active', 'inactive', 'over'].includes(status) ? status : 'inactive';
  return `<span class="status-badge status-${safeStatus}">${escapeHTML(label)}</span>`;
}

function getEventDetailUrl(locationId, eventId) {
  return `event.html?locationId=${encodeURIComponent(locationId)}&eventId=${encodeURIComponent(eventId)}`;
}

function getValidatedEventbriteUrl(input) {
  if (!input) {
    return '';
  }

  const safeUrl = getSafeExternalUrl(input);
  if (!safeUrl) {
    showError('Please enter a valid http or https Eventbrite URL.');
    return null;
  }

  return safeUrl;
}

function getDayNameForDate(dateString) {
  if (!isDateValid(dateString)) {
    return '';
  }

  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', { weekday: 'long' });
}

function syncDaySelectWithStartDate(startDateInputId, daySelectId) {
  const startDateInput = document.getElementById(startDateInputId);
  const daySelect = document.getElementById(daySelectId);

  if (!startDateInput || !daySelect) {
    return;
  }

  startDateInput.addEventListener('change', function() {
    const dayName = getDayNameForDate(this.value);
    if (dayName) {
      daySelect.value = dayName;
    }
  });
}

function setTextContent(elementId, value) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = value;
  }
}

function updateAdminSummary() {
  const locations = Array.isArray(eventsData.locations) ? eventsData.locations : [];
  const events = [];
  locations.forEach(location => {
    events.push(...getLocationEvents(location));
  });
  const activeCount = events.filter(event => getEventStatus(event) === 'active').length;
  const inactiveCount = events.filter(event => getEventStatus(event) === 'inactive').length;
  const overCount = events.filter(event => getEventStatus(event) === 'over').length;

  setTextContent('totalLocations', locations.length);
  setTextContent('totalEvents', events.length);
  setTextContent('activeEvents', activeCount);
  setTextContent('inactiveEvents', inactiveCount);
  setTextContent('overEvents', overCount);
}

function formatReportDate(dateString) {
  if (!isDateValid(dateString)) {
    return 'Date not set';
  }

  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function formatReportCreatedAt(value) {
  if (!value) {
    return 'Unknown';
  }

  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function initializeReportsPage() {
  eventsData = await getEventsData();
  attendanceReports = await loadAttendanceReportsFromFirestore();
  populateReportsFilters();
  renderAttendanceReports();
}

function getUniqueReportOptions(key, labelKey) {
  const seen = new Map();

  attendanceReports.forEach(report => {
    const value = report[key];
    const label = report[labelKey];

    if (value && !seen.has(value)) {
      seen.set(value, label || value);
    }
  });

  return Array.from(seen.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function populateSelectOptions(selectId, options, defaultLabel) {
  const select = document.getElementById(selectId);
  if (!select) {
    return;
  }

  const currentValue = select.value;
  select.innerHTML = `<option value="">${escapeHTML(defaultLabel)}</option>`;

  options.forEach(optionData => {
    const option = document.createElement('option');
    option.value = optionData.value;
    option.textContent = optionData.label;
    select.appendChild(option);
  });

  if (currentValue && options.some(optionData => optionData.value === currentValue)) {
    select.value = currentValue;
  }
}

function populateReportsFilters() {
  populateSelectOptions(
    'reportsLocationFilter',
    getUniqueReportOptions('locationId', 'locationName'),
    'All locations'
  );
  populateSelectOptions(
    'reportsEventFilter',
    getUniqueReportOptions('eventId', 'eventTitle'),
    'All events'
  );
}

function getFilteredAttendanceReports() {
  const locationFilter = document.getElementById('reportsLocationFilter')?.value || '';
  const eventFilter = document.getElementById('reportsEventFilter')?.value || '';
  const sessionFilter = document.getElementById('reportsSessionFilter')?.value || '';

  return attendanceReports.filter(report => {
    if (locationFilter && report.locationId !== locationFilter) {
      return false;
    }

    if (eventFilter && report.eventId !== eventFilter) {
      return false;
    }

    if (sessionFilter && String(report.sessionNumber) !== sessionFilter) {
      return false;
    }

    return true;
  });
}

function renderAttendanceSummary(reports) {
  const totalAttendance = reports.reduce((total, report) => total + (Number(report.attendedCount) || 0), 0);
  const locationCount = new Set(reports.map(report => report.locationId).filter(Boolean)).size;

  setTextContent('attendanceTotal', totalAttendance);
  setTextContent('attendanceReportCount', reports.length);
  setTextContent('attendanceLocationCount', locationCount);
  setTextContent('attendanceUpdatedLabel', `${reports.length} shown`);
}

function renderAttendanceReports() {
  const tableWrap = document.getElementById('attendanceReportsTable');
  if (!tableWrap) {
    return;
  }

  const reports = getFilteredAttendanceReports()
    .slice()
    .sort((a, b) => {
      const dateCompare = `${b.sessionDate || ''}`.localeCompare(`${a.sessionDate || ''}`);
      if (dateCompare !== 0) {
        return dateCompare;
      }

      return `${b.locationName || ''}`.localeCompare(`${a.locationName || ''}`);
    });

  renderAttendanceSummary(reports);

  if (reports.length === 0) {
    tableWrap.innerHTML = '<p class="admin-empty-state">No attendance reports match these filters.</p>';
    return;
  }

  tableWrap.innerHTML = `
    <table class="reports-table">
      <thead>
        <tr>
          <th scope="col">Session date</th>
          <th scope="col">Location</th>
          <th scope="col">Event</th>
          <th scope="col">Session</th>
          <th scope="col">Attended</th>
          <th scope="col">Notes</th>
          <th scope="col">Submitted</th>
        </tr>
      </thead>
      <tbody>
        ${reports.map(report => `
          <tr>
            <td>${escapeHTML(formatReportDate(report.sessionDate))}</td>
            <td>${escapeHTML(report.locationName || report.locationId || 'Unknown location')}</td>
            <td>${escapeHTML(report.eventTitle || report.eventId || 'Unknown event')}</td>
            <td>${escapeHTML(report.sessionNumber ? `Session ${report.sessionNumber}` : 'Not set')}</td>
            <td><strong>${escapeHTML(report.attendedCount ?? 0)}</strong></td>
            <td>${escapeHTML(report.notes || '')}</td>
            <td>${escapeHTML(formatReportCreatedAt(report.createdAt))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function refreshAdminDisplays() {
  updateAdminSummary();
  displayLocationsList();
  displayEventsList(selectedLocationId);
}

async function refreshAdminUserArea() {
  const userAdminSection = document.getElementById('userAdminSection');
  const deniedSection = document.getElementById('globalAdminDenied');

  if (!userAdminSection) {
    return;
  }

  const canManageUsers = isGlobalAdmin();
  userAdminSection.hidden = !canManageUsers;

  if (deniedSection) {
    deniedSection.hidden = canManageUsers;
  }

  if (!canManageUsers) {
    return;
  }

  await loadAdminUsers();
}

async function loadAdminUsers() {
  if (!db || !isGlobalAdmin()) {
    return;
  }

  try {
    const snapshot = await db.collection(ADMIN_USERS_COLLECTION).get();
    adminUsers = snapshot.docs.map(doc => {
      const data = doc.data() || {};
      const email = normalizeAdminEmail(data.email || doc.id);
      return {
        id: doc.id,
        email,
        displayName: data.displayName || '',
        role: getEffectiveAdminRole(email, data.role),
        disabled: getEffectiveAdminDisabled(email, data.disabled),
        lastLoginAt: data.lastLoginAt || null
      };
    });

    if (currentAdminProfile && !adminUsers.some(user => user.email === currentAdminProfile.email)) {
      adminUsers.push({
        id: currentAdminProfile.email,
        email: currentAdminProfile.email,
        displayName: currentAdminProfile.displayName || '',
        role: currentAdminProfile.role,
        disabled: currentAdminProfile.disabled === true,
        lastLoginAt: null
      });
    }

    adminUsers.sort((a, b) => a.email.localeCompare(b.email));
    displayAdminUsersList();
  } catch (error) {
    console.error('Could not load admin users:', error);
    showError('Could not load admin users. Check Firebase permissions.');
  }
}

function displayAdminUsersList() {
  const listContainer = document.getElementById('adminUsersList');

  if (!listContainer) {
    return;
  }

  if (adminUsers.length === 0) {
    listContainer.innerHTML = '<p class="admin-empty-state">No admin users have been added yet.</p>';
    return;
  }

  listContainer.innerHTML = adminUsers.map(user => {
    const statusBadge = user.disabled
      ? getStatusBadge('inactive', 'disabled')
      : getStatusBadge('active', 'active');

    return `
      <article class="admin-list-item">
        <div class="admin-list-main">
          <div class="admin-list-kicker">${escapeHTML(getAdminRoleLabel(user.role))}</div>
          <div class="admin-list-title">
            ${escapeHTML(user.displayName || user.email)}
            ${statusBadge}
          </div>
          <div class="admin-list-meta">${escapeHTML(user.email)}</div>
        </div>
        <div class="admin-list-actions">
          <button class="btn-sm btn-edit" type="button" data-admin-user-action="edit" data-admin-email="${escapeAttribute(user.email)}"><span class="material-symbols-outlined" aria-hidden="true">edit</span>Edit</button>
          <button class="btn-sm btn-danger" type="button" data-admin-user-action="remove" data-admin-email="${escapeAttribute(user.email)}"><span class="material-symbols-outlined" aria-hidden="true">person_remove</span>Remove</button>
        </div>
      </article>
    `;
  }).join('');
}

async function saveAdminUser() {
  if (!isGlobalAdmin()) {
    showError('Only global admins can manage users.');
    return;
  }

  const email = normalizeAdminEmail(document.getElementById('adminUserEmail').value);
  const displayName = document.getElementById('adminUserName').value.trim();
  const role = document.getElementById('adminUserRole').value;
  const disabled = document.getElementById('adminUserStatus').value === 'disabled';

  if (!email || !email.includes('@')) {
    showError('Please enter a valid user email.');
    return;
  }

  if (!isValidAdminRole(role)) {
    showError('Please choose a valid user type.');
    return;
  }

  if (isInitialGlobalAdminEmail(email) && (role !== ADMIN_ROLE_GLOBAL || disabled)) {
    showError('The bootstrap global admin must stay active.');
    return;
  }

  if (email === currentAdminProfile.email && (role !== ADMIN_ROLE_GLOBAL || disabled)) {
    showError('You cannot disable or demote your current global admin session.');
    return;
  }

  if (wouldRemoveLastActiveGlobalAdmin(email, role, disabled)) {
    showError('You must keep at least one active global admin.');
    return;
  }

  try {
    const docRef = db.collection(ADMIN_USERS_COLLECTION).doc(email);
    const existingDoc = await docRef.get();
    const payload = {
      email,
      displayName,
      role,
      disabled,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: currentAdminProfile.email
    };

    if (!existingDoc.exists) {
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      payload.createdBy = currentAdminProfile.email;
    }

    await docRef.set(payload, { merge: true });
    clearAdminUserForm();
    await loadAdminUsers();
    showSuccess('Admin user access saved.');
  } catch (error) {
    console.error('Could not save admin user:', error);
    showError('Could not save admin user. Check Firebase permissions.');
  }
}

function editAdminUser(email) {
  if (!isGlobalAdmin()) {
    return;
  }

  const user = adminUsers.find(item => item.email === email);

  if (!user) {
    showError('Admin user not found.');
    return;
  }

  document.getElementById('adminUserEmail').value = user.email;
  document.getElementById('adminUserName').value = user.displayName || '';
  document.getElementById('adminUserRole').value = user.role;
  document.getElementById('adminUserStatus').value = user.disabled ? 'disabled' : 'active';
}

async function removeAdminUser(email) {
  if (!isGlobalAdmin()) {
    showError('Only global admins can manage users.');
    return;
  }

  const user = adminUsers.find(item => item.email === email);

  if (!user) {
    showError('Admin user not found.');
    return;
  }

  if (email === currentAdminProfile.email) {
    showError('You cannot remove your current global admin session.');
    return;
  }

  if (isInitialGlobalAdminEmail(email)) {
    showError('The bootstrap global admin cannot be removed.');
    return;
  }

  if (wouldRemoveLastActiveGlobalAdmin(email, user.role, true)) {
    showError('You must keep at least one active global admin.');
    return;
  }

  if (!confirm(`Remove admin access for ${email}? This does not delete their Firebase Auth account.`)) {
    return;
  }

  try {
    await db.collection(ADMIN_USERS_COLLECTION).doc(email).delete();
    clearAdminUserForm();
    await loadAdminUsers();
    showSuccess('Admin access removed.');
  } catch (error) {
    console.error('Could not remove admin user:', error);
    showError('Could not remove admin user. Check Firebase permissions.');
  }
}

function clearAdminUserForm() {
  const emailInput = document.getElementById('adminUserEmail');
  const nameInput = document.getElementById('adminUserName');
  const roleInput = document.getElementById('adminUserRole');
  const statusInput = document.getElementById('adminUserStatus');

  if (emailInput) {
    emailInput.value = '';
  }

  if (nameInput) {
    nameInput.value = '';
  }

  if (roleInput) {
    roleInput.value = ADMIN_ROLE_ADMIN;
  }

  if (statusInput) {
    statusInput.value = 'active';
  }
}

function wouldRemoveLastActiveGlobalAdmin(email, newRole, disabled) {
  const usersToCheck = adminUsers.map(user => {
    if (user.email === currentAdminProfile?.email) {
      return {
        ...user,
        role: currentAdminProfile.role,
        disabled: currentAdminProfile.disabled === true
      };
    }

    return user;
  });

  if (currentAdminProfile && !usersToCheck.some(user => user.email === currentAdminProfile.email)) {
    usersToCheck.push({
      email: currentAdminProfile.email,
      role: currentAdminProfile.role,
      disabled: currentAdminProfile.disabled === true
    });
  }

  const activeGlobalAdmins = usersToCheck.filter(user => {
    if (user.email === email) {
      return newRole === ADMIN_ROLE_GLOBAL && disabled !== true;
    }

    return user.role === ADMIN_ROLE_GLOBAL && user.disabled !== true;
  });

  return activeGlobalAdmins.length === 0;
}

async function addLocation() {
  if (!currentAdminUser || !currentAdminProfile) {
    showError('You need to be signed in as an active admin before saving a location.');
    return;
  }

  const name = document.getElementById('locName').value.trim();
  const address = document.getElementById('locAddress').value.trim();
  const postcode = document.getElementById('locPostcode').value.trim().toUpperCase();
  const lat = parseFloat(document.getElementById('locLat').value);
  const lon = parseFloat(document.getElementById('locLon').value);
  
  // Validation
  if (!name || !address || !postcode) {
    showError('Please fill in all required fields');
    return;
  }
  
  if (!isValidLatitudeLongitude(lat, lon)) {
    showError('Please enter valid latitude and longitude');
    return;
  }
  
  // Check if postcode already exists
  if (eventsData.locations.some(loc => loc.postcode === postcode)) {
    showError('A location with this postcode already exists');
    return;
  }
  
  // Create new location
  const newLocation = {
    id: generateId('loc'),
    name: name,
    address: address,
    postcode: postcode,
    latitude: lat,
    longitude: lon,
    events: []
  };
  
  // Save to Firestore
  if (await saveLocationToFirestore(newLocation)) {
    // Add to local data after Firebase accepts the write
    eventsData.locations.push(newLocation);

    // Clear form
    document.getElementById('locName').value = '';
    document.getElementById('locAddress').value = '';
    document.getElementById('locPostcode').value = '';
    document.getElementById('locLat').value = '';
    document.getElementById('locLon').value = '';
    
    // Reset marker to default position
    if (locationPickerMarker) {
      locationPickerMarker.setLatLng([DEFAULT_LOCATION_PICKER.lat, DEFAULT_LOCATION_PICKER.lon]);
      locationPickerMap.setView([DEFAULT_LOCATION_PICKER.lat, DEFAULT_LOCATION_PICKER.lon], DEFAULT_LOCATION_PICKER.zoom);
    }
    
    // Refresh displays
    selectedLocationId = newLocation.id;
    populateLocationDropdown();
    refreshAdminDisplays();
    
    showSuccess('Location added successfully');
  } else {
    showError(getLastFirestoreWriteError() || 'Failed to save location');
  }
}

async function addEvent() {
  if (addEventInProgress) {
    return;
  }

  if (!currentAdminUser || !currentAdminProfile) {
    showError('You need to be signed in as an active admin before saving an event.');
    return;
  }

  const locationId = document.getElementById('evtLocation').value;
  const title = document.getElementById('evtTitle').value.trim();
  const eventType = normalizeEventType(document.getElementById('evtEventType')?.value);
  const description = document.getElementById('evtDescription').value.trim();
  const status = document.getElementById('evtStatus').value;
  const startDate = document.getElementById('evtStartDate').value;
  const endDate = document.getElementById('evtEndDate').value;
  const dayOfWeek = document.getElementById('evtDay').value;
  const time = document.getElementById('evtTime').value;
  const eventbriteUrl = document.getElementById('evtEventbriteUrl').value.trim();
  
  // Validation
  if (!locationId || !title || !startDate || !endDate) {
    showError('Please fill in all required fields');
    return;
  }
  
  if (!isDateValid(startDate) || !isDateValid(endDate)) {
    showError('Please enter valid dates');
    return;
  }
  
  if (startDate > endDate) {
    showError('End date must be after start date');
    return;
  }

  const safeEventbriteUrl = getValidatedEventbriteUrl(eventbriteUrl);
  if (safeEventbriteUrl === null) {
    return;
  }
  
  // Create new event
  const newEvent = {
    id: generateId('evt'),
    title: title,
    description: description,
    eventType: eventType,
    ageGroup: '',
    startDate: startDate,
    endDate: endDate,
    dayOfWeek: dayOfWeek,
    time: time,
    eventbriteUrl: safeEventbriteUrl,
    active: status === 'active',
    status: status
  };
  
  // Add to selected location as a separate event document.
  const location = eventsData.locations.find(l => l.id === locationId);
  if (location) {
    const addEventButton = document.getElementById('addEventButton');
    addEventInProgress = true;

    if (addEventButton) {
      addEventButton.disabled = true;
    }

    try {
      if (!await saveEventToFirestore(locationId, newEvent)) {
        showError(getLastFirestoreWriteError() || 'Failed to save event');
        return;
      }

      location.events = getLocationEvents(location).filter(event => event.id !== newEvent.id);
      location.events.push(newEvent);

      // Clear form, keeping the selected location to make adding another event quick.
      document.getElementById('evtLocation').value = locationId;
      document.getElementById('evtTitle').value = '';
      document.getElementById('evtEventType').value = DEFAULT_EVENT_TYPE;
      document.getElementById('evtDescription').value = '';
      document.getElementById('evtStartDate').value = '';
      document.getElementById('evtEndDate').value = '';
      document.getElementById('evtTime').value = '';
      document.getElementById('evtEventbriteUrl').value = '';
      document.getElementById('evtStatus').value = 'active';

      selectedLocationId = locationId;

      // Refresh displays
      refreshAdminDisplays();

      showSuccess('Event added successfully. You can add another event to this location.');
    } finally {
      addEventInProgress = false;

      if (addEventButton) {
        addEventButton.disabled = false;
      }
    }
  } else {
    showError('Location not found');
  }
}

function displayLocationsList() {
  const listContainer = document.getElementById('locationsList');
  if (!listContainer) {
    return;
  }

  const locations = eventsData.locations || [];

  if (locations.length === 0) {
    listContainer.innerHTML = '<p class="admin-empty-state">No locations added yet.</p>';
    return;
  }

  listContainer.innerHTML = locations.map(location => {
    const locationEvents = getLocationEvents(location);
    const activeCount = locationEvents.filter(event => getEventStatus(event) === 'active').length;
    const inactiveCount = locationEvents.filter(event => getEventStatus(event) === 'inactive').length;
    const overCount = locationEvents.filter(event => getEventStatus(event) === 'over').length;

    return `
    <article class="admin-list-item selectable ${location.id === selectedLocationId ? 'selected' : ''}" tabindex="0" data-location-id="${escapeAttribute(location.id)}">
      <div class="admin-list-main">
        <div class="admin-list-kicker">${escapeHTML(location.postcode || 'No postcode')}</div>
        <div class="admin-list-title">${escapeHTML(location.name || 'Unnamed location')}</div>
        <div class="admin-list-meta">
          ${escapeHTML(location.address || 'No address set')}
        </div>
        <div class="admin-list-summary">
          <span class="admin-list-summary-value">${locationEvents.length} event${locationEvents.length === 1 ? '' : 's'}</span>
          ${activeCount ? getStatusBadge('active', `${activeCount} active`) : ''}
          ${inactiveCount ? getStatusBadge('inactive', `${inactiveCount} inactive`) : ''}
          ${overCount ? getStatusBadge('over', `${overCount} over`) : ''}
        </div>
      </div>
      <div class="admin-list-actions">
        <button class="btn-sm btn-edit" type="button" data-location-action="edit" data-location-id="${escapeAttribute(location.id)}"><span class="material-symbols-outlined" aria-hidden="true">edit</span>Edit</button>
        <button class="btn-sm btn-danger" type="button" data-location-action="delete" data-location-id="${escapeAttribute(location.id)}"><span class="material-symbols-outlined" aria-hidden="true">delete</span>Delete</button>
      </div>
    </article>
  `;
  }).join('');
}

function handleLocationItemKeydown(event, locationId) {
  if (event.target.closest('button, a')) {
    return;
  }

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    selectLocation(locationId);
  }
}

function selectLocation(locationId) {
  selectedLocationId = locationId;
  const dropdown = document.getElementById('evtLocation');
  if (dropdown) {
    dropdown.value = locationId;
  }

  displayLocationsList();
  displayEventsList(locationId);
}

function displayEventsList(locationId = selectedLocationId) {
  const listContainer = document.getElementById('locationEventsList');
  const titleContainer = document.getElementById('selectedLocationTitle');
  const metaContainer = document.getElementById('selectedLocationMeta');

  if (!listContainer) {
    return;
  }

  if (!locationId) {
    if (titleContainer) {
      titleContainer.textContent = 'Location Events';
    }

    if (metaContainer) {
      metaContainer.innerHTML = '';
    }

    listContainer.innerHTML = '<p class="admin-empty-state">Select a location to see its events.</p>';
    return;
  }

  const location = getLocationById(locationId);

  if (!location) {
    selectedLocationId = null;
    displayEventsList();
    return;
  }

  if (titleContainer) {
    titleContainer.textContent = `${location.name} Events`;
  }

  if (metaContainer) {
    metaContainer.innerHTML = `
      <strong>${escapeHTML(location.name || 'Selected location')}</strong><br/>
      ${escapeHTML(location.address || 'No address set')}<br/>
      ${escapeHTML(location.postcode || 'No postcode')}
    `;
  }

  const locationEvents = getLocationEvents(location);

  if (locationEvents.length === 0) {
    listContainer.innerHTML = '<p class="admin-empty-state">No events added for this location yet.</p>';
    return;
  }

  const sortedEvents = [...locationEvents].sort((a, b) => {
    return `${a.startDate || ''} ${a.time || ''}`.localeCompare(`${b.startDate || ''} ${b.time || ''}`);
  });

  listContainer.innerHTML = sortedEvents.map(event => {
    const normalizedEvent = normalizeEvent(event);
    const detailUrl = getEventDetailUrl(location.id, event.id);

    return `
    <article class="admin-list-item">
      <div class="admin-list-main">
        <div class="admin-list-kicker">${escapeHTML(formatDate(event.startDate))} to ${escapeHTML(formatDate(event.endDate))}</div>
        <div class="admin-list-title">
          ${escapeHTML(event.title || 'Untitled event')}
          ${getStatusBadge(normalizedEvent.status)}
        </div>
        <div class="admin-list-meta">${escapeHTML(event.description || 'No description')}</div>
        <div class="admin-list-summary">
          <span class="admin-list-summary-value">${escapeHTML(event.dayOfWeek || 'Day TBC')} ${escapeHTML(event.time || 'Time TBC')}</span>
        </div>
      </div>
      <div class="admin-list-actions">
        <a class="btn-sm btn-view" href="${escapeAttribute(detailUrl)}"><span class="material-symbols-outlined" aria-hidden="true">visibility</span>View</a>
        <button class="btn-sm btn-edit" type="button" data-event-action="edit" data-location-id="${escapeAttribute(location.id)}" data-event-id="${escapeAttribute(event.id)}"><span class="material-symbols-outlined" aria-hidden="true">edit</span>Edit</button>
        <button class="btn-sm btn-danger" type="button" data-event-action="delete" data-location-id="${escapeAttribute(location.id)}" data-event-id="${escapeAttribute(event.id)}"><span class="material-symbols-outlined" aria-hidden="true">delete</span>Delete</button>
      </div>
    </article>
  `;
  }).join('');
}

function editLocation(locationId) {
  const location = eventsData.locations.find(l => l.id === locationId);
  
  if (location) {
    currentEditLocationId = locationId;
    
    document.getElementById('editLocName').value = location.name;
    document.getElementById('editLocAddress').value = location.address;
    document.getElementById('editLocPostcode').value = location.postcode;
    document.getElementById('editLocLat').value = Number(location.latitude).toFixed(4);
    document.getElementById('editLocLon').value = Number(location.longitude).toFixed(4);
    
    openModal('editLocationModal');
    initializeEditLocationPickerMap(location);
  }
}

function initializeEditLocationPickerMap(location) {
  const mapContainer = document.getElementById('editLocationPickerMap');
  const lat = parseFloat(location.latitude) || DEFAULT_LOCATION_PICKER.lat;
  const lon = parseFloat(location.longitude) || DEFAULT_LOCATION_PICKER.lon;

  if (!mapContainer) {
    return;
  }

  if (typeof L === 'undefined') {
    console.warn('Leaflet did not load. Edit location map is unavailable.');
    showError('The map picker did not load. You can still edit the location fields manually.');
    return;
  }

  if (!editLocationPickerMap) {
    editLocationPickerMap = L.map('editLocationPickerMap').setView([lat, lon], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(editLocationPickerMap);

    editLocationPickerMarker = L.marker([lat, lon], {
      draggable: true,
      title: 'Drag to update this location'
    }).addTo(editLocationPickerMap);

    editLocationPickerMarker.on('dragend', function() {
      const latlng = editLocationPickerMarker.getLatLng();
      document.getElementById('editLocLat').value = latlng.lat.toFixed(4);
      document.getElementById('editLocLon').value = latlng.lng.toFixed(4);
    });

    editLocationPickerMap.on('click', function(e) {
      editLocationPickerMarker.setLatLng(e.latlng);
      document.getElementById('editLocLat').value = e.latlng.lat.toFixed(4);
      document.getElementById('editLocLon').value = e.latlng.lng.toFixed(4);
    });

    document.getElementById('editLocLat').addEventListener('change', updateEditMarkerPosition);
    document.getElementById('editLocLon').addEventListener('change', updateEditMarkerPosition);
    setupPostcodeMapLookup({
      postcodeInputId: 'editLocPostcode',
      latInputId: 'editLocLat',
      lonInputId: 'editLocLon',
      getMarker: () => editLocationPickerMarker,
      getMap: () => editLocationPickerMap,
      timerKey: 'edit'
    });
  }

  editLocationPickerMarker.setLatLng([lat, lon]);
  editLocationPickerMap.setView([lat, lon], 15);
  setTimeout(() => editLocationPickerMap.invalidateSize(), 0);
}

function updateEditMarkerPosition() {
  const lat = parseFloat(document.getElementById('editLocLat').value);
  const lon = parseFloat(document.getElementById('editLocLon').value);

  if (!isNaN(lat) && !isNaN(lon) && editLocationPickerMarker) {
    editLocationPickerMarker.setLatLng([lat, lon]);
    editLocationPickerMap.setView([lat, lon], 15);
  }
}

async function saveLocationEdit() {
  if (!currentAdminUser || !currentAdminProfile) {
    showError('You need to be signed in as an active admin before saving a location.');
    return;
  }

  const name = document.getElementById('editLocName').value.trim();
  const address = document.getElementById('editLocAddress').value.trim();
  const postcode = document.getElementById('editLocPostcode').value.trim().toUpperCase();
  const lat = parseFloat(document.getElementById('editLocLat').value);
  const lon = parseFloat(document.getElementById('editLocLon').value);
  
  if (!name || !address || !postcode) {
    showError('Please fill in all required fields');
    return;
  }

  if (!isValidLatitudeLongitude(lat, lon)) {
    showError('Please enter valid latitude and longitude');
    return;
  }

  if (eventsData.locations.some(loc => loc.id !== currentEditLocationId && loc.postcode === postcode)) {
    showError('A different location already uses this postcode');
    return;
  }
  
  const location = eventsData.locations.find(l => l.id === currentEditLocationId);
  if (location) {
    const previousLocation = { ...location };

    location.name = name;
    location.address = address;
    location.postcode = postcode;
    location.latitude = lat;
    location.longitude = lon;
    
    if (await saveLocationToFirestore(location)) {
      closeModal('editLocationModal');
      refreshAdminDisplays();
      populateLocationDropdown();
      showSuccess('Location updated successfully');
    } else {
      Object.assign(location, previousLocation);
      showError(getLastFirestoreWriteError() || 'Failed to save changes');
    }
  }
}

async function deleteLocation(locationId) {
  if (confirm('Are you sure you want to delete this location and all its events?')) {
    const deleted = await deleteLocationFromFirestore(locationId);
    if (!deleted) {
      showError('Failed to delete location from Firebase');
      return;
    }

    eventsData.locations = eventsData.locations.filter(l => l.id !== locationId);
    if (selectedLocationId === locationId) {
      selectedLocationId = null;
    }

    refreshAdminDisplays();
    populateLocationDropdown();
    showSuccess('Location deleted successfully');
  }
}

function editEvent(locationId, eventId) {
  const location = eventsData.locations.find(l => l.id === locationId);
  const event = location?.events.find(e => e.id === eventId);
  
  if (event) {
    const normalizedEvent = normalizeEvent(event);
    currentEditLocationId = locationId;
    currentEditEventId = eventId;
    
    document.getElementById('editEvtTitle').value = normalizedEvent.title;
    setSelectValue('editEvtEventType', normalizedEvent.eventType);
    document.getElementById('editEvtDescription').value = normalizedEvent.description;
    setSelectValue('editEvtStatus', normalizedEvent.status);
    document.getElementById('editEvtStartDate').value = normalizedEvent.startDate;
    document.getElementById('editEvtEndDate').value = normalizedEvent.endDate;
    setSelectValue('editEvtDay', normalizedEvent.dayOfWeek);
    document.getElementById('editEvtTime').value = normalizedEvent.time;
    document.getElementById('editEvtEventbriteUrl').value = normalizedEvent.eventbriteUrl;
    
    openModal('editEventModal');
  }
}

async function saveEventEdit() {
  const title = document.getElementById('editEvtTitle').value.trim();
  const eventType = normalizeEventType(document.getElementById('editEvtEventType')?.value);
  const description = document.getElementById('editEvtDescription').value.trim();
  const status = document.getElementById('editEvtStatus').value;
  const startDate = document.getElementById('editEvtStartDate').value;
  const endDate = document.getElementById('editEvtEndDate').value;
  const dayOfWeek = document.getElementById('editEvtDay').value;
  const time = document.getElementById('editEvtTime').value;
  const eventbriteUrl = document.getElementById('editEvtEventbriteUrl').value.trim();
  
  if (!title || !startDate || !endDate) {
    showError('Please fill in all required fields');
    return;
  }
  
  if (startDate > endDate) {
    showError('End date must be after start date');
    return;
  }

  const safeEventbriteUrl = getValidatedEventbriteUrl(eventbriteUrl);
  if (safeEventbriteUrl === null) {
    return;
  }
  
  const location = eventsData.locations.find(l => l.id === currentEditLocationId);
  const event = location?.events.find(e => e.id === currentEditEventId);
  
  if (event) {
    event.title = title;
    event.description = description;
    event.eventType = eventType;
    event.ageGroup = '';
    event.startDate = startDate;
    event.endDate = endDate;
    event.dayOfWeek = dayOfWeek;
    event.time = time;
    event.eventbriteUrl = safeEventbriteUrl;
    event.active = status === 'active';
    event.status = status;
    
    if (await saveEventsData(eventsData)) {
      closeModal('editEventModal');
      refreshAdminDisplays();
      showSuccess('Event updated successfully');
    } else {
      showError('Failed to save changes');
    }
  }
}

async function deleteEvent(locationId, eventId) {
  if (confirm('Are you sure you want to delete this event?')) {
    const deleted = await deleteEventFromFirestore(locationId, eventId);
    if (!deleted) {
      showError('Failed to delete event from Firebase');
      return;
    }

    const location = eventsData.locations.find(l => l.id === locationId);
    if (location) {
      location.events = getLocationEvents(location).filter(e => e.id !== eventId);
      refreshAdminDisplays();
      showSuccess('Event deleted successfully');
    }
  }
}

// Allow Enter key in sign-in fields
document.addEventListener('DOMContentLoaded', function() {
  checkAdminAuth();

  const logoutNav = document.getElementById('logoutNav');
  if (logoutNav) {
    logoutNav.addEventListener('click', function(event) {
      event.preventDefault();
      logout();
    });
  }

  const buttonHandlers = {
    adminEmailLoginButton: authenticate,
    adminGoogleLoginButton: signInWithGoogle,
    saveAdminUserButton: saveAdminUser,
    addLocationButton: addLocation,
    addEventButton: addEvent,
    saveLocationEditButton: saveLocationEdit,
    saveEventEditButton: saveEventEdit
  };

  Object.entries(buttonHandlers).forEach(([buttonId, handler]) => {
    const button = document.getElementById(buttonId);
    if (button) {
      button.addEventListener('click', handler);
    }
  });

  syncDaySelectWithStartDate('evtStartDate', 'evtDay');
  syncDaySelectWithStartDate('editEvtStartDate', 'editEvtDay');

  const editLocationCloseButton = document.getElementById('editLocationCloseButton');
  if (editLocationCloseButton) {
    editLocationCloseButton.addEventListener('click', () => closeModal('editLocationModal'));
  }

  const editEventCloseButton = document.getElementById('editEventCloseButton');
  if (editEventCloseButton) {
    editEventCloseButton.addEventListener('click', () => closeModal('editEventModal'));
  }

  const adminUsersList = document.getElementById('adminUsersList');
  if (adminUsersList) {
    adminUsersList.addEventListener('click', function(event) {
      const actionButton = event.target.closest('[data-admin-user-action]');
      if (!actionButton) {
        return;
      }

      const email = actionButton.dataset.adminEmail;
      if (actionButton.dataset.adminUserAction === 'edit') {
        editAdminUser(email);
      } else if (actionButton.dataset.adminUserAction === 'remove') {
        removeAdminUser(email);
      }
    });
  }

  [
    document.getElementById('reportsLocationFilter'),
    document.getElementById('reportsEventFilter'),
    document.getElementById('reportsSessionFilter')
  ].filter(Boolean).forEach(filter => {
    filter.addEventListener('change', renderAttendanceReports);
  });

  const locationsList = document.getElementById('locationsList');
  if (locationsList) {
    locationsList.addEventListener('click', function(event) {
      const actionButton = event.target.closest('[data-location-action]');
      if (actionButton) {
        event.stopPropagation();
        const locationId = actionButton.dataset.locationId;
        if (actionButton.dataset.locationAction === 'edit') {
          editLocation(locationId);
        } else if (actionButton.dataset.locationAction === 'delete') {
          deleteLocation(locationId);
        }
        return;
      }

      const locationItem = event.target.closest('[data-location-id]');
      if (locationItem) {
        selectLocation(locationItem.dataset.locationId);
      }
    });

    locationsList.addEventListener('keydown', function(event) {
      const locationItem = event.target.closest('[data-location-id]');
      if (!locationItem) {
        return;
      }

      handleLocationItemKeydown(event, locationItem.dataset.locationId);
    });
  }

  const locationEventsList = document.getElementById('locationEventsList');
  if (locationEventsList) {
    locationEventsList.addEventListener('click', function(event) {
      const actionButton = event.target.closest('[data-event-action]');
      if (!actionButton) {
        return;
      }

      const { locationId, eventId, eventAction } = actionButton.dataset;
      if (eventAction === 'edit') {
        editEvent(locationId, eventId);
      } else if (eventAction === 'delete') {
        deleteEvent(locationId, eventId);
      }
    });
  }

  const signInInputs = [
    document.getElementById('adminEmail'),
    document.getElementById('adminPassword')
  ].filter(Boolean);

  signInInputs.forEach(input => {
    input.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        authenticate();
      }
    });
  });
});
