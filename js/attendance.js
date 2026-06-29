/**
 * Public attendance reporting
 */

let attendanceData = { locations: [] };

function getAttendanceLocationSelect() {
  return document.getElementById('attendanceLocation');
}

function getAttendanceEventSelect() {
  return document.getElementById('attendanceEvent');
}

function getAttendanceLocation(locationId) {
  return (attendanceData.locations || []).find(location => location.id === locationId);
}

function getAttendanceEvent(location, eventId) {
  return (location?.events || []).find(event => event.id === eventId);
}

function formatAttendanceEventOption(event) {
  const normalizedEvent = normalizeEvent(event);
  const dateText = normalizedEvent.startDate ? ` - ${normalizedEvent.startDate}` : '';
  const timeText = normalizedEvent.time ? ` at ${normalizedEvent.time}` : '';
  return `${normalizedEvent.title}${dateText}${timeText}`;
}

function populateAttendanceLocations() {
  const locationSelect = getAttendanceLocationSelect();
  if (!locationSelect) {
    return;
  }

  const locations = (attendanceData.locations || [])
    .filter(location => Array.isArray(location.events) && location.events.length > 0);

  locationSelect.innerHTML = '<option value="">Select location</option>';

  locations.forEach(location => {
    const option = document.createElement('option');
    option.value = location.id;
    option.textContent = location.name;
    locationSelect.appendChild(option);
  });

  if (locations.length === 0) {
    locationSelect.innerHTML = '<option value="">No locations available</option>';
  }
}

function populateAttendanceEvents(locationId) {
  const eventSelect = getAttendanceEventSelect();
  if (!eventSelect) {
    return;
  }

  const location = getAttendanceLocation(locationId);
  const events = (location?.events || []).filter(event => normalizeEvent(event).status !== 'inactive');

  eventSelect.innerHTML = '<option value="">Select event</option>';
  eventSelect.disabled = !location;

  events.forEach(event => {
    const option = document.createElement('option');
    option.value = event.id;
    option.textContent = formatAttendanceEventOption(event);
    eventSelect.appendChild(option);
  });

  if (location && events.length === 0) {
    eventSelect.innerHTML = '<option value="">No events available for this location</option>';
    eventSelect.disabled = true;
  }
}

function resetAttendanceForm() {
  const eventSelect = getAttendanceEventSelect();
  document.getElementById('attendanceSession').value = '';
  document.getElementById('attendanceCount').value = '';
  document.getElementById('attendanceNotes').value = '';

  if (eventSelect) {
    eventSelect.value = '';
  }
}

function getSelectedAttendanceReport() {
  const locationId = document.getElementById('attendanceLocation').value;
  const eventId = document.getElementById('attendanceEvent').value;
  const sessionNumber = Number(document.getElementById('attendanceSession').value);
  const sessionDate = document.getElementById('attendanceDate').value;
  const attendedCount = Number(document.getElementById('attendanceCount').value);
  const notes = document.getElementById('attendanceNotes').value;
  const location = getAttendanceLocation(locationId);
  const event = getAttendanceEvent(location, eventId);

  return {
    locationId,
    locationName: location?.name || '',
    eventId,
    eventTitle: event?.title || '',
    sessionNumber,
    sessionDate,
    attendedCount,
    notes
  };
}

function validateAttendanceReport(report) {
  if (!report.locationId) {
    return 'Please choose a location.';
  }

  if (!report.eventId) {
    return 'Please choose an event.';
  }

  if (!Number.isInteger(report.sessionNumber) || report.sessionNumber < 1 || report.sessionNumber > 4) {
    return 'Please choose the session number.';
  }

  if (!isDateValid(report.sessionDate)) {
    return 'Please choose the session date.';
  }

  if (!Number.isInteger(report.attendedCount) || report.attendedCount < 0 || report.attendedCount > 10000) {
    return 'Please enter a valid attendance count.';
  }

  return '';
}

async function saveAttendanceReport() {
  const saveButton = document.getElementById('saveAttendanceButton');
  const report = getSelectedAttendanceReport();
  const validationMessage = validateAttendanceReport(report);

  if (validationMessage) {
    showError(validationMessage);
    return;
  }

  if (saveButton) {
    saveButton.disabled = true;
  }

  const saved = await saveAttendanceReportToFirestore(report);

  if (saveButton) {
    saveButton.disabled = false;
  }

  if (!saved) {
    showError(getLastFirestoreWriteError() || 'Attendance could not be saved.');
    return;
  }

  showSuccess('Attendance saved. Thank you.');
  resetAttendanceForm();
}

async function initializeAttendancePage() {
  document.getElementById('attendanceDate').value = getTodayString();
  attendanceData = await getEventsData();
  populateAttendanceLocations();
}

document.addEventListener('DOMContentLoaded', function() {
  initializeAttendancePage();

  const locationSelect = getAttendanceLocationSelect();
  if (locationSelect) {
    locationSelect.addEventListener('change', function() {
      populateAttendanceEvents(this.value);
    });
  }

  const saveButton = document.getElementById('saveAttendanceButton');
  if (saveButton) {
    saveButton.addEventListener('click', saveAttendanceReport);
  }
});
