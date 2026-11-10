import { Navigate } from 'react-router-dom';
import { paths } from '@/shared/config/paths';

export function SubscriptionCheckoutPage() {
  return <Navigate to={paths.settingsSubscription} replace />;
}
