import React, { useEffect, useState } from "react";
import { db, auth, storage } from "../firebase";
import { collection, query, where, onSnapshot, updateDoc, deleteDoc, doc, getDoc, getDocs, addDoc } from "firebase/firestore";
import { compressImage } from "../utils/compressImage";
import { getFunctions, httpsCallable } from "firebase/functions";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getPhotos } from "../utils/getPhotos";
import { formatLocalDateKey, getMealLocalDateKey } from "../utils/dateTime";
import { shouldShowWeightCheckIn } from "../utils/shouldShowWeightCheckIn";
import OnboardingPopup from "../components/OnboardingPopup";
import PhotoCarousel from "../components/PhotoCarousel";
import MealNutritionCard from "../components/MealNutritionCard";
import PartnerResponseCard from "../components/PartnerResponseCard";

function Today({ setCurrentPage }) {
  const user = auth.currentUser;
  const [meals, setMeals] = useState([]);
  const [partnerUid, setPartnerUid] = useState(null);
  const [partnerPhoto, setPartnerPhoto] = useState(null);
  const [partnerName, setPartnerName] = useState(null);
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
  const [profileFields, setProfileFields] = useState(null);
  const [editQuantity, setEditQuantity] = useState("");
  const [reanalyzing, setReanalyzing] = useState(false);

  const [myPhoto, setMyPhoto] = useState(user.photoURL);
  const [weightCheckIn, setWeightCheckIn] = useState(null);
  const [newWeight, setNewWeight] = useState("");
  const [weightCheckInSaving, setWeightCheckInSaving] = useState(false);
  const [insightBanner, setInsightBanner] = useState(null); // null | "generating" | "ready"
  const [weightInsight, setWeightInsight] = useState(null);
  const [pendingTasks, setPendingTasks] = useState([]);
  const [activeTask, setActiveTask] = useState(null);
  const [taskQuantity, setTaskQuantity] = useState("");
  const [taskSaving, setTaskSaving] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);

  useEffect(() => {
    const fetchPartner = async () => {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists() && userSnap.data().photoURL) {
        setMyPhoto(userSnap.data().photoURL);
      }
      // Weight check-in logic
      if (userSnap.exists()) {
        const userData = userSnap.data();
        const { shouldShow, checkInDate, periodStart, periodEnd, isLastDay, dayNumber } =
          shouldShowWeightCheckIn({
            lastWeightCheckIn: userData.lastWeightCheckIn || null,
            weightInsightSnooze: userData.weightInsightSnooze || null,
          });

        if (shouldShow) {
          setWeightCheckIn({ checkInDate, periodStart, periodEnd, isLastDay, dayNumber });
          setNewWeight(userData.weight_kg || "");
        }

        // Check for any ready weight insight to show banner
        const insightsSnap = await getDocs(
          collection(db, "users", user.uid, "weightInsights")
        );
        if (!insightsSnap.empty) {
          const latest = insightsSnap.docs
            .sort((a, b) => b.id.localeCompare(a.id))[0];
          const insightData = latest.data();
          if (!insightData.dismissed) {
            setWeightInsight({ ...insightData, id: latest.id });
            setInsightBanner("ready");
          }
        }
      }
      if (userSnap.exists() && userSnap.data().partnerUid) {
        const pUid = userSnap.data().partnerUid;
        setPartnerUid(pUid);
        const partnerRef = doc(db, "users", pUid);
        const partnerSnap = await getDoc(partnerRef);
        if (partnerSnap.exists()) {
          setPartnerPhoto(partnerSnap.data().photoURL);
          setPartnerName(partnerSnap.data().name);
        }
      }
      // Check if new user — no meals logged ever
      if (userSnap.exists()) {
        const userData = userSnap.data();
        const createdAt = userData.createdAt?.toDate?.() || new Date();
        const minutesSinceSignup = (new Date() - createdAt) / (1000 * 60);
        if (minutesSinceSignup < 10 && !userData.onboardingDismissed) {
          setIsNewUser(true);
        } else {
          setIsNewUser(false);
        }
      }
    };
    fetchPartner();
  }, [user.uid]);

  useEffect(() => {
    const uids = partnerUid ? [user.uid, partnerUid] : [user.uid];
    const now = new Date();
    const recentStart = new Date(now.getTime() - 42 * 60 * 60 * 1000);
    const q = query(
      collection(db, "meals"),
      where("uid", "in", uids),
      where("createdAt", ">=", recentStart)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const todayLocalDate = formatLocalDateKey(now);
      const yesterdayLocalDate = formatLocalDateKey(
        new Date(now.getTime() - 24 * 60 * 60 * 1000)
      );
      const tomorrowLocalDate = formatLocalDateKey(
        new Date(now.getTime() + 24 * 60 * 60 * 1000)
      );

      const data = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((m) => {
          // Never show task-completed meals on Today feed
          // They're represented by the original shared meal card
          if (m.sourceMealId) return false;

          const isOwn = m.uid === user.uid;
          const mealLocalDate = getMealLocalDateKey(m);

          if (isOwn) {
            return mealLocalDate === todayLocalDate;
          } else {
            const mealTime = m.createdAt?.toDate
              ? m.createdAt.toDate()
              : new Date(m.createdAt);
            const withinWindow = mealTime >= new Date(now.getTime() - 18 * 60 * 60 * 1000);
            const isRelevantDate = mealLocalDate === todayLocalDate ||
              mealLocalDate === yesterdayLocalDate ||
              mealLocalDate === tomorrowLocalDate;

            // If the meal is from today's localDate, always show it
            if (mealLocalDate === todayLocalDate) {
              return withinWindow && isRelevantDate;
            }

            // For non-today partner meals (yesterday/tomorrow due to timezone),
            // only keep them visible until 9am local time — after that, let them go
            const currentHour = now.getHours();
            if (currentHour >= 9) return false;

            return withinWindow && isRelevantDate;
          }
        });
      const sorted = data.sort((a, b) => {
        const aTime = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
        const bTime = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
        return bTime - aTime;
      });
      setMeals(sorted);
      // Calculate today's nutrition from my meals only
      // Include partner's shared meals in your nutrition
      // ALL user meals including task-completed for accurate nutrition
      // Get today's date fresh inside the callback
      const todayNow = new Date();
      const todayDateStr = formatLocalDateKey(todayNow);

      // Only count TODAY's meals for nutrition — filter by localDate
      const allMyMeals = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((m) => {
          if (m.uid !== user.uid) return false;
          if (!m.nutrition) return false;
          const mealDate = getMealLocalDateKey(m);
          return mealDate === todayDateStr;
        });

      if (allMyMeals.length > 0) {
        const totals = allMyMeals.reduce((acc, m) => ({
          calories: acc.calories + (m.nutrition.calories || 0),
          protein_g: acc.protein_g + (m.nutrition.protein_g || 0),
          carbs_g: acc.carbs_g + (m.nutrition.carbs_g || 0),
          fat_g: acc.fat_g + (m.nutrition.fat_g || 0),
          fiber_g: acc.fiber_g + (m.nutrition.fiber_g || 0),
        }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });
        setNutrition(totals);
      } else {
        setNutrition({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });
      }

    });
    // Fetch user profile for daily goals
    const fetchProfile = async () => {
      const userSnap = await getDoc(doc(db, "users", user.uid));
      if (userSnap.exists()) setProfileFields(userSnap.data());
    };
    fetchProfile();
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

  const mealCount = meals.length;

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
      const quantityChanged = editQuantity.trim() !== (selectedMeal.quantity || "");
      const nameChanged = editName.trim() !== selectedMeal.name;
      const photosChanged = JSON.stringify(finalPhotos) !== JSON.stringify(existingURLs);

      const updateData = {
        name: editName.trim() || selectedMeal.name,
        type: editType,
        photoURL: finalPhotos[0] || null,
        photos: finalPhotos,
        ...(editQuantity.trim() ? { quantity: editQuantity.trim() } : { quantity: "" }),
      };

      await updateDoc(mealRef, updateData);

      // Reanalyze if name, quantity or photos changed
      if (nameChanged || quantityChanged || photosChanged) {
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

      // Call Cloud Function async
      const { getFunctions, httpsCallable } = await import("firebase/functions");
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

      await addDoc(collection(db, "meals"), {
        uid: user.uid,
        name: activeTask.mealName,
        type: activeTask.mealType,
        photoURL: activeTask.photos?.[0] || null,
        photos: activeTask.photos || [],
        quantity: taskQuantity.trim() || activeTask.fromQuantity || "",
        isShared: true,
        isRestaurant: activeTask.isRestaurant || false,
        sourceMealId: activeTask.sourceMealId,
        // Both date AND time from original meal — task completion time is irrelevant
        localDate: activeTask.localDate || now.toLocaleDateString("en-CA"),
        localTime: activeTask.localTime || "",
        createdAt: now,
      });

      // Mark task complete
      await updateDoc(doc(db, "tasks", activeTask.id), {
        completed: true,
        completedAt: now,
      });

      setActiveTask(null);
      setTaskQuantity("");
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
    setTaskQuantity("");
  };

  
  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Today</h2>

      {/* Progress Card */}
      <div style={styles.card}>
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

      {/* Daily Nutrition Card */}
      {nutrition.calories > 0 && profileFields && (
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

      {/* Meals Feed */}
      <h3 style={styles.sectionTitle}>Meals Today</h3>
      {meals.length === 0 && (
        <p style={styles.empty}>No meals logged yet today. Add your first one!</p>
      )}
      {meals.map((meal) => {
        const ismine = meal.uid === user.uid;
        const avatarSrc = ismine ? myPhoto : partnerPhoto;
        const personName = ismine ? user.displayName.split(" ")[0] : (partnerName ? partnerName.split(" ")[0] : "Partner");
        const isPartnerMeal = meal.uid !== user.uid;
        return (
          <div key={meal.id} style={styles.mealCard} onClick={() => {
            if (isPartnerMeal) {
              const pendingTask = getPendingTaskForMeal(meal);
              if (pendingTask) {
                setActiveTask(pendingTask);
                setTaskQuantity("");
              } else {
                setViewMeal(meal);
                setComment(meal.comments?.[user.uid] || "");
              }
            } else {
              setSelectedMeal(meal);
              setEditType(meal.type);
              setEditName(meal.name);
              setEditQuantity(meal.quantity || "");
              setEditMode(false);
              const existingPhotos = meal.photos?.length > 0
                ? meal.photos
                : meal.photoURL ? [meal.photoURL] : [];
              setEditPhotos([]);
              setEditPhotoPreviews(existingPhotos);
            }
          }}>
            {(() => {
                const mealPhotos = getPhotos(meal);
                if (mealPhotos.length === 0) return null;
                if (mealPhotos.length === 1) return (
                  <img src={mealPhotos[0]} alt="meal" style={styles.mealPhoto} />
                );
                // Stacked deck for multiple photos
                // Stacked deck for multiple photos
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
                <p style={styles.mealName}>{meal.name}</p>
              </div>
              <p style={styles.mealMeta}>{meal.type}</p>
              {meal.reactions && Object.keys(meal.reactions).length > 0 && (
                <div style={styles.reactionsRow}>
                  {Object.entries(meal.reactions).map(([uid, emoji]) => (
                    <span key={uid} style={styles.reactionBadge}>
                      {emoji}
                    </span>
                  ))}
                </div>
              )}
              {/* Task hint */}
              {isPartnerMeal && getPendingTaskForMeal(meal) && (
                <div style={styles.taskHint}>
                  ✨ Add your quantities →
                </div>
              )}
            </div>
            <div style={styles.mealOwner}>
              {meal.isShared ? (
                <div style={styles.sharedAvatarStack}>
                  <img
                    src={ismine ? myPhoto : partnerPhoto}
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
      {/* Bottom Sheet */}
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
                <MealNutritionCard nutrition={selectedMeal.nutrition} />

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
                <input
                type="text"
                value={editQuantity}
                onChange={(e) => setEditQuantity(e.target.value)}
                style={styles.quantityInput}
                placeholder="Quantity or ingredients (optional)"
                className="quantity-input"
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
                      <button style={styles.editButton} onClick={() => document.getElementById("editPhotoInput").click()}>
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
                This is your last chance until the 15th!
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
            if (insightBanner === "ready" && weightInsight) {
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
      {insightBanner === "open" && weightInsight && (
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
              {weightInsight.periodStart} → {weightInsight.periodEnd}
            </p>

            {/* Weight summary */}
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

            <div style={styles.insightDivider} />

            {/* Insight text */}
            <p style={styles.insightPopupText}>{weightInsight.insight}</p>

            <p style={styles.insightDisclaimer}>
              AI-generated · Not medical advice
            </p>

            <button
              style={styles.insightPopupButton}
              onClick={async () => {
                setInsightBanner(null);
                await updateDoc(
                  doc(db, "users", user.uid, "weightInsights", weightInsight.id),
                  { dismissed: true }
                );
              }}
            >
              Got it 👍
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

            {/* Partner's quantity */}
            {activeTask.fromQuantity && (
              <div style={styles.taskPartnerQuantity}>
                <p style={styles.taskPartnerQuantityLabel}>
                  {partnerName ? partnerName.split(" ")[0] : "Partner"} had:
                </p>
                <p style={styles.taskPartnerQuantityText}>
                  "{activeTask.fromQuantity}"
                </p>
              </div>
            )}

            <div style={styles.insightDivider} />

            {/* Her quantity input */}
            <p style={styles.taskYourQuantityLabel}>Your quantity</p>
            <input
              type="text"
              placeholder={activeTask.fromQuantity || "What did you have?"}
              value={taskQuantity}
              onChange={(e) => setTaskQuantity(e.target.value)}
              style={styles.taskQuantityInput}
              className="comment-input"
            />
            <p style={styles.taskQuantityHint}>
              Leave blank to use the same quantity as {partnerName ? partnerName.split(" ")[0] : "your partner"}
            </p>

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
    </div>
  );
}

const styles = {
  container: {
    maxWidth: "400px",
    margin: "0 auto",
    padding: "2rem 1.5rem",
    backgroundColor: "#fffaf5",
    minHeight: "100vh",
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
  calories: {
    color: "#ff6b6b",
    fontSize: "0.95rem",
    margin: "2px 0",
  },
  mealCount: {
    color: "#aaa",
    fontSize: "0.85rem",
    margin: 0,
  },
  circleContainer: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  circleLabel: {
    position: "absolute",
    fontSize: "0.7rem",
    color: "#333",
    margin: 0,
  },
  progressBar: {
    height: "8px",
    backgroundColor: "#f0f0f0",
    borderRadius: "4px",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#ff6b6b",
    borderRadius: "4px",
    transition: "width 0.4s ease",
  },
  sectionTitle: {
    fontSize: "1.1rem",
    color: "#555",
    marginBottom: "0.8rem",
  },
  empty: {
    color: "#aaa",
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
    color: "#aaa",
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
  sharedBadge: {
    fontSize: "0.8rem",
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
    color: "#aaa",
    margin: 0,
  },
  overlay: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 150,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1.5rem",
    animation: "fadeInOverlay 0.25s ease",
  },
  sheet: {
    backgroundColor: "white",
    borderRadius: "20px",
    padding: "1.5rem",
    width: "100%",
    maxWidth: "380px",
    maxHeight: "85vh",
    overflowY: "auto",
    animation: "bloomOpen 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
  },
  sheetTitle: {
    fontWeight: "bold",
    fontSize: "1.1rem",
    color: "#333",
    margin: "0 0 4px 0",
  },
  sheetMeta: {
    color: "#aaa",
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
    color: "#ccc",
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
    color: "#aaa",
    fontSize: "0.85rem",
    margin: 0,
  },
  viewAvatar: {
    width: "42px",
    height: "42px",
    borderRadius: "50%",
  },
  viewReaction: {
    fontSize: "0.85rem",
    color: "#aaa",
    margin: "0.5rem 0 0 0",
  },
  viewReactionRow: {
    borderTop: "1px solid #f5f5f5",
    paddingTop: "1rem",
  },
  viewReactionLabel: {
    fontSize: "0.8rem",
    color: "#aaa",
    margin: "0 0 0.5rem 0",
    textAlign: "center",
  },
  viewComment: {
    fontSize: "0.95rem",
    color: "#444",
    margin: "0.3rem 0 0 0",
    fontStyle: "italic",
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
  macroRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginBottom: "0.5rem",
  },
  macroEmoji: {
    fontSize: "0.9rem",
    width: "20px",
  },
  macroBarWrapper: {
    flex: 1,
  },
  macroBarTrack: {
    backgroundColor: "#f5f5f5",
    borderRadius: "999px",
    height: "6px",
    overflow: "hidden",
  },
  macroBarFill: {
    height: "100%",
    borderRadius: "999px",
  },
  macroValue: {
    fontSize: "0.78rem",
    color: "#555",
    margin: 0,
    minWidth: "32px",
    textAlign: "right",
  },
  macroGoal: {
    fontSize: "0.72rem",
    color: "#ccc",
    margin: 0,
    minWidth: "40px",
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
    color: "#bbb",
    margin: "0 0 2px 0",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  macroPillValue: {
    fontSize: "1rem",
    fontWeight: "700",
    margin: 0,
  },
  quantityInput: {
    width: "100%",
    padding: "0.7rem 1rem",
    fontSize: "0.88rem",
    borderRadius: "10px",
    border: "1px solid #eee",
    outline: "none",
    color: "#333",
    backgroundColor: "#fafafa",
    boxSizing: "border-box",
    marginTop: "0.5rem",
  },
  editSaveButton: {
    width: "100%",
    padding: "0.75rem",
    backgroundColor: "#ffffff",
    color: "#ccc",
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
    color: "#ccc",
    margin: 0,
    lineHeight: 1,
  },
  addMorePhotoLabel: {
    fontSize: "0.65rem",
    color: "#ccc",
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
    color: "#bbb",
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
    color: "#bbb",
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
    color: "#ccc",
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
    color: "#bbb",
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
    color: "#bbb",
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
    color: "#ddd",
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
    color: "#ddd",
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
    color: "#bbb",
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
    color: "#ccc",
    border: "none",
    fontSize: "0.78rem",
    cursor: "pointer",
  },
  taskQuantityHint: {
    fontSize: "0.7rem",
    color: "#ccc",
    margin: "-0.6rem 0 1rem 0",
    textAlign: "center",
  },
  welcomeCard: {
    backgroundColor: "#fff5f5",
    borderRadius: "16px",
    padding: "1.2rem",
    marginBottom: "1rem",
    border: "1px solid #ffdddd",
    animation: "slideUpFade 0.4s ease both",
  },
  welcomeTitle: {
    fontSize: "1rem",
    fontWeight: "700",
    color: "#ff6b6b",
    margin: "0 0 6px 0",
  },
  welcomeSub: {
    fontSize: "0.82rem",
    color: "#aaa",
    margin: 0,
    lineHeight: 1.5,
  },
};

export default Today;