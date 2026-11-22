import { readFileSync } from 'node:fs';
import { localSQL } from './local-db.mjs';
localSQL(readFileSync(new URL('../fixtures/seed.sql', import.meta.url), 'utf8'));
process.stdout.write('Synthetic local fixtures ready. No production resource is configured.\n');
