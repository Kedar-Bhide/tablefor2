import React from "react";
import { auth, provider } from "../firebase";
import { signInWithPopup } from "firebase/auth";
import { motion } from "framer-motion";

function LandingPage() {
  const handleLogin = () => {
    signInWithPopup(auth, provider).catch((error) => {
      console.error("Login error:", error);
    });
  };

  const features = [
    {
      emoji: "\uD83C\uDFA4",
      title: "Voice Logging",
      paragraphs: [
        "Describe what you ate out loud — our AI parses it into meal name, ingredients, and portion size in seconds. No typing required.",
        "Pair it with ingredient and portion notes for better nutritional estimates. The more context you give, the sharper the result.",
      ],
    },
    {
      emoji: "\uD83E\uDD57",
      title: "AI That Knows Food",
      paragraphs: [
        "Built for real eating — homemade recipes, restaurant dishes, street food, and packaged goods across every cuisine.",
        "Ingredients and portion descriptions give the engine the context it needs. Every estimate is a best guess based on what you tell it.",
      ],
    },
    {
      emoji: "\uD83E\uDD17",
      title: "Partner Sync",
      paragraphs: [
        "Share a meal with your partner and they get a task to add their portion. React with emojis, leave comments, and keep each other going.",
        "Works just as well solo. The whole app adapts whether you're synced or flying alone.",
      ],
    },
    {
      emoji: "\uD83C\uDFA8",
      title: "Habit Spectrum",
      paragraphs: [
        "Each meal is classified into habit categories — Strength, Fuel, Balanced, Fiber Hero, Lean Choice — based on its macronutrient profile.",
        "A weekly canvas visualizes your eating patterns. Tap any day to see what drove each category. (More insights coming soon.)",
      ],
    },
    {
      emoji: "\uD83C\uDFAF",
      title: "Macro & Weight Goals",
      paragraphs: [
        "Set daily targets for calories, protein, carbs, fat, and fiber. AI can calculate them from your age, height, weight, and goal.",
        "Real-time progress shows how much you've eaten, what's left, and when you've gone over.",
      ],
    },
    {
      emoji: "\uD83C\uDFC6",
      title: "Streaks & Badges",
      paragraphs: [
        "Personal streaks for consistent logging days. Couple streaks when both partners stay on track. Eight badges to earn for hitting real milestones.",
      ],
    },
    {
      emoji: "\uD83D\uDCCA",
      title: "Monthly Insights",
      paragraphs: [
        "Each month, AI synthesizes your logged data into a short, personal reflection — referencing actual numbers, patterns, and habits from your month.",
        "Bi-weekly weight check-ins generate insight text that connects weight trends to your eating patterns.",
      ],
    },
    {
      emoji: "\uD83D\uDCC8",
      title: "Trends",
      paragraphs: [
        "A color-coded monthly calendar shows logging density for you and your partner. Donut charts compare your meal type split side by side. Weekly macro tables surface patterns at a glance.",
      ],
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.3 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", bounce: 0.3 } },
  };

  return (
    <div style={styles.container}>
      <motion.div
        style={styles.hero}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <h1 style={styles.brand}>TableFor2</h1>
        <p style={styles.subtitle}>
          Log meals. Spot patterns. Stay in sync.
        </p>

        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
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

      <motion.div
        style={styles.featureList}
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {features.map((f, i) => (
          <motion.div key={i} style={styles.featureBlock} variants={itemVariants}>
            <div style={styles.featureHeader}>
              <span style={styles.featureEmoji}>{f.emoji}</span>
              <h2 style={styles.featureTitle}>{f.title}</h2>
            </div>
            {f.paragraphs.map((p, j) => (
              <p key={j} style={styles.featureText}>{p}</p>
            ))}
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        style={styles.disclaimer}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.6 }}
      >
        <p style={styles.disclaimerText}>
          Any nutritional estimates and insights are AI-generated. They are suggestions, not medical advice.
        </p>
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
    marginTop: "5rem",
    marginBottom: "4rem",
    maxWidth: "480px",
  },
  brand: {
    fontSize: "4rem",
    fontFamily: "'Instrument Serif', serif",
    color: "var(--text-primary)",
    margin: "0 0 0.75rem 0",
    letterSpacing: "-0.03em",
    lineHeight: 1.1,
  },

  subtitle: {
    fontSize: "1.05rem",
    color: "var(--text-secondary)",
    margin: "0 0 2.5rem 0",
    lineHeight: 1.6,
    fontFamily: "'Outfit', sans-serif",
    letterSpacing: "0.01em",
  },
  loginBtn: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "0.85rem 1.75rem",
    fontSize: "1rem",
    fontWeight: "600",
    backgroundColor: "var(--surface)",
    color: "var(--text-primary)",
    border: "1px solid rgba(0,0,0,0.06)",
    borderRadius: "var(--radius-full)",
    cursor: "pointer",
    boxShadow: "var(--shadow-md)",
    margin: "0 auto",
  },
  googleIcon: {
    width: "18px",
    height: "18px",
  },
  featureList: {
    width: "100%",
    maxWidth: "640px",
    paddingBottom: "3rem",
  },
  featureBlock: {
    marginBottom: "2.5rem",
  },
  featureHeader: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "0.75rem",
  },
  featureEmoji: {
    fontSize: "1.5rem",
    lineHeight: 1,
    width: "32px",
    textAlign: "center",
    flexShrink: 0,
  },
  featureTitle: {
    fontSize: "1.2rem",
    fontWeight: "700",
    color: "var(--text-primary)",
    margin: 0,
    lineHeight: 1.4,
  },
  featureText: {
    fontSize: "0.95rem",
    color: "var(--text-secondary)",
    lineHeight: 1.7,
    margin: "0 0 0.5rem 0",
    paddingLeft: "42px",
  },
  disclaimer: {
    maxWidth: "520px",
    padding: "1.5rem 0 4rem",
    textAlign: "center",
  },
  disclaimerText: {
    fontSize: "0.8rem",
    color: "var(--text-tertiary, #999)",
    lineHeight: 1.5,
    margin: 0,
  },
};

export default LandingPage;
