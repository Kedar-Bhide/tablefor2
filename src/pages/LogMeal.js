import React, { useEffect, useState } from "react";
import { auth, db, query, collection, where, limit, getDocs } from "../firebase";
import ApiService from "../services/api";
import { getFunctions, httpsCallable } from "firebase/functions";
import { compressImage } from "../utils/compressImage";
import { formatLocalDateKey, formatLocalTimeHHMM, getCurrentTimezone } from "../utils/dateTime";
import MealNutritionCard from "../components/MealNutritionCard";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Image as ImageIcon } from "lucide-react";

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
  const previewUrlsRef = React.useRef([]);

  // Track preview URLs for cleanup
  useEffect(() => {
    previewUrlsRef.current = photoPreviews;
  }, [photoPreviews]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => {
        if (url && url.startsWith("blob:")) {
          try { URL.revokeObjectURL(url); } catch {}
        }
      });
    };
  }, []);
  const [saving, setSaving] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isParsingVoice, setIsParsingVoice] = useState(false);
  const [recognition, setRecognition] = useState(null);
  const isIntentionalStop = React.useRef(false);
  const finalTranscriptRef = React.useRef("");
  const isRecordingRef = React.useRef(false);
  const lastSaveTimeRef = React.useRef(0);
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

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = "en-US";

      rec.onstart = () => {
        setIsRecording(true);
        isRecordingRef.current = true;
        localStorage.setItem("hasAskedMicPermission", "true");
      };
      rec.onend = () => {
        // Use ref here to avoid stale closures and dependency warnings
        if (!isIntentionalStop.current && isRecordingRef.current) {
          try { rec.start(); } catch (e) { }
          return;
        }
        setIsRecording(false);
        isRecordingRef.current = false;
        if (finalTranscriptRef.current.trim()) {
          handleVoiceLog(finalTranscriptRef.current);
          finalTranscriptRef.current = "";
        }
      };
      rec.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscriptRef.current += event.results[i][0].transcript + " ";
          }
        }
      };
      rec.onerror = (e) => {
        // 'no-speech' happens if the user stays silent; we can ignore it
        if (e.error === "no-speech") return;

        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          // This triggers if the user has blocked access at the browser level
          alert("Oops! It looks like microphone access is blocked. For the best experience, please go to your browser's Site Settings (look for the lock/settings icon in the address bar) and set Microphone to 'Allow' for this site. We're sorry for the inconvenience!");
        } else {
          console.error("Speech recognition error:", e.error);
        }

        setIsRecording(false);
        isRecordingRef.current = false;
      };
      setRecognition(rec);
    }
  }, []);

  const handleVoiceLog = async (transcript) => {
    setIsParsingVoice(true);
    try {
      const functions = getFunctions();
      const parseVoiceMeal = httpsCallable(functions, "parseVoiceMeal");
      const result = await parseVoiceMeal({ transcript });
      if (result.data && !result.data.error) {
        if (result.data.name) setMealName(result.data.name);
        if (result.data.ingredients) setIngredients(result.data.ingredients);
        if (result.data.portion) setPortionSize(result.data.portion);
        if (result.data.cookType) setCookType(result.data.cookType);
        if (result.data.type) setMealType(result.data.type);
      }
    } catch (e) {
      console.error("Error parsing voice meal:", e);
      alert("Failed to parse voice input. Please try again.");
    } finally {
      setIsParsingVoice(false);
    }
  };

  const toggleRecording = () => {
    if (!recognition) {
      alert("Voice recognition is not supported in this browser.");
      return;
    }

    if (isRecording) {
      isIntentionalStop.current = true;
      recognition.stop();
    } else {
      // Rule-based flow:
      // 1. Show pre-permission explanation if it's the first time
      const hasAsked = localStorage.getItem("hasAskedMicPermission");
      if (!hasAsked) {
        alert("Table For 2 uses your microphone only to convert your speech into meal details. Please allow microphone access when the system prompt appears.");
      }

      // 2. Clear state and attempt to start
      isIntentionalStop.current = false;
      finalTranscriptRef.current = "";

      try {
        recognition.start();
      } catch (e) {
        // This catch handles cases where the browser prevents immediate start
        console.error("Mic start failed:", e);
        alert("We couldn't start the microphone. Please check your browser's site settings to ensure microphone access is allowed for Table For 2.");
      }
    }
  };


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
    setPhotoPreviews((prev) => {
      const url = prev[index];
      if (url && url.startsWith("blob:")) {
        try { URL.revokeObjectURL(url); } catch {}
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSave = async () => {
    if (!mealName || !user) return;
    
    // Cooldown: prevent rapid re-submission (3 second cooldown)
    const now = Date.now();
    if (now - lastSaveTimeRef.current < 3000) {
      return;
    }
    lastSaveTimeRef.current = now;
    
    // Validate meal data
    const validation = ApiService.validateMealData({
      name: mealName,
      type: mealType,
      ingredients: ingredients,
      portionSize: portionSize,
    });
    
    if (!validation.isValid) {
      alert(validation.errors.join('\n'));
      return;
    }
    
    setSaving(true);

    try {
      // Upload photos with retry logic
      const uploadPhotoWithRetry = async (photoFile, retries = 2) => {
        for (let attempt = 0; attempt <= retries; attempt++) {
          try {
            const compressed = await compressImage(photoFile);
            const photoRef = `meals/${user.uid}/${Date.now()}_${Math.random()}`;
            return await ApiService.uploadMealPhoto(compressed, photoRef);
          } catch (uploadError) {
            console.error(`Photo upload attempt ${attempt + 1} failed:`, uploadError);
            if (attempt === retries) throw uploadError;
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          }
        }
      };

      // Upload all photos FIRST (meal must have photos before creation for AI analysis)
      const uploadedURLs = [];
      for (const photoFile of photos) {
        try {
          const url = await uploadPhotoWithRetry(photoFile);
          if (url) uploadedURLs.push(url);
        } catch (e) {
          console.error("Photo upload failed:", e);
        }
      }
      
      // Create meal object
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
      
      const mealObj = {
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
        analysisStatus: previewNutrition ? "completed" : "analyzing",
        saveToFrequent: saveAsFrequent,
      };

      // Create meal with photos already uploaded
      const createdMeal = await ApiService.createMeal(mealObj);

      // Update local state so it appears immediately next time
      if (saveAsFrequent) {
        setFrequentMeals(prev => [{
          id: createdMeal.id,
          name: mealName.trim(),
          ingredients: ingredients.trim(),
          portionSize: portionSize.trim(),
          nutrition: previewNutrition || null,
          mealType: mealType
        }, ...prev]);
      }

      // Update user's current timezone/offset to ensure reminders are accurate
      try {
        await ApiService.updateUser(user.uid, {
          timezone: timezone || null,
          utcOffsetMinutes: utcOffsetMinutesAtLog,
        });
      } catch (e) {
        console.error("Failed to update user timezone during meal log:", e);
      }

      setSaving(false);
      setCurrentPage("today");
      } catch (e) {
        console.error("Meal save failed:", e);
        alert('Failed to save meal: ' + (e.message || 'Unknown error'));
        setSaving(false);
      }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      style={styles.container}
    >
      <button style={styles.back} onClick={() => setCurrentPage("today")}>
        <span style={{ transform: "translateX(-1px)" }}>←</span>
      </button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2 style={{ ...styles.title, marginBottom: 0 }}>
          Log a <span style={{ color: "var(--primary)" }}>Meal</span>
        </h2>
        <button
          style={{
            ...styles.voiceButton,
            backgroundColor: isRecording ? "#ff6b6b" : "#F0F0F0",
            color: isRecording ? "white" : "#666",
            border: "none",
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            padding: 0,
            justifyContent: "center",
            boxShadow: isRecording ? "0 4px 15px rgba(255,107,107,0.3)" : "none",
            animation: isRecording ? "pulseRecording 1.5s infinite" : "none"
          }}
          onClick={toggleRecording}
          disabled={isParsingVoice}
        >
          {isParsingVoice ? (
            "⏳"
          ) : isRecording ? (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M6 6h12v12H6z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          )}
        </button>
      </div>
      {/* Photo Upload Area */}
      <div style={styles.photoUploadContainer}>
        {photoPreviews.length === 0 ? (
          <div style={styles.dashedPhotoBox}>
            <div style={styles.photoOption} onClick={() => document.getElementById("photoInput").click()}>
              <div style={styles.photoIconCircle}><Camera size={32} strokeWidth={1.5} color="var(--text-secondary)" /></div>
              <p style={styles.photoOptionLabel}>Take Photo</p>
            </div>
            <div style={styles.photoDivider} />
            <div style={styles.photoOption} onClick={() => document.getElementById("galleryInput").click()}>
              <div style={styles.photoIconCircle}><ImageIcon size={32} strokeWidth={1.5} color="var(--text-secondary)" /></div>
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

      <AnimatePresence>
        {showPhotoOptions && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Add photo"
            style={styles.overlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setShowPhotoOptions(false)}
          >
            <motion.div
              style={styles.sheet}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 350 }}
              onClick={(e) => e.stopPropagation()}
            >
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
        nutrition={previewNutrition}
        editable={false}
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
    </motion.div>
  );
}

const styles = {
  container: {
    maxWidth: "400px",
    margin: "0 auto",
    padding: "1rem 1.2rem",
    backgroundColor: "#fffaf5",
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
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
    marginBottom: "1rem",
  },
  voiceButton: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 16px",
    borderRadius: "20px",
    border: "1px solid #F0F0F0",
    fontSize: "0.85rem",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  title: {
    fontSize: "2.2rem",
    fontFamily: "'Outfit', sans-serif",
    fontWeight: 700,
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
    fontSize: "16px",
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