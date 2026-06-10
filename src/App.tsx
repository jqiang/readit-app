import { HashRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import ReadingPractice from './pages/ReadingPractice'
import CharacterLibrary from './pages/CharacterLibrary'
import ReviewMode from './pages/ReviewMode'
import Settings from './pages/Settings'
import ImportPassage from './pages/ImportPassage'
import { useLibraryBackup } from './hooks/useLibraryBackup'

// One-time cleanup: locally-stored imported passages were replaced by the
// Drive-backed "ReadIt 课文" folder.
localStorage.removeItem('readit-passages')

export default function App() {
  useLibraryBackup()

  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/read" element={<ReadingPractice />} />
          <Route path="/library" element={<CharacterLibrary />} />
          <Route path="/review" element={<ReviewMode />} />
          <Route path="/import" element={<ImportPassage />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </HashRouter>
  )
}
