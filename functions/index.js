const crypto = require("crypto");

const admin = require("firebase-admin");
const { setGlobalOptions } = require("firebase-functions");
const logger = require("firebase-functions/logger");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const OpenAI = require("openai").default;
const webpush = require("web-push");

admin.initializeApp();

const db = admin.firestore();

const REGION = "us-central1";
const APP_DOC_ID = "chess_planner_v2";
const PUSH_VAPID_SUBJECT = "mailto:alerts@skillflow.app";
const PUSH_VAPID_PUBLIC_KEY = "BLjuU7XyJtvTTlGvWUjHzQqmeNK_-MinIntoHl9yOJFUF0N6LBGDEyydUOWlKBAFmbyPGG6VrK-gbhVDBGCaZU8";

setGlobalOptions({ maxInstances: 10 });

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const WEB_PUSH_PRIVATE_KEY = defineSecret("WEB_PUSH_PRIVATE_KEY");

function requireUid(req) {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  return uid;
}

function userAppRef(uid) {
  return db.doc(`users/${uid}/apps/${APP_DOC_ID}`);
}

function userPushSubscriptionsRef(uid) {
  return userAppRef(uid).collection("pushSubscriptions");
}

function scheduledAlertRef(uid) {
  return db.collection("scheduled_push_alerts").doc(uid);
}

function endpointHash(endpoint) {
  return crypto.createHash("sha1").update(String(endpoint || "")).digest("hex");
}

function asTrimmedString(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function parseSendAt(value) {
  const sendAtMs = Date.parse(String(value || ""));
  if (!Number.isFinite(sendAtMs)) return null;
  return admin.firestore.Timestamp.fromMillis(sendAtMs);
}

function configureWebPush() {
  const privateKey = WEB_PUSH_PRIVATE_KEY.value();
  if (!privateKey) {
    throw new Error("WEB_PUSH_PRIVATE_KEY secret is not configured.");
  }
  webpush.setVapidDetails(PUSH_VAPID_SUBJECT, PUSH_VAPID_PUBLIC_KEY, privateKey);
}

function buildSectionPayload(data) {
  const sectionName = asTrimmedString(data.sectionName, "Current section");
  const nextSectionName = asTrimmedString(data.nextSectionName);
  const sessionTitle = asTrimmedString(data.sessionTitle, "your Skillflow session");
  const title = `${sectionName} complete!`;
  const body = nextSectionName
    ? `Next: ${nextSectionName}`
    : `Session complete. Great work on ${sessionTitle}.`;

  return {
    title,
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: `skillflow-section-${data.uid || "session"}`,
    data: {
      url: "/#home",
      type: "section-complete",
      sectionName,
      nextSectionName,
      sessionTitle
    }
  };
}

async function sendWebPushToDocs(uid, docs, payload) {
  configureWebPush();

  const results = {
    sent: 0,
    removed: 0,
    failed: 0
  };

  for (const docSnap of docs) {
    const subscription = docSnap.data().subscription;
    if (!subscription || !subscription.endpoint) continue;

    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      results.sent += 1;
    } catch (err) {
      results.failed += 1;
      const statusCode = err && (err.statusCode || err.status);
      logger.warn("web push send failed", {
        uid,
        subscriptionId: docSnap.id,
        statusCode: statusCode || null,
        message: err && err.message ? err.message : String(err)
      });

      if (statusCode === 404 || statusCode === 410) {
        await docSnap.ref.delete().catch(() => {});
        results.removed += 1;
      }
    }
  }

  return results;
}

exports.generateSchedule = onCall({ region: REGION, secrets: [OPENAI_API_KEY] }, async (req) => {
  requireUid(req);

  const { brief, constraints = {}, model: modelReq } = req.data || {};
  if (!brief || typeof brief !== "string") {
    throw new HttpsError("invalid-argument", "Provide brief:string");
  }

  const ALLOWED_MODELS = new Set(["gpt-5", "gpt-4o", "gpt-4o-mini"]);
  const model = (typeof modelReq === "string" && ALLOWED_MODELS.has(modelReq.trim()))
    ? modelReq.trim()
    : "gpt-5";

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      timezone: { type: "string" },
      sessions: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            topic: { type: "string" },
            description: { type: "string" },
            duration_min: { type: "integer", minimum: 1, description: "Whole minutes for this section" },
            materials: { type: "array", items: { type: "string" } },
            subsections: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  description: { type: "string" },
                  duration_min: { type: "integer", minimum: 1 },
                  materials: { type: "array", items: { type: "string" } }
                },
                required: ["id", "name", "description", "duration_min", "materials"]
              }
            }
          },
          required: ["id", "topic", "description", "duration_min", "materials", "subsections"]
        }
      },
      notes: { type: "string" }
    },
    required: ["title", "timezone", "sessions", "notes"]
  };

  function enforceNoExtra(obj) {
    if (!obj || typeof obj !== "object") return;
    if (obj.type === "object") {
      obj.additionalProperties = false;
      if (obj.properties && typeof obj.properties === "object") {
        Object.values(obj.properties).forEach(enforceNoExtra);
      }
      if (obj.patternProperties && typeof obj.patternProperties === "object") {
        Object.values(obj.patternProperties).forEach(enforceNoExtra);
      }
    }
    if (obj.type === "array" && obj.items) enforceNoExtra(obj.items);
    if (Array.isArray(obj.anyOf)) obj.anyOf.forEach(enforceNoExtra);
    if (Array.isArray(obj.oneOf)) obj.oneOf.forEach(enforceNoExtra);
    if (Array.isArray(obj.allOf)) obj.allOf.forEach(enforceNoExtra);
  }

  enforceNoExtra(schema);
  logger.info("schema additionalProperties checks", {
    rootAP: schema.additionalProperties === false,
    sessionAP: schema.properties && schema.properties.sessions && schema.properties.sessions.items &&
      schema.properties.sessions.items.additionalProperties === false
  });

  const client = new OpenAI({ apiKey: OPENAI_API_KEY.value() });

  const system = `You convert user briefs into a study outline and timed sections.
Return ONLY JSON exactly matching the provided JSON Schema (no extra fields).
The root object must include title, timezone, sessions, and notes.
For each session include id, topic, description, duration_min (whole minutes),
materials (array, can be empty), and subsections (array, can be empty). Each
subsection includes id, name, description and duration_min. Do not invent keys.`;

  const userPrompt =
    `Brief:\n${brief}\n\nConstraints:\n${JSON.stringify(constraints, null, 2)}\n` +
    "Return ONLY JSON matching the schema.";

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "StudySchedule", schema, strict: true }
      },
      temperature: 1
    });

    const content = completion.choices && completion.choices[0] && completion.choices[0].message
      ? completion.choices[0].message.content
      : "{}";

    let data;
    try {
      data = JSON.parse(content || "{}");
    } catch (err) {
      logger.error("JSON parse failed", { contentSnippet: String(content).slice(0, 200) });
      throw new HttpsError("internal", "Model did not return valid JSON");
    }

    return { ok: true, schedule: data, model };
  } catch (err) {
    logger.error("generateSchedule failed", err);
    throw new HttpsError("internal", "Failed to generate schedule");
  }
});

exports.savePushSubscription = onCall({ region: REGION }, async (req) => {
  const uid = requireUid(req);
  const { subscription, isStandalone = false, platform = "", userAgent = "" } = req.data || {};

  const endpoint = subscription && subscription.endpoint;
  const keys = subscription && subscription.keys;
  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    throw new HttpsError("invalid-argument", "A valid PushSubscription is required.");
  }

  const subscriptionId = endpointHash(endpoint);
  await userPushSubscriptionsRef(uid).doc(subscriptionId).set({
    endpoint,
    subscription,
    isStandalone: !!isStandalone,
    platform: asTrimmedString(platform),
    userAgent: asTrimmedString(userAgent),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return {
    ok: true,
    subscriptionId,
    publicKey: PUSH_VAPID_PUBLIC_KEY
  };
});

exports.removePushSubscription = onCall({ region: REGION }, async (req) => {
  const uid = requireUid(req);
  const endpoint = req.data && req.data.endpoint;
  if (!endpoint || typeof endpoint !== "string") {
    throw new HttpsError("invalid-argument", "Provide subscription endpoint.");
  }

  await userPushSubscriptionsRef(uid).doc(endpointHash(endpoint)).delete().catch(() => {});
  return { ok: true };
});

exports.syncSectionAlert = onCall({ region: REGION }, async (req) => {
  const uid = requireUid(req);
  const data = req.data || {};
  const ref = scheduledAlertRef(uid);

  if (!data.enabled) {
    await ref.set({
      uid,
      status: "cancelled",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      cancelledAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return { ok: true, status: "cancelled" };
  }

  const sendAt = parseSendAt(data.sendAt);
  if (!sendAt) {
    throw new HttpsError("invalid-argument", "Provide a valid sendAt ISO timestamp.");
  }

  await ref.set({
    uid,
    status: "pending",
    sendAt,
    sectionName: asTrimmedString(data.sectionName, "Current section"),
    nextSectionName: asTrimmedString(data.nextSectionName),
    sectionIndex: Number(data.sectionIndex || 0),
    sectionCount: Number(data.sectionCount || 0),
    sessionTitle: asTrimmedString(data.sessionTitle, "Skillflow session"),
    outlineId: asTrimmedString(data.outlineId),
    sectionId: asTrimmedString(data.sectionId),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return { ok: true, status: "pending", sendAt: sendAt.toDate().toISOString() };
});

exports.sendPushTest = onCall({ region: REGION, secrets: [WEB_PUSH_PRIVATE_KEY] }, async (req) => {
  const uid = requireUid(req);
  const subsSnap = await userPushSubscriptionsRef(uid).get();
  if (subsSnap.empty) {
    throw new HttpsError("failed-precondition", "No phone push subscription is saved for this account yet.");
  }

  const title = asTrimmedString(req.data && req.data.title, "Skillflow test notification");
  const body = asTrimmedString(req.data && req.data.body, "Phone alerts are connected for this account.");

  const payload = {
    title,
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: `skillflow-test-${Date.now()}`,
    data: {
      url: "/#home",
      type: "push-test"
    }
  };

  const result = await sendWebPushToDocs(uid, subsSnap.docs, payload);
  return { ok: true, ...result };
});

exports.processScheduledPushAlerts = onSchedule({
  schedule: "every 1 minutes",
  timeZone: "Etc/UTC",
  region: REGION,
  secrets: [WEB_PUSH_PRIVATE_KEY]
}, async () => {
  const now = admin.firestore.Timestamp.now();
  const snap = await db.collection("scheduled_push_alerts")
    .where("status", "==", "pending")
    .where("sendAt", "<=", now)
    .limit(40)
    .get();

  if (snap.empty) return null;

  for (const alertDoc of snap.docs) {
    const claimed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(alertDoc.ref);
      if (!fresh.exists) return null;
      const data = fresh.data();
      if (!data || data.status !== "pending") return null;
      if (!data.sendAt || data.sendAt.toMillis() > Date.now()) return null;

      tx.update(alertDoc.ref, {
        status: "processing",
        processingAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return data;
    });

    if (!claimed) continue;

    const subsSnap = await userPushSubscriptionsRef(claimed.uid).get();
    if (subsSnap.empty) {
      await alertDoc.ref.set({
        status: "no_subscriptions",
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      continue;
    }

    const result = await sendWebPushToDocs(claimed.uid, subsSnap.docs, buildSectionPayload(claimed));
    const nextStatus = result.sent > 0 ? "sent" : "failed";

    await alertDoc.ref.set({
      status: nextStatus,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      sentCount: result.sent,
      removedSubscriptions: result.removed,
      failedCount: result.failed
    }, { merge: true });
  }

  return null;
});
