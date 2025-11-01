import { navigate } from '../lib/router'
import PythonImg from '../graphics/Python.png'
import CImg from '../graphics/C.png'
import CSharpImg from '../graphics/CSharp.png'
import TiltCard from '../components/TiltCard';

interface LanguageSelectionProps {
  canDoLessons: boolean;
}

export default function LanguageSelection({ canDoLessons }: LanguageSelectionProps) {
  return (
    <section className="language-menu">
      {!canDoLessons && (
        <div className="sign-in-container">
          <div className="sign-in-message">
            <p className="text-muted">Sign in to choose a language and start lessons.</p>
            <button className="btn btn-primary mt-2" onClick={() => navigate('signin' as any)}>Sign in</button>
          </div>
        </div>
      )}
      <div className="language-grid">
        <TiltCard>
            <button
            className="btn lang-card"
            onClick={() => navigate('lang/python' as any)}
            disabled={!canDoLessons}
            aria-disabled={!canDoLessons}
            title={!canDoLessons ? 'Sign in to select a language' : undefined}
          >
            <img draggable="false" src={PythonImg} alt="Python" className="lang-icon"/>
            <div className="lang-title">Python</div>
            <div className="lang-difficulty diff-baby">Little Baby</div>
            <div className="lang-subtitle">Don't even bother unless learning this is mandatory.</div>
          </button>
        </TiltCard>
        <TiltCard>
            <button
            className="btn lang-card"
            onClick={() => navigate('lang/csharp' as any)}
            disabled={!canDoLessons}
            aria-disabled={!canDoLessons}
            title={!canDoLessons ? 'Sign in to select a language' : undefined}
          >
            <img draggable="false" src={CSharpImg} alt="C#" className="lang-icon"/>
            <div className="lang-title">C#</div>
            <div className="lang-difficulty diff-easy">Easy</div>
            <div className="lang-subtitle">Learn programming for any software, like games!</div>
          </button>
        </TiltCard>
        <TiltCard>
            <button
            className="btn lang-card"
            onClick={() => navigate('lang/c' as any)}
            disabled={!canDoLessons}
            aria-disabled={!canDoLessons}
            title={!canDoLessons ? 'Sign in to select a language' : undefined}
          >
            <img draggable="false" src={CImg} alt="C" className="lang-icon"/>
            <div className="lang-title">C</div>
            <div className="lang-difficulty diff-moderate">Moderate</div>
            <div className="lang-subtitle">Designed to teach computer science and programming.</div>
          </button>
        </TiltCard>
      </div>
    </section>
  )
}