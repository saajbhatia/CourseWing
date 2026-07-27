import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCanvasConnectionQuery } from '~/data-provider/CourseWing';
import { hasOnboarded, markOnboarded } from './state';
import { useAuthContext } from '~/hooks';

/**
 * Sends first-run students into /onboarding: new users who have never connected an
 * LMS see the wizard, and OAuth callback outcomes (?classroom=...) land in the wizard's
 * sync step instead of a bare chat. Users who are already connected are marked as
 * onboarded so a later disconnect never traps them back in the wizard.
 */
export default function useOnboardingGate(): void {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isGuest } = useAuthContext();
  const eligible = isAuthenticated && !isGuest;
  const connection = useCanvasConnectionQuery({ enabled: eligible });

  const data = connection.data;
  useEffect(() => {
    if (!eligible) {
      return;
    }
    const classroom = new URLSearchParams(location.search).get('classroom');
    if (classroom != null && !hasOnboarded()) {
      navigate(`/onboarding?classroom=${encodeURIComponent(classroom)}`, { replace: true });
      return;
    }
    if (data == null || data.enabled === false) {
      return;
    }
    if (data.connected === true) {
      markOnboarded();
      return;
    }
    if (!hasOnboarded()) {
      navigate('/onboarding', { replace: true });
    }
  }, [eligible, data, location.search, navigate]);
}
