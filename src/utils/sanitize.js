// src/utils/sanitize.js
/**
 * Input sanitization utilities to prevent XSS and injection attacks.
 * All user-generated content should be sanitized before display or storage.
 */

class SanitizeUtils {
  /**
   * Escape HTML entities to prevent XSS
   * @param {string} str - The string to escape
   * @returns {string} escaped string safe for HTML display
   */
  static escapeHtml(str) {
    if (!str || typeof str !== 'string') return str;

    const htmlEntities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;',
      '`': '&#96;',
    };

    return str.replace(/[&<>"'`/]/g, (char) => htmlEntities[char]);
  }

  /**
   * Sanitize text input for storage
   * Removes potentially dangerous characters while preserving readability
   * @param {string} text - The text to sanitize
   * @param {Object} options - Sanitization options
   * @returns {string} sanitized text
   */
  static sanitizeText(text, options = {}) {
    if (!text || typeof text !== 'string') return text;

    const {
      maxLength = 1000,
      allowLineBreaks = true,
      trim = true,
    } = options;

    let sanitized = text;

    // Trim whitespace
    if (trim) {
      sanitized = sanitized.trim();
    }

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');

    // Remove control characters (except newlines and tabs)
    // eslint-disable-next-line no-control-regex
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Limit length
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }

    // Optionally remove line breaks
    if (!allowLineBreaks) {
      sanitized = sanitized.replace(/[\r\n]/g, ' ');
    }

    return sanitized;
  }

  /**
   * Sanitize meal name
   * @param {string} name - The meal name to sanitize
   * @returns {string} sanitized meal name
   */
  static sanitizeMealName(name) {
    if (!name || typeof name !== 'string') return name;

    let sanitized = this.sanitizeText(name, { maxLength: 200, allowLineBreaks: false });
    
    // Remove any script tags
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    return sanitized;
  }

  /**
   * Sanitize comment text
   * @param {string} comment - The comment to sanitize
   * @returns {string} sanitized comment
   */
  static sanitizeComment(comment) {
    if (!comment || typeof comment !== 'string') return comment;

    let sanitized = this.sanitizeText(comment, { maxLength: 500, allowLineBreaks: true });
    
    // Remove script tags
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    return sanitized;
  }

  /**
   * Sanitize ingredients text
   * @param {string} ingredients - The ingredients text to sanitize
   * @returns {string} sanitized ingredients
   */
  static sanitizeIngredients(ingredients) {
    if (!ingredients || typeof ingredients !== 'string') return ingredients;

    let sanitized = this.sanitizeText(ingredients, { maxLength: 1000, allowLineBreaks: true });
    
    // Remove script tags
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    return sanitized;
  }

  /**
   * Sanitize portion size
   * @param {string} portion - The portion size to sanitize
   * @returns {string} sanitized portion
   */
  static sanitizePortion(portion) {
    if (!portion || typeof portion !== 'string') return portion;

    return this.sanitizeText(portion, { maxLength: 100, allowLineBreaks: false });
  }

  /**
   * Sanitize email address
   * @param {string} email - The email to sanitize
   * @returns {string} sanitized email
   */
  static sanitizeEmail(email) {
    if (!email || typeof email !== 'string') return email;

    // Basic email sanitization - trim, lowercase, remove dangerous chars
    let sanitized = email.trim().toLowerCase();
    
    // Remove any HTML
    sanitized = this.escapeHtml(sanitized);
    
    return sanitized;
  }

  /**
   * Sanitize display name
   * @param {string} name - The name to sanitize
   * @returns {string} sanitized name
   */
  static sanitizeDisplayName(name) {
    if (!name || typeof name !== 'string') return name;

    let sanitized = this.sanitizeText(name, { maxLength: 50, allowLineBreaks: false });
    
    // Remove any HTML
    sanitized = this.escapeHtml(sanitized);
    
    return sanitized;
  }

  /**
   * Validate and sanitize reaction emoji
   * Only allow specific emoji characters
   * @param {string} emoji - The emoji reaction
   * @returns {string|null} sanitized emoji or null if invalid
   */
  static sanitizeReaction(emoji) {
    if (!emoji || typeof emoji !== 'string') return null;

    // Only allow single emoji characters (basic validation)
    // This is a simple check - for production, consider using a proper emoji library
    const emojiRegex = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]$/u;
    
    if (emojiRegex.test(emoji)) {
      return emoji;
    }
    
    // Allow some common text reactions
    const allowedReactions = ['❤️', '😂', '🔥', '👍', '💪', '🎉'];
    if (allowedReactions.includes(emoji)) {
      return emoji;
    }
    
    return null;
  }

  /**
   * Sanitize URL (for photo URLs, etc.)
   * @param {string} url - The URL to sanitize
   * @returns {string} sanitized URL
   */
  static sanitizeUrl(url) {
    if (!url || typeof url !== 'string') return url;

    let sanitized = url.trim();
    
    // Remove any HTML
    sanitized = this.escapeHtml(sanitized);
    
    // Only allow http/https URLs
    if (!sanitized.match(/^https?:\/\//i)) {
      return '';
    }
    
    return sanitized;
  }

  /**
   * Sanitize an object's string properties recursively
   * @param {Object} obj - The object to sanitize
   * @param {Array} stringFields - Array of field names to sanitize
   * @returns {Object} sanitized object
   */
  static sanitizeObject(obj, stringFields = []) {
    if (!obj || typeof obj !== 'object') return obj;

    const sanitized = { ...obj };

    for (const field of stringFields) {
      if (typeof sanitized[field] === 'string') {
        sanitized[field] = this.sanitizeText(sanitized[field]);
      }
    }

    return sanitized;
  }
}

export default SanitizeUtils;
