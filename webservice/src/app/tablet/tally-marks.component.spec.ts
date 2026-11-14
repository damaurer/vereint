import { TestBed } from '@angular/core/testing';
import { TallyMarksComponent, tallyBundles } from './tally-marks.component';

describe('tallyBundles', () => {
  it('splits a count into bundles of five', () => {
    expect(tallyBundles(0)).toEqual([]);
    expect(tallyBundles(3)).toEqual([3]);
    expect(tallyBundles(5)).toEqual([5]);
    expect(tallyBundles(7)).toEqual([5, 2]);
    expect(tallyBundles(-2)).toEqual([]);
  });
});

describe('TallyMarksComponent', () => {
  it('draws a full bundle as four upright strokes crossed by the fifth', () => {
    const fixture = TestBed.createComponent(TallyMarksComponent);
    fixture.componentInstance.count = 7;
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const bundles = el.querySelectorAll('.bundle');
    expect(bundles.length).toBe(2);
    expect(bundles[0].classList.contains('is-full')).toBe(true);
    expect(bundles[1].classList.contains('is-full')).toBe(false);
    expect(bundles[1].querySelectorAll('.stroke').length).toBe(2);
  });
});
