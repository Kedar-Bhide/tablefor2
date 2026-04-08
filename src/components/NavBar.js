import React from "react";

function NavBar({ currentPage, setCurrentPage }) {
  const tabs = [
    { id: "today", label: "Today", icon: "🍽️" },
    { id: "weekly", label: "Stats", icon: "📊" },
    { id: "gallery", label: "Gallery", icon: "🖼️" },
    { id: "profile", label: "Profile", icon: "👤" },
  ];

  return (
    <div style={styles.container}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          style={{
            ...styles.tab,
            color: currentPage === tab.id ? "#ff6b6b" : "#aaa",
          }}
          onClick={() => setCurrentPage(tab.id)}
        >
          <span style={styles.icon}>{tab.icon}</span>
          <span style={styles.label}>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

const styles = {
  container: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    display: "flex",
    backgroundColor: "white",
    borderTop: "1px solid #eee",
    zIndex: 100,
  },
  tab: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0.6rem",
    backgroundColor: "transparent",
    border: "none",
    cursor: "pointer",
  },
  icon: {
    fontSize: "1.4rem",
  },
  label: {
    fontSize: "0.75rem",
    marginTop: "2px",
  },
};

export default NavBar;