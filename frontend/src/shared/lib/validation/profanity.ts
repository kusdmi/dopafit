// Minimal Russian profanity root check for free-text names (day/program titles).
// Roots, not exact words: catches inflections. Extend the list as needed.
const ROOTS = ['хуй', 'хуе', 'хуё', 'пизд', 'бля', 'еба', 'ёб', 'мудак', 'сук', 'залуп'];

export function containsProfanity(value: string): boolean {
  const normalized = value.toLowerCase().replace(/\s+/g, ' ').trim();
  return ROOTS.some((root) => normalized.includes(root));
}
