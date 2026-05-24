// Keyboard navigation for the ShipShape audit deck.
// Arrow / Space / PageDown / PageUp / Home / End — navigation.
// F — fullscreen toggle. N — toggle presenter notes overlay.

(function () {
  const slides = Array.from(document.querySelectorAll('.slide'));
  const counter = document.querySelector('.counter');
  const progress = document.querySelector('.progress');
  const notesPanel = document.querySelector('.notes-panel');
  const total = slides.length;
  let current = 0;

  function show(n) {
    if (n < 0 || n >= total) return;
    slides[current].classList.remove('active');
    current = n;
    slides[current].classList.add('active');
    counter.textContent = String(current + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0');
    progress.style.width = ((current + 1) / total * 100).toFixed(2) + '%';
    updateNotes();
    if (history.replaceState) history.replaceState(null, '', '#slide-' + (current + 1));
  }

  function updateNotes() {
    const note = slides[current].querySelector('.notes');
    notesPanel.textContent = note ? note.textContent.trim() : '';
  }

  function next() { show(Math.min(current + 1, total - 1)); }
  function prev() { show(Math.max(current - 1, 0)); }

  document.addEventListener('keydown', function (e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    switch (e.key) {
      case 'ArrowRight':
      case ' ':
      case 'PageDown':
      case 'j':
        e.preventDefault(); next(); break;
      case 'ArrowLeft':
      case 'PageUp':
      case 'k':
        e.preventDefault(); prev(); break;
      case 'Home':
        e.preventDefault(); show(0); break;
      case 'End':
        e.preventDefault(); show(total - 1); break;
      case 'f':
      case 'F':
        e.preventDefault();
        if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        else document.exitFullscreen();
        break;
      case 'n':
      case 'N':
        e.preventDefault(); document.body.classList.toggle('show-notes'); break;
    }
  });

  // Click-to-advance (left half = prev, right half = next)
  document.addEventListener('click', function (e) {
    if (e.target.closest('a, button, input, textarea, select, .notes-panel')) return;
    const half = window.innerWidth / 2;
    if (e.clientX < half) prev(); else next();
  });

  // Initial slide from hash
  const hashMatch = window.location.hash.match(/slide-(\d+)/);
  let startIdx = 0;
  if (hashMatch) {
    const n = parseInt(hashMatch[1], 10) - 1;
    if (n >= 0 && n < total) startIdx = n;
  }
  slides.forEach(function (s, i) { if (i !== startIdx) s.classList.remove('active'); });
  slides[startIdx].classList.add('active');
  current = startIdx;
  counter.textContent = String(current + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0');
  progress.style.width = ((current + 1) / total * 100).toFixed(2) + '%';
  updateNotes();
})();
