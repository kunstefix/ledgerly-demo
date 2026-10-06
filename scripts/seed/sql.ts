// Small helpers to emit seed SQL.

/**
 * An instant relative to when the seed is loaded, as an SQL expression. The seed runs in
 * one transaction, so every `now()` in it is the same instant.
 */
export class At {
  private constructor(private readonly expr: string) {}

  static now(): At {
    return new At('now()');
  }

  /** e.g. At.ago('3 days 4 hours') */
  static ago(interval: string): At {
    return new At(`now() - interval '${interval}'`);
  }

  /** A moment in the current calendar month that is never in the future. */
  static thisMonth(interval: string): At {
    return new At(`least(now(), date_trunc('month', now()) + interval '${interval}')`);
  }

  plus(interval: string): At {
    return new At(`${this.expr} + interval '${interval}'`);
  }

  minus(interval: string): At {
    return new At(`${this.expr} - interval '${interval}'`);
  }

  get sql(): string {
    return `(${this.expr})`;
  }

  /** The UTC calendar date of this instant, optionally shifted by whole days. */
  date(addDays = 0): Raw {
    return new Raw(addDays === 0 ? `${this.sql}::date` : `(${this.sql}::date + ${addDays})`);
  }
}

/** Literal SQL, emitted as-is. */
export class Raw {
  constructor(readonly sql: string) {}
}

export type Value = string | number | null | At | Raw;

export function literal(value: Value): string {
  if (value === null) return 'NULL';
  if (value instanceof At || value instanceof Raw) return value.sql;
  if (typeof value === 'number') return String(value);
  return `'${value.replaceAll("'", "''")}'`;
}

export function insert(table: string, columns: string[], rows: Value[][]): string {
  if (rows.length === 0) return '';
  const values = rows.map((row) => `  (${row.map(literal).join(', ')})`).join(',\n');
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES\n${values};\n`;
}

/** Deterministic PRNG (mulberry32). */
export function random(seed: number) {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1));
    },
    pick<T>(items: readonly T[]): T {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new Error('pick from empty list');
      return item;
    },
    chance(p: number): boolean {
      return next() < p;
    },
  };
}
