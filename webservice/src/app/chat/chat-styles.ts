/** Ab dieser Breite stehen Liste und Verlauf nebeneinander (Tablet/Web). */
export const CHAT_WIDE_QUERY = '(min-width: 641px)';

/**
 * Layout der Chat-Seite (`/chat`) wie bei bekannten Messengern: Liste aller
 * Chats links, Verlauf rechts; mobil einspaltig, der Verlauf im Vollbild.
 */
export const CHAT_LAYOUT_STYLES = `
  .chat-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .chat-page-title {
    margin: 0;
    flex: 1;
    min-width: 0;
  }
  .chat-layout {
    display: grid;
    /* minmax(0, …): lange Vorschauen dürfen die Spalte nicht über den Bildschirm drücken. */
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
    min-height: 0;
  }
  .chat-aside {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
    min-height: 0;
  }
  .chat-list-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .chat-new {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border: none;
    border-radius: 50%;
    background-color: var(--color-brand);
    color: var(--color-on-brand);
    font-size: 1.3rem;
    cursor: pointer;
    box-shadow: var(--shadow-sm, none);
  }
  .chat-new:hover {
    filter: brightness(1.08);
  }

  .chat-search {
    position: relative;
    display: block;
  }
  .chat-search-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .chat-search-icon {
    position: absolute;
    left: 0.85rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-text-muted);
    pointer-events: none;
  }
  .chat-search input {
    width: 100%;
    min-height: 2.5rem;
    padding: 0 0.9rem 0 2.4rem;
    border-radius: 999px;
    border: 1px solid var(--color-border);
    background-color: var(--color-surface-subtle);
    color: inherit;
    font: inherit;
  }

  .chat-filters {
    display: flex;
    gap: 0.4rem;
    overflow-x: auto;
    padding-bottom: 0.1rem;
    scrollbar-width: none;
  }
  .chat-filter {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 2rem;
    padding: 0 0.85rem;
    border: 1px solid var(--color-border);
    border-radius: 999px;
    background-color: var(--color-surface);
    color: var(--color-text-muted);
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }
  .chat-filter.is-active {
    border-color: var(--color-brand-soft);
    background-color: var(--color-brand-soft);
    color: var(--color-brand);
  }
  .chat-filter-count {
    min-width: 1.2rem;
    padding: 0 0.3rem;
    border-radius: 999px;
    background-color: var(--color-brand);
    color: var(--color-on-brand);
    font-size: 0.75rem;
    text-align: center;
  }

  /* Eine durchgehende Liste, Zeilen durch feine Linien getrennt. */
  .chat-conversations {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
  }
  .chat-conversations > li + li .chat-conversation-body {
    border-top: 1px solid var(--color-border);
  }
  .chat-conversation {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0 0.5rem;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .chat-conversation:hover {
    background-color: var(--color-surface-subtle);
  }
  .chat-conversation.is-active {
    background-color: var(--color-brand-soft);
  }
  .chat-conversation.is-active .chat-conversation-body,
  .chat-conversations > li:has(+ li .is-active) + li .chat-conversation-body {
    border-top-color: transparent;
  }
  .chat-conversation-avatar {
    flex: none;
  }
  .chat-conversation-icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    background-color: var(--color-brand);
    color: var(--color-on-brand);
    font-size: 1.25rem;
  }
  .chat-conversation-icon[data-type='event'] {
    background-color: var(--color-brand-soft);
    color: var(--color-brand);
  }
  .chat-conversation-icon[data-type='direct'] {
    background-color: var(--color-surface-subtle);
    color: var(--color-text);
  }
  .chat-conversation-body {
    flex: 1;
    min-width: 0;
    padding: 0.7rem 0.25rem 0.7rem 0;
  }
  .chat-conversation-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .chat-conversation-name {
    min-width: 0;
    overflow: hidden;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chat-conversation.has-unread .chat-conversation-name {
    font-weight: 700;
  }
  .chat-conversation-time {
    color: var(--color-text-muted);
    font-size: 0.75rem;
    white-space: nowrap;
  }
  .chat-conversation.has-unread .chat-conversation-time {
    color: var(--color-brand);
    font-weight: 700;
  }
  .chat-conversation-bottom {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: 0.15rem;
  }
  .chat-conversation-preview {
    display: block;
    flex: 1;
    min-width: 0;
    color: var(--color-text-muted);
    font-size: 0.85rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chat-conversation-kind {
    color: var(--color-brand);
    font-weight: 600;
  }
  .chat-unread {
    flex: none;
    min-width: 1.35rem;
    height: 1.35rem;
    padding: 0 0.35rem;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background-color: var(--color-brand);
    color: var(--color-on-brand);
    font-size: 0.75rem;
    font-weight: 700;
  }

  .chat-main {
    min-width: 0;
    min-height: 0;
  }
  .chat-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    height: 100%;
    min-height: 16rem;
    padding: var(--space-4);
    text-align: center;
    color: var(--color-text-muted);
  }
  .chat-placeholder-icon {
    display: grid;
    place-items: center;
    width: 4rem;
    height: 4rem;
    border-radius: 50%;
    background-color: var(--color-brand-soft);
    color: var(--color-brand);
    font-size: 1.8rem;
  }
  .chat-placeholder-title {
    margin: 0;
    font-weight: 700;
    color: var(--color-text);
  }
  .chat-placeholder-text {
    margin: 0;
    max-width: 22rem;
  }

  /* Mobil: einspaltig. Liste ODER Verlauf, der Verlauf im Vollbild über der Navigation. */
  @media (max-width: 640px) {
    .chat-layout.is-thread .chat-aside {
      display: none;
    }
    .chat-layout:not(.is-thread) .chat-main {
      display: none;
    }
    .chat-layout.is-thread .chat-main {
      position: fixed;
      inset: 0;
      z-index: 45;
      display: flex;
      flex-direction: column;
      padding: calc(env(safe-area-inset-top) + var(--space-2)) calc(env(safe-area-inset-right) + var(--space-2))
        calc(env(safe-area-inset-bottom) + var(--space-2)) calc(env(safe-area-inset-left) + var(--space-2));
      background-color: var(--color-surface);
    }
    .chat-layout.is-thread .chat-main > * {
      flex: 1;
      min-height: 0;
    }
  }

  /* Tablet/Web: zweispaltig, Liste und Verlauf gleichzeitig in fester Höhe. */
  @media ${CHAT_WIDE_QUERY} {
    .chat-layout {
      grid-template-columns: minmax(16rem, 24rem) minmax(0, 1fr);
      height: max(32rem, calc(100dvh - 11rem));
    }
    .chat-layout .chat-aside,
    .chat-layout .chat-main {
      display: flex;
      flex-direction: column;
    }
    .chat-layout .chat-aside {
      padding-right: var(--space-3);
      border-right: 1px solid var(--color-border);
    }
    .chat-conversations {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .chat-main > * {
      flex: 1;
      min-height: 0;
    }
  }
`;
