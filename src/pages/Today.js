import React, { useEffect, useState, useMemo } from "react";
import { db, auth, storage } from "../firebase";
import { collection, query, where, onSnapshot, updateDoc, deleteDoc, doc, getDoc, getDocs, addDoc, deleteField } from "firebase/firestore";
import { compressImage } from "../utils/compressImage";
import { getFunctions, httpsCallable } from "firebase/functions";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getPhotos } from "../utils/getPhotos";
import { getLocalDateKeyInTz, getMealCreatedAtDate, getMealLocalDateKey } from "../utils/dateTime";
import { shouldShowWeightCheckIn } from "../utils/shouldShowWeightCheckIn";
import OnboardingPopup from "../components/OnboardingPopup";
import PhotoCarousel from "../components/PhotoCarousel";
import MealNutritionCard from "../components/MealNutritionCard";
import PartnerResponseCard from "../components/PartnerResponseCard";

function Today({ setCurrentPage, globalUserData, globalPartnerData }) {
  const user = auth.currentUser;
  const [meals, setMeals] = useState([]);
  const [rawRecentMeals, setRawRecentMeals] = useState([]);

  const partnerUid = globalPartnerData?.uid || null;
  const partnerPhoto = globalPartnerData?.photoURL || null;
  const partnerName = globalPartnerData?.name || null;

  const [selectedMeal, setSelectedMeal] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editType, setEditType] = useState("");
  const [editName, setEditName] = useState("");
  const [editPhotos, setEditPhotos] = useState([]);
  const [editPhotoPreviews, setEditPhotoPreviews] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showEditPhotoOptions, setShowEditPhotoOptions] = useState(false);
  const [reactionMeal, setReactionMeal] = useState(null);
  const [viewMeal, setViewMeal] = useState(null);
  const [comment, setComment] = useState("");
  const [savingComment, setSavingComment] = useState(false);
  const [nutrition, setNutrition] = useState({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });
  const [editIngredients, setEditIngredients] = useState("");
  const [editPortionSize, setEditPortionSize] = useState("");
  const [editCookType, setEditCookType] = useState("Homemade"); // Homemade, Restaurant, Packaged
  const [reanalyzing, setReanalyzing] = useState(false);
  const [retryingMealId, setRetryingMealId] = useState(null);

  const handleRetryAnalysis = async (mealId) => {
    setRetryingMealId(mealId);
    try {
      const functions = getFunctions();
      const retryFn = httpsCallable(functions, "retryAnalysis");
      await retryFn({ mealId });
      // The onSnapshot will update the local state when the document changes
    } catch (e) {
      console.error("Retry failed:", e);
    } finally {
      setRetryingMealId(null);
    }
  };

  const [myPhoto, setMyPhoto] = useState(user.photoURL);
  const [weightCheckIn, setWeightCheckIn] = useState(null);
  const [newWeight, setNewWeight] = useState("");
  const [weightCheckInSaving, setWeightCheckInSaving] = useState(false);
  const [insightBanner, setInsightBanner] = useState(null); // null | "generating" | "ready"
  const [weightInsight, setWeightInsight] = useState(null);
  const [monthlyInsight, setMonthlyInsight] = useState(null);
  const [pendingTasks, setPendingTasks] = useState([]);
  const [activeTask, setActiveTask] = useState(null);
  const [taskIngredients, setTaskIngredients] = useState("");
  const [taskPortionSize, setTaskPortionSize] = useState("");
  const [taskSaving, setTaskSaving] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [showUnlinkPopup, setShowUnlinkPopup] = useState(false);

  // Nutrient Goals
  const [nutrientGoals, setNutrientGoals] = useState(null); // { calories, protein_g, carbs_g, fat_g, fiber_g }
  const [goalSetupStep, setGoalSetupStep] = useState(null); // null | "choose" | "manual" | "profile" | "ai_generating"
  const [manualGoals, setManualGoals] = useState({ calories: "", protein_g: "", carbs_g: "", fat_g: "", fiber_g: "" });
  const [profileDraft, setProfileDraft] = useState({ age: "", gender: "", height_cm: "", weight_kg: "", target_weight_kg: "" });
  const [goalSaving, setGoalSaving] = useState(false);
  const [taskCalories, setTaskCalories] = useState("");
  const [taskProtein, setTaskProtein] = useState("");
  const [taskCarbs, setTaskCarbs] = useState("");
  const [taskFat, setTaskFat] = useState("");
  const [taskFiber, setTaskFiber] = useState("");
  const [taskSaveToFrequent, setTaskSaveToFrequent] = useState(false);
  const [taskMacrosModified, setTaskMacrosModified] = useState(false);

  const [editCalories, setEditCalories] = useState("");
  const [editProtein, setEditProtein] = useState("");
  const [editCarbs, setEditCarbs] = useState("");
  const [editFat, setEditFat] = useState("");
  const [editFiber, setEditFiber] = useState("");
  const [manualMacrosModified, setManualMacrosModified] = useState(false);

  useEffect(() => {
    if (globalUserData?.photoURL) {
      setMyPhoto(globalUserData.photoURL);
    }
  }, [globalUserData?.photoURL]);

  useEffect(() => {
    const fetchInsights = async () => {
      if (!globalUserData) return;

      const { shouldShow, checkInDate, periodStart, periodEnd, isLastDay, dayNumber } =
        shouldShowWeightCheckIn({
          lastWeightCheckIn: globalUserData.lastWeightCheckIn || null,
          weightInsightSnooze: globalUserData.weightInsightSnooze || null,
        });

      if (shouldShow) {
        setWeightCheckIn({ checkInDate, periodStart, periodEnd, isLastDay, dayNumber });
        setNewWeight(globalUserData.weight_kg || "");
      }

      // Check for any ready weight insight
      const wSnap = await getDocs(collection(db, "users", user.uid, "weightInsights"));
      let activeWeightInsight = null;
      if (!wSnap.empty) {
        const latest = wSnap.docs.sort((a, b) => b.id.localeCompare(a.id))[0];
        const data = latest.data();
        if (!data.dismissed) activeWeightInsight = { ...data, id: latest.id };
      }

      // Check for any ready monthly insight
      const mSnap = await getDocs(collection(db, "users", user.uid, "insights"));
      let activeMonthlyInsight = null;
      if (!mSnap.empty) {
        const latest = mSnap.docs.sort((a, b) => b.id.localeCompare(a.id))[0];
        const data = latest.data();
        if (!data.dismissed) activeMonthlyInsight = { ...data, id: latest.id };
      }

      if (activeWeightInsight) {
        setWeightInsight(activeWeightInsight);
        setMonthlyInsight(null);
        setInsightBanner("ready");
      } else if (activeMonthlyInsight) {
        setMonthlyInsight(activeMonthlyInsight);
        setWeightInsight(null);
        setInsightBanner("ready");
      }

      // Check if new user — no meals logged ever
      const createdAt = globalUserData.createdAt?.toDate?.() || new Date(globalUserData.createdAt || new Date());
      const minutesSinceSignup = (new Date() - createdAt) / (1000 * 60);
      if (minutesSinceSignup < 10 && !globalUserData.onboardingDismissed) {
        setIsNewUser(true);
      } else {
        setIsNewUser(false);
      }

      if (globalUserData.unlinkedNotification) {
        setShowUnlinkPopup(true);
      } else {
        setShowUnlinkPopup(false);
      }
    };
    fetchInsights();
  }, [globalUserData, user.uid]);

  const handleDismissUnlinkPopup = async () => {
    try {
      await updateDoc(doc(db, "users", user.uid), {
        unlinkedNotification: deleteField()
      });
      setShowUnlinkPopup(false);
    } catch (e) {
      console.error("Failed to dismiss unlink popup:", e);
    }
  };

  useEffect(() => {
    const uids = partnerUid ? [user.uid, partnerUid] : [user.uid];
    const now = new Date();
    // 48 hour window to ensure we catch "today" across any timezone transition
    const recentStart = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const q = query(
      collection(db, "meals"),
      where("uid", "in", uids),
      where("createdAt", ">=", recentStart)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRawRecentMeals(data);
    });

    // Fetch pending tasks for this user
    const taskQ = query(
      collection(db, "tasks"),
      where("toUid", "==", user.uid),
      where("completed", "==", false),
      where("dismissed", "==", false)
    );
    const unsubscribeTasks = onSnapshot(taskQ, (snapshot) => {
      const tasks = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPendingTasks(tasks);
    });

    return () => {
      unsubscribe();
      unsubscribeTasks();
    };
  }, [user.uid, partnerUid]);

  // Unified Filtering Logic for Today Feed
  const filteredMeals = useMemo(() => {
    const myTz = globalUserData?.timezone;
    const partnerTz = globalPartnerData?.timezone;
    const now = new Date();

    // Group raw meals by their "Event ID" (the original meal's ID)
    const groups = {};
    rawRecentMeals.forEach(m => {
      const eventId = m.sourceMealId || m.id;
      if (!groups[eventId]) groups[eventId] = [];
      groups[eventId].push(m);
    });

    const result = [];
    Object.values(groups).forEach(group => {
      // The Logger is the one who created the original meal
      const original = group.find(m => !m.sourceMealId) || group[0];
      const isMyOriginal = original.uid === user.uid;
      const loggerTz = isMyOriginal ? myTz : partnerTz;
      
      if (!loggerTz) return;

      const currentDayInLoggerTz = getLocalDateKeyInTz(now, loggerTz);
      const mealDate = getMealLocalDateKey(original);
      
      const isTodayInLoggerTz = mealDate === currentDayInLoggerTz;

      // Exception: If I have a pending task for this meal, keep it visible regardless of day.
      const hasTask = pendingTasks.some(t => t.sourceMealId === original.id || (original.sourceMealId && t.sourceMealId === original.sourceMealId));

      if (isTodayInLoggerTz || hasTask) {
        // If the original meal is still "Today" in the logger's timezone, or I have a task, show the group
        result.push(...group);
      }
    });

    // Sort by createdAt descending
    return result.sort((a, b) => {
      const aTime = getMealCreatedAtDate(a);
      const bTime = getMealCreatedAtDate(b);
      return bTime - aTime;
    });
  }, [rawRecentMeals, pendingTasks, globalUserData?.timezone, globalPartnerData?.timezone, user.uid]);

  // Sync filteredMeals to the legacy meals state for JSX
  useEffect(() => {
    setMeals(filteredMeals);
  }, [filteredMeals]);

  // Calculate Today's Nutrition Totals
  useEffect(() => {
    const userTz = globalUserData?.timezone;
    const now = new Date();
    const todayKey = getLocalDateKeyInTz(now, userTz);

    const myTodayMeals = filteredMeals.filter((m) => {
      if (m.uid !== user.uid) return false;
      if (!m.nutrition) return false;
      const mealCreatedAt = getMealCreatedAtDate(m);
      const mealLocalDateKeyInUserTz = getLocalDateKeyInTz(mealCreatedAt, userTz);
      return mealLocalDateKeyInUserTz === todayKey;
    });

    if (myTodayMeals.length > 0) {
      const totals = myTodayMeals.reduce((acc, m) => ({
        calories: acc.calories + (m.nutrition.calories || 0),
        protein_g: acc.protein_g + (m.nutrition.protein_g || 0),
        carbs_g: acc.carbs_g + (m.nutrition.carbs_g || 0),
        fat_g: acc.fat_g + (m.nutrition.fat_g || 0),
        fiber_g: acc.fiber_g + (m.nutrition.fiber_g || 0),
      }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });

      setNutrition({
        calories: Math.round(totals.calories),
        protein_g: Math.round(totals.protein_g),
        carbs_g: Math.round(totals.carbs_g),
        fat_g: Math.round(totals.fat_g),
        fiber_g: Math.round(totals.fiber_g),
      });
    } else {
      setNutrition({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });
    }
  }, [filteredMeals, globalUserData?.timezone, user.uid]);

  // Pre-populate task macros when a task is opened
  useEffect(() => {
    if (activeTask) {
      const fetchSourceMeal = async () => {
        try {
          const docSnap = await getDoc(doc(db, "meals", activeTask.sourceMealId));
          if (docSnap.exists()) {
            const sourceData = docSnap.data();
            if (sourceData.nutrition) {
              setTaskCalories(String(sourceData.nutrition.calories || ""));
              setTaskProtein(String(sourceData.nutrition.protein_g || ""));
              setTaskCarbs(String(sourceData.nutrition.carbs_g || ""));
              setTaskFat(String(sourceData.nutrition.fat_g || ""));
              setTaskFiber(String(sourceData.nutrition.fiber_g || ""));
            }
          }
        } catch (e) {
          console.error("Failed to fetch source meal nutrition:", e);
        }
      };
      fetchSourceMeal();
      setTaskIngredients(activeTask.fromIngredients || "");
      setTaskPortionSize(activeTask.fromPortionSize || "");
    } else {
      setTaskCalories("");
      setTaskProtein("");
      setTaskCarbs("");
      setTaskFat("");
      setTaskFiber("");
      setTaskMacrosModified(false);
    }
  }, [activeTask]);

  // Pre-populate edit state
  useEffect(() => {
    if (selectedMeal && editMode) {
      setEditName(selectedMeal.name || "");
      setEditType(selectedMeal.type || "");
      setEditIngredients(selectedMeal.ingredients || selectedMeal.quantity || "");
      setEditPortionSize(selectedMeal.portionSize || "");
      setEditCookType(selectedMeal.isRestaurant ? "Restaurant" : (selectedMeal.isPackaged ? "Packaged" : "Homemade"));

      const photos = getPhotos(selectedMeal);
      setEditPhotos([]);
      setEditPhotoPreviews(photos);

      if (selectedMeal.nutrition) {
        setEditCalories(String(selectedMeal.nutrition.calories || ""));
        setEditProtein(String(selectedMeal.nutrition.protein_g || ""));
        setEditCarbs(String(selectedMeal.nutrition.carbs_g || ""));
        setEditFat(String(selectedMeal.nutrition.fat_g || ""));
        setEditFiber(String(selectedMeal.nutrition.fiber_g || ""));
      }
      setManualMacrosModified(false);
    }
  }, [selectedMeal, editMode]);

  const displayMeals = useMemo(() => {
    // Only show the "representative" meal for each group in the feed list
    return meals.filter(m => !m.sourceMealId || !meals.some(orig => orig.id === m.sourceMealId));
  }, [meals]);

  const mealCount = displayMeals.length;

  const handleDelete = async (mealId) => {
    await deleteDoc(doc(db, "meals", mealId));
    setSelectedMeal(null);
  };

  const handleReaction = async (meal, emoji) => {
    const mealRef = doc(db, "meals", meal.id);
    await updateDoc(mealRef, {
      [`reactions.${user.uid}`]: emoji,
    });
    setReactionMeal(null);
  };

  const handleComment = async () => {
    if (!comment.trim() || !viewMeal) return;
    setSavingComment(true);
    const mealRef = doc(db, "meals", viewMeal.id);
    await updateDoc(mealRef, {
      [`comments.${user.uid}`]: comment.trim(),
    });
    setViewMeal({ ...viewMeal, comments: { ...viewMeal.comments, [user.uid]: comment.trim() } });
    setSavingComment(false);
    setComment("");
  };

  const handleEditSave = async () => {
    if (!selectedMeal || saving || reanalyzing) return;
    setSaving(true);

    try {
      const existingURLs = selectedMeal.photos?.length > 0
        ? selectedMeal.photos
        : selectedMeal.photoURL ? [selectedMeal.photoURL] : [];

      // Upload any new photos
      const newlyUploadedURLs = [];
      for (const photoFile of editPhotos) {
        const compressed = await compressImage(photoFile);
        const photoRef = ref(storage, `meals/${user.uid}/${Date.now()}_${Math.random()}`);
        await uploadBytes(photoRef, compressed);
        const url = await getDownloadURL(photoRef);
        newlyUploadedURLs.push(url);
      }

      // Combine kept existing URLs with newly uploaded ones
      // editPhotoPreviews contains existing URLs that weren't removed
      const keptExistingURLs = editPhotoPreviews.filter((p) =>
        existingURLs.includes(p)
      );
      const finalPhotos = [...keptExistingURLs, ...newlyUploadedURLs];

      const mealRef = doc(db, "meals", selectedMeal.id);
      const ingredientsChanged = editIngredients.trim() !== (selectedMeal.ingredients || selectedMeal.quantity || "");
      const portionSizeChanged = editPortionSize.trim() !== (selectedMeal.portionSize || "");
      const nameChanged = editName.trim() !== selectedMeal.name;
      const currentCookType = selectedMeal.isRestaurant ? "Restaurant" : (selectedMeal.isPackaged ? "Packaged" : "Homemade");
      const cookTypeChanged = editCookType !== currentCookType;

      const updateData = {
        name: editName.trim() || selectedMeal.name,
        type: editType,
        photoURL: finalPhotos[0] || null,
        photos: finalPhotos,
        ingredients: editIngredients.trim(),
        portionSize: editPortionSize.trim(),
        isRestaurant: editCookType === "Restaurant",
        isPackaged: editCookType === "Packaged",
        quantity: "", // Clear old quantity field
        nutrition: {
          calories: parseInt(editCalories) || 0,
          protein_g: parseInt(editProtein) || 0,
          carbs_g: parseInt(editCarbs) || 0,
          fat_g: parseInt(editFat) || 0,
          fiber_g: parseInt(editFiber) || 0,
        }
      };

      await updateDoc(mealRef, updateData);

      // Sync to frequent meals if it was originally saved from this log
      try {
        const q = query(collection(db, "frequentMeals"), where("originalMealId", "==", selectedMeal.id));
        const qSnap = await getDocs(q);
        if (!qSnap.empty) {
          const syncUpdates = {
            name: updateData.name,
            ingredients: updateData.ingredients,
            portionSize: updateData.portionSize,
            nutrition: updateData.nutrition,
            mealType: updateData.type,
          };
          const promises = qSnap.docs.map(d => updateDoc(d.ref, syncUpdates));
          await Promise.all(promises);
        }
      } catch (syncError) {
        console.error("Failed to sync to frequent meals:", syncError);
      }

      // Only reanalyze if name/ingredients/portion changed AND user didn't manually touch macros
      const structureChanged = nameChanged || ingredientsChanged || portionSizeChanged || cookTypeChanged;
      if (structureChanged && !manualMacrosModified) {
        setSaving(false);
        setReanalyzing(true);
        try {
          const functions = getFunctions();
          const reanalyzeFn = httpsCallable(functions, "reanalyzeMeal");
          await reanalyzeFn({ mealId: selectedMeal.id });
        } catch (e) {
          console.error("Reanalysis failed — keeping existing nutrition:", e);
        }
        setReanalyzing(false);
      } else {
        setSaving(false);
      }
    } catch (e) {
      console.error("Edit save failed:", e);
      setSaving(false);
      setReanalyzing(false);
    }

    setSelectedMeal(null);
    setEditMode(false);
  };

  const handleRemoveEditPhoto = (index) => {
    setEditPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
    setEditPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddEditPhoto = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (editPhotoPreviews.length >= 5) return;
    setEditPhotos((prev) => [...prev, file]);
    setEditPhotoPreviews((prev) => [...prev, URL.createObjectURL(file)]);
    setShowEditPhotoOptions(false);
  };




  const handleWeightCheckInSave = async () => {
    if (!newWeight || weightCheckInSaving) return;
    setWeightCheckInSaving(true);
    try {
      const weight = parseFloat(newWeight);
      if (isNaN(weight) || weight <= 0) return;

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.data();
      const previousWeight = parseFloat(userData.weight_kg) || weight;
      const targetWeight = parseFloat(userData.target_weight_kg) || null;

      // Save new weight + history + check-in date
      await updateDoc(userRef, {
        weight_kg: String(weight),
        lastWeightCheckIn: weightCheckIn.checkInDate,
        weightHistory: [
          ...(userData.weightHistory || []),
          { date: weightCheckIn.checkInDate, weight },
        ],
      });

      // Close popup
      setWeightCheckIn(null);

      // Show generating banner
      setInsightBanner("generating");

      const functions = getFunctions();
      const generateFn = httpsCallable(functions, "generateWeightInsight");
      generateFn({
        uid: user.uid,
        newWeight: weight,
        previousWeight,
        targetWeight,
        periodStart: weightCheckIn.periodStart,
        periodEnd: weightCheckIn.periodEnd,
        checkInDate: weightCheckIn.checkInDate,
      }).then((result) => {
        if (result.data?.success && result.data?.insight) {
          setWeightInsight(result.data);
          setInsightBanner("ready");
        } else if (result.data?.reason === "insufficient_data") {
          setInsightBanner("insufficient");
          setTimeout(() => setInsightBanner(null), 5000);
        } else {
          setInsightBanner("error");
          setTimeout(() => setInsightBanner(null), 5000);
        }
      }).catch(() => {
        setInsightBanner("error");
      });

    } catch (e) {
      console.error("Weight check-in save failed:", e);
    } finally {
      setWeightCheckInSaving(false);
    }
  };

  const handleWeightSnooze = async () => {
    if (weightCheckIn?.isLastDay) return; // Can't snooze on last day
    await updateDoc(doc(db, "users", user.uid), {
      weightInsightSnooze: new Date().toISOString(),
    });
    setWeightCheckIn(null);
  };

  const getPendingTaskForMeal = (meal) => {
    // Don't show task if partner already completed it (has their own meal with sourceMealId)
    const alreadyCompleted = meals.some(
      (m) => m.uid === user.uid && m.sourceMealId === meal.id
    );
    if (alreadyCompleted) return null;
    return pendingTasks.find((t) => t.sourceMealId === meal.id) || null;
  };

  const handleTaskComplete = async () => {
    if (!activeTask || taskSaving) return;
    setTaskSaving(true);
    try {
      const now = new Date();
      const ingredientsChanged = taskIngredients.trim() !== "" && taskIngredients.trim() !== activeTask.fromIngredients;
      const portionChanged = taskPortionSize.trim() !== "" && taskPortionSize.trim() !== activeTask.fromPortionSize;

      let finalNutrition = null;
      if (taskMacrosModified) {
        finalNutrition = {
          calories: parseInt(taskCalories) || 0,
          protein_g: parseInt(taskProtein) || 0,
          carbs_g: parseInt(taskCarbs) || 0,
          fat_g: parseInt(taskFat) || 0,
          fiber_g: parseInt(taskFiber) || 0,
        };
      } else if (!ingredientsChanged && !portionChanged) {
        // Quantities are the same, inherit source nutrition immediately
        if (activeTask.fromNutrition) {
          finalNutrition = activeTask.fromNutrition;
        } else {
          // Fallback: fetch from source meal if missing on task (for older tasks)
          try {
            const srcSnap = await getDoc(doc(db, "meals", activeTask.sourceMealId));
            if (srcSnap.exists()) {
              finalNutrition = srcSnap.data().nutrition || null;
            }
          } catch (err) {
            console.error("Failed to fetch fallback nutrition:", err);
          }
        }
      }

      await addDoc(collection(db, "meals"), {
        uid: user.uid,
        name: activeTask.mealName,
        type: activeTask.mealType,
        photoURL: activeTask.photos?.[0] || null,
        photos: activeTask.photos || [],
        ingredients: taskIngredients.trim() || activeTask.fromIngredients || "",
        portionSize: taskPortionSize.trim() || activeTask.fromPortionSize || "",
        isShared: true,
        isRestaurant: activeTask.isRestaurant || false,
        sourceMealId: activeTask.sourceMealId,
        nutrition: finalNutrition,
        analysisStatus: finalNutrition ? "completed" : "analyzing",
        localDate: activeTask.localDate || now.toLocaleDateString("en-CA"),
        localTime: activeTask.localTime || "",
        saveToFrequent: taskSaveToFrequent,
        createdAt: now,
      });

      // Mark task complete
      await updateDoc(doc(db, "tasks", activeTask.id), {
        completed: true,
        completedAt: now,
      });

      setActiveTask(null);
      setTaskIngredients("");
      setTaskPortionSize("");
      setTaskSaveToFrequent(false);
      setTaskMacrosModified(false);
    } catch (e) {
      console.error("Task completion failed:", e);
    } finally {
      setTaskSaving(false);
    }
  };

  const handleTaskDismiss = async () => {
    if (!activeTask) return;
    await updateDoc(doc(db, "tasks", activeTask.id), {
      dismissed: true,
    });
    setActiveTask(null);
    setTaskIngredients("");
    setTaskPortionSize("");
  };

  // --- Nutrient Goals Logic ---

  // Load nutrient goals from globalUserData
  useEffect(() => {
    if (globalUserData?.nutrientGoals) {
      setNutrientGoals(globalUserData.nutrientGoals);
    }
  }, [globalUserData?.nutrientGoals]);

  // Calculate AI goals using Mifflin-St Jeor equation
  const calculateAIGoals = (profile) => {
    const weight = parseFloat(profile.weight_kg);
    const height = parseFloat(profile.height_cm);
    const age = parseInt(profile.age);
    const gender = (profile.gender || "").toLowerCase();
    const targetWeight = parseFloat(profile.target_weight_kg) || weight;

    if (!weight || !height || !age) return null;

    let bmr;
    if (gender === "female" || gender === "f") {
      bmr = 10 * weight + 6.25 * height - 5 * age - 161;
    } else {
      bmr = 10 * weight + 6.25 * height - 5 * age + 5;
    }

    let tdee = Math.round(bmr * 1.3); // More conservative (Lightly Active)

    const weightDiff = targetWeight - weight;
    if (weightDiff < -1) {
      tdee = Math.round(tdee - 500); // More aggressive deficit
    } else if (weightDiff > 1) {
      tdee = Math.round(tdee + 250); // Moderate surplus
    }

    tdee = Math.max(tdee, 1200);

    const protein_g = Math.round((tdee * 0.30) / 4);
    const carbs_g = Math.round((tdee * 0.40) / 4);
    const fat_g = Math.round((tdee * 0.25) / 9);
    const fiber_g = (gender === "female" || gender === "f") ? 25 : 30;

    return { calories: tdee, protein_g, carbs_g, fat_g, fiber_g };
  };

  const handleSaveGoals = async (goals) => {
    setGoalSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), { nutrientGoals: goals });
      setNutrientGoals(goals);
      setGoalSetupStep(null);
    } catch (e) {
      console.error("Failed to save nutrient goals:", e);
    }
    setGoalSaving(false);
  };

  const handleManualGoalSubmit = () => {
    const goals = {
      calories: parseInt(manualGoals.calories) || 2000,
      protein_g: parseInt(manualGoals.protein_g) || 50,
      carbs_g: parseInt(manualGoals.carbs_g) || 250,
      fat_g: parseInt(manualGoals.fat_g) || 65,
      fiber_g: parseInt(manualGoals.fiber_g) || 25,
    };
    handleSaveGoals(goals);
  };

  const handleAIGoalGenerate = async () => {
    const profile = {
      age: globalUserData?.age || "",
      gender: globalUserData?.gender || "",
      height_cm: globalUserData?.height_cm || "",
      weight_kg: globalUserData?.weight_kg || "",
      target_weight_kg: globalUserData?.target_weight_kg || "",
    };

    const isComplete = profile.age && profile.gender && profile.height_cm && profile.weight_kg && profile.target_weight_kg;

    if (!isComplete) {
      setProfileDraft(profile);
      setGoalSetupStep("profile");
      return;
    }

    setGoalSetupStep("ai_generating");
    await new Promise(r => setTimeout(r, 800));
    const goals = calculateAIGoals(profile);
    if (goals) {
      handleSaveGoals(goals);
    } else {
      setGoalSetupStep("manual");
    }
  };

  const handleProfileDraftSubmit = async () => {
    const { age, gender, height_cm, weight_kg, target_weight_kg } = profileDraft;
    if (!age || !gender || !height_cm || !weight_kg) return;

    setGoalSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        age, gender, height_cm, weight_kg, target_weight_kg,
      });
      setGoalSetupStep("ai_generating");
      await new Promise(r => setTimeout(r, 800));
      const goals = calculateAIGoals(profileDraft);
      if (goals) {
        await handleSaveGoals(goals);
      }
    } catch (e) {
      console.error("Failed to save profile + goals:", e);
    }
    setGoalSaving(false);
  };

  return (
    <>
      <div style={styles.container}>
      <div style={styles.brandingHeader}>
        <h1 style={styles.appName}>Table For 2</h1>
      </div>

      {/* Progress Card */}
      <div className="clickable-card" style={styles.card}>
        <div style={styles.cardRow}>
          <img src={myPhoto} alt="avatar" style={styles.avatar} referrerPolicy="no-referrer" />
          <div style={styles.cardInfo}>
            <p style={styles.name}>{user.displayName.split(" ")[0]}</p>
            <p style={styles.mealCount}>{mealCount} meal{mealCount !== 1 ? "s" : ""} logged today</p>
          </div>
        </div>
      </div>

      {/* Welcome popup for new users */}
      {isNewUser && (
        <OnboardingPopup onDismiss={() => setIsNewUser(false)} />
      )}

      {/* Daily Nutrition Card - Hide if goals are set since the goals card shows it better */}
      {nutrition.calories > 0 && globalUserData && !nutrientGoals && (
        <div style={styles.nutritionCard}>
          <div style={styles.nutritionHeader}>
            <p style={styles.nutritionTitle}>Today's Nutrition</p>
            <p style={styles.nutritionCalories}>{nutrition.calories} kcal</p>
          </div>
          <div style={styles.macroPillRow}>
            {[
              { key: "protein_g", label: "Protein", color: "#ff6b6b" },
              { key: "carbs_g", label: "Carbs", color: "#ffb347" },
              { key: "fat_g", label: "Fat", color: "#7ec8a4" },
              { key: "fiber_g", label: "Fiber", color: "#a78bfa" },
            ].map((macro) => (
              <div key={macro.key} style={styles.macroPill}>
                <p style={styles.macroPillLabel}>{macro.label}</p>
                <p style={{ ...styles.macroPillValue, color: macro.color }}>
                  {nutrition[macro.key] || 0}g
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nutrient Goals Card */}
      {nutrientGoals ? (
        <div style={styles.goalsCard}>
          <div style={styles.goalsHeader}>
            <p style={styles.goalsTitle}>🎯 Daily Goals</p>
            <button
              style={styles.goalsEditButton}
              onClick={() => {
                setManualGoals({
                  calories: String(nutrientGoals.calories || ""),
                  protein_g: String(nutrientGoals.protein_g || ""),
                  carbs_g: String(nutrientGoals.carbs_g || ""),
                  fat_g: String(nutrientGoals.fat_g || ""),
                  fiber_g: String(nutrientGoals.fiber_g || ""),
                });
                setGoalSetupStep("manual");
              }}
            >Edit</button>
          </div>
          {/* Calorie progress */}
          <div style={styles.goalCalorieRow}>
            <div>
              <p style={styles.goalCalorieEaten}>{nutrition.calories || 0}</p>
              <p style={styles.goalCalorieLabel}>eaten</p>
            </div>
            <div style={styles.goalCalorieDivider}>
              <p style={styles.goalCalorieDividerText}>/</p>
            </div>
            <div>
              <p style={styles.goalCalorieTarget}>{nutrientGoals.calories}</p>
              <p style={styles.goalCalorieLabel}>kcal goal</p>
            </div>
            <div style={{ flex: 1 }} />
            <div>
              <p style={{
                ...styles.goalCalorieRemaining,
                color: (nutrientGoals.calories - (nutrition.calories || 0)) >= 0 ? "#7ec8a4" : "#ff6b6b",
              }}>
                {Math.abs(nutrientGoals.calories - (nutrition.calories || 0))}
              </p>
              <p style={styles.goalCalorieLabel}>
                {(nutrientGoals.calories - (nutrition.calories || 0)) >= 0 ? "remaining" : "over"}
              </p>
            </div>
          </div>
          {/* Macro progress bars */}
          <div style={styles.goalMacroList}>
            {[
              { key: "protein_g", label: "Protein", unit: "g", color: "#ff6b6b" },
              { key: "carbs_g", label: "Carbs", unit: "g", color: "#ffb347" },
              { key: "fat_g", label: "Fat", unit: "g", color: "#7ec8a4" },
              { key: "fiber_g", label: "Fiber", unit: "g", color: "#a78bfa" },
            ].map((macro) => {
              const eaten = nutrition[macro.key] || 0;
              const goal = nutrientGoals[macro.key] || 1;
              const pct = Math.min((eaten / goal) * 100, 100);
              return (
                <div key={macro.key} style={styles.goalMacroRow}>
                  <p style={styles.goalMacroLabel}>{macro.label}</p>
                  <div style={styles.goalMacroBarTrack}>
                    <div style={{
                      ...styles.goalMacroBarFill,
                      backgroundColor: macro.color,
                      width: `${pct}%`,
                    }} />
                  </div>
                  <p style={styles.goalMacroValues}>
                    {eaten}/{goal}{macro.unit}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={styles.goalSetupCard} onClick={() => setGoalSetupStep("choose")}>
          <div style={styles.goalSetupInner}>
            <p style={styles.goalSetupEmoji}>🎯</p>
            <div>
              <p style={styles.goalSetupTitle}>Set Your Daily Goals</p>
              <p style={styles.goalSetupSub}>Track calories & macros against personalized targets</p>
            </div>
          </div>
          <div style={styles.goalSetupArrow}>→</div>
        </div>
      )}

      {/* Goal Setup Popup */}
      {goalSetupStep && (
        <div style={styles.overlay} onClick={() => setGoalSetupStep(null)}>
          <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
            {/* Step 1: Choose method */}
            {goalSetupStep === "choose" && (
              <>
                <p style={styles.sheetTitle}>Set Daily Goals</p>
                <p style={styles.sheetMeta}>How would you like to set your nutrient goals?</p>
                <button
                  style={styles.goalOptionButton}
                  onClick={() => {
                    setManualGoals({ calories: "", protein_g: "", carbs_g: "", fat_g: "", fiber_g: "" });
                    setGoalSetupStep("manual");
                  }}
                >
                  <span style={styles.goalOptionEmoji}>✏️</span>
                  <span>
                    <strong>Fill in manually</strong>
                    <br />
                    <span style={styles.goalOptionSub}>I know my targets</span>
                  </span>
                </button>
                <button
                  style={styles.goalOptionButton}
                  onClick={handleAIGoalGenerate}
                >
                  <span style={styles.goalOptionEmoji}>🤖</span>
                  <span>
                    <strong>Let AI decide</strong>
                    <br />
                    <span style={styles.goalOptionSub}>Based on your profile &amp; weight goals</span>
                  </span>
                </button>
                <button style={styles.cancelButton} onClick={() => setGoalSetupStep(null)}>
                  Cancel
                </button>
              </>
            )}

            {/* Step 2a: Manual entry */}
            {goalSetupStep === "manual" && (
              <>
                <p style={styles.sheetTitle}>Enter Your Goals</p>
                {[
                  { key: "calories", label: "Calories", unit: "kcal", placeholder: "0" },
                  { key: "protein_g", label: "Protein", unit: "g", placeholder: "0" },
                  { key: "carbs_g", label: "Carbs", unit: "g", placeholder: "0" },
                  { key: "fat_g", label: "Fat", unit: "g", placeholder: "0" },
                  { key: "fiber_g", label: "Fiber", unit: "g", placeholder: "0" },
                ].map((field) => (
                  <div key={field.key} style={styles.goalInputRow}>
                    <p style={styles.goalInputLabel}>{field.label}</p>
                    <div style={styles.goalInputWrapper}>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder={field.placeholder}
                        className="goal-input"
                        value={manualGoals[field.key]}
                        onChange={(e) => setManualGoals(prev => ({
                          ...prev,
                          [field.key]: e.target.value.replace(/[^0-9]/g, ""),
                        }))}
                        style={styles.goalInput}
                      />
                      <span style={styles.goalInputUnit}>{field.unit}</span>
                    </div>
                  </div>
                ))}
                <button
                  style={styles.goalSaveButton}
                  onClick={handleManualGoalSubmit}
                  disabled={goalSaving}
                >
                  {goalSaving ? "Saving..." : "Save Goals"}
                </button>
                <button
                  style={styles.cancelButton}
                  onClick={() => setGoalSetupStep(nutrientGoals ? null : "choose")}
                >
                  {nutrientGoals ? "Cancel" : "← Back"}
                </button>
              </>
            )}

            {/* Step 2b: Profile completion (for AI) */}
            {goalSetupStep === "profile" && (
              <>
                <p style={styles.sheetTitle}>Complete Your Profile</p>
                <p style={styles.sheetMeta}>We need a few details to calculate your goals</p>
                {[
                  { key: "age", label: "Age", unit: "yrs", placeholder: "0", inputMode: "numeric" },
                  { key: "height_cm", label: "Height", unit: "cm", placeholder: "0", inputMode: "numeric" },
                  { key: "weight_kg", label: "Current Weight", unit: "kg", placeholder: "0", inputMode: "decimal" },
                  { key: "target_weight_kg", label: "Target Weight", unit: "kg", placeholder: "0", inputMode: "decimal" },
                ].map((field) => (
                  <div key={field.key} style={styles.goalInputRow}>
                    <p style={styles.goalInputLabel}>{field.label}</p>
                    <div style={styles.goalInputWrapper}>
                      <input
                        type="text"
                        inputMode={field.inputMode}
                        placeholder={field.placeholder}
                        className="goal-input"
                        value={profileDraft[field.key]}
                        onChange={(e) => setProfileDraft(prev => ({
                          ...prev,
                          [field.key]: e.target.value.replace(/[^0-9.]/g, ""),
                        }))}
                        style={styles.goalInput}
                      />
                      <span style={styles.goalInputUnit}>{field.unit}</span>
                    </div>
                  </div>
                ))}
                {/* Gender selector */}
                <div style={styles.goalInputRow}>
                  <p style={styles.goalInputLabel}>Gender</p>
                  <div style={styles.goalGenderRow}>
                    {["Male", "Female"].map((g) => (
                      <button
                        key={g}
                        style={{
                          ...styles.goalGenderButton,
                          backgroundColor: profileDraft.gender === g ? "#ff6b6b" : "white",
                          color: profileDraft.gender === g ? "white" : "#888",
                        }}
                        onClick={() => setProfileDraft(prev => ({ ...prev, gender: g }))}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  style={styles.goalSaveButton}
                  onClick={handleProfileDraftSubmit}
                  disabled={goalSaving || !profileDraft.age || !profileDraft.gender || !profileDraft.height_cm || !profileDraft.weight_kg || !profileDraft.target_weight_kg}
                >
                  {goalSaving ? "Saving..." : "Calculate My Goals"}
                </button>
                <button
                  style={styles.cancelButton}
                  onClick={() => setGoalSetupStep(nutrientGoals ? null : "choose")}
                >
                  {nutrientGoals ? "Cancel" : "← Back"}
                </button>
              </>
            )}

            {/* Step 2c: AI generating */}
            {goalSetupStep === "ai_generating" && (
              <div style={{ textAlign: "center", padding: "2rem 0" }}>
                <p style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🤖</p>
                <p style={styles.sheetTitle}>Calculating your goals...</p>
                <p style={styles.sheetMeta}>Analyzing your profile data</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Meals Feed */}
      <h3 style={styles.sectionTitle}>Meals Today</h3>
      {mealCount === 0 && (
        <p style={styles.empty}>No meals logged yet today. Add your first one!</p>
      )}
      {displayMeals.map((meal) => {
        // For shared meals, we want to show the current user's specific version (portion/macros)
        // while still treating it as the "main" card for that shared event.
        const myVersion = meal.isShared ? meals.find(m => m.sourceMealId === meal.id && m.uid === user.uid) : null;
        const displayMeal = myVersion || meal;

        const ismine = displayMeal.uid === user.uid;
        const avatarSrc = ismine ? myPhoto : partnerPhoto;
        const personName = ismine ? user.displayName.split(" ")[0] : (partnerName ? partnerName.split(" ")[0] : "Partner");
        const isPartnerMeal = meal.uid !== user.uid;

        return (
          <div key={meal.id} className="clickable-card" style={styles.mealCard} onClick={() => {
            if (isPartnerMeal && !myVersion) {
              const pendingTask = getPendingTaskForMeal(meal);
              if (pendingTask) {
                setActiveTask(pendingTask);
                setTaskIngredients("");
              } else {
                setViewMeal(meal);
                setComment(meal.comments?.[user.uid] || "");
              }
            } else {
              // It's my own meal OR I've already accepted this shared meal
              setSelectedMeal(displayMeal);
              setEditType(displayMeal.type);
              setEditName(displayMeal.name);
              setEditIngredients(displayMeal.ingredients || displayMeal.quantity || "");
              setEditPortionSize(displayMeal.portionSize || "");
              setEditCookType(displayMeal.isRestaurant ? "Restaurant" : (displayMeal.isPackaged ? "Packaged" : "Homemade"));
              setEditMode(false);
              const existingPhotos = displayMeal.photos?.length > 0
                ? displayMeal.photos
                : displayMeal.photoURL ? [displayMeal.photoURL] : [];
              setEditPhotos([]);
              setEditPhotoPreviews(existingPhotos);
            }
          }}>
            {(() => {
              const mealPhotos = getPhotos(displayMeal);
              if (mealPhotos.length === 0) return null;
              if (mealPhotos.length === 1) return (
                <img src={mealPhotos[0]} alt="meal" style={styles.mealPhoto} loading="lazy" />
              );
              const visiblePhotos = mealPhotos.slice(0, 3);
              const rotations = [-3, 1.5, 0];
              const offsets = [{ x: -6, y: 3 }, { x: 4, y: -2 }, { x: 0, y: 0 }];
              return (
                <div style={styles.photoStack}>
                  {visiblePhotos.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt="meal"
                      loading="lazy"
                      style={{
                        ...styles.mealPhoto,
                        position: "absolute",
                        top: 0,
                        left: 0,
                        transform: `rotate(${rotations[i] || 0}deg) translate(${offsets[i]?.x || 0}px, ${offsets[i]?.y || 0}px)`,
                        zIndex: visiblePhotos.length - i,
                        boxShadow: i < visiblePhotos.length - 1
                          ? "0 4px 12px rgba(0,0,0,0.15)"
                          : "0 2px 8px rgba(0,0,0,0.1)",
                        animation: `cardFanOut 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 0.08}s both`,
                        borderRadius: "12px",
                      }}
                    />
                  ))}
                </div>
              );
            })()}
            <div style={styles.mealInfo}>
              <div style={styles.mealHeader}>
                <p style={styles.mealName}>{displayMeal.name}</p>
              </div>
              <p style={styles.mealMeta}>
                {displayMeal.type}
              </p>
              {displayMeal.analysisStatus === "analyzing" && (!displayMeal.nutrition || !displayMeal.nutrition.calories) && (
                <p style={{ color: "#888", fontSize: "0.7rem", fontStyle: "italic", margin: "4px 0 0 0" }}>
                  Calculating...
                </p>
              )}
              {displayMeal.analysisStatus === "failed" && (
                <p style={{ color: "#d93025", fontSize: "0.7rem", fontWeight: "600", margin: "4px 0 0 0" }}>
                  ⚠️ Analysis Failed
                </p>
              )}
              {displayMeal.reactions && Object.keys(displayMeal.reactions).length > 0 && (
                <div style={styles.reactionsRow}>
                  {Object.entries(displayMeal.reactions).map(([uid, emoji]) => (
                    <span key={uid} style={styles.reactionBadge}>
                      {emoji}
                    </span>
                  ))}
                </div>
              )}
              {/* Task hint */}
              {isPartnerMeal && !myVersion && getPendingTaskForMeal(meal) && (
                <div style={styles.taskHint}>
                  ✨ Add your quantities →
                </div>
              )}
            </div>
            <div style={styles.mealOwner}>
              {meal.isShared ? (
                <div style={styles.sharedAvatarStack}>
                  <img
                    src={avatarSrc}
                    alt="owner"
                    style={styles.ownerAvatar}
                    referrerPolicy="no-referrer"
                  />
                  <img
                    src={ismine ? partnerPhoto : myPhoto}
                    alt="partner"
                    style={{
                      ...styles.ownerAvatar,
                      position: "absolute",
                      left: "14px",
                      top: 0,
                      border: "2px solid white",
                    }}
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : (
                <img src={avatarSrc} alt={personName} style={styles.ownerAvatar} referrerPolicy="no-referrer" />
              )}
              <p style={styles.ownerName}>{meal.isShared ? "Shared" : personName}</p>
            </div>
          </div>
        );
      })}
    </div>
    {/* Bottom Sheet - Moved outside container for perfect centering */}
    {selectedMeal && (
        <div style={styles.overlay} onClick={() => { setSelectedMeal(null); setEditMode(false); }}>
          <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
            {!editMode ? (
              <>
                {/* Photo carousel */}
                {(() => {
                  const mealPhotos = getPhotos(selectedMeal);
                  if (mealPhotos.length === 0) return null;
                  return (
                    <div style={{ position: "relative", marginBottom: "1rem" }}>
                      <PhotoCarousel photos={mealPhotos} />
                      {selectedMeal.reactions?.[partnerUid] && (
                        <span style={{
                          ...styles.reactionOverlay,
                          top: "10px",
                          right: "10px",
                          position: "absolute",
                          zIndex: 20,
                        }}>
                          {selectedMeal.reactions[partnerUid]}
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* Info */}
                <div style={styles.viewHeader}>
                  <div>
                    <p style={styles.viewName}>{selectedMeal.name}</p>
                    <p style={styles.viewMeta}>
                      {selectedMeal.localTime || (selectedMeal.createdAt?.toDate
                        ? selectedMeal.createdAt.toDate().toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })
                        : "")}
                    </p>
                  </div>
                  <img
                    src={user.photoURL}
                    alt="you"
                    style={styles.viewAvatar}
                    referrerPolicy="no-referrer"
                  />
                </div>

                {/* Nutrition breakdown */}
                <MealNutritionCard
                  nutrition={selectedMeal.nutrition || {}}
                  analysisStatus={selectedMeal.analysisStatus}
                  isRetrying={retryingMealId === selectedMeal.id}
                  onRetry={() => handleRetryAnalysis(selectedMeal.id)}
                  editable={true}
                  onNutritionChange={async (key, value) => {
                    try {
                      setSelectedMeal((prev) => ({
                        ...prev,
                        nutrition: {
                          ...(prev.nutrition || {}),
                          [key]: value
                        }
                      }));
                      await updateDoc(doc(db, "meals", selectedMeal.id), {
                        [`nutrition.${key}`]: value
                      });
                    } catch (e) {
                      console.error("Failed to update nutrition inline", e);
                    }
                  }}
                />

                {/* Partner's comment */}
                <PartnerResponseCard
                  comment={selectedMeal.comments?.[partnerUid]}
                  authorName={partnerName ? partnerName.split(" ")[0] : "Partner"}
                />

                {/* Actions */}
                <div style={styles.actionRow}>
                  <button style={styles.editButton} onClick={() => setEditMode(true)}>
                    ✏️ Edit
                  </button>
                  <button style={styles.deleteButton} onClick={() => handleDelete(selectedMeal.id)}>
                    🗑️ Delete
                  </button>
                  <button style={styles.cancelButton} onClick={() => setSelectedMeal(null)}>
                    ← Back
                  </button>
                </div>

              </>
            ) : (
              <>
                <p style={styles.sheetTitle}>Edit Meal</p>

                {/* Meal Type */}
                <p style={styles.editLabel}>Meal Name</p>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={styles.editInput}
                />
                <p style={styles.editLabel}>Ingredients/Notes</p>
                <input
                  type="text"
                  value={editIngredients}
                  onChange={(e) => setEditIngredients(e.target.value)}
                  style={styles.editInput}
                  placeholder="What was in it?"
                />
                <p style={styles.editLabel}>Portion Size</p>
                <input
                  type="text"
                  value={editPortionSize}
                  onChange={(e) => setEditPortionSize(e.target.value)}
                  style={styles.editInput}
                  placeholder="Standard, Large, etc."
                />

                <p style={styles.editLabel}>Current Macros</p>
                <MealNutritionCard
                  nutrition={{
                    calories: parseInt(editCalories) || 0,
                    protein_g: parseInt(editProtein) || 0,
                    carbs_g: parseInt(editCarbs) || 0,
                    fat_g: parseInt(editFat) || 0,
                    fiber_g: parseInt(editFiber) || 0,
                  } || {}}
                  editable={true}
                  onNutritionChange={(key, value) => {
                    if (key === 'calories') setEditCalories(String(value));
                    if (key === 'protein_g') setEditProtein(String(value));
                    if (key === 'carbs_g') setEditCarbs(String(value));
                    if (key === 'fat_g') setEditFat(String(value));
                    if (key === 'fiber_g') setEditFiber(String(value));
                    setManualMacrosModified(true);
                  }}
                />

                <p style={styles.editLabel}>Meal Type</p>
                <div style={styles.typeRow}>
                  {["Breakfast", "Lunch", "Dinner", "Snack"].map((type) => (
                    <button
                      key={type}
                      style={{
                        ...styles.typeButton,
                        backgroundColor: editType === type ? "#ff6b6b" : "white",
                        color: editType === type ? "white" : "#aaa",
                      }}
                      onClick={() => setEditType(type)}
                    >
                      {type}
                    </button>
                  ))}
                </div>

                <div style={styles.typeRow}>
                  {["Homemade", "Restaurant", "Packaged"].map((type) => (
                    <button
                      key={type}
                      style={{
                        ...styles.typeButton,
                        backgroundColor: editCookType === type ? "#ff6b6b" : "white",
                        color: editCookType === type ? "white" : "#aaa",
                      }}
                      onClick={() => setEditCookType(type)}
                    >
                      {type}
                    </button>
                  ))}
                </div>


                {/* Photo */}
                <p style={styles.editLabel}>Photo</p>
                <div style={styles.photoBox} onClick={() => setShowEditPhotoOptions(true)}>
                  {/* Multi photo edit grid */}
                  <div style={styles.photoGrid}>
                    {editPhotoPreviews.map((preview, index) => (
                      <div key={index} style={styles.photoThumbWrapper}>
                        <img
                          src={preview}
                          alt={`meal ${index + 1}`}
                          style={styles.photoThumb}
                          loading="lazy"
                        />
                        <button
                          style={styles.removePhotoBtn}
                          onClick={() => handleRemoveEditPhoto(index)}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {editPhotoPreviews.length < 5 && (
                      <div
                        style={styles.addMorePhoto}
                        onClick={() => setShowEditPhotoOptions(true)}
                      >
                        <p style={styles.addMorePhotoPlus}>+</p>
                        <p style={styles.addMorePhotoLabel}>Add</p>
                      </div>
                    )}
                  </div>
                </div>
                <input id="editPhotoInput" type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleAddEditPhoto} />
                <input id="editGalleryInput" type="file" accept="image/*" style={{ display: "none" }} onChange={handleAddEditPhoto} />
                {showEditPhotoOptions && (
                  <div style={styles.overlay} onClick={() => setShowEditPhotoOptions(false)}>
                    <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
                      <p style={styles.sheetTitle}>Add Photo</p>
                      <button style={styles.editButton} onClick={async () => {
                        try {
                          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                          stream.getTracks().forEach(t => t.stop());
                          document.getElementById("editPhotoInput").click();
                        } catch (e) {
                          alert("Camera access is blocked. Please go to your browser Settings → Site Settings → Camera and allow access for this site, then reload the app.");
                        }
                      }}>
                        📷 Take Photo
                      </button>
                      <button style={styles.editButton} onClick={() => document.getElementById("editGalleryInput").click()}>
                        🖼️ Choose from Gallery
                      </button>
                      <button style={styles.cancelButton} onClick={() => setShowEditPhotoOptions(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <button
                  style={styles.editSaveButton}
                  onClick={handleEditSave}
                  disabled={saving || reanalyzing}
                >
                  {reanalyzing ? "Updating nutrition..." : saving ? "Saving..." : "Save Changes"}
                </button>
                <button style={styles.cancelButton} onClick={() => setEditMode(false)}>
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {/* Partner Meal Viewer */}
      {viewMeal && (
        <div
          style={styles.overlay}
          onClick={() => setViewMeal(null)}
        >
          <div
            style={{
              ...styles.sheet,
              paddingBottom: "2rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >

            {/* Photo */}
            {(() => {
              const mealPhotos = getPhotos(viewMeal);
              if (mealPhotos.length === 0) return null;
              return (
                <div style={{ position: "relative", marginBottom: "1rem" }}>
                  <PhotoCarousel photos={mealPhotos} />
                  {viewMeal.reactions?.[user.uid] && (
                    <span style={{
                      ...styles.reactionOverlay,
                      top: "10px",
                      right: "10px",
                      position: "absolute",
                      zIndex: 20,
                    }}>
                      {viewMeal.reactions[user.uid]}
                    </span>
                  )}
                </div>
              );
            })()}

            {/* Info */}
            <div style={styles.viewInfo}>
              <div style={styles.viewHeader}>
                <div>
                  <p style={styles.viewName}>{viewMeal.name}</p>
                  <p style={styles.viewMeta}>
                    {viewMeal.localTime || (viewMeal.createdAt?.toDate
                      ? viewMeal.createdAt.toDate().toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })
                      : "")}
                  </p>
                </div>
                <img
                  src={partnerPhoto}
                  alt="partner"
                  style={styles.viewAvatar}
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Nutrition breakdown */}
              <MealNutritionCard nutrition={viewMeal.nutrition} />

              {/* Your comment on partner's meal */}
              <PartnerResponseCard
                comment={viewMeal.comments?.[user.uid]}
                authorName="You"
              />
            </div>

            {/* Only show reaction picker if no reaction yet */}
            {!viewMeal.reactions?.[user.uid] && (
              <div style={styles.viewReactionRow}>
                <p style={styles.viewReactionLabel}>React</p>
                <div style={styles.reactionRow}>
                  {["❤️", "😍", "🔥", "👏", "😋"].map((emoji) => (
                    <button
                      key={emoji}
                      style={{
                        ...styles.reactionButton,
                        backgroundColor: "white",
                        border: "2px solid #eee",
                      }}
                      onClick={() => {
                        handleReaction(viewMeal, emoji);
                        setViewMeal({ ...viewMeal, reactions: { ...viewMeal.reactions, [user.uid]: emoji } });
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Only show comment box if no comment yet */}
            {!viewMeal.comments?.[user.uid] && (
              <div style={styles.commentRow}>
                <div style={styles.commentInputRow}>
                  <input
                    type="text"
                    placeholder="Leave a comment..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    style={styles.commentInput}
                    className="comment-input"
                  />
                  <button
                    style={{
                      ...styles.commentButton,
                      opacity: comment.trim() ? 1 : 0.4,
                    }}
                    onClick={handleComment}
                    disabled={savingComment || !comment.trim()}
                  >
                    {savingComment ? "..." : "Send"}
                  </button>
                </div>
              </div>
            )}

            <div style={styles.actionRow}>
              <button style={styles.cancelButton} onClick={() => setViewMeal(null)}>
                ← Back
              </button>
            </div>

          </div>
        </div>
      )}
      {/* Reaction Picker */}
      {reactionMeal && (
        <div style={styles.overlay} onClick={() => setReactionMeal(null)}>
          <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <p style={styles.sheetTitle}>{reactionMeal.name}</p>
            <p style={styles.sheetMeta}>React to {partnerName ? partnerName.split(" ")[0] : "partner"}'s meal</p>
            <div style={styles.reactionRow}>
              {["❤️", "😍", "🔥", "👏", "😋"].map((emoji) => (
                <button
                  key={emoji}
                  style={{
                    ...styles.reactionButton,
                    backgroundColor:
                      reactionMeal.reactions?.[user.uid] === emoji
                        ? "#fff0f0"
                        : "white",
                    border:
                      reactionMeal.reactions?.[user.uid] === emoji
                        ? "2px solid #ff6b6b"
                        : "2px solid #eee",
                  }}
                  onClick={() => handleReaction(reactionMeal, emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <button style={styles.cancelButton} onClick={() => setReactionMeal(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <button style={styles.fab} onClick={() => setCurrentPage("logMeal")}>
        +
      </button>
      {/* Weight Check-in Popup */}
      {weightCheckIn && (
        <div style={styles.overlay} onClick={handleWeightSnooze}>
          <div
            style={styles.weightCheckInSheet}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={styles.weightCheckInEyebrow}>
              {weightCheckIn.isLastDay
                ? "⚠️ Last chance to check in!"
                : `Biweekly Check-in ⚖️ · Day ${weightCheckIn.dayNumber} of 3`}
            </p>
            <p style={styles.weightCheckInTitle}>How are you doing?</p>
            <p style={styles.weightCheckInPeriod}>
              {weightCheckIn.periodStart} → {weightCheckIn.periodEnd}
            </p>

            <div style={styles.weightInputWrapper}>
              <input
                type="number"
                value={newWeight}
                onChange={(e) => setNewWeight(e.target.value)}
                style={styles.weightInput}
                placeholder="Enter weight"
                step="0.1"
              />
              <span style={styles.weightInputUnit}>kg</span>
            </div>

            <button
              style={{
                ...styles.weightCheckInButton,
                opacity: weightCheckInSaving || !newWeight ? 0.6 : 1,
              }}
              onClick={handleWeightCheckInSave}
              disabled={weightCheckInSaving || !newWeight}
            >
              {weightCheckInSaving ? "Saving..." : "Update & Get Insights →"}
            </button>

            {!weightCheckIn.isLastDay ? (
              <button
                style={styles.weightSnoozeButton}
                onClick={handleWeightSnooze}
              >
                Remind me tomorrow
              </button>
            ) : (
              <p style={styles.weightLastDayWarning}>
                This is your last chance until the {weightCheckIn.checkInDate.endsWith("-01") ? "15th" : "1st"}!
              </p>
            )}
          </div>
        </div>
      )}

      {/* Insight Banner */}
      {insightBanner && (
        <div
          style={{
            ...styles.insightBanner,
            cursor: insightBanner === "ready" ? "pointer" : "default",
          }}
          onClick={() => {
            if (insightBanner === "ready" && (weightInsight || monthlyInsight)) {
              setInsightBanner("open");
            }
          }}
        >
          {insightBanner === "generating" && (
            <p style={styles.insightBannerText}>✨ Generating your insights...</p>
          )}
          {insightBanner === "ready" && (
            <p style={styles.insightBannerText}>✨ Your insights are ready — tap to view</p>
          )}
          {insightBanner === "insufficient" && (
            <p style={styles.insightBannerText}>📊 Not enough meal data yet for insights</p>
          )}
          {insightBanner === "error" && (
            <p style={styles.insightBannerText}>⚠️ Couldn't generate insights — try again later</p>
          )}

        </div>
      )}

      {/* Insight Popup */}
      {insightBanner === "open" && (weightInsight || monthlyInsight) && (
        <div
          style={styles.overlay}
          onClick={() => setInsightBanner("ready")}
        >
          <div
            style={styles.insightPopup}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={styles.insightPopupEyebrow}>Your Insights ✨</p>
            <p style={styles.insightPopupPeriod}>
              {weightInsight ? `${weightInsight.periodStart} → ${weightInsight.periodEnd}` : `${monthlyInsight.month} ${monthlyInsight.year}`}
            </p>

            {/* Weight summary - only for weight insight */}
            {weightInsight && (
              <>
                <div style={styles.insightWeightRow}>
                  <div style={styles.insightWeightItem}>
                    <p style={styles.insightWeightLabel}>Previous</p>
                    <p style={styles.insightWeightValue}>{weightInsight.previousWeight}kg</p>
                  </div>
                  <div style={styles.insightWeightArrow}>→</div>
                  <div style={styles.insightWeightItem}>
                    <p style={styles.insightWeightLabel}>Current</p>
                    <p style={styles.insightWeightValue}>{weightInsight.newWeight}kg</p>
                  </div>
                  {weightInsight.targetWeight && (
                    <>
                      <div style={styles.insightWeightArrow}>·</div>
                      <div style={styles.insightWeightItem}>
                        <p style={styles.insightWeightLabel}>Target</p>
                        <p style={styles.insightWeightValue}>{weightInsight.targetWeight}kg</p>
                      </div>
                    </>
                  )}
                </div>
                {/* Weight delta */}
                {weightInsight.newWeight && weightInsight.previousWeight && (
                  <p style={{
                    ...styles.insightWeightDelta,
                    color: weightInsight.newWeight <= weightInsight.previousWeight
                      ? "#7ec8a4"
                      : "#ffb347",
                  }}>
                    {weightInsight.newWeight === weightInsight.previousWeight
                      ? "No change this period"
                      : weightInsight.newWeight < weightInsight.previousWeight
                        ? `↓ ${(weightInsight.previousWeight - weightInsight.newWeight).toFixed(1)}kg this period`
                        : `↑ ${(weightInsight.newWeight - weightInsight.previousWeight).toFixed(1)}kg this period`}
                  </p>
                )}
              </>
            )}

            {/* Monthly Nutrition Summary - only for monthly insight */}
            {monthlyInsight && (
              <div style={styles.insightWeightRow}>
                <div style={styles.insightWeightItem}>
                  <p style={styles.insightWeightLabel}>Avg Cal</p>
                  <p style={styles.insightWeightValue}>{monthlyInsight.nutrition.avgCalories}</p>
                </div>
                <div style={styles.insightWeightItem}>
                  <p style={styles.insightWeightLabel}>P</p>
                  <p style={styles.insightWeightValue}>{monthlyInsight.nutrition.avgProtein}g</p>
                </div>
                <div style={styles.insightWeightItem}>
                  <p style={styles.insightWeightLabel}>C</p>
                  <p style={styles.insightWeightValue}>{monthlyInsight.nutrition.avgCarbs}g</p>
                </div>
                <div style={styles.insightWeightItem}>
                  <p style={styles.insightWeightLabel}>F</p>
                  <p style={styles.insightWeightValue}>{monthlyInsight.nutrition.avgFat}g</p>
                </div>
              </div>
            )}

            <div style={styles.insightDivider} />

            {/* Insight text */}
            <p style={styles.insightPopupText}>{weightInsight ? weightInsight.insight : monthlyInsight.insight}</p>

            <p style={styles.insightDisclaimer}>
              AI-generated · Not medical advice
            </p>

            <button
              style={styles.insightPopupButton}
              onClick={async () => {
                const type = weightInsight ? "weightInsights" : "insights";
                const id = weightInsight ? weightInsight.id : monthlyInsight.id;
                setInsightBanner(null);
                setWeightInsight(null);
                setMonthlyInsight(null);
                await updateDoc(
                  doc(db, "users", user.uid, type, id),
                  { dismissed: true }
                );
              }}
            >
              Got it 👍
            </button>
          </div>
        </div>
      )}

      {/* Unlinked Popup */}
      {showUnlinkPopup && (
        <div style={styles.overlay}>
          <div style={{ ...styles.sheet, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            {/* <p style={{ fontSize: "2rem", marginBottom: "0.5rem", marginTop: 0 }}>💔</p> */}
            <p style={{ fontWeight: "bold", fontSize: "1.2rem", marginBottom: "0.5rem", color: "#333" }}>
              Your partner unlinked
            </p>
            <p style={{ color: "#666", fontSize: "0.95rem", marginBottom: "1.5rem", lineHeight: 1.4 }}>
              If you wish to link again, or link with a new partner, you can send them a new request from your profile.
            </p>
            <button
              style={{
                width: "100%",
                padding: "0.8rem",
                backgroundColor: "#ff6b6b",
                color: "white",
                border: "none",
                borderRadius: "10px",
                fontSize: "1rem",
                fontWeight: "bold",
                cursor: "pointer",
              }}
              onClick={handleDismissUnlinkPopup}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Task Completion Popup */}
      {activeTask && (
        <div
          style={styles.overlay}
          onClick={() => {
            if (!taskSaving) setActiveTask(null);
          }}
        >
          <div
            style={styles.sheet}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Photo carousel */}
            {activeTask.photos?.length > 0 && (
              <div style={{ position: "relative", marginBottom: "1rem" }}>
                <PhotoCarousel photos={activeTask.photos} />
              </div>
            )}

            {/* Meal info */}
            <div style={styles.viewHeader}>
              <div>
                <p style={styles.viewName}>{activeTask.mealName}</p>
                <p style={styles.viewMeta}>{activeTask.mealType}</p>
              </div>
              <img
                src={partnerPhoto}
                alt="partner"
                style={styles.viewAvatar}
                referrerPolicy="no-referrer"
              />
            </div>

            {/* Partner's details */}
            {(activeTask.fromIngredients || activeTask.fromPortionSize || activeTask.fromQuantity) && (
              <div style={styles.taskPartnerQuantity}>
                <p style={styles.taskPartnerQuantityLabel}>
                  {partnerName ? partnerName.split(" ")[0] : "Partner"} had:
                </p>
                {activeTask.fromIngredients || activeTask.fromQuantity ? (
                  <p style={styles.taskPartnerQuantityText}>
                    "{activeTask.fromIngredients || activeTask.fromQuantity}"
                  </p>
                ) : null}
                {activeTask.fromPortionSize && (
                  <p style={{ ...styles.taskPartnerQuantityText, fontSize: "0.85rem", color: "#888", marginTop: "2px" }}>
                    Portion: {activeTask.fromPortionSize}
                  </p>
                )}
              </div>
            )}

            <div style={styles.insightDivider} />

            {/* Your details input */}
            <p style={styles.taskYourQuantityLabel}>Your ingredients</p>
            <input
              type="text"
              placeholder={activeTask.fromIngredients || activeTask.fromQuantity || "What did you have?"}
              value={taskIngredients}
              onChange={(e) => setTaskIngredients(e.target.value)}
              style={styles.taskQuantityInput}
              className="comment-input"
            />

            <p style={{ ...styles.taskYourQuantityLabel, marginTop: "1rem" }}>Your portion size</p>
            <input
              type="text"
              placeholder={activeTask.fromPortionSize || "Standard portion?"}
              value={taskPortionSize}
              onChange={(e) => setTaskPortionSize(e.target.value)}
              style={styles.taskQuantityInput}
              className="comment-input"
            />

            <p style={styles.taskQuantityHint}>
              Leave blank to use the same details as {partnerName ? partnerName.split(" ")[0] : "your partner"}
            </p>

            <div style={{ marginTop: "1rem" }}>
              <MealNutritionCard
                nutrition={{
                  calories: parseInt(taskCalories) || 0,
                  protein_g: parseInt(taskProtein) || 0,
                  carbs_g: parseInt(taskCarbs) || 0,
                  fat_g: parseInt(taskFat) || 0,
                  fiber_g: parseInt(taskFiber) || 0,
                }}
                editable={true}
                onNutritionChange={(key, value) => {
                  setTaskMacrosModified(true);
                  if (key === 'calories') setTaskCalories(String(value));
                  if (key === 'protein_g') setTaskProtein(String(value));
                  if (key === 'carbs_g') setTaskCarbs(String(value));
                  if (key === 'fat_g') setTaskFat(String(value));
                  if (key === 'fiber_g') setTaskFiber(String(value));
                }}
              />
            </div>

            {/* Save to Frequent Option */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "1.2rem",
                marginTop: "0.5rem",
                cursor: "pointer"
              }}
              onClick={() => setTaskSaveToFrequent(!taskSaveToFrequent)}
            >
              <div style={{
                width: "20px",
                height: "20px",
                borderRadius: "6px",
                border: "2px solid #ff6b6b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: taskSaveToFrequent ? "#ff6b6b" : "transparent",
                transition: "all 0.2s ease"
              }}>
                {taskSaveToFrequent && <span style={{ color: "white", fontSize: "14px" }}>✓</span>}
              </div>
              <p style={{ fontSize: "0.88rem", color: "#444", margin: 0, fontWeight: "500" }}>
                Save to my frequent meals
              </p>
            </div>

            {/* Complete button */}
            <button
              style={{
                ...styles.taskCompleteButton,
                opacity: taskSaving ? 0.6 : 1,
              }}
              onClick={handleTaskComplete}
              disabled={taskSaving}
            >
              {taskSaving ? "Saving..." : "Complete Task ✓"}
            </button>

            {/* Dismiss */}
            <button
              style={styles.taskDismissButton}
              onClick={handleTaskDismiss}
            >
              Dismiss — I didn't have this
            </button>

          </div>
        </div>
      )}
    </>
  );
}

const styles = {
  container: {
    maxWidth: "400px",
    margin: "0 auto",
    padding: "1rem 1.5rem 5rem 1.5rem",
    backgroundColor: "#fffaf5",
    minHeight: "100vh",
  },
  brandingHeader: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "0.5rem 0 1rem 0",
    marginBottom: "0.5rem",
  },
  appName: {
    fontFamily: "'Instrument Serif', serif",
    fontSize: "2.4rem",
    color: "#333",
    margin: 0,
    fontWeight: "400",
    letterSpacing: "-0.02em",
  },
  title: {
    fontSize: "1.8rem",
    color: "#333",
    marginBottom: "1.5rem",
  },
  card: {
    backgroundColor: "white",
    borderRadius: "12px",
    padding: "1.2rem",
    marginBottom: "1.5rem",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  cardRow: {
    display: "flex",
    alignItems: "center",
    marginBottom: "1rem",
  },
  avatar: {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    marginRight: "1rem",
    objectFit: "cover",
  },
  cardInfo: {
    flex: 1,
  },
  name: {
    fontWeight: "bold",
    fontSize: "1rem",
    color: "#333",
    margin: 0,
  },
  mealCount: {
    color: "#666",
    fontSize: "0.85rem",
    margin: 0,
  },
  sectionTitle: {
    fontSize: "1.1rem",
    color: "#555",
    marginBottom: "0.8rem",
  },
  empty: {
    color: "#666",
    fontSize: "0.95rem",
    textAlign: "center",
    marginTop: "2rem",
  },
  mealCard: {
    backgroundColor: "white",
    borderRadius: "12px",
    padding: "1rem",
    marginBottom: "0.8rem",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
    display: "flex",
    alignItems: "center",
  },
  mealPhoto: {
    width: "56px",
    height: "56px",
    borderRadius: "8px",
    objectFit: "cover",
    marginRight: "1rem",
    flexShrink: 0,
  },
  mealInfo: {
    flex: 1,
  },
  mealName: {
    fontWeight: "bold",
    color: "#333",
    margin: 0,
    fontSize: "0.95rem",
  },
  mealMeta: {
    color: "#666",
    fontSize: "0.85rem",
    margin: "2px 0 0 0",
  },
  fab: {
    position: "fixed",
    bottom: "90px",
    right: "24px",
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    backgroundColor: "#ff6b6b",
    color: "white",
    fontSize: "2rem",
    border: "none",
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(255,107,107,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  mealHeader: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
  },
  mealOwner: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.2rem",
    marginLeft: "0.5rem",
  },
  ownerAvatar: {
    width: "28px",
    height: "28px",
    borderRadius: "50%",
  },
  ownerName: {
    fontSize: "0.7rem",
    color: "#666",
    margin: 0,
  },
  overlay: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
    zIndex: 150,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1.5rem",
    animation: "fadeInOverlay 0.3s ease both",
    backdropFilter: "blur(4px)",
  },
  sheet: {
    backgroundColor: "white",
    borderRadius: "24px",
    padding: "1.5rem",
    width: "100%",
    maxWidth: "380px",
    maxHeight: "85vh",
    overflowY: "auto",
    animation: "bloomOpen 0.4s cubic-bezier(0.22, 1, 0.36, 1) both",
    boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
  },
  sheetTitle: {
    fontWeight: "bold",
    fontSize: "1.1rem",
    color: "#333",
    margin: "0 0 4px 0",
  },
  sheetMeta: {
    color: "#666",
    fontSize: "0.85rem",
    margin: "0 0 1rem 0",
  },
  editButton: {
    width: "100%",
    padding: "0.5rem",
    backgroundColor: "transparent",
    color: "#888",
    border: "1px solid #eee",
    borderRadius: "8px",
    fontSize: "0.85rem",
    cursor: "pointer",
    marginBottom: "0.4rem",
  },
  deleteButton: {
    width: "100%",
    padding: "0.5rem",
    backgroundColor: "transparent",
    color: "#ffaaaa",
    border: "1px solid #ffeeee",
    borderRadius: "8px",
    fontSize: "0.85rem",
    cursor: "pointer",
    marginBottom: "0.4rem",
  },
  cancelButton: {
    width: "100%",
    padding: "0.5rem",
    backgroundColor: "transparent",
    color: "#888",
    border: "none",
    borderRadius: "8px",
    fontSize: "0.8rem",
    cursor: "pointer",
  },
  editLabel: {
    fontSize: "0.9rem",
    color: "#555",
    marginBottom: "0.4rem",
  },
  typeRow: {
    display: "flex",
    gap: "0.5rem",
    marginBottom: "1rem",
  },
  typeButton: {
    flex: 1,
    padding: "0.5rem 0",
    border: "1px solid #eee",
    borderRadius: "8px",
    fontSize: "0.75rem",
    cursor: "pointer",
  },
  photoBox: {
    width: "100%",
    backgroundColor: "#f9f9f9",
    borderRadius: "10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    marginBottom: "1rem",
    minHeight: "100px",
    overflow: "hidden",
  },
  editInput: {
    width: "100%",
    padding: "0.6rem",
    fontSize: "1rem",
    borderRadius: "8px",
    border: "1px solid #ddd",
    marginBottom: "1rem",
    boxSizing: "border-box",
  },
  reactionRow: {
    display: "flex",
    justifyContent: "space-around",
    marginBottom: "1.2rem",
    marginTop: "0.5rem",
  },
  reactionButton: {
    width: "52px",
    height: "52px",
    borderRadius: "50%",
    fontSize: "1.5rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  reactionsRow: {
    display: "flex",
    gap: "4px",
    marginTop: "4px",
    flexWrap: "wrap",
  },
  reactionBadge: {
    fontSize: "1rem",
    backgroundColor: "transparent",
    borderRadius: "12px",
    padding: "2px 2px",
    border: "none",
  },
  viewPhotoWrapper: {
    width: "100%",
    borderRadius: "16px",
    overflow: "hidden",
    marginBottom: "1rem",
    aspectRatio: "4/3",
  },
  viewPhoto: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  viewInfo: {
    marginBottom: "1rem",
  },
  viewHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  viewName: {
    fontWeight: "bold",
    fontSize: "1.2rem",
    color: "#333",
    margin: "0 0 4px 0",
  },
  viewMeta: {
    color: "#666",
    fontSize: "0.85rem",
    margin: 0,
  },
  viewAvatar: {
    width: "42px",
    height: "42px",
    borderRadius: "50%",
  },
  commentRow: {
    borderTop: "1px solid #f5f5f5",
    paddingTop: "1rem",
    marginTop: "0.5rem",
  },
  commentInputRow: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
  },
  commentInput: {
    flex: 1,
    padding: "0.6rem",
    fontSize: "0.9rem",
    borderRadius: "8px",
    border: "1px solid #eee",
    outline: "none",
    color: "#333",
  },
  commentButton: {
    padding: "0.6rem 1rem",
    backgroundColor: "#ff6b6b",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "0.85rem",
    cursor: "pointer",
  },
  actionRow: {
    display: "flex",
    gap: "0.5rem",
    marginTop: "0.8rem",
  },
  reactionOverlay: {
    position: "absolute",
    top: "10px",
    right: "10px",
    fontSize: "1.6rem",
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: "50%",
    width: "36px",
    height: "36px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  },
  nutritionCard: {
    backgroundColor: "white",
    borderRadius: "16px",
    padding: "1rem 1.2rem",
    marginBottom: "1rem",
    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
    animation: "slideUpFade 0.4s ease both",
  },
  nutritionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.8rem",
  },
  nutritionTitle: {
    fontSize: "0.85rem",
    fontWeight: "600",
    color: "#333",
    margin: 0,
  },
  nutritionCalories: {
    fontSize: "0.85rem",
    color: "#ff6b6b",
    fontWeight: "600",
    margin: 0,
    animation: "countUp 0.5s ease both",
  },
  macroPillRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "0.4rem",
    marginTop: "0.6rem",
  },
  macroPill: {
    flex: 1,
    backgroundColor: "#fafafa",
    borderRadius: "10px",
    padding: "0.5rem 0.3rem",
    textAlign: "center",
  },
  macroPillLabel: {
    fontSize: "0.65rem",
    color: "#777",
    margin: "0 0 2px 0",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  macroPillValue: {
    fontSize: "1rem",
    fontWeight: "700",
    margin: 0,
  },
  editSaveButton: {
    width: "100%",
    padding: "0.75rem",
    backgroundColor: "#ffffff",
    color: "#888",
    border: "none",
    borderRadius: "10px",
    fontSize: "0.85rem",
    fontWeight: "600",
    cursor: "pointer",
    marginTop: "0.5rem",
    marginBottom: "0.4rem",
  },
  photoGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
    marginBottom: "0.5rem",
  },
  photoThumbWrapper: {
    position: "relative",
    width: "80px",
    height: "80px",
  },
  photoThumb: {
    width: "80px",
    height: "80px",
    objectFit: "cover",
    borderRadius: "10px",
  },
  removePhotoBtn: {
    position: "absolute",
    top: "-6px",
    right: "-6px",
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    backgroundColor: "#ff6b6b",
    color: "white",
    border: "none",
    fontSize: "0.65rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
  addMorePhoto: {
    width: "80px",
    height: "80px",
    borderRadius: "10px",
    border: "2px dashed #eee",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    backgroundColor: "#fafafa",
  },
  addMorePhotoPlus: {
    fontSize: "1.4rem",
    color: "#888",
    margin: 0,
    lineHeight: 1,
  },
  addMorePhotoLabel: {
    fontSize: "0.65rem",
    color: "#888",
    margin: "2px 0 0 0",
  },
  photoStack: {
    position: "relative",
    width: "56px",
    height: "56px",
    marginRight: "1rem",
    flexShrink: 0,
  },
  photoCountBadge: {
    position: "absolute",
    bottom: "8px",
    right: "8px",
    backgroundColor: "rgba(255,255,255,0.9)",
    color: "#555",
    fontSize: "0.7rem",
    fontWeight: "600",
    padding: "4px 10px",
    borderRadius: "999px",
    zIndex: 10,
    boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
  },
  sharedAvatarStack: {
    position: "relative",
    width: "42px",
    height: "28px",
  },
  weightCheckInSheet: {
    backgroundColor: "white",
    borderRadius: "24px",
    padding: "1.8rem 1.5rem 1.2rem",
    width: "100%",
    maxWidth: "380px",
    animation: "bloomOpen 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
    boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
  },
  weightCheckInEyebrow: {
    fontSize: "0.72rem",
    color: "#ffb3b3",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    margin: "0 0 4px 0",
    fontWeight: "600",
  },
  weightCheckInTitle: {
    fontSize: "1.4rem",
    fontWeight: "700",
    color: "#333",
    margin: "0 0 4px 0",
  },
  weightCheckInPeriod: {
    fontSize: "0.78rem",
    color: "#777",
    margin: "0 0 1.5rem 0",
  },
  weightInputWrapper: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginBottom: "1.2rem",
    backgroundColor: "#fafafa",
    borderRadius: "12px",
    padding: "0.8rem 1rem",
  },
  weightInput: {
    flex: 1,
    border: "none",
    backgroundColor: "transparent",
    fontSize: "2rem",
    fontWeight: "700",
    color: "#333",
    outline: "none",
    width: "100%",
  },
  weightInputUnit: {
    fontSize: "1rem",
    color: "#777",
    fontWeight: "500",
  },
  weightCheckInButton: {
    width: "100%",
    padding: "0.85rem",
    backgroundColor: "#ff6b6b",
    color: "white",
    border: "none",
    borderRadius: "12px",
    fontSize: "0.95rem",
    fontWeight: "600",
    cursor: "pointer",
    marginBottom: "0.6rem",
  },
  weightSnoozeButton: {
    width: "100%",
    padding: "0.5rem",
    backgroundColor: "transparent",
    color: "#888",
    border: "none",
    fontSize: "0.82rem",
    cursor: "pointer",
  },
  insightBanner: {
    backgroundColor: "#fffaf5",
    border: "1px solid #ffddcc",
    borderRadius: "12px",
    padding: "0.8rem 1rem",
    marginBottom: "1rem",
    animation: "slideUpFade 0.4s ease both",
  },
  insightBannerText: {
    fontSize: "0.88rem",
    color: "#ff6b6b",
    margin: 0,
    fontWeight: "500",
  },
  insightPopup: {
    backgroundColor: "white",
    borderRadius: "24px",
    padding: "1.8rem 1.5rem 1.2rem",
    width: "100%",
    maxWidth: "380px",
    maxHeight: "85vh",
    overflowY: "auto",
    animation: "bloomOpen 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
    boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
  },
  insightPopupEyebrow: {
    fontSize: "0.72rem",
    color: "#ffb3b3",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    margin: "0 0 4px 0",
    fontWeight: "600",
  },
  insightPopupPeriod: {
    fontSize: "0.78rem",
    color: "#777",
    margin: "0 0 1rem 0",
  },
  insightWeightRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fafafa",
    borderRadius: "12px",
    padding: "0.8rem 1rem",
    marginBottom: "0.5rem",
  },
  insightWeightItem: {
    textAlign: "center",
  },
  insightWeightLabel: {
    fontSize: "0.65rem",
    color: "#777",
    margin: "0 0 2px 0",
    textTransform: "uppercase",
  },
  insightWeightValue: {
    fontSize: "1.1rem",
    fontWeight: "700",
    color: "#333",
    margin: 0,
  },
  insightWeightArrow: {
    fontSize: "1rem",
    color: "#666",
  },
  insightWeightDelta: {
    fontSize: "0.82rem",
    fontWeight: "600",
    margin: "0 0 0.8rem 0",
    textAlign: "center",
  },
  insightDivider: {
    height: "1px",
    backgroundColor: "#f5f5f5",
    margin: "0.8rem 0",
  },
  insightPopupText: {
    fontSize: "0.92rem",
    color: "#444",
    lineHeight: 1.7,
    margin: "0 0 0.8rem 0",
    whiteSpace: "pre-line",
  },
  insightDisclaimer: {
    fontSize: "0.65rem",
    color: "#666",
    textAlign: "center",
    margin: "0 0 1rem 0",
  },
  insightPopupButton: {
    width: "100%",
    padding: "0.85rem",
    backgroundColor: "#ff6b6b",
    color: "white",
    border: "none",
    borderRadius: "12px",
    fontSize: "0.95rem",
    fontWeight: "600",
    cursor: "pointer",
  },
  weightLastDayWarning: {
    fontSize: "0.78rem",
    color: "#ffb347",
    textAlign: "center",
    margin: "0.3rem 0 0 0",
    fontWeight: "500",
  },
  taskHint: {
    display: "inline-block",
    marginTop: "0.4rem",
    backgroundColor: "#fff0ee",
    color: "#ff6b6b",
    fontSize: "0.72rem",
    fontWeight: "600",
    padding: "3px 10px",
    borderRadius: "999px",
    border: "1px solid #ffddda",
    animation: "pulseTask 2s ease-in-out infinite",
  },
  taskPartnerQuantity: {
    backgroundColor: "#fafafa",
    borderRadius: "10px",
    padding: "0.7rem 1rem",
    marginBottom: "0.8rem",
  },
  taskPartnerQuantityLabel: {
    fontSize: "0.72rem",
    color: "#777",
    margin: "0 0 3px 0",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  taskPartnerQuantityText: {
    fontSize: "0.9rem",
    color: "#555",
    margin: 0,
    fontStyle: "italic",
  },
  taskYourQuantityLabel: {
    fontSize: "0.82rem",
    color: "#555",
    fontWeight: "600",
    margin: "0 0 0.5rem 0",
  },
  taskQuantityInput: {
    width: "100%",
    padding: "0.7rem 1rem",
    fontSize: "0.9rem",
    borderRadius: "10px",
    border: "1px solid #eee",
    outline: "none",
    color: "#333",
    backgroundColor: "#fafafa",
    boxSizing: "border-box",
    marginBottom: "1rem",
  },
  taskCompleteButton: {
    width: "100%",
    padding: "0.85rem",
    backgroundColor: "#ff6b6b",
    color: "white",
    border: "none",
    borderRadius: "12px",
    fontSize: "0.95rem",
    fontWeight: "600",
    cursor: "pointer",
    marginBottom: "0.5rem",
  },
  taskDismissButton: {
    width: "100%",
    padding: "0.5rem",
    backgroundColor: "transparent",
    color: "#888",
    border: "none",
    fontSize: "0.78rem",
    cursor: "pointer",
  },
  taskQuantityHint: {
    fontSize: "0.7rem",
    color: "#888",
    margin: "-0.6rem 0 1rem 0",
    textAlign: "center",
  },
  // --- Nutrient Goals Styles ---
  goalsCard: {
    backgroundColor: "white",
    borderRadius: "16px",
    padding: "1rem 1.2rem",
    marginBottom: "1rem",
    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
    animation: "slideUpFade 0.4s ease both",
  },
  goalsHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.8rem",
  },
  goalsTitle: {
    fontSize: "0.85rem",
    fontWeight: "600",
    color: "#333",
    margin: 0,
  },
  goalsEditButton: {
    backgroundColor: "transparent",
    border: "1px solid #eee",
    borderRadius: "8px",
    padding: "4px 12px",
    fontSize: "0.72rem",
    color: "#888",
    cursor: "pointer",
  },
  goalCalorieRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    marginBottom: "1rem",
    padding: "0.6rem 0",
    borderBottom: "1px solid #f5f5f5",
  },
  goalCalorieEaten: {
    fontSize: "1.4rem",
    fontWeight: "700",
    color: "#333",
    margin: 0,
  },
  goalCalorieTarget: {
    fontSize: "1.4rem",
    fontWeight: "700",
    color: "#ccc",
    margin: 0,
  },
  goalCalorieRemaining: {
    fontSize: "1.1rem",
    fontWeight: "700",
    margin: 0,
    textAlign: "right",
  },
  goalCalorieLabel: {
    fontSize: "0.65rem",
    color: "#999",
    margin: 0,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  goalCalorieDivider: {
    marginTop: "-2px",
  },
  goalCalorieDividerText: {
    fontSize: "1.2rem",
    color: "#ddd",
    margin: 0,
    fontWeight: "300",
  },
  goalMacroList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  goalMacroRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
  },
  goalMacroLabel: {
    fontSize: "0.72rem",
    color: "#777",
    margin: 0,
    width: "48px",
    flexShrink: 0,
  },
  goalMacroBarTrack: {
    flex: 1,
    height: "6px",
    backgroundColor: "#f0f0f0",
    borderRadius: "999px",
    overflow: "hidden",
  },
  goalMacroBarFill: {
    height: "100%",
    borderRadius: "999px",
    transition: "width 0.5s ease",
  },
  goalMacroValues: {
    fontSize: "0.72rem",
    color: "#555",
    margin: 0,
    minWidth: "60px",
    textAlign: "right",
    fontWeight: "500",
  },
  goalSetupCard: {
    backgroundColor: "white",
    borderRadius: "16px",
    padding: "1rem 1.2rem",
    marginBottom: "1rem",
    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
    border: "1px dashed #ffcccc",
    animation: "slideUpFade 0.4s ease both",
  },
  goalSetupInner: {
    display: "flex",
    alignItems: "center",
    gap: "0.8rem",
  },
  goalSetupEmoji: {
    fontSize: "1.6rem",
    margin: 0,
  },
  goalSetupTitle: {
    fontSize: "0.92rem",
    fontWeight: "600",
    color: "#333",
    margin: "0 0 2px 0",
  },
  goalSetupSub: {
    fontSize: "0.75rem",
    color: "#888",
    margin: 0,
  },
  goalSetupArrow: {
    fontSize: "1.2rem",
    color: "#ff6b6b",
    fontWeight: "600",
  },
  goalOptionButton: {
    width: "100%",
    padding: "1rem",
    backgroundColor: "#fafafa",
    border: "1px solid #eee",
    borderRadius: "12px",
    fontSize: "0.88rem",
    cursor: "pointer",
    marginBottom: "0.6rem",
    textAlign: "left",
    display: "flex",
    alignItems: "center",
    gap: "0.8rem",
    color: "#333",
  },
  goalOptionEmoji: {
    fontSize: "1.4rem",
  },
  goalOptionSub: {
    fontSize: "0.75rem",
    color: "#888",
    fontWeight: "400",
  },
  goalInputRow: {
    marginBottom: "0.8rem",
  },
  goalInputLabel: {
    fontSize: "0.78rem",
    color: "#555",
    margin: "0 0 4px 0",
    fontWeight: "500",
  },
  goalInputWrapper: {
    display: "flex",
    alignItems: "center",
    backgroundColor: "#fafafa",
    borderRadius: "10px",
    border: "1px solid #eee",
    padding: "0 0.8rem",
  },
  goalInput: {
    flex: 1,
    border: "none",
    backgroundColor: "transparent",
    padding: "0.7rem 0",
    fontSize: "1rem",
    color: "#333",
    outline: "none",
    fontWeight: "600",
  },
  goalInputUnit: {
    fontSize: "0.8rem",
    color: "#999",
    fontWeight: "500",
  },
  goalGenderRow: {
    display: "flex",
    gap: "0.5rem",
  },
  goalGenderButton: {
    flex: 1,
    padding: "0.6rem 0",
    border: "1px solid #eee",
    borderRadius: "10px",
    fontSize: "0.85rem",
    cursor: "pointer",
    fontWeight: "500",
    transition: "all 0.2s ease",
  },
  goalSaveButton: {
    width: "100%",
    padding: "0.85rem",
    backgroundColor: "#ff6b6b",
    color: "white",
    border: "none",
    borderRadius: "12px",
    fontSize: "0.95rem",
    fontWeight: "600",
    cursor: "pointer",
    marginTop: "0.5rem",
    marginBottom: "0.4rem",
  },
};

export default Today;