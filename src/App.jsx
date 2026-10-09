import { useEffect, useRef, useState } from "react";
import TaskList from "./TaskList";
import ProgressBar from "./ProgressBar";
import Navbar from "./Navbar";
import AddTaskForm from "./AddTaskForm";
import Profile from "./Profile";
import Weather from "./Weather";
import News from "./News";
import SolvingPlatform from "./SolvingPlatform";
import TournamentPlatform from "./TournamentPlatform";
import { getTasks, saveTask } from "./tasksApi";
import "./App.css";

function App() {
  const user = {
    name: "Jonas Jonaitis",
    email: "jonas@flowly.lt",
  };

  const [activePage, setActivePage] = useState(() => {
    const page = new URLSearchParams(window.location.search).get('page');
    return ['solving', 'training'].includes(page) ? page : 'home';
  });
  const [solvingLanguage, setSolvingLanguage] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ml-solving-preferences-v2'))?.language === 'lt' ? 'lt' : 'en'; }
    catch { return 'en'; }
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [taskError, setTaskError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const saveInProgress = useRef(false);

  function handleLanguageChange(language) {
    setSolvingLanguage(language);
    try {
      const stored = JSON.parse(localStorage.getItem('ml-solving-preferences-v2')) || {};
      localStorage.setItem('ml-solving-preferences-v2', JSON.stringify({ ...stored, language }));
    } catch { /* The current language still works without local storage. */ }
  }

  useEffect(() => {
    const controller = new AbortController();

    getTasks(controller.signal)
      .then(setTasks)
      .catch((error) => {
        if (!controller.signal.aborted) {
          setTaskError(`Nepavyko įkelti užduočių. ${error.message}`);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [loadAttempt]);

  function handleRetry() {
    setTaskError("");
    setLoading(true);
    setLoadAttempt((attempt) => attempt + 1);
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (email === "admin" && password === "admin") {
      setIsLoggedIn(true);
      setLoginError("");
      return;
    }

    setLoginError("Neteisingas vartotojo vardas arba slaptažodis.");
  }

  async function persistTask(task, method) {
    if (saveInProgress.current || loading) return false;

    saveInProgress.current = true;
    setSaving(true);
    setTaskError("");

    try {
      const savedTask = await saveTask(task, method);
      setTasks((currentTasks) => method === "POST"
        ? [...currentTasks, savedTask]
        : currentTasks.map((item) => item.id === task.id ? savedTask : item));
      return true;
    } catch (error) {
      setTaskError(`Nepavyko išsaugoti užduoties. ${error.message}`);
      return false;
    } finally {
      saveInProgress.current = false;
      setSaving(false);
    }
  }

  function handleAddTask(newTask) {
    return persistTask(newTask, "POST");
  }

  function handleTaskStatusChange(taskId, status) {
    const task = tasks.find((item) => item.id === taskId);
    if (task) return persistTask({ ...task, status }, "PUT");
  }

  function handleTaskDeadlineChange(taskId, deadline) {
    const task = tasks.find((item) => item.id === taskId);
    if (task) return persistTask({ ...task, deadline }, "PUT");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const completedTaskCount = tasks.filter(
    (task) => task.status === "Atlikta",
  ).length;
  const overdueTaskCount = tasks.filter((task) => {
    if (task.status === "Atlikta" || !task.deadline) return false;

    const deadline = new Date(`${task.deadline}T00:00:00`);
    return deadline < today;
  }).length;

  return (
    <>
      <Navbar activePage={activePage} onNavigate={setActivePage} language={['solving', 'training'].includes(activePage) ? solvingLanguage : 'lt'} />

      {activePage === "home" && (
        <>
          {isLoggedIn && (
            <header className="welcome-message">
              <h1>Sveiki sugrįžę!</h1>
              <p>Prisijungėte kaip admin.</p>
            </header>
          )}

          <main className="login-page">
            {!isLoggedIn && (
              <div className="login-card">
                <>
                  <header className="login-card__header">
                    <h1>Prisijungti</h1>
                    <p>Įveskite savo duomenis, kad tęstumėte</p>
                  </header>

                  <form className="login-form" onSubmit={handleSubmit}>
                    <label className="login-field">
                      <span>Vartotojo vardas</span>
                      <input
                        type="text"
                        name="username"
                        autoComplete="username"
                        placeholder="admin"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                      />
                    </label>

                    <label className="login-field">
                      <span>Slaptažodis</span>
                      <input
                        type="password"
                        name="password"
                        autoComplete="current-password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                      />
                    </label>

                    <button type="submit" className="login-submit">
                      Prisijungti
                    </button>

                    {loginError && (
                      <p className="login-error" role="alert">
                        {loginError}
                      </p>
                    )}
                  </form>
                </>
              </div>
            )}

            {isLoggedIn && (
              <>
                <section className="dashboard-summary" aria-label="Užduočių suvestinė">
                  <p>
                    <strong>{tasks.length} užduotys</strong>
                    <span aria-hidden="true">·</span>
                    <strong>{completedTaskCount} atliktos</strong>
                    <span aria-hidden="true">·</span>
                    <strong>{overdueTaskCount} vėluoja</strong>
                  </p>
                </section>

                {taskError && (
                  <section className="dashboard-summary">
                    <p className="login-error" role="alert">{taskError}</p>
                    <button type="button" className="login-submit" onClick={handleRetry} disabled={saving || loading}>
                      Įkelti iš naujo
                    </button>
                  </section>
                )}

                {saving && <p role="status">Išsaugoma užduotis...</p>}

                <TaskList
                  tasks={tasks}
                  loading={loading}
                  disabled={saving}
                  onStatusChange={handleTaskStatusChange}
                  onDeadlineChange={handleTaskDeadlineChange}
                />

                <AddTaskForm onAddTask={handleAddTask} disabled={loading || saving} />

                <ProgressBar initialProgress={50} />
              </>
            )}
          </main>
        </>
      )}

      {activePage === "profile" && <Profile user={user} tasks={tasks} />}
      {activePage === "weather" && <main className="login-page"><Weather /></main>}
      {activePage === "news" && <News />}
      {activePage === "solving" && <SolvingPlatform language={solvingLanguage} onLanguageChange={handleLanguageChange} />}
      {activePage === "training" && <TournamentPlatform language={solvingLanguage} onLanguageChange={handleLanguageChange} />}
      {activePage === "tournaments" && (
        <News
          url="https://solving.wfcc.ch/wsc/2026-2027/info.html"
          title="World Solving Cup 2026–2027 turnyrai"
        />
      )}
    </>
  );
}

export default App;
