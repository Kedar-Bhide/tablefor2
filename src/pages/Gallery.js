import React, { useEffect, useState, useRef } from "react";
import { auth, db } from "../firebase";
import { collection, query, where, getDocs, getDoc, updateDoc, doc } from "firebase/firestore";
import { getPhotos } from "../utils/getPhotos";
import { getMealLocalDateKey } from "../utils/dateTime";

function Gallery({ galleryDate, setGalleryDate, galleryFilter }) {
  const user = auth.currentUser;
  const [filter, setFilter] = useState(galleryFilter || "mine");
  const [groupedMeals, setGroupedMeals] = useState({});
  const [partnerUid, setPartnerUid] = useState(null);
  const [partnerName, setPartnerName] = useState(null);
  const [partnerPhoto, setPartnerPhoto] = useState(null);
  const [loading, setLoading] = useState(true);
  const scrollRefs = useRef({});
  const [viewMeal, setViewMeal] = useState(null);
  const [comment, setComment] = useState("");
  const [savingComment, setSavingComment] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [swipeStartX, setSwipeStartX] = useState(null);
  const [swipeDirection, setSwipeDirection] = useState(null);

  useEffect(() => {
    const fetchPartner = async () => {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists() && userSnap.data().partnerUid) {
        const pUid = userSnap.data().partnerUid;
        setPartnerUid(pUid);
        const partnerRef = doc(db, "users", pUid);
        const partnerSnap = await getDoc(partnerRef);
        if (partnerSnap.exists()) {
          setPartnerName(partnerSnap.data().name);
          setPartnerPhoto(partnerSnap.data().photoURL);
        }
      }
      setLoading(false);
    };
    fetchPartner();
  }, [user.uid]);

  useEffect(() => {
    setFilter(galleryFilter || "mine");
  }, [galleryFilter]);

  useEffect(() => {
    if (galleryDate && scrollRefs.current[galleryDate]) {
      setTimeout(() => {
        scrollRefs.current[galleryDate].scrollIntoView({ behavior: "smooth", block: "start" });
        setGalleryDate(null);
      }, 500);
    }
  }, [galleryDate, groupedMeals, setGalleryDate]);

  useEffect(() => {
    if (loading) return;
    const fetchMeals = async () => {
      let meals = [];

      if (filter === "mine") {
        const q = query(
          collection(db, "meals"),
          where("uid", "==", user.uid)
        );
        const snap = await getDocs(q);
        meals = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      } else if (filter === "hers" && partnerUid) {
        const q = query(
          collection(db, "meals"),
          where("uid", "==", partnerUid)
        );
        const snap = await getDocs(q);
        meals = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }

      meals = meals.filter((m) => getPhotos(m).length > 0);

      const grouped = {};
      meals.forEach((meal) => {
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

        // Expand multi-photo meals into individual tiles
        const photos = getPhotos(meal);
        if (photos.length <= 1) {
          grouped[dateKey].meals.push({ ...meal, _galleryPhoto: photos[0] || null, _photoIndex: 0 });
        } else {
          // First photo gets the group badge
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

      const sorted = Object.fromEntries(
        Object.entries(grouped).sort(
          (a, b) => b[0].localeCompare(a[0])
        )
      );

      setGroupedMeals(sorted);
    };

    fetchMeals();
  }, [filter, partnerUid, loading, user.uid]);

  const handleReaction = async (meal, emoji) => {
    const mealRef = doc(db, "meals", meal.id);
    await updateDoc(mealRef, {
      [`reactions.${user.uid}`]: emoji,
    });
    setViewMeal({ ...viewMeal, reactions: { ...viewMeal.reactions, [user.uid]: emoji } });
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

  const renderCarousel = (mealPhotos) => {
    if (!mealPhotos || mealPhotos.length === 0) return null;
    if (mealPhotos.length === 1) return (
      <img src={mealPhotos[0]} alt="meal" style={styles.sheetPhoto} />
    );
    return (
      <div style={styles.carouselWrapper}>
        <div
          style={styles.carouselPhotoWrapper}
          onTouchStart={(e) => setSwipeStartX(e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (swipeStartX === null) return;
            const diff = swipeStartX - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 40) {
              if (diff > 0 && carouselIndex < mealPhotos.length - 1) {
                setSwipeDirection("left");
                setCarouselIndex((i) => i + 1);
              } else if (diff < 0 && carouselIndex > 0) {
                setSwipeDirection("right");
                setCarouselIndex((i) => i - 1);
              }
            }
            setSwipeStartX(null);
          }}
        >
          <img
            key={carouselIndex}
            src={mealPhotos[carouselIndex]}
            alt="meal"
            style={{
              ...styles.sheetPhoto,
              animation: `${swipeDirection === "left"
                ? "slideInFromRight"
                : "slideInFromLeft"} 0.25s cubic-bezier(0.34, 1.2, 0.64, 1) both`,
            }}
          />
          {carouselIndex > 0 && (
            <button
              style={{ ...styles.carouselArrow, left: "8px" }}
              onClick={() => { setSwipeDirection("right"); setCarouselIndex((i) => i - 1); }}
            >‹</button>
          )}
          {carouselIndex < mealPhotos.length - 1 && (
            <button
              style={{ ...styles.carouselArrow, right: "8px" }}
              onClick={() => { setSwipeDirection("left"); setCarouselIndex((i) => i + 1); }}
            >›</button>
          )}
        </div>
        <div style={styles.carouselDots}>
          {mealPhotos.map((_, i) => (
            <div
              key={i}
              style={{
                ...styles.carouselDot,
                backgroundColor: i === carouselIndex ? "#ff6b6b" : "#e0e0e0",
                transform: i === carouselIndex ? "scale(1.3)" : "scale(1)",
                transition: "all 0.2s ease",
              }}
              onClick={() => {
                setSwipeDirection(i > carouselIndex ? "left" : "right");
                setCarouselIndex(i);
              }}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Gallery</h2>

      <div style={styles.filterRow}>
        {(partnerUid ? ["mine", "hers"] : ["mine"]).map((f) => (
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

      {/* Grouped Photos */}
      {Object.keys(groupedMeals).length === 0 ? (
        <p style={styles.empty}>No photos here yet.</p>
      ) : (
        Object.entries(groupedMeals).map(([dateKey, group]) => (
          <div key={dateKey} style={styles.dateGroup} ref={(el) => (scrollRefs.current[dateKey] = el)}>
            <p style={styles.dateLabel}>{group.label}</p>
            <div style={styles.grid}>
              {group.meals.map((meal) => (
                <div
                  key={`${meal.id}_${meal._photoIndex}`}
                  style={styles.photoWrapper}
                  onClick={() => {
                    setViewMeal(meal);
                    setComment(meal.comments?.[user.uid] || "");
                    setCarouselIndex(meal._photoIndex || 0);
                  }}
                >
                  <img
                    src={meal._galleryPhoto || meal.photoURL}
                    alt={meal.name}
                    style={styles.photo}
                  />
                  {meal._isFirstInGroup && meal._totalPhotos > 1 && (
                    <div style={styles.galleryCountBadge}>
                      {meal._totalPhotos} 📷
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Meal Viewer */}
      {viewMeal && (
        <div
          style={styles.overlay}
          onClick={() => setViewMeal(null)}
        >
          <div
            style={styles.sheet}
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
                  {renderCarousel(mealPhotos)}
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
                {viewMeal.uid === user.uid && viewMeal.quantity && (
                  <p style={styles.mealQuantityText}>{viewMeal.quantity}</p>
                )}
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
                {viewMeal.nutrition?.calories > 0 && (
                  <div style={styles.mealNutritionCard}>
                    <p style={styles.mealNutritionTitle}>
                      Total Calories: {viewMeal.nutrition.calories} kcal
                    </p>
                    <div style={styles.mealNutritionRow}>
                      {[
                        { label: "Protein", key: "protein_g" },
                        { label: "Carbs", key: "carbs_g" },
                        { label: "Fat", key: "fat_g" },
                        { label: "Fiber", key: "fiber_g" },
                      ].map((m) => (
                        <div key={m.key} style={styles.mealNutritionPill}>
                          <p style={styles.mealNutritionLabel}>{m.label}</p>
                          <p style={styles.mealNutritionValue}>
                            {viewMeal.nutrition[m.key] || 0}g
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

            {/* Comment card */}
            {(() => {
              const isOwn = viewMeal.uid === user.uid;
              const commentUid = isOwn ? partnerUid : user.uid;
              const commentText = viewMeal.comments?.[commentUid];
              const commentName = isOwn
                ? (partnerName ? partnerName.split(" ")[0] : "Partner")
                : "You";
              return commentText ? (
                <div style={styles.partnerResponseCard}>
                  <div style={styles.partnerResponseContent}>
                    <p style={styles.partnerResponseComment}>"{commentText}"</p>
                    <p style={styles.partnerResponseName}>— {commentName}</p>
                  </div>
                </div>
              ) : null;
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
    color: "#aaa",
    textAlign: "center",
    marginTop: "3rem",
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
  sheetPhoto: {
    width: "100%",
    borderRadius: "12px",
    objectFit: "cover",
    aspectRatio: "4/3",
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
    color: "#aaa",
    fontSize: "0.82rem",
    margin: 0,
  },
  viewAvatar: {
    width: "38px",
    height: "38px",
    borderRadius: "50%",
  },
  partnerResponseCard: {
    backgroundColor: "#fffaf5",
    borderRadius: "10px",
    padding: "0.8rem 1rem",
    marginTop: "0.8rem",
    border: "1px solid #f5ede6",
  },
  partnerResponseContent: {
    flex: 1,
  },
  partnerResponseComment: {
    fontSize: "0.9rem",
    color: "#444",
    margin: "0 0 4px 0",
    fontStyle: "italic",
    lineHeight: 1.4,
  },
  partnerResponseName: {
    fontSize: "0.75rem",
    color: "#bbb",
    margin: 0,
    textAlign: "right",
  },
  viewReactionRow: {
    borderTop: "1px solid #f5f5f5",
    paddingTop: "1rem",
    marginTop: "0.8rem",
  },
  viewReactionLabel: {
    fontSize: "0.8rem",
    color: "#aaa",
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
    color: "#ccc",
    border: "none",
    borderRadius: "8px",
    fontSize: "0.8rem",
    cursor: "pointer",
  },
  mealQuantityText: {
    fontSize: "0.78rem",
    color: "#bbb",
    margin: "2px 0 4px 0",
    fontStyle: "italic",
  },
  galleryCountBadge: {
    position: "absolute",
    bottom: "6px",
    right: "6px",
    backgroundColor: "rgba(255,255,255,0.9)",
    color: "#555",
    fontSize: "0.65rem",
    fontWeight: "600",
    padding: "3px 7px",
    borderRadius: "999px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
  },
  carouselWrapper: {
    marginBottom: "0.5rem",
  },
  carouselPhotoWrapper: {
    position: "relative",
    width: "100%",
    borderRadius: "12px",
    overflow: "hidden",
  },
  carouselArrow: {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    backgroundColor: "rgba(255,255,255,0.85)",
    border: "none",
    borderRadius: "50%",
    width: "32px",
    height: "32px",
    fontSize: "1.4rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
    zIndex: 10,
    lineHeight: 1,
    color: "#555",
    padding: 0,
  },
  carouselDots: {
    display: "flex",
    justifyContent: "center",
    gap: "6px",
    marginTop: "8px",
  },
  carouselDot: {
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    cursor: "pointer",
  },
  mealNutritionCard: {
    backgroundColor: "#fafafa",
    borderRadius: "12px",
    padding: "0.8rem 1rem",
    marginBottom: "0.8rem",
  },
  mealNutritionTitle: {
    fontSize: "0.82rem",
    fontWeight: "600",
    color: "#ff6b6b",
    margin: "0 0 0.6rem 0",
  },
  mealNutritionRow: {
    display: "flex",
    gap: "0.4rem",
  },
  mealNutritionPill: {
    flex: 1,
    textAlign: "center",
  },
  mealNutritionLabel: {
    fontSize: "0.62rem",
    color: "#bbb",
    margin: "0 0 2px 0",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  mealNutritionValue: {
    fontSize: "0.95rem",
    fontWeight: "700",
    color: "#555",
    margin: 0,
  },
};

export default Gallery;