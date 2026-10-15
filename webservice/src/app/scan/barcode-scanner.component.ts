import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslatePipe } from '../i18n';
import { BARCODE_SCANNER, ScannerHandle } from './barcode-scanner';

type CameraState = 'starting' | 'running' | 'denied' | 'unavailable';

/**
 * Kamerabild mit Zielrahmen, das genau einen Strichcode erkennt und meldet.
 *
 * Nach dem ersten Treffer stoppt die Kamera; wer erneut scannen will, blendet
 * die Komponente neu ein. Ist keine Kamera verfügbar oder der Zugriff verweigert,
 * zeigt sie einen Hinweis, damit die Seite auf die Eingabe von Hand verweisen kann.
 */
@Component({
  selector: 'vereint-barcode-scanner',
  imports: [TranslatePipe],
  template: `
    <div class="scanner" [class.scanner-off]="state() !== 'running'">
      <video
        #video
        class="scanner-video"
        playsinline
        muted
        [attr.aria-label]="'scan.camera.label' | t"
      ></video>
      @if (state() === 'running') {
        <div class="scanner-frame" aria-hidden="true"></div>
      }
      @switch (state()) {
        @case ('starting') {
          <p class="scanner-note" role="status">{{ 'scan.camera.starting' | t }}</p>
        }
        @case ('denied') {
          <p class="scanner-note" role="alert">{{ 'scan.camera.denied' | t }}</p>
        }
        @case ('unavailable') {
          <p class="scanner-note" role="alert">{{ 'scan.camera.unavailable' | t }}</p>
        }
      }
    </div>
  `,
  styles: [
    `
      .scanner {
        position: relative;
        aspect-ratio: 4 / 3;
        width: 100%;
        max-width: 28rem;
        margin-inline: auto;
        overflow: hidden;
        border-radius: var(--radius-lg, 16px);
        background: #000;
      }

      .scanner-off {
        display: grid;
        place-items: center;
        background: var(--color-surface-muted, var(--color-surface));
        border: 1px dashed var(--color-border);
      }

      .scanner-video {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .scanner-off .scanner-video {
        position: absolute;
        opacity: 0;
        pointer-events: none;
      }

      .scanner-frame {
        position: absolute;
        inset: 30% 10%;
        border: 3px solid #fff;
        border-radius: 12px;
        box-shadow: 0 0 0 100vmax rgb(0 0 0 / 35%);
      }

      .scanner-note {
        margin: 0;
        padding: 1rem;
        text-align: center;
        color: var(--color-text-muted);
      }
    `,
  ],
})
export class BarcodeScannerComponent implements AfterViewInit, OnDestroy {
  private readonly scanner = inject(BARCODE_SCANNER);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');

  /** Der erkannte Strichcode (genau einmal je Einblendung). */
  readonly detected = output<string>();

  protected readonly state = signal<CameraState>('starting');
  private handle: ScannerHandle | null = null;
  private finished = false;

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;
    if (!this.scanner.supported()) {
      this.state.set('unavailable');
      return;
    }
    this.scanner
      .start(this.video().nativeElement, (code) => this.onCode(code))
      .then((handle) => {
        if (this.finished) {
          handle.stop();
          return;
        }
        this.handle = handle;
        this.state.set('running');
      })
      .catch((err: unknown) => {
        if (this.finished) return;
        const name = (err as { name?: string })?.name;
        this.state.set(
          name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable',
        );
      });
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private onCode(code: string): void {
    const trimmed = code.trim();
    if (this.finished || !trimmed) return;
    this.stop();
    this.detected.emit(trimmed);
  }

  private stop(): void {
    this.finished = true;
    this.handle?.stop();
    this.handle = null;
  }
}
