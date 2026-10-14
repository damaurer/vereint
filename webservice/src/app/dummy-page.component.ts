import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from './i18n';
import { StateComponent } from './ui/state.component';

@Component({
  selector: 'app-dummy-page',
  imports: [StateComponent, RouterLink, TranslatePipe],
  template: `
    <main class="page-shell">
      <section class="page-card vereint-card" aria-labelledby="page-title">
        <div class="vereint-card-header">
          <div class="vereint-card-heading">
            <span class="eyebrow vereint-eyebrow">{{ access | t }}</span>
            <h1 id="page-title" class="vereint-title">{{ title | t }}</h1>
          </div>
        </div>
        <div class="vereint-card-body">
          <p class="vereint-subtitle">{{ description | t }}</p>
          <vereint-state
            kind="empty"
            [title]="'routes.placeholder.title' | t"
            [message]="'routes.placeholder.message' | t"
          />
          <a routerLink="/">{{ 'routes.placeholder.toHome' | t }}</a>
        </div>
      </section>
    </main>
  `,
})
export class DummyPageComponent {
  private readonly route = inject(ActivatedRoute);
  // Übersetzungsschlüssel aus `route.data` (siehe `app.routes.ts`).
  protected readonly title = this.route.snapshot.data['title'] as string;
  protected readonly description = this.route.snapshot.data['description'] as string;
  protected readonly access = this.route.snapshot.data['access'] as string;
}
