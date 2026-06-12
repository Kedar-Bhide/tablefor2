import React, { useEffect, useState } from "react";
import { auth, db, doc, setDoc, getDoc, onSnapshot, fixUserUrls } from "./firebase";
import { getCurrentTimezone } from "./utils/dateTime";
import { onAuthStateChanged } from "firebase/auth";
import { AnimatePresence, motion } from "framer-motion";
import LandingPage from "./pages/LandingPage";
import Profile from "./pages/Profile";
import NavBar from "./components/NavBar";
import Today from "./pages/Today";
import LogMeal from "./pages/LogMeal";
import Weekly from "./pages/Weekly";
import Gallery from "./pages/Gallery";
import { requestNotificationPermission } from "./utils/requestNotificationPermission";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState("today");
  const [galleryDate, setGalleryDate] = useState(null);
  const [galleryFilter, setGalleryFilter] = useState("mine");

  const [globalUserData, setGlobalUserData] = useState(null);
  const [globalPartnerData, setGlobalPartnerData] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        const now = new Date();
        const timezone = getCurrentTimezone();
        const utcOffsetMinutes = -now.getTimezoneOffset();

        if (!userSnap.exists()) {
          // Create user with better validation and error handling
          try {
            await setDoc(userRef, {
              name: currentUser.displayName || "Anonymous",
              email: currentUser.email,
              photoURL: currentUser.photoURL,
              createdAt: now,
              timezone: timezone || null,
              utcOffsetMinutes,
              utcOffset: utcOffsetMinutes / 60,
              // Initialize default user preferences
              notifSettings: {
                partnerMeal: true,
                badgeEarned: true,
                mealReminder: true
              },
              partnerUid: null,
              streakCount: 0,
              lastReminders: {},
              lastReminder_Breakfast: null,
              lastReminder_Lunch: null,
              lastReminder_Dinner: null,
              lastReminder_Snack: null,
              streakUpdatedAt: null,
            });
          } catch (error) {
            console.error("Failed to create user profile:", error);
            // Continue with minimal user state even if profile creation fails
          }
        } else {
          // Update timezone with better validation
          try {
            await setDoc(
              userRef,
              {
                timezone: timezone || null,
                utcOffsetMinutes,
                utcOffset: utcOffsetMinutes / 60,
              },
              { merge: true }
            );
          } catch (error) {
            console.error("Failed to update user timezone:", error);
          }
        }
        
        setUser(currentUser);
        setTimeout(() => {
          requestNotificationPermission(currentUser.uid);
        }, 1000);
      } else {
        setUser(null);
        setGlobalUserData(null);
        setGlobalPartnerData(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Global User Data Listener
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        setGlobalUserData({ uid: user.uid, ...fixUserUrls(docSnap.data()) });
      } else {
        setGlobalUserData(null);
      }
    });
    return () => unsub();
  }, [user]);

  // Proactive Timezone Sync
  useEffect(() => {
    if (!user) return;

    const syncTimezone = async () => {
      const now = new Date();
      const timezone = getCurrentTimezone();
      const utcOffsetMinutes = -now.getTimezoneOffset();

      const cachedTz = localStorage.getItem("user_timezone");
      const cachedOffset = localStorage.getItem("user_utc_offset_minutes");

      const needsDbSync = globalUserData && (
        globalUserData.timezone !== timezone ||
        globalUserData.utcOffsetMinutes !== utcOffsetMinutes
      );

      if (cachedTz !== timezone || Number(cachedOffset) !== utcOffsetMinutes || needsDbSync) {
        try {
          await setDoc(
            doc(db, "users", user.uid),
            {
              timezone: timezone || null,
              utcOffsetMinutes,
              utcOffset: utcOffsetMinutes / 60,
            },
            { merge: true }
          );
          localStorage.setItem("user_timezone", timezone || "");
          localStorage.setItem("user_utc_offset_minutes", String(utcOffsetMinutes));
          console.log("Timezone synced to Firestore:", timezone, utcOffsetMinutes);
        } catch (e) {
          console.error("Failed to sync timezone:", e);
        }
      }
    };

    syncTimezone();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncTimezone();
      }
    };

    const intervalId = setInterval(syncTimezone, 5 * 60 * 1000);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, [user, globalUserData, currentPage]);

  // Global Partner Data Listener
  useEffect(() => {
    const partnerUid = globalUserData?.partnerUid;
    if (!partnerUid) {
      setGlobalPartnerData(null);
      return;
    }
    const unsub = onSnapshot(doc(db, "users", partnerUid), (docSnap) => {
      if (docSnap.exists()) {
        setGlobalPartnerData({ uid: partnerUid, ...fixUserUrls(docSnap.data()) });
      } else {
        setGlobalPartnerData(null);
      }
    });
    return () => unsub();
  }, [globalUserData?.partnerUid]);


  if (loading) return <p style={{ textAlign: "center", marginTop: "2rem" }}>Loading...</p>;

  if (!user) return <LandingPage />;

  const pageVariants = {
    initial: { opacity: 0, y: 15, scale: 0.99 },
    in: { opacity: 1, y: 0, scale: 1 },
    out: { opacity: 0, y: -15, scale: 0.99 }
  };

  const pageTransition = {
    type: "tween",
    ease: "easeOut",
    duration: 0.3
  };

  return (
    <div style={{ paddingBottom: "70px", overflowX: "hidden" }}>
      <AnimatePresence mode="wait">
        {currentPage === "today" && (
          <motion.div key="today" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
            <Today setCurrentPage={setCurrentPage} globalUserData={globalUserData} globalPartnerData={globalPartnerData} />
          </motion.div>
        )}
        {currentPage === "logMeal" && (
          <motion.div key="logMeal" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
            <LogMeal setCurrentPage={setCurrentPage} globalUserData={globalUserData} globalPartnerData={globalPartnerData} />
          </motion.div>
        )}
        {currentPage === "weekly" && (
          <motion.div key="weekly" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
            <Weekly setCurrentPage={setCurrentPage} setGalleryDate={setGalleryDate} setGalleryFilter={setGalleryFilter} globalUserData={globalUserData} globalPartnerData={globalPartnerData} />
          </motion.div>
        )}
        {currentPage === "gallery" && (
          <motion.div key="gallery" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
            <Gallery galleryDate={galleryDate} setGalleryDate={setGalleryDate} galleryFilter={galleryFilter} globalUserData={globalUserData} globalPartnerData={globalPartnerData} />
          </motion.div>
        )}
        {currentPage === "profile" && (
          <motion.div key="profile" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}>
            <Profile user={user} globalUserData={globalUserData} globalPartnerData={globalPartnerData} />
          </motion.div>
        )}
      </AnimatePresence>
      {currentPage !== "logMeal" && <NavBar currentPage={currentPage} setCurrentPage={setCurrentPage} />}
    </div>
  );
}

export default App;