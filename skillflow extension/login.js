import { auth } from "./firebase.js";
import {
  onAuthStateChanged,
  GoogleAuthProvider,
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

const getOAuthConfig = () => {
  const manifest = chrome?.runtime?.getManifest?.();
  return {
    clientId: manifest?.oauth2?.client_id || "",
    scopes: manifest?.oauth2?.scopes || ["openid", "email", "profile"]
  };
};

const buildGoogleOAuthUrl = (clientId, scopes, redirectUri) => {
  const nonce = (globalThis.crypto?.randomUUID?.() || `${Date.now()}`) + "-sf";
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "id_token",
    scope: scopes.join(" "),
    prompt: "select_account",
    nonce
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
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
  const fragment = url.hash.startsWith("#") ? url.hash.slice(1) : "";
  const params = new URLSearchParams(fragment);
  const error = params.get("error");
  if (error) {
    throw new Error(error.replace(/_/g, " "));
  }
  const idToken = params.get("id_token");
  const accessToken = params.get("access_token");
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

googleAuthBtn.addEventListener("click", async () => {
  try {
    setStatus("Opening Google sign-in...", "");
    const redirectUrl = await launchGoogleAuthFlow();
    const { idToken, accessToken } = parseOAuthRedirect(redirectUrl);
    const credential = GoogleAuthProvider.credential(idToken || null, accessToken || null);
    await signInWithCredential(auth, credential);
    setStatus("Signed in successfully.", "success");
  } catch (err) {
    setStatus(err?.message || "Google sign-in failed.", "error");
  }
});

openPanelBtn.addEventListener("click", () => {
  const panelUrl = chrome?.runtime?.getURL ? chrome.runtime.getURL("panel.html") : "panel.html";
  window.open(panelUrl, "_blank");
});

signOutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
    setStatus("Signed out.", "success");
  } catch {
    setStatus("Sign out failed.", "error");
  }
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    signedOutView.classList.add("hidden");
    signedInView.classList.remove("hidden");
    signedInEmail.textContent = user.email || user.uid;
  } else {
    signedOutView.classList.remove("hidden");
    signedInView.classList.add("hidden");
    signedInEmail.textContent = "";
  }
});
