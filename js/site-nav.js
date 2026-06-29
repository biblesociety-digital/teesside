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

  document.addEventListener('DOMContentLoaded', setupPrimaryNav);
})();
