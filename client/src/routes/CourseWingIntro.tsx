/* eslint-disable i18next/no-literal-string -- Static product marketing copy is intentionally authored here. */
import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiBaseUrl } from 'librechat-data-provider';
import './CourseWingIntro.css';

type Screen = {
  src: string;
  alt: string;
  caption: string;
};

const screens: Record<string, Screen> = {
  course: {
    src: `${apiBaseUrl()}/assets/coursewing/course-home.png`,
    alt: 'CourseWing AP Calculus course hub with an upcoming exam, personalized review, and course-aware study actions',
    caption:
      'The real CourseWing course hub — upcoming work, course chats, and review in one place.',
  },
  plan: {
    src: `${apiBaseUrl()}/assets/coursewing/finals-plan.png`,
    alt: 'A concrete finals plan with prioritized assignments and time boxes',
    caption: 'A real cross-course finals plan, broken into work a student can start tonight.',
  },
  review: {
    src: `${apiBaseUrl()}/assets/coursewing/review-session.png`,
    alt: 'A personalized calculus review generated from assignments, mastery data, and class materials',
    caption: 'A real review session built from the student’s class history and materials.',
  },
  sources: {
    src: `${apiBaseUrl()}/assets/coursewing/source-backed.png`,
    alt: 'A calculus practice question with linked Canvas sources shown below the answer',
    caption: 'A real answer with the exact Canvas materials used shown underneath.',
  },
  memory: {
    src: `${apiBaseUrl()}/assets/coursewing/learning-memory.png`,
    alt: 'CourseWing memory controls showing student goals and struggle areas',
    caption: 'Students can see, edit, disable, or delete what the tutor remembers.',
  },
  persona: {
    src: `${apiBaseUrl()}/assets/coursewing/persona.png`,
    alt: 'CourseWing tutor persona menu with classic, Socratic, direct, storyteller, and encouraging teaching styles',
    caption: 'The same coursework, explained in a teaching style that fits the learner.',
  },
};

const proofPoints = [
  {
    title: 'Knows the course',
    detail: 'Assignments, files, rubrics, and feedback',
  },
  {
    title: 'Finds the next move',
    detail: 'Deadlines, grades, and mastery signals',
  },
  {
    title: 'Learns the learner',
    detail: 'Pacing, preferences, and recurring gaps',
  },
];

export default function CourseWingIntro() {
  const [activeScreen, setActiveScreen] = useState<Screen | null>(null);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'CourseWing — A tutor with your syllabus open';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    if (!activeScreen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveScreen(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeScreen]);

  const openScreen = (key: string) => setActiveScreen(screens[key]);

  return (
    <main className="ll-page">
      <header className="ll-nav-shell">
        <a className="ll-wordmark" href="#top" aria-label="CourseWing home">
          <span className="ll-wordmark-mark" aria-hidden="true">
            L
          </span>
          <span>CourseWing</span>
        </a>
        <nav className="ll-nav-links" aria-label="Main navigation">
          <a href="#why">Why it works</a>
          <a href="#stories">Real use cases</a>
          <a href="#adapts">Personalization</a>
        </nav>
        <Link className="ll-nav-cta" to="/login">
          Enter CourseWing <ArrowUpRight aria-hidden="true" />
        </Link>
      </header>

      <section className="ll-hero" id="top">
        <div className="ll-hero-copy">
          <p className="ll-kicker">The course-aware AI tutor</p>
          <h1>
            A tutor with your <em>syllabus open.</em>
          </h1>
          <p className="ll-hero-deck">
            CourseWing connects Canvas courses, deadlines, grades, feedback, and files to a tutor
            that already knows what matters next.
          </p>
          <div className="ll-hero-actions">
            <a className="ll-button ll-button-primary" href="#stories">
              See it in action <ArrowRight aria-hidden="true" />
            </a>
            <Link className="ll-button ll-button-secondary" to="/login">
              Open CourseWing
            </Link>
          </div>
        </div>

        <div className="ll-hero-visual">
          <button
            className="ll-screen-button ll-hero-screen"
            type="button"
            onClick={() => openScreen('course')}
            aria-label="Open the course hub screenshot"
          >
            <span className="ll-screen-bar" aria-hidden="true">
              <i />
              <i />
              <i />
              <small>coursewing / courses / ap-calculus</small>
            </span>
            <img src={screens.course.src} alt={screens.course.alt} />
          </button>
          <p className="ll-screen-caption">AP Calculus · Real product screen</p>
        </div>
      </section>

      <section className="ll-proof" id="why" aria-label="Why CourseWing works">
        {proofPoints.map(({ title, detail }) => (
          <article key={title}>
            <div>
              <h2>{title}</h2>
              <p>{detail}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="ll-stories" id="stories">
        <div className="ll-section-heading">
          <p className="ll-eyebrow">REAL USE CASES · REAL SCREENS</p>
          <h2>What students actually ask.</h2>
          <p>
            Three everyday moments where course context changes the answer — and makes the help more
            useful.
          </p>
        </div>

        <article className="ll-featured-story">
          <div className="ll-featured-copy">
            <p className="ll-story-label">Deadline triage</p>
            <h3>“What do I actually need to do tonight?”</h3>
            <p>
              CourseWing sees what is due across courses, what carries weight, and what can wait —
              then turns the pile into a plan a student can start.
            </p>
            <p className="ll-story-detail">Assignments → priorities → time boxes</p>
          </div>
          <button
            className="ll-screen-button ll-featured-screen"
            type="button"
            onClick={() => openScreen('plan')}
            aria-label="Open the finals plan screenshot"
          >
            <img src={screens.plan.src} alt={screens.plan.alt} />
          </button>
        </article>

        <div className="ll-story-pair">
          <article className="ll-story-card">
            <button
              className="ll-screen-button ll-card-screen ll-review-screen"
              type="button"
              onClick={() => openScreen('review')}
              aria-label="Open the personalized review screenshot"
            >
              <img src={screens.review.src} alt={screens.review.alt} />
            </button>
            <div className="ll-card-copy">
              <p className="ll-story-label">Personalized review</p>
              <h3>“Quiz me on what matters for the final.”</h3>
              <p>Practice starts with the next assessment and adapts one question at a time.</p>
            </div>
          </article>

          <article className="ll-story-card">
            <button
              className="ll-screen-button ll-card-screen ll-source-screen"
              type="button"
              onClick={() => openScreen('sources')}
              aria-label="Open the source-backed answer screenshot"
            >
              <img src={screens.sources.src} alt={screens.sources.alt} />
            </button>
            <div className="ll-card-copy">
              <p className="ll-story-label">Grounded help</p>
              <h3>“What did our class say about this?”</h3>
              <p>Answers show the actual Canvas materials used, right below the response.</p>
            </div>
          </article>
        </div>
      </section>

      <section className="ll-adapts" id="adapts">
        <div className="ll-adapts-copy">
          <p className="ll-eyebrow">PERSONAL, NOT OPAQUE</p>
          <h2>It remembers what helps. You stay in control.</h2>
          <p>
            CourseWing can carry forward goals, pacing, and recurring struggle points. Students can
            inspect, edit, disable, or delete every saved memory.
          </p>
          <ul>
            <li>
              <Check aria-hidden="true" /> Choose a Socratic, direct, or encouraging tutor.
            </li>
            <li>
              <Check aria-hidden="true" /> Keep useful learning patterns between sessions.
            </li>
            <li>
              <Check aria-hidden="true" /> Turn memory off whenever you want.
            </li>
          </ul>
        </div>
        <div className="ll-adapts-visual">
          <button
            className="ll-screen-button ll-memory-screen"
            type="button"
            onClick={() => openScreen('memory')}
            aria-label="Open the learning memory screenshot"
          >
            <img src={screens.memory.src} alt={screens.memory.alt} />
          </button>
          <button
            className="ll-screen-button ll-persona-screen"
            type="button"
            onClick={() => openScreen('persona')}
            aria-label="Open the tutor persona screenshot"
          >
            <img src={screens.persona.src} alt={screens.persona.alt} />
          </button>
        </div>
      </section>

      <section className="ll-final-cta">
        <div>
          <p className="ll-eyebrow">COURSEWING</p>
          <h2>Your coursework, in conversation.</h2>
        </div>
        <div>
          <p>A tutor that starts with the class, not a blank box.</p>
          <Link className="ll-button ll-button-light" to="/login">
            Enter CourseWing <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
      </section>

      <footer className="ll-footer">
        <a className="ll-wordmark" href="#top" aria-label="Back to top">
          <span className="ll-wordmark-mark" aria-hidden="true">
            L
          </span>
          <span>CourseWing</span>
        </a>
        <p>The course-aware AI tutor.</p>
        <div>
          <a href="#stories">Use cases</a>
          <Link to="/login">Sign in</Link>
        </div>
      </footer>

      {activeScreen && (
        <div
          className="ll-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Product screenshot"
        >
          <button
            className="ll-lightbox-backdrop"
            type="button"
            onClick={() => setActiveScreen(null)}
            aria-label="Close screenshot"
          />
          <div className="ll-lightbox-panel">
            <button
              className="ll-lightbox-close"
              type="button"
              onClick={() => setActiveScreen(null)}
              aria-label="Close screenshot"
            >
              <X aria-hidden="true" />
            </button>
            <img src={activeScreen.src} alt={activeScreen.alt} />
            <p>{activeScreen.caption}</p>
          </div>
        </div>
      )}
    </main>
  );
}
