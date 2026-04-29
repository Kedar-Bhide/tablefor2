const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const https = require("https");
const functions = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");


admin.initializeApp();
const db = admin.firestore();

async function sendNotification(token, title, body, extraTokens = []) {
  if (!token) return;

  // Deduplicate all tokens
  const allTokens = [...new Set([token, ...extraTokens].filter(Boolean))];

  // Send to all unique tokens
  const promises = allTokens.map(async (t) => {
    try {
      await admin.messaging().send({
        notification: { title, body },
        token: t,
      });
      console.log("Notification sent to token:", t.slice(-10));
    } catch (error) {
      // Token expired/invalid — remove it
      if (error.code === 'messaging/registration-token-not-registered') {
        console.log("Removing invalid token:", t.slice(-10));
      } else {
        console.error("Error sending notification:", error);
      }
    }
  });

  await Promise.all(promises);
}

async function getUser(uid) {
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? snap.data() : null;
}

function getDateKeyFromParts(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getUserLocalClock(userData, now = new Date()) {
  if (userData?.timezone) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: userData.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(now);
      const read = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
      const year = read("year");
      const month = read("month");
      const day = read("day");
      const hour = read("hour");
      const minute = read("minute");
      return { dateStr: getDateKeyFromParts(year, month, day), hour, minute };
    } catch (e) {
      console.warn("Timezone format failed, falling back to offset:", e);
    }
  }

  const offsetMinutes = userData?.utcOffsetMinutes !== undefined
    ? userData.utcOffsetMinutes
    : Math.round((userData?.utcOffset ?? 0) * 60);
  const local = new Date(now.getTime() + offsetMinutes * 60 * 1000);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth() + 1;
  const day = local.getUTCDate();
  const hour = local.getUTCHours();
  const minute = local.getUTCMinutes();
  return { dateStr: getDateKeyFromParts(year, month, day), hour, minute };
}

async function generateInsightForUser(uid, year, month) {
  try {
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) return;
    const user = userSnap.data();

    // Skip if insight already exists for this month
    const insightKey = `${year}-${String(month).padStart(2, "0")}`;
    const existingSnap = await db.collection("users").doc(uid)
      .collection("insights").doc(insightKey).get();
    if (existingSnap.exists) {
      console.log(`Insight already exists for ${uid} - ${insightKey}, skipping`);
      return;
    }

    const nutrition = await aggregateMonthlyNutrition(uid, year, month);
    if (!nutrition) {
      console.log(`Not enough data for user ${uid} in ${year}-${month}`);
      return;
    }

    const monthName = new Date(year, month - 1, 1)
      .toLocaleDateString("en-US", { month: "long" });

    const profileContext = [
      user.age ? `Age: ${user.age}` : null,
      user.gender ? `Gender: ${user.gender}` : null,
      user.height_cm ? `Height: ${user.height_cm}cm` : null,
      user.weight_kg ? `Current weight: ${user.weight_kg}kg` : null,
      user.target_weight_kg ? `Target weight: ${user.target_weight_kg}kg` : null,
    ].filter(Boolean).join(", ");

    const nutritionContext = `
Monthly averages for ${monthName}:
- Calories: ${nutrition.avgCalories} kcal/day
- Protein: ${nutrition.avgProtein}g/day
- Carbs: ${nutrition.avgCarbs}g/day
- Fat: ${nutrition.avgFat}g/day
- Fiber: ${nutrition.avgFiber}g/day
- Days tracked: ${nutrition.daysTracked}
- Total meals logged: ${nutrition.totalMeals}
${nutrition.nutrientGoals ? `- Daily Targets: ${nutrition.nutrientGoals.calories}kcal, ${nutrition.nutrientGoals.protein_g}g Protein, ${nutrition.nutrientGoals.carbs_g}g Carbs, ${nutrition.nutrientGoals.fat_g}g Fat` : ""}
${nutrition.goalsReached ? `- Goal Achievement: Hit Calorie goal ${nutrition.goalsReached.calories}/${nutrition.daysTracked} days, Protein ${nutrition.goalsReached.protein_g}/${nutrition.daysTracked} days, Carbs ${nutrition.goalsReached.carbs_g}/${nutrition.daysTracked} days, Fat ${nutrition.goalsReached.fat_g}/${nutrition.daysTracked} days` : ""}
- Most frequent meal types: ${JSON.stringify(nutrition.typeBreakdown)}
- Common meal descriptors: ${nutrition.topDescriptors.join(", ")}
  `.trim();

    const prompt = `${profileContext ? `User profile: ${profileContext}.` : ""}

${nutritionContext}

Write a warm, personal 2-3 sentence nutrition insight for this person's ${monthName}. 
${user.target_weight_kg ? `They want to reach ${user.target_weight_kg}kg from their current ${user.weight_kg || "unknown"}kg.` : ""}
Be specific — reference actual numbers and meal patterns from their data.
Be encouraging and actionable, not clinical.
Do not use bullet points. Write in flowing sentences only.
Do not mention consulting a doctor or nutritionist.
Keep it under 60 words total.`;

    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150,
        system: "You are an expert nutrition coach specializing in behavior-based insights. Your job is to analyze real user data and generate a short, highly personalized insight that feels human, specific, and motivating. STRICT REQUIREMENTS: Write exactly 2–3 natural, flowing sentences (no bullet points). Maximum 60 words total. Use actual numbers and patterns from the data. Highlight one meaningful pattern. Include one clear, realistic suggestion. Keep tone warm and non-judgmental. Avoid generic advice. Never mention consulting professionals. Never sound robotic. STYLE: Sound like a thoughtful coach. Be concise but insightful. Make the user feel understood and guided.",
        messages: [{ role: "user", content: prompt }],
      });

      const options = {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", async () => {
          try {
            const parsed = JSON.parse(data);
            const insight = parsed.content?.[0]?.text?.trim() || "";
            if (!insight) { resolve(); return; }

            // Save to Firestore
            const insightKey = `${year}-${String(month).padStart(2, "0")}`;
            await db.collection("users").doc(uid).collection("insights")
              .doc(insightKey).set({
                insight,
                month: monthName,
                year,
                nutrition,
                createdAt: new Date(),
              });

            console.log(`Insight saved for ${uid} - ${insightKey}`);
            resolve();
          } catch (e) {
            console.error("Failed to parse insight:", e);
            resolve();
          }
        });
      });

      req.on("error", (e) => {
        console.error("Anthropic API error:", e);
        resolve();
      });

      req.write(body);
      req.end();
    });
  } catch (e) {
    console.error(`generateInsightForUser failed for ${uid}:`, e);
  }
}

async function aggregateMonthlyNutrition(uid, year, month) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  // Fetch own meals
  const [snap, userSnap] = await Promise.all([
    db.collection("meals")
      .where("uid", "==", uid)
      .where("createdAt", ">=", start)
      .where("createdAt", "<=", end)
      .get(),
    db.collection("users").doc(uid).get(),
  ]);
  const ownMeals = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const user = userSnap.exists ? userSnap.data() : null;
  const goals = user?.nutrientGoals || null;

  const meals = [...ownMeals];
  const mealsWithNutrition = meals.filter((m) => m.nutrition);

  if (mealsWithNutrition.length < 5) return null;

  // Daily totals
  const dayMap = {};
  mealsWithNutrition.forEach((m) => {
    const dateStr = m.localDate ||
      (m.createdAt?.toDate ? m.createdAt.toDate() : new Date(m.createdAt))
        .toLocaleDateString("en-CA");
    if (!dayMap[dateStr]) dayMap[dateStr] = {
      calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, count: 0
    };
    dayMap[dateStr].calories += m.nutrition.calories || 0;
    dayMap[dateStr].protein_g += m.nutrition.protein_g || 0;
    dayMap[dateStr].carbs_g += m.nutrition.carbs_g || 0;
    dayMap[dateStr].fat_g += m.nutrition.fat_g || 0;
    dayMap[dateStr].fiber_g += m.nutrition.fiber_g || 0;
    dayMap[dateStr].count++;
  });

  const days = Object.values(dayMap);
  const daysTracked = days.length;

  const avgCalories = Math.round(days.reduce((s, d) => s + d.calories, 0) / daysTracked);
  const avgProtein = Math.round(days.reduce((s, d) => s + d.protein_g, 0) / daysTracked);
  const avgCarbs = Math.round(days.reduce((s, d) => s + d.carbs_g, 0) / daysTracked);
  const avgFat = Math.round(days.reduce((s, d) => s + d.fat_g, 0) / daysTracked);
  const avgFiber = Math.round(days.reduce((s, d) => s + d.fiber_g, 0) / daysTracked);

  // Goal hit counts
  const goalsReached = {
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
  };

  if (goals) {
    days.forEach((day) => {
      // For calories, we define 'hit' as staying within +/- 150 kcal or under if weight loss
      // But let's keep it simple: hit if within 10% of target
      const calDiff = Math.abs(day.calories - goals.calories);
      if (calDiff <= 200) goalsReached.calories++;
      
      if (day.protein_g >= (goals.protein_g * 0.9)) goalsReached.protein_g++;
      if (day.carbs_g >= (goals.carbs_g * 0.8) && day.carbs_g <= (goals.carbs_g * 1.2)) goalsReached.carbs_g++;
      if (day.fat_g >= (goals.fat_g * 0.8) && day.fat_g <= (goals.fat_g * 1.2)) goalsReached.fat_g++;
      if (day.fiber_g >= (goals.fiber_g * 0.9)) goalsReached.fiber_g++;
    });
  }

  // Most frequent meal descriptors
  const descriptors = mealsWithNutrition
    .map((m) => m.nutrition.descriptor)
    .filter(Boolean);
  const descriptorFreq = {};
  descriptors.forEach((d) => {
    descriptorFreq[d] = (descriptorFreq[d] || 0) + 1;
  });
  const topDescriptors = Object.entries(descriptorFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([d]) => d);

  // Meal type breakdown
  const typeMap = {};
  meals.forEach((m) => {
    typeMap[m.type] = (typeMap[m.type] || 0) + 1;
  });

  return {
    avgCalories,
    avgProtein,
    avgCarbs,
    avgFat,
    avgFiber,
    daysTracked,
    totalMeals: mealsWithNutrition.length,
    typeBreakdown: typeMap,
    topDescriptors: sortedDescriptors.slice(0, 8),
    goalsReached: goals ? goalsReached : null,
    nutrientGoals: goals,
  };
}
async function analyzeMealNutrition(mealName, photoURL, userProfile, ingredients, portionSize, cookType = "Homemade") {
  const isVague = (!mealName || mealName.trim().split(" ").length < 2 ||
    ["food", "meal", "lunch", "dinner", "breakfast", "snack", "ate", "eating"].includes(
      mealName.trim().toLowerCase()
    )) && !ingredients;

  const profileContext = userProfile
    ? `User profile: ${userProfile.age ? userProfile.age + " years old" : "unknown age"}, ${userProfile.gender || "unknown gender"}, ${userProfile.height_cm ? userProfile.height_cm + "cm" : "unknown height"}, ${userProfile.weight_kg ? userProfile.weight_kg + "kg" : "unknown weight"}.`
    : "No user profile available.";

  const details = [];
  if (ingredients) details.push(`Ingredients/Notes: ${ingredients}`);
  if (portionSize) details.push(`Portion Size: ${portionSize}`);
  const detailsStr = details.length > 0 ? details.join(". ") : "No specific quantity provided.";

  const systemInstruction = `
    Analyze the meal details and estimate nutritional content.
    Meal Source: ${cookType} (Homemade, Restaurant, or Packaged).
    
    Guidelines:
    1. Prioritize provided ingredients and portion size as the primary evidence.
    2. Cook Type Adjustments:
       - HOMEMADE: Assume standard preparation.
       - RESTAURANT: Assume professional preparation (often higher in fats/oils and sodium). Add a realistic 15-25% caloric buffer compared to a lean home version, but do not over-penalize if the dish is inherently healthy.
       - PACKAGED: Assume commercial nutritional standards for the described item.
    3. Portions: Treat "Standard" as one serving, "Large" as 1.5x, and "Small" as 0.7x.
    4. Objectivity: Provide an unbiased, realistic estimate. Never return 0 for calories.
    
    Return ONLY a JSON object: {"calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "fiber_g": number, "descriptor": "2-4 word description", "analyzed_by": "ai"}.
  `;

  const messages = [];

  if (isVague && photoURL) {
    messages.push({
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "url",
            url: photoURL,
          },
        },
        {
          type: "text",
          text: `${profileContext} ${systemInstruction} Analyze this meal photo.`,
        },
      ],
    });
  } else {
    messages.push({
      role: "user",
      content: `${profileContext} ${systemInstruction} Analyze this meal: "${mealName}". Details: ${detailsStr}`,
    });
  }

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system: "You are a highly accurate nutrition estimation engine. Your goal is to produce realistic, data-driven nutritional estimates based on incomplete real-world inputs (meal names, photos, ingredients, and portion size). CORE PRINCIPLES: Always return a best-guess estimate—never return zero or null values. Prioritize ingredients and portion size over generic assumptions. If data is vague, infer the most likely real-world equivalent. Be conservative but realistic—avoid extreme underestimation or overestimation. PORTION LOGIC: Standard = 1x serving. Large = 1.5x serving. Small = 0.7x serving. COOKING CONTEXT: Homemade = moderate oil and standard prep. Restaurant = increase calories by ~15–25% (hidden fats/oils) while staying realistic. Packaged = assume typical commercial nutrition values. OUTPUT RULES: Return ONLY valid JSON (no markdown, no explanation). All numeric values must be positive integers. Use realistic macro distributions. \"descriptor\" must be a concise 2–4 word food description. Always include all fields. OUTPUT FORMAT: {\"calories\": number, \"protein_g\": number, \"carbs_g\": number, \"fat_g\": number, \"fiber_g\": number, \"descriptor\": string, \"analyzed_by\": \"ai\"}",
      messages,
    });

    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed.content?.[0]?.text || "";
          const clean = text.replace(/```json|```/g, "").trim();
          const nutrition = JSON.parse(clean);
          resolve(nutrition);
        } catch (e) {
          console.error("Failed to parse nutrition response:", e, data);
          resolve({
            calories: 400,
            protein_g: 15,
            carbs_g: 45,
            fat_g: 12,
            fiber_g: 4,
            descriptor: "estimated meal",
            analyzed_by: "fallback",
          });
        }
      });
    });

    req.on("error", (e) => {
      console.error("Anthropic API error:", e);
      resolve({
        calories: 400,
        protein_g: 15,
        carbs_g: 45,
        fat_g: 12,
        fiber_g: 4,
        descriptor: "estimated meal",
        analyzed_by: "fallback",
      });
    });

    req.write(body);
    req.end();
  });
}

// Triggered when a new meal is created
exports.onMealCreated = onDocumentCreated(
  { document: "meals/{mealId}", secrets: [ANTHROPIC_API_KEY] },
  async (event) => {

    const meal = event.data.data();
    const uid = meal.uid;
    const mealId = event.params.mealId;

    // Skip task creation for meals completed from a task
    // (they have sourceMealId set)
    if (meal.sourceMealId) {
      // Still run nutrition analysis but skip task/notification
      try {
        // Check if nutrition is already provided (e.g. from a frequent meal)
        if (meal.nutrition && meal.nutrition.calories > 0) {
          console.log(`Meal ${mealId} already has nutrition, skipping analysis.`);
          return;
        }

        const primaryPhoto = (meal.photos?.length > 0)
          ? meal.photos[0]
          : meal.photoURL || null;
        const nutrition = await analyzeMealNutrition(
          meal.name,
          primaryPhoto,
          user || null,
          meal.ingredients || meal.quantity || null,
          meal.portionSize || null,
          meal.cookType || (meal.isRestaurant ? "Restaurant" : "Homemade")
        );
        if (nutrition && nutrition.calories > 0) {
          await db.collection("meals").doc(mealId).update({ nutrition });
        }

        // Save to Favorites if flagged
        if (meal.saveToFrequent) {
          try {
            await db.collection("frequentMeals").add({
              uid: meal.uid,
              mealType: meal.type,
              name: meal.name.trim(),
              ingredients: (meal.ingredients || "").trim(),
              portionSize: (meal.portionSize || "").trim(),
              nutrition: nutrition || meal.nutrition || null,
              lastUsed: new Date(),
            });
          } catch (favError) {
            console.error("Failed to save favorite for task meal:", favError);
          }
        }
      } catch (e) {
        console.error("Nutrition analysis failed for task meal:", e);
      }
      return;
    }

    const user = await getUser(uid);

    // Run nutrition analysis and partner notification in parallel
    await Promise.all([
      // Nutrition analysis
      (async () => {
        try {
          let finalNutrition = meal.nutrition || null;

          if (!finalNutrition || !finalNutrition.calories) {
            const primaryPhoto = (meal.photos?.length > 0)
              ? meal.photos[0]
              : meal.photoURL || null;

            const nutrition = await analyzeMealNutrition(
              meal.name,
              primaryPhoto,
              user || null,
              meal.ingredients || meal.quantity || null,
              meal.portionSize || null,
              meal.cookType || (meal.isRestaurant ? "Restaurant" : "Homemade")
            );

            if (nutrition && nutrition.calories > 0) {
              finalNutrition = nutrition;
              await db.collection("meals").doc(mealId).update({ nutrition: finalNutrition });
              console.log(`Nutrition saved for meal ${mealId}:`, finalNutrition);
            }
          } else {
            console.log(`Meal ${mealId} already has nutrition, skipping analysis.`);
          }

          // Save to Favorites if flagged
          if (meal.saveToFrequent) {
            try {
              await db.collection("frequentMeals").add({
                uid: meal.uid,
                mealType: meal.type,
                name: meal.name.trim(),
                ingredients: (meal.ingredients || "").trim(),
                portionSize: (meal.portionSize || "").trim(),
                nutrition: finalNutrition,
                lastUsed: new Date(),
              });
              console.log(`Favorite saved for meal ${mealId}`);
            } catch (favError) {
              console.error("Failed to save favorite from backend:", favError);
            }
          }
        } catch (e) {
          console.error("Nutrition analysis failed:", e);
        }
      })(),

      // Partner notification + task creation
      (async () => {
        if (!user || !user.partnerUid) return;
        const partner = await getUser(user.partnerUid);
        if (!partner) return;

        // Create task if meal is shared
        if (meal.isShared) {
          try {
            // Check if task already exists for this meal
            const existingTask = await db.collection("tasks")
              .where("sourceMealId", "==", mealId)
              .where("toUid", "==", user.partnerUid)
              .get();

            if (!existingTask.empty) {
              console.log(`Task already exists for meal ${mealId}, skipping`);
            } else {
              await db.collection("tasks").add({
                sourceMealId: mealId,
                fromUid: uid,
                toUid: user.partnerUid,
                mealName: meal.name || "",
                mealType: meal.type || "Meal",
                photos: meal.photos?.length > 0 ? meal.photos : meal.photoURL ? [meal.photoURL] : [],
                fromIngredients: meal.ingredients || meal.quantity || "",
                fromPortionSize: meal.portionSize || "",
                fromQuantity: "", // Legacy cleanup
                localDate: meal.localDate || "",
                localTime: meal.localTime || "",
                isRestaurant: meal.isRestaurant || false,
                completed: false,
                dismissed: false,
                completedAt: null,
                createdAt: new Date(),
              });
              console.log(`Task created for shared meal ${mealId}`);
            }
          } catch (e) {
            console.error("Failed to create task:", e);
          }
        }

        // Send notification
        if (partner.fcmToken && partner.notifSettings?.partnerMeal !== false) {
          const firstName = user.name ? user.name.split(" ")[0] : "Your partner";
          let body;
          if (meal.isShared) {
            body = `${firstName} logged a shared ${meal.type.toLowerCase()} 🍽️ — add your quantities!`;
          } else {
            const messages = [
              `${firstName} just logged ${meal.type.toLowerCase()} 🍽️`,
              `${firstName} is eating! Don't fall behind 😄`,
              `${firstName} logged a meal — your turn! 🍴`,
            ];
            body = messages[Math.floor(Math.random() * messages.length)];
          }
          await sendNotification(partner.fcmToken, "TableFor2", body, partner.fcmTokens || []);
        }
      })(),
    ]);
  });

// Triggered when a user's earnedBadges array grows
exports.onBadgeEarned = onDocumentUpdated("users/{uid}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();

  const prevBadges = before.earnedBadges || [];
  const newBadges = after.earnedBadges || [];

  const justEarned = newBadges.filter((b) => !prevBadges.includes(b));
  if (justEarned.length === 0) return;

  const token = after.fcmToken;
  if (!token || after.notifSettings?.badgeEarned === false) return;

  const badgeNames = {
    first_meal: "First Bite 🍽️",
    first_week: "First Week 🔥",
    in_sync: "In Sync 💑",
    food_photographer: "Food Photographer 📸",
    consistent: "Consistent 🌟",
    sharing_is_caring: "Sharing is Caring 🤝",
    early_bird: "Early Bird 🌅",
    on_a_roll: "On a Roll 🎯",
  };

  for (const badgeId of justEarned) {
    const badgeName = badgeNames[badgeId] || "New Badge";
    const messages = [
      `You just earned ${badgeName}!`,
      `New badge unlocked: ${badgeName} 🏆`,
      `Achievement unlocked: ${badgeName}!`,
    ];
    const body = messages[Math.floor(Math.random() * messages.length)];
    await sendNotification(token, "TableFor2 🏆", body, partner.fcmTokens || []);
  }
});

// Triggered when a reaction or comment is added to a meal
exports.onMealReacted = onDocumentUpdated("meals/{mealId}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();

  const mealOwnerUid = after.uid;
  const mealOwner = await getUser(mealOwnerUid);
  if (!mealOwner || !mealOwner.fcmToken) return;
  if (mealOwner.notifSettings?.partnerMeal === false) return;

  // Check for new reaction
  const prevReactions = before.reactions || {};
  const newReactions = after.reactions || {};
  const newReactionEntry = Object.entries(newReactions).find(
    ([uid, emoji]) => prevReactions[uid] !== emoji && uid !== mealOwnerUid
  );

  // Check for new comment
  const prevComments = before.comments || {};
  const newComments = after.comments || {};
  const newCommentEntry = Object.entries(newComments).find(
    ([uid, text]) => prevComments[uid] !== text && uid !== mealOwnerUid
  );

  if (!newReactionEntry && !newCommentEntry) return;

  // Get reactor/commenter name
  const actorUid = newReactionEntry?.[0] || newCommentEntry?.[0];
  const actor = await getUser(actorUid);
  const actorName = actor?.name ? actor.name.split(" ")[0] : "Your partner";

  let body = "";
  if (newReactionEntry && newCommentEntry) {
    body = `${actorName} reacted ${newReactionEntry[1]} and commented on your ${after.type.toLowerCase()} 💬`;
  } else if (newReactionEntry) {
    body = `${actorName} reacted ${newReactionEntry[1]} to your ${after.type.toLowerCase()} 🍽️`;
  } else if (newCommentEntry) {
    body = `${actorName} commented on your ${after.type.toLowerCase()}: "${newCommentEntry[1]}" 💬`;
  }

  await sendNotification(mealOwner.fcmToken, "TableFor2", body, mealOwner.fcmTokens || []);
});


async function hasLoggedToday(uid, mealType) {
  const userSnap = await db.collection("users").doc(uid).get();
  const userData = userSnap.exists ? userSnap.data() : {};
  const { dateStr: localDateStr } = getUserLocalClock(userData);

  // Check own meals
  const snap = await db.collection("meals")
    .where("uid", "==", uid)
    .where("type", "==", mealType)
    .where("localDate", "==", localDateStr)
    .get();

  if (!snap.empty) {
    console.log(`${userData.name} hasLogged ${mealType} on ${localDateStr}: true (own meal)`);
    return true;
  }

  console.log(`${userData.name} hasLogged ${mealType} on ${localDateStr}: false`);
  return false;
}

// Runs every 15 mins to check each user's local time accurately across all offsets
exports.breakfastReminder = onSchedule("*/15 * * * *", async () => {
  await sendMealReminder("Breakfast", 10, 30, [
    "Good morning! Don't skip breakfast 🌅",
    "Breakfast time! Log it before 11am for $2 💰",
    "Rise and eat! Breakfast is waiting 🍳",
  ]);
});

exports.lunchReminder = onSchedule("*/15 * * * *", async () => {
  await sendMealReminder("Lunch", 13, 30, [
    "Lunchtime! Don't forget to log it 🥗",
    "It's almost 2pm — log lunch for $2 💰",
    "Halfway through the day — have you eaten? 🍱",
  ]);
});

exports.dinnerReminder = onSchedule("*/15 * * * *", async () => {
  await sendMealReminder("Dinner", 20, 30, [
    "Dinner time! Log it before 9pm for $2 💰",
    "Almost 9pm — don't miss your dinner reward 🌙",
    "Last meal of the day — make it count! 🍽️",
  ]);
});

async function sendMealReminder(mealType, reminderLocalHour, reminderLocalMinute, messages) {
  console.log(`Running ${mealType} reminder check at UTC: ${new Date().toISOString()}`);
  const usersSnap = await db.collection("users").get();

  const promises = usersSnap.docs.map(async (userDoc) => {
    const user = userDoc.data();

    // Cooldown check — don't send same reminder type twice within 2 hours
    const cooldownKey = `lastReminder_${mealType}`;
    const lastSent = user[cooldownKey] ? new Date(user[cooldownKey]) : null;
    if (lastSent && (new Date() - lastSent) < 2 * 60 * 60 * 1000) {
      console.log(`Skipping ${user.name} — ${mealType} reminder sent recently`);
      return;
    }
    console.log(
      `Checking user: ${user.name}, fcmToken: ${!!user.fcmToken}, timezone: ${user.timezone || "n/a"}, utcOffsetMinutes: ${user.utcOffsetMinutes ?? "n/a"}`
    );

    if (!user.fcmToken) {
      console.log(`Skipping ${user.name} - no FCM token`);
      return;
    }
    if (user.notifSettings?.mealReminder === false) {
      console.log(`Skipping ${user.name} - reminders disabled`);
      return;
    }

    const { dateStr: localDateStr, hour: localHour, minute: localMinute } = getUserLocalClock(user);
    console.log(
      `User ${user.name} local time: ${localHour}:${String(localMinute).padStart(2, "0")}, target: ${reminderLocalHour}:${String(reminderLocalMinute).padStart(2, "0")}`
    );

    // Since we run every 15 mins, we use a tighter 7-min window to avoid double triggers
    const isRightTime = localHour === reminderLocalHour &&
      localMinute >= reminderLocalMinute - 7 &&
      localMinute <= reminderLocalMinute + 7;

    if (!isRightTime) {
      console.log(`Skipping ${user.name} - not right time`);
      return;
    }

    // De-duplication check: Don't send if we already sent a reminder for this local day/type
    if (user.lastReminders?.[mealType] === localDateStr) {
      console.log(`Skipping ${user.name} - already sent ${mealType} reminder today`);
      return;
    }

    const already = await hasLoggedToday(userDoc.id, mealType);
    console.log(`User ${user.name} already logged ${mealType}: ${already}`);
    if (already) return;

    const body = messages[Math.floor(Math.random() * messages.length)];
    console.log(`Sending ${mealType} reminder to ${user.name}`);
    await sendNotification(user.fcmToken, "TableFor2 ⏰", body, user.fcmTokens || []);
    // Save cooldown timestamp
    await db.collection("users").doc(userDoc.id).update({
      [`lastReminder_${mealType}`]: new Date().toISOString(),
    });

    // Save that we sent this reminder
    await db.collection("users").doc(userDoc.id).update({
      [`lastReminders.${mealType}`]: localDateStr,
    });
  });
  await Promise.all(promises);
}

// Runs on 1st of every month at 8AM UTC
exports.generateMonthlyInsights = onSchedule(
  { schedule: "0 8 1 * *", secrets: [ANTHROPIC_API_KEY] },
  async () => {
    const now = new Date();
    // Analyze previous month
    const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const month = now.getMonth() === 0 ? 12 : now.getMonth();

    console.log(`Generating insights for ${year}-${month}`);

    const usersSnap = await db.collection("users").get();
    const promises = usersSnap.docs.map((userDoc) =>
      generateInsightForUser(userDoc.id, year, month)
    );
    await Promise.all(promises);
    console.log("Monthly insights generation complete");
  }
);

exports.reanalyzeMeal = onCall(
  { secrets: [ANTHROPIC_API_KEY] },
  async (request) => {
    try {
      const { mealId } = request.data;
      if (!mealId) throw new Error("mealId required");

      const mealSnap = await db.collection("meals").doc(mealId).get();
      if (!mealSnap.exists) throw new Error("Meal not found");

      const meal = mealSnap.data();

      // Security check — only meal owner can reanalyze
      if (request.auth?.uid && request.auth.uid !== meal.uid) {
        throw new Error("Unauthorized");
      }

      const userSnap = await db.collection("users").doc(meal.uid).get();
      const user = userSnap.exists ? userSnap.data() : null;

      const existingNutrition = meal.nutrition || null;

      const primaryPhoto = (meal.photos?.length > 0)
        ? meal.photos[0]
        : meal.photoURL || null;

      const nutrition = await analyzeMealNutrition(
        meal.name,
        primaryPhoto,
        user || null,
        meal.ingredients || meal.quantity || null,
        meal.portionSize || null,
        meal.cookType || (meal.isRestaurant ? "Restaurant" : "Homemade")
      );

      // Only update if we got valid nutrition back
      if (nutrition && nutrition.calories > 0) {
        await db.collection("meals").doc(mealId).update({ nutrition });
        console.log(`Reanalyzed meal ${mealId}:`, nutrition);
        return { success: true, nutrition };
      } else {
        // Keep existing nutrition if reanalysis fails
        console.log(`Reanalysis returned invalid data for ${mealId}, keeping existing`);
        return { success: false, nutrition: existingNutrition };
      }
    } catch (e) {
      console.error("reanalyzeMeal error:", e);
      return { success: false, error: e.message };
    }
  }
);

exports.generateWeightInsight = onCall(
  { secrets: [ANTHROPIC_API_KEY] },
  async (request) => {
    try {
      const {
        uid,
        newWeight,
        previousWeight,
        targetWeight,
        periodStart,
        periodEnd,
        checkInDate,
      } = request.data;

      if (!uid || !newWeight) throw new Error("Missing required fields");
      // If no previous weight — use new weight as both (first check-in)
      const effectivePreviousWeight = previousWeight || newWeight;

      // Fetch user profile
      const userSnap = await db.collection("users").doc(uid).get();
      if (!userSnap.exists) throw new Error("User not found");
      const userData = userSnap.data();

      // Fetch meals in the period
      const start = new Date(periodStart + "T00:00:00");
      const end = new Date(periodEnd + "T23:59:59");

      const mealsSnap = await db.collection("meals")
        .where("uid", "==", uid)
        .where("createdAt", ">=", start)
        .where("createdAt", "<=", end)
        .get();

      const meals = mealsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const mealsWithNutrition = meals.filter((m) => m.nutrition);

      // Not enough data
      if (mealsWithNutrition.length < 5) {
        return {
          success: false,
          reason: "insufficient_data",
          message: "Not enough meal data for this period",
        };
      }

      // Aggregate nutrition
      const dayMap = {};
      mealsWithNutrition.forEach((m) => {
        const dateStr = m.localDate || periodStart;
        if (!dayMap[dateStr]) dayMap[dateStr] = {
          calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, count: 0
        };
        dayMap[dateStr].calories += m.nutrition.calories || 0;
        dayMap[dateStr].protein_g += m.nutrition.protein_g || 0;
        dayMap[dateStr].carbs_g += m.nutrition.carbs_g || 0;
        dayMap[dateStr].fat_g += m.nutrition.fat_g || 0;
        dayMap[dateStr].fiber_g += m.nutrition.fiber_g || 0;
        dayMap[dateStr].count++;
      });

      const days = Object.values(dayMap);
      const daysTracked = days.length;
      const avgCalories = Math.round(days.reduce((s, d) => s + d.calories, 0) / daysTracked);
      const avgProtein = Math.round(days.reduce((s, d) => s + d.protein_g, 0) / daysTracked);
      const avgCarbs = Math.round(days.reduce((s, d) => s + d.carbs_g, 0) / daysTracked);
      const avgFat = Math.round(days.reduce((s, d) => s + d.fat_g, 0) / daysTracked);
      const avgFiber = Math.round(days.reduce((s, d) => s + d.fiber_g, 0) / daysTracked);

      // Top meal descriptors
      const descriptors = mealsWithNutrition
        .map((m) => m.nutrition.descriptor)
        .filter(Boolean);
      const descriptorFreq = {};
      descriptors.forEach((d) => {
        descriptorFreq[d] = (descriptorFreq[d] || 0) + 1;
      });
      const topDescriptors = Object.entries(descriptorFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([d]) => d)
        .join(", ");

      // Restaurant vs homemade ratio
      const restaurantCount = meals.filter((m) => m.isRestaurant).length;
      const homemadeCount = meals.length - restaurantCount;
      const restaurantPct = Math.round((restaurantCount / meals.length) * 100);

      // Weight direction
      const weightDelta = parseFloat((newWeight - effectivePreviousWeight).toFixed(1));
      const distanceFromTarget = targetWeight
        ? parseFloat((newWeight - targetWeight).toFixed(1))
        : null;

      let weightDirection = "maintain";
      if (targetWeight) {
        if (newWeight < previousWeight && newWeight > targetWeight) weightDirection = "progress_losing";
        else if (newWeight > previousWeight && newWeight > targetWeight) weightDirection = "regress_gaining";
        else if (newWeight < previousWeight && newWeight < targetWeight) weightDirection = "past_target";
        else if (newWeight === previousWeight) weightDirection = "maintain";
        else weightDirection = "progress_losing";
      }

      // Profile context
      const profileContext = [
        userData.age ? `Age: ${userData.age}` : null,
        userData.gender ? `Gender: ${userData.gender}` : null,
        userData.height_cm ? `Height: ${userData.height_cm}cm` : null,
      ].filter(Boolean).join(", ");

      // Weight direction instruction
      const directionInstruction = {
        progress_losing: "They are losing weight toward their target. Celebrate progress warmly and reinforce what's working.",
        regress_gaining: "They gained weight away from their target. Be encouraging not critical. Suggest 1-2 specific actionable changes based on their actual food data.",
        past_target: "They have surpassed their target weight loss. Celebrate and focus on maintenance.",
        maintain: "Weight is unchanged. Focus on consistency and small improvements to keep momentum.",
      }[weightDirection] || "Focus on balanced nutrition and consistency.";

      const prompt = `${profileContext ? `User profile: ${profileContext}.` : ""}

Weight check-in data:
- Previous weight: ${effectivePreviousWeight}kg
- New weight: ${newWeight}kg
- Weight change: ${weightDelta > 0 ? "+" : ""}${weightDelta}kg
${targetWeight ? `- Target weight: ${targetWeight}kg (${distanceFromTarget > 0 ? distanceFromTarget + "kg to go" : "target reached!"})` : ""}

Nutrition averages (${daysTracked} days tracked out of 15):
- Calories: ${avgCalories} kcal/day
- Protein: ${avgProtein}g/day
- Carbs: ${avgCarbs}g/day  
- Fat: ${avgFat}g/day
- Fiber: ${avgFiber}g/day
- Most eaten: ${topDescriptors || "varied meals"}
- Homemade ${homemadeCount} meals / Restaurant ${restaurantCount} meals (${100 - restaurantPct}% homemade)

Weight direction: ${directionInstruction}

Write exactly 4-5 bullet points. Each bullet:
- Starts with a relevant emoji
- References actual numbers or foods from their data
- Is specific and actionable
- Is warm and encouraging
- Max 25 words per bullet
- No intro or outro sentences — bullets only
- Never mention seeing a doctor or nutritionist`;

      // Call Claude Haiku
      const insightText = await new Promise((resolve, reject) => {
        const body = JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 300,
          system: "You are an elite personal nutrition coach delivering highly actionable biweekly insights. You combine weight trends and nutrition data to guide behavior change in a clear, motivating way. STRICT OUTPUT RULES: Write exactly 4–5 bullet points. Each bullet MUST start with a relevant emoji, be under 25 words, include specific numbers or real food patterns, and contain a clear, practical action or reinforcement. No intro or closing sentence. No fluff or generic advice. CONTENT EXPECTATIONS: Connect weight change directly to eating patterns. Reinforce what is working or gently correct what is not. Be encouraging, never critical. Focus on small, realistic improvements, not extreme changes. STYLE: Direct, clear, and supportive. Insightful, not obvious. Feels like a smart coach reviewing real data. NEVER: Suggest consulting professionals. Use vague phrases like \"eat better\" or \"be healthier\". Repeat the same idea across bullets.",
          messages: [{ role: "user", content: prompt }],
        });

        const options = {
          hostname: "api.anthropic.com",
          path: "/v1/messages",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
        };

        const req = https.request(options, (res) => {
          let data = "";
          res.on("data", (chunk) => { data += chunk; });
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data);
              const text = parsed.content?.[0]?.text?.trim() || "";
              if (!text) reject(new Error("Empty response"));
              else resolve(text);
            } catch (e) {
              reject(e);
            }
          });
        });

        req.on("error", reject);
        req.write(body);
        req.end();
      });

      // Save to Firestore
      const insightDoc = {
        date: checkInDate,
        previousWeight,
        newWeight,
        targetWeight: targetWeight || null,
        weightDelta,
        insight: insightText,
        periodStart,
        periodEnd,
        daysTracked,
        avgCalories,
        avgProtein,
        avgCarbs,
        avgFat,
        dismissed: false,
        createdAt: new Date(),
      };

      await db.collection("users").doc(uid)
        .collection("weightInsights").doc(checkInDate)
        .set(insightDoc);

      console.log(`Weight insight saved for ${uid} - ${checkInDate}`);

      return {
        success: true,
        insight: insightText,
        ...insightDoc,
        id: checkInDate,
      };

    } catch (e) {
      console.error("generateWeightInsight error:", e);
      return { success: false, error: e.message };
    }
  }
);

// Notify partner of incoming link request
exports.sendPartnerRequestNotification = onCall(async (request) => {
  try {
    const { toUid, fromName } = request.data;
    if (!toUid || !fromName) return;

    const partner = await getUser(toUid);
    if (!partner?.fcmToken) return;

    await sendNotification(
      partner.fcmToken,
      "TableFor2 💑",
      `${fromName} wants to link accounts with you — check your Profile!`,
      partner.fcmTokens || []
    );
  } catch (e) {
    console.error("sendPartnerRequestNotification error:", e);
  }
});

// Notify requester that partner accepted
exports.sendPartnerAcceptedNotification = onCall(async (request) => {
  try {
    const { toUid, fromName } = request.data;
    if (!toUid || !fromName) return;

    const partner = await getUser(toUid);
    if (!partner?.fcmToken) return;

    await sendNotification(
      partner.fcmToken,
      "TableFor2 🎉",
      `${fromName} accepted your partner request! You're now linked.`,
      partner.fcmTokens || []
    );
  } catch (e) {
    console.error("sendPartnerAcceptedNotification error:", e);
  }
});