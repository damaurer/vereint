import { TestBed } from '@angular/core/testing';
import { ReportDialogComponent, type ReportDialogResult } from './report-dialog.component';

describe('ReportDialogComponent', () => {
  const create = (blockable = true) => {
    TestBed.configureTestingModule({ imports: [ReportDialogComponent] });
    const fixture = TestBed.createComponent(ReportDialogComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('personName', 'Bob');
    fixture.componentRef.setInput('blockable', blockable);
    fixture.detectChanges();
    const results: ReportDialogResult[] = [];
    fixture.componentInstance.submitted.subscribe((result) => results.push(result));
    return { fixture, results, root: fixture.nativeElement as HTMLElement };
  };

  const button = (root: HTMLElement, label: string) =>
    Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === label,
    );

  it('needs a reason before reporting and passes note and block choice', () => {
    const { fixture, results, root } = create();
    expect(button(root, 'Melden')?.disabled).toBe(true);

    root.querySelector<HTMLInputElement>('input[value="harassment"]')!.click();
    const note = root.querySelector<HTMLTextAreaElement>('textarea')!;
    note.value = '  beleidigend ';
    note.dispatchEvent(new Event('input'));
    root.querySelector<HTMLInputElement>('input[name="report-block"]')!.click();
    fixture.detectChanges();

    button(root, 'Melden')!.click();
    expect(results).toEqual([
      { report: { reason: 'harassment', note: 'beleidigend' }, block: true },
    ]);
  });

  it('can only block', () => {
    const { results, root } = create();
    button(root, 'Nur blockieren')!.click();
    expect(results).toEqual([{ report: null, block: true }]);
  });

  it('hides blocking when it is not possible', () => {
    const { root } = create(false);
    expect(button(root, 'Nur blockieren')).toBeUndefined();
    expect(root.querySelector('input[name="report-block"]')).toBeNull();
  });
});
