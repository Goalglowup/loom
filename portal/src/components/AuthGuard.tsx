import { Navigate } from 'react-router-dom';
import { getToken } from '../lib/auth';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  return getToken() ? <>{children}</> : <Navigate to="/login" replace />;
}
