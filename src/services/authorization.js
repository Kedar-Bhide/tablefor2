// src/services/authorization.js
import { auth } from '../firebase';

/**
 * Authorization service for verifying data ownership and access permissions.
 * All checks are client-side guards - Firestore rules are the primary defense.
 */

class AuthorizationService {
  /**
   * Get current authenticated user ID
   */
  static getCurrentUserId() {
    return auth.currentUser?.uid || null;
  }

  /**
   * Verify the current user owns a meal
   * @param {Object} meal - The meal object to check
   * @param {Object} userData - Current user's data (contains partnerUid)
   * @returns {Object} { isOwner, isPartner, hasAccess }
   */
  static verifyMealAccess(meal, userData) {
    const currentUserId = this.getCurrentUserId();
    if (!currentUserId || !meal) {
      return { isOwner: false, isPartner: false, hasAccess: false };
    }

    const isOwner = meal.uid === currentUserId;
    const isPartner = meal.uid === userData?.partnerUid;
    const hasAccess = isOwner || isPartner;

    return { isOwner, isPartner, hasAccess };
  }

  /**
   * Verify the current user can mutate a meal (delete, edit, update nutrition)
   * Only the meal owner should be able to perform these operations.
   * @param {Object} meal - The meal object to check
   * @returns {boolean} true if current user can mutate the meal
   */
  static canMutateMeal(meal) {
    const currentUserId = this.getCurrentUserId();
    if (!currentUserId || !meal) return false;

    // Only the owner can delete/edit/update nutrition
    return meal.uid === currentUserId;
  }

  /**
   * Verify the current user can react/comment on a meal
   * Both owner and partner can react/comment.
   * @param {Object} meal - The meal object to check
   * @param {Object} userData - Current user's data
   * @returns {boolean} true if current user can react/comment
   */
  static canInteractWithMeal(meal, userData) {
    const { hasAccess } = this.verifyMealAccess(meal, userData);
    return hasAccess;
  }

  /**
   * Verify the current user owns a user document
   * @param {string} userId - The user ID to check
   * @returns {boolean} true if current user owns the document
   */
  static ownsUserDocument(userId) {
    const currentUserId = this.getCurrentUserId();
    return currentUserId === userId;
  }

  /**
   * Verify the current user can access a user document
   * Users can access their own document or their partner's document.
   * @param {string} userId - The user ID to check
   * @param {Object} userData - Current user's data
   * @returns {boolean} true if current user can access the document
   */
  static canAccessUserDocument(userId, userData) {
    const currentUserId = this.getCurrentUserId();
    if (!currentUserId) return false;

    const isOwner = userId === currentUserId;
    const isPartner = userId === userData?.partnerUid;
    return isOwner || isPartner;
  }

  /**
   * Verify the current user can access a task
   * @param {Object} task - The task object to check
   * @returns {boolean} true if current user can access the task
   */
  static canAccessTask(task) {
    const currentUserId = this.getCurrentUserId();
    if (!currentUserId || !task) return false;

    // User can access tasks where they are the recipient (toUid) or sender (fromUid)
    return task.toUid === currentUserId || task.fromUid === currentUserId;
  }

  /**
   * Verify the current user can complete a task
   * Only the task recipient (toUid) can complete a task.
   * @param {Object} task - The task object to check
   * @returns {boolean} true if current user can complete the task
   */
  static canCompleteTask(task) {
    const currentUserId = this.getCurrentUserId();
    if (!currentUserId || !task) return false;

    return task.toUid === currentUserId;
  }

  /**
   * Verify partner relationship is valid
   * @param {Object} userData - Current user's data
   * @param {string} partnerId - The partner ID to verify
   * @returns {boolean} true if the partner relationship is valid
   */
  static verifyPartnerRelationship(userData, partnerId) {
    if (!userData || !partnerId) return false;

    // Check if the claimed partner matches the user's stored partnerUid
    return userData.partnerUid === partnerId;
  }

  /**
   * Validate that a source meal belongs to the partner
   * @param {Object} sourceMeal - The source meal to validate
   * @param {Object} userData - Current user's data
   * @returns {boolean} true if source meal belongs to partner
   */
  static validateSourceMealOwnership(sourceMeal, userData) {
    if (!sourceMeal || !userData?.partnerUid) return false;

    // Source meal should belong to the partner
    return sourceMeal.uid === userData.partnerUid;
  }

  /**
   * Guard function for meal mutations
   * Throws an error if the user is not authorized
   * @param {Object} meal - The meal to check
   * @throws {Error} if not authorized
   */
  static guardMealMutation(meal) {
    if (!this.canMutateMeal(meal)) {
      throw new Error('Unauthorized: You can only modify your own meals');
    }
  }

  /**
   * Guard function for meal access
   * Throws an error if the user is not authorized
   * @param {Object} meal - The meal to check
   * @param {Object} userData - Current user's data
   * @throws {Error} if not authorized
   */
  static guardMealAccess(meal, userData) {
    if (!this.canInteractWithMeal(meal, userData)) {
      throw new Error('Unauthorized: You do not have access to this meal');
    }
  }

  /**
   * Guard function for task completion
   * Throws an error if the user is not authorized
   * @param {Object} task - The task to check
   * @throws {Error} if not authorized
   */
  static guardTaskCompletion(task) {
    if (!this.canCompleteTask(task)) {
      throw new Error('Unauthorized: Only the task recipient can complete this task');
    }
  }
}

export default AuthorizationService;
