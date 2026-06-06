import { messaging, getToken, VAPID_KEY } from "../firebase";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

export async function requestNotificationPermission(uid) {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.log("Notification permission denied");
      return null;
    }

    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (token) {
      const utcOffset = -new Date().getTimezoneOffset() / 60;

      // Get existing token
      const userSnap = await getDoc(doc(db, "users", uid));
      const existingToken = userSnap.data()?.fcmToken;

      // Only update if token is new
      if (token !== existingToken) {
        await updateDoc(doc(db, "users", uid), {
          fcmToken: token,
          notificationsEnabled: true,
          utcOffset: utcOffset,
        });
        console.log("New FCM token saved:", token);
      } else {
        // Still update utcOffset even if token unchanged
        await updateDoc(doc(db, "users", uid), {
          utcOffset: utcOffset,
        });
      }
      return token;
    }
  } catch (error) {
    console.error("Error getting FCM token:", error);
    return null;
  }
}