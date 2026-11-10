import { Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { MemoryRouter, Route } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { server } from '@/app/mocks/server';
import { env } from '@/shared/config/env';
import { ExerciseDetailPage } from './ExerciseDetailPage';
const ownExercise = {
    id: 'ex-1',
    name: 'Мой присед',
    ownership: 'own',
    category_id: '11111111-1111-4111-8111-111111111111',
    difficulty: 'medium',
    description: 'desc',
    steps: [],
    media: [],
    image_url: null,
    alt_names: [],
    contraindications: null,
    is_favorite: false,
};
function renderPage() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/app/programs/exercises/ex-1']}>
        <Routes><Route path="/app/programs/exercises/:id" element={<ExerciseDetailPage />}/></Routes>
      </MemoryRouter>
    </QueryClientProvider>);
}
describe('ExerciseDetailPage delete confirmation', () => {
    it('confirms before deleting an own exercise', async () => {
        const onDelete = vi.fn();
        server.use(http.get(`${env.apiUrl}/api/v1/exercises/:id`, () => HttpResponse.json(ownExercise)), http.delete(`${env.apiUrl}/api/v1/exercises/:id`, () => {
            onDelete();
            return new HttpResponse(null, { status: 204 });
        }));
        renderPage();
        const trigger = await screen.findByRole('button', { name: 'Удалить' });
        // Clicking the row action opens the confirm dialog; it does NOT delete yet.
        await userEvent.click(trigger);
        expect(onDelete).not.toHaveBeenCalled();
        expect(await screen.findByText('Удалить упражнение?')).toBeInTheDocument();
        // Confirming actually deletes. Two "Удалить" buttons now: the row action and
        // the dialog's confirm — the confirm is the last one rendered.
        const deleteButtons = screen.getAllByRole('button', { name: 'Удалить' });
        await userEvent.click(deleteButtons[deleteButtons.length - 1]);
        await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    });
});
