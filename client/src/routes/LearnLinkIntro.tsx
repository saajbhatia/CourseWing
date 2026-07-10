import { useEffect, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Brain,
  Check,
  FileSearch,
  Link2,
  Sparkles,
  X,
} from 'lucide-react';
import './LearnLinkIntro.css';

type Screen = {
  src: string;
  alt: string;
  caption: string;
};

const screens: Record<string, Screen> = {
  course: {
    src: '/assets/learnlink/course-home.png',
    alt: 'LearnLink AP Calculus course hub with an upcoming exam, personalized review, and course-aware study actions',
    caption: 'A real LearnLink course hub — upcoming work, course chats, and review in one place.',
  },
  review: {
    src: '/assets/learnlink/review-session.png',
    alt: 'A personalized calculus review generated from assignments, mastery data, and class materials',
    caption: 'A real review session built from the student’s own class history and materials.',
  },
  plan: {
    src: '/assets/learnlink/finals-plan.png',
    alt: 'A concrete finals plan with prioritized assignments and time boxes',
    caption: 'A real cross-course finals plan, broken into work a student can start tonight.',
  },
  sources: {
    src: '/assets/learnlink/source-backed.png',
    alt: 'A calculus practice question with linked Canvas sources shown below the answer',
    caption: 'A real answer with the exact Canvas materials used shown underneath.',
  },
  memory: {
    src: '/assets/learnlink/learning-memory.png',
    alt: 'LearnLink memory controls showing student goals and struggle areas',
    caption: 'Students can see, edit, disable, or delete what the tutor remembers.',
  },
  persona: {
    src: '/assets/learnlink/persona.png',
    alt: 'LearnLink tutor persona menu with classic, Socratic, direct, storyteller, and encouraging teaching styles',
    caption: 'The same coursework, explained in a teaching style that fits the learner.',
  },
};

const useCases = [
  {
    number: '01',
    time: 'WED · 7:43 PM',
    label: 'Deadline triage',
    prompt: '“What do I actually need to do tonight?”',
    body: 'LearnLink sees what is due across courses, what carries the most weight, and where a student is getting stuck — then turns the pile into a plan they can actually start.',
    screen: 'plan',
    note: 'Assignments → priorities → time boxes',
  },
  {
    number: '02',
    time: 'FRI · QUIZ NEXT',
    label: 'Personalized review',
    prompt: '“Quiz me on what matters for the final.”',
    body: 'Practice starts with the next assessment, revisits the skills where recent scores dipped, and asks one question at a time so the student still does the thinking.',
    screen: 'review',
    note: 'Grades + mastery + course files',
  },
  {
    number: '03',
    time: 'IN THE MOMENT',
    label: 'Grounded help',
    prompt: '“What did our class say about this?”',
    body: 'LearnLink searches the actual course files and shows the source it used. When an answer comes from general knowledge, it says that clearly instead of inventing a citation.',
    screen: 'sources',
    note: 'Real links, visible context',
  },
];

export default function LearnLinkIntro() {
  const [activeScreen, setActiveScreen] = useState<Screen | null>(null);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'LearnLink — A tutor with your syllabus open';
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
        <a className="ll-wordmark" href="#top" aria-label="LearnLink home">
          <span className="ll-wordmark-mark" aria-hidden="true">
            <span />
            <span />
          </span>
          <span>LearnLink</span>
        </a>
        <nav className="ll-nav-links" aria-label="Main navigation">
          <a href="#why">Why LearnLink</a>
          <a href="#stories">Real use cases</a>
          <a href="#how">How it works</a>
        </nav>
        <a className="ll-nav-cta" href="/login">
          Enter LearnLink <ArrowUpRight aria-hidden="true" />
        </a>
      </header>

      <section className="ll-hero" id="top">
        <div className="ll-hero-rule" aria-hidden="true">
          <span>01</span>
          <span>THE COURSE-AWARE AI TUTOR</span>
          <span>EST. IN THE CLASSROOM</span>
        </div>

        <div className="ll-hero-copy">
          <p className="ll-kicker">
            <Sparkles aria-hidden="true" /> Built for the class you are actually taking
          </p>
          <h1>
            A tutor with your <em>syllabus open.</em>
          </h1>
          <p className="ll-hero-deck">
            LearnLink turns Canvas courses, deadlines, rubrics, feedback, and files into personal
            explanations, review sessions, and study plans that know what matters next.
          </p>
          <div className="ll-hero-actions">
            <a className="ll-button ll-button-primary" href="#stories">
              See a real session <ArrowRight aria-hidden="true" />
            </a>
            <a className="ll-button ll-button-text" href="/login">
              Open the tutor <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
          <p className="ll-real-note">
            <span aria-hidden="true" /> Every product image on this page is a real working screen.
          </p>
        </div>

        <div className="ll-hero-visual">
          <div className="ll-visual-index" aria-hidden="true">
            <span>STUDENT VIEW</span>
            <strong>AP CALCULUS AB</strong>
          </div>
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
              <small>learnlink / courses / ap-calculus</small>
            </span>
            <img src={screens.course.src} alt={screens.course.alt} />
          </button>
          <div className="ll-hero-ticket" aria-hidden="true">
            <span>UP NEXT</span>
            <strong>Semester exam</strong>
            <small>Review built from your real class</small>
          </div>
          <div className="ll-hero-stamp" aria-hidden="true">
            LIVE
            <br />
            PRODUCT
          </div>
        </div>
      </section>

      <section className="ll-proof-strip" aria-label="Product capabilities">
        <div>
          <span>01</span>
          <strong>Knows the course</strong>
          <small>Files, assignments, rubrics</small>
        </div>
        <div>
          <span>02</span>
          <strong>Plans the next move</strong>
          <small>Deadlines, grades, mastery</small>
        </div>
        <div>
          <span>03</span>
          <strong>Learns the learner</strong>
          <small>Pacing, preferences, weak spots</small>
        </div>
        <div className="ll-proof-caption">
          <small>NOT A BLANK CHATBOX</small>
          <ArrowRight aria-hidden="true" />
        </div>
      </section>

      <section className="ll-thesis" id="why">
        <div className="ll-section-label">
          <span>THE DIFFERENCE</span>
          <span>02 / 05</span>
        </div>
        <div className="ll-thesis-grid">
          <h2>
            Generic AI starts at zero.
            <br />
            <em>LearnLink starts with the class.</em>
          </h2>
          <div className="ll-thesis-copy">
            <p>
              Students should not have to copy a rubric into a chatbot, explain what is due, or
              remind it where they struggled last time.
            </p>
            <p>
              LearnLink brings the school day into the conversation — then gives useful help without
              turning assigned work into an answer key.
            </p>
          </div>
        </div>
        <div className="ll-ledger" id="how">
          <article>
            <BookOpen aria-hidden="true" />
            <span className="ll-ledger-number">A / CONTEXT</span>
            <h3>Your actual course</h3>
            <p>Assignments, syllabi, files, pages, rubrics, teacher feedback, and upcoming work.</p>
          </article>
          <article>
            <FileSearch aria-hidden="true" />
            <span className="ll-ledger-number">B / JUDGMENT</span>
            <h3>The right next step</h3>
            <p>Priorities from real grades and mastery — not a generic “study harder” checklist.</p>
          </article>
          <article>
            <Brain aria-hidden="true" />
            <span className="ll-ledger-number">C / MEMORY</span>
            <h3>What works for you</h3>
            <p>
              A student-controlled learning profile carries useful patterns into the next session.
            </p>
          </article>
        </div>
      </section>

      <section className="ll-stories" id="stories">
        <div className="ll-section-label ll-section-label-light">
          <span>REAL USE CASES · REAL PRODUCT SCREENS</span>
          <span>03 / 05</span>
        </div>
        <div className="ll-stories-heading">
          <h2>Three school nights that actually happen.</h2>
          <p>
            No imagined dashboards. No stock-photo students. These are working LearnLink sessions
            using real course context.
          </p>
        </div>

        <div className="ll-story-list">
          {useCases.map((story, index) => {
            const screen = screens[story.screen];
            return (
              <article className="ll-story" key={story.number}>
                <div className="ll-story-copy">
                  <div className="ll-story-meta">
                    <span>{story.number}</span>
                    <span>{story.time}</span>
                  </div>
                  <p className="ll-story-label">{story.label}</p>
                  <h3>{story.prompt}</h3>
                  <p>{story.body}</p>
                  <div className="ll-story-note">
                    <Check aria-hidden="true" /> {story.note}
                  </div>
                </div>
                <div className="ll-story-visual">
                  <span className="ll-story-tape" aria-hidden="true" />
                  <button
                    className={`ll-screen-button ll-story-screen ll-story-screen-${index + 1}`}
                    type="button"
                    onClick={() => openScreen(story.screen)}
                    aria-label={`Open screenshot: ${screen.caption}`}
                  >
                    <img src={screen.src} alt={screen.alt} />
                    <span className="ll-expand-label">
                      View full screen <ArrowUpRight aria-hidden="true" />
                    </span>
                  </button>
                  <p className="ll-screen-caption">{screen.caption}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="ll-adapts">
        <div className="ll-section-label">
          <span>THE SECOND SESSION IS BETTER THAN THE FIRST</span>
          <span>04 / 05</span>
        </div>
        <div className="ll-adapts-grid">
          <div className="ll-adapts-copy">
            <p className="ll-kicker">
              <Brain aria-hidden="true" /> A tutor that adapts without becoming a black box
            </p>
            <h2>It remembers what helps. You stay in control.</h2>
            <p>
              LearnLink can carry forward goals, pacing, strong areas, and recurring struggle
              points. Students can inspect, edit, disable, or delete every saved memory.
            </p>
            <ul>
              <li>
                <Check aria-hidden="true" /> Pick a Socratic coach, storyteller, or direct tutor.
              </li>
              <li>
                <Check aria-hidden="true" /> Keep the teaching style; keep the academic boundaries.
              </li>
              <li>
                <Check aria-hidden="true" /> Turn memory off whenever you want.
              </li>
            </ul>
          </div>
          <div className="ll-adapts-collage">
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
            <div className="ll-collage-note" aria-hidden="true">
              YOUR GOALS
              <br />
              YOUR PACE
              <br />
              YOUR CALL
            </div>
          </div>
        </div>
      </section>

      <section className="ll-connection">
        <div className="ll-connection-copy">
          <p className="ll-kicker">
            <Link2 aria-hidden="true" /> One connection, useful all day
          </p>
          <h2>Your Canvas, now conversational.</h2>
          <p>
            Courses, assignments, grades, feedback, files, and study plans — brought together in a
            tutor that understands the shape of the student’s real workload.
          </p>
        </div>
        <div className="ll-connection-list" aria-label="Canvas context included in LearnLink">
          {[
            'Course files and syllabi',
            'Assignments and due dates',
            'Rubric scores and feedback',
            'Learning mastery signals',
          ].map((item, index) => (
            <div key={item}>
              <span>0{index + 1}</span>
              <strong>{item}</strong>
              <ArrowUpRight aria-hidden="true" />
            </div>
          ))}
        </div>
      </section>

      <section className="ll-final-cta">
        <div className="ll-section-label ll-section-label-light">
          <span>READY WHEN THE STUDENT IS</span>
          <span>05 / 05</span>
        </div>
        <div className="ll-final-grid">
          <h2>
            Give students an AI that starts with the class — <em>not a blank box.</em>
          </h2>
          <div>
            <p>Real coursework in. Useful help out. The student still owns the learning.</p>
            <a className="ll-button ll-button-light" href="/login">
              Enter LearnLink <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
        </div>
        <div className="ll-final-marquee" aria-hidden="true">
          <span>COURSE-AWARE</span>
          <i />
          <span>PERSONAL</span>
          <i />
          <span>GROUNDED</span>
          <i />
          <span>BUILT TO LEARN</span>
        </div>
      </section>

      <footer className="ll-footer">
        <a className="ll-wordmark ll-wordmark-footer" href="#top" aria-label="Back to top">
          <span className="ll-wordmark-mark" aria-hidden="true">
            <span />
            <span />
          </span>
          <span>LearnLink</span>
        </a>
        <p>The course-aware AI tutor.</p>
        <div>
          <a href="#why">Why LearnLink</a>
          <a href="#stories">Use cases</a>
          <a href="/login">Sign in</a>
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
