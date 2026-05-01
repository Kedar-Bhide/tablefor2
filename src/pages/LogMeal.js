import React, { useEffect, useState } from "react";
import { auth, db, storage } from "../firebase";
import { collection, addDoc, updateDoc, doc, query, where, getDocs, limit } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { compressImage } from "../utils/compressImage";
import { formatLocalDateKey, formatLocalTimeHHMM, getCurrentTimezone } from "../utils/dateTime";
import MealNutritionCard from "../components/MealNutritionCard";

function getMealTypeByTime() {
  const hour = new Date().getHours();
  if (hour >= 8 && hour < 12) return "Breakfast";
  if (hour >= 12 && hour < 16) return "Lunch";
  if (hour >= 16 && hour < 19) return "Snack";
  if (hour >= 19 && hour < 22) return "Dinner";
  return "Breakfast";
}

function LogMeal({ setCurrentPage, globalUserData, globalPartnerData }) {
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
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const minDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const localMinDate = formatLocalDateKey(minDate);
  const [isShared, setIsShared] = useState(false);
  const [ingredients, setIngredients] = useState("");
  const [portionSize, setPortionSize] = useState("");
  const [cookType, setCookType] = useState("Homemade"); // Homemade, Restaurant, Packaged
  const [previewNutrition, setPreviewNutrition] = useState(null);

  // Frequent Meals States
  const [frequentMeals, setFrequentMeals] = useState([]);
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [saveAsFrequent, setSaveAsFrequent] = useState(false);
  const [lastSelectedTemplate, setLastSelectedTemplate] = useState(null);

  // Close suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showSuggestions && !event.target.closest(".details-card")) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSuggestions]);

  useEffect(() => {
    setMealType(getMealTypeByTime());
  }, []);

  // Fetch Frequent Meals
  useEffect(() => {
    if (!user) return;
    const fetchTemplates = async () => {
      const types = (mealType === "Lunch" || mealType === "Dinner")
        ? ["Lunch", "Dinner"]
        : [mealType];

      try {
        const q = query(
          collection(db, "frequentMeals"),
          where("uid", "==", user.uid),
          where("mealType", "in", types),
          limit(50)
        );
        const snap = await getDocs(q);
        const templates = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setFrequentMeals(templates);
      } catch (e) {
        console.error("Error fetching frequent meals:", e);
        // alert("Fetch error: " + e.message); // Uncomment for debugging if needed
      }
    };
    fetchTemplates();
  }, [user, mealType]);

  // Handle Autocomplete Filtering
  useEffect(() => {
    let filtered = [];
    if (!mealName.trim()) {
      // If empty, show all saved meals
      filtered = [...frequentMeals];
    } else {
      // Otherwise filter by what's typed
      filtered = frequentMeals.filter(m =>
        m.name.toLowerCase().includes(mealName.toLowerCase())
      );
    }
    // Always sort alphabetically by name
    filtered.sort((a, b) => a.name.localeCompare(b.name));
    setFilteredSuggestions(filtered);
  }, [mealName, frequentMeals]);

  // Logic to show/hide "Save as Frequent" option
  const isMatchWithTemplate = lastSelectedTemplate &&
    mealName === lastSelectedTemplate.name &&
    ingredients === lastSelectedTemplate.ingredients &&
    portionSize === lastSelectedTemplate.portionSize;

  // If user clears the meal name box entirely, reset all related fields
  useEffect(() => {
    if (!mealName.trim()) {
      setIngredients("");
      setPortionSize("");
      setPreviewNutrition(null);
      setLastSelectedTemplate(null);
    }
  }, [mealName]);

  // If user edits a pre-filled meal, clear the saved nutrition so it gets re-analyzed
  useEffect(() => {
    if (lastSelectedTemplate && !isMatchWithTemplate) {
      setPreviewNutrition(null);
      setLastSelectedTemplate(null);
    }
  }, [mealName, ingredients, portionSize, isMatchWithTemplate, lastSelectedTemplate]);

  const showSaveOption = !isMatchWithTemplate && mealName.trim().length > 0;

  const handleSelectSuggestion = (template) => {
    setMealName(template.name);
    setIngredients(template.ingredients || "");
    setPortionSize(template.portionSize || "");
    if (template.nutrition) {
      setPreviewNutrition(template.nutrition);
    }
    setLastSelectedTemplate(template);
    setShowSuggestions(false);
  };

  const handlePhoto = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (photos.length >= 5) return;
    setPhotos((prev) => [...prev, file]);
    setPhotoPreviews((prev) => [...prev, URL.createObjectURL(file)]);
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

    // Update meal
    await addDoc(collection(db, "meals"), {
      uid: user.uid,
      name: mealName,
      type: mealType,
      photoURL: uploadedURLs[0] || null,
      photos: uploadedURLs,
      isShared: isShared,
      isRestaurant: cookType === "Restaurant",
      isPackaged: cookType === "Packaged",
      createdAt,
      localDate,
      localTime,
      timezone: timezone || null,
      utcOffsetMinutesAtLog,
      ingredients: ingredients.trim(),
      portionSize: portionSize.trim(),
      nutrition: previewNutrition || null,
      saveToFrequent: saveAsFrequent,
    });

    // Update local state so it appears immediately next time
    if (saveAsFrequent) {
      setFrequentMeals(prev => [{
        id: "temp-" + Date.now(),
        name: mealName.trim(),
        ingredients: ingredients.trim(),
        portionSize: portionSize.trim(),
        nutrition: previewNutrition || null,
        mealType: mealType
      }, ...prev]);
    }

    // Also update user's current timezone/offset to ensure reminders are accurate
    try {
      await updateDoc(doc(db, "users", user.uid), {
        timezone: timezone || null,
        utcOffsetMinutes: utcOffsetMinutesAtLog,
        utcOffset: utcOffsetMinutesAtLog / 60,
      });
    } catch (e) {
      console.error("Failed to update user timezone during meal log:", e);
    }

    setSaving(false);
    setCurrentPage("today");
  };

  return (
    <div style={styles.container}>
      <button style={styles.back} onClick={() => setCurrentPage("today")}>
        <span style={{ transform: "translateX(-1px)" }}>←</span>
      </button>
      <h2 style={styles.title}>
        Log a <span style={{ color: "#ff6b6b" }}>Meal</span>
      </h2>
      {/* Photo Upload Area */}
      <div style={styles.photoUploadContainer}>
        {photoPreviews.length === 0 ? (
          <div style={styles.dashedPhotoBox}>
            <div style={styles.photoOption} onClick={() => document.getElementById("photoInput").click()}>
              <div style={styles.photoIconCircle}>📸</div>
              <p style={styles.photoOptionLabel}>Take Photo</p>
            </div>
            <div style={styles.photoDivider} />
            <div style={styles.photoOption} onClick={() => document.getElementById("galleryInput").click()}>
              <div style={styles.photoIconCircle}>🖼️</div>
              <p style={styles.photoOptionLabel}>From Library</p>
            </div>
          </div>
        ) : (
          <div style={styles.photoGrid}>
            {photoPreviews.map((preview, index) => (
              <div key={index} style={styles.photoThumbWrapper}>
                <img src={preview} alt={`meal ${index + 1}`} style={styles.photoThumb} />
                <button style={styles.removePhotoBtn} onClick={() => handleRemovePhoto(index)}>✕</button>
              </div>
            ))}
            {photos.length < 5 && (
              <div style={styles.addMorePhoto} onClick={() => setShowPhotoOptions(true)}>
                <p style={styles.addMorePhotoPlus}>+</p>
                <p style={styles.addMorePhotoLabel}>Add</p>
              </div>
            )}
          </div>
        )}
      </div>

      {photos.length > 0 && <p style={styles.photoHint}>{photos.length}/5 photos</p>}
      <input id="photoInput" type="file" accept="image/*" capture style={{ display: "none" }} onChange={handlePhoto} />
      <input id="galleryInput" type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhoto} />

      {showPhotoOptions && (
        <div style={styles.overlay} onClick={() => setShowPhotoOptions(false)}>
          <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <p style={styles.sheetTitle}>Add Photo</p>
            <button style={styles.optionButton} onClick={async () => {
              try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                stream.getTracks().forEach(t => t.stop());
                setShowPhotoOptions(false);
                document.getElementById("photoInput").click();
              } catch (e) {
                alert("Camera access is blocked. Please go to your browser Settings → Site Settings → Camera and allow access for this site, then reload the app.");
              }
            }}>
              📷 Take Photo
            </button>
            <button style={styles.optionButton} onClick={() => {
              setShowPhotoOptions(false);
              document.getElementById("galleryInput").click();
            }}>
              🖼️ Choose from Gallery
            </button>
            <button style={styles.cancelButton} onClick={() => setShowPhotoOptions(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Meal Type */}
      <p style={styles.sectionHeader}>MEAL TYPE</p>
      <div style={styles.typeRow}>
        {[
          { label: "Breakfast", icon: "🌅" },
          { label: "Lunch", icon: "☀️" },
          { label: "Dinner", icon: "🌙" },
          { label: "Snack", icon: "🍎" }
        ].map((item) => (
          <button
            key={item.label}
            style={{
              ...styles.typeButton,
              backgroundColor: mealType === item.label ? "#fff0f0" : "white",
              borderColor: mealType === item.label ? "#ff6b6b" : "#eee",
              color: mealType === item.label ? "#ff6b6b" : "#333",
            }}
            onClick={() => setMealType(item.label)}
          >
            <span style={{ fontSize: "1.2rem", marginBottom: "4px" }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      {/* Meal Details Card */}
      <div style={styles.detailsCard} className="details-card">
        <div style={{ position: "relative" }}>
          <div style={styles.inputRow}>
            <span style={styles.inputIcon}>🍽️</span>
            <input
              type="text"
              placeholder="Name your meal..."
              value={mealName}
              onChange={(e) => {
                setMealName(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              style={styles.nakedInput}
            />
          </div>
          {showSuggestions && filteredSuggestions.length > 0 && (
            <div style={styles.suggestionsDropdown}>
              {filteredSuggestions.map((item) => (
                <div
                  key={item.id}
                  style={styles.suggestionItem}
                  onClick={() => handleSelectSuggestion(item)}
                >
                  <div style={styles.suggestionName}>{item.name}</div>
                  <div style={styles.suggestionMeta}>
                    {item.ingredients ? `${item.ingredients.slice(0, 30)}...` : "No ingredients listed"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={styles.inputDivider} />
        <div style={styles.inputRow}>
          <span style={styles.inputIcon}>📝</span>
          <input
            type="text"
            placeholder="Ingredients or notes (optional)"
            value={ingredients}
            onChange={(e) => setIngredients(e.target.value)}
            style={styles.nakedInput}
          />
        </div>
        <div style={styles.inputDivider} />
        <div style={styles.inputRow}>
          <span style={styles.inputIcon}>📏</span>
          <input
            type="text"
            placeholder="Portion size (optional)"
            value={portionSize}
            onChange={(e) => setPortionSize(e.target.value)}
            style={styles.nakedInput}
          />
        </div>

        {showSaveOption && (
          <>
            <div style={styles.inputDivider} />
            <div
              style={styles.saveFrequentRow}
              onClick={() => setSaveAsFrequent(!saveAsFrequent)}
            >
              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={{
                  ...styles.heartIcon,
                  color: saveAsFrequent ? "#ff6b6b" : "#ccc"
                }}>
                  {saveAsFrequent ? "❤️" : "🤍"}
                </span>
                <span style={styles.saveFrequentLabel}>
                  {saveAsFrequent ? "Saved to favorites" : "Save as frequent meal"}
                </span>
              </div>
              <div style={{
                ...styles.miniToggle,
                backgroundColor: saveAsFrequent ? "#ff6b6b" : "#eee"
              }}>
                <div style={{
                  ...styles.miniToggleThumb,
                  transform: saveAsFrequent ? "translateX(10px)" : "translateX(0px)"
                }} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Nutrition Section */}
      <MealNutritionCard
        nutrition={previewNutrition || { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 }}
        editable={true}
        onNutritionChange={(key, val) => setPreviewNutrition(prev => ({ ...(prev || { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 }), [key]: val }))}
      />

      {/* Meal Source Row */}
      <div style={styles.sourceRow}>
        {[
          { label: "Homemade", icon: "🏠" },
          { label: "Restaurant", icon: "🍴" },
          { label: "Packaged", icon: "📦" }
        ].map((item) => (
          <div
            key={item.label}
            style={{
              ...styles.sourceButton,
              backgroundColor: cookType === item.label ? "white" : "transparent",
              boxShadow: cookType === item.label ? "0 2px 8px rgba(0,0,0,0.1)" : "none",
            }}
            onClick={() => setCookType(item.label)}
          >
            <span style={{ fontSize: "1rem", marginRight: "6px" }}>{item.icon}</span>
            <p style={{ ...styles.sourceLabel, fontWeight: cookType === item.label ? "700" : "400" }}>{item.label}</p>
          </div>
        ))}
      </div>

      {globalPartnerData && (
        <div style={styles.toggleRow}>
          <div>
            <div style={styles.sharedAvatarStack}>
              <img src={globalUserData?.photoURL} alt="me" style={styles.smallAvatar} referrerPolicy="no-referrer" />
              {globalPartnerData.photoURL ? (
                <img src={globalPartnerData.photoURL} alt="partner" style={{ ...styles.smallAvatar, marginLeft: "-12px" }} referrerPolicy="no-referrer" />
              ) : (
                <div style={styles.smallAvatarPlaceholder}>👩</div>
              )}
            </div>
            <p style={styles.toggleLabel}>Shared meal</p>
            <p style={styles.toggleSub}>Tag dining partners</p>
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
    padding: "1rem 1.2rem",
    backgroundColor: "#fffaf7",
    minHeight: "100vh",
  },
  back: {
    background: "#fff",
    border: "none",
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    fontSize: "1.2rem",
    cursor: "pointer",
    color: "#333",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "1rem",
    boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
  },
  title: {
    fontSize: "2.2rem",
    fontFamily: "'Playfair Display', serif",
    color: "#333",
    margin: "0 0 1.5rem 0",
  },
  photoUploadContainer: {
    marginBottom: "1.5rem",
  },
  dashedPhotoBox: {
    width: "100%",
    height: "140px",
    backgroundColor: "transparent",
    borderRadius: "20px",
    border: "2px dashed #e5e5e5",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  photoOption: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  photoIconCircle: {
    fontSize: "1.8rem",
    marginBottom: "8px",
  },
  photoOptionLabel: {
    fontSize: "0.85rem",
    color: "#666",
    margin: 0,
  },
  photoDivider: {
    width: "1px",
    height: "60px",
    backgroundColor: "#eee",
  },
  sectionHeader: {
    fontSize: "0.75rem",
    fontWeight: "800",
    color: "#aaa",
    letterSpacing: "0.05em",
    margin: "1.5rem 0 0.8rem 0",
  },
  typeRow: {
    display: "flex",
    gap: "0.6rem",
    marginBottom: "1rem",
  },
  typeButton: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0.8rem 0",
    border: "1.5px solid #eee",
    borderRadius: "16px",
    fontSize: "0.8rem",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  detailsCard: {
    backgroundColor: "white",
    borderRadius: "20px",
    padding: "0.5rem 1rem",
    marginBottom: "1.5rem",
    boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
  },
  inputRow: {
    display: "flex",
    alignItems: "center",
    padding: "0.8rem 0",
  },
  inputIcon: {
    fontSize: "1.2rem",
    marginRight: "12px",
  },
  nakedInput: {
    flex: 1,
    border: "none",
    outline: "none",
    fontSize: "1rem",
    color: "#333",
    padding: 0,
  },
  suggestionDivider: {
    height: "1px",
    backgroundColor: "#eee",
    margin: "0.2rem 0",
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
    margin: "0 0 1rem 0",
  },
  optionButton: {
    width: "100%",
    padding: "0.8rem",
    backgroundColor: "transparent",
    color: "#444",
    border: "1px solid #eee",
    borderRadius: "8px",
    fontSize: "0.95rem",
    cursor: "pointer",
    marginBottom: "0.5rem",
    textAlign: "left",
  },
  cancelButton: {
    width: "100%",
    padding: "0.8rem",
    backgroundColor: "transparent",
    color: "#888",
    border: "none",
    borderRadius: "8px",
    fontSize: "0.9rem",
    cursor: "pointer",
    marginTop: "0.5rem",
  },
  inputDivider: {
    height: "1px",
    backgroundColor: "#f5f5f5",
    marginLeft: "32px",
  },
  sourceRow: {
    display: "flex",
    backgroundColor: "#f2efed",
    borderRadius: "16px",
    padding: "4px",
    marginBottom: "1.5rem",
  },
  sourceButton: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.6rem 0",
    borderRadius: "12px",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  sourceLabel: {
    fontSize: "0.85rem",
    color: "#333",
    margin: 0,
  },
  toggleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: "20px",
    padding: "1rem 1.2rem",
    marginBottom: "1rem",
    boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
  },
  sharedAvatarStack: {
    display: "flex",
    marginBottom: "8px",
  },
  smallAvatar: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    border: "2px solid white",
    objectFit: "cover",
  },
  smallAvatarPlaceholder: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    border: "2px solid white",
    backgroundColor: "#f5f5f5",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: "-12px",
    fontSize: "1rem",
  },
  toggleLabel: {
    fontWeight: "700",
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
    width: "50px",
    height: "28px",
    borderRadius: "14px",
    cursor: "pointer",
    position: "relative",
    transition: "background-color 0.2s ease",
  },
  toggleThumb: {
    position: "absolute",
    top: "3px",
    width: "22px",
    height: "22px",
    borderRadius: "50%",
    backgroundColor: "white",
    boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
    transition: "transform 0.2s ease",
  },
  saveButton: {
    width: "100%",
    padding: "1.1rem",
    backgroundColor: "#ff6b6b",
    color: "white",
    border: "none",
    borderRadius: "16px",
    fontSize: "1rem",
    fontWeight: "700",
    cursor: "pointer",
    marginTop: "1rem",
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
  photoHint: {
    fontSize: "0.72rem",
    color: "#888",
    margin: "0 0 0.5rem 0",
    textAlign: "center",
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
  backfillToggleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.8rem",
    padding: "0 0.2rem",
  },
  backfillLabel: {
    fontSize: "0.85rem",
    color: "#666",
    margin: 0,
  },
  datePickerExpanded: {
    backgroundColor: "white",
    borderRadius: "16px",
    padding: "0.8rem 1rem",
    marginBottom: "1rem",
    boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
    display: "flex",
    flexDirection: "column",
    gap: "0.6rem",
    animation: "slideUpFade 0.3s ease both",
  },
  datePickerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.5rem",
    flexWrap: "wrap",
  },
  datePickerLabel: {
    fontSize: "0.85rem",
    color: "#555",
    fontWeight: "600",
  },
  datePicker: {
    flex: 1,
    minWidth: "120px",
    border: "1px solid #eee",
    borderRadius: "8px",
    padding: "0.5rem",
    fontSize: "0.85rem",
    color: "#333",
    backgroundColor: "#fafafa",
    outline: "none",
  },
  suggestionsDropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    backgroundColor: "white",
    borderRadius: "14px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
    zIndex: 100,
    marginTop: "6px",
    maxHeight: "240px",
    overflowY: "auto",
    padding: "0",
    border: "1px solid #f0f0f0",
  },
  suggestionItem: {
    padding: "0.7rem 1.1rem",
    cursor: "pointer",
    transition: "background 0.2s ease",
    borderBottom: "1px solid #f8f8f8",
  },
  suggestionName: {
    fontSize: "0.88rem",
    fontWeight: "600",
    color: "#444",
  },
  suggestionMeta: {
    fontSize: "0.7rem",
    color: "#bbb",
    marginTop: "1px",
  },
  saveFrequentRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "1rem 1.2rem",
    backgroundColor: "#fffafa",
    cursor: "pointer",
    borderBottomLeftRadius: "24px",
    borderBottomRightRadius: "24px",
  },
  saveFrequentLabel: {
    fontSize: "0.85rem",
    color: "#555",
    fontWeight: "600",
    marginLeft: "8px",
  },
  heartIcon: {
    fontSize: "1.1rem",
    transition: "all 0.2s ease",
  },
  miniToggle: {
    width: "24px",
    height: "14px",
    borderRadius: "10px",
    padding: "2px",
    transition: "background 0.3s ease",
  },
  miniToggleThumb: {
    width: "10px",
    height: "10px",
    backgroundColor: "white",
    borderRadius: "50%",
    transition: "transform 0.3s ease",
  },
};

export default LogMeal;