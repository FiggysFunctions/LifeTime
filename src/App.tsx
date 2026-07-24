import { useEffect } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { syncReminders } from "./reminders";
import { FocusProvider } from "./focus";
import Shell from "./components/Shell";
import Home from "./pages/Home";
import Lists from "./pages/Lists";
import ListDetail from "./pages/ListDetail";
import Tasks from "./pages/Tasks";
import Calendar from "./pages/Calendar";
import Budget from "./pages/Budget";
import Fitness from "./pages/Fitness";
import Sports from "./pages/Sports";
import Meals from "./pages/Meals";
import Notes from "./pages/Notes";
import Insights from "./pages/Insights";
import Search from "./pages/Search";
import Settings from "./pages/Settings";

export default function App() {
  // re-upload upcoming reminders each launch so times stay fresh
  useEffect(() => {
    syncReminders();
  }, []);

  return (
    <HashRouter>
      <FocusProvider>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<Home />} />
          <Route path="/lists" element={<Lists />} />
          <Route path="/lists/:id" element={<ListDetail />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/budget" element={<Budget />} />
          <Route path="/fitness" element={<Fitness />} />
          <Route path="/sports" element={<Sports />} />
          <Route path="/meals" element={<Meals />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/search" element={<Search />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
      </FocusProvider>
    </HashRouter>
  );
}
