import React, { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db, auth } from "../firebase";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Users, TrendingUp, Target } from "lucide-react";

function OnboardingPopup({ onDismiss }) {
  const [saving, setSaving] = useState(false);
  const [show, setShow] = useState(true);

  const handleDismiss = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const user = auth.currentUser;
      if (user) {
        await updateDoc(doc(db, "users", user.uid), {
          onboardingDismissed: true
        });
      }
    } catch (e) {
      console.error("Failed to dismiss onboarding", e);
    }
    setShow(false);
    setTimeout(() => {
      onDismiss();
    }, 300); // Wait for exit animation
  };

  const features = [
    { icon: <Camera size={24} color="#ffb347" />, title: "Log meals", desc: "Snap a photo of your food" },
    { icon: <Users size={24} color="#ff6b6b" />, title: "Stay in sync", desc: "Link with your partner" },
    { icon: <TrendingUp size={24} color="#7ec8a4" />, title: "Track progress", desc: "Streaks & macros weekly" },
    { icon: <Target size={24} color="#a78bfa" />, title: "Reach your goals", desc: "Personalized AI insights" }
  ];

  return (
    <AnimatePresence>
      {show && (
        <motion.div 
          style={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div 
            style={styles.popup}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: "spring", bounce: 0.4 }}
          >
            <h2 style={styles.title}>Welcome to TableFor2! <span style={{fontSize: "1.2rem"}}>🍽️</span></h2>
        <p style={styles.subtitle}>Here is what you can do:</p>
        
          <div style={styles.grid}>
            {features.map((f, i) => (
              <div key={i} style={styles.card}>
                <span style={styles.emoji}>{f.icon}</span>
              <p style={styles.cardTitle}>{f.title}</p>
              <p style={styles.cardDesc}>{f.desc}</p>
            </div>
          ))}
        </div>

            <p style={styles.hint}>
              💡 Head to <strong>Profile</strong> to link with your partner and unlock Couple Mode!
            </p>

            <button 
              style={styles.button}
              onClick={handleDismiss}
              disabled={saving}
            >
              Let's go! 🚀
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 200,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1rem",
  },
  popup: {
    backgroundColor: "#fff",
    borderRadius: "20px",
    padding: "2rem 1.5rem",
    width: "100%",
    maxWidth: "350px",
    boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
    transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)", // spring
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  title: {
    fontSize: "1.5rem",
    color: "#333",
    margin: "0 0 0.5rem 0",
    textAlign: "center",
  },
  subtitle: {
    fontSize: "0.95rem",
    color: "#666",
    margin: "0 0 1.5rem 0",
    textAlign: "center",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0.8rem",
    width: "100%",
    marginBottom: "1.5rem",
  },
  card: {
    backgroundColor: "#fffaf5",
    padding: "1rem",
    borderRadius: "12px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    border: "1px solid #ffefe0",
  },
  emoji: {
    fontSize: "1.8rem",
    marginBottom: "0.5rem",
  },
  cardTitle: {
    fontWeight: "bold",
    fontSize: "0.85rem",
    color: "#333",
    margin: "0 0 0.2rem 0",
  },
  cardDesc: {
    fontSize: "0.75rem",
    color: "#888",
    margin: 0,
    lineHeight: "1.2",
  },
  hint: {
    fontSize: "0.85rem",
    color: "#ff6b6b",
    textAlign: "center",
    backgroundColor: "#fff5f5",
    padding: "0.8rem",
    borderRadius: "8px",
    margin: "0 0 1.5rem 0",
    width: "100%",
    boxSizing: "border-box",
  },
  button: {
    width: "100%",
    padding: "1rem",
    backgroundColor: "#ff6b6b",
    color: "white",
    border: "none",
    borderRadius: "12px",
    fontSize: "1.1rem",
    fontWeight: "bold",
    cursor: "pointer",
  }
};

export default OnboardingPopup;
