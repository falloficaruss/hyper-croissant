/* ── Home Page JS ──────────────────────────────────────────── */

// ── Hero Chess Board ──
const PIECES = {
  'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚', 'p': '♟',
  'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔', 'P': '♙',
};

// An interesting position (Sicilian Najdorf — typical analysis position)
const HERO_FEN = 'r1bq1rk1/1p2bppp/p1n1pn2/3pN3/3P1B2/2N1P3/PPQ2PPP/R3KB1R';

function renderHeroBoard() {
  const board = document.getElementById('hero-board');
  if (!board) return;

  const rows = HERO_FEN.split('/');
  let html = '';

  for (let r = 0; r < 8; r++) {
    let col = 0;
    for (const ch of rows[r]) {
      if (ch >= '1' && ch <= '8') {
        for (let i = 0; i < parseInt(ch); i++) {
          const isLight = (r + col) % 2 === 0;
          html += `<div class="sq ${isLight ? 'light' : 'dark'}"></div>`;
          col++;
        }
      } else {
        const isLight = (r + col) % 2 === 0;
        html += `<div class="sq ${isLight ? 'light' : 'dark'}">${PIECES[ch] || ''}</div>`;
        col++;
      }
    }
  }

  board.innerHTML = html;
}

renderHeroBoard();

// ── Explanation Level Tabs ──
const tabs = document.querySelectorAll('#levels-tabs .level-tab');
const panels = document.querySelectorAll('.level-panel');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const level = tab.dataset.level;

    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    panels.forEach(p => {
      p.classList.remove('active');
      if (p.id === `level-${level}`) {
        p.classList.add('active');
      }
    });
  });
});
