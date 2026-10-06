export function analyticsScriptsInfoPopup(): string {
  return `
    (function initInfoPopup() {
      const overlay = document.getElementById('info-popup-overlay');
      const closeBtn = document.getElementById('info-popup-close');

      document.querySelectorAll('.info-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          overlay.style.display = '';
        });
      });

      closeBtn.addEventListener('click', () => { overlay.style.display = 'none'; });

      overlay.addEventListener('click', e => {
        if (e.target === overlay) overlay.style.display = 'none';
      });

      document.addEventListener('keydown', e => {
        if (e.key === 'Escape') overlay.style.display = 'none';
      });
    })();
  `;
}
