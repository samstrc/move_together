// Planned work is tracked in GitHub Issues:
// https://github.com/samstrc/move_together/issues

import { Route, Routes } from 'react-router-dom'
import PublicLayout from './layouts/PublicLayout.jsx'
import AppLayout from './layouts/AppLayout.jsx'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Items from './pages/Items.jsx'
import Budget from './pages/Budget.jsx'
import Assistant from './pages/Assistant.jsx'
import Group from './pages/Group.jsx'
import Profile from './pages/Profile.jsx'
import NotFound from './pages/NotFound.jsx'
import './App.css'

// Maps each URL to a page. Pages nested inside a layout route are drawn
// inside that layout's <Outlet />.
function App() {
  return (
    <Routes>
      {/* Public pages: top navbar + footer */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
      </Route>

      {/* Logged-in pages: sidebar on the left */}
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/items" element={<Items />} />
        <Route path="/budget" element={<Budget />} />
        <Route path="/assistant" element={<Assistant />} />
        <Route path="/group" element={<Group />} />
        <Route path="/profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
