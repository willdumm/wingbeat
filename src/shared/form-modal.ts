import { icon } from './icons';

/**
 * Shared small form dialog: a scrim, and a panel with a title bar, a body of labeled
 * fields (`.form-field`) that scrolls when it doesn't fit, and a footer of buttons. Used
 * by the shared flight form (flight-editor.ts) and the duty log's day editor.
 * It sits above the settings modal, so it can open from a settings view.
 */
/**
 * The text input / select / textarea look shared by every form: the form modal's
 * fields and the settings modal's forms. `selector` lists the controls to style.
 */
export function formControlStyles(selector: string): string {
  return `
    ${selector} {
      padding: 0.4rem 0.5rem;
      background: var(--input-bg);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-family: var(--font-ui);
      font-size: var(--size-md);
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
      transition: border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard);
    }
    :is(${selector}):hover:not(:disabled) { border-color: var(--border-strong); }
    :is(${selector}):focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--ring-focus); }
  `;
}

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
    .form-modal-panel:focus { outline: none; }
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
    .form-modal-hint { font-size: var(--size-xs); }
    .form-modal-error { font-size: var(--size-xs); color: var(--danger-fg); }
    .form-modal-error:empty { display: none; }
    .form-modal-footer {
      padding: 0.65rem 1rem;
      border-top: 1px solid var(--border);
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      justify-content: flex-end;
    }
    /* Footer buttons: .btn-* with .btn-md (buttons.ts); Cancel, then the primary action. */
    .form-modal-footer-spacer { flex: 1; }
    .form-modal [hidden] { display: none; }

    .form-field {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      min-width: 0;
    }
    .form-field label, .form-field-label {
      font-size: var(--size-2xs);
      font-weight: var(--weight-semibold);
      text-transform: uppercase;
      letter-spacing: var(--tracking-caps);
      color: var(--text-muted);
    }
    ${formControlStyles('.form-field input, .form-field select, .form-field textarea')}
    .form-field input:disabled { opacity: 0.5; }
    .form-field textarea { resize: vertical; min-height: 3.5rem; }
    /* The tracker's value under a field the user can correct. */
    .form-field-original { font-size: var(--size-2xs); color: var(--text-muted); }
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
      modal.setAttribute('aria-labelledby', id + '-title');
      modal.innerHTML =
        '<div class="form-modal-backdrop"></div>' +
        '<div class="form-modal-panel" tabindex="-1">' +
          '<div class="form-modal-header">' +
            '<span class="form-modal-title" id="' + id + '-title"></span>' +
            '<button type="button" class="form-modal-close btn-icon" aria-label="Close">' + ${JSON.stringify(icon('x', { size: 16 }))} + '</button>' +
          '</div>' +
          '<div class="form-modal-body">' + bodyHtml + '</div>' +
          '<div class="form-modal-footer">' + footerHtml + '</div>' +
        '</div>';
      modal.querySelector('.form-modal-title').textContent = title;
      document.body.appendChild(modal);
      // Move focus into the dialog (the panel, so a phone doesn't pop its keyboard for the
      // first field), and give it back on close.
      const opener = document.activeElement;
      modal.querySelector('.form-modal-panel').focus();

      function onKey(e) {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        close();
      }
      function close() {
        document.removeEventListener('keydown', onKey, true);
        modal.remove();
        if (opener && opener.isConnected) opener.focus();
      }
      document.addEventListener('keydown', onKey, true);
      modal.querySelector('.form-modal-backdrop').addEventListener('click', close);
      modal.querySelector('.form-modal-close').addEventListener('click', close);
      return { modal, close };
    }
  `;
}
