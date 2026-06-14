import React, { useEffect, useState, useRef, useCallback } from "react";
import { auth, db, fixMealUrls } from "../firebase";
import { collection, query, where, orderBy, onSnapshot, getDocs, updateDoc, doc } from "firebase/firestore";
import { getPhotos } from "../utils/getPhotos";
import { getMealLocalDateKey } from "../utils/dateTime";
import PhotoCarousel from "../components/PhotoCarousel";
import MealNutritionCard from "../components/MealNutritionCard";
import PartnerResponseCard from "../components/PartnerResponseCard";
import { motion, AnimatePresence } from "framer-motion";
import AuthorizationService from "../services/authorization";

function Gallery({ galleryDate, setGalleryDate, galleryFilter, globalUserData, globalPartnerData }) {
  const user = auth.currentUser;
  const [filter, setFilter] = useState(galleryFilter || "mine");
  const [groupedMeals, setGroupedMeals] = useState({});
  const partnerUid = globalPartnerData?.uid || null;
  const partnerName = globalPartnerData?.name || null;
  const partnerPhoto = globalPartnerData?.photoURL || null;
  const scrollRefs = useRef({});
  const [viewMeal, setViewMeal] = useState(null);
  const [comment, setComment] = useState("");
  const [savingComment, setSavingComment] = useState(false);
  const [retryingMealId, setRetryingMealId] = useState(null);

  const handleRetryAnalysis = async (mealId) => {
    setRetryingMealId(mealId);
    try {
      const { getFunctions, httpsCallable } = await import("firebase/functions");
      const functions = getFunctions();
      const retryFn = httpsCallable(functions, "retryAnalysis");
      await retryFn({ mealId });

      // The onSnapshot listener automatically updates local state when the meal changes
    } catch (e) {
      console.error("Retry failed:", e);
    } finally {
      setRetryingMealId(null);
    }
  };


  useEffect(() => {
    setFilter(galleryFilter || "mine");
  }, [galleryFilter]);

  useEffect(() => {
    oldestDateRef.current = null;
    loadingRef.current = false;
    setHasMore(false);
    setGroupedMeals({});
    setLoadingGallery(true);
  }, [filter]);

  useEffect(() => {
    if (galleryDate && scrollRefs.current[galleryDate]) {
      setTimeout(() => {
        scrollRefs.current[galleryDate].scrollIntoView({ behavior: "smooth", block: "start" });
        setGalleryDate(null);
      }, 500);
    }
  }, [galleryDate, groupedMeals, setGalleryDate]);

  const PAGE_DAYS = 10;
  const oldestDateRef = useRef(null);
  const loadingRef = useRef(false);
  const [loadingGallery, setLoadingGallery] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  const groupMeals = (meals) => {
    const filtered = meals.filter((m) => getPhotos(m).length > 0);
    const grouped = {};
    filtered.forEach((meal) => {
      const dateKey = getMealLocalDateKey(meal);
      const [year, month, day] = dateKey.split("-").map(Number);
      const labelDate = new Date(year, month - 1, day);
      const dateLabel = labelDate.toLocaleDateString("en-CA", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      if (!grouped[dateKey]) {
        grouped[dateKey] = { label: dateLabel, meals: [] };
      }
      const photos = getPhotos(meal);
      if (photos.length <= 1) {
        grouped[dateKey].meals.push({ ...meal, _galleryPhoto: photos[0] || null, _photoIndex: 0 });
      } else {
        photos.forEach((photoURL, index) => {
          grouped[dateKey].meals.push({
            ...meal,
            _galleryPhoto: photoURL,
            _photoIndex: index,
            _totalPhotos: photos.length,
            _isFirstInGroup: index === 0,
          });
        });
      }
    });
    return Object.fromEntries(
      Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]))
    );
  };

  // One-time fetch for the current 10-day window (no real-time listener needed for gallery)
  useEffect(() => {
    const uid = filter === "mine" ? user.uid : partnerUid;
    if (!uid) return;

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - PAGE_DAYS * 24 * 60 * 60 * 1000);

    const q = query(
      collection(db, "meals"),
      where("uid", "==", uid),
      where("createdAt", ">=", startDate),
      where("createdAt", "<=", endDate),
      orderBy("createdAt", "asc")
    );

    let cancelled = false;
    setLoadingGallery(true);
    
    getDocs(q).then((snapshot) => {
      if (cancelled) return;
      const meals = snapshot.docs.map((d) => fixMealUrls({ id: d.id, ...d.data() })).reverse();
      oldestDateRef.current = startDate;
      setGroupedMeals(groupMeals(meals));
      setLoadingGallery(false);
      setHasMore(meals.length > 0);
    }).catch((err) => {
      if (cancelled) return;
      console.error("Gallery fetch failed:", err);
      setLoadingGallery(false);
      setHasMore(false);
    });

    return () => { cancelled = true; };
  }, [filter, partnerUid, user.uid]);

  const loadMore = useCallback(async () => {
    const uid = filter === "mine" ? user.uid : partnerUid;
    if (!uid || loadingRef.current || !oldestDateRef.current) return;

    loadingRef.current = true;
    setLoadingGallery(true);
    try {
      const endDate = oldestDateRef.current;
      const startDate = new Date(endDate.getTime() - PAGE_DAYS * 24 * 60 * 60 * 1000);

      const q = query(
        collection(db, "meals"),
        where("uid", "==", uid),
        where("createdAt", ">=", startDate),
        where("createdAt", "<", endDate),
        orderBy("createdAt", "asc")
      );

      const snap = await getDocs(q);
      const meals = snap.docs.map((d) => fixMealUrls({ id: d.id, ...d.data() })).reverse();
      oldestDateRef.current = startDate;

      if (meals.length === 0) {
        setHasMore(false);
        return;
      }

      setGroupedMeals((prev) => {
        const merged = { ...prev };
        const newGrouped = groupMeals(meals);
        for (const [dateKey, group] of Object.entries(newGrouped)) {
          if (merged[dateKey]) {
            merged[dateKey].meals = [...merged[dateKey].meals, ...group.meals];
          } else {
            merged[dateKey] = group;
          }
        }
        return merged;
      });

      setHasMore(true);
    } catch (e) {
      console.error("Load more failed:", e);
      setHasMore(false);
    } finally {
      loadingRef.current = false;
      setLoadingGallery(false);
    }
  }, [filter, partnerUid, user.uid]);

  const handleNutritionChange = useCallback(async (key, value) => {
    // Authorization check: only owner can update nutrition
    if (!AuthorizationService.canMutateMeal(viewMeal)) {
      console.error("Unauthorized: Cannot update nutrition on meals you don't own");
      return;
    }

    try {
      const updatedMeal = {
        ...viewMeal,
        nutrition: {
          ...(viewMeal.nutrition || {}),
          [key]: value
        }
      };
      setViewMeal(updatedMeal);
      
      // Update Firestore
      const mealRef = doc(db, "meals", viewMeal.id);
      await updateDoc(mealRef, {
        [`nutrition.${key}`]: value
      });

      // Also update groupedMeals so the change persists in the list
      setGroupedMeals(prev => {
        const newGrouped = { ...prev };
        for (const dateKey in newGrouped) {
          newGrouped[dateKey].meals = newGrouped[dateKey].meals.map(m => 
            m.id === viewMeal.id ? { ...m, nutrition: updatedMeal.nutrition } : m
          );
        }
        return newGrouped;
      });
    } catch (e) {
      console.error("Failed to update nutrition from gallery", e);
    }
  }, [viewMeal]);

  const handleReaction = async (meal, emoji) => {
    // Authorization check: only owner or partner can react
    if (!AuthorizationService.canInteractWithMeal(meal, globalUserData)) {
      console.error("Unauthorized: Cannot react to this meal");
      return;
    }

    try {
      const mealRef = doc(db, "meals", meal.id);
      await updateDoc(mealRef, {
        [`reactions.${user.uid}`]: emoji,
      });
      setViewMeal({ ...viewMeal, reactions: { ...viewMeal.reactions, [user.uid]: emoji } });
    } catch (e) {
      console.error("Failed to save reaction:", e);
    }
  };

  const handleComment = async () => {
    if (!comment.trim() || !viewMeal) return;
    
    // Authorization check: only owner or partner can comment
    if (!AuthorizationService.canInteractWithMeal(viewMeal, globalUserData)) {
      console.error("Unauthorized: Cannot comment on this meal");
      return;
    }
    
    setSavingComment(true);
    try {
      const mealRef = doc(db, "meals", viewMeal.id);
      await updateDoc(mealRef, {
        [`comments.${user.uid}`]: comment.trim(),
      });
      setViewMeal({ ...viewMeal, comments: { ...viewMeal.comments, [user.uid]: comment.trim() } });
      setComment("");
    } catch (e) {
      console.error("Failed to save comment:", e);
    } finally {
      setSavingComment(false);
    }
  };


  return (
    <>
      <div style={styles.container}>
      <h2 style={styles.title}>Gallery</h2>

      {partnerUid && (
        <div style={styles.filterRow}>
          {["mine", "hers"].map((f) => (
            <button
              key={f}
              style={{
                ...styles.filterButton,
                backgroundColor: filter === f ? "#ff6b6b" : "white",
                color: filter === f ? "white" : "#aaa",
              }}
              onClick={() => setFilter(f)}
            >
              {f === "mine" ? "Mine" : partnerName ? partnerName.split(" ")[0] : "Partner"}
            </button>
          ))}
        </div>
      )}

      {/* Grouped Photos */}
      {loadingGallery && Object.keys(groupedMeals).length === 0 ? (
        <p style={styles.empty}>Loading...</p>
      ) : Object.keys(groupedMeals).length === 0 ? (
        <p style={styles.empty}>No photos here yet.</p>
      ) : (
        Object.entries(groupedMeals).map(([dateKey, group]) => (
          <div key={dateKey} style={styles.dateGroup} ref={(el) => (scrollRefs.current[dateKey] = el)}>
            <p style={styles.dateLabel}>{group.label}</p>
            <motion.div 
              style={styles.grid}
              initial="hidden"
              animate="show"
              variants={{
                hidden: { opacity: 0 },
                show: {
                  opacity: 1,
                  transition: { staggerChildren: 0.05 }
                }
              }}
            >
              {group.meals.map((meal) => (
                <motion.div
                  key={`${meal.id}_${meal._photoIndex}`}
                  className="clickable-card"
                  style={styles.photoWrapper}
                  variants={{
                    hidden: { opacity: 0, scale: 0.8 },
                    show: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.3 } }
                  }}
                  whileHover={{ scale: 0.98 }}
                  onClick={async () => {
                    setViewMeal(meal);
                    setComment(meal.comments?.[user.uid] || "");
                  }}
                >
                  <img
                    src={meal._galleryPhoto || meal.photoURL}
                    alt={meal.name}
                    style={styles.photo}
                    loading="lazy"
                  />
                </motion.div>
              ))}
            </motion.div>
          </div>
        ))
      )}
      {hasMore && Object.keys(groupedMeals).length > 0 && (
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <button
            onClick={loadMore}
            disabled={loadingGallery}
            style={{
              padding: "0.8rem 2rem",
              backgroundColor: loadingGallery ? "#ccc" : "var(--primary)",
              color: "white",
              border: "none",
              borderRadius: "12px",
              fontSize: "1rem",
              cursor: loadingGallery ? "not-allowed" : "pointer",
            }}
          >
            {loadingGallery ? "Loading..." : "Load More"}
          </button>
        </div>
      )}
    </div>
    {/* Meal Viewer - Moved outside container for perfect centering */}
    <AnimatePresence>
      {viewMeal && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Meal details"
          style={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => setViewMeal(null)}
        >
          <motion.div
            style={styles.sheet}
            initial={{ y: "50px", opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: "50px", opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Photo */}
            {(() => {
              const mealPhotos = getPhotos(viewMeal);
              if (mealPhotos.length === 0) return null;
              const isOwn = viewMeal.uid === user.uid;
              const reactionUid = isOwn ? partnerUid : user.uid;
              return (
                <div style={{ position: "relative", marginBottom: "1rem" }}>
                <PhotoCarousel photos={mealPhotos} initialIndex={viewMeal._photoIndex || 0} />
                {viewMeal.reactions?.[reactionUid] && (
                  <span style={{
                    ...styles.reactionOverlay,
                    top: "10px",
                    right: "10px",
                    position: "absolute",
                    zIndex: 20,
                  }}>
                    {viewMeal.reactions[reactionUid]}
                  </span>
                )}
              </div>
              );
            })()}

            {/* Info */}
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
                src={viewMeal.uid === user.uid ? user.photoURL : partnerPhoto}
                alt="owner"
                style={styles.viewAvatar}
                referrerPolicy="no-referrer"
              />
            </div>

            {/* Nutrition breakdown */}
            <MealNutritionCard
              nutrition={viewMeal.nutrition || {}}
              analysisStatus={viewMeal.analysisStatus}
              isRetrying={retryingMealId === viewMeal.id}
              onRetry={() => handleRetryAnalysis(viewMeal.id)}
              editable={true}
              onNutritionChange={handleNutritionChange}
              />

            {/* Comment card */}
            {(() => {
              const isOwn = viewMeal.uid === user.uid;
              const commentUid = isOwn ? partnerUid : user.uid;
              const commentText = viewMeal.comments?.[commentUid];
              const commentName = isOwn
                ? (partnerName ? partnerName.split(" ")[0] : "Partner")
                : "You";
              return <PartnerResponseCard comment={commentText} authorName={commentName} />;
            })()}

            {/* Reaction picker — partner meals only, no reaction yet */}
            {viewMeal.uid !== user.uid && !viewMeal.reactions?.[user.uid] && (
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
                      onClick={() => handleReaction(viewMeal, emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Comment box — partner meals only, no comment yet */}
            {viewMeal.uid !== user.uid && !viewMeal.comments?.[user.uid] && (
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

            {/* Actions */}
            <div style={styles.actionRow}>
              <button style={styles.cancelButton} onClick={() => setViewMeal(null)}>
                ← Back
              </button>
            </div>

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
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
  filterRow: {
    display: "flex",
    gap: "0.5rem",
    marginBottom: "1.5rem",
  },
  filterButton: {
    flex: 1,
    padding: "0.5rem 0",
    border: "1px solid #eee",
    borderRadius: "8px",
    fontSize: "0.85rem",
    cursor: "pointer",
  },
  dateGroup: {
    marginBottom: "1.5rem",
  },
  dateLabel: {
    fontWeight: "bold",
    color: "#555",
    fontSize: "0.9rem",
    marginBottom: "0.5rem",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "4px",
  },
  photoWrapper: {
    aspectRatio: "1",
    overflow: "hidden",
    borderRadius: "8px",
    cursor: "pointer",
  },
  photo: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transition: "transform 0.2s ease",
  },
  empty: {
    color: "#666",
    textAlign: "center",
    marginTop: "3rem",
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
    boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
  },
  viewHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.5rem",
  },
  viewName: {
    fontWeight: "bold",
    fontSize: "1.1rem",
    color: "#333",
    margin: "0 0 4px 0",
  },
  viewMeta: {
    color: "#666",
    fontSize: "0.82rem",
    margin: 0,
  },
  viewAvatar: {
    width: "38px",
    height: "38px",
    borderRadius: "50%",
  },
  viewReactionRow: {
    borderTop: "1px solid #f5f5f5",
    paddingTop: "1rem",
    marginTop: "0.8rem",
  },
  viewReactionLabel: {
    fontSize: "0.8rem",
    color: "#666",
    margin: "0 0 0.5rem 0",
    textAlign: "center",
  },
  reactionRow: {
    display: "flex",
    justifyContent: "center",
    gap: "0.5rem",
  },
  reactionButton: {
    fontSize: "1.3rem",
    padding: "0.4rem",
    borderRadius: "50%",
    cursor: "pointer",
    background: "white",
    border: "2px solid #eee",
    width: "44px",
    height: "44px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
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
    fontSize: "16px",
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
  actionRow: {
    display: "flex",
    gap: "0.5rem",
    marginTop: "0.8rem",
  },
  cancelButton: {
    flex: 1,
    padding: "0.5rem",
    backgroundColor: "transparent",
    color: "#888",
    border: "none",
    borderRadius: "8px",
    fontSize: "0.8rem",
    cursor: "pointer",
  },
};

export default Gallery;