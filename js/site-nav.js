(function() {
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

  function setupStickyHeaderShadow() {
    const updateHeaderShadow = function() {
      document.body.classList.toggle('is-header-stuck', (window.scrollY || window.pageYOffset) > 0);
    };

    updateHeaderShadow();
    window.addEventListener('scroll', updateHeaderShadow, { passive: true });
  }

  document.addEventListener('DOMContentLoaded', function() {
    setupPrimaryNav();
    setupStickyHeaderShadow();
  });
})();
