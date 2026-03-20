import { auth, db } from "./firebase.js";
import { AUTH_SESSION_KEY, clearAuthSession, readAuthSession } from "./auth-session.js";
import { GoogleAuthProvider, onAuthStateChanged, signInWithCredential, signOut } from "./vendor/firebase-auth.js";
import { doc, onSnapshot, serverTimestamp, setDoc } from "./vendor/firebase-firestore.js";

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
const progressHost = document.getElementById("progressHost");
const progressCaption = document.getElementById("progressCaption");
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
  awaitingNext: false,
  endTimeMs: null,
  totalSeconds: 0,
  timerOutlineId: null
};

let cachedTimerState = null;
let tickId = null;
let authRestorePromise = null;
let remoteSnapshotUnsubscribe = null;

const clearIdentityTokens = async () => {
  if (!chrome?.identity?.clearAllCachedAuthTokens) return;

  await new Promise((resolve) => {
    chrome.identity.clearAllCachedAuthTokens(() => resolve());
  });
};

const restoreAuthFromSession = async (session, { reportError = false } = {}) => {
  if (!session?.accessToken) return false;
  if (auth.currentUser?.uid === session.uid) return true;
  if (authRestorePromise) return authRestorePromise;

  authRestorePromise = (async () => {
    try {
      setCloudStatus("Restoring session...");
      const credential = GoogleAuthProvider.credential(null, session.accessToken);
      await signInWithCredential(auth, credential);
      return true;
    } catch (error) {
      if (reportError) {
        setStatus(
          error?.message || "The panel could not restore the signed-in session. Please sign in again.",
          "error"
        );
      }
      return false;
    } finally {
      authRestorePromise = null;
    }
  })();

  return authRestorePromise;
};

const userDocRef = (uid) => doc(db, "users", uid, "apps", "chess_planner_v2");

const isCloudMirrorMode = () => !!state.user;

const clearRemoteSubscription = () => {
  if (!remoteSnapshotUnsubscribe) return;
  remoteSnapshotUnsubscribe();
  remoteSnapshotUnsubscribe = null;
};

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

const getSectionSeconds = (section) => Math.max(0, Number(section?.minutes) || 0) * 60;

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

const buildRemoteOutlines = (data) => {
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

  return outlines;
};

const resolveElapsedPosition = (targetElapsed) => {
  const sections = state.activeOutline?.sections || [];
  if (!sections.length || !state.totalSeconds) return null;

  const clampedElapsed = Math.max(0, Math.min(Math.round(targetElapsed), state.totalSeconds));

  if (clampedElapsed >= state.totalSeconds) {
    return {
      currentIndex: sections.length - 1,
      secondsLeft: 0,
      sessionStarted: true,
      running: false,
      awaitingNext: false
    };
  }

  let traversed = 0;
  for (let index = 0; index < sections.length; index += 1) {
    const sectionSeconds = getSectionSeconds(sections[index]);
    const sectionEnd = traversed + sectionSeconds;

    if (clampedElapsed < sectionEnd || index === sections.length - 1) {
      const elapsedInSection = Math.max(0, clampedElapsed - traversed);
      const secondsLeft = Math.max(0, sectionSeconds - elapsedInSection);
      return {
        currentIndex: index,
        secondsLeft,
        sessionStarted: clampedElapsed > 0,
        running: state.running && secondsLeft > 0,
        awaitingNext: false
      };
    }

    traversed = sectionEnd;
  }

  return null;
};

const applyResolvedPosition = (nextState, { persist = true } = {}) => {
  if (!nextState) return;

  state.currentIndex = nextState.currentIndex;
  state.secondsLeft = nextState.secondsLeft;
  state.sessionStarted = nextState.sessionStarted;
  state.awaitingNext = nextState.awaitingNext;
  state.running = nextState.running;

  if (tickId) {
    clearInterval(tickId);
    tickId = null;
  }

  if (state.running) {
    state.endTimeMs = Date.now() + state.secondsLeft * 1000;
    tickId = setInterval(tick, 250);
  } else {
    state.endTimeMs = null;
  }

  renderAll();
  if (persist) saveTimerState();
};

const pushRemoteTimerState = async (nextState) => {
  if (!state.user || !nextState) return;

  const outlineId =
    state.timerOutlineId ||
    (state.activeOutline?.id && state.activeOutline.id !== "__current__" ? state.activeOutline.id : null);

  setCloudStatus("Syncing...");

  try {
    await setDoc(
      userDocRef(state.user.uid),
      {
        timer: {
          currentIndex: nextState.currentIndex,
          secondsLeft: nextState.secondsLeft,
          running: nextState.running,
          sessionStarted: nextState.sessionStarted,
          awaitingNext: nextState.awaitingNext,
          outlineId,
          lastSyncTs: Date.now()
        },
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
    setStatus("", "");
  } catch (error) {
    setCloudStatus("Cloud sync failed");
    setStatus(error?.message || "Couldn't sync the new timer position to Skillflow.", "error");
  }
};

const applySharedTimerState = (sharedTimer) => {
  const sections = state.activeOutline?.sections || [];
  state.timerOutlineId = sharedTimer?.outlineId || state.timerOutlineId || null;
  if (!sections.length) {
    state.currentIndex = 0;
    state.secondsLeft = 0;
    state.running = false;
    state.sessionStarted = false;
    state.awaitingNext = false;
    state.endTimeMs = null;
    renderAll();
    return;
  }

  const maxIndex = Math.max(0, sections.length - 1);
  const storedIndex = Number.isFinite(sharedTimer?.currentIndex) ? sharedTimer.currentIndex : 0;
  const safeIndex = Math.min(Math.max(storedIndex, 0), maxIndex);
  const fallbackSeconds = getSectionSeconds(sections[safeIndex]);
  const storedSeconds = Number.isFinite(sharedTimer?.secondsLeft) ? sharedTimer.secondsLeft : fallbackSeconds;

  state.currentIndex = safeIndex;
  state.secondsLeft = Math.max(0, storedSeconds);
  state.sessionStarted = !!sharedTimer?.sessionStarted;
  state.awaitingNext = !!sharedTimer?.awaitingNext;
  state.running = false;
  state.endTimeMs = null;

  if (sharedTimer?.running && Number.isFinite(sharedTimer?.lastSyncTs)) {
    let delta = Math.floor((Date.now() - sharedTimer.lastSyncTs) / 1000);
    let idx = state.currentIndex;
    let remain = state.secondsLeft;

    while (delta > 0 && sections[idx]) {
      if (delta >= remain) {
        delta -= remain;
        idx += 1;
        remain = sections[idx] ? getSectionSeconds(sections[idx]) : 0;
      } else {
        remain -= delta;
        delta = 0;
      }
    }

    state.currentIndex = Math.min(idx, maxIndex);
    state.secondsLeft = Math.max(0, remain || 0);
    state.running = idx <= maxIndex && state.secondsLeft > 0;
    if (state.running) {
      state.endTimeMs = Date.now() + state.secondsLeft * 1000;
    }
  }

  if (tickId) {
    clearInterval(tickId);
    tickId = null;
  }

  if (state.running) {
    tickId = setInterval(tick, 250);
    tick();
  } else {
    renderAll();
  }
};

const applyRemoteSnapshot = async (data) => {
  const outlines = buildRemoteOutlines(data);
  state.outlines = outlines;
  state.timerOutlineId = data?.timer?.outlineId || null;
  await storage.set({ savedOutlines: outlines });
  renderSessionSelect();

  const hasCurrentOutline = outlines.some((outline) => outline.id === "__current__");
  const requestedOutlineId = hasCurrentOutline ? "__current__" : data?.timer?.outlineId || state.activeOutlineId || null;
  const nextOutline =
    (requestedOutlineId ? outlines.find((outline) => outline.id === requestedOutlineId) : null) ||
    outlines.find((outline) => outline.id === "__current__") ||
    outlines[0] ||
    null;

  if (!nextOutline) {
    setCloudStatus("Live sync on");
    setStatus("No cloud sessions found.", "warning");
    renderAll();
    return;
  }

  state.activeOutline = nextOutline;
  state.activeOutlineId = nextOutline.id;
  state.totalSeconds = calcTotalSeconds(nextOutline.sections);
  if (sessionSelect.value !== nextOutline.id) {
    sessionSelect.value = nextOutline.id;
  }

  applySharedTimerState(data?.timer || null);
  renderSessionMeta(nextOutline, true);
  renderProgressSegments();
  renderAll();
  saveTimerState();
  setCloudStatus("Live sync on");
  setStatus("", "");
};

const subscribeRemoteState = (user) => {
  if (!user) return;

  clearRemoteSubscription();
  setCloudStatus("Syncing...");

  remoteSnapshotUnsubscribe = onSnapshot(
    userDocRef(user.uid),
    (snap) => {
      if (!snap.exists()) {
        state.outlines = [];
        state.activeOutline = null;
        state.activeOutlineId = null;
        state.timerOutlineId = null;
        state.currentIndex = 0;
        state.secondsLeft = 0;
        state.running = false;
        state.sessionStarted = false;
        state.awaitingNext = false;
        state.endTimeMs = null;
        state.totalSeconds = 0;
        renderSessionSelect();
        renderAll();
        setCloudStatus("Live sync on");
        setStatus("No cloud sessions found.", "warning");
        return;
      }

      applyRemoteSnapshot(snap.data() || {}).catch((error) => {
        setCloudStatus("Cloud sync failed");
        setStatus(error?.message || "Cloud sync failed.", "error");
      });
    },
    (error) => {
      setCloudStatus("Cloud sync failed");
      setStatus(error?.message || "Cloud sync failed.", "error");
    }
  );
};

const updateAccountUI = (user) => {
  if (user) {
    accountStateEl.textContent = "Sync on";
    accountHintEl.textContent = user.email || "Cloud sync enabled.";
    openLoginBtn.classList.add("hidden");
    signOutBtn.classList.remove("hidden");
    setCloudStatus("Syncing...");
    refreshBtn.textContent = "Reconnect";
    refreshBtn.title = "Reconnect the live Skillflow sync.";
  } else {
    accountStateEl.textContent = "Local mode";
    accountHintEl.textContent = "Sign in to sync";
    openLoginBtn.classList.remove("hidden");
    openLoginBtn.textContent = "Sign in";
    signOutBtn.classList.add("hidden");
    setCloudStatus("Local mode");
    refreshBtn.textContent = "Refresh";
    refreshBtn.title = "Refresh the local extension cache.";
  }
};

function renderSessionMeta(outline, isActive) {
  if (!outline) {
    sessionMeta.textContent = "No session loaded.";
    return;
  }
  const totalMinutes = Math.round(calcTotalSeconds(outline.sections) / 60);
  if (isCloudMirrorMode() && outline.id === "__current__") {
    sessionMeta.textContent = `${outline.sections.length} sections, ${totalMinutes} min live from Skillflow`;
    return;
  }
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
    state.awaitingNext = false;
    state.endTimeMs = null;
    state.timerOutlineId = null;
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
  const mirrorMode = isCloudMirrorMode();
  emptySections.classList.toggle("hidden", sections.length > 0);

  sections.forEach((section, index) => {
    const li = document.createElement("li");
    li.className = "section-item";
    if (index === state.currentIndex) li.classList.add("active");
    li.dataset.index = String(index);
    li.setAttribute("aria-disabled", mirrorMode ? "true" : "false");

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
    acc += getSectionSeconds(section);
    if (index === sections.length - 1) return;
    const line = document.createElement("span");
    line.style.left = `${(acc / state.totalSeconds) * 100}%`;
    progressSegments.appendChild(line);
  });
};

const getElapsedSeconds = () => {
  if (!state.sessionStarted || state.totalSeconds <= 0) return 0;

  const sections = state.activeOutline?.sections || [];
  const completed = sections
    .slice(0, state.currentIndex)
    .reduce((sum, section) => sum + getSectionSeconds(section), 0);
  const currentTotal = getSectionSeconds(sections[state.currentIndex]);
  const elapsedCurrent = Math.max(0, currentTotal - state.secondsLeft);

  return Math.min(state.totalSeconds, completed + elapsedCurrent);
};

const setElapsedPosition = (targetElapsed) => {
  const nextState = resolveElapsedPosition(targetElapsed);
  if (!nextState) return;

  if (isCloudMirrorMode()) {
    pushRemoteTimerState(nextState);
    return;
  }

  applyResolvedPosition(nextState);
};

const renderTimer = () => {
  const sections = state.activeOutline?.sections || [];
  const currentSection = sections[state.currentIndex];
  const hasSession = sections.length > 0;
  const mirrorMode = isCloudMirrorMode();

  currentTitle.textContent = currentSection?.name || "Ready to focus";
  timerClock.textContent = formatTime(state.secondsLeft);
  sectionBadge.textContent = hasSession ? `${state.currentIndex + 1} / ${sections.length}` : "0 / 0";

  if (!hasSession) {
    timerMeta.textContent = "Select a session";
  } else if (state.awaitingNext) {
    timerMeta.textContent = mirrorMode ? "Waiting for next on Skillflow" : "Ready for next";
  } else if (state.running) {
    timerMeta.textContent = mirrorMode ? "Running live from Skillflow" : "Running";
  } else if (state.sessionStarted && state.secondsLeft === 0 && state.currentIndex === sections.length - 1) {
    timerMeta.textContent = "Session complete";
  } else if (state.sessionStarted) {
    timerMeta.textContent = mirrorMode ? "Paused on Skillflow" : "Paused";
  } else {
    timerMeta.textContent = mirrorMode ? "Ready on Skillflow" : "Ready";
  }
};

const renderProgress = () => {
  const elapsed = getElapsedSeconds();
  const percent = state.totalSeconds > 0 ? Math.min(100, (elapsed / state.totalSeconds) * 100) : 0;
  progressFill.style.width = `${percent}%`;
  if (progressHost) {
    progressHost.setAttribute("aria-valuemax", String(state.totalSeconds || 0));
    progressHost.setAttribute("aria-valuemin", "0");
    progressHost.setAttribute("aria-valuenow", String(elapsed));
    progressHost.setAttribute("aria-valuetext", `${Math.round(percent)}% complete`);
  }
};

const renderTotals = () => {
  const totalMinutes = state.activeOutline ? Math.round(state.totalSeconds / 60) : 0;
  totalDuration.textContent = `${totalMinutes} min`;
};

const updateControls = () => {
  const sections = state.activeOutline?.sections || [];
  const hasSession = sections.length > 0;
  const mirrorMode = isCloudMirrorMode();

  prevBtn.disabled = mirrorMode || !hasSession || state.currentIndex <= 0;
  nextBtn.disabled = mirrorMode || !hasSession || state.currentIndex >= sections.length - 1;
  startBtn.disabled = mirrorMode || !hasSession;
  pauseBtn.disabled = mirrorMode || !state.running;
  stopBtn.disabled = mirrorMode || !hasSession;
  loadSessionBtn.disabled = mirrorMode || sessionSelect.disabled || !sessionSelect.value;

  startBtn.classList.toggle("hidden", state.running && !mirrorMode);
  pauseBtn.classList.toggle("hidden", !state.running || mirrorMode);
  if (progressHost) {
    progressHost.setAttribute("aria-disabled", hasSession ? "false" : "true");
  }
  if (progressCaption) {
    if (mirrorMode && !hasSession) {
      progressCaption.textContent = "No live session found yet. Start or load one in Skillflow to mirror it here.";
    } else if (!hasSession) {
      progressCaption.textContent = "Load a session to start focusing.";
    } else if (mirrorMode) {
      progressCaption.textContent = "Live sync from Skillflow. Click the bar to jump sections, and the website will follow.";
    } else {
      progressCaption.textContent = "Click the bar to jump within the session.";
    }
  }
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
  state.timerOutlineId = outline.id;
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
  if (isCloudMirrorMode()) return;

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
  if (isCloudMirrorMode()) return;

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
  if (isCloudMirrorMode()) return;
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
  if (isCloudMirrorMode()) return;

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
  if (isCloudMirrorMode()) {
    state.running = false;
    state.endTimeMs = null;
    if (tickId) {
      clearInterval(tickId);
      tickId = null;
    }
    renderAll();
    return;
  }

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
    outlineId:
      state.timerOutlineId ||
      (state.activeOutline?.id && state.activeOutline.id !== "__current__" ? state.activeOutline.id : null),
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
  state.timerOutlineId = timerState.outlineId || outline.id || null;
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

  const authSession = await readAuthSession();
  if (!auth.currentUser && authSession?.accessToken) {
    await restoreAuthFromSession(authSession);
  }
};

openLoginBtn.addEventListener("click", () => {
  const loginUrl = chrome?.runtime?.getURL ? chrome.runtime.getURL("login.html") : "login.html";
  window.open(loginUrl, "skillflow-login", "popup=yes,width=460,height=640");
});

signOutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
    await clearIdentityTokens();
    await clearAuthSession();
    setStatus("Signed out.", "success");
  } catch {
    setStatus("Sign out failed.", "error");
  }
});

refreshBtn.addEventListener("click", () => {
  if (!state.user) {
    loadLocalCache().catch(() => {});
    setStatus("Reloaded the local cache.", "success");
    return;
  }
  subscribeRemoteState(state.user);
  setStatus("Reconnecting live sync...", "");
});

openSkillflowBtn.addEventListener("click", () => {
  window.open("https://chessstudyplanner.firebaseapp.com", "_blank");
});

loadSessionBtn.addEventListener("click", () => {
  if (isCloudMirrorMode()) return;
  const selectedId = sessionSelect.value;
  if (!selectedId) return;
  setActiveOutline(selectedId, true);
});

sessionSelect.addEventListener("change", () => {
  const outline = state.outlines.find((item) => item.id === sessionSelect.value);
  renderSessionMeta(outline, false);
});

sectionsList.addEventListener("click", (event) => {
  if (isCloudMirrorMode()) return;
  const item = event.target.closest(".section-item");
  if (!item) return;
  const index = Number(item.dataset.index);
  if (Number.isNaN(index)) return;
  setCurrentIndex(index);
});

progressHost.addEventListener("click", (event) => {
  if (!state.totalSeconds) return;
  const rect = progressHost.getBoundingClientRect();
  if (!rect.width) return;
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  setElapsedPosition(state.totalSeconds * ratio);
});

progressHost.addEventListener("keydown", (event) => {
  if (!state.totalSeconds) return;

  const elapsed = getElapsedSeconds();
  const step = event.shiftKey ? 300 : 60;
  let nextElapsed = null;

  if (event.key === "ArrowLeft") {
    nextElapsed = elapsed - step;
  } else if (event.key === "ArrowRight") {
    nextElapsed = elapsed + step;
  } else if (event.key === "Home") {
    nextElapsed = 0;
  } else if (event.key === "End") {
    nextElapsed = state.totalSeconds;
  }

  if (nextElapsed === null) return;

  event.preventDefault();
  setElapsedPosition(nextElapsed);
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
    subscribeRemoteState(state.user);
  } else {
    clearRemoteSubscription();
    renderAll();
  }
});

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== "local" || !changes[AUTH_SESSION_KEY]) return;

  const nextSession = changes[AUTH_SESSION_KEY].newValue || null;
  if (!nextSession) {
    await signOut(auth).catch(() => {});
    clearRemoteSubscription();
    state.user = null;
    updateAccountUI(null);
    renderAll();
    return;
  }

  if (!state.user || state.user.uid !== nextSession.uid) {
    if (state.user && state.user.uid !== nextSession.uid) {
      await signOut(auth).catch(() => {});
    }
    await restoreAuthFromSession(nextSession, { reportError: true });
  }
});

loadLocalCache();
