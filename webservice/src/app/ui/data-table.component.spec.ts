import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DataTableColumn, DataTableComponent } from './data-table.component';

interface Row {
  name: string;
  balance: string;
}

/** Nachweis der generischen Daten-Tabelle (TICKET-032). */
describe('DataTableComponent', () => {
  const columns: DataTableColumn<Row>[] = [
    { key: 'name', header: 'Name', value: (row) => row.name },
    { key: 'balance', header: 'Guthaben', value: (row) => row.balance },
  ];

  const create = (rows: Row[], emptyLabel?: string) => {
    TestBed.configureTestingModule({ imports: [DataTableComponent] });
    const fixture = TestBed.createComponent<DataTableComponent<Row>>(DataTableComponent<Row>);
    fixture.componentInstance.columns = columns;
    fixture.componentInstance.rows = rows;
    if (emptyLabel) fixture.componentInstance.emptyLabel = emptyLabel;
    fixture.detectChanges();
    return fixture;
  };

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;

  it('renders headers and row values', () => {
    const fixture = create([{ name: 'Alice', balance: '5,00 €' }]);
    const text = root(fixture).textContent ?? '';
    expect(text).toContain('Name');
    expect(text).toContain('Guthaben');
    expect(text).toContain('Alice');
    expect(text).toContain('5,00 €');
  });

  it('renders the empty label when there are no rows', () => {
    const fixture = create([], 'Keine Mitglieder');
    expect(root(fixture).querySelector('.ui-table-empty')?.textContent).toContain(
      'Keine Mitglieder',
    );
  });
});
