import { z } from 'zod';

export const eventBookingSchema = z.object({
  time: z.string().min(1, 'Укажите время'),
  program_id: z.string(),
  client_ids: z.array(z.string()),
});

export type EventBookingValues = z.infer<typeof eventBookingSchema>;
