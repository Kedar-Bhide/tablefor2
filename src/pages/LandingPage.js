import React from "react";
import { auth, provider } from "../firebase";
import { signInWithPopup } from "firebase/auth";

function LandingPage() {
  const handleLogin = () => {
    signInWithPopup(auth, provider).catch((error) => {
      console.error("Login error:", error);
    });
  };

  const features = [
    {
      title: "Voice & Photo Logging",
      description: "Just speak or snap a photo. Our AI handles the rest, populating your meal info in seconds.",
      icon: "📸",
      color: "#FFF9C4"
    },
    {
      title: "Cuisine-Aware AI",
      description: "Our engine understands regional dishes and niche ingredients for precise tracking.",
      icon: "🍛",
      color: "#FFF4E5"
    },
    {
      title: "Better Together",
      description: "Track your journey solo or sync with a partner to stay motivated and healthy as a pair.",
      icon: "👥",
      color: "#FFEAEA"
    },
    {
      title: "Insights & Trends",
      description: "Beautiful weekly charts and detailed statistics that make your nutrition patterns crystal clear.",
      icon: "📊",
      color: "#E8F5E9"
    },
    {
      title: "Goal Driven",
      description: "Personalized weight goals and macro targets that adapt to your body and your progress.",
      icon: "🎯",
      color: "#E3F2FD"
    },
    {
      title: "Fun Rewards",
      description: "Celebrate your consistency with personal milestones and rewards that feel like a fun gift to yourself.",
      icon: "🎁",
      color: "#F3E5F5"
    }
  ];

  return (
    <div style={styles.container}>
      {/* Hero Section */}
      <div style={styles.hero}>
        <h1 style={styles.brand}>🍽️ TableFor2</h1>
        <p style={styles.subtitle}>Share your meals, conquer your goals.</p>

        <button style={styles.loginBtn} onClick={handleLogin}>
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="Google"
            style={styles.googleIcon}
          />
          Sign in with Google
        </button>
      </div>

      {/* Feature Grid */}
      <div style={styles.featureGrid}>
        {features.map((f, i) => (
          <div key={i} style={styles.card}>
            <div style={{ ...styles.iconCircle, backgroundColor: f.color }}>
              {f.icon}
            </div>
            <h3 style={styles.cardTitle}>{f.title}</h3>
            <p style={styles.cardText}>{f.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#fffaf5",
    padding: "2rem 1.5rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    fontFamily: "'Outfit', sans-serif",
  },
  hero: {
    textAlign: "center",
    marginTop: "4rem",
    marginBottom: "4rem",
    maxWidth: "600px",
  },
  brand: {
    fontSize: "3.5rem",
    fontFamily: "'Instrument Serif', serif",
    color: "#333",
    margin: "0 0 1rem 0",
    letterSpacing: "-0.02em",
  },
  subtitle: {
    fontSize: "1.25rem",
    color: "#666",
    margin: "0 0 2.5rem 0",
    lineHeight: "1.6",
  },
  loginBtn: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "0.8rem 1.5rem",
    fontSize: "1rem",
    fontWeight: "600",
    backgroundColor: "white",
    color: "#333",
    border: "1px solid #EAEAEA",
    borderRadius: "12px",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
    transition: "all 0.2s ease",
    margin: "0 auto",
  },
  googleIcon: {
    width: "18px",
    height: "18px",
  },
  featureGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "1.5rem",
    width: "100%",
    maxWidth: "1000px",
    padding: "0 1rem",
    paddingBottom: "4rem",
  },
  card: {
    backgroundColor: "white",
    padding: "2rem",
    borderRadius: "24px",
    border: "1px solid #EAEAEA",
    boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
    transition: "transform 0.2s ease",
  },
  iconCircle: {
    width: "50px",
    height: "50px",
    borderRadius: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.5rem",
    marginBottom: "1.5rem",
  },
  cardTitle: {
    fontSize: "1.25rem",
    color: "#333",
    margin: "0 0 0.75rem 0",
    fontWeight: "700",
  },
  cardText: {
    fontSize: "0.95rem",
    color: "#666",
    lineHeight: "1.6",
    margin: 0,
  }
};

export default LandingPage;
