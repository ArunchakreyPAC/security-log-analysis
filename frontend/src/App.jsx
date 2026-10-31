import { useEffect, useState } from 'react'
import IpView from './components/IpView.jsx'
import Overview from './components/Overview.jsx'

// Two views, chosen by the URL hash so the browser's back button works: "#/" and "#/ip/<address>".
function readRoute() {
  const match = window.location.hash.match(/^#\/ip\/(.+)$/)
  if (!match) return { view: 'overview' }
  try {
    return { view: 'ip', ip: decodeURIComponent(match[1]) }
  } catch {
    return { view: 'overview' }
  }
}

export default function App() {
  const [route, setRoute] = useState(readRoute)

  useEffect(() => {
    const onChange = () => {
      setRoute(readRoute())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return (
    <div className="page">
      <header className="masthead">
        <a className="wordmark" href="#/">AuthLens</a>
        <p>SSH login activity, from raw log lines to something you can investigate.</p>
      </header>
      <main>{route.view === 'ip' ? <IpView key={route.ip} ip={route.ip} /> : <Overview />}</main>
      <footer className="footer">
        <p>
          Data: Loghub OpenSSH sample (Zhu, He, He, Liu and Lyu, “Loghub: A Large Collection of System Log
          Datasets for AI-driven Log Analytics”, ISSRE 2023). Failed attempts count sshd “Failed …” lines;
          PAM lines are left out to avoid counting one attempt twice.
        </p>
      </footer>
    </div>
  )
}
