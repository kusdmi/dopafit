import type { components } from '@/shared/api/schema';

type Difficulty = components['schemas']['Difficulty'];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  beginner: 'Новичок',
  intermediate: 'Средний',
  advanced: 'Продвинутый',
};

// Semantic token classes only — must read correctly in light and dark themes.
export const DIFFICULTY_CLASS: Record<Difficulty, string> = {
  beginner: 'text-success',
  intermediate: 'text-brand-400',
  advanced: 'text-danger',
};
