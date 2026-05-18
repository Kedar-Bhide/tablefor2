import React from "react";
import { auth, provider } from "../firebase";
import { signInWithPopup } from "firebase/auth";
import { motion } from "framer-motion";
import { Camera, UtensilsCrossed, Users, BarChart3, Target, Gift } from "lucide-react";

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
      icon: Camera,
      color: "#FFF9C4"
    },
    {
      title: "Cuisine-Aware AI",
      description: "Our engine understands regional dishes and niche ingredients for precise tracking.",
      icon: UtensilsCrossed,
      color: "#FFF4E5"
    },
    {
      title: "Better Together",
      description: "Track your journey solo or sync with a partner to stay motivated and healthy as a pair.",
      icon: Users,
      color: "#FFEAEA"
    },
    {
      title: "Insights & Trends",
      description: "Beautiful weekly charts and detailed statistics that make your nutrition patterns crystal clear.",
      icon: BarChart3,
      color: "#E8F5E9"
    },
    {
      title: "Goal Driven",
      description: "Personalized weight goals and macro targets that adapt to your body and your progress.",
      icon: Target,
      color: "#E3F2FD"
    },
    {
      title: "Fun Rewards",
      description: "Celebrate your consistency with personal milestones and rewards that feel like a fun gift to yourself.",
      icon: Gift,
      color: "#F3E5F5"
    }
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.3 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", bounce: 0.4 } }
  };

  return (
    <div style={styles.container}>
      {/* Hero Section */}
      <motion.div 
        style={styles.hero}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <h1 style={styles.brand}>TableFor2</h1>
        <p style={styles.subtitle}>Share your meals, conquer your goals.</p>

        <motion.button 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={styles.loginBtn} 
          onClick={handleLogin}
        >
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="Google"
            style={styles.googleIcon}
          />
          Sign in with Google
        </motion.button>
      </motion.div>

      {/* Feature Grid */}
      <motion.div 
        style={styles.featureGrid}
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {features.map((f, i) => {
          const Icon = f.icon;
          return (
            <motion.div key={i} style={styles.card} variants={itemVariants} whileHover={{ y: -5, boxShadow: "var(--shadow-xl)" }}>
              <div style={{ ...styles.iconCircle, backgroundColor: f.color }}>
                <Icon size={24} color="#333" strokeWidth={1.5} />
              </div>
              <h3 style={styles.cardTitle}>{f.title}</h3>
              <p style={styles.cardText}>{f.description}</p>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    backgroundColor: "var(--bg-color)",
    padding: "2rem 1.5rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  hero: {
    textAlign: "center",
    marginTop: "6rem",
    marginBottom: "4rem",
    maxWidth: "600px",
  },
  brand: {
    fontSize: "4rem",
    fontFamily: "'Instrument Serif', serif",
    color: "var(--text-primary)",
    margin: "0 0 1rem 0",
    letterSpacing: "-0.02em",
  },
  subtitle: {
    fontSize: "1.25rem",
    color: "var(--text-secondary)",
    margin: "0 0 2.5rem 0",
    lineHeight: "1.6",
    fontFamily: "'Outfit', sans-serif",
  },
  loginBtn: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "1rem 2rem",
    fontSize: "1.1rem",
    fontWeight: "600",
    backgroundColor: "var(--surface)",
    color: "var(--text-primary)",
    border: "1px solid rgba(0,0,0,0.05)",
    borderRadius: "var(--radius-full)",
    cursor: "pointer",
    boxShadow: "var(--shadow-md)",
    margin: "0 auto",
  },
  googleIcon: {
    width: "20px",
    height: "20px",
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
    backgroundColor: "var(--surface)",
    padding: "2rem",
    borderRadius: "var(--radius-xl)",
    border: "1px solid rgba(0,0,0,0.03)",
    boxShadow: "var(--shadow-sm)",
  },
  iconCircle: {
    width: "56px",
    height: "56px",
    borderRadius: "var(--radius-lg)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "1.5rem",
  },
  cardTitle: {
    fontSize: "1.25rem",
    color: "var(--text-primary)",
    margin: "0 0 0.75rem 0",
    fontWeight: "700",
  },
  cardText: {
    fontSize: "0.95rem",
    color: "var(--text-secondary)",
    lineHeight: "1.6",
    margin: 0,
  }
};

export default LandingPage;
