// src/services/api.js
import { storage, db, doc, collection, addDoc, updateDoc, serverTimestamp, ref, uploadBytes, getDownloadURL } from '../firebase';

class ApiService {
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

  static validateMealData(mealData) {
    const errors = [];
    
    if (!mealData.name || mealData.name.trim().length < 2) {
      errors.push('Meal name must be at least 2 characters');
    }
    
    if (mealData.name && mealData.name.trim().length > 200) {
      errors.push('Meal name must be under 200 characters');
    }
    
    if (!mealData.type) {
      errors.push('Meal type is required');
    }
    
    if (mealData.ingredients && mealData.ingredients.length > 1000) {
      errors.push('Ingredients must be under 1000 characters');
    }
    
    if (mealData.portionSize && mealData.portionSize.length > 200) {
      errors.push('Portion size must be under 200 characters');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export default ApiService;
