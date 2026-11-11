import type { APIRequestContext, APIResponse } from '@playwright/test';
import { randomUUID } from 'node:crypto';

/**
 * Fachliche API ueber den BFF (`/api/v1`) mit der Session eines angemeldeten
 * Browser-Kontexts. Dient zum Anlegen von Testdaten fuer Ablaeufe ohne
 * Oberflaeche (z. B. Events anlegen) und fuer Pruefungen am Datenstand.
 */
export class Api {
  constructor(readonly raw: APIRequestContext) {}

  private async json<T>(response: APIResponse, what: string): Promise<T> {
    if (!response.ok()) {
      throw new Error(`${what}: HTTP ${response.status()} ${await response.text()}`);
    }
    return (response.status() === 204 ? undefined : await response.json()) as T;
  }

  async get<T>(path: string): Promise<T> {
    return this.json<T>(await this.raw.get(`/api/v1${path}`), `GET ${path}`);
  }

  async post<T>(path: string, data?: unknown, idempotent = false): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (idempotent) headers['Idempotency-Key'] = randomUUID();
    return this.json<T>(await this.raw.post(`/api/v1${path}`, { data, headers }), `POST ${path}`);
  }

  async put<T>(path: string, data?: unknown): Promise<T> {
    return this.json<T>(
      await this.raw.put(`/api/v1${path}`, { data, headers: { Accept: 'application/json' } }),
      `PUT ${path}`,
    );
  }

  async me(): Promise<{ id: string; displayName: string; roles: string[]; permissions: string[] }> {
    return this.get('/users/me');
  }

  async createEvent(title: string, startsInHours = 2): Promise<{ id: string; title: string }> {
    const startsAt = new Date(Date.now() + startsInHours * 3_600_000);
    const endsAt = new Date(startsAt.getTime() + 6 * 3_600_000);
    return this.post('/events', {
      title,
      description: 'Angelegt von den E2E-Tests',
      location: 'Vereinsheim',
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    });
  }

  async setEventStatus(eventId: string, status: 'draft' | 'published' | 'active' | 'completed'): Promise<void> {
    await this.put(`/events/${eventId}`, { status });
  }

  async addParticipant(eventId: string, userId: string): Promise<void> {
    await this.post(`/events/${eventId}/participants`, { userId, role: 'participant' });
  }

  /** Schlaegt ein Getraenk vor und gibt es frei (Vorstand). */
  async approvedDrink(name: string, price: number): Promise<{ id: string; name: string }> {
    const drink = await this.post<{ id: string; name: string }>('/drinks', {
      name,
      category: 'Bier',
      defaultPrice: price.toFixed(2),
      currency: 'EUR',
    });
    await this.post(`/drinks/${drink.id}/approve`);
    return drink;
  }

  /** Legt eine Strich-Kategorie an und ordnet ihr die Getraenke zu (Vorstand). */
  async tallyCategory(name: string, price: number, drinkIds: string[]): Promise<{ id: string; name: string }> {
    const category = await this.post<{ id: string; name: string }>('/tally-categories', {
      name,
      price: price.toFixed(2),
    });
    for (const drinkId of drinkIds) {
      await this.put(`/drinks/${drinkId}`, { tallyCategoryId: category.id });
    }
    return category;
  }

  async addBarcode(drinkId: string, barcode: string): Promise<void> {
    await this.post(`/drinks/${drinkId}/barcodes`, { barcode });
  }

  async addEventDrink(eventId: string, drinkId: string, price: number): Promise<{ id: string }> {
    return this.post(`/events/${eventId}/drinks`, { drinkId, price: price.toFixed(2), currency: 'EUR' });
  }

  async topup(memberId: string, amount: number): Promise<void> {
    await this.post('/ledger/topups', { memberId, amount: amount.toFixed(2), currency: 'EUR', note: 'E2E' }, true);
  }

  async balance(memberId: string): Promise<number> {
    const body = await this.get<{ creditBalance: number | string }>(`/ledger/members/${memberId}/balance`);
    return Number(body.creditBalance);
  }
}
