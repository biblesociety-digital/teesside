(function() {
  function normalizeRadius(value) {
    const radius = parseFloat(value);

    if (!Number.isFinite(radius)) {
      return '0.25';
    }

    return String(Math.min(Math.max(radius, 0.25), 100));
  }

  function setupLandingSearch() {
    const form = document.getElementById('landingSearchForm');
    const postcodeInput = document.getElementById('postcodeInput');
    const radiusInput = document.getElementById('radiusInput');
    const eventTypeInput = document.getElementById('eventTypeInput');

    if (!form || !postcodeInput || !radiusInput) {
      return;
    }

    form.addEventListener('submit', function(event) {
      const postcode = postcodeInput.value.trim();

      if (!postcode) {
        return;
      }

      event.preventDefault();

      const params = new URLSearchParams({
        postcode,
        radius: normalizeRadius(radiusInput.value)
      });

      if (eventTypeInput && eventTypeInput.value && eventTypeInput.value !== 'all') {
        params.set('eventType', eventTypeInput.value);
      }

      window.location.href = `${form.action}?${params.toString()}`;
    });
  }

  document.addEventListener('DOMContentLoaded', setupLandingSearch);
})();
