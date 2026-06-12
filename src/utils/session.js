// src/utils/session.js
import { auth } from '../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';

/**
 * Session management utilities for secure session handling.
 * Handles session timeout, auto-logout, and secure session practices.
 */

class SessionManager {
  static #timeoutId = null;
  static #lastActivity = Date.now();
  static #isInitialized = false;
  static #onSessionExpired = null;

  // Default timeout: 30 minutes of inactivity
  static INACTIVITY_TIMEOUT = 30 * 60 * 1000;

  // Warning before timeout: 5 minutes
  static WARNING_BEFORE = 5 * 60 * 1000;

  /**
   * Initialize session manager
   * @param {Function} onSessionExpired - Callback when session expires
   * @param {number} timeout - Custom timeout in milliseconds
   */
  static initialize(onSessionExpired = null, timeout = null) {
    if (this.#isInitialized) return;

    this.#onSessionExpired = onSessionExpired;
    if (timeout) {
      this.#INACTIVITY_TIMEOUT = timeout;
    }

    // Track user activity
    this.#setupActivityTracking();

    // Start the inactivity timer
    this.#startInactivityTimer();

    this.#isInitialized = true;
  }

  /**
   * Setup activity tracking listeners
   */
  static #setupActivityTracking() {
    const activityEvents = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click',
    ];

    const updateActivity = () => {
      this.#lastActivity = Date.now();
    };

    activityEvents.forEach((event) => {
      document.addEventListener(event, updateActivity, { passive: true });
    });
  }

  /**
   * Start the inactivity timer
   */
  static #startInactivityTimer() {
    // Clear existing timer
    if (this.#timeoutId) {
      clearTimeout(this.#timeoutId);
    }

    // Set new timer
    this.#timeoutId = setTimeout(() => {
      this.#handleSessionExpired();
    }, this.#INACTIVITY_TIMEOUT);

    // Check periodically for inactivity
    setInterval(() => {
      const now = Date.now();
      const timeSinceActivity = now - this.#lastActivity;

      // Warn user before timeout
      if (
        timeSinceActivity >= this.#INACTIVITY_TIMEOUT - this.WARNING_BEFORE &&
        timeSinceActivity < this.#INACTIVITY_TIMEOUT
      ) {
        // Could trigger a warning UI here if needed
        console.warn(
          `Session will expire in ${Math.ceil(
            (this.#INACTIVITY_TIMEOUT - timeSinceActivity) / 60000
          )} minutes due to inactivity`
        );
      }

      // Auto-logout on timeout
      if (timeSinceActivity >= this.#INACTIVITY_TIMEOUT) {
        this.#handleSessionExpired();
      }
    }, 60000); // Check every minute
  }

  /**
   * Handle session expiration
   */
  static async #handleSessionExpired() {
    console.warn('Session expired due to inactivity');

    // Clear the timer
    if (this.#timeoutId) {
      clearTimeout(this.#timeoutId);
      this.#timeoutId = null;
    }

    // Sign out the user
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error during session expiration sign-out:', error);
    }

    // Call the callback if provided
    if (this.#onSessionExpired) {
      this.#onSessionExpired();
    }
  }

  /**
   * Reset the activity timer (call after important user actions)
   */
  static resetActivity() {
    this.#lastActivity = Date.now();
  }

  /**
   * Get time until session expires
   * @returns {number} milliseconds until expiration
   */
  static getTimeUntilExpiration() {
    const timeSinceActivity = Date.now() - this.#lastActivity;
    return Math.max(0, this.#INACTIVITY_TIMEOUT - timeSinceActivity);
  }

  /**
   * Check if session is about to expire
   * @returns {boolean} true if session will expire within warning period
   */
  static isSessionExpiringSoon() {
    return this.getTimeUntilExpiration() <= this.WARNING_BEFORE;
  }

  /**
   * Manually extend the session
   */
  static extendSession() {
    this.resetActivity();
  }

  /**
   * Cleanup session manager
   */
  static cleanup() {
    if (this.#timeoutId) {
      clearTimeout(this.#timeoutId);
      this.#timeoutId = null;
    }
    this.#isInitialized = false;
  }

  /**
   * Secure storage utilities for sensitive data
   */
  static secureStorage = {
    /**
     * Store data with expiration
     * @param {string} key - Storage key
     * @param {*} value - Value to store
     * @param {number} expirationMs - Expiration time in milliseconds
     */
    set(key, value, expirationMs) {
      const item = {
        value,
        expiry: Date.now() + expirationMs,
      };
      localStorage.setItem(key, JSON.stringify(item));
    },

    /**
     * Get data with expiration check
     * @param {string} key - Storage key
     * @returns {*} stored value or null if expired
     */
    get(key) {
      const itemStr = localStorage.getItem(key);
      if (!itemStr) return null;

      try {
        const item = JSON.parse(itemStr);
        if (Date.now() > item.expiry) {
          localStorage.removeItem(key);
          return null;
        }
        return item.value;
      } catch {
        localStorage.removeItem(key);
        return null;
      }
    },

    /**
     * Remove stored data
     * @param {string} key - Storage key
     */
    remove(key) {
      localStorage.removeItem(key);
    },

    /**
     * Clear all stored data
     */
    clear() {
      localStorage.clear();
    },
  };
}

export default SessionManager;
