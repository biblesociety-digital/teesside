(function() {
  function setupBibleConverstionSearchGate() {
    const form = document.getElementById('landingSearchForm');
    const ageConfirmation = document.getElementById('ageConfirmation');
    const postcodeSearchButton = document.getElementById('postcodeSearchButton');

    if (!form || !ageConfirmation || !postcodeSearchButton) {
      return;
    }

    function syncSearchAvailability() {
      const isAllowed = ageConfirmation.checked;
      postcodeSearchButton.disabled = !isAllowed;
      postcodeSearchButton.setAttribute('aria-disabled', String(!isAllowed));
    }

    ageConfirmation.addEventListener('change', syncSearchAvailability);
    form.addEventListener('submit', function(event) {
      if (ageConfirmation.checked) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      ageConfirmation.focus();
      syncSearchAvailability();
    }, true);

    syncSearchAvailability();
  }

  function setupBibleConverstionDrawer() {
    const drawer = document.querySelector('.bible-converstion-sidebar');
    const header = document.querySelector('.bible-converstion-sidebar-header');
    const toggle = document.querySelector('.bible-converstion-drawer-toggle');
    const mobileQuery = window.matchMedia('(max-width: 820px)');

    if (!drawer || !header || !toggle) {
      return;
    }

    let pointerStartY = null;
    let pointerStartedInHeader = false;
    let suppressNextHeaderClick = false;

    function isOpen() {
      return drawer.classList.contains('is-open');
    }

    function openDrawer() {
      if (!mobileQuery.matches) {
        return;
      }

      drawer.classList.add('is-open');
      document.body.classList.add('bible-converstion-drawer-open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close search drawer');
    }

    function closeDrawer() {
      drawer.classList.remove('is-open');
      document.body.classList.remove('bible-converstion-drawer-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open search drawer');
    }

    function toggleDrawer() {
      if (isOpen()) {
        closeDrawer();
        return;
      }

      openDrawer();
    }

    toggle.addEventListener('click', function(event) {
      event.preventDefault();
      event.stopPropagation();
      toggleDrawer();
    });

    header.addEventListener('click', function(event) {
      if (suppressNextHeaderClick) {
        suppressNextHeaderClick = false;
        return;
      }

      if (!mobileQuery.matches || toggle.contains(event.target)) {
        return;
      }

      toggleDrawer();
    });

    header.addEventListener('pointerdown', function(event) {
      if (!mobileQuery.matches) {
        return;
      }

      pointerStartY = event.clientY;
      pointerStartedInHeader = true;
    });

    header.addEventListener('pointerup', function(event) {
      if (!mobileQuery.matches || !pointerStartedInHeader || pointerStartY === null) {
        pointerStartY = null;
        pointerStartedInHeader = false;
        return;
      }

      const deltaY = event.clientY - pointerStartY;
      pointerStartY = null;
      pointerStartedInHeader = false;

      if (deltaY < -18) {
        suppressNextHeaderClick = true;
        openDrawer();
      } else if (deltaY > 18) {
        suppressNextHeaderClick = true;
        closeDrawer();
      }
    });

    document.addEventListener('pointerdown', function(event) {
      if (!mobileQuery.matches || !isOpen() || drawer.contains(event.target)) {
        return;
      }

      event.preventDefault();
      closeDrawer();
    }, true);

    document.addEventListener('keydown', function(event) {
      if (event.key === 'Escape' && isOpen()) {
        closeDrawer();
      }
    });

    mobileQuery.addEventListener('change', function(event) {
      if (!event.matches) {
        closeDrawer();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function() {
    setupBibleConverstionSearchGate();
    setupBibleConverstionDrawer();
  });
})();
