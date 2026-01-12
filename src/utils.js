export function throwIfMissing(obj, keys) {
    const missing = [];
    for (let key of keys) {
      if (!(key in obj) || !obj[key]) {
        missing.push(key);
      }
    }
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
  }

/**
 * @param {admin.messaging.Message} payload
 * @returns {Promise<string>}
 */
export async function sendPushNotification(payload) {
  return await admin.messaging().sendEachForMulticast(payload);
}
