# Services Architecture

This document explains the new service-based architecture introduced in the application to improve separation of concerns and maintainability.

## Overview

The application has been refactored to use a service-oriented architecture with the following services:

1. **ApiService** - Handles all Firebase database operations
2. **AuthService** - Handles authentication operations
3. **Core Architecture Improvements**:
   - Separation of concerns between UI, business logic, and data access
   - Improved error handling and validation
   - Better reusability of business logic
   - Enhanced maintainability and testability

## Services

### ApiService (`src/services/api.js`)

Manages all Firebase operations including:

**Meal Operations:**
- `createMeal(mealData)` - Create new meals
- `getMeal(mealId)` - Get meal by ID
- `updateMeal(mealId, updateData)` - Update meal
- `deleteMeal(mealId)` - Delete meal
- `getUserMeals(userId, filters)` - Get user's meals with filters
- `subscribeToUserMeals(userId, callback, filters)` - Real-time subscription

**File Upload:**
- `uploadMealPhoto(file, mealId)` - Upload meal photos
- `deleteMealPhoto(photoURL)` - Delete photos

**User Operations:**
- `getUser(userId)` - Get user by ID
- `updateUser(userId, updateData)` - Update user

**Utilities:**
- `batchUpdate(meals)` - Batch operations
- `validateMealData(mealData)` - Input validation
- `handleApiError(error, context)` - Error handling

### AuthService (`src/services/auth.js`)

Manages all authentication operations:

**Authentication Methods:**
- `signInWithGoogle()` - Google sign-in
- `signInWithEmail(email, password)` - Email sign-in
- `signUpWithEmail(email, password, displayName)` - Email sign-up
- `sendPasswordReset(email)` - Password reset
- `signOut()` - Sign out

**Utilities:**
- `onAuthStateChange(callback)` - Auth state listener
- `validateAuthData(email, password, displayName)` - Auth validation
- `getAuthErrorMessage(errorCode)` - User-friendly error messages

## Usage Examples

### Using ApiService

```javascript
import ApiService from './services/api';

// Create a meal
const newMeal = await ApiService.createMeal({
  name: 'Grilled Chicken Salad',
  type: 'Lunch',
  photos: ['photo_url'],
  uid: 'user123'
});

// Get user's meals
const meals = await ApiService.getUserMeals('user123', {
  type: 'Lunch',
  startDate: new Date()
});

// Validate meal data
const validation = ApiService.validateMealData({
  name: 'Test Meal',
  type: 'Dinner',
  photos: true
});
```

### Using AuthService

```javascript
import AuthService from './services/auth';

// Sign in with Google
const result = await AuthService.signInWithGoogle();
if (result.success) {
  // User signed in successfully
} else {
  console.error(result.error);
}

// Sign in with email
const result = await AuthService.signInWithEmail('user@example.com', 'password');

// Validate auth data
const validation = AuthService.validateAuthData(
  'user@example.com',
  'password',
  'John Doe'
);
```

## Benefits

### 1. Improved Maintainability
- Clear separation of concerns
- Easier to modify individual components
- Reduced code duplication
- Better organized code structure

### 2. Enhanced Testability
- Services can be unit tested independently
- Easier to mock dependencies
- Better isolation of business logic

### 3. Better Error Handling
- Centralized error handling
- Consistent error messages
- Detailed error context

### 4. Validation and Security
- Input validation at service level
- Better error recovery
- Reduced risk of invalid data

### 5. Reusability
- Services can be reused across components
- Easier to add new features
- Consistent API across the application

## Migration Path

For existing code, you can gradually migrate from direct Firebase calls to using the services:

**Before:**
```javascript
import { auth, db } from './firebase';

const mealRef = await addDoc(collection(db, 'meals'), mealData);
```

**After:**
```javascript
import ApiService from './services/api';

const meal = await ApiService.createMeal(mealData);
```

## Files Modified

1. **`src/services/api.js`** - New API service
2. **`src/services/auth.js`** - New Auth service
3. **`src/pages/LogMeal.js`** - Refactored to use ApiService
4. **`src/pages/Profile.js`** - Refactored to use ApiService
5. **`src/App.js`** - Refactored to use AuthService

## Testing

Each service includes comprehensive error handling and validation:
- Input validation for all operations
- Error catching and reporting
- User-friendly error messages
- Graceful degradation on failures

## Future Enhancements

The service architecture allows for easy future enhancements:

1. **Caching Layer** - Add caching for frequent API calls
2. **Offline Support** - Add IndexedDB for offline functionality
3. **API Gateway** - Centralize API endpoints
4. **Monitoring** - Add request tracking and analytics
5. **Middleware** - Add authentication and authorization middleware

## Conclusion

This service-based architecture provides a solid foundation for building scalable, maintainable, and testable applications. It follows best practices for separation of concerns and makes the codebase more approachable for new developers while maintaining all existing functionality.