/* ── Docs Page JS ──────────────────────────────────────────── */

// ── Sidebar navigation ──
const navLinks = document.querySelectorAll('.docs-nav-link');
const sections = document.querySelectorAll('.docs-section');

navLinks.forEach(link => {
  link.addEventListener('click', () => {
    const sectionId = link.dataset.section;

    // Update active nav link
    navLinks.forEach(l => l.classList.remove('active'));
    link.classList.add('active');

    // Show target section
    sections.forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`section-${sectionId}`);
    if (target) {
      target.classList.add('active');
      // Scroll to top of content on mobile
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Close mobile sidebar
    const sidebar = document.getElementById('docs-sidebar');
    if (sidebar) sidebar.classList.remove('open');
  });
});

// ── Mobile sidebar toggle ──
const mobileToggle = document.getElementById('docs-mobile-toggle');
const sidebar = document.getElementById('docs-sidebar');

if (mobileToggle && sidebar) {
  mobileToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });
}

// ── Handle deep links (e.g., /docs.html#section-coach) ──
function handleDeepLink() {
  const hash = window.location.hash;
  if (hash && hash.startsWith('#section-')) {
    const sectionId = hash.replace('#section-', '');
    const link = document.querySelector(`.docs-nav-link[data-section="${sectionId}"]`);
    if (link) link.click();
  }
}

handleDeepLink();
window.addEventListener('hashchange', handleDeepLink);
