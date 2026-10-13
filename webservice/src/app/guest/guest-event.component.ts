import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AsyncState } from '../member/async-state';
import { formatDateTime } from '../member/member-format';
import { describeApiError } from '../api/api-client.service';
import type { ChatMessage } from '../events/event-manage.types';
import { GuestEventService } from './guest-event.service';
import { StateComponent } from '../ui/state.component';

/**
 * Gastoberfläche eines Events (TICKET-025).
 *
 * Ein Gast erreicht ausschließlich den zugewiesenen Event-Chat. Das
 * eventgebundene Gast-Token stammt aus dem Magic-Link (`?token=…`) und ist das
 * einzige Geheimnis; es wird nur zur Laufzeit im Speicher gehalten, niemals im
 * SSR-HTML ausgegeben und ausschließlich als Header `X-Guest-Token` an den
 * Fachservice gesendet. Fehlt das Token oder ist es ungültig, widerrufen bzw.
 * abgelaufen, zeigt die Ansicht eine neutrale Meldung (`deny by default`); die
 * verbindliche Prüfung erfolgt serverseitig.
 */
@Component({
  selector: 'app-guest-event',
  imports: [StateComponent, FormsModule],
  template: `
    <main class="page-shell">
      <section class="page-card member-card" aria-labelledby="guest-title">
        <span class="eyebrow">Gastzugang</span>
        <h1 id="guest-title">{{ eventTitle() ?? 'Event-Chat' }}</h1>
        <p>Als Gast hast du Zugriff auf den Event-Chat.</p>

        @if (!guestToken) {
          <div class="state-card state-error" role="alert">
            <strong>Kein Gastzugang</strong>
            <span>Dieser Link enthält kein gültiges Gast-Token. Bitte den Einladungslink erneut öffnen.</span>
          </div>
        } @else if (load.isLoading()) {
          <vereint-state
            kind="loading"
            title="Wird geladen …"
            message="Der Event-Chat wird abgerufen."
          />
        } @else if (load.isError()) {
          <vereint-state
            kind="error"
            title="Chat nicht verfügbar"
            [message]="load.errorMessage()"
            (retry)="reload()"
          />
        } @else if (load.data(); as messages) {
          @if (actionError(); as err) {
            <p class="guest-action-error" role="alert">{{ err }}</p>
          }
          @if (messages.length === 0) {
            <p class="member-muted">Noch keine Nachrichten.</p>
          } @else {
            <ul class="member-list guest-chat">
              @for (message of messages; track message.id) {
                <li class="member-list-item">
                  <span class="member-list-title">{{ message.senderName }}</span>
                  <span class="guest-chat-text">{{ message.message }}</span>
                  <span class="member-list-meta">{{ formatDateTime(message.createdAt) }}</span>
                </li>
              }
            </ul>
          }
          <form class="guest-form" (ngSubmit)="send()">
            <label class="guest-field">
              <span class="visually-hidden">Nachricht</span>
              <input
                name="guestMessage"
                [(ngModel)]="message"
                maxlength="4000"
                placeholder="Nachricht schreiben …"
                required
              />
            </label>
            <button type="submit" class="member-button" [disabled]="busy()">Senden</button>
          </form>
        }
      </section>
    </main>
  `,
  styles: [
    `
      .guest-form {
        display: flex;
        gap: 0.75rem;
        align-items: center;
        margin-top: 1rem;
      }
      .guest-field {
        flex: 1 1 auto;
      }
      .guest-field input {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid #cbd5e1;
        border-radius: 0.5rem;
        font: inherit;
      }
      .guest-chat .guest-chat-text {
        display: block;
      }
      .guest-action-error {
        color: #b91c1c;
        font-weight: 600;
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
      }
    `,
  ],
})
export class GuestEventComponent implements OnInit, OnDestroy {
  private readonly service = inject(GuestEventService);
  private readonly route = inject(ActivatedRoute);

  protected readonly eventId = this.route.snapshot.paramMap.get('eventId') ?? '';
  /** Gast-Token aus dem Magic-Link; niemals serverseitig gerendert. */
  protected readonly guestToken = this.route.snapshot.queryParamMap.get('token') ?? '';

  protected readonly load = new AsyncState<ChatMessage[]>();
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly eventTitle = signal<string | null>(
    this.route.snapshot.queryParamMap.get('title'),
  );

  protected message = '';
  protected readonly formatDateTime = formatDateTime;

  ngOnInit(): void {
    if (this.guestToken) {
      this.reload();
    }
  }

  ngOnDestroy(): void {
    this.load.destroy();
  }

  protected reload(): void {
    if (!this.guestToken) return;
    this.load.run(this.service.listMessages(this.eventId, this.guestToken));
  }

  protected send(): void {
    const message = this.message.trim();
    if (!message || !this.guestToken) return;
    this.busy.set(true);
    this.actionError.set(null);
    this.service.sendMessage(this.eventId, this.guestToken, { message }).subscribe({
      next: () => {
        this.busy.set(false);
        this.message = '';
        this.reload();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.actionError.set(describeApiError(error));
      },
    });
  }
}
