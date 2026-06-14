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

const WHITELISTED_WALLET_UIDS = [
  "f4Pnwy9imIeYEn987KNkATi2yG33",
  "P8Hw72zyZqhJ19oxNZ9LYQTJvLT2"
];

async function sendNotification(token, title, body) {
  if (!token) return;

  try {
    await admin.messaging().send({
      notification: { title, body },
      token: token,
    });
    console.log("Notification sent to token:", token.slice(-10));
  } catch (error) {
    // Token expired/invalid — log it
    if (error.code === 'messaging/registration-token-not-registered') {
      console.log("Invalid/expired token:", token.slice(-10));
    } else {
      console.error("Error sending notification:", error);
    }
  }
}

async function getUser(uid) {
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? snap.data() : null;
}

// Simple Firestore-based rate limiter per user per function
// Allows maxCalls calls per windowMinutes window
async function checkRateLimit(uid, functionName, maxCalls = 30, windowMinutes = 60) {
  const docId = `${functionName}_${uid}`;
  const ref = db.collection("rateLimits").doc(docId);

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const now = Date.now();
    const windowStart = now - windowMinutes * 60 * 1000;

    let data = snap.data();
    if (!data || data.windowStart < windowStart) {
      // Start a new window
      transaction.set(ref, {
        uid,
        functionName,
        count: 1,
        windowStart: now,
      });
      return;
    }

    if (data.count >= maxCalls) {
      const retryAfter = Math.ceil((data.windowStart + windowMinutes * 60 * 1000 - now) / 1000);
      throw new Error(`Rate limit exceeded. Retry after ${retryAfter}s`);
    }

    transaction.update(ref, { count: admin.firestore.FieldValue.increment(1) });
  });
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

// Usage monitoring for Claude API
async function logApiUsage(uid, endpoint, tokensUsed = 0) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const usageRef = db.collection("usage_logs").doc(today);
    await usageRef.set({
      [`calls.${uid}`]: admin.firestore.FieldValue.increment(1),
      [`tokens.${uid}`]: admin.firestore.FieldValue.increment(tokensUsed),
      [`endpoints.${endpoint}`]: admin.firestore.FieldValue.increment(1),
      lastUpdated: new Date(),
    }, { merge: true });
  } catch (e) {
    console.error("Failed to log API usage:", e);
  }
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

    const prompt = `
${profileContext ? `User profile: ${profileContext}` : ""}

${nutritionContext}

Write a short monthly nutrition reflection for this user based on their real eating patterns and tracking data.

Requirements:
- Write 2-3 natural sentences only
- Keep total length under 60 words
- Reference specific numbers, patterns, or habits from their data
- Mention one meaningful observation
- Include one small, realistic suggestion or encouragement
- Sound warm, thoughtful, and human
- Avoid generic advice or robotic phrasing
- Do not use bullet points
- Do not mention consulting professionals

${user.target_weight_kg ? `Their current goal is reaching ${user.target_weight_kg}kg.` : ""}
`.trim();

    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150,
        system: `
You are a thoughtful nutrition coach specializing in behavior-based food insights.

Your role is to analyze real nutrition tracking data and write concise monthly reflections that feel personal, supportive, and specific to the individual.

Focus on:
- recognizable eating patterns
- consistency trends
- macro balance
- meal habits
- realistic progress signals

Writing style:
- warm and conversational
- concise but insightful
- natural and emotionally intelligent
- encouraging without sounding overly motivational
- observational rather than clinical

Important rules:
- Never sound robotic or templated
- Avoid generic wellness advice
- Use actual user data whenever possible
- Prioritize specificity over broad recommendations
- Keep suggestions small and actionable
- Never shame the user
- Never mention doctors, nutritionists, or medical disclaimers
- Never use bullet points

The response should feel like a personalized monthly check-in from a smart nutrition coach who genuinely reviewed the user's habits.
        `.trim(),
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
            
            // Log API usage
            const usageTokens = parsed.usage?.input_tokens + parsed.usage?.output_tokens || 0;
            await logApiUsage(uid, "insight", usageTokens);

            // Send notification
            if (user.fcmToken) {
              await sendNotification(
                user.fcmToken,
                "New Monthly Insight ✨",
                `Your nutritional summary for ${monthName} is ready!`
              );
            }

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
    topDescriptors,
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
    You are an expert nutritional estimation engine specialized in restaurant meals, homemade foods, packaged foods, and multicultural cuisine analysis.

Your task is to analyze the provided meal information (meal name, ingredients, user notes, preparation type, and portion description) and generate realistic nutritional estimates.

Prioritize balanced, evidence-based estimations using:
- meal name
- ingredients
- cuisine type
- preparation style
- portion description
- restaurant or brand context (if identifiable)

Avoid both unrealistic “healthy bias” and unnecessary calorie inflation.

-----------------------------------
STEP 1: FOOD IDENTIFICATION
-----------------------------------

Determine ALL of the following:

1. Cuisine Type
Identify the most likely cuisine or food category:
- Indian
- Mexican
- Italian
- Thai
- Mediterranean
- Chinese
- American
- etc.

2. Exact Dish Identification
Infer the most likely real-world dish.

Examples:
- “Butter Chicken” -> Indian curry dish
- “Burrito Bowl” -> Mexican-style rice bowl
- “Paneer Tikka Wrap” -> Indian fusion wrap

3. Restaurant / Brand Matching
Detect whether the meal is likely from:
- a chain restaurant
- grocery brand
- packaged product

If recognizable:
- prioritize known commercial nutritional standards from training knowledge
- use restaurant or packaged nutrition patterns when appropriate

4. Ingredient Decomposition & Weight Estimation
Break the meal into specific nutritional components (e.g., 150g cooked pasta, 80g chicken breast, 1 tbsp olive oil). 

CRITICAL: For every component, you MUST estimate a specific weight in grams or volume (ml/tbsp). This is the absolute foundation of your final calculation. 

Use cuisine and preparation style to guide assumptions. Estimate cooking fats, oils, butter, cream, dressings, and sugar additions contextually. 

Increase fat/calorie estimates only when supported by restaurant preparation, fried methods, creamy sauces, or rich gravies. Focus strictly on the estimated component weights and caloric density of each identified ingredient rather than defaulting to generic meal averages.

Do NOT assume excessive hidden calories for:
- visibly lean meals
- grilled foods
- steamed foods
- lightly dressed foods
- minimally prepared meals
- simple homemade dishes unless context suggests otherwise

-----------------------------------
STEP 2: PORTION ANALYSIS
-----------------------------------

User-provided portion description:
${portionSize || "Not specified"}

Interpret natural-language portions realistically.

Examples may include:
- “small bowl”
- “large plate”
- “2 slices”
- “1 serving”
- “double protein”
- “half order”
- “few bites”
- “family size”
- “post workout meal”
- “1 dosa”
- “2 tacos”
- etc.

Estimate:
- approximate serving size
- ingredient quantity balance
- likely protein quantity
- starch/grain proportions
- sauce/dressing quantity
- overall caloric density

Use contextual reasoning instead of rigid portion multipliers.

-----------------------------------
STEP 3: PREPARATION TYPE ADJUSTMENTS
-----------------------------------

Preparation Type:
${cookType}

Apply these assumptions:

HOMEMADE:
- Assume realistic home cooking practices
- Include normal cooking fats/oils when appropriate
- Respect cuisine-specific preparation patterns
  - Indian -> possible ghee/oil usage
  - Italian -> olive oil/parmesan
  - Chinese -> stir-fry oil
  - etc.

RESTAURANT:
- Assume moderately higher calorie density than homemade equivalents
- Account for restaurant-style preparation methods when context supports it
- Include richer sauces/oils only when likely for the dish type

PACKAGED:
- Prioritize commercial nutritional consistency
- Use known packaged-food nutritional expectations when identifiable

-----------------------------------
STEP 4: COMPONENT-BASED BREAKDOWN (CALCULATION)
-----------------------------------

Before finalizing, perform a mental tally:
- Component A (e.g., Protein source): [Estimated Weight]g -> [Calories]
- Component B (e.g., Starch/Grain): [Estimated Weight]g -> [Calories]
- Component C (e.g., Fats/Sauces): [Estimated Weight]g/ml -> [Calories]

The final "calories" value MUST be the sum of these estimated components. 

-----------------------------------
STEP 5: MACRONUTRIENT ESTIMATION
-----------------------------------

Estimate:
- calories (Sum of components)
- protein
- carbohydrates
- fat
- fiber

Guidelines:
- Protein should align with realistic visible or described protein quantity
- Fat should reflect preparation style and ingredient composition
- Carbs should include grains, sugars, sauces, and starches
- Fiber should reflect vegetables, legumes, fruits, grains, seeds, etc.

Prioritize realistic balance over optimistic or pessimistic assumptions.

-----------------------------------
STEP 6: FINAL VALIDATION
-----------------------------------

Before returning:
- sanity check totals against portion size and dish type
- ensure macros align calorically:
  - protein × 4
  - carbs × 4
  - fat × 9

Ensure:
- portion size matches calorie estimate
- cuisine assumptions are internally consistent
- restaurant meals are not unrealistically low
- healthy meals are not unnecessarily inflated

-----------------------------------
OUTPUT FORMAT
-----------------------------------

Return ONLY valid JSON.

{
  "reasoning": "Brief component breakdown (e.g., 200g Rice: 260kcal, 100g Chicken: 165kcal...)",
  "calories": number,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "fiber_g": number,
  "descriptor": "2-4 word description",
  "analyzed_by": "ai"
}
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
      system: `
You are an expert nutritional estimation engine specializing in restaurant meals, packaged foods, homemade cooking, and multicultural cuisine analysis.

Your objective is to generate realistic, evidence-based nutritional estimates using:
- meal names
- ingredients
- cuisine type
- preparation style
- portion descriptions
- restaurant or brand context when identifiable

ESTIMATION PRINCIPLES:

1. COMPONENT-BASED REASONING (MANDATORY)
- Break the meal into estimated weights/volumes (e.g. 150g salmon, 200g salad, 1 tbsp oil).
- Calculate total calories as the SUM of these individual component estimates.
- AVOID "AVERAGING": Ensure the result reflects the specific volume and density of the components identified. Do not default to generic baseline averages unless the specific inputs lead there.

2. CONTEXTUAL CUISINE REASONING
- Use cuisine-specific preparation knowledge when estimating macros.
- Account for oils, butter, sauces, cream, dressings, and cooking fats only when contextually appropriate.
- Use restaurant-style preparation standards when context supports it.
- Do not automatically inflate calories or fats without evidence from:
  - cuisine type
  - preparation method
  - ingredient list
  - portion description
  - restaurant-style preparation

3. PORTION-AWARE ESTIMATION
- Interpret natural-language portions realistically:
  - "small bowl"
  - "large plate"
  - "double protein"
  - "half serving"
  - etc.
- Estimate serving size contextually instead of relying on rigid multipliers.

4. REALISTIC MACRO BALANCE
- Ensure macros align with calorie totals:
  - protein × 4
  - carbs × 4
  - fat × 9
- Avoid unrealistically low-fat or high-protein estimates unless clearly supported.

5. BEST-GUESS COMPLETION
- Always provide a reasonable estimate even when information is incomplete.
- Never return zero values unless logically impossible.

OUTPUT REQUIREMENTS:
- Return ONLY valid JSON
- No markdown
- No explanations
- No extra text

Required format:
{
  "reasoning": "Brief breakdown with weights and kcal",
  "calories": number,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "fiber_g": number,
  "descriptor": string,
  "analyzed_by": "ai"
}

The descriptor should be a concise 2-4 word food description.
    `.trim(),
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

exports.parseVoiceMeal = onCall(
  { secrets: [ANTHROPIC_API_KEY] },
  async (request) => {
    if (!request.auth?.uid) {
      throw new Error("Unauthorized: not authenticated");
    }
    await checkRateLimit(request.auth.uid, "parseVoiceMeal", 30, 60);
    const { transcript } = request.data;
    if (!transcript) return { error: "No transcript provided" };

    const systemInstruction = `
      You are an AI assistant that extracts meal logging information from spoken text.
      The user is dictating their meal. You must extract:
      1. 'name': A concise meal name.
      2. 'ingredients': A comma-separated list of mentioned ingredients or details.
      3. 'portion': The portion size (e.g., '1 medium bowl', '2 slices', 'Large').
      4. 'cookType': "Homemade", "Restaurant", or "Packaged" based on context. Default to "Homemade".
      5. 'type': The meal type: "Breakfast", "Lunch", "Dinner", or "Snack". Infer from keywords or use a best guess based on the food mentioned.
      
      Return ONLY a valid JSON object matching this structure. No preamble or markdown.
      Example Output: {"name": "Pesto Pasta", "ingredients": "Rigatoni, pesto sauce, bell peppers, broccoli", "portion": "1 medium bowl", "cookType": "Homemade", "type": "Lunch"}
    `;

    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150,
        system: systemInstruction,
        messages: [{ role: "user", content: `Parse this dictation: "${transcript}"` }],
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
            const result = JSON.parse(clean);
            // Log API usage
            await logApiUsage(request.auth.uid, "voice_parse", 0);
            resolve(result);
          } catch (e) {
            console.error("Failed to parse voice transcript:", e, data);
            resolve({ name: transcript, ingredients: "", portion: "", cookType: "Homemade" });
          }
        });
      });

      req.on("error", (e) => {
        console.error("Anthropic API error:", e);
        resolve({ name: transcript, ingredients: "", portion: "", cookType: "Homemade" });
      });

      req.write(body);
      req.end();
    });
  }
);

// Triggered when a new meal is created
exports.onMealCreated = onDocumentCreated(
  { document: "meals/{mealId}", secrets: [ANTHROPIC_API_KEY] },
  async (event) => {

    if (!event.data) {
      console.log("Meal data missing (likely deleted before function ran)");
      return;
    }
    const meal = event.data.data();
    if (!meal || !meal.uid) {
      console.log("Meal data or uid missing");
      return;
    }
    const uid = meal.uid;
    const mealId = event.params.mealId;
    const user = await getUser(uid);

    // Optimistic locking: check if analysis already in progress
    const mealRef = db.collection("meals").doc(mealId);
    const currentMeal = await mealRef.get();
    if (!currentMeal.exists) {
      console.log(`Meal ${mealId} no longer exists, skipping analysis`);
      return;
    }
    const currentData = currentMeal.data();
    if (currentData.analysisStatus === "analyzing" || currentData.analysisStatus === "completed") {
      console.log(`Meal ${mealId} already being analyzed or completed, skipping`);
      return;
    }
    
    // Mark as analyzing with transaction to prevent race conditions
    await runTransaction(db, async (transaction) => {
      const doc = await transaction.get(mealRef);
      if (!doc.exists || doc.data().analysisStatus === "analyzing" || doc.data().analysisStatus === "completed") {
        return; // Already being analyzed or completed
      }
      transaction.update(mealRef, { analysisStatus: "analyzing" });
    });

    // Skip task creation for meals completed from a task
    // (they have sourceMealId set)
    if (meal.sourceMealId) {
      try {
        if (meal.nutrition && meal.nutrition.calories > 0) {
          console.log(`Meal ${mealId} already has nutrition, skipping analysis.`);
          await mealRef.update({ analysisStatus: "completed" });
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
          await db.collection("meals").doc(mealId).update({
            nutrition,
            analysisStatus: "completed"
          });
          // Log API usage
          await logApiUsage(meal.uid, "meal_analysis", 0);
        } else {
          await db.collection("meals").doc(mealId).update({ analysisStatus: "failed" });
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
              originalMealId: mealId,
              lastUsed: new Date(),
            });
          } catch (favError) {
            console.error("Failed to save favorite for task meal:", favError);
          }
        }
      } catch (e) {
        console.error("Nutrition analysis failed for task meal:", e);
        await db.collection("meals").doc(mealId).update({ analysisStatus: "failed" });
      }
      return;
    }


    // Step 1: Run nutrition analysis and update the meal
    let finalNutrition = meal.nutrition || null;

    try {
      if (!finalNutrition || !finalNutrition.calories) {
        await db.collection("meals").doc(mealId).update({ analysisStatus: "analyzing" });

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
          await db.collection("meals").doc(mealId).update({
            nutrition: finalNutrition,
            analysisStatus: "completed"
          });
          console.log(`Nutrition saved for meal ${mealId}:`, finalNutrition);
        } else {
          await db.collection("meals").doc(mealId).update({ analysisStatus: "failed" });
        }
      } else {
        await db.collection("meals").doc(mealId).update({ analysisStatus: "completed" });
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
            originalMealId: mealId,
            lastUsed: new Date(),
          });
          console.log(`Favorite saved for meal ${mealId}`);
        } catch (favError) {
          console.error("Failed to save favorite from backend:", favError);
        }
      }
    } catch (e) {
      console.error("Nutrition analysis failed:", e);
      await db.collection("meals").doc(mealId).update({ analysisStatus: "failed" });
    }

    // Step 2: Partner notification + task creation
    try {
      if (user && user.partnerUid) {
        const partner = await getUser(user.partnerUid);
        if (partner) {
          // Create task if meal is shared (with transaction to prevent race conditions)
          if (meal.isShared) {
            try {
              const taskId = `${mealId}_${user.partnerUid}`;
              const taskRef = db.collection("tasks").doc(taskId);
              
              await runTransaction(db, async (transaction) => {
                const taskSnap = await transaction.get(taskRef);
                if (taskSnap.exists) {
                  console.log(`Task already exists for meal ${mealId}, skipping`);
                  return;
                }
                
                transaction.set(taskRef, {
                  sourceMealId: mealId,
                  fromUid: uid,
                  toUid: user.partnerUid,
                  mealName: meal.name || "",
                  mealType: meal.type || "Meal",
                  photos: meal.photos?.length > 0 ? meal.photos : meal.photoURL ? [meal.photoURL] : [],
                  fromIngredients: meal.ingredients || meal.quantity || "",
                  fromPortionSize: meal.portionSize || "",
                  fromNutrition: finalNutrition || null,
                  fromQuantity: "",
                  localDate: meal.localDate || "",
                  localTime: meal.localTime || "",
                  isRestaurant: meal.isRestaurant || false,
                  completed: false,
                  dismissed: false,
                  completedAt: null,
                  createdAt: new Date(),
                });
                console.log(`Task created for shared meal ${mealId}`);
              });
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
              body = `${firstName} just logged ${meal.type.toLowerCase()} 🍽️`;
            }
            await sendNotification(partner.fcmToken, "TableFor2", body);
          }
        }
      }
    } catch (e) {
      console.error("Partner task/notification failed:", e);
    }
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
    const body = `New badge unlocked: ${badgeName} 🏆`;
    await sendNotification(token, "TableFor2 🏆", body);
  }
});


// Callable function to manually retry analysis
exports.retryAnalysis = onCall({ secrets: [ANTHROPIC_API_KEY] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new functions.https.HttpsError("unauthenticated", "User must be logged in");

  await checkRateLimit(uid, "retryAnalysis", 10, 60);

  const mealId = request.data.mealId;
  if (!mealId) throw new functions.https.HttpsError("invalid-argument", "Missing mealId");

  const mealDoc = await db.collection("meals").doc(mealId).get();
  if (!mealDoc.exists) throw new functions.https.HttpsError("not-found", "Meal not found");

  const meal = mealDoc.data();
  if (meal.uid !== uid) {
    const userDoc = await db.collection("users").doc(meal.uid).get();
    if (!userDoc.exists || userDoc.data().partnerUid !== uid) {
      throw new functions.https.HttpsError("permission-denied", "Not authorized");
    }
  }

  await db.collection("meals").doc(mealId).update({ analysisStatus: "analyzing" });

  try {
    const user = await getUser(meal.uid);
    const primaryPhoto = (meal.photos?.length > 0) ? meal.photos[0] : meal.photoURL || null;

    let nutrition;
    if (meal.sourceMealId) {
      const srcDoc = await db.collection("meals").doc(meal.sourceMealId).get();
      if (srcDoc.exists && srcDoc.data().nutrition && srcDoc.data().nutrition.calories > 0) {
        nutrition = srcDoc.data().nutrition;
      }
    }

    if (!nutrition || !nutrition.calories) {
      nutrition = await analyzeMealNutrition(
        meal.name,
        primaryPhoto,
        user || null,
        meal.ingredients || meal.quantity || null,
        meal.portionSize || null,
        meal.cookType || (meal.isRestaurant ? "Restaurant" : "Homemade")
      );
    }

    if (nutrition && nutrition.calories > 0) {
      await db.collection("meals").doc(mealId).update({
        nutrition,
        analysisStatus: "completed"
      });
      return { success: true, nutrition };
    } else {
      await db.collection("meals").doc(mealId).update({ analysisStatus: "failed" });
      return { success: false, error: "Analysis returned no macros" };
    }
  } catch (err) {
    console.error("Retry analysis failed:", err);
    await db.collection("meals").doc(mealId).update({ analysisStatus: "failed" });
    throw new functions.https.HttpsError("internal", err.message);
  }
});

exports.onMealUpdated = onDocumentUpdated("meals/{mealId}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const mealId = event.params.mealId;

  const mealOwnerUid = after.uid;
  const mealOwner = await getUser(mealOwnerUid);
  if (!mealOwner) return;

  // 1. Check for isShared transition (false -> true) to create partner tasks
  if (!before.isShared && after.isShared && mealOwner.partnerUid) {
    try {
      const partner = await getUser(mealOwner.partnerUid);
      if (partner) {
        // Use deterministic ID to prevent duplicate tasks
        const taskId = `${mealId}_${mealOwner.partnerUid}`;
        const taskRef = db.collection("tasks").doc(taskId);
        const taskSnap = await taskRef.get();

        if (!taskSnap.exists) {
          await taskRef.set({
            sourceMealId: mealId,
            fromUid: mealOwnerUid,
            toUid: mealOwner.partnerUid,
            mealName: after.name || "",
            mealType: after.type || "Meal",
            photos: after.photos?.length > 0 ? after.photos : after.photoURL ? [after.photoURL] : [],
            fromIngredients: after.ingredients || after.quantity || "",
            fromPortionSize: after.portionSize || "",
            fromNutrition: after.nutrition || null,
            fromQuantity: "",
            localDate: after.localDate || "",
            localTime: after.localTime || "",
            isRestaurant: after.isRestaurant || false,
            completed: false,
            dismissed: false,
            completedAt: null,
            createdAt: new Date(),
          });
          console.log(`Task created for edited meal ${mealId} via sharing transition`);

          // Send notification to partner about the new shared meal
          if (partner.fcmToken && partner.notifSettings?.partnerMeal !== false) {
            const firstName = mealOwner.name ? mealOwner.name.split(" ")[0] : "Your partner";
            const body = `${firstName} shared a ${after.type.toLowerCase()} with you 🍽️ — add your quantities!`;
            await sendNotification(partner.fcmToken, "TableFor2", body);
          }
        }
      }
    } catch (err) {
      console.error("Failed to create task during isShared transition:", err);
    }
  }

  // 3. Check for isShared transition (true -> false) to remove incomplete partner tasks
  if (before.isShared && !after.isShared && mealOwner.partnerUid) {
    try {
      const taskId = `${mealId}_${mealOwner.partnerUid}`;
      const taskRef = db.collection("tasks").doc(taskId);
      const taskSnap = await taskRef.get();
      if (taskSnap.exists && !taskSnap.data().completed) {
        await taskRef.delete();
        console.log(`Incomplete task deleted for meal ${mealId} because sharing was disabled`);
      }
    } catch (err) {
      console.error("Failed to delete tasks during isShared disabled transition:", err);
    }
  }

  // 2. Check for reactions/comments notifications
  if (mealOwner.fcmToken && mealOwner.notifSettings?.partnerMeal !== false) {
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

    if (newReactionEntry || newCommentEntry) {
      // Get reactor/commenter name
      const actorUid = newReactionEntry?.[0] || newCommentEntry?.[0];
      const actor = await getUser(actorUid);
      const actorName = actor?.name ? actor.name.split(" ")[0] : "Your partner";

      if (newReactionEntry) {
        const body = `${actorName} reacted ${newReactionEntry[1]} to your ${after.type.toLowerCase()} 🍽️`;
        await sendNotification(mealOwner.fcmToken, "TableFor2", body);
      }
      if (newCommentEntry) {
        const body = `${actorName} left a comment on your ${after.type.toLowerCase()} 💬`;
        await sendNotification(mealOwner.fcmToken, "TableFor2", body);
      }
    }
  }
});


async function hasLoggedToday(uid, mealType) {
  try {
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
  } catch (e) {
    console.error(`hasLoggedToday failed for ${uid} ${mealType}, failing closed (skipping notification):`, e);
    return true;
  }
}

// Runs every 15 mins to check each user's local time accurately across all offsets
exports.breakfastReminder = onSchedule("*/15 * * * *", async () => {
  await sendMealReminder("Breakfast", 10, 30, [
    "Log your breakfast to start the day right",
  ]);
});

exports.lunchReminder = onSchedule("*/15 * * * *", async () => {
  await sendMealReminder("Lunch", 13, 30, [
    "Lunch time! 🥪 Log your meal",
  ]);
});

exports.dinnerReminder = onSchedule("*/15 * * * *", async () => {
  await sendMealReminder("Dinner", 20, 30, [
    "Dinner time! 🍽️ Log your dinner",
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
    await sendNotification(user.fcmToken, "TableFor2 ⏰", body);
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

      // Security check — only authenticated users who own the meal can reanalyze
      if (!request.auth?.uid) {
        throw new Error("Unauthorized: not authenticated");
      }
      if (request.auth.uid !== meal.uid) {
        const userDoc = await db.collection("users").doc(meal.uid).get();
        if (!userDoc.exists || userDoc.data().partnerUid !== request.auth.uid) {
          throw new Error("Unauthorized: not meal owner or partner");
        }
      }

      await checkRateLimit(request.auth.uid, "reanalyzeMeal", 20, 60);

      await db.collection("meals").doc(mealId).update({ analysisStatus: "analyzing" });

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
        await db.collection("meals").doc(mealId).update({
          nutrition,
          analysisStatus: "completed"
        });

        // Sync to frequent meals if it was originally saved from this log
        try {
          const freqSnap = await db.collection("frequentMeals")
            .where("originalMealId", "==", mealId)
            .get();
          if (!freqSnap.empty) {
            const batch = db.batch();
            freqSnap.docs.forEach(doc => {
              batch.update(doc.ref, {
                nutrition,
                name: meal.name,
                ingredients: meal.ingredients || "",
                portionSize: meal.portionSize || ""
              });
            });
            await batch.commit();
          }
        } catch (fError) {
          console.error("Failed to sync reanalyzed nutrition to favorites:", fError);
        }

        console.log(`Reanalyzed meal ${mealId}:`, nutrition);
        return { success: true, nutrition };
      } else {
        // Keep existing nutrition and revert status if reanalysis fails
        console.log(`Reanalysis returned invalid data for ${mealId}, keeping existing`);
        await db.collection("meals").doc(mealId).update({
          analysisStatus: existingNutrition ? "completed" : "failed"
        });
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
      if (!request.auth?.uid) {
        throw new Error("Unauthorized: not authenticated");
      }
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
      if (request.auth.uid !== uid) {
        throw new Error("Unauthorized: cannot generate insight for another user");
      }

      await checkRateLimit(uid, "generateWeightInsight", 5, 60);
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
          temperature: 0.4,
          system: `
You are a thoughtful nutrition coach analyzing real user nutrition and weight-trend data.

Your role is to generate concise, behavior-focused biweekly insights that feel specific, practical, and motivating.

FOCUS AREAS:
- weight trends
- calorie consistency
- macro balance
- meal habits
- tracking consistency
- realistic behavior patterns

WRITING STYLE:
- supportive and direct
- concise but insightful
- conversational, not clinical
- encouraging without sounding overly motivational
- observational rather than judgmental

OUTPUT RULES:
- Write 4-5 bullet points
- Each bullet must begin with a relevant emoji
- Keep each bullet concise
- Most bullets should reference specific numbers, trends, or eating patterns from the data
- Include realistic, achievable suggestions when appropriate
- Avoid repeating the same recommendation
- No intro paragraph
- No closing paragraph
- No markdown formatting beyond bullets

IMPORTANT:
- Prioritize meaningful observations over generic advice
- Reinforce positive patterns when visible
- Keep recommendations small and realistic
- Never shame or criticize the user
- Never mention doctors, nutritionists, or medical disclaimers
- Avoid vague advice like "eat healthier" or "do better"
- Make the response feel like a smart coach genuinely reviewed the user's real habits
    `.trim(),
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

// Generate a Claude-powered weekly reflection based on meal category data
exports.generateWeeklyReflection = onCall(
  { secrets: [ANTHROPIC_API_KEY] },
  async (request) => {
    try {
      if (!request.auth?.uid) {
        throw new Error("Unauthorized: not authenticated");
      }
      const { categoryCounts, topCategories, totalMeals } = request.data;
      if (!categoryCounts || !topCategories) throw new Error("Missing required fields");

      await checkRateLimit(request.auth.uid, "generateWeeklyReflection", 5, 60);

      const topCats = topCategories.map((t) => `${t.emoji || ""} ${t.label} (${t.count} meals)`).join(", ");

      const prompt = `The user logged ${totalMeals} meals this week.

Their meal category counts: ${Object.entries(categoryCounts).filter(([, c]) => c > 0).map(([id, count]) => `${id}: ${count}`).join(", ")}

Their top meal styles this week: ${topCats}

Write exactly 1-2 sentences of warm, encouraging reflection about their eating patterns this week.

Rules:
- Mention their dominant behaviors using category names
- Be warm and encouraging 
- Do NOT use percentages or numbers
- Do NOT mention calories, weight, or dieting
- Do NOT shame or criticize
- Do NOT give generic advice like "eat more vegetables"
- Do NOT mention doctors or nutritionists
- Keep it concise and personal
- Write like a thoughtful friend, not a clinician`;

      const reflection = await new Promise((resolve, reject) => {
        const body = JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 200,
          temperature: 0.6,
          system: "You write warm, concise, human reflections about eating patterns. You focus on behaviors, not numbers. You never use clinical language or percentages. You write like a thoughtful friend who notices patterns.",
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

      return { success: true, reflection };
    } catch (e) {
      console.error("Weekly reflection error:", e);
      return { success: false, reflection: null };
    }
  }
);

// Notify partner of incoming link request
exports.sendPartnerRequestNotification = onCall(async (request) => {
  try {
    if (!request.auth?.uid) {
      throw new Error("Unauthorized: not authenticated");
    }
    
    // Rate limit: 3 requests per hour per user
    await checkRateLimit(request.auth.uid, "sendPartnerRequestNotification", 3, 60);
    
    const { toUid, fromName } = request.data;
    if (!toUid || !fromName) return;

    // Validate that the target user exists
    const partner = await getUser(toUid);
    if (!partner?.fcmToken) return;

    // Validate that the caller's name matches what we have in the database
    const caller = await getUser(request.auth.uid);
    if (!caller || caller.name !== fromName) {
      console.error("sendPartnerRequestNotification: Caller name mismatch");
      return;
    }

    await sendNotification(
      partner.fcmToken,
      "TableFor2",
      `${fromName} wants to link accounts with you — check your Profile!`
    );
  } catch (e) {
    console.error("sendPartnerRequestNotification error:", e);
  }
});

// Notify requester that partner accepted
exports.sendPartnerAcceptedNotification = onCall(async (request) => {
  try {
    if (!request.auth?.uid) {
      throw new Error("Unauthorized: not authenticated");
    }
    
    // Rate limit: 3 requests per hour per user
    await checkRateLimit(request.auth.uid, "sendPartnerAcceptedNotification", 3, 60);
    
    const { toUid, fromName } = request.data;
    if (!toUid || !fromName) return;

    // Validate that the target user exists and has a pending request from the caller
    const partner = await getUser(toUid);
    if (!partner?.fcmToken) return;
    
    // Validate that the caller's name matches what we have in the database
    const caller = await getUser(request.auth.uid);
    if (!caller || caller.name !== fromName) {
      console.error("sendPartnerAcceptedNotification: Caller name mismatch");
      return;
    }

    // Validate that the target user has a pending request from the caller
    const targetUser = await getUser(toUid);
    if (!targetUser?.partnerRequest?.fromUid || targetUser.partnerRequest.fromUid !== request.auth.uid) {
      console.error("sendPartnerAcceptedNotification: No matching pending request found");
      return;
    }

    await sendNotification(
      partner.fcmToken,
      "TableFor2",
      `${fromName} accepted your partner request! You're now linked.`
    );
  } catch (e) {
    console.error("sendPartnerAcceptedNotification error:", e);
  }
});

// Secure email lookup for partner linking (bypasses Firestore rules)
exports.lookupPartnerByEmail = onCall(async (request) => {
  try {
    if (!request.auth?.uid) {
      throw new Error("Unauthorized: not authenticated");
    }

    // Rate limit: 10 lookups per hour per user
    await checkRateLimit(request.auth.uid, "lookupPartnerByEmail", 10, 60);

    const { email } = request.data;
    if (!email || typeof email !== 'string') {
      return { found: false, error: "Invalid email" };
    }

    // Sanitize email
    const sanitizedEmail = email.trim().toLowerCase();

    // Query users collection using admin SDK (bypasses security rules)
    const usersRef = db.collection('users');
    const q = usersRef.where('email', '==', sanitizedEmail);
    const snapshot = await q.get();

    if (snapshot.empty) {
      return { found: false, error: "No account found with that email" };
    }

    // Get the first matching user (there should only be one)
    const userDoc = snapshot.docs[0];
    const userData = userDoc.data();

    // Don't allow linking to yourself
    if (userDoc.id === request.auth.uid) {
      return { found: false, error: "You cannot link to your own account" };
    }

    // Don't allow linking if either user already has a partner
    const currentUser = await getUser(request.auth.uid);
    if (currentUser?.partnerUid) {
      return { found: false, error: "You already have a linked partner" };
    }
    if (userData.partnerUid) {
      return { found: false, error: "This user already has a linked partner" };
    }

    // Return safe user data (no sensitive fields)
    return {
      found: true,
      uid: userDoc.id,
      name: userData.name || "Partner",
      email: userData.email,
      photoURL: userData.photoURL || null,
    };
  } catch (e) {
    console.error("lookupPartnerByEmail error:", e);
    return { found: false, error: "Lookup failed. Please try again." };
  }
});

// Clean up orphaned tasks when a meal is deleted
exports.onMealDeleted = onDocumentDeleted(
  { document: "meals/{mealId}" },
  async (event) => {
    const mealId = event.params.mealId;
    
    try {
      // Find and delete tasks associated with this meal
      const tasksRef = db.collection("tasks");
      const q = tasksRef.where("sourceMealId", "==", mealId);
      const snapshot = await q.get();
      
      if (!snapshot.empty) {
        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        console.log(`Cleaned up ${snapshot.size} orphaned tasks for meal ${mealId}`);
      }
    } catch (e) {
      console.error(`Failed to clean up tasks for meal ${mealId}:`, e);
    }
  }
);