import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCanvasConnectionQuery } from '~/data-provider/CourseWing';
import { hasOnboarded } from './state';
import { useAuthContext } from '~/hooks';

/**
 * Sends students into /onboarding until they have completed it once (per user, per
 * browser): connected users breeze through welcome → "you're all set", everyone else
 * lands on the connect step. OAuth callback outcomes (?classroom=...) land in the
 * wizard's sync step instead of a bare chat.
 */
export default function useOnboardingGate(): void {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, isGuest } = useAuthContext();
  const eligible = isAuthenticated && !isGuest;
  const connection = useCanvasConnectionQuery({ enabled: eligible });

  const data = connection.data;
  const userId = user?.id;
  useEffect(() => {
    if (!eligible || userId == null) {
      return;
    }
    const classroom = new URLSearchParams(location.search).get('classroom');
    if (classroom != null && !hasOnboarded(userId)) {
      navigate(`/onboarding?classroom=${encodeURIComponent(classroom)}`, { replace: true });
      return;
    }
    if (data == null || data.enabled === false) {
      return;
    }
    if (!hasOnboarded(userId)) {
      navigate('/onboarding', { replace: true });
    }
  }, [eligible, userId, data, location.search, navigate]);
}
