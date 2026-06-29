(function() {
  function getFaqItems() {
    return Array.from(document.querySelectorAll('.faq-item'));
  }

  function getSearchTerm() {
    const searchInput = document.getElementById('faqSearch');
    return String(searchInput?.value || '').trim().toLowerCase();
  }

  function updateFaqResults() {
    const searchTerm = getSearchTerm();
    const items = getFaqItems();
    const emptyState = document.getElementById('faqEmptyState');
    const tocLinks = Array.from(document.querySelectorAll('.faq-toc-list a'));
    const tocGroups = Array.from(document.querySelectorAll('.faq-toc-list p'));
    let visibleCount = 0;

    items.forEach(item => {
      const textMatches = !searchTerm || item.textContent.toLowerCase().includes(searchTerm);
      item.hidden = !textMatches;

      if (textMatches) {
        visibleCount += 1;
      }
    });

    document.querySelectorAll('[data-faq-group]').forEach(group => {
      const hasVisibleItems = Array.from(group.querySelectorAll('.faq-item')).some(item => !item.hidden);
      group.hidden = !hasVisibleItems;
    });

    tocLinks.forEach(link => {
      const target = document.querySelector(link.getAttribute('href'));
      link.hidden = Boolean(target?.hidden);
    });

    tocGroups.forEach(groupLabel => {
      const nextLinks = [];
      let next = groupLabel.nextElementSibling;

      while (next && next.tagName.toLowerCase() !== 'p') {
        if (next.tagName.toLowerCase() === 'a') {
          nextLinks.push(next);
        }
        next = next.nextElementSibling;
      }

      groupLabel.hidden = nextLinks.length > 0 && nextLinks.every(link => link.hidden);
    });

    if (emptyState) {
      emptyState.hidden = visibleCount !== 0;
    }
  }

  function setupFaqSearch() {
    const searchInput = document.getElementById('faqSearch');
    const clearButton = document.getElementById('faqClearSearch');

    if (searchInput) {
      searchInput.addEventListener('input', updateFaqResults);
    }

    if (clearButton) {
      clearButton.addEventListener('click', function() {
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }

        updateFaqResults();
      });
    }
  }

  function setupTocToggle() {
    const toggle = document.getElementById('faqTocToggle');
    const list = document.getElementById('faqTocList');

    if (!toggle || !list) {
      return;
    }

    toggle.addEventListener('click', function() {
      const isOpen = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!isOpen));
      list.hidden = isOpen;
    });

    list.addEventListener('click', function(event) {
      const link = event.target.closest('a');

      if (!link) {
        return;
      }

      toggle.setAttribute('aria-expanded', 'false');
      list.hidden = true;
    });
  }

  document.addEventListener('DOMContentLoaded', function() {
    setupFaqSearch();
    setupTocToggle();
    updateFaqResults();
  });
})();
