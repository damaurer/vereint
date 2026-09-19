import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-dummy-page',
  imports: [RouterLink],
  template: `
    <main class="page-shell">
      <section class="page-card vereint-card" aria-labelledby="page-title">
        <div class="vereint-card-header">
          <div class="vereint-card-heading">
            <span class="eyebrow vereint-eyebrow">{{ access }}</span>
            <h1 id="page-title" class="vereint-title">{{ title }}</h1>
          </div>
        </div>
        <div class="vereint-card-body">
          <p class="vereint-subtitle">{{ description }}</p>
          <div class="state-card" role="status">
            <strong>Feature-Platzhalter</strong>
            <span>Diese Seite ist für die SSR- und Rechteprüfung vorbereitet.</span>
          </div>
          <a routerLink="/pwa/login">Zur Anmeldung</a>
        </div>
      </section>
    </main>
  `,
})
export class DummyPageComponent {
  private readonly route = inject(ActivatedRoute);
  protected readonly title = this.route.snapshot.data['title'] as string;
  protected readonly description = this.route.snapshot.data['description'] as string;
  protected readonly access = this.route.snapshot.data['access'] as string;
}
