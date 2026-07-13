/**
 * Event Detail Page Logic
 */

async function initializeEventDetail() {
  const detailContainer = document.getElementById('eventDetail');
  const params = new URLSearchParams(window.location.search);
  const locationId = params.get('locationId');
  const eventId = params.get('eventId');

  if (!locationId) {
    renderEventNotFound(detailContainer);
    return;
  }

  const data = await getEventsData();
  const location = (data.locations || []).find(item => item.id === locationId);

  if (!location) {
    renderEventNotFound(detailContainer);
    return;
  }

  if (eventId) {
    const event = location.events?.find(item => item.id === eventId);
    if (!event) {
      renderEventNotFound(detailContainer);
      return;
    }

    renderEventDetail(detailContainer, location, normalizeEvent(event));
    return;
  }

  renderLocationPage(detailContainer, location);
}

function renderEventNotFound(container) {
  container.innerHTML = `
    <div class="detail-card">
      <p class="empty-state">We could not find that event. It may have been removed or the link may be out of date.</p>
      <a class="mui-button mui-button-contained detail-primary-action" href="index.html">
        <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
        Back to events
      </a>
    </div>
  `;
}

function renderEventDetail(container, location, event) {
  const eventbriteUrl = getSafeExternalUrl(event.eventbriteUrl);

  container.innerHTML = `
    <article class="detail-card">
      <div class="detail-kicker">${escapeHTML(event.status)} event</div>
      <h2>${escapeHTML(event.title || 'Untitled event')}</h2>
      <p class="detail-description">${escapeHTML(event.description || 'No description has been added yet.')}</p>

      <div class="detail-grid">
        ${renderDetailItem('Type', getEventTypeLabel(event.eventType))}
        ${renderDetailItem('Start date', formatDate(event.startDate))}
        ${renderDetailItem('End date', formatDate(event.endDate))}
        ${renderDetailItem('Day', event.dayOfWeek || 'Day TBC')}
        ${renderDetailItem('Time', event.time || 'Time TBC')}
        ${renderDetailItem('Status', event.status)}
      </div>

      <section class="detail-location">
        <h3>${escapeHTML(location.name || 'Location')}</h3>
        <p>${escapeHTML(location.address || 'Address not set')}</p>
        <p>${escapeHTML(location.postcode || 'Postcode not set')}</p>
        <p>${escapeHTML(location.contact || 'Contact number not set')}</p>
      </section>

      <div class="detail-actions">
        ${eventbriteUrl ? `<a class="mui-button mui-button-contained detail-primary-action" href="${escapeAttribute(eventbriteUrl)}" target="_blank" rel="noopener noreferrer"><span class="material-symbols-outlined" aria-hidden="true">confirmation_number</span>View on Eventbrite</a>` : ''}
        <a class="mui-button mui-button-outlined detail-secondary-action" href="index.html">
          <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
          Back to events
        </a>
      </div>
    </article>
  `;
}

function renderLocationPage(container, location) {
  const activeEvents = filterActivateEvents(location.events || []);
  const sortedEvents = activeEvents.sort((a, b) => `${a.startDate || '9999-12-31'} ${a.time || '23:59'}`.localeCompare(`${b.startDate || '9999-12-31'} ${b.time || '23:59'}`));
  const eventsMarkup = sortedEvents.length > 0 ? sortedEvents.map(event => renderLocationEventCard(location, normalizeEvent(event))).join('') : '<p class="empty-state">No upcoming active events are available at this location.</p>';

  container.innerHTML = `
    <article class="detail-card">
      <div class="detail-kicker">Location details</div>
      <h2>${escapeHTML(location.name || 'Location')}</h2>
      <p class="detail-description">${escapeHTML(location.address || 'Address not set')}</p>
      <p class="detail-description">${escapeHTML(location.postcode || 'Postcode not set')}</p>

      <section class="detail-location">
        <h3>Upcoming events at this location</h3>
        <div class="events-list">
          ${eventsMarkup}
        </div>
      </section>

      <div class="detail-actions">
        <a class="mui-button mui-button-outlined detail-secondary-action" href="index.html">
          <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
          Back to events
        </a>
      </div>
    </article>
  `;
}

function renderLocationEventCard(location, event) {
  const detailUrl = `event.html?locationId=${encodeURIComponent(location.id)}&eventId=${encodeURIComponent(event.id)}`;
  return `
    <a class="event-card event-card-link" href="${escapeAttribute(detailUrl)}">
      <div class="event-card-date">
        <span>${escapeHTML(formatDate(event.startDate))}</span>
        <strong>${escapeHTML(event.time || 'Time TBC')}</strong>
      </div>
      <h3>${escapeHTML(event.title || 'Untitled event')}</h3>
      <p>${escapeHTML(event.description || 'No description available.')}</p>
    </a>
  `;
}

function renderDetailItem(label, value) {
  return `
    <div class="detail-item">
      <span>${escapeHTML(label)}</span>
      <strong>${escapeHTML(value)}</strong>
    </div>
  `;
}

document.addEventListener('DOMContentLoaded', initializeEventDetail);
