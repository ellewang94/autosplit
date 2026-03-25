import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import GroupsPage from './pages/GroupsPage'
import TripOverviewPage from './pages/TripOverviewPage'
import UploadPage from './pages/UploadPage'
import TransactionsPage from './pages/TransactionsPage'
import SettlementPage from './pages/SettlementPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          {/* Default: redirect to groups */}
          <Route path="/" element={<Navigate to="/groups" replace />} />
          <Route path="/groups" element={<GroupsPage />} />
          {/* Trip overview — the landing page when you open a trip */}
          <Route path="/groups/:groupId" element={<TripOverviewPage />} />
          <Route path="/groups/:groupId/upload" element={<UploadPage />} />
          <Route path="/groups/:groupId/transactions" element={<TransactionsPage />} />
          <Route path="/groups/:groupId/settlement" element={<SettlementPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
