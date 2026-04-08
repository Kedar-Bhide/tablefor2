import React from "react";
import { auth, provider } from "../firebase";
import { signInWithPopup } from "firebase/auth";

function Login() {
  const handleLogin = () => {
    signInWithPopup(auth, provider).catch((error) => {
      console.error("Login error:", error);
    });
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🍽️ TableFor2</h1>
      <p style={styles.subtitle}>Track your meals together</p>
      <button style={styles.button} onClick={handleLogin}>
        Sign in with Google
      </button>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    backgroundColor: "#fffaf5",
  },
  title: {
    fontSize: "2.5rem",
    marginBottom: "0.5rem",
    color: "#333",
  },
  subtitle: {
    fontSize: "1.1rem",
    color: "#888",
    marginBottom: "2rem",
  },
  button: {
    padding: "0.8rem 2rem",
    fontSize: "1rem",
    backgroundColor: "#ff6b6b",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
};

export default Login;