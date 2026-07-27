import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@librechat/client';
import { usePendingCourse } from '~/components/CourseWing/utils';
import { useCanvasConnectionQuery } from '~/data-provider/CourseWing';
import { useLocalize, useAuthContext } from '~/hooks';
import { hasOnboarded, hasToured, markToured } from './state';

type TourStop = {
  anchor: string;
  titleKey: 'com_ui_tour_courses_title' | 'com_ui_tour_review_title' | 'com_ui_tour_persona_title';
  descKey: 'com_ui_tour_courses_desc' | 'com_ui_tour_review_desc' | 'com_ui_tour_persona_desc';
  /** The stop advances by the student doing the action, not by clicking Next. */
  interactive?: boolean;
};

const STOPS: TourStop[] = [
  {
    anchor: 'courses',
    titleKey: 'com_ui_tour_courses_title',
    descKey: 'com_ui_tour_courses_desc',
    interactive: true,
  },
  { anchor: 'review', titleKey: 'com_ui_tour_review_title', descKey: 'com_ui_tour_review_desc' },
  { anchor: 'persona', titleKey: 'com_ui_tour_persona_title', descKey: 'com_ui_tour_persona_desc' },
];

const TOOLTIP_WIDTH = 300;
const SPOTLIGHT_PADDING = 6;

function anchorRect(anchor: string): DOMRect | null {
  const element = document.querySelector(`[data-tour="${anchor}"]`);
  if (element == null) {
    return null;
  }
  const rect = element.getBoundingClientRect();
  const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
  return visible ? rect : null;
}

/**
 * Two-stop spotlight tour shown once after onboarding: the course sidebar and
 * the persona (help level) control. Stops whose anchor is not on screen
 * (e.g. a collapsed mobile sidebar) are skipped.
 */
export default function Tour() {
  const localize = useLocalize();
  const { user, isAuthenticated, isGuest } = useAuthContext();
  const connection = useCanvasConnectionQuery({ enabled: isAuthenticated && !isGuest });

  const [stopIndex, setStopIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const location = useLocation();
  const pendingCourse = usePendingCourse();
  const initialPendingCourse = useRef(pendingCourse);
  const missCountRef = useRef(0);

  const userId = user?.id;

  /** Stop 1 is completed by actually opening a class (its course page, or a course chat). */
  const openedCourse =
    location.pathname.includes('/courses/') ||
    (pendingCourse != null && pendingCourse !== initialPendingCourse.current);
  useEffect(() => {
    if (stopIndex === 0 && !dismissed && openedCourse) {
      setRect(null);
      missCountRef.current = 0;
      setStopIndex(1);
    }
  }, [openedCourse, stopIndex, dismissed]);
  const active =
    !dismissed &&
    isAuthenticated &&
    !isGuest &&
    userId != null &&
    connection.data?.enabled !== false &&
    connection.data?.connected === true &&
    hasOnboarded(userId) &&
    !hasToured(userId);

  useEffect(() => {
    if (!active) {
      return;
    }
    let index = stopIndex;
    const measure = () => {
      const next = anchorRect(STOPS[index].anchor);
      if (next != null) {
        missCountRef.current = 0;
        setRect((prev) =>
          prev != null &&
          Math.abs(prev.top - next.top) < 1 &&
          Math.abs(prev.left - next.left) < 1 &&
          Math.abs(prev.width - next.width) < 1
            ? prev
            : next,
        );
        if (index !== stopIndex) {
          setStopIndex(index);
        }
        return;
      }
      // Hide the spotlight as soon as its anchor is gone; a stale highlight over
      // fresh content looks broken. Skipping ahead still waits a few misses since
      // anchors can mount a beat after a navigation.
      setRect(null);
      missCountRef.current += 1;
      if (missCountRef.current < 4) {
        return;
      }
      missCountRef.current = 0;
      if (index + 1 < STOPS.length) {
        index += 1;
        setRect(null);
        setStopIndex(index);
        return;
      }
      setDismissed(true);
      markToured(userId);
    };
    const timer = setTimeout(measure, 600);
    const interval = setInterval(measure, 1500);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener('resize', measure);
    };
  }, [active, stopIndex, userId]);

  /** Clicking the highlighted element itself completes the stop immediately. */
  useEffect(() => {
    if (!active || rect == null) {
      return;
    }
    const element = document.querySelector(`[data-tour="${STOPS[stopIndex].anchor}"]`);
    if (element == null) {
      return;
    }
    const onAnchorClick = () => {
      missCountRef.current = 0;
      setRect(null);
      if (stopIndex + 1 < STOPS.length) {
        setStopIndex(stopIndex + 1);
      } else {
        markToured(userId);
        setDismissed(true);
      }
    };
    element.addEventListener('click', onAnchorClick, true);
    return () => element.removeEventListener('click', onAnchorClick, true);
  }, [active, rect, stopIndex, userId]);

  if (!active || rect == null) {
    return null;
  }

  const stop = STOPS[stopIndex];
  const isLast = stopIndex === STOPS.length - 1;

  const finish = () => {
    markToured(userId);
    setDismissed(true);
  };

  const advance = () => {
    if (isLast) {
      finish();
      return;
    }
    setRect(null);
    setStopIndex(stopIndex + 1);
  };

  const top = rect.top - SPOTLIGHT_PADDING;
  const left = rect.left - SPOTLIGHT_PADDING;
  const width = rect.width + SPOTLIGHT_PADDING * 2;
  const height = rect.height + SPOTLIGHT_PADDING * 2;
  const tooltipBelow = rect.bottom + 180 < innerHeight;
  const tooltipLeft = Math.max(12, Math.min(rect.left, innerWidth - TOOLTIP_WIDTH - 12));

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[1000]"
      role="dialog"
      aria-label={localize(stop.titleKey)}
    >
      <div
        className="absolute rounded-xl transition-all duration-300"
        style={{ top, left, width, height, boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)' }}
      />
      <div
        className="pointer-events-auto absolute flex flex-col gap-2 rounded-xl border border-border-light bg-surface-primary p-4 shadow-lg"
        style={{
          width: TOOLTIP_WIDTH,
          left: tooltipLeft,
          ...(tooltipBelow ? { top: top + height + 12 } : { bottom: innerHeight - top + 12 }),
        }}
      >
        <span className="text-sm font-semibold text-text-primary">{localize(stop.titleKey)}</span>
        <span className="text-sm text-text-secondary">{localize(stop.descKey)}</span>
        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={finish}
            className="text-xs text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
          >
            {localize('com_ui_tour_skip')}
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-tertiary">
              {stopIndex + 1}/{STOPS.length}
            </span>
            {!stop.interactive && (
              <Button size="sm" onClick={advance}>
                {isLast ? localize('com_ui_tour_done') : localize('com_ui_tour_next')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
