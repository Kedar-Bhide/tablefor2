import React from "react";
import { Utensils, BarChart2, Image as ImageIcon, User } from "lucide-react";
import { motion } from "framer-motion";

function NavBar({ currentPage, setCurrentPage }) {
  const tabs = [
    { id: "today", label: "Today", icon: Utensils },
    { id: "weekly", label: "Stats", icon: BarChart2 },
    { id: "gallery", label: "Gallery", icon: ImageIcon },
    { id: "profile", label: "Profile", icon: User },
  ];

  return (
    <div style={styles.container} className="glass">
      <div style={styles.navInner}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentPage === tab.id;
          
          return (
            <button
              key={tab.id}
              style={{
                ...styles.tab,
                color: isActive ? "var(--primary)" : "var(--text-tertiary)",
              }}
              onClick={() => setCurrentPage(tab.id)}
            >
              <div style={styles.iconWrapper}>
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                {isActive && (
                  <motion.div
                    layoutId="activeTabIndicator"
                    style={styles.activeIndicator}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </div>
              <span style={{
                ...styles.label,
                fontWeight: isActive ? "600" : "500",
                color: isActive ? "var(--text-primary)" : "var(--text-tertiary)"
              }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingBottom: "env(safe-area-inset-bottom, 16px)",
  },
  navInner: {
    display: "flex",
    maxWidth: "500px",
    margin: "0 auto",
    padding: "0.5rem 1rem",
  },
  tab: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0.5rem",
    backgroundColor: "transparent",
    border: "none",
    cursor: "pointer",
    position: "relative",
  },
  iconWrapper: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "48px",
    height: "32px",
    marginBottom: "4px",
  },
  activeIndicator: {
    position: "absolute",
    top: "-4px",
    bottom: "-4px",
    left: "0",
    right: "0",
    backgroundColor: "rgba(255, 107, 107, 0.12)",
    borderRadius: "16px",
    zIndex: -1,
  },
  label: {
    fontSize: "0.7rem",
    letterSpacing: "0.02em",
  },
};

export default NavBar;