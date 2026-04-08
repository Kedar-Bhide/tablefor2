import { messaging, getToken, VAPID_KEY } from "../firebase";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

export async function requestNotificationPermission(uid) {
  try {
    if (!("Notification" in window) || !messaging) {
      return null;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.log("Notification permission denied");
      return null;
    }

    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (token) {
    const now = new Date();
    const utcOffsetMinutes = -now.getTimezoneOffset();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    await updateDoc(doc(db, "users", uid), {
      fcmToken: token,
      notificationsEnabled: true,
      timezone,
      utcOffsetMinutes,
      // Keep legacy field for backward compatibility.
      utcOffset: utcOffsetMinutes / 60,
    });
      console.log("FCM token saved:", token);
      return token;
    }
  } catch (error) {
    console.error("Error getting FCM token:", error);
    return null;
  }
}