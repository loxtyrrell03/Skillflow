import { auth } from "./firebase.js";
import { clearAuthSession, readAuthSession, writeAuthSession } from "./auth-session.js";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signOut
} from "./vendor/firebase-auth.js";

const statusEl = document.getElementById("status");
const signedOutView = document.getElementById("signedOutView");
const signedInView = document.getElementById("signedInView");
const signedInEmail = document.getElementById("signedInEmail");

const googleAuthBtn = document.getElementById("googleAuthBtn");
const openPanelBtn = document.getElementById("openPanelBtn");
const signOutBtn = document.getElementById("signOutBtn");

const DEFAULT_GOOGLE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile"
];

let lastGoogleAccessToken = null;
let shouldAutoCloseOnSignIn = false;

const clearAllCachedGoogleTokens = async () => {
  if (!chrome?.identity?.clearAllCachedAuthTokens) return;

  await new Promise((resolve) => {
    chrome.identity.clearAllCachedAuthTokens(() => resolve());
  });
};

const getOAuthConfig = () => {
  const manifest = chrome.runtime.getManifest();
  const manifestScopes = Array.isArray(manifest?.oauth2?.scopes) ? manifest.oauth2.scopes : [];

  return {
    clientId: manifest?.oauth2?.client_id || "",
    scopes: Array.from(new Set([...DEFAULT_GOOGLE_SCOPES, ...manifestScopes]))
  };
};

const buildGoogleOAuthUrl = (clientId, scopes, redirectUri) => {
  const nonce = (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) + "-sf";
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "token id_token",
    scope: scopes.join(" "),
    prompt: "select_account",
    include_granted_scopes: "true",
    nonce
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

const getChromeAuthToken = (scopes) =>
  new Promise((resolve, reject) => {
    if (!chrome?.identity?.getAuthToken) {
      reject(new Error("Chrome identity API not available."));
      return;
    }

    chrome.identity.getAuthToken({ interactive: true, scopes }, (tokenResult) => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      const token = typeof tokenResult === "string" ? tokenResult : tokenResult?.token;
      if (!token) {
        reject(new Error("Google did not return an access token."));
        return;
      }

      resolve(token);
    });
  });

const removeCachedGoogleToken = async () => {
  if (lastGoogleAccessToken && chrome?.identity?.removeCachedAuthToken) {
    await new Promise((resolve) => {
      chrome.identity.removeCachedAuthToken({ token: lastGoogleAccessToken }, () => resolve());
    });
  } else {
    await clearAllCachedGoogleTokens();
  }

  lastGoogleAccessToken = null;
};

const launchGoogleAuthFlow = () =>
  new Promise((resolve, reject) => {
    if (!chrome?.identity?.launchWebAuthFlow) {
      reject(new Error("Chrome identity API not available."));
      return;
    }

    const { clientId, scopes } = getOAuthConfig();
    if (!clientId || clientId.includes("YOUR_GOOGLE_OAUTH_CLIENT_ID")) {
      reject(new Error("Missing OAuth client ID in manifest.oauth2.client_id."));
      return;
    }

    const redirectUri = chrome.identity.getRedirectURL("firebase");
    const authUrl = buildGoogleOAuthUrl(clientId, scopes, redirectUri);

    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (redirectUrl) => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!redirectUrl) {
        reject(new Error("No redirect URL returned from Google."));
        return;
      }

      resolve(redirectUrl);
    });
  });

const parseOAuthRedirect = (redirectUrl) => {
  const url = new URL(redirectUrl);
  const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : "");
  const queryParams = new URLSearchParams(url.search);
  const getParam = (name) => hashParams.get(name) || queryParams.get(name);

  const error = getParam("error");
  if (error) {
    throw new Error(error.replace(/_/g, " "));
  }

  const idToken = getParam("id_token");
  const accessToken = getParam("access_token");

  if (!idToken && !accessToken) {
    throw new Error("Google sign-in returned no tokens.");
  }

  return { idToken, accessToken };
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

const formatAuthError = (error) => error?.message || error?.code || "Google sign-in failed.";

const signInWithChromeIdentity = async () => {
  const { scopes } = getOAuthConfig();
  const accessToken = await getChromeAuthToken(scopes);
  const credential = GoogleAuthProvider.credential(null, accessToken);

  await signInWithCredential(auth, credential);
  lastGoogleAccessToken = accessToken;
};

const signInWithWebAuthFlow = async () => {
  const redirectUrl = await launchGoogleAuthFlow();
  const { idToken, accessToken } = parseOAuthRedirect(redirectUrl);
  const credential = GoogleAuthProvider.credential(idToken || null, accessToken || null);

  await signInWithCredential(auth, credential);
  lastGoogleAccessToken = accessToken || null;
};

googleAuthBtn.addEventListener("click", async () => {
  googleAuthBtn.disabled = true;
  shouldAutoCloseOnSignIn = true;
  try {
    setStatus("Opening Google sign-in...", "");

    const failures = [];

    try {
      await signInWithChromeIdentity();
      setStatus("Signed in successfully.", "success");
      return;
    } catch (error) {
      failures.push(`Chrome Identity: ${formatAuthError(error)}`);
      await removeCachedGoogleToken();
    }

    try {
      setStatus("Retrying with Google web auth...", "");
      await signInWithWebAuthFlow();
      setStatus("Signed in successfully.", "success");
      return;
    } catch (error) {
      failures.push(`Web Auth Flow: ${formatAuthError(error)}`);
      await removeCachedGoogleToken();
    }

    setStatus(failures.join(" | "), "error");
    shouldAutoCloseOnSignIn = false;
  } finally {
    googleAuthBtn.disabled = false;
  }
});

openPanelBtn.addEventListener("click", () => {
  const panelUrl = chrome?.runtime?.getURL ? chrome.runtime.getURL("panel.html") : "panel.html";
  window.open(panelUrl, "_blank");
});

signOutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
    await removeCachedGoogleToken();
    await clearAuthSession();
    setStatus("Signed out.", "success");
  } catch {
    setStatus("Sign out failed.", "error");
  }
});

onAuthStateChanged(auth, (user) => {
  googleAuthBtn.disabled = false;

  if (user) {
    (async () => {
      const existingSession = await readAuthSession();
      await writeAuthSession({
        accessToken: lastGoogleAccessToken || existingSession?.accessToken || null,
        email: user.email || "",
        uid: user.uid
      });
    })().catch(() => {});
    signedOutView.classList.add("hidden");
    signedInView.classList.remove("hidden");
    signedInEmail.textContent = user.email || user.uid;
    if (shouldAutoCloseOnSignIn) {
      shouldAutoCloseOnSignIn = false;
      window.setTimeout(() => window.close(), 250);
    }
  } else {
    clearAuthSession().catch(() => {});
    signedOutView.classList.remove("hidden");
    signedInView.classList.add("hidden");
    signedInEmail.textContent = "";
  }
});
