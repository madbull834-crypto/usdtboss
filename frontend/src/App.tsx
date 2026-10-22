import { BrowserRouter as Router, Routes, Route } from "react-router";
import NotFound from "./pages/OtherPage/NotFound";
import LineChart from "./pages/Charts/LineChart";
import BasicTables from "./pages/Tables/BasicTables";
import BasicTabless from "./pages/Tables/directeam";
import BasicDirectInc from "./pages/Tables/directincome";
import BasicLevel from "./pages/Tables/levelteam";
import SlotIncome from "./pages/Tables/slotincome";
import AppLayout from "./layout/AppLayout";
import { ScrollToTop } from "./components/common/ScrollToTop";
import Home from "./pages/Dashboard/Home";
import MyTeam from "./pages/Network/MyTeam";
import GlobalData from "./pages/Network/GlobalData";
import LandingPage from "./pages/Landing/LandingPage";

import SignIn from "./pages/AuthPages/SignIn";
import SignUp from "./pages/AuthPages/SignUp";

export default function App() {
  return (
    <Router>
      <ScrollToTop />

      <Routes>
        {/* Public Website */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<SignIn />} />
        <Route path="/register" element={<SignUp />} />

        {/* Dashboard */}
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Home />} />
          <Route path="/level-income" element={<BasicTables />} />
          <Route path="/basic-tabless" element={<BasicTabless />} />
          <Route path="/basic-level" element={<BasicLevel />} />
          <Route path="/my-team" element={<MyTeam />} />
          <Route path="/global-data" element={<GlobalData />} />
          <Route path="/direct-income" element={<BasicDirectInc />} />
          <Route path="/slot-income/:slotNumber" element={<SlotIncome />} />
          <Route path="/matrix-team" element={<LineChart />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}
