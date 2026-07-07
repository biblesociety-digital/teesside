/**
 * Main App Logic - Teesside Events Map
 */

let map;
let markers = [];
let markerClusterGroup = null;
let selectedEventMarker = null;
let eventCardMaps = [];
let visibleLocations = [];
let currentLocationSet = [];
let searchMarker = null;
let searchRadiusCircle = null;
let lastSearchCoords = null;
let eventsData = {};
let currentTimeOfDayFilter = 'all';
let currentDayOfWeekFilter = 'all';
let currentPage = 1;
let searchRadius = 0.25;
let lastTotalEventCount = 0;
const EVENTS_PER_PAGE = 10;
const MIN_SEARCH_RADIUS = 0.25;
const MAX_SEARCH_RADIUS = 100;
const DEFAULT_TIMEFRAME_FILTER = 'next3weeks';
const EVENT_SESSION_COUNT = 4;
const RECAPTCHA_SITE_KEY_PLACEHOLDER = 'REPLACE_WITH_RECAPTCHA_SITE_KEY';
let currentTimeframeFilter = DEFAULT_TIMEFRAME_FILTER;
let currentPageEvents = [];
let selectedMapEvent = null;
let resultMapModalMap = null;
let resultMapModalMarker = null;
let resultMapModalTrigger = null;
let recaptchaLoaderPromise = null;
const DAY_INDEXES = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};

async function initializeApp() {
  // Load events data
  eventsData = await getEventsData();
  visibleLocations = getAllLocations();
  currentLocationSet = visibleLocations;

  loadRecaptchaScript();
  
  // Initialize map
  initializeMap();

  // Setup event listeners before the first render so responsive map refreshes are ready.
  setupEventListeners();
  
  // Display upcoming events matching the default filters
  renderLocations(currentLocationSet);
  await hydrateSearchFromUrl();

  refreshMobileLandingMap();
}

function initializeMap() {
  // Center on Stockton-on-Tees (center of Teesside)
  const center = [54.5700, -1.3200];
  
  map = L.map('mapContainer', {
    scrollWheelZoom: false,
    touchZoom: true,
    zoomControl: true
  }).setView(center, 11);
  
  // Add OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);
  
  // Add markers for all locations
  addLocationMarkers(visibleLocations);
}

function addLocationMarkers(locations = getAllLocations()) {
  removeSelectedEventMarker();

  // Clear existing markers
  if (markerClusterGroup) {
    map.removeLayer(markerClusterGroup);
  }
  markerClusterGroup = createMarkerLayer();
  markers = [];
  
  locations.forEach(location => {
    if (hasValidCoordinates(location)) {
      // Count active events matching current filters
      const eventCount = getVisibleEventCount(location);

      if (eventCount === 0) {
        return;
      }
      
      // Create marker
      const marker = L.marker([location.latitude, location.longitude], {
        icon: createEventMarkerIcon(),
        title: location.name
      });
      marker.locationId = location.id;
      marker.bindPopup(createEventCardPopup(location), {
        className: 'event-card-popup',
        closeButton: false,
        maxWidth: 340,
        minWidth: 300,
        offset: [0, -18]
      });

      marker.on('click', function() {
        selectLocationEvent(location.id);
      });
      
      // Add marker to cluster group
      markerClusterGroup.addLayer(marker);
      markers.push(marker);
    }
  });
  
  // Add cluster group to map
  map.addLayer(markerClusterGroup);
}

function addCloseMatchEventMarkers(events) {
  removeSelectedEventMarker();

  if (markerClusterGroup) {
    map.removeLayer(markerClusterGroup);
  }

  markerClusterGroup = createMarkerLayer();
  markers = [];

  const markerEventsByLocation = new Map();

  events.forEach(event => {
    if (!event?.locationId || markerEventsByLocation.has(event.locationId) || !hasValidCoordinates(event)) {
      return;
    }

    markerEventsByLocation.set(event.locationId, event);
  });

  markerEventsByLocation.forEach(event => {
    const marker = L.marker([event.latitude, event.longitude], {
      icon: createEventMarkerIcon(),
      title: event.locationName || event.title || 'Event location'
    });

    marker.locationId = event.locationId;
    marker.eventKey = getEventKey(event);
    marker.bindPopup(createSelectedEventPopup(event), {
      className: 'event-card-popup',
      closeButton: false,
      maxWidth: 340,
      minWidth: 300,
      offset: [0, -18]
    });

    marker.on('click', function() {
      selectedMapEvent = event;
      highlightSelectedEventCard();
    });

    markerClusterGroup.addLayer(marker);
    markers.push(marker);
  });

  visibleLocations = Array.from(markerEventsByLocation.values()).map(event => ({
    id: event.locationId,
    name: event.locationName,
    address: event.address,
    postcode: event.postcode,
    latitude: event.latitude,
    longitude: event.longitude,
    events: [event]
  }));

  map.addLayer(markerClusterGroup);
}

function createEventCardPopup(location) {
  const popup = document.createElement('div');
  const event = getMapPopupEvent(location);

  if (!event) {
    return popup;
  }

  popup.innerHTML = renderEventCard(event, `map-popup-${location.id}`, {
    compact: true,
    hideMap: true,
    hidePopupDetails: true,
    popupCard: true,
    selected: true,
    actionLabel: 'More details'
  });

  return popup;
}

function createMarkerLayer() {
  if (typeof L.markerClusterGroup === 'function') {
    return L.markerClusterGroup({
      disableClusteringAtZoom: 16,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true
    });
  }

  showError('Marker clustering library did not load. Showing individual markers.');
  return L.layerGroup();
}

function getAllLocations() {
  return Array.isArray(eventsData.locations) ? eventsData.locations : [];
}

function hasValidCoordinates(location) {
  return Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude));
}

function renderLocations(locations) {
  const filteredLocations = applyLocationFilters(locations).filter(locationHasVisibleEvents);
  visibleLocations = filteredLocations;
  addLocationMarkers(visibleLocations);
  displayFilteredEvents(getFilteredEvents(visibleLocations));
  refreshMapViewIfVisible();
}

function getVisibleEventCount(location) {
  let visibleEvents = filterActivateEvents(location.events || []);
  visibleEvents = filterEventsByDayOfWeek(visibleEvents, currentDayOfWeekFilter);
  visibleEvents = filterEventsByTimeOfDay(visibleEvents, currentTimeOfDayFilter);

  return visibleEvents.filter(event => {
    return getVisibleEventOccurrenceDates(event).length > 0;
  }).length;
}

function locationHasVisibleEvents(location) {
  return getVisibleEventCount(location) > 0;
}

function setupEventListeners() {
  setupPrimaryNav();
  setupFilterPills();
  setupResultsViewToggle();
  setupFilterPanel();
  setupResultMapModal();
  setupAgeConfirmationGate();

  // Postcode input - allow Enter key
  const postcodeInput = document.getElementById('postcodeInput');
  if (postcodeInput) {
    postcodeInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        searchByPostcode();
      }
    });
  }

  const postcodeSearchButton = document.getElementById('postcodeSearchButton');
  if (postcodeSearchButton) {
    postcodeSearchButton.addEventListener('click', searchByPostcode);
  }

  const paginationElement = document.getElementById('eventsPagination');
  if (paginationElement) {
    paginationElement.addEventListener('click', function(event) {
      const pageButton = event.target.closest('[data-page]');
      if (!pageButton || pageButton.disabled) {
        return;
      }

      goToPage(Number(pageButton.dataset.page));
    });
  }
  
  // Radius input
  const radiusInput = document.getElementById('radiusInput');
  if (radiusInput) {
    radiusInput.addEventListener('change', function() {
      searchRadius = clampSearchRadius(this.value);
      this.value = searchRadius;
    });
  }

  const eventsList = document.getElementById('eventsList');
  if (eventsList) {
    eventsList.addEventListener('click', handleEventCardMapToggle);
    eventsList.addEventListener('keydown', handleEventCardMapToggle);
    eventsList.addEventListener('click', handleResultMapModalToggle);
    eventsList.addEventListener('keydown', handleResultMapModalToggle);
    eventsList.addEventListener('click', handleSearchResultCardSelection);
    eventsList.addEventListener('keydown', handleSearchResultCardSelection);
    eventsList.addEventListener('click', handleEventbriteActionLink);
    eventsList.addEventListener('click', handleMissingEventbriteLink);
  }

  const clearEventFilters = document.getElementById('clearEventFilters');
  if (clearEventFilters) {
    clearEventFilters.addEventListener('click', resetEventFilters);
  }

  window.addEventListener('load', refreshMobileLandingMap);
  window.addEventListener('resize', refreshMobileLandingMap);

  setupFilterSearchInputs();
  syncFilterControls();
}

function getRecaptchaSiteKey() {
  const siteKeyMeta = document.querySelector('meta[name="recaptcha-site-key"]');
  const siteKey = siteKeyMeta?.content?.trim() || '';

  if (!siteKey || siteKey === RECAPTCHA_SITE_KEY_PLACEHOLDER) {
    return '';
  }

  return siteKey;
}

function loadRecaptchaScript() {
  const siteKey = getRecaptchaSiteKey();

  if (!siteKey || window.grecaptcha) {
    return Promise.resolve();
  }

  if (recaptchaLoaderPromise) {
    return recaptchaLoaderPromise;
  }

  const script = document.createElement('script');
  script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
  script.async = true;
  script.defer = true;
  script.dataset.recaptchaLoader = 'true';

  recaptchaLoaderPromise = new Promise((resolve, reject) => {
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', () => {
      recaptchaLoaderPromise = null;
      reject(new Error('reCAPTCHA could not be loaded.'));
    }, { once: true });
  });

  document.head.appendChild(script);
  return recaptchaLoaderPromise;
}

async function getRecaptchaToken(action = 'postcode_search') {
  const siteKey = getRecaptchaSiteKey();

  if (!siteKey) {
    console.warn('reCAPTCHA site key is not configured. Postcode search is running without a CAPTCHA token.');
    return '';
  }

  await loadRecaptchaScript();

  if (!window.grecaptcha?.ready || typeof window.grecaptcha.execute !== 'function') {
    throw new Error('reCAPTCHA is not ready yet. Please try again in a moment.');
  }

  return new Promise((resolve, reject) => {
    window.grecaptcha.ready(() => {
      window.grecaptcha.execute(siteKey, { action })
        .then(resolve)
        .catch(reject);
    });
  });
}

function setupAgeConfirmationGate() {
  const ageConfirmation = document.getElementById('ageConfirmation');
  const postcodeSearchButton = document.getElementById('postcodeSearchButton');

  if (!ageConfirmation || !postcodeSearchButton) {
    return;
  }

  function syncSearchAvailability() {
    const isAllowed = ageConfirmation.checked;
    postcodeSearchButton.disabled = !isAllowed;
    postcodeSearchButton.setAttribute('aria-disabled', String(!isAllowed));
  }

  ageConfirmation.addEventListener('change', syncSearchAvailability);
  syncSearchAvailability();
}

function setupResultsViewToggle() {
  const viewButtons = document.querySelectorAll('[data-results-view-button]');

  viewButtons.forEach(button => {
    button.addEventListener('click', function() {
      setResultsView(this.dataset.resultsViewButton);
    });
  });

  setResultsView(document.body.dataset.resultsView || 'list', { preserveSearchState: true });
}

function setResultsView(view, options = {}) {
  const selectedView = view === 'map' ? 'map' : 'list';
  if (!options.preserveSearchState) {
    setLandingSearchState('results');
  }
  document.body.dataset.resultsView = selectedView;

  document.querySelectorAll('[data-results-view-button]').forEach(button => {
    const isActive = button.dataset.resultsViewButton === selectedView;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });

  const viewLabel = document.getElementById('resultsViewLabel');
  if (viewLabel) {
    viewLabel.textContent = selectedView === 'map' ? 'Map' : 'List';
  }

  if (selectedView === 'map') {
    window.setTimeout(refreshMapView, 0);
    highlightSelectedEventCard();
    return;
  }

  window.setTimeout(() => {
    renderVisibleEventCardMaps();
    refreshEventCardMaps();
  }, 0);
}

function refreshEventCardMaps() {
  eventCardMaps.forEach(cardMap => {
    cardMap.invalidateSize();
  });
}

function refreshMapViewIfVisible() {
  if (document.body.dataset.resultsView === 'map' || isLandingInitialSearchView() || isMobileLandingView()) {
    window.setTimeout(refreshMapView, 0);
  }
}

function refreshMobileLandingMap() {
  if (!isMobileLandingView()) {
    return;
  }

  window.setTimeout(refreshMapView, 0);
}

function refreshMapView() {
  if (!map || typeof L === 'undefined') {
    return;
  }

  map.invalidateSize();

  if (searchRadiusCircle) {
    map.fitBounds(searchRadiusCircle.getBounds(), {
      padding: [24, 24],
      maxZoom: 13
    });
    return;
  }

  const visibleCoordinates = visibleLocations
    .filter(hasValidCoordinates)
    .map(location => [Number(location.latitude), Number(location.longitude)]);

  if (visibleCoordinates.length > 1) {
    map.fitBounds(L.latLngBounds(visibleCoordinates), {
      padding: [32, 32],
      maxZoom: 13
    });
    return;
  }

  if (visibleCoordinates.length === 1) {
    map.setView(visibleCoordinates[0], 14);
    return;
  }

  map.setView([54.5700, -1.3200], 11);
}

function setupFilterPanel() {
  const toggleButton = document.getElementById('filterPanelToggle');
  const panel = document.getElementById('filterPanel');
  const backdrop = document.getElementById('filterPanelBackdrop');
  const closeButton = document.getElementById('filterPanelClose');
  const applyButton = document.getElementById('filterPanelApply');
  const changeSearchButton = document.getElementById('changeSearchButton');

  if (!toggleButton || !panel || !backdrop) {
    return;
  }

  function openPanel() {
    syncFilterControls();
    syncFilterPanelSearchFields();
    backdrop.hidden = false;
    document.body.classList.add('filter-panel-open');
    panel.setAttribute('aria-hidden', 'false');
    toggleButton.setAttribute('aria-expanded', 'true');

    if (closeButton) {
      closeButton.focus();
    }
  }

  function closePanel() {
    document.body.classList.remove('filter-panel-open');
    panel.setAttribute('aria-hidden', 'true');
    toggleButton.setAttribute('aria-expanded', 'false');
    backdrop.hidden = true;
  }

  toggleButton.addEventListener('click', function() {
    if (document.body.classList.contains('filter-panel-open')) {
      closePanel();
      return;
    }

    openPanel();
  });

  backdrop.addEventListener('click', closePanel);

  if (closeButton) {
    closeButton.addEventListener('click', closePanel);
  }

  if (applyButton) {
    applyButton.addEventListener('click', async function() {
      await applyFilterPanelSearch();
      closePanel();
    });
  }

  if (changeSearchButton) {
    changeSearchButton.addEventListener('click', function() {
      setLandingSearchState('initial');
      const searchSection = document.querySelector('.search-section');
      const postcodeInput = document.getElementById('postcodeInput');

      if (searchSection) {
        searchSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      if (postcodeInput) {
        postcodeInput.focus();
      }

      refreshMapViewIfVisible();
    });
  }

  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && document.body.classList.contains('filter-panel-open')) {
      closePanel();
    }
  });
}

function setupFilterSearchInputs() {
  const filterPostcodeInput = document.getElementById('filterPostcodeInput');
  const filterRadiusInput = document.getElementById('filterRadiusInput');

  if (filterPostcodeInput) {
    filterPostcodeInput.addEventListener('keydown', function(event) {
      if (event.key === 'Enter') {
        event.preventDefault();
      }
    });
  }

  if (filterRadiusInput) {
    filterRadiusInput.addEventListener('change', function() {
      this.value = clampSearchRadius(this.value);
    });
  }
}

function syncFilterPanelSearchFields() {
  const postcodeInput = document.getElementById('postcodeInput');
  const radiusInput = document.getElementById('radiusInput');
  const filterPostcodeInput = document.getElementById('filterPostcodeInput');
  const filterRadiusInput = document.getElementById('filterRadiusInput');

  if (postcodeInput && filterPostcodeInput) {
    filterPostcodeInput.value = postcodeInput.value;
  }

  if (radiusInput && filterRadiusInput) {
    filterRadiusInput.value = radiusInput.value;
  }
}

async function applyFilterPanelSearch() {
  const postcodeInput = document.getElementById('postcodeInput');
  const radiusInput = document.getElementById('radiusInput');
  const filterPostcodeInput = document.getElementById('filterPostcodeInput');
  const filterRadiusInput = document.getElementById('filterRadiusInput');

  currentTimeframeFilter = getSelectedFilterValue('timeframe', DEFAULT_TIMEFRAME_FILTER);
  currentTimeOfDayFilter = getSelectedFilterValue('timeOfDay', 'all');
  currentDayOfWeekFilter = getSelectedFilterValue('dayOfWeek', 'all');

  if (filterPostcodeInput && postcodeInput) {
    postcodeInput.value = filterPostcodeInput.value.trim();
  }

  if (filterRadiusInput && radiusInput) {
    const radius = clampSearchRadius(filterRadiusInput.value);
    filterRadiusInput.value = radius;
    radiusInput.value = radius;
    searchRadius = radius;
  }

  if (postcodeInput?.value.trim()) {
    await searchByPostcode({ preserveResultsView: true });
    return;
  }

  currentPage = 1;
  renderLocations(currentLocationSet);
  setResultsView(document.body.dataset.resultsView || 'list', { preserveSearchState: true });
}

function setupPrimaryNav() {
  const menuToggle = document.querySelector('.menu-toggle');
  const primaryNav = document.getElementById('primaryNav');

  if (!menuToggle || !primaryNav) {
    return;
  }

  menuToggle.addEventListener('click', function() {
    const isOpen = primaryNav.classList.toggle('is-open');
    this.setAttribute('aria-expanded', String(isOpen));
    this.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
  });

  primaryNav.addEventListener('click', function(event) {
    if (!event.target.closest('a')) {
      return;
    }

    primaryNav.classList.remove('is-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Open menu');
  });

  document.addEventListener('click', function(event) {
    if (!primaryNav.classList.contains('is-open')) {
      return;
    }

    if (primaryNav.contains(event.target) || menuToggle.contains(event.target)) {
      return;
    }

    primaryNav.classList.remove('is-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Open menu');
  });
}

function setupFilterPills() {
  document.querySelectorAll('.filter-pill[data-filter-target]').forEach(button => {
    button.addEventListener('click', function() {
      const target = this.dataset.filterTarget;
      const value = this.dataset.filterValue || 'all';

      setFilterPillState(target, value);
    });
  });
}

async function searchByPostcode(options = {}) {
  const ageConfirmation = document.getElementById('ageConfirmation');
  if (ageConfirmation && !ageConfirmation.checked) {
    showError('Please confirm you are 18 or over before searching.');
    ageConfirmation.focus();
    return;
  }

  const postcode = document.getElementById('postcodeInput')?.value.trim() || '';
  const radiusInput = document.getElementById('radiusInput');
  searchRadius = clampSearchRadius(radiusInput?.value);

  if (radiusInput) {
    radiusInput.value = searchRadius;
  }
  
  if (!postcode) {
    showError('Please enter a postcode');
    return;
  }

  try {
    await getRecaptchaToken('postcode_search');
  } catch (error) {
    console.warn('reCAPTCHA check failed:', error);
    showError('We could not verify this search. Please refresh the page and try again.');
    return;
  }
  
  // Convert postcode to coordinates
  const coords = await postcodeToCoords(postcode);

  if (!coords) {
    showError('Postcode not recognised. Please enter a valid UK postcode.');
    return;
  }
  lastSearchCoords = coords;
  
  // Find locations within radius
  const nearbyLocations = findNearbyLocations(coords.lat, coords.lon, searchRadius);
  const defaultResultsView = options.preserveResultsView
    ? (document.body.dataset.resultsView || 'list')
    : (isMobileLandingView() ? 'list' : 'map');
  addSearchMarker(coords, searchRadius);
  fitMapToSearchArea(coords);
  
  if (nearbyLocations.length === 0) {
    showInfo(`No churches found within ${searchRadius} miles of that postcode`);
    currentLocationSet = [];
    currentPage = 1;
    setLandingSearchState('results');
    setResultsView(defaultResultsView);
    renderLocations([]);
  } else {
    // Filter events and display
    currentLocationSet = nearbyLocations;
    currentPage = 1;
    setLandingSearchState('results');
    setResultsView(defaultResultsView);
    renderLocations(currentLocationSet);
  }

  scrollResultsToTop();
}

async function hydrateSearchFromUrl() {
  if (!document.body.classList.contains('landing-page')) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const postcode = params.get('postcode')?.trim();

  if (!postcode) {
    return;
  }

  const postcodeInput = document.getElementById('postcodeInput');
  const radiusInput = document.getElementById('radiusInput');
  const filterPostcodeInput = document.getElementById('filterPostcodeInput');
  const filterRadiusInput = document.getElementById('filterRadiusInput');
  const radius = clampSearchRadius(params.get('radius'));

  if (postcodeInput) {
    postcodeInput.value = postcode;
  }

  if (filterPostcodeInput) {
    filterPostcodeInput.value = postcode;
  }

  if (radiusInput) {
    radiusInput.value = radius;
  }

  if (filterRadiusInput) {
    filterRadiusInput.value = radius;
  }

  searchRadius = radius;
  await searchByPostcode();
}

function setLandingSearchState(state) {
  if (!document.body.classList.contains('landing-page')) {
    return;
  }

  document.body.dataset.searchState = state === 'results' ? 'results' : 'initial';
}

function scrollResultsToTop() {
  const eventsSection = document.querySelector('.events-section');
  const resultsSection = document.querySelector('.results-section');

  if (eventsSection) {
    eventsSection.scrollTop = 0;
  }

  if (resultsSection) {
    window.requestAnimationFrame(() => {
      resultsSection.scrollIntoView({ block: 'start' });
    });
  }
}

function clampSearchRadius(value) {
  return Math.min(Math.max(parseFloat(value) || 5, MIN_SEARCH_RADIUS), MAX_SEARCH_RADIUS);
}

function addSearchMarker(coords, radiusMiles) {
  if (searchMarker) {
    map.removeLayer(searchMarker);
  }

  if (searchRadiusCircle) {
    map.removeLayer(searchRadiusCircle);
  }

  searchRadiusCircle = L.circle([coords.lat, coords.lon], {
    radius: radiusMiles * 1609.344,
    color: '#1a5490',
    fillColor: '#1a5490',
    fillOpacity: 0.08,
    opacity: 0.85,
    weight: 2
  }).addTo(map);

  searchMarker = L.circleMarker([coords.lat, coords.lon], {
    radius: 8,
    color: '#e74c3c',
    fillColor: '#e74c3c',
    fillOpacity: 0.9,
    weight: 2
  }).addTo(map);
}

function fitMapToSearchArea(coords) {
  if (searchRadiusCircle) {
    map.fitBounds(searchRadiusCircle.getBounds(), {
      padding: [24, 24],
      maxZoom: 13
    });
    return;
  }

  map.setView([coords.lat, coords.lon], 12);
}

function findNearbyLocations(lat, lon, radiusMiles) {
  return getAllLocations().filter(location => {
    if (!hasValidCoordinates(location)) {
      return false;
    }

    const distance = calculateDistance(lat, lon, location.latitude, location.longitude);
    return distance <= radiusMiles;
  });
}

function getFilteredEvents(locations) {
  const allEvents = [];
  
  locations.forEach(location => {
    const activeEvents = filterActivateEvents(location.events || []);
    const dayFilteredEvents = filterEventsByDayOfWeek(activeEvents, currentDayOfWeekFilter);
    const filteredEvents = filterEventsByTimeOfDay(dayFilteredEvents, currentTimeOfDayFilter);
    
    filteredEvents.forEach(event => {
      const occurrenceDates = getVisibleEventOccurrenceDates(event);
      const nextOccurrenceDate = occurrenceDates[0];

      if (!nextOccurrenceDate) {
        return;
      }

      allEvents.push({
        ...event,
        nextOccurrenceDate: dateToDateString(nextOccurrenceDate),
        locationName: location.name,
        locationId: location.id,
        latitude: location.latitude,
        longitude: location.longitude,
        postcode: location.postcode,
        address: location.address
      });
    });
  });
  
  const sortedEvents = sortEventsByDate(allEvents);
  lastTotalEventCount = sortedEvents.length;

  return sortedEvents;
}

function getCloseMatchEvents() {
  const fallbackEvents = [];

  getAllLocations().forEach(location => {
    const activeEvents = filterActivateEvents(location.events || []);
    const distance = lastSearchCoords && hasValidCoordinates(location)
      ? calculateDistance(lastSearchCoords.lat, lastSearchCoords.lon, location.latitude, location.longitude)
      : Number.POSITIVE_INFINITY;

    activeEvents.forEach(event => {
      const nextOccurrenceDate = getNextEventOccurrenceDate(event);

      if (!nextOccurrenceDate) {
        return;
      }

      fallbackEvents.push({
        ...event,
        nextOccurrenceDate: dateToDateString(nextOccurrenceDate),
        matchDistance: distance,
        locationName: location.name,
        locationId: location.id,
        latitude: location.latitude,
        longitude: location.longitude,
        postcode: location.postcode,
        address: location.address
      });
    });
  });

  return fallbackEvents
    .sort((a, b) => {
      const dateCompare = getEventSortValue(a).localeCompare(getEventSortValue(b));

      if (dateCompare !== 0) {
        return dateCompare;
      }

      const distanceA = Number.isFinite(a.matchDistance) ? a.matchDistance : Number.POSITIVE_INFINITY;
      const distanceB = Number.isFinite(b.matchDistance) ? b.matchDistance : Number.POSITIVE_INFINITY;
      return distanceA - distanceB;
    })
    .slice(0, EVENTS_PER_PAGE);
}

function sortEventsByDate(events) {
  return events.sort((a, b) => {
    return getEventSortValue(a).localeCompare(getEventSortValue(b));
  });
}

function getEventSortValue(event) {
  return `${event.nextOccurrenceDate || event.startDate || '9999-12-31'} ${event.time || '23:59'} ${event.title || ''}`;
}

function displayFilteredEvents(events) {
  const eventsList = document.getElementById('eventsList');
  destroyEventCardMaps();
  let displayEvents = events;
  let closeMatchMessage = '';

  if (events.length === 0) {
    displayEvents = getCloseMatchEvents();
    closeMatchMessage = 'There are no current events with those filters but here are some other events that are a close match';
  }

  const paged = getPagedEvents(displayEvents);
  currentPageEvents = paged.pageEvents;
  updateEventCount(events.length === 0 ? 0 : paged.totalCount);
  
  if (paged.totalCount === 0) {
    eventsList.innerHTML = '<p class="empty-state">No upcoming active events found with current filters.</p>';
    currentPageEvents = [];
    selectedMapEvent = null;
    removeSelectedEventMarker();
    renderPagination(0, 1, 0, 0, 0);
    return;
  }
  
  const closeMatchMarkup = closeMatchMessage
    ? `<p class="empty-state close-match-message">${escapeHTML(closeMatchMessage)}</p>`
    : '';

  if (closeMatchMessage) {
    addCloseMatchEventMarkers(displayEvents);
  }

  eventsList.innerHTML = closeMatchMarkup + paged.pageEvents
    .map((event, index) => renderEventCard(event, index))
    .join('');

  renderPagination(paged.totalPages, currentPage, paged.totalCount, paged.startIndex, paged.endIndex);
  clearInvalidSelectedMapEvent();
  highlightSelectedEventCard();
  window.setTimeout(renderVisibleEventCardMaps, 0);
  refreshMapViewIfVisible();
}

function renderEventCard(event, index, options = {}) {
  const eventbriteUrl = getSafeExternalUrl(event.eventbriteUrl);
  const cardUrl = eventbriteUrl || '#';
  const cardTarget = eventbriteUrl ? ' target="_blank" rel="noopener noreferrer"' : ' data-missing-eventbrite-link="true"';
  const cardLabel = eventbriteUrl ? 'Open Eventbrite booking for' : 'Missing Eventbrite booking link for';
  const eventKey = getEventKey(event);
  const actionLabel = options.actionLabel || 'More details';
  const selectedClass = options.selected ? ' selected' : '';
  const compactClass = options.compact ? ' compact-event-card' : '';
  const popupCardClass = options.popupCard ? ' map-popup-card' : '';
  const description = event.description || 'Join a relaxed chat over coffee. Come and go as your time allows.';
  const mapLinkMarkup = !options.hidePopupDetails && hasValidCoordinates(event)
    ? ` <span class="event-card-address-separator" aria-hidden="true">•</span> <span class="event-card-map-modal-link" role="link" tabindex="0" data-event-key="${escapeAttribute(eventKey)}">view map</span>`
    : '';
  const detailsMarkup = options.hidePopupDetails ? '' : `
      <p class="event-card-address event-card-meta-item">
        <img src="img/icon-location.svg" alt="" aria-hidden="true">
        <span class="event-card-meta-text">${escapeHTML(getEventAddressLine(event))}${mapLinkMarkup}</span>
      </p>
      <p class="event-card-description">${escapeHTML(description)}</p>`;
  const actionMarkup = options.hidePopupDetails ? '' : `
      <span class="event-link">${escapeHTML(actionLabel)}</span>`;

  return `
    <a class="event-card event-card-link search-result-card${selectedClass}${compactClass}${popupCardClass}" href="${escapeAttribute(cardUrl)}"${cardTarget} data-event-key="${escapeAttribute(eventKey)}" aria-label="${cardLabel} ${escapeAttribute(event.title || 'event')}">
      <h3>${escapeHTML(event.title || 'Bible Conversation')}</h3>${detailsMarkup}
      <div class="event-card-meta-row">
        <span class="event-card-chip event-card-date-chip event-card-meta-item">
          <img src="img/icon-date.svg" alt="" aria-hidden="true">
          <span class="event-card-meta-text">${escapeHTML(formatResultDateChip(event))}</span>
        </span>
        <span class="event-card-chip event-card-time-chip event-card-meta-item">
          <img src="img/icon-time.svg" alt="" aria-hidden="true">
          <span class="event-card-meta-text">${escapeHTML(formatResultTimeChip(event.time))}</span>
        </span>
      </div>${actionMarkup}
    </a>
  `;
}

function updateEventCount(count) {
  const eventCount = document.getElementById('eventCount');
  const eventCountSummary = document.getElementById('eventCountSummary');
  const eventCountSummaryLabel = document.getElementById('eventCountSummaryLabel');
  const countText = String(count);

  if (eventCount) {
    eventCount.textContent = countText;
  }

  if (eventCountSummary) {
    eventCountSummary.textContent = countText;
  }

  if (eventCountSummaryLabel) {
    eventCountSummaryLabel.textContent = count === 1 ? 'event found' : 'events found';
  }
}

function formatCardDateTime(event, dateString) {
  const date = parseLocalDate(dateString);
  const dateText = date
    ? new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(date).replace(',', '')
    : formatDate(dateString);
  const timeText = formatCardTime(event.time);

  return timeText ? `${dateText} · ${timeText}` : dateText;
}

function formatCardTime(timeString) {
  const minutes = getEventStartMinutes(timeString);

  if (minutes === null) {
    return timeString || 'Time TBC';
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours >= 12 ? 'pm' : 'am';
  const displayHours = hours % 12 || 12;

  return `${displayHours}:${String(mins).padStart(2, '0')}${suffix}`;
}

function getEventAddressLine(event) {
  return event.address || event.locationName || event.postcode || 'Address TBC';
}

function formatResultDateChip(event) {
  const day = formatShortWeekday(event.dayOfWeek);
  const startDate = parseLocalDate(event.startDate || event.nextOccurrenceDate);

  if (!startDate) {
    return day;
  }

  const endDate = getEventSeriesEndDate(event, startDate);
  const startText = formatResultChipDate(startDate);
  const endText = endDate ? formatResultChipDate(endDate) : '';

  return endText ? `${day} • ${startText}–${endText}` : `${day} • ${startText}`;
}

function formatShortWeekday(dayName) {
  const dayIndexes = {
    sunday: 'Sun',
    monday: 'Mon',
    tuesday: 'Tue',
    wednesday: 'Wed',
    thursday: 'Thu',
    friday: 'Fri',
    saturday: 'Sat'
  };
  const normalizedDay = String(dayName || '').trim().toLowerCase();
  return dayIndexes[normalizedDay] || 'Weekly';
}

function formatResultChipDate(date) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
    .format(date)
    .replace('Sept', 'Sept')
    .replace('Sep', 'Sept');
}

function formatResultTimeChip(timeString) {
  const startMinutes = getEventStartMinutes(timeString);

  if (startMinutes === null) {
    return timeString || 'Time TBC';
  }

  const endMinutes = startMinutes + 60;
  const startSuffix = getResultTimeSuffix(startMinutes);
  const endSuffix = getResultTimeSuffix(endMinutes);
  const startText = formatResultChipTime(startMinutes);
  const endText = formatResultChipTime(endMinutes);

  return startSuffix === endSuffix
    ? `${startText}–${endText} ${endSuffix}`
    : `${startText} ${startSuffix}–${endText} ${endSuffix}`;
}

function getResultTimeSuffix(minutes) {
  const normalizedMinutes = ((minutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hours = Math.floor(normalizedMinutes / 60);
  return hours >= 12 ? 'pm' : 'am';
}

function formatResultChipTime(minutes) {
  const normalizedMinutes = ((minutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hours = Math.floor(normalizedMinutes / 60);
  const mins = normalizedMinutes % 60;
  const displayHours = hours % 12 || 12;

  return `${displayHours}.${String(mins).padStart(2, '0')}`;
}

function getEventLocationLine(event) {
  const locationName = event.locationName || 'Location TBC';
  const address = event.address || event.postcode || '';
  return address ? `${locationName} · ${address}` : locationName;
}

function getEventSeriesLine(event) {
  const day = event.dayOfWeek ? `${capitalizeFirst(event.dayOfWeek)}s` : 'Weekly';
  return `${day} - 4 sessions`;
}

function capitalizeFirst(value) {
  const text = String(value || '').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : '';
}

function getEventTags(event) {
  const tags = ['First time friendly'];
  const minutes = getEventStartMinutes(event.time);

  if (minutes !== null && minutes >= 17 * 60) {
    tags.push('After work');
  } else {
    tags.push('Day time');
  }

  tags.push('+2');
  return tags;
}

function destroyEventCardMaps() {
  eventCardMaps.forEach(cardMap => {
    cardMap.remove();
  });
  eventCardMaps = [];
}

function handleEventCardMapToggle(event) {
  const toggle = event.target.closest('[data-card-map-toggle]');

  if (!toggle) {
    return;
  }

  if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  toggleEventCardMap(Number(toggle.dataset.cardMapIndex), toggle);
}

function setupResultMapModal() {
  const modal = document.getElementById('resultMapModal');

  if (!modal) {
    return;
  }

  modal.addEventListener('click', function(event) {
    if (event.target === modal || event.target.closest('[data-result-map-modal-close]')) {
      closeResultMapModal();
    }
  });

  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && !modal.hidden) {
      closeResultMapModal();
    }
  });
}

function handleResultMapModalToggle(event) {
  const trigger = event.target.closest('.event-card-map-modal-link[data-event-key]');

  if (!trigger) {
    return;
  }

  if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const selectedEvent = currentPageEvents.find(pageEvent => getEventKey(pageEvent) === trigger.dataset.eventKey);

  if (!selectedEvent) {
    return;
  }

  resultMapModalTrigger = trigger;
  openResultMapModal(selectedEvent);
}

function openResultMapModal(event) {
  const modal = document.getElementById('resultMapModal');
  const mapElement = document.getElementById('resultMapModalMap');
  const locationElement = document.getElementById('resultMapModalLocation');
  const latitude = Number(event?.latitude);
  const longitude = Number(event?.longitude);

  if (!modal || !mapElement || !locationElement || !Number.isFinite(latitude) || !Number.isFinite(longitude) || typeof L === 'undefined') {
    return;
  }

  locationElement.textContent = getEventAddressLine(event);
  modal.hidden = false;
  document.body.classList.add('result-map-modal-open');
  modal.querySelector('[data-result-map-modal-close]')?.focus();

  if (!resultMapModalMap) {
    resultMapModalMap = L.map(mapElement, {
      scrollWheelZoom: false,
      touchZoom: true,
      zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(resultMapModalMap);
  }

  resultMapModalMap.setView([latitude, longitude], 15);

  if (resultMapModalMarker) {
    resultMapModalMarker.remove();
  }

  resultMapModalMarker = L.marker([latitude, longitude], {
    icon: createEventMarkerIcon(),
    title: event.locationName || event.title || 'Event location'
  }).addTo(resultMapModalMap);

  window.setTimeout(() => {
    resultMapModalMap.invalidateSize();
  }, 0);
}

function closeResultMapModal() {
  const modal = document.getElementById('resultMapModal');

  if (!modal) {
    return;
  }

  modal.hidden = true;
  document.body.classList.remove('result-map-modal-open');

  if (resultMapModalTrigger?.isConnected) {
    resultMapModalTrigger.focus();
  }

  resultMapModalTrigger = null;
}

function handleSearchResultCardSelection(event) {
  const card = event.target.closest('.search-result-card[data-event-key]');

  if (!card || document.body.dataset.resultsView !== 'map') {
    return;
  }

  if (event.target.closest('.event-link')) {
    return;
  }

  if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  event.preventDefault();
  const eventKey = card.dataset.eventKey;
  const selectedEvent = currentPageEvents.find(pageEvent => getEventKey(pageEvent) === eventKey);

  if (!selectedEvent) {
    return;
  }

  selectedMapEvent = selectedEvent;
  focusEventOnMap(selectedEvent);
  highlightSelectedEventCard();
}

function handleEventbriteActionLink(event) {
  const actionLink = event.target.closest('.event-link');

  if (!actionLink) {
    return;
  }

  const card = actionLink.closest('.search-result-card[href]');

  if (!card || card.dataset.missingEventbriteLink === 'true') {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  window.open(card.href, '_blank', 'noopener,noreferrer');
}

function handleMissingEventbriteLink(event) {
  const missingLink = event.target.closest('[data-missing-eventbrite-link="true"]');

  if (!missingLink) {
    return;
  }

  if (document.body.dataset.resultsView === 'map' && !event.target.closest('.event-link')) {
    return;
  }

  event.preventDefault();
  window.alert('This event is missing its EventBright link');
}

function toggleEventCardMap(index, toggle) {
  const mapElement = document.querySelector(`.event-card-map[data-card-map-index="${index}"]`);
  const label = toggle.querySelector('[data-card-map-toggle-label]');

  if (!mapElement) {
    return;
  }

  const isOpening = mapElement.hidden;
  mapElement.hidden = !isOpening;
  toggle.setAttribute('aria-expanded', String(isOpening));

  if (label) {
    label.textContent = isOpening ? 'Hide map' : 'View map';
  }

  if (isOpening) {
    renderEventCardMap(currentPageEvents[index], index);
  }
}

function renderEventCardMap(event, index) {
  if (typeof L === 'undefined') {
    return;
  }

  if (eventCardMaps[index]) {
    window.setTimeout(() => {
      eventCardMaps[index].invalidateSize();
    }, 0);
    return;
  }

  const mapElement = document.querySelector(`.event-card-map[data-card-map-index="${index}"]`);
  const latitude = Number(event?.latitude);
  const longitude = Number(event?.longitude);

  if (!mapElement || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return;
  }

  const cardMap = L.map(mapElement, {
    attributionControl: false,
    dragging: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    scrollWheelZoom: false,
    tap: false,
    touchZoom: false,
    zoomControl: false
  }).setView([latitude, longitude], 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(cardMap);

  L.marker([latitude, longitude], {
    title: event.locationName || event.title || 'Event location'
  }).addTo(cardMap);

  eventCardMaps[index] = cardMap;

  window.setTimeout(() => {
    cardMap.invalidateSize();
  }, 0);
}

function renderVisibleEventCardMaps() {
  if (document.body.dataset.resultsView === 'map') {
    return;
  }

  currentPageEvents.forEach((event, index) => {
    const mapElement = document.querySelector(`.event-card-map[data-card-map-index="${index}"]`);

    if (!mapElement || mapElement.hidden) {
      return;
    }

    renderEventCardMap(event, index);
  });
}

function clearInvalidSelectedMapEvent() {
  if (!selectedMapEvent) {
    return;
  }

  if (currentPageEvents.some(event => getEventKey(event) === getEventKey(selectedMapEvent))) {
    return;
  }

  selectedMapEvent = null;
  removeSelectedEventMarker();
}

function selectLocationEvent(locationId) {
  const location = visibleLocations.find(l => l.id === locationId);

  if (!location) {
    return;
  }

  const event = getMapPopupEvent(location);

  if (!event) {
    return;
  }

  selectedMapEvent = event;
  focusEventOnMap(event);
  scrollSelectedEventCardIntoView();
  highlightSelectedEventCard();
}

function getMapPopupEvent(location) {
  const locationEvents = getFilteredEvents([location]);

  return locationEvents.find(candidate => {
    return currentPageEvents.some(pageEvent => getEventKey(pageEvent) === getEventKey(candidate));
  }) || locationEvents[0] || null;
}

function isMobileLandingView() {
  return document.body.classList.contains('landing-page') &&
    window.matchMedia('(max-width: 640px)').matches;
}

function isLandingInitialSearchView() {
  return document.body.classList.contains('landing-page') &&
    document.body.dataset.searchState === 'initial';
}

function highlightSelectedEventCard() {
  const selectedKey = selectedMapEvent ? getEventKey(selectedMapEvent) : '';

  document.querySelectorAll('.search-result-card[data-event-key]').forEach(card => {
    card.classList.toggle('selected', Boolean(selectedKey) && card.dataset.eventKey === selectedKey);
  });
}

function scrollSelectedEventCardIntoView() {
  if (!selectedMapEvent) {
    return;
  }

  const selectedKey = getEventKey(selectedMapEvent);
  const selectedCard = Array.from(document.querySelectorAll('.search-result-card[data-event-key]'))
    .find(card => card.dataset.eventKey === selectedKey);

  if (selectedCard) {
    selectedCard.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function focusEventOnMap(event) {
  const latitude = Number(event?.latitude);
  const longitude = Number(event?.longitude);

  if (!map || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return;
  }

  const fallbackMarker = ensureSelectedEventMarker(event);
  map.setView([latitude, longitude], Math.max(map.getZoom(), 13), { animate: true });

  window.setTimeout(() => {
    if (!markerClusterGroup || map.hasLayer(markerClusterGroup)) {
      if (fallbackMarker) {
        fallbackMarker.openPopup();
      }
      return;
    }

    map.addLayer(markerClusterGroup);

    if (fallbackMarker) {
      fallbackMarker.openPopup();
    }
  }, 0);
}

function ensureSelectedEventMarker(event) {
  if (!map || !event?.locationId) {
    return null;
  }

  const hasVisibleMarker = markers.some(marker => marker.locationId === event.locationId);
  if (hasVisibleMarker) {
    removeSelectedEventMarker();
    return null;
  }

  const latitude = Number(event.latitude);
  const longitude = Number(event.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    removeSelectedEventMarker();
    return null;
  }

  const eventKey = getEventKey(event);

  if (selectedEventMarker?.eventKey === eventKey) {
    return selectedEventMarker;
  }

  removeSelectedEventMarker();

  selectedEventMarker = L.marker([latitude, longitude], {
    icon: createEventMarkerIcon(),
    title: event.locationName || event.title || 'Event location'
  }).addTo(map);
  selectedEventMarker.locationId = event.locationId;
  selectedEventMarker.eventKey = eventKey;
  selectedEventMarker.bindPopup(createSelectedEventPopup(event), {
    className: 'event-card-popup',
    closeButton: false,
    maxWidth: 340,
    minWidth: 300,
    offset: [0, -18]
  });
  selectedEventMarker.on('click', function() {
    selectedMapEvent = event;
    highlightSelectedEventCard();
  });

  return selectedEventMarker;
}

function createSelectedEventPopup(event) {
  const popup = document.createElement('div');
  popup.innerHTML = renderEventCard(event, `selected-marker-${event.locationId}`, {
    compact: true,
    hideMap: true,
    hidePopupDetails: true,
    popupCard: true,
    selected: true,
    actionLabel: 'More details'
  });
  return popup;
}

function removeSelectedEventMarker() {
  if (!selectedEventMarker) {
    return;
  }

  selectedEventMarker.remove();
  selectedEventMarker = null;
}

function getEventKey(event) {
  return `${event?.locationId || ''}::${event?.id || ''}`;
}

function getPagedEvents(events) {
  const totalCount = events.length;

  if (currentTimeframeFilter === DEFAULT_TIMEFRAME_FILTER) {
    currentPage = 1;
    return {
      pageEvents: events,
      totalPages: 1,
      totalCount,
      startIndex: 0,
      endIndex: totalCount
    };
  }

  const totalPages = Math.max(Math.ceil(totalCount / EVENTS_PER_PAGE), 1);
  currentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const startIndex = (currentPage - 1) * EVENTS_PER_PAGE;
  const endIndex = Math.min(startIndex + EVENTS_PER_PAGE, totalCount);
  return {
    pageEvents: events.slice(startIndex, endIndex),
    totalPages,
    totalCount,
    startIndex,
    endIndex
  };
}

function createEventMarkerIcon() {
  return L.divIcon({
    className: 'bc-map-marker',
    html: '<span></span>',
    iconSize: [28, 36],
    iconAnchor: [14, 34],
    popupAnchor: [0, -30]
  });
}

function renderPagination(totalPages, currentPageValue, totalCount, startIndex, endIndex) {
  const paginationElement = document.getElementById('eventsPagination');
  if (!paginationElement) {
    return;
  }

  if (totalPages <= 1 || totalCount === 0) {
    paginationElement.innerHTML = '';
    return;
  }

  const pageButtons = Array.from({ length: totalPages }, (_, index) => {
    const page = index + 1;
    const activeClass = page === currentPageValue ? 'active' : '';
    return `<button type="button" class="pagination-btn page-number ${activeClass}" data-page="${page}">${page}</button>`;
  }).join('');

  paginationElement.innerHTML = `
    <div class="pagination-summary">Showing ${startIndex + 1}-${endIndex} of ${totalCount}</div>
    <div class="pagination-buttons">
      <button type="button" class="pagination-btn" ${currentPageValue === 1 ? 'disabled' : ''} data-page="${currentPageValue - 1}">Previous</button>
      ${pageButtons}
      <button type="button" class="pagination-btn" ${currentPageValue === totalPages ? 'disabled' : ''} data-page="${currentPageValue + 1}">Next</button>
    </div>
  `;
}

function goToPage(pageNumber) {
  currentPage = pageNumber;
  displayFilteredEvents(getFilteredEvents(visibleLocations));
}

function getEventCountText(visibleCount) {
  if (lastTotalEventCount > visibleCount) {
    return `${visibleCount} of ${lastTotalEventCount}`;
  }

  return String(visibleCount);
}

function focusLocation(locationId) {
  const location = visibleLocations.find(l => l.id === locationId);
  
  if (location && hasValidCoordinates(location)) {
    map.panTo([location.latitude, location.longitude]);
  }
}

function clearSearch() {
  // Clear postcode input
  document.getElementById('postcodeInput').value = '';
  
  // Reset filters
  currentTimeframeFilter = DEFAULT_TIMEFRAME_FILTER;
  currentTimeOfDayFilter = 'all';
  currentDayOfWeekFilter = 'all';
  syncFilterControls();
  syncFilterPanelSearchFields();

  currentLocationSet = getAllLocations();
  lastSearchCoords = null;
  currentPage = 1;
  // Display all events
  renderLocations(currentLocationSet);
  
  // Reset map view
  map.setView([54.5700, -1.3200], 11);

  if (searchMarker) {
    map.removeLayer(searchMarker);
    searchMarker = null;
  }

  if (searchRadiusCircle) {
    map.removeLayer(searchRadiusCircle);
    searchRadiusCircle = null;
  }
  
  showInfo('Search cleared');
}

function filterByTimeframe(timeframe) {
  currentTimeframeFilter = timeframe;
  setFilterPillState('timeframe', timeframe);
  currentPage = 1;
  renderLocations(currentLocationSet);
}

function filterByTimeOfDay(timeOfDay) {
  currentTimeOfDayFilter = timeOfDay;
  setFilterPillState('timeOfDay', timeOfDay);
  currentPage = 1;
  renderLocations(currentLocationSet);
}

function filterByDayOfWeek(dayOfWeek) {
  currentDayOfWeekFilter = dayOfWeek;
  setFilterPillState('dayOfWeek', dayOfWeek);
  currentPage = 1;
  renderLocations(currentLocationSet);
}

function resetEventFilters() {
  setFilterPillState('timeframe', DEFAULT_TIMEFRAME_FILTER);
  setFilterPillState('timeOfDay', 'all');
  setFilterPillState('dayOfWeek', 'all');
}

function syncFilterControls() {
  setFilterPillState('timeframe', currentTimeframeFilter);
  setFilterPillState('timeOfDay', currentTimeOfDayFilter);
  setFilterPillState('dayOfWeek', currentDayOfWeekFilter);
}

function setFilterPillState(target, value) {
  document.querySelectorAll(`.filter-pill[data-filter-target="${target}"]`).forEach(button => {
    button.classList.toggle('active', button.dataset.filterValue === value);
    button.setAttribute('aria-pressed', String(button.dataset.filterValue === value));
  });
}

function getSelectedFilterValue(target, fallback = 'all') {
  const selectedButton = document.querySelector(`.filter-pill[data-filter-target="${target}"].active`);
  return selectedButton?.dataset.filterValue || fallback;
}

function applyLocationFilters(locations) {
  return locations;
}

function filterEventsByTimeframe(events, timeframe) {
  if (timeframe === 'all') {
    return events;
  }

  const range = getTimeframeRange(timeframe);

  if (!range) {
    return events;
  }

  return events.filter(event => {
    return getEventOccurrenceDatesInRange(event, range.start, range.end).length > 0;
  });
}

function getCurrentTimeframeRange() {
  if (currentTimeframeFilter === 'all') {
    return null;
  }

  return getTimeframeRange(currentTimeframeFilter);
}

function getVisibleEventOccurrenceDates(event) {
  const range = getCurrentTimeframeRange();

  if (!range) {
    const nextOccurrence = getNextEventOccurrenceDate(event);
    return nextOccurrence ? [nextOccurrence] : [];
  }

  return getEventOccurrenceDatesInRange(event, range.start, range.end);
}

function getEventOccurrenceDatesInRange(event, rangeStart, rangeEnd) {
  const startDate = parseLocalDate(event.startDate);

  if (!startDate) {
    return [];
  }

  const seriesEndDate = getEventSeriesEndDate(event, startDate);
  const firstPossibleDate = startDate > rangeStart ? startDate : rangeStart;
  const lastPossibleDate = seriesEndDate < rangeEnd ? seriesEndDate : rangeEnd;

  if (firstPossibleDate > lastPossibleDate) {
    return [];
  }

  const dayIndex = getDayIndex(event.dayOfWeek);

  if (dayIndex === null) {
    return isDateInRange(startDate, firstPossibleDate, lastPossibleDate) ? [startDate] : [];
  }

  const occurrenceDates = [];
  let occurrenceDate = getUpcomingDay(firstPossibleDate, dayIndex);

  while (occurrenceDate <= lastPossibleDate) {
    occurrenceDates.push(new Date(occurrenceDate));
    occurrenceDate = addDays(occurrenceDate, 7);
  }

  if (occurrenceDates.length === 0 && isDateInRange(startDate, firstPossibleDate, lastPossibleDate)) {
    return [startDate];
  }

  return occurrenceDates;
}

function filterEventsByDayOfWeek(events, dayOfWeek) {
  if (dayOfWeek === 'all') {
    return events;
  }

  return events.filter(event => {
    return String(event.dayOfWeek || '').trim().toLowerCase() === dayOfWeek;
  });
}

function filterEventsByTimeOfDay(events, timeOfDay) {
  if (timeOfDay === 'all') {
    return events;
  }

  return events.filter(event => {
    const minutes = getEventStartMinutes(event.time);

    if (minutes === null) {
      return false;
    }

    if (timeOfDay === 'morning') {
      return minutes >= 9 * 60 && minutes < 12 * 60;
    }

    if (timeOfDay === 'lunch') {
      return minutes >= 12 * 60 && minutes < 14 * 60;
    }

    if (timeOfDay === 'evening') {
      return minutes >= 18 * 60 && minutes < 21 * 60;
    }

    if (timeOfDay === 'lateNight') {
      return minutes >= 21 * 60 || minutes === 0;
    }

    if (timeOfDay === 'beforeWork') {
      return minutes < 9 * 60;
    }

    if (timeOfDay === 'dayTime') {
      return minutes >= 9 * 60 && minutes < 17 * 60;
    }

    if (timeOfDay === 'afterWork') {
      return minutes >= 17 * 60 && minutes < 21 * 60;
    }

    return false;
  });
}

function getTimeframeRange(timeframe) {
  const today = startOfDay(new Date());

  if (timeframe === 'today') {
    return { start: today, end: today };
  }

  if (timeframe === 'tomorrow') {
    const tomorrow = addDays(today, 1);
    return { start: tomorrow, end: tomorrow };
  }

  if (timeframe === 'currentAndNextWeek') {
    const nextMonday = addDays(getStartOfWeek(today), 7);
    return { start: today, end: addDays(nextMonday, 6) };
  }

  if (timeframe === 'next3weeks') {
    return { start: today, end: addDays(today, 21) };
  }

  if (timeframe === 'next7days') {
    return { start: today, end: addDays(today, 7) };
  }

  if (timeframe === 'thisWeek') {
    return { start: today, end: getEndOfWeek(today) };
  }

  if (timeframe === 'thisWeekend') {
    const saturday = addDays(getStartOfWeek(today), 5);
    const sunday = addDays(saturday, 1);
    return { start: today > saturday ? today : saturday, end: sunday };
  }

  if (timeframe === 'nextWeek') {
    const nextMonday = addDays(getStartOfWeek(today), 7);
    return { start: nextMonday, end: addDays(nextMonday, 6) };
  }

  if (timeframe === 'nextWeekend') {
    const nextSaturday = addDays(getStartOfWeek(today), 12);
    return { start: nextSaturday, end: addDays(nextSaturday, 1) };
  }

  if (timeframe === 'thisMonth') {
    return {
      start: today,
      end: new Date(today.getFullYear(), today.getMonth() + 1, 0)
    };
  }

  if (timeframe === 'next30days') {
    return { start: today, end: addDays(today, 30) };
  }

  return null;
}

function getNextEventOccurrenceDate(event) {
  const today = startOfDay(new Date());
  const startDate = parseLocalDate(event.startDate);

  if (!startDate) {
    return null;
  }

  const seriesEndDate = getEventSeriesEndDate(event, startDate);
  const earliestDate = startDate > today ? startDate : today;
  const dayIndex = getDayIndex(event.dayOfWeek);
  let occurrenceDate = new Date(earliestDate);

  if (dayIndex !== null) {
    occurrenceDate = getUpcomingDay(earliestDate, dayIndex);
  }

  if (occurrenceDate < startDate) {
    occurrenceDate = new Date(startDate);
  }

  if (occurrenceDate > seriesEndDate) {
    return earliestDate <= seriesEndDate ? earliestDate : null;
  }

  return occurrenceDate;
}

function getEventSeriesEndDate(event, startDate) {
  const calculatedEndDate = addDays(startDate, (EVENT_SESSION_COUNT - 1) * 7);
  const configuredEndDate = parseLocalDate(event.endDate);

  if (configuredEndDate && configuredEndDate < calculatedEndDate) {
    return configuredEndDate;
  }

  return calculatedEndDate;
}

function getDayIndex(dayName) {
  const normalizedDay = String(dayName || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(DAY_INDEXES, normalizedDay) ? DAY_INDEXES[normalizedDay] : null;
}

function parseLocalDate(dateString) {
  if (!dateString) {
    return null;
  }

  const match = String(dateString).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    const fallbackDate = new Date(dateString);
    return isNaN(fallbackDate.getTime()) ? null : startOfDay(fallbackDate);
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function dateToDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function getStartOfWeek(date) {
  const start = startOfDay(date);
  const day = start.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(start, mondayOffset);
}

function getEndOfWeek(date) {
  return addDays(getStartOfWeek(date), 6);
}

function getUpcomingDay(date, dayIndex) {
  const start = startOfDay(date);
  const daysUntilTarget = (dayIndex - start.getDay() + 7) % 7;
  return addDays(start, daysUntilTarget);
}

function isDateInRange(date, start, end) {
  const comparableDate = startOfDay(date);
  return comparableDate >= startOfDay(start) && comparableDate <= startOfDay(end);
}

function getEventStartMinutes(timeString) {
  const normalizedTime = String(timeString || '').trim().toLowerCase();
  const match = normalizedTime.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);

  if (!match) {
    return null;
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const meridiem = match[3];

  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 24 || minutes > 59) {
    return null;
  }

  if (meridiem === 'pm' && hours < 12) {
    hours += 12;
  }

  if (meridiem === 'am' && hours === 12) {
    hours = 0;
  }

  if (hours === 24 && minutes > 0) {
    return null;
  }

  return (hours % 24) * 60 + minutes;
}

function initializeHomePage() {
  initializeApp();

  const root = document.documentElement;
  const hero = document.querySelector('.home-hero');
  const searchSection = document.querySelector('.home-main .search-section');
  const desktopQuery = window.matchMedia('(min-width: 769px)');
  const maxOverlap = 160;

  function updateSearchOverlap() {
    if (!hero || !searchSection || !desktopQuery.matches) {
      root.style.setProperty('--search-scroll-offset', '0px');
      return;
    }

    const scrollTop = window.scrollY || window.pageYOffset;
    const progress = Math.min(scrollTop / 220, 1);
    const overlap = Math.round(progress * maxOverlap);
    root.style.setProperty('--search-scroll-offset', overlap + 'px');
  }

  function updateHeaderBadge() {
    document.body.classList.toggle('is-scrolled', (window.scrollY || window.pageYOffset) > 80);
  }

  updateSearchOverlap();
  updateHeaderBadge();
  window.addEventListener('scroll', function() {
    updateSearchOverlap();
    updateHeaderBadge();
  }, { passive: true });
  window.addEventListener('resize', function() {
    updateSearchOverlap();
    updateHeaderBadge();
  });
}

document.addEventListener('DOMContentLoaded', initializeHomePage);
