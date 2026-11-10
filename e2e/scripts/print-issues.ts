import { KNOWN_ISSUES } from '../support/known-issues.ts';

/**
 * Prints the current state of the findings from the one place that holds them.
 * This replaces the hand-kept progress document the old QA process had: a
 * generated summary cannot be forgotten on a commit.
 */

interface Row {
  id: string;
  kind: string;
  priority: string;
  title: string;
  tests: readonly string[];
  cause?: string;
}

const rows: Row[] = Object.entries(KNOWN_ISSUES).map(([id, issue]) => ({
  id,
  kind: issue.kind,
  priority: issue.priority,
  title: issue.title,
  tests: issue.tests,
  cause: 'cause' in issue ? issue.cause : undefined,
}));

function section(name: string, group: Row[]): void {
  console.log(`\n${name} — ${group.length}`);
  if (group.length === 0) {
    console.log('  (пусто)');
    return;
  }
  const sorted = [...group].sort(
    (a, b) => a.priority.localeCompare(b.priority) || a.id.localeCompare(b.id),
  );
  for (const row of sorted) {
    console.log(`  ${row.id}  ${row.priority}  ${row.title}`);
    console.log(`        тесты: ${row.tests.join(', ')}`);
    if (row.cause) console.log(`        причина: ${row.cause}`);
  }
}

console.log(`Известные дефекты: ${rows.length}`);
section(
  'Безопасность',
  rows.filter((row) => row.kind === 'security'),
);
section(
  'Функциональные',
  rows.filter((row) => row.kind !== 'security'),
);
console.log('\nИсточник: e2e/support/known-issues.ts');
