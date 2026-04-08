import React, { useEffect, useState } from "react";
import { auth, db, storage } from "../firebase";
import { collection, addDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { compressImage } from "../utils/compressImage";
import { formatLocalDateKey, formatLocalTimeHHMM, getCurrentTimezone } from "../utils/dateTime";

function getMealTypeByTime() {
  const hour = new Date().getHours();
  if (hour >= 8 && hour < 12) return "Breakfast";
  if (hour >= 12 && hour < 16) return "Lunch";
  if (hour >= 16 && hour < 19) return "Snack";
  if (hour >= 19 && hour < 22) return "Dinner";
  return "Breakfast";
}

function LogMeal({ setCurrentPage, partnerUid }) {
  const user = auth.currentUser;
  const [mealName, setMealName] = useState("");
  const [mealType, setMealType] = useState(getMealTypeByTime());
  const [photos, setPhotos] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [saving, setSaving] = useState(false);
  const today = new Date();
  const localToday = formatLocalDateKey(today);
  const [mealDate, setMealDate] = useState(localToday);
  const localTimeNow = formatLocalTimeHHMM(today);
  const [mealTime, setMealTime] = useState(localTimeNow);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const minDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const localMinDate = formatLocalDateKey(minDate);
  const [isShared, setIsShared] = useState(false);
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [isRestaurant, setIsRestaurant] = useState(false);

  useEffect(() => {
    setMealType(getMealTypeByTime());
  }, []);

  const handlePhoto = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (photos.length >= 5) return;
    setPhotos((prev) => [...prev, file]);
    setPhotoPreviews((prev) => [...prev, URL.createObjectURL(file)]);
    setShowPhotoOptions(false);
  };

  const handleRemovePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!mealName) return;
    setSaving(true);

    // Upload all photos
    const uploadedURLs = [];
    for (const photoFile of photos) {
      const compressed = await compressImage(photoFile);
      const photoRef = ref(storage, `meals/${user.uid}/${Date.now()}_${Math.random()}`);
      await uploadBytes(photoRef, compressed);
      const url = await getDownloadURL(photoRef);
      uploadedURLs.push(url);
    }

    const now = new Date();
    const createdAt = (() => {
      if (!showDatePicker) return now;
      const [y, m, d] = mealDate.split("-").map(Number);
      const [h, min] = mealTime.split(":").map(Number);
      return new Date(y, m - 1, d, h, min, 0, 0);
    })();
    const localDate = showDatePicker ? mealDate : formatLocalDateKey(now);
    const localTime = showDatePicker ? mealTime : formatLocalTimeHHMM(now);
    const timezone = getCurrentTimezone();
    const utcOffsetMinutesAtLog = -createdAt.getTimezoneOffset();

    await addDoc(collection(db, "meals"), {
      uid: user.uid,
      name: mealName,
      type: mealType,
      photoURL: uploadedURLs[0] || null,
      photos: uploadedURLs,
      isShared: isShared,
      isRestaurant: isRestaurant,
      createdAt,
      localDate,
      localTime,
      timezone: timezone || null,
      utcOffsetMinutesAtLog,
      ...(quantity.trim() ? { quantity: quantity.trim() } : {}),
    });

    setSaving(false);
    setCurrentPage("today");
  };

  return (
    <div style={styles.container}>
      <button style={styles.back} onClick={() => setCurrentPage("today")}>← Back</button>
      <h2 style={styles.title}>Add Meal</h2>

      {/* Photo Upload */}
      {photoPreviews.length === 0 ? (
        <div style={styles.photoBox} onClick={() => setShowPhotoOptions(true)}>
          <div style={styles.photoPlaceholder}>
            <span style={{ fontSize: "2rem" }}>📷</span>
            <p style={{ color: "#aaa", margin: "0.5rem 0 0 0" }}>Tap to add photo</p>
          </div>
        </div>
      ) : (
        <div style={styles.photoGrid}>
          {photoPreviews.map((preview, index) => (
            <div key={index} style={styles.photoThumbWrapper}>
              <img
                src={preview}
                alt={`meal ${index + 1}`}
                style={styles.photoThumb}
              />
              <button
                style={styles.removePhotoBtn}
                onClick={() => handleRemovePhoto(index)}
              >
                ✕
              </button>
            </div>
          ))}
          {photos.length < 5 && (
            <div
              style={styles.addMorePhoto}
              onClick={() => setShowPhotoOptions(true)}
            >
              <p style={styles.addMorePhotoPlus}>+</p>
              <p style={styles.addMorePhotoLabel}>Add</p>
            </div>
          )}
        </div>
      )}
      {photos.length > 0 && (
        <p style={styles.photoHint}>{photos.length}/5 photos</p>
      )}
      <input id="photoInput" type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handlePhoto} />
      <input id="galleryInput" type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhoto} />

      {showPhotoOptions && (
        <div style={styles.overlay} onClick={() => setShowPhotoOptions(false)}>
          <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <p style={styles.sheetTitle}>Add Photo</p>
            <button style={styles.editButton} onClick={() => document.getElementById("photoInput").click()}>
              📷 Take Photo
            </button>
            <button style={styles.editButton} onClick={() => document.getElementById("galleryInput").click()}>
              🖼️ Choose from Gallery
            </button>
            <button style={styles.cancelButton} onClick={() => setShowPhotoOptions(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Meal Type */}
      <div style={styles.typeRow}>
        {["Breakfast", "Lunch", "Dinner", "Snack"].map((type) => (
          <button
            key={type}
            style={{
              ...styles.typeButton,
              backgroundColor: mealType === type ? "#ff6b6b" : "white",
              color: mealType === type ? "white" : "#aaa",
            }}
            onClick={() => setMealType(type)}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Meal Name */}
      <div style={styles.card}>
        <label style={styles.label}>Meal Name</label>
        <input
          type="text"
          placeholder="What's on your plate? 🍽️"
          value={mealName}
          onChange={(e) => setMealName(e.target.value)}
          style={styles.input}
        />
        <input
              type="text"
              placeholder="Quantity or ingredients (optional)"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              style={styles.quantityInput}
              className="quantity-input"
            />
      </div>
      <div style={styles.cookTypeRow}>
        <div
          style={{
            ...styles.cookTypeButton,
            backgroundColor: !isRestaurant ? "#ff6b6b" : "#f5f5f5",
            color: !isRestaurant ? "white" : "#aaa",
          }}
          onClick={() => setIsRestaurant(false)}
        >
          <p style={styles.cookTypeLabel}>Homemade</p>
        </div>
        <div
          style={{
            ...styles.cookTypeButton,
            backgroundColor: isRestaurant ? "#ff6b6b" : "#f5f5f5",
            color: isRestaurant ? "white" : "#aaa",
          }}
          onClick={() => setIsRestaurant(true)}
        >
          <p style={styles.cookTypeLabel}>Restaurant</p>
        </div>
      </div>
      
      {partnerUid && (
        <div style={styles.toggleRow}>
          <div>
            <p style={styles.toggleLabel}>Shared meal 💑</p>
            <p style={styles.toggleSub}>Tag this as a shared dining experience</p>
          </div>
          <div
            style={{
              ...styles.toggleTrack,
              backgroundColor: isShared ? "#ff6b6b" : "#e0e0e0",
            }}
            onClick={() => setIsShared(!isShared)}
          >
            <div
              style={{
                ...styles.toggleThumb,
                transform: isShared ? "translateX(22px)" : "translateX(2px)",
              }}
            />
          </div>
        </div>
      )}
      {/* Date */}
      <div style={styles.backfillToggleRow}>
        <p style={styles.backfillLabel}>Logging an older meal?</p>
        <div
          style={{
            ...styles.toggleTrack,
            backgroundColor: showDatePicker ? "#ff6b6b" : "#e0e0e0",
          }}
          onClick={() => setShowDatePicker(!showDatePicker)}
        >
          <div
            style={{
              ...styles.toggleThumb,
              transform: showDatePicker ? "translateX(22px)" : "translateX(2px)",
            }}
          />
        </div>
      </div>

      {showDatePicker && (
        <div style={styles.datePickerExpanded}>
          <div style={styles.datePickerRow}>
            <label style={styles.datePickerLabel}>Date</label>
            <input
              type="date"
              value={mealDate}
              max={localToday}
              min={localMinDate}
              onChange={(e) => setMealDate(e.target.value)}
              style={styles.datePicker}
            />
          </div>
          <div style={styles.datePickerRow}>
            <label style={styles.datePickerLabel}>Time</label>
            <input
              type="time"
              value={mealTime}
              onChange={(e) => setMealTime(e.target.value)}
              style={styles.datePicker}
            />
          </div>
        </div>
      )}
      <button
        style={{
          ...styles.saveButton,
          opacity: mealName ? 1 : 0.5,
        }}
        onClick={handleSave}
        disabled={saving || !mealName}
      >
        {saving ? "Saving..." : "Save Meal"}
      </button>
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
  back: {
    background: "none",
    border: "none",
    fontSize: "1rem",
    cursor: "pointer",
    color: "#ff6b6b",
    padding: 0,
    marginBottom: "0.5rem",
    display: "block",
  },
  title: {
    fontSize: "1.8rem",
    color: "#333",
    margin: "0 0 1.5rem 0",
  },
  photoBox: {
    width: "100%",
    height: "200px",
    backgroundColor: "white",
    borderRadius: "12px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    marginBottom: "1rem",
    overflow: "hidden",
  },
  photoPlaceholder: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
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
  card: {
    backgroundColor: "white",
    borderRadius: "12px",
    padding: "1.2rem",
    marginBottom: "1rem",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  label: {
    fontSize: "0.9rem",
    color: "#555",
    marginBottom: "0.4rem",
    display: "block",
  },
  input: {
    width: "100%",
    padding: "0.6rem",
    fontSize: "1rem",
    borderRadius: "8px",
    border: "1px solid #ddd",
    marginBottom: "1rem",
    boxSizing: "border-box",
  },
  saveButton: {
    width: "100%",
    padding: "0.9rem",
    backgroundColor: "#ff6b6b",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "1rem",
    cursor: "pointer",
  },
  toggleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: "12px",
    padding: "1rem 1.2rem",
    marginBottom: "1rem",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  toggleLabel: {
    fontWeight: "bold",
    color: "#333",
    margin: 0,
    fontSize: "0.95rem",
  },
  toggleSub: {
    color: "#aaa",
    fontSize: "0.8rem",
    margin: "2px 0 0 0",
  },
  toggleTrack: {
    width: "46px",
    height: "26px",
    borderRadius: "13px",
    cursor: "pointer",
    position: "relative",
    transition: "background-color 0.2s ease",
  },
  toggleThumb: {
    position: "absolute",
    top: "3px",
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    backgroundColor: "white",
    boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
    transition: "transform 0.2s ease",
  },
  overlay: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
    zIndex: 150,
    display: "flex",
    alignItems: "flex-end",
  },
  sheet: {
    backgroundColor: "white",
    borderRadius: "20px 20px 0 0",
    padding: "1.5rem",
    width: "100%",
    maxWidth: "400px",
    margin: "0 auto",
  },
  sheetTitle: {
    fontWeight: "bold",
    fontSize: "1.1rem",
    color: "#333",
    margin: "0 0 1rem 0",
    textAlign: "center",
  },
  editButton: {
    width: "100%",
    padding: "0.8rem",
    backgroundColor: "#ff6b6b",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "1rem",
    cursor: "pointer",
    marginBottom: "0.5rem",
  },
  cancelButton: {
    width: "100%",
    padding: "0.8rem",
    backgroundColor: "transparent",
    color: "#aaa",
    border: "none",
    borderRadius: "8px",
    fontSize: "1rem",
    cursor: "pointer",
  },
  datePicker: {
    border: "1px solid #eee",
    borderRadius: "8px",
    padding: "0.4rem 0.6rem",
    fontSize: "0.85rem",
    color: "#555",
    cursor: "pointer",
    backgroundColor: "#fffaf5",
  },
  datePickerExpanded: {
    backgroundColor: "white",
    borderRadius: "12px",
    padding: "1rem 1.2rem",
    marginBottom: "1rem",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    display: "flex",
    flexDirection: "column",
    gap: "0.8rem",
  },
  datePickerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  datePickerLabel: {
    fontSize: "0.9rem",
    color: "#555",
  },
  backfillToggleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.8rem",
    padding: "0 0.2rem",
  },
  backfillLabel: {
    fontSize: "0.85rem",
    color: "#aaa",
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
  photoHint: {
    fontSize: "0.72rem",
    color: "#ccc",
    margin: "0 0 0.5rem 0",
    textAlign: "center",
  },
  cookTypeRow: {
    display: "flex",
    gap: "0.6rem",
    marginBottom: "1rem",
  },
  cookTypeButton: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.4rem",
    borderRadius: "10px",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  cookTypeLabel: {
    fontSize: "0.78rem",
    fontWeight: "600",
    margin: 0,
  },
};

export default LogMeal;