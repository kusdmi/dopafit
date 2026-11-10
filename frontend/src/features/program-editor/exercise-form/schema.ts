import { z } from 'zod';
import { trainingNameSchema } from '@/shared/lib/validation/training';

export const exerciseFormSchema = z.object({
  name: trainingNameSchema(255),
  category_id: z.string().min(1, 'Выберите категорию'),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  description: z.string(),
});

export type ExerciseFormValues = z.infer<typeof exerciseFormSchema>;
