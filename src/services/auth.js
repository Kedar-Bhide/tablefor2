// src/services/auth.js
import { auth, provider } from '../firebase';
import { 
  signInWithPopup, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  signOut
} from 'firebase/auth';

class AuthService {
  // Sign in with Google
  static async signInWithGoogle() {
    try {
      const result = await signInWithPopup(auth, provider);
      return {
        user: result.user,
        success: true
      };
    } catch (error) {
      console.error('Google sign-in error:', error);
      return {
        success: false,
        error: error.message || 'Google sign-in failed'
      };
    }
  }

  // Sign in with email and password
  static async signInWithEmail(email, password) {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      return {
        user: result.user,
        success: true
      };
    } catch (error) {
      console.error('Email sign-in error:', error);
      return {
        success: false,
        error: error.message || 'Email sign-in failed'
      };
    }
  }

  // Sign up with email and password
  static async signUpWithEmail(email, password, displayName) {
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(result.user, { displayName });
      return {
        user: result.user,
        success: true
      };
    } catch (error) {
      console.error('Email sign-up error:', error);
      return {
        success: false,
        error: error.message || 'Email sign-up failed'
      };
    }
  }

  // Send password reset email
  static async sendPasswordReset(email) {
    try {
      await sendPasswordResetEmail(auth, email);
      return {
        success: true,
        message: 'Password reset email sent'
      };
    } catch (error) {
      console.error('Password reset error:', error);
      return {
        success: false,
        error: error.message || 'Password reset failed'
      };
    }
  }

  // Sign out
  static async signOut() {
    try {
      await signOut(auth);
      return {
        success: true,
        message: 'Signed out successfully'
      };
    } catch (error) {
      console.error('Sign-out error:', error);
      return {
        success: false,
        error: error.message || 'Sign-out failed'
      };
    }
  }

  // Get current auth state
  static onAuthStateChange(callback) {
    return onAuthStateChanged(auth, callback);
  }

  // Validate auth data
  static validateAuthData(email, password, displayName = null) {
    const errors = [];
    
    if (!email) {
      errors.push('Email is required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push('Please enter a valid email address');
    }
    
    if (!password) {
      errors.push('Password is required');
    } else if (password.length < 6) {
      errors.push('Password must be at least 6 characters');
    }
    
    if (displayName && displayName.trim().length < 2) {
      errors.push('Display name must be at least 2 characters');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Check if auth is supported (for browser compatibility)
  static isAuthSupported() {
    return typeof window !== 'undefined' && 
           'onbeforeunload' in window && 
           typeof window.SpeechRecognition !== 'undefined';
  }

  // Handle auth errors
  static getAuthErrorMessage(errorCode) {
    const errorMessages = {
      'auth/user-not-found': 'No user found with this email',
      'auth/wrong-password': 'Incorrect password',
      'auth/email-already-in-use': 'Email already in use',
      'auth/weak-password': 'Password is too weak',
      'auth/invalid-email': 'Invalid email address',
      'auth/operation-not-allowed': 'Operation not allowed',
      'auth/too-many-requests': 'Too many attempts, please try again later',
      'auth/user-disabled': 'Account has been disabled'
    };
    
    return errorMessages[errorCode] || 'Authentication failed. Please try again.';
  }
}

export default AuthService;
