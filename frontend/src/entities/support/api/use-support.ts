import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';
import {
  ADD_SUPPORT_REPLY_KEY,
  CREATE_SUPPORT_TICKET_KEY,
} from '@/shared/lib/offline/mutationKeys';

export type Ticket = components['schemas']['TicketOut'];
export type TicketDetail = components['schemas']['TicketDetailOut'];
export type TicketCreateRequest = components['schemas']['TicketCreateRequest'];
export type ReplyCreateRequest = components['schemas']['ReplyCreateRequest'];

export const supportTicketsQueryKey = ['support', 'tickets'] as const;
export const supportTicketKey = (id: string) => ['support', 'ticket', id] as const;

// Variables for the reply mutation. ticketId lives in the variables (not in a
// hook closure) so a paused/offline reply carries everything it needs to be
// replayed from the mutation defaults after an app restart.
export interface AddReplyVars {
  ticketId: string;
  body: ReplyCreateRequest;
}

// Standalone mutationFns shared by the hooks and the offline mutation defaults
// (registered in App.tsx). Business logic stays in the entities layer so the
// shared setupOffline helper can receive it by injection without an
// FSD-breaking `shared` -> `entities` import.
export async function createTicketMutationFn(req: TicketCreateRequest) {
  const { data, error } = await api.POST('/api/v1/support/tickets', { body: req });
  if (error) throw toApiError(error);
  return data;
}

export async function addReplyMutationFn({ ticketId, body }: AddReplyVars) {
  const { error } = await api.POST('/api/v1/support/tickets/{ticket_id}/replies', {
    params: { path: { ticket_id: ticketId } },
    body,
  });
  if (error) throw toApiError(error);
}

export function useSupportTickets() {
  return useQuery({
    queryKey: supportTicketsQueryKey,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/support/tickets');
      if (error) throw toApiError(error);
      return data;
    },
  });
}

export function useSupportTicket(id: string) {
  return useQuery({
    queryKey: supportTicketKey(id),
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/support/tickets/{ticket_id}', {
        params: { path: { ticket_id: id } },
      });
      if (error) throw toApiError(error);
      return data;
    },
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [...CREATE_SUPPORT_TICKET_KEY],
    mutationFn: createTicketMutationFn,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: supportTicketsQueryKey });
    },
  });
}

export function useAddReply(ticketId: string) {
  const queryClient = useQueryClient();
  // ticketId travels inside the mutation variables (AddReplyVars) rather than a
  // closure so it survives dehydrate/hydrate: when a paused offline reply is
  // replayed from the mutation defaults after an app restart, the defaults'
  // mutationFn reads ticketId from the persisted variables.
  return useMutation({
    mutationKey: [...ADD_SUPPORT_REPLY_KEY],
    mutationFn: addReplyMutationFn,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: supportTicketKey(ticketId) });
      void queryClient.invalidateQueries({ queryKey: supportTicketsQueryKey });
    },
  });
}
