const AUTH_SESSION_KEY = "authSession";

const storage = {
  get: (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve)),
  remove: (keys) => new Promise((resolve) => chrome.storage.local.remove(keys, resolve)),
  set: (values) => new Promise((resolve) => chrome.storage.local.set(values, resolve))
};

const readAuthSession = async () => {
  const data = await storage.get([AUTH_SESSION_KEY]);
  return data[AUTH_SESSION_KEY] || null;
};

const writeAuthSession = async (session) => {
  if (!session) {
    await storage.remove([AUTH_SESSION_KEY]);
    return;
  }

  await storage.set({
    [AUTH_SESSION_KEY]: {
      ...session,
      updatedAt: Date.now()
    }
  });
};

const clearAuthSession = async () => {
  await storage.remove([AUTH_SESSION_KEY]);
};

export { AUTH_SESSION_KEY, clearAuthSession, readAuthSession, writeAuthSession };
