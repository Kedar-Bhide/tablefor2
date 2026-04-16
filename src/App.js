import React, { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, getDoc, onSnapshot } from "firebase/firestore";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import NavBar from "./components/NavBar";
import Today from "./pages/Today";
import LogMeal from "./pages/LogMeal";
import Weekly from "./pages/Weekly";
import Gallery from "./pages/Gallery";
import { requestNotificationPermission } from "./utils/requestNotificationPermission";
import { getCurrentTimezone } from "./utils/dateTime";

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
          await setDoc(userRef, {
            name: currentUser.displayName,
            email: currentUser.email,
            photoURL: currentUser.photoURL,
            createdAt: now,
            timezone: timezone || null,
            utcOffsetMinutes,
            utcOffset: utcOffsetMinutes / 60,
          });
        } else {
          await setDoc(
            userRef,
            {
              timezone: timezone || null,
              utcOffsetMinutes,
              utcOffset: utcOffsetMinutes / 60,
            },
            { merge: true }
          );
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
        setGlobalUserData({ uid: user.uid, ...docSnap.data() });
      } else {
        setGlobalUserData(null);
      }
    });
    return () => unsub();
  }, [user]);

  // Global Partner Data Listener
  useEffect(() => {
    const partnerUid = globalUserData?.partnerUid;
    if (!partnerUid) {
      setGlobalPartnerData(null);
      return;
    }
    const unsub = onSnapshot(doc(db, "users", partnerUid), (docSnap) => {
      if (docSnap.exists()) {
        setGlobalPartnerData({ uid: partnerUid, ...docSnap.data() });
      } else {
        setGlobalPartnerData(null);
      }
    });
    return () => unsub();
  }, [globalUserData?.partnerUid]);


  if (loading) return <p style={{ textAlign: "center", marginTop: "2rem" }}>Loading...</p>;

  if (!user) return <Login />;

  return (
    <div style={{ paddingBottom: "70px" }}>
      {currentPage === "today" && <Today setCurrentPage={setCurrentPage} globalUserData={globalUserData} globalPartnerData={globalPartnerData} />}
      {currentPage === "logMeal" && <LogMeal setCurrentPage={setCurrentPage} partnerUid={globalUserData?.partnerUid} />}
      {currentPage === "weekly" && <Weekly setCurrentPage={setCurrentPage} setGalleryDate={setGalleryDate} setGalleryFilter={setGalleryFilter} globalUserData={globalUserData} globalPartnerData={globalPartnerData} />}
      {currentPage === "gallery" && <Gallery galleryDate={galleryDate} setGalleryDate={setGalleryDate} galleryFilter={galleryFilter} globalUserData={globalUserData} globalPartnerData={globalPartnerData} />}
      {currentPage === "profile" && <Profile user={user} globalUserData={globalUserData} globalPartnerData={globalPartnerData} />}
      {currentPage !== "logMeal" && <NavBar currentPage={currentPage} setCurrentPage={setCurrentPage} />}
    </div>
  );
}

export default App;