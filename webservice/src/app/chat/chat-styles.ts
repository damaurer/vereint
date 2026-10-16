/**
 * Gemeinsame Layout-Styles von Gruppenchat (`/chat`) und Direktnachrichten
 * (`/direktnachrichten`): Konversationsliste links, Verlauf rechts; mobil
 * einspaltig (Liste ODER Verlauf).
 */
export const CHAT_LAYOUT_STYLES = `
  .chat-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .chat-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .chat-head h1 {
    margin: 0;
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
  }
  .chat-aside-title {
    margin: var(--space-2) 0 0;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .chat-conversations {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-2);
  }
  .chat-conversation {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background-color: var(--color-surface-raised);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .chat-conversation.is-active {
    border-color: var(--color-brand);
    background-color: var(--color-brand-soft);
  }
  .chat-conversation-icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    background-color: var(--color-brand-soft);
    color: var(--color-brand);
    font-size: 1.2rem;
  }
  .chat-conversation-body {
    flex: 1;
    min-width: 0;
  }
  .chat-conversation-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .chat-conversation-name {
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .chat-conversation-time {
    color: var(--color-text-muted);
    font-size: 0.8rem;
    white-space: nowrap;
  }
  .chat-conversation-preview {
    display: block;
    color: var(--color-text-muted);
    font-size: 0.85rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chat-unread {
    flex: none;
    min-width: 1.4rem;
    height: 1.4rem;
    padding: 0 0.35rem;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background-color: var(--color-brand);
    color: #1a1206;
    font-size: 0.8rem;
    font-weight: 700;
  }
  .chat-search {
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
  .chat-search input {
    width: 100%;
    padding: 0.7rem 0.9rem;
    border-radius: 999px;
    border: 1px solid var(--color-border);
    background-color: var(--color-surface-raised);
    color: inherit;
    font: inherit;
  }
  .chat-main {
    min-width: 0;
  }

  /* Mobil: einspaltig, Liste ODER Verlauf. */
  .chat-layout.is-thread .chat-aside {
    display: none;
  }
  .chat-layout:not(.is-thread) .chat-main {
    display: none;
  }

  /* Tablet/Web: zweispaltig, Liste und Verlauf gleichzeitig. */
  @media (min-width: 641px) {
    .chat-layout {
      grid-template-columns: minmax(14rem, 22rem) minmax(0, 1fr);
    }
    .chat-layout .chat-aside,
    .chat-layout .chat-main {
      display: flex;
      flex-direction: column;
    }
  }
`;
