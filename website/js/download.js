/* ── Download Page JS ──────────────────────────────────────── */

// ── OS Detection — highlight recommended platform ──
function detectOS() {
  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() || '';

  if (ua.includes('win') || platform.includes('win')) return 'windows';
  if (ua.includes('mac') || platform.includes('mac')) return 'macos';
  if (ua.includes('linux') || platform.includes('linux')) return 'linux';
  return null;
}

function highlightPlatform() {
  const os = detectOS();
  if (!os) return;

  const cards = document.querySelectorAll('.platform-card');
  cards.forEach(card => {
    if (card.dataset.platform === os) {
      card.classList.add('recommended');
    }
  });

  // Reorder: detected platform first
  const container = document.getElementById('download-platforms');
  if (!container) return;

  const detected = container.querySelector(`[data-platform="${os}"]`);
  if (detected && detected !== container.firstElementChild) {
    container.insertBefore(detected, container.firstElementChild);
  }
}

highlightPlatform();
