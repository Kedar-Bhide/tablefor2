// src/services/api.js
import { storage, db, doc, collection, addDoc, updateDoc, deleteDoc, query, where, getDoc, getDocs, onSnapshot, writeBatch, orderBy, serverTimestamp, ref, uploadBytes, getDownloadURL, deleteObject } from '../firebase';

class ApiService {
  // Meal operations
  static async createMeal(mealData) {
    try {
      const mealRef = await addDoc(collection(db, 'meals'), {
        ...mealData,
        createdAt: serverTimestamp(),
      });
      return { id: mealRef.id, ...mealData };
    } catch (error) {
      console.error('Error creating meal:', error);
      throw new Error('Failed to create meal: ' + error.message);
    }
  }

  static async getMeal(mealId) {
    try {
      const mealDoc = await getDoc(doc(db, 'meals', mealId));
      if (!mealDoc.exists()) throw new Error('Meal not found');
      return { id: mealDoc.id, ...mealDoc.data() };
    } catch (error) {
      console.error('Error fetching meal:', error);
      throw new Error('Failed to fetch meal: ' + error.message);
    }
  }

  static async updateMeal(mealId, updateData) {
    try {
      const mealRef = doc(db, 'meals', mealId);
      await updateDoc(mealRef, {
        ...updateData,
        updatedAt: serverTimestamp()
      });
      return { id: mealId, ...updateData };
    } catch (error) {
      console.error('Error updating meal:', error);
      throw new Error('Failed to update meal: ' + error.message);
    }
  }

  static async deleteMeal(mealId) {
    try {
      await deleteDoc(doc(db, 'meals', mealId));
      return mealId;
    } catch (error) {
      console.error('Error deleting meal:', error);
      throw new Error('Failed to delete meal: ' + error.message);
    }
  }

  static async getUserMeals(userId, filters = {}) {
    try {
      let q = query(
        collection(db, 'meals'),
        where('uid', '==', userId)
      );
      
      if (filters.type) {
        q = query(q, where('type', '==', filters.type));
      }
      if (filters.startDate) {
        q = query(q, where('createdAt', '>=', filters.startDate));
      }
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error fetching user meals:', error);
      throw new Error('Failed to fetch meals: ' + error.message);
    }
  }

  // User operations
  static async getUser(userId) {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (!userDoc.exists()) throw new Error('User not found');
      return { id: userDoc.id, ...userDoc.data() };
    } catch (error) {
      console.error('Error fetching user:', error);
      throw new Error('Failed to fetch user: ' + error.message);
    }
  }

  static async updateUser(userId, updateData) {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        ...updateData,
        updatedAt: serverTimestamp()
      });
      return { id: userId, ...updateData };
    } catch (error) {
      console.error('Error updating user:', error);
      throw new Error('Failed to update user: ' + error.message);
    }
  }

  // File upload operations
  static async uploadMealPhoto(file, mealId) {
    try {
      const storageRef = ref(storage, `meals/${mealId}/photo_${Date.now()}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (error) {
      console.error('Error uploading photo:', error);
      throw new Error('Failed to upload photo: ' + error.message);
    }
  }

  static async deleteMealPhoto(photoURL) {
    try {
      const storageRef = ref(storage, photoURL);
      await deleteObject(storageRef);
      return photoURL;
    } catch (error) {
      console.error('Error deleting photo:', error);
      throw new Error('Failed to delete photo: ' + error.message);
    }
  }

  // Batch operations
  static async batchUpdate(meals) {
    try {
      const batch = writeBatch(db);
      meals.forEach(meal => {
        if (meal.id) {
          batch.update(doc(db, 'meals', meal.id), {
            ...meal,
            updatedAt: serverTimestamp()
          });
        }
      });
      await batch.commit();
      return meals.map(m => m.id);
    } catch (error) {
      console.error('Error batch update:', error);
      throw new Error('Failed batch update: ' + error.message);
    }
  }

  // Real-time listeners
  static subscribeToUserMeals(userId, callback, filters = {}) {
    try {
      let q = query(
        collection(db, 'meals'),
        where('uid', '==', userId),
        orderBy('createdAt', 'desc')
      );
      
      return onSnapshot(q, (snapshot) => {
        const meals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(meals);
      }, (error) => {
        console.error('Listener error:', error);
        callback([], error);
      });
    } catch (error) {
      console.error('Error setting up listener:', error);
      throw new Error('Failed to setup listener: ' + error.message);
    }
  }

  // Validation methods
  static validateMealData(mealData) {
    const errors = [];
    
    if (!mealData.name || mealData.name.trim().length < 2) {
      errors.push('Meal name must be at least 2 characters');
    }
    
    if (!mealData.type) {
      errors.push('Meal type is required');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Error handling
  static handleApiError(error, context = '') {
    console.error(`API Error ${context}:`, error);
    return {
      message: error.message || 'Unknown error',
      code: error.code || 'unknown',
      context
    };
  }
}

export default ApiService;
