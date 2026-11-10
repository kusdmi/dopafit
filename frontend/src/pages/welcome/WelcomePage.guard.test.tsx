import { useLocation } from 'react-router-dom';
function LocationProbe() { const location = useLocation(); return <span>at {location.pathname}</span>; }
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, act } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSessionStore } from '@/entities/session/model/store';
import { paths } from '@/shared/config/paths';
import { LoginPage } from '../login/LoginPage';
import { WelcomePage } from './WelcomePage';
function withQuery(children: ReactNode): ReactNode {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
/**
 * B003 regression: a guest screen that stays mounted
 * (welcome / login) can sit hidden in the router outlet while the user is on
 * /register. When setSession flips isAuthenticated during the register wizard,
 * a hidden guest screen must NOT fire its <Navigate replace to=home>, or it would
 * navigate away and unmount the onboarding flow. The redirect is now gated on
 * the screen being the ACTIVE path (useLocation().pathname).
 */
describe('guest screen auth-redirect gate (B003)', () => {
    beforeEach(async () => {
        await useSessionStore.getState().clearSession();
    });
    afterEach(async () => {
        await useSessionStore.getState().clearSession();
    });
    function renderMountedButInactive(Page: () => ReactElement) {
        // Mount the guest page directly (as if it stayed mounted) while the router
        // location is /register — i.e. the guest page is NOT the active route.
        return render(withQuery(<MemoryRouter initialEntries={[paths.register]}>
          <Page />
          <LocationProbe />
        </MemoryRouter>));
    }
    it('welcome does not redirect while it is a hidden (inactive) view', async () => {
        renderMountedButInactive(WelcomePage);
        // Simulate register-wizard setSession while welcome sits hidden in the stack.
        await act(async () => {
            await useSessionStore.getState().setSession({
                tokens: { access_token: 'a', refresh_token: 'r' },
                user: {
                    id: 'u1',
                    email: 'x@example.com',
                    role: 'client',
                    email_verified: true,
                },
            } as never);
        });
        // Still on /register — no redirect to /app/home fired.
        expect(screen.getByText(`at ${paths.register}`)).toBeInTheDocument();
    });
    it('login does not redirect while it is a hidden (inactive) view', async () => {
        renderMountedButInactive(LoginPage);
        await act(async () => {
            await useSessionStore.getState().setSession({
                tokens: { access_token: 'a', refresh_token: 'r' },
                user: {
                    id: 'u1',
                    email: 'x@example.com',
                    role: 'client',
                    email_verified: true,
                },
            } as never);
        });
        expect(screen.getByText(`at ${paths.register}`)).toBeInTheDocument();
    });
    it('welcome still redirects when it IS the active route', async () => {
        render(<MemoryRouter initialEntries={[paths.welcome]}>
        <WelcomePage />
        <LocationProbe />
      </MemoryRouter>);
        await act(async () => {
            await useSessionStore.getState().setSession({
                tokens: { access_token: 'a', refresh_token: 'r' },
                user: {
                    id: 'u1',
                    email: 'x@example.com',
                    role: 'client',
                    email_verified: true,
                },
            } as never);
        });
        expect(screen.getByText(`at ${paths.home}`)).toBeInTheDocument();
    });
});
