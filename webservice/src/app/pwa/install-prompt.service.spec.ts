import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { vi } from 'vitest';
import { InstallPromptService } from './install-prompt.service';

describe('InstallPromptService', () => {
  const setup = (platform = 'browser') => {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: platform }] });
    return TestBed.inject(InstallPromptService);
  };

  it('offers the browser install dialog once it is available', async () => {
    const service = setup();
    service.init();
    expect(service.mode()).toBe('manual');

    const prompt = vi.fn(async () => undefined);
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(service.mode()).toBe('prompt');

    await expect(service.install()).resolves.toBe(true);
    expect(prompt).toHaveBeenCalledOnce();
    expect(service.mode()).toBe('installed');
  });

  it('shows the home-screen hint on iPhone', () => {
    const ua = vi
      .spyOn(navigator, 'userAgent', 'get')
      .mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)');
    const service = setup();
    service.init();
    expect(service.mode()).toBe('ios');
    ua.mockRestore();
  });

  it('does nothing during SSR', () => {
    const service = setup('server');
    service.init();
    expect(service.mode()).toBe('manual');
  });
});
