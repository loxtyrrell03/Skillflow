import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "./vendor/firebase-auth.js";
import { doc, getDoc } from "./vendor/firebase-firestore.js";

const statusEl = document.getElementById("status");
const cloudStatusEl = document.getElementById("cloudStatus");
const accountStateEl = document.getElementById("accountState");
const accountHintEl = document.getElementById("accountHint");
const openLoginBtn = document.getElementById("openLoginBtn");
const signOutBtn = document.getElementById("signOutBtn");
const refreshBtn = document.getElementById("refreshBtn");
const openSkillflowBtn = document.getElementById("openSkillflowBtn");

const sessionSelect = document.getElementById("sessionSelect");
const loadSessionBtn = document.getElementById("loadSessionBtn");
const sessionMeta = document.getElementById("sessionMeta");

const currentTitle = document.getElementById("currentTitle");
const sectionBadge = document.getElementById("sectionBadge");
const timerClock = document.getElementById("timerClock");
const timerMeta = document.getElementById("timerMeta");
const progressFill = document.getElementById("progressFill");
const progressSegments = document.getElementById("progressSegments");

const prevBtn = document.getElementById("prevBtn");
const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const nextBtn = document.getElementById("nextBtn");
const stopBtn = document.getElementById("stopBtn");

const sectionsList = document.getElementById("sectionsList");
const emptySections = document.getElementById("emptySections");
const totalDuration = document.getElementById("totalDuration");

const storage = {
  get: (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve)),
  set: (values) => new Promise((resolve) => chrome.storage.local.set(values, resolve))
};

const state = {
  user: null,
  outlines: [],
  activeOutline: null,
  activeOutlineId: null,
  currentIndex: 0,
  secondsLeft: 0,
  running: false,
  sessionStarted: false,
  endTimeMs: null,
  totalSeconds: 0
};

let cachedTimerState = null;
let tickId = null;

const setStatus = (message, tone = "") => {
  if (!statusEl) return;
  if (!message) {
    statusEl.textContent = "";
    statusEl.classList.add("hidden");
    statusEl.removeAttribute("data-tone");
    return;
  }
  statusEl.textContent = message;
  statusEl.classList.remove("hidden");
  if (tone) {
    statusEl.setAttribute("data-tone", tone);
  } else {
    statusEl.removeAttribute("data-tone");
  }
};

const setCloudStatus = (text) => {
  if (cloudStatusEl) cloudStatusEl.textContent = text;
};

const formatTime = (seconds) => {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
};

const calcTotalSeconds = (sections) =>
  sections.reduce((sum, section) => sum + Math.max(0, Number(section.minutes) || 0) * 60, 0);

const normalizeSections = (rawSections) =>
  (Array.isArray(rawSections) ? rawSections : []).map((section, index) => ({
    id: section.id || `S${index + 1}`,
    name: section.name || section.title || `Section ${index + 1}`,
    minutes: Math.max(1, Math.round(Number(section.minutes) || 0)),
    links: Array.isArray(section.links) ? section.links : []
  }));

const normalizeOutline = (rawOutline, index) => ({
  id: rawOutline.id || `O${Date.now().toString(36)}${index}`,
  title: rawOutline.title || rawOutline.name || `Session ${index + 1}`,
  sections: normalizeSections(rawOutline.sections || [])
});

const updateAccountUI = (user) => {
  if (user) {
    accountStateEl.textContent = user.email || user.uid;
    accountHintEl.textContent = "Cloud sync enabled.";
    openLoginBtn.textContent = "Open login";
    signOutBtn.classList.remove("hidden");
    setCloudStatus("Syncing...");
  } else {
    accountStateEl.textContent = "Not signed in";
    accountHintEl.textContent = "Sign in to sync sessions from Skillflow.";
    openLoginBtn.textContent = "Sign in";
    signOutBtn.classList.add("hidden");
    setCloudStatus("Local mode");
  }
};

function renderSessionMeta(outline, isActive) {
  if (!outline) {
    sessionMeta.textContent = "No session loaded.";
    return;
  }
  const totalMinutes = Math.round(calcTotalSeconds(outline.sections) / 60);
  sessionMeta.textContent = `${outline.sections.length} sections, ${totalMinutes} min${isActive ? " loaded" : ""}`;
}

const renderSessionSelect = () => {
  sessionSelect.innerHTML = "";
  if (!state.outlines.length) {
    const opt = document.createElement("option");
    opt.textContent = "No sessions found";
    opt.value = "";
    sessionSelect.appendChild(opt);
    sessionSelect.disabled = true;
    loadSessionBtn.disabled = true;
    sessionMeta.textContent = "No session loaded.";
    state.activeOutline = null;
    state.activeOutlineId = null;
    state.totalSeconds = 0;
    state.currentIndex = 0;
    state.secondsLeft = 0;
    state.running = false;
    state.sessionStarted = false;
    state.endTimeMs = null;
    if (tickId) {
      clearInterval(tickId);
      tickId = null;
    }
    progressSegments.innerHTML = "";
    renderAll();
    saveTimerState();
    return;
  }

  state.outlines.forEach((outline) => {
    const opt = document.createElement("option");
    opt.value = outline.id;
    opt.textContent = outline.title || "Untitled session";
    sessionSelect.appendChild(opt);
  });

  sessionSelect.disabled = false;
  loadSessionBtn.disabled = false;

  if (state.activeOutlineId && state.outlines.some((outline) => outline.id === state.activeOutlineId)) {
    sessionSelect.value = state.activeOutlineId;
  } else {
    sessionSelect.value = state.outlines[0].id;
  }
  const selectedOutline = state.outlines.find((outline) => outline.id === sessionSelect.value);
  renderSessionMeta(selectedOutline, false);
};

const renderSections = () => {
  sectionsList.innerHTML = "";
  const sections = state.activeOutline?.sections || [];
  emptySections.classList.toggle("hidden", sections.length > 0);

  sections.forEach((section, index) => {
    const li = document.createElement("li");
    li.className = "section-item";
    if (index === state.currentIndex) li.classList.add("active");
    li.dataset.index = String(index);

    const title = document.createElement("span");
    title.className = "section-title";
    title.textContent = section.name;

    const time = document.createElement("span");
    time.className = "section-time";
    time.textContent = `${section.minutes} min`;

    li.append(title, time);
    sectionsList.appendChild(li);
  });
};

const renderProgressSegments = () => {
  progressSegments.innerHTML = "";
  const sections = state.activeOutline?.sections || [];
  if (!state.totalSeconds || sections.length < 2) return;

  let acc = 0;
  sections.forEach((section, index) => {
    acc += Math.max(0, Number(section.minutes) || 0) * 60;
    if (index === sections.length - 1) return;
    const line = document.createElement("span");
    line.style.left = `${(acc / state.totalSeconds) * 100}%`;
    progressSegments.appendChild(line);
  });
};

const renderTimer = () => {
  const sections = state.activeOutline?.sections || [];
  const currentSection = sections[state.currentIndex];
  const hasSession = sections.length > 0;

  currentTitle.textContent = currentSection?.name || "Ready to focus";
  timerClock.textContent = formatTime(state.secondsLeft);
  sectionBadge.textContent = hasSession ? `${state.currentIndex + 1} / ${sections.length}` : "0 / 0";

  if (!hasSession) {
    timerMeta.textContent = "Select a session";
  } else if (state.running) {
    timerMeta.textContent = "Running";
  } else if (state.sessionStarted && state.secondsLeft === 0 && state.currentIndex === sections.length - 1) {
    timerMeta.textContent = "Session complete";
  } else if (state.sessionStarted) {
    timerMeta.textContent = "Paused";
  } else {
    timerMeta.textContent = "Ready";
  }
};

const renderProgress = () => {
  let percent = 0;
  if (state.sessionStarted && state.totalSeconds > 0) {
    const sections = state.activeOutline?.sections || [];
    const completed = sections
      .slice(0, state.currentIndex)
      .reduce((sum, section) => sum + Math.max(0, Number(section.minutes) || 0) * 60, 0);
    const currentTotal = Math.max(0, Number(sections[state.currentIndex]?.minutes) || 0) * 60;
    const elapsedCurrent = Math.max(0, currentTotal - state.secondsLeft);
    percent = Math.min(100, ((completed + elapsedCurrent) / state.totalSeconds) * 100);
  }
  progressFill.style.width = `${percent}%`;
};

const renderTotals = () => {
  const totalMinutes = state.activeOutline ? Math.round(state.totalSeconds / 60) : 0;
  totalDuration.textContent = `${totalMinutes} min`;
};

const updateControls = () => {
  const sections = state.activeOutline?.sections || [];
  const hasSession = sections.length > 0;

  prevBtn.disabled = !hasSession || state.currentIndex <= 0;
  nextBtn.disabled = !hasSession || state.currentIndex >= sections.length - 1;
  startBtn.disabled = !hasSession;
  stopBtn.disabled = !hasSession;

  startBtn.classList.toggle("hidden", state.running);
  pauseBtn.classList.toggle("hidden", !state.running);
};

const renderAll = () => {
  renderSections();
  renderTimer();
  renderProgress();
  renderTotals();
  updateControls();
};

const setActiveOutline = (outlineId, resetTimer = true) => {
  const outline = state.outlines.find((item) => item.id === outlineId);
  if (!outline) return;

  state.activeOutline = outline;
  state.activeOutlineId = outline.id;
  state.totalSeconds = calcTotalSeconds(outline.sections);
  if (sessionSelect.value !== outline.id) {
    sessionSelect.value = outline.id;
  }

  if (resetTimer) {
    state.currentIndex = 0;
    state.secondsLeft = outline.sections[0] ? outline.sections[0].minutes * 60 : 0;
    state.sessionStarted = false;
    state.running = false;
    state.endTimeMs = null;
    if (tickId) {
      clearInterval(tickId);
      tickId = null;
    }
  }

  renderSessionMeta(outline, true);
  renderProgressSegments();
  renderAll();
  saveTimerState();
};

const setCurrentIndex = (index) => {
  const sections = state.activeOutline?.sections || [];
  if (!sections.length) return;
  const nextIndex = Math.min(Math.max(index, 0), sections.length - 1);
  state.currentIndex = nextIndex;
  state.secondsLeft = sections[nextIndex].minutes * 60;
  if (state.running) {
    state.endTimeMs = Date.now() + state.secondsLeft * 1000;
  }
  renderAll();
  saveTimerState();
};

const startTimer = () => {
  const sections = state.activeOutline?.sections || [];
  if (!sections.length) {
    setStatus("Load a session to start the timer.", "warning");
    return;
  }
  if (state.running) return;
  state.sessionStarted = true;
  state.running = true;
  state.endTimeMs = Date.now() + state.secondsLeft * 1000;
  tickId = setInterval(tick, 250);
  tick();
  updateControls();
  saveTimerState();
};

const pauseTimer = () => {
  if (!state.running) return;
  state.running = false;
  if (tickId) {
    clearInterval(tickId);
    tickId = null;
  }
  if (state.endTimeMs) {
    state.secondsLeft = Math.max(0, Math.round((state.endTimeMs - Date.now()) / 1000));
  }
  state.endTimeMs = null;
  renderAll();
  saveTimerState();
};

const stopTimer = () => {
  const sections = state.activeOutline?.sections || [];
  if (tickId) {
    clearInterval(tickId);
    tickId = null;
  }
  state.running = false;
  state.sessionStarted = false;
  state.currentIndex = 0;
  state.secondsLeft = sections[0] ? sections[0].minutes * 60 : 0;
  state.endTimeMs = null;
  renderAll();
  saveTimerState();
};

const handleSectionComplete = () => {
  const sections = state.activeOutline?.sections || [];
  if (state.currentIndex < sections.length - 1) {
    state.currentIndex += 1;
    state.secondsLeft = sections[state.currentIndex].minutes * 60;
    state.endTimeMs = Date.now() + state.secondsLeft * 1000;
    renderAll();
    saveTimerState();
    return;
  }

  state.running = false;
  state.secondsLeft = 0;
  state.endTimeMs = null;
  if (tickId) {
    clearInterval(tickId);
    tickId = null;
  }
  renderAll();
  saveTimerState();
};

const tick = () => {
  if (!state.running) return;
  if (!state.endTimeMs) return;

  const remaining = Math.max(0, Math.round((state.endTimeMs - Date.now()) / 1000));
  state.secondsLeft = remaining;
  renderTimer();
  renderProgress();

  if (remaining <= 0) {
    handleSectionComplete();
  }
};

const saveTimerState = () => {
  const timerState = {
    outlineId: state.activeOutline?.id || null,
    currentIndex: state.currentIndex,
    secondsLeft: state.secondsLeft,
    running: state.running,
    sessionStarted: state.sessionStarted,
    endTimeMs: state.endTimeMs,
    updatedAt: Date.now()
  };
  storage.set({
    timerState,
    lastOutlineId: state.activeOutline?.id || null,
    savedOutlines: state.outlines
  });
};

const applyTimerState = (timerState) => {
  if (!timerState?.outlineId) return;
  const outline = state.outlines.find((item) => item.id === timerState.outlineId);
  if (!outline) return;

  state.activeOutline = outline;
  state.activeOutlineId = outline.id;
  state.totalSeconds = calcTotalSeconds(outline.sections);
  if (sessionSelect.value !== outline.id) {
    sessionSelect.value = outline.id;
  }

  const maxIndex = Math.max(0, outline.sections.length - 1);
  const storedIndex = Number.isFinite(timerState.currentIndex) ? timerState.currentIndex : 0;
  state.currentIndex = Math.min(Math.max(storedIndex, 0), maxIndex);
  const fallbackSeconds = outline.sections[0] ? outline.sections[0].minutes * 60 : 0;
  const storedSeconds = Number.isFinite(timerState.secondsLeft) ? timerState.secondsLeft : null;
  state.secondsLeft = storedSeconds !== null ? storedSeconds : fallbackSeconds;
  state.sessionStarted = !!timerState.sessionStarted;
  state.running = !!timerState.running;

  if (state.running) {
    state.endTimeMs = timerState.endTimeMs || Date.now() + state.secondsLeft * 1000;
    if (tickId) clearInterval(tickId);
    tickId = setInterval(tick, 250);
    tick();
  } else {
    state.endTimeMs = null;
    if (tickId) {
      clearInterval(tickId);
      tickId = null;
    }
  }

  renderSessionMeta(outline, true);
  renderProgressSegments();
  renderAll();
};

const loadLocalCache = async () => {
  const data = await storage.get(["savedOutlines", "lastOutlineId", "timerState"]);
  if (Array.isArray(data.savedOutlines)) {
    state.outlines = data.savedOutlines;
  }
  state.activeOutlineId = data.lastOutlineId || null;
  cachedTimerState = data.timerState || null;
  renderSessionSelect();
  if (cachedTimerState && state.outlines.length) {
    applyTimerState(cachedTimerState);
  } else if (state.activeOutlineId) {
    setActiveOutline(state.activeOutlineId, true);
  }
};

const loadRemoteOutlines = async (user) => {
  if (!user) return;
  try {
    setCloudStatus("Syncing...");
    const userDoc = doc(db, "users", user.uid, "apps", "chess_planner_v2");
    const snap = await getDoc(userDoc);
    if (!snap.exists()) {
      setCloudStatus("Cloud sync on");
      setStatus("No cloud sessions found.", "warning");
      return;
    }

    const data = snap.data() || {};
    const outlines = [];

    if (Array.isArray(data.currentSession) && data.currentSession.length) {
      outlines.push({
        id: "__current__",
        title: "Current session",
        sections: normalizeSections(data.currentSession)
      });
    }

    if (Array.isArray(data.savedOutlines)) {
      data.savedOutlines.forEach((outline, index) => {
        outlines.push(normalizeOutline(outline, index));
      });
    }

    state.outlines = outlines;
    await storage.set({ savedOutlines: outlines });
    renderSessionSelect();

    if (!state.sessionStarted && !state.running) {
      if (cachedTimerState) {
        applyTimerState(cachedTimerState);
      } else if (state.activeOutlineId) {
        setActiveOutline(state.activeOutlineId, true);
      }
    }

    setCloudStatus("Cloud sync on");
  } catch (err) {
    setCloudStatus("Cloud sync failed");
    setStatus(err?.message || "Cloud sync failed.", "error");
  }
};

openLoginBtn.addEventListener("click", () => {
  const loginUrl = chrome?.runtime?.getURL ? chrome.runtime.getURL("login.html") : "login.html";
  window.open(loginUrl, "_blank");
});

signOutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
    setStatus("Signed out.", "success");
  } catch {
    setStatus("Sign out failed.", "error");
  }
});

refreshBtn.addEventListener("click", () => {
  if (!state.user) {
    setStatus("Sign in to refresh from the cloud.", "warning");
    return;
  }
  loadRemoteOutlines(state.user);
});

openSkillflowBtn.addEventListener("click", () => {
  window.open("https://chessstudyplanner.firebaseapp.com", "_blank");
});

loadSessionBtn.addEventListener("click", () => {
  const selectedId = sessionSelect.value;
  if (!selectedId) return;
  setActiveOutline(selectedId, true);
});

sessionSelect.addEventListener("change", () => {
  const outline = state.outlines.find((item) => item.id === sessionSelect.value);
  renderSessionMeta(outline, false);
});

sectionsList.addEventListener("click", (event) => {
  const item = event.target.closest(".section-item");
  if (!item) return;
  const index = Number(item.dataset.index);
  if (Number.isNaN(index)) return;
  setCurrentIndex(index);
});

startBtn.addEventListener("click", startTimer);
pauseBtn.addEventListener("click", pauseTimer);
stopBtn.addEventListener("click", stopTimer);
prevBtn.addEventListener("click", () => setCurrentIndex(state.currentIndex - 1));
nextBtn.addEventListener("click", () => setCurrentIndex(state.currentIndex + 1));

onAuthStateChanged(auth, (user) => {
  state.user = user || null;
  updateAccountUI(state.user);
  if (state.user) {
    loadRemoteOutlines(state.user);
  }
});

loadLocalCache();
