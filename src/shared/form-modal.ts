import { icon } from './icons';

/**
 * Shared small form dialog: a scrim, and a panel with a title bar, a body of labeled
 * fields (`.form-field`) that scrolls when it doesn't fit, and a footer of buttons. Used
 * by the dashboard's flight assignment modal and the duty log's flight and day editors.
 * It sits above the settings modal, so it can open from a settings view.
 */
export function formModalStyles(): string {
  return `
    .form-modal {
      position: fixed;
      inset: 0;
      z-index: 3000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .form-modal-backdrop {
      position: absolute;
      inset: 0;
      background: var(--scrim);
    }
    .form-modal-panel {
      position: relative;
      background: var(--surface-1);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-lg);
      width: min(340px, 100%);
      max-height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: var(--shadow-lg);
    }
    .form-modal-wide .form-modal-panel { width: min(420px, 100%); }
    .form-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border);
    }
    .form-modal-title {
      font-size: 0.9rem;
      font-weight: var(--weight-semibold);
      color: var(--text-primary);
    }
    .form-modal-close {
      background: none;
      border: none;
      color: var(--text-muted);
      line-height: 1;
      cursor: pointer;
      padding: 0.2rem;
      border-radius: var(--radius-md);
      display: inline-flex;
      transition: color var(--duration-fast) var(--ease-standard);
    }
    .form-modal-close:hover { color: var(--text-secondary); }
    .form-modal-body {
      padding: 0.85rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .form-modal-empty, .form-modal-hint {
      font-size: 0.82rem;
      color: var(--text-muted);
      line-height: 1.5;
    }
    .form-modal-hint { font-size: 0.75rem; }
    .form-modal-footer {
      padding: 0.65rem 1rem;
      border-top: 1px solid var(--border);
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      justify-content: flex-end;
    }
    /* Visual props from .btn-primary / .btn-secondary on these elements */
    .form-modal-btn { padding: 0.45rem 0.85rem; font-size: 0.85rem; min-height: 2.25rem; }
    .form-modal-btn.btn-primary { padding: 0.45rem 1rem; }
    .form-modal-footer-spacer { flex: 1; }
    .form-modal-footer .form-modal-btn-danger { color: var(--danger-fg); }
    .form-modal [hidden] { display: none; }

    .form-field {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      min-width: 0;
    }
    .form-field label, .form-field-label {
      font-size: 0.72rem;
      font-weight: var(--weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
    }
    .form-field select, .form-field input, .form-field textarea {
      padding: 0.4rem 0.5rem;
      background: var(--input-bg);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-family: var(--font-ui);
      font-size: 0.875rem;
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }
    .form-field input:disabled { opacity: 0.5; }
    .form-field textarea { resize: vertical; min-height: 3.5rem; }
    /* The tracker's value under a field the user can correct. */
    .form-field-original { font-size: 0.72rem; color: var(--text-muted); }
    .form-field-row { display: flex; gap: 0.6rem; }
    .form-field-row > .form-field { flex: 1; }
  `;
}

export function formModalScript(): string {
  return `
    // ── Form modal ────────────────────────────────────────────────────────────

    // Opens a form modal (formModalStyles()) and returns { modal, close }. bodyHtml and
    // footerHtml are trusted markup; the caller wires up its own buttons. Escape, the
    // close button and the backdrop close it; extra classes go on the root (e.g.
    // 'form-modal-wide').
    function openFormModal({ id, title, bodyHtml, footerHtml, className = '' }) {
      const existing = document.getElementById(id);
      if (existing) existing.remove();

      const modal = document.createElement('div');
      modal.id = id;
      modal.className = 'form-modal' + (className ? ' ' + className : '');
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.innerHTML =
        '<div class="form-modal-backdrop"></div>' +
        '<div class="form-modal-panel">' +
          '<div class="form-modal-header">' +
            '<span class="form-modal-title"></span>' +
            '<button type="button" class="form-modal-close" aria-label="Close">' + ${JSON.stringify(icon('x', { size: 16 }))} + '</button>' +
          '</div>' +
          '<div class="form-modal-body">' + bodyHtml + '</div>' +
          '<div class="form-modal-footer">' + footerHtml + '</div>' +
        '</div>';
      modal.querySelector('.form-modal-title').textContent = title;
      document.body.appendChild(modal);

      function onKey(e) {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        close();
      }
      function close() {
        document.removeEventListener('keydown', onKey, true);
        modal.remove();
      }
      document.addEventListener('keydown', onKey, true);
      modal.querySelector('.form-modal-backdrop').addEventListener('click', close);
      modal.querySelector('.form-modal-close').addEventListener('click', close);
      return { modal, close };
    }
  `;
}
