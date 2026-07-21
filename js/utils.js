/**
 * Utility Functions for Teesside Events Map
 */

// Alerts Management
function showAlert(type, message) {
  const alertEl = document.getElementById(type + 'Alert');
  if (alertEl) {
    alertEl.textContent = message;
    alertEl.classList.add('show');
    setTimeout(() => {
      alertEl.classList.remove('show');
    }, 8000);
  }
}

function showSuccess(message) {
  showAlert('success', message);
}

function showError(message) {
  showAlert('error', message);
}

function showInfo(message) {
  showAlert('info', message);
}

let lastFirestoreWriteError = '';

function getLastFirestoreWriteError() {
  return lastFirestoreWriteError;
}

function clearLastFirestoreWriteError() {
  lastFirestoreWriteError = '';
}

function getFirestoreWriteErrorMessage(error, fallbackMessage) {
  switch (error?.code) {
    case 'permission-denied':
      return 'Firebase rejected the save. Check that the latest firestore.rules have been deployed and that this form is allowed to write.';
    case 'unauthenticated':
      return 'Firebase rejected the save because you are not signed in. Sign out, sign back in, then try again.';
    case 'unavailable':
    case 'deadline-exceeded':
      return 'Firebase could not be reached. Check your connection and try again.';
    case 'invalid-argument':
      return 'Firebase rejected one of the location fields. Check the postcode and coordinates.';
    default:
      return error?.message ? `${fallbackMessage}: ${error.message}` : fallbackMessage;
  }
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => {
    switch (character) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return character;
    }
  });
}

function escapeAttribute(value) {
  return escapeHTML(value);
}

function getSafeExternalUrl(url) {
  if (!url) {
    return '';
  }

  const rawUrl = String(url).trim();
  if (!/^https?:\/\//i.test(rawUrl)) {
    return '';
  }

  try {
    const parsedUrl = new URL(rawUrl);
    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
      return parsedUrl.href;
    }
  } catch (error) {
    return '';
  }

  return '';
}

const TEXT_LIMITS = Object.freeze({
  id: 120,
  title: 120,
  description: 1200,
  shortText: 160,
  address: 240,
  url: 500
});

const ATTENDANCE_REPORTS_COLLECTION = 'attendanceReports';
const DEFAULT_EVENT_TYPE = 'bible-conversation';
const EVENT_TYPE_OPTIONS = Object.freeze([
  { value: DEFAULT_EVENT_TYPE, label: 'The Bible Conversation' },
  { value: 'bible-course', label: 'The Bible Course' }
]);

function normalizeText(value, maxLength = TEXT_LIMITS.shortText) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeLongText(value, maxLength = TEXT_LIMITS.description) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, maxLength);
}

function normalizeDocumentId(value) {
  return normalizeText(value, TEXT_LIMITS.id).replace(/[\/?#\[\]]/g, '');
}

function normalizeEventType(value) {
  const normalizedType = normalizeText(value, TEXT_LIMITS.shortText).toLowerCase();
  return EVENT_TYPE_OPTIONS.some(option => option.value === normalizedType)
    ? normalizedType
    : DEFAULT_EVENT_TYPE;
}

function getEventTypeLabel(value) {
  const normalizedType = normalizeEventType(value);
  const option = EVENT_TYPE_OPTIONS.find(item => item.value === normalizedType);
  return option ? option.label : 'The Bible Conversation';
}

function normalizeCoordinate(value) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : 0;
}

// Firebase setup
const firebaseConfig = {
  apiKey: "AIzaSyAHzXXVbRSc_wO4aQUWxmETtWiMz-i_mu8",
  authDomain: "bible-conversations.firebaseapp.com",
  projectId: "bible-conversations",
  storageBucket: "bible-conversations.firebasestorage.app",
  messagingSenderId: "935668039229",
  appId: "1:935668039229:web:e8d6215e1340baa682b454",
  measurementId: "G-GSK7YXNW8W"
};

let db = null;
let auth = null;

function initializeFirebase() {
  if (typeof firebase === 'undefined') {
    console.error('Firebase SDK not loaded');
    return;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  if (typeof firebase.firestore === 'function') {
    db = firebase.firestore();
  }

  if (typeof firebase.auth === 'function') {
    auth = firebase.auth();
  }
}

async function getEventsData() {
  initializeFirebase();

  if (!db) {
    showError('Firebase is not available. Events could not be loaded.');
    return { locations: [] };
  }

  const firestoreData = await loadEventsDataFromFirestore();

  if (firestoreData) {
    if (auth?.currentUser) {
      syncExpiredEventStatuses(firestoreData);
    } else {
      normalizeExpiredEventStatuses(firestoreData);
    }

    if (firestoreData.locations.length === 0) {
      showInfo('No locations found in Firebase yet.');
    }
    return firestoreData;
  }

  showError('Could not load events from Firebase.');
  return { locations: [] };
}

async function loadEventsDataFromFirestore() {
  if (!db) {
    return null;
  }

  try {
    const locationsSnapshot = await db.collection('locations').get();
    if (locationsSnapshot.empty) {
      return { locations: [] };
    }

    const locations = [];
    for (const locDoc of locationsSnapshot.docs) {
      const locationData = locDoc.data();
      const events = [];
      const eventsSnapshot = await db.collection('locations').doc(locDoc.id).collection('events').get();
      eventsSnapshot.forEach(evtDoc => {
        events.push(normalizeEvent({ ...evtDoc.data(), id: evtDoc.id }));
      });

      const location = {
        id: normalizeDocumentId(locDoc.id),
        name: normalizeText(locationData.name),
        address: normalizeText(locationData.address, TEXT_LIMITS.address),
        postcode: normalizeText(locationData.postcode, 16).toUpperCase(),
        latitude: normalizeCoordinate(locationData.latitude),
        longitude: normalizeCoordinate(locationData.longitude),
        events
      };

      location.events.sort((a, b) => {
        return `${a.startDate || ''} ${a.time || ''}`.localeCompare(`${b.startDate || ''} ${b.time || ''}`);
      });

      locations.push(location);
    }

    locations.sort((a, b) => a.name.localeCompare(b.name));

    return { locations };
  } catch (error) {
    console.error('Error loading data from Firestore:', error);
    return null;
  }
}

function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

function isEventOver(event) {
  return Boolean(event.endDate) && event.endDate < getTodayString();
}

function getActiveValue(event) {
  if (typeof event.active === 'boolean') {
    return event.active;
  }

  if (typeof event.active === 'string') {
    return event.active.toLowerCase() === 'true';
  }

  return event.status !== 'inactive' && event.status !== 'over';
}

function normalizeEvent(event) {
  const over = event.status === 'over' || isEventOver(event);
  const active = over ? false : getActiveValue(event);
  const status = over ? 'over' : (active ? 'active' : 'inactive');

  return {
    id: normalizeDocumentId(event.id),
    title: normalizeText(event.title, TEXT_LIMITS.title),
    description: normalizeLongText(event.description),
    eventType: normalizeEventType(event.eventType),
    ageGroup: normalizeText(event.ageGroup, TEXT_LIMITS.shortText),
    startDate: normalizeText(event.startDate, 10),
    endDate: normalizeText(event.endDate, 10),
    dayOfWeek: normalizeText(event.dayOfWeek, 16),
    time: normalizeText(event.time, 32),
    eventbriteUrl: getSafeExternalUrl(normalizeText(event.eventbriteUrl, TEXT_LIMITS.url)),
    active,
    status
  };
}

function getEventPayload(event) {
  const normalizedEvent = normalizeEvent(event);

  return {
    title: normalizedEvent.title,
    description: normalizedEvent.description,
    eventType: normalizedEvent.eventType,
    ageGroup: normalizedEvent.ageGroup,
    startDate: normalizedEvent.startDate,
    endDate: normalizedEvent.endDate,
    dayOfWeek: normalizedEvent.dayOfWeek,
    time: normalizedEvent.time,
    eventbriteUrl: normalizedEvent.eventbriteUrl,
    active: normalizedEvent.active,
    status: normalizedEvent.status
  };
}

function normalizeAttendanceCount(value) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0) {
    return null;
  }

  return Math.min(count, 10000);
}

function normalizeAttendanceReport(report) {
  const attendedCount = normalizeAttendanceCount(report.attendedCount);

  return {
    id: normalizeDocumentId(report.id),
    locationId: normalizeDocumentId(report.locationId),
    locationName: normalizeText(report.locationName, TEXT_LIMITS.title),
    eventId: normalizeDocumentId(report.eventId),
    eventTitle: normalizeText(report.eventTitle, TEXT_LIMITS.title),
    sessionNumber: normalizeAttendanceCount(report.sessionNumber),
    sessionDate: normalizeText(report.sessionDate, 10),
    attendedCount,
    notes: normalizeLongText(report.notes, 500),
    createdAt: report.createdAt || null
  };
}

function getAttendanceReportPayload(report) {
  const normalizedReport = normalizeAttendanceReport(report);

  return {
    locationId: normalizedReport.locationId,
    locationName: normalizedReport.locationName,
    eventId: normalizedReport.eventId,
    eventTitle: normalizedReport.eventTitle,
    sessionNumber: normalizedReport.sessionNumber,
    sessionDate: normalizedReport.sessionDate,
    attendedCount: normalizedReport.attendedCount,
    notes: normalizedReport.notes,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
}

async function saveAttendanceReportToFirestore(report) {
  clearLastFirestoreWriteError();
  initializeFirebase();

  if (!db) {
    lastFirestoreWriteError = 'Firebase is not available. Attendance could not be saved.';
    showError(lastFirestoreWriteError);
    return false;
  }

  const payload = getAttendanceReportPayload(report);
  if (!payload.locationId || !payload.eventId || !payload.sessionNumber || !payload.sessionDate || payload.attendedCount === null) {
    lastFirestoreWriteError = 'Please complete the location, event, session and attendance count.';
    return false;
  }

  try {
    await db.collection(ATTENDANCE_REPORTS_COLLECTION).add(payload);
    return true;
  } catch (error) {
    console.error('Error saving attendance report to Firestore:', error);
    lastFirestoreWriteError = getFirestoreWriteErrorMessage(error, 'Attendance could not be saved');
    return false;
  }
}

async function loadAttendanceReportsFromFirestore() {
  initializeFirebase();

  if (!db) {
    return [];
  }

  try {
    const snapshot = await db.collection(ATTENDANCE_REPORTS_COLLECTION).get();
    return snapshot.docs.map(doc => normalizeAttendanceReport({
      ...doc.data(),
      id: doc.id
    }));
  } catch (error) {
    console.error('Error loading attendance reports from Firestore:', error);
    showError('Could not load attendance reports from Firebase.');
    return [];
  }
}

function isEventPubliclyVisible(event) {
  const normalizedEvent = normalizeEvent(event);

  return normalizedEvent.active &&
    normalizedEvent.status === 'active' &&
    Boolean(normalizedEvent.startDate) &&
    Boolean(normalizedEvent.endDate) &&
    normalizedEvent.endDate >= getTodayString();
}

async function syncExpiredEventStatuses(data) {
  if (!db) {
    return;
  }

  const updates = [];

  normalizeExpiredEventStatuses(data, (location, event, normalizedEvent) => {
    const needsUpdate = normalizedEvent.status === 'over' &&
      (event.status !== 'over' || event.active !== false);

    if (needsUpdate) {
      updates.push(updateEventInFirestore(location.id, normalizedEvent));
    }
  });

  if (updates.length === 0) {
    return;
  }

  try {
    await Promise.all(updates);
  } catch (error) {
    console.warn('Expired events were hidden locally, but Firebase status updates failed:', error);
  }
}

function normalizeExpiredEventStatuses(data, onNormalizedEvent) {
  data.locations.forEach(location => {
    location.events = (location.events || []).map(event => {
      const normalizedEvent = normalizeEvent(event);

      if (typeof onNormalizedEvent === 'function') {
        onNormalizedEvent(location, event, normalizedEvent);
      }

      return normalizedEvent;
    });
  });
}

async function updateEventInFirestore(locationId, event) {
  if (!db || !locationId || !event.id) {
    return false;
  }

  try {
    await db.collection('locations')
      .doc(locationId)
      .collection('events')
      .doc(event.id)
      .set(getEventPayload(event), { merge: true });

    return true;
  } catch (error) {
    console.warn('Error updating event in Firestore:', error);
    return false;
  }
}

async function saveEventToFirestore(locationId, event) {
  clearLastFirestoreWriteError();
  initializeFirebase();
  if (!db || !locationId || !event?.id) {
    lastFirestoreWriteError = 'Firebase is not available. Event could not be saved.';
    showError(lastFirestoreWriteError);
    return false;
  }

  try {
    await db.collection('locations')
      .doc(locationId)
      .collection('events')
      .doc(event.id)
      .set(getEventPayload(event));

    return true;
  } catch (error) {
    console.error('Error saving event to Firestore:', error);
    lastFirestoreWriteError = getFirestoreWriteErrorMessage(error, 'Event could not be saved');
    return false;
  }
}

async function saveEventsData(data) {
  initializeFirebase();
  if (!db) {
    showError('Firebase is not available. Data could not be saved.');
    return false;
  }

  try {
    for (const location of data.locations) {
      const locRef = db.collection('locations').doc(location.id);
      await locRef.set({
        name: normalizeText(location.name),
        address: normalizeText(location.address, TEXT_LIMITS.address),
        postcode: normalizeText(location.postcode, 16).toUpperCase(),
        latitude: normalizeCoordinate(location.latitude),
        longitude: normalizeCoordinate(location.longitude)
      });

      const eventsCollection = locRef.collection('events');
      for (const event of (location.events || [])) {
        const eventRef = eventsCollection.doc(event.id);
        await eventRef.set(getEventPayload(event));
      }
    }

    return true;
  } catch (error) {
    console.error('Error saving data to Firestore:', error);
    return false;
  }
}

async function saveLocationToFirestore(location) {
  clearLastFirestoreWriteError();
  initializeFirebase();
  if (!db || !location?.id) {
    lastFirestoreWriteError = 'Firebase is not available. Location could not be saved.';
    showError(lastFirestoreWriteError);
    return false;
  }

  try {
    await db.collection('locations').doc(location.id).set({
      name: normalizeText(location.name),
      address: normalizeText(location.address, TEXT_LIMITS.address),
      postcode: normalizeText(location.postcode, 16).toUpperCase(),
      latitude: normalizeCoordinate(location.latitude),
      longitude: normalizeCoordinate(location.longitude)
    });

    return true;
  } catch (error) {
    console.error('Error saving location to Firestore:', error);
    lastFirestoreWriteError = getFirestoreWriteErrorMessage(error, 'Location could not be saved');
    return false;
  }
}

async function deleteLocationFromFirestore(locationId) {
  if (!db) {
    return false;
  }

  try {
    const locRef = db.collection('locations').doc(locationId);
    const eventsSnapshot = await locRef.collection('events').get();
    for (const eventDoc of eventsSnapshot.docs) {
      await locRef.collection('events').doc(eventDoc.id).delete();
    }
    await locRef.delete();
    return true;
  } catch (error) {
    console.error('Error deleting location from Firestore:', error);
    return false;
  }
}

async function deleteEventFromFirestore(locationId, eventId) {
  if (!db) {
    return false;
  }

  try {
    const eventRef = db.collection('locations').doc(locationId).collection('events').doc(eventId);
    await eventRef.delete();
    return true;
  } catch (error) {
    console.error('Error deleting event from Firestore:', error);
    return false;
  }
}

// Postcode Utilities (UK Postcodes)
const fallbackPostcodeMap = {
  'TS1': { lat: 54.5700, lon: -1.2800 },
  'TS2': { lat: 54.5600, lon: -1.2400 },
  'TS3': { lat: 54.5800, lon: -1.2000 },
  'TS4': { lat: 54.5900, lon: -1.1800 },
  'TS5': { lat: 54.5700, lon: -1.3500 },
  'TS6': { lat: 54.5300, lon: -1.2200 },
  'TS7': { lat: 54.5200, lon: -1.2600 },
  'TS8': { lat: 54.6000, lon: -1.1400 },
  'TS9': { lat: 54.6100, lon: -1.0900 },
  'TS10': { lat: 54.6050, lon: -1.0700 },
  'TS15': { lat: 54.5350, lon: -1.4150 },
  'TS16': { lat: 54.5250, lon: -1.3600 },
  'TS17': { lat: 54.5550, lon: -1.3600 },
  'TS18': { lat: 54.5680, lon: -1.3200 },
  'TS19': { lat: 54.5800, lon: -1.4200 },
  'TS20': { lat: 54.6500, lon: -1.1200 },
  'TS23': { lat: 54.5850, lon: -1.2700 },
  'TS24': { lat: 54.6920, lon: -1.2000 },
  'TS25': { lat: 54.6850, lon: -1.1650 },
  'TS26': { lat: 54.6700, lon: -1.3000 }
};

async function postcodeToCoords(postcode) {
  const normalizedPostcode = postcode.toUpperCase().replace(/\s+/g, '');
  const postcodeMatch = normalizedPostcode.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})?$/);

  if (!postcodeMatch) {
    return null;
  }

  try {
    const response = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(normalizedPostcode)}`);

    if (response.ok) {
      const data = await response.json();
      const result = data && data.result;

      if (Number.isFinite(result?.latitude) && Number.isFinite(result?.longitude)) {
        return {
          lat: result.latitude,
          lon: result.longitude
        };
      }
    }
  } catch (error) {
    console.warn('Unable to look up postcode using postcodes.io:', error);
  }

  return fallbackPostcodeMap[postcodeMatch[1]] || null;
}

// Distance Calculation (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3959; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Generate unique IDs
function generateId(prefix) {
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// Date validation
function isDateValid(dateString) {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
}

// Filter locations by age group and date
function normalizeAgeGroup(ageGroup) {
  return String(ageGroup || '').trim().toLowerCase();
}

function matchAgeGroupValue(eventAgeGroup, targetAgeGroup) {
  const normalizedEvent = normalizeAgeGroup(eventAgeGroup);
  const normalizedTarget = normalizeAgeGroup(targetAgeGroup);

  if (normalizedTarget === '18+' || normalizedTarget === '18 years and over' || normalizedTarget === 'adults 18+') {
    return normalizedEvent.includes('18') && (normalizedEvent.includes('+') || normalizedEvent.includes('adult') || normalizedEvent.includes('over'));
  }

  if (normalizedTarget === 'under 18' || normalizedTarget === '<18' || normalizedTarget === 'under18' || normalizedTarget === 'young people') {
    return normalizedEvent.includes('under') || normalizedEvent.includes('<18') || normalizedEvent.includes('youth');
  }

  return normalizedEvent === normalizedTarget;
}

function filterEventsByAge(events, ageGroup) {
  if (ageGroup === 'all') {
    return events;
  }

  return events.filter(evt => matchAgeGroupValue(evt.ageGroup, ageGroup));
}

function filterActivateEvents(events) {
  return events.filter(isEventPubliclyVisible);
}

// Modal Management
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
  }
}

// Format date for display
function formatDate(dateString) {
  if (!dateString || !isDateValid(dateString)) {
    return 'Date TBC';
  }

  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateString).toLocaleDateString('en-GB', options);
}
