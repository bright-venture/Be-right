import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router'
import { Loader2 } from 'lucide-react'
import Home from './pages/Home'

const Book = lazy(() => import('./pages/Book'))
const Requests = lazy(() => import('./pages/Requests'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Tech = lazy(() => import('./pages/Tech'))
const Login = lazy(() => import('./pages/Login'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Join = lazy(() => import('./pages/Join'))
const Legal = lazy(() => import('./pages/Legal'))
const Account = lazy(() => import('./pages/Account'))
const NotFound = lazy(() => import('./pages/NotFound'))

function PageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <Loader2 className="h-8 w-8 animate-spin text-navy" />
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/book" element={<Book />} />
        <Route path="/requests" element={<Requests />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/tech" element={<Tech />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Login mode="signup" />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/join" element={<Join />} />
        <Route path="/terms" element={<Legal doc="terms" />} />
        <Route path="/privacy" element={<Legal doc="privacy" />} />
        <Route path="/account" element={<Account />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}
