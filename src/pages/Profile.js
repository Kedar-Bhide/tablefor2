import React, { useEffect, useState } from "react";
import { auth, db, storage } from "../firebase";
import { signOut } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { compressImage } from "../utils/compressImage";
import { calculateBadges } from "../utils/calculateBadges";
import { calculateWallet } from "../utils/calculateWallet";
import { getFunctions, httpsCallable } from "firebase/functions";

function Profile() {
  const user = auth.currentUser;
  const [photoURL, setPhotoURL] = useState(user.photoURL);

  const handleProfilePhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const compressed = await compressImage(file);
    const photoRef = ref(storage, `profiles/${user.uid}`);
    await uploadBytes(photoRef, compressed);
    const url = await getDownloadURL(photoRef);
    await updateDoc(doc(db, "users", user.uid), { photoURL: url });
    setPhotoURL(url);
  };

  const [partnerEmail, setPartnerEmail] = useState("");
  const [partnerName, setPartnerName] = useState(null);
  const [partnerUid, setPartnerUid] = useState(null);
  const [saving, setSaving] = useState(false);
  const [badges, setBadges] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [notifSettings, setNotifSettings] = useState({
    partnerMeal: true,
    badgeEarned: true,
    mealReminder: true,
  });
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [walletFlipped, setWalletFlipped] = useState(false);
  const [message, setMessage] = useState("");
  const [profileFields, setProfileFields] = useState({
    age: "",
    gender: "",
    height_cm: "",
    weight_kg: "",
    target_weight_kg: "",
  });
  const [editingField, setEditingField] = useState(null);
  const [fieldDraft, setFieldDraft] = useState("");
  const [weightFlipped, setWeightFlipped] = useState(false);
  const [pendingRequest, setPendingRequest] = useState(null);
  const [incomingRequest, setIncomingRequest] = useState(null);
  const [requestSent, setRequestSent] = useState(false);
  const [showInviteLink, setShowInviteLink] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      const userRef2 = doc(db, "users", user.uid);
      const userSnap2 = await getDoc(userRef2);
      const fetchedPartnerUid = userSnap2.exists() ? userSnap2.data().partnerUid : null;
      setPartnerUid(fetchedPartnerUid);
      const earnedBadges = await calculateBadges(user.uid, partnerUid);
      setBadges(earnedBadges);  
      const walletData = await calculateWallet(user.uid);
      setWallet(walletData);
      if (userSnap2.exists() && userSnap2.data().notifSettings) {
        setNotifSettings(userSnap2.data().notifSettings);
      }
      if (userSnap2.exists()) {
        const d = userSnap2.data();
        setProfileFields({
          age: d.age || "",
          gender: d.gender || "",
          height_cm: d.height_cm || "",
          weight_kg: d.weight_kg || "",
          target_weight_kg: d.target_weight_kg || "",
        });
      }
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const data = userSnap.data();
        if (data.partnerEmail) setPartnerEmail(data.partnerEmail);
        if (data.partnerUid) {
          const partnerRef = doc(db, "users", data.partnerUid);
          const partnerSnap = await getDoc(partnerRef);
          if (partnerSnap.exists()) {
            setPartnerName(partnerSnap.data().name);
          }
        }
        // Check for incoming partner request
        if (data.partnerRequest) {
          setIncomingRequest(data.partnerRequest);
        }
        // Check for pending outgoing request
        if (data.pendingPartnerRequest) {
          setPendingRequest(data.pendingPartnerRequest);
          setRequestSent(true);
        }
      }
    };
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleLinkPartner = async () => {
    if (!partnerEmail) return;
    setSaving(true);
    setMessage("");

    try {
      // Find partner by email
      const q = query(collection(db, "users"), where("email", "==", partnerEmail));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setMessage("❌ No account found with that email");
        setShowInviteLink(true);
        setSaving(false);
        return;
      }

      const partnerDoc = snapshot.docs[0];
      const partnerData = partnerDoc.data();
      const partnerDocUid = partnerDoc.id;

      // Can't link to yourself
      if (partnerDocUid === user.uid) {
        setMessage("❌ You can't link with yourself!");
        setSaving(false);
        return;
      }

      // Already linked
      if (partnerData.partnerUid) {
        setMessage("❌ This person is already linked with someone else.");
        setSaving(false);
        return;
      }

      // Already sent a request
      if (requestSent) {
        setMessage("⏳ Request already sent — waiting for them to accept.");
        setSaving(false);
        return;
      }

      // Save request to partner's document
      await updateDoc(doc(db, "users", partnerDocUid), {
        partnerRequest: {
          fromUid: user.uid,
          fromName: user.displayName || "Someone",
          fromEmail: user.email,
          sentAt: new Date().toISOString(),
        },
      });

      // Save pending request on own document
      await updateDoc(doc(db, "users", user.uid), {
        pendingPartnerRequest: {
          toUid: partnerDocUid,
          toEmail: partnerEmail,
          sentAt: new Date().toISOString(),
        },
      });
      // Notify partner of incoming request
      try {
        const functions = getFunctions();
        const notifyFn = httpsCallable(functions, "sendPartnerRequestNotification");
        await notifyFn({
          toUid: partnerDocUid,
          fromName: user.displayName || "Someone",
        });
      } catch (e) {
        console.error("Notification failed:", e);
      }
      setRequestSent(true);
      setPendingRequest({ toUid: partnerDocUid, toEmail: partnerEmail });
      setMessage("✅ Request sent! Waiting for them to accept.");
    } catch (e) {
      console.error("Link partner error:", e);
      setMessage("❌ Something went wrong. Please try again.");
    }
    setSaving(false);
  };

  const handleAcceptRequest = async () => {
    if (!incomingRequest) return;
    setSaving(true);
    try {
      const fromUid = incomingRequest.fromUid;

      // Link both accounts
      await updateDoc(doc(db, "users", user.uid), {
        partnerUid: fromUid,
        partnerEmail: incomingRequest.fromEmail,
        partnerRequest: null,
      });
      await updateDoc(doc(db, "users", fromUid), {
        partnerUid: user.uid,
        partnerEmail: user.email,
        pendingPartnerRequest: null,
      });

      // Notify requester that request was accepted
      try {
        const functions = getFunctions();
        const notifyFn = httpsCallable(functions, "sendPartnerAcceptedNotification");
        await notifyFn({
          toUid: fromUid,
          fromName: user.displayName || "Your partner",
        });
      } catch (e) {
        console.error("Notification failed:", e);
      }

      setIncomingRequest(null);
      setPartnerName(incomingRequest.fromName);
      setPartnerUid(fromUid);
      setMessage("🎉 You're now linked with " + incomingRequest.fromName + "!");
    } catch (e) {
      console.error("Accept request error:", e);
      setMessage("❌ Something went wrong. Please try again.");
    }
    setSaving(false);
  };

  const handleDeclineRequest = async () => {
    if (!incomingRequest) return;
    try {
      // Remove request from own document
      await updateDoc(doc(db, "users", user.uid), {
        partnerRequest: null,
      });
      // Remove pending from requester's document
      await updateDoc(doc(db, "users", incomingRequest.fromUid), {
        pendingPartnerRequest: null,
      });
      setIncomingRequest(null);
      setMessage("Request declined.");
    } catch (e) {
      console.error("Decline request error:", e);
    }
  };

  const handleSignOut = () => {
    signOut(auth);
  };

  const handleWalletReset = async () => {
    const userRef = doc(db, "users", user.uid);
    await updateDoc(userRef, { walletResetAt: new Date() });
    const walletData = await calculateWallet(user.uid);
    setWallet(walletData);
    setShowResetConfirm(false);
  };

  const handleNotifToggle = async (key) => {
    const updated = { ...notifSettings, [key]: !notifSettings[key] };
    setNotifSettings(updated);
    await updateDoc(doc(db, "users", user.uid), {
      notifSettings: updated,
    });
  };
  
  const handleFieldSave = async (key) => {
    const value = fieldDraft.trim();
    const updated = { ...profileFields, [key]: value };
    setProfileFields(updated);
    await updateDoc(doc(db, "users", user.uid), { [key]: value });
    setEditingField(null);
    setFieldDraft("");
  };

  const profileComplete = profileFields.age && 
    profileFields.gender && 
    profileFields.height_cm && 
    profileFields.weight_kg;

  const handleCopyLink = () => {
    navigator.clipboard.writeText("https://meals-a2f8e.web.app/");
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  return (
    <div style={styles.container}>
      {/* Profile completion banner */}
      {!profileComplete && (
        <div style={styles.completionBanner}>
          <p style={styles.completionBannerTitle}>Complete your profile ✨</p>
          <p style={styles.completionBannerSub}>
            Add your age, height and weight below for personalized nutrition insights
          </p>
        </div>
      )}
      <h2 style={styles.title}>My Profile</h2>

      <div style={styles.card}>
        <div style={styles.avatarWrapper}>
          <img src={photoURL} alt="avatar" style={styles.avatar} referrerPolicy="no-referrer" />
          <div style={styles.editBadge} onClick={() => document.getElementById("profilePhotoInput").click()}>
            ✏️
          </div>
        </div>
        <input id="profilePhotoInput" type="file" accept="image/*" style={{ display: "none" }} onChange={handleProfilePhoto} />
        <p style={styles.name}>{user.displayName}</p>
        <p style={styles.email}>{user.email}</p>
      </div>
      <div style={styles.card}>
        {partnerName ? (
          <div style={{ textAlign: "center" }}>
            <p style={styles.linkedLabel}>💑 Linked with</p>
            <p style={styles.linkedName}>{partnerName}</p>
          </div>
        ) : (
          <>
            {/* Incoming partner request */}
            {incomingRequest && (
              <div style={styles.incomingRequestCard}>
                <p style={styles.incomingRequestTitle}>💑 Partner Request</p>
                <p style={styles.incomingRequestText}>
                  <strong>{incomingRequest.fromName}</strong> wants to link accounts with you
                </p>
                <div style={styles.incomingRequestButtons}>
                  <button
                    style={styles.acceptButton}
                    onClick={handleAcceptRequest}
                    disabled={saving}
                  >
                    ✓ Accept
                  </button>
                  <button
                    style={styles.declineButton}
                    onClick={handleDeclineRequest}
                  >
                    ✕ Decline
                  </button>
                </div>
              </div>
            )}

            {/* Pending outgoing request */}
            {requestSent && pendingRequest && !partnerName && (
              <div style={styles.pendingRequestCard}>
                <p style={styles.pendingRequestText}>
                  ⏳ Request sent to <strong>{pendingRequest.toEmail}</strong>
                </p>
                <p style={styles.pendingRequestSub}>
                  Waiting for them to accept in their Profile page
                </p>
              </div>
            )}

            <label style={styles.label}>Link Partner Account</label>
            <input
              type="email"
              placeholder="Enter your partner's email"
              value={partnerEmail}
              onChange={(e) => setPartnerEmail(e.target.value)}
              style={styles.input}
            />
            <button style={styles.button} onClick={handleLinkPartner}>
              {saving ? "Sending..." : "Send Request 💑"}
            </button>
            {message ? <p style={styles.message}>{message}</p> : null}
            {showInviteLink && (
              <div style={styles.inviteLinkCard}>
                <p style={styles.inviteLinkText}>
                  Share the link to sign up today and link with you!
                </p>
                <div style={styles.inviteLinkRow}>
                  <p style={styles.inviteLinkUrl}>ççmeals-a2f8e.web.app</p>
                  <button
                    style={styles.copyLinkButton}
                    onClick={handleCopyLink}
                  >
                    {linkCopied ? "Copied! ✓" : "Copy"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {/* Wallet Card */}
      <div style={styles.walletFlipContainer}>
        <div style={{
          ...styles.walletFlipInner,
          transform: walletFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}>

          {/* Front */}
          <div style={styles.walletFront} onClick={() => setWalletFlipped(true)}>
            <div style={styles.walletHeader}>
              <p style={styles.badgeTitle}>💰 My Wallet</p>
              {wallet?.resetAt && (
                <p style={styles.walletReset}>
                  Since {wallet.resetAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
              )}
            </div>

            <div style={styles.walletBalance}>
              <p style={styles.walletAmount}>${wallet ? wallet.total.toFixed(2) : "0.00"}</p>
              <p style={styles.walletSub}>earned from meals</p>
            </div>

            <div style={styles.walletBreakdown}>
              <div style={styles.walletItem}>
                <p style={styles.walletItemEmoji}>🟢</p>
                <p style={styles.walletItemCount}>{wallet?.fullCount ?? 0}</p>
                <p style={styles.walletItemLabel}>$2 meals</p>
              </div>
              <div style={styles.walletDivider} />
              <div style={styles.walletItem}>
                <p style={styles.walletItemEmoji}>🟡</p>
                <p style={styles.walletItemCount}>{wallet?.halfCount ?? 0}</p>
                <p style={styles.walletItemLabel}>$1 meals</p>
              </div>
              <div style={styles.walletDivider} />
              <div style={styles.walletItem}>
                <p style={styles.walletItemEmoji}>🔴</p>
                <p style={styles.walletItemCount}>{wallet?.quarterCount ?? 0}</p>
                <p style={styles.walletItemLabel}>$0.50 meals</p>
              </div>
            </div>

            {!showResetConfirm ? (
              <button style={styles.resetButton} onClick={(e) => { e.stopPropagation(); setShowResetConfirm(true); }}>
                Reset Wallet
              </button>
            ) : (
              <div style={styles.confirmRow} onClick={(e) => e.stopPropagation()}>
                <p style={styles.confirmText}>Are you sure? This can't be undone.</p>
                <div style={styles.confirmButtons}>
                  <button style={styles.confirmYes} onClick={handleWalletReset}>Yes, Reset</button>
                  <button style={styles.confirmNo} onClick={() => setShowResetConfirm(false)}>Cancel</button>
                </div>
              </div>
            )}

            <p style={styles.flipHint}>Tap to see how rewards work</p>
          </div>

          {/* Back */}
          <div style={styles.walletBack} onClick={() => setWalletFlipped(false)}>
            <p style={styles.backTitle}>💰 How Rewards Work</p>

            <div style={{ ...styles.ruleCard, backgroundColor: "#f0fff4" }}>
              <div style={styles.ruleLeft}>
                <p style={{ ...styles.ruleAmount, color: "#4caf50" }}>$2</p>
                <p style={styles.ruleTag}>On time</p>
              </div>
              <div style={styles.ruleRight}>
                <p style={styles.ruleDesc}>Log before the cutoff</p>
                <div style={styles.ruleTimes}>
                  <span style={styles.ruleTime}>🌅 Breakfast before 11am</span>
                  <span style={styles.ruleTime}>☀️ Lunch before 2pm</span>
                  <span style={styles.ruleTime}>🌙 Dinner before 9pm</span>
                </div>
              </div>
            </div>

            <div style={{ ...styles.ruleCard, backgroundColor: "#fffbf0" }}>
              <div style={styles.ruleLeft}>
                <p style={{ ...styles.ruleAmount, color: "#ffb347" }}>$1</p>
                <p style={styles.ruleTag}>A little late</p>
              </div>
              <div style={styles.ruleRight}>
                <p style={styles.ruleDesc}>Within 1hr after cutoff</p>
                <div style={styles.ruleTimes}>
                  <span style={styles.ruleTime}>🌅 Before 12pm</span>
                  <span style={styles.ruleTime}>☀️ Before 3pm</span>
                  <span style={styles.ruleTime}>🌙 Before 10pm</span>
                </div>
              </div>
            </div>

            <div style={{ ...styles.ruleCard, backgroundColor: "#fff5f5" }}>
              <div style={styles.ruleLeft}>
                <p style={{ ...styles.ruleAmount, color: "#ff6b6b" }}>$0.50</p>
                <p style={styles.ruleTag}>Late</p>
              </div>
              <div style={styles.ruleRight}>
                <p style={styles.ruleDesc}>Better late than never!</p>
                <div style={styles.ruleTimes}>
                  <span style={styles.ruleTime}>Any meal after +1hr</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
      <div style={styles.card}>
        <p style={styles.badgeTitle}>My Badges</p>
        <div style={styles.badgeGrid}>
          {badges
          .filter((badge) => {
            if (!partnerUid && ["in_sync", "sharing_is_caring"].includes(badge.id)) return false;
            return true;
          })
          .map((badge) => (
          <div key={badge.id} style={{
                ...styles.badgeItem,
                opacity: badge.earned ? 1 : 0.3,
              }}
            >
              <div style={{
                ...styles.badgeEmoji,
                backgroundColor: badge.earned ? "#fff5f5" : "#f5f5f5",
                border: badge.earned ? "2px solid #ffcccc" : "2px solid transparent",
              }}>
                {badge.emoji}
              </div>
              <p style={styles.badgeName}>{badge.name}</p>
              <p style={styles.badgeDesc}>{badge.description}</p>
            </div>
          ))}
        </div>
      </div>
      {/* Personal Stats */}
      <div style={styles.card}>
        <p style={styles.badgeTitle}>📋 Personal Info</p>
        <p style={styles.personalInfoSubtitle}>
          Used to personalize your nutrition insights. All optional.
        </p>
        <div style={styles.personalInfoGrid}>
        {[
          { key: "age", label: "Age", placeholder: "e.g. 26", suffix: "yrs" },
          { key: "gender", label: "Gender", placeholder: "e.g. Male, Female", suffix: "" },
          { key: "height_cm", label: "Height", placeholder: "e.g. 178", suffix: "cm" },
        ].map((field) => (
          <div key={field.key} style={styles.personalInfoRow}>
            <p style={styles.personalInfoLabel}>{field.label}</p>
            {editingField === field.key ? (
              <div style={styles.personalInfoEditRow}>
                <input
                  type={field.key === "gender" ? "text" : "number"}
                  value={fieldDraft}
                  placeholder={field.placeholder}
                  onChange={(e) => setFieldDraft(e.target.value)}
                  style={styles.personalInfoInput}
                  className="comment-input"
                  autoFocus
                />
                <button
                  style={styles.personalInfoSave}
                  onClick={() => handleFieldSave(field.key)}
                >
                  ✓
                </button>
                <button
                  style={styles.personalInfoCancel}
                  onClick={() => {
                    setEditingField(null);
                    setFieldDraft("");
                  }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <div style={styles.personalInfoValueRow}>
                <p style={styles.personalInfoValue}>
                  {profileFields[field.key]
                    ? `${profileFields[field.key]}${field.suffix ? " " + field.suffix : ""}`
                    : <span style={styles.personalInfoEmpty}>Add</span>}
                </p>
                <button
                  style={styles.personalInfoEdit}
                  onClick={() => {
                    setEditingField(field.key);
                    setFieldDraft(profileFields[field.key] || "");
                  }}
                >
                  edit
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Weight flip card */}
        <div
          style={styles.weightFlipContainer}
          onClick={() => setWeightFlipped(!weightFlipped)}
        >
          <div style={{
            ...styles.weightFlipInner,
            transform: weightFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}>
            {/* Front — current weight */}
            <div style={styles.weightFlipFront}>
              <p style={styles.personalInfoLabel}>Weight</p>
              {editingField === "weight_kg" ? (
                <div style={styles.personalInfoEditRow}>
                  <input
                    type="number"
                    value={fieldDraft}
                    placeholder="e.g. 77"
                    onChange={(e) => setFieldDraft(e.target.value)}
                    style={styles.personalInfoInput}
                    className="comment-input"
                    autoFocus
                  />
                  <button
                    style={styles.personalInfoSave}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFieldSave("weight_kg");
                    }}
                  >
                    ✓
                  </button>
                  <button
                    style={styles.personalInfoCancel}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingField(null);
                      setFieldDraft("");
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div style={styles.personalInfoValueRow}>
                  <p style={styles.personalInfoValue}>
                    {profileFields.weight_kg
                      ? `${profileFields.weight_kg} kg`
                      : <span style={styles.personalInfoEmpty}>Add</span>}
                  </p>
                  <button
                    style={styles.personalInfoEdit}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingField("weight_kg");
                      setFieldDraft(profileFields.weight_kg || "");
                    }}
                  >
                    edit
                  </button>
                </div>
              )}
            </div>

            {/* Back — target weight */}
            <div style={styles.weightFlipBack}>
              <p style={styles.personalInfoLabel}>Target</p>
              {editingField === "target_weight_kg" ? (
                <div style={styles.personalInfoEditRow}>
                  <input
                    type="number"
                    value={fieldDraft}
                    placeholder="e.g. 72"
                    onChange={(e) => setFieldDraft(e.target.value)}
                    style={styles.personalInfoInput}
                    className="comment-input"
                    autoFocus
                  />
                  <button
                    style={styles.personalInfoSave}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFieldSave("target_weight_kg");
                    }}
                  >
                    ✓
                  </button>
                  <button
                    style={styles.personalInfoCancel}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingField(null);
                      setFieldDraft("");
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div style={styles.personalInfoValueRow}>
                  <p style={styles.personalInfoValue}>
                    {profileFields.target_weight_kg
                      ? `${profileFields.target_weight_kg} kg`
                      : <span style={styles.personalInfoEmpty}>Add</span>}
                  </p>
                  <button
                    style={styles.personalInfoEdit}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingField("target_weight_kg");
                      setFieldDraft(profileFields.target_weight_kg || "");
                    }}
                  >
                    edit
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        </div>
      </div>
      {/* Notification Settings */}
      <div style={styles.card}>
        <p style={styles.badgeTitle}>🔔 Notifications</p>
        {[
          ...(partnerUid ? [{ key: "partnerMeal", label: "Partner logged a meal", emoji: "🍽️" }] : []),
          { key: "badgeEarned", label: "Badge earned", emoji: "🏆" },
          { key: "mealReminder", label: "Meal reminders", emoji: "⏰" },
        ].map((item) => (
          <div key={item.key} style={styles.notifRow}>
            <div style={styles.notifLeft}>
              <span style={styles.notifEmoji}>{item.emoji}</span>
              <p style={styles.notifLabel}>{item.label}</p>
            </div>
            <div
              style={{
                ...styles.toggleTrack,
                backgroundColor: notifSettings[item.key] ? "#ff6b6b" : "#e0e0e0",
              }}
              onClick={() => handleNotifToggle(item.key)}
            >
              <div
                style={{
                  ...styles.toggleThumb,
                  transform: notifSettings[item.key]
                    ? "translateX(22px)"
                    : "translateX(2px)",
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <button style={styles.signOutButton} onClick={handleSignOut}>
        Sign Out
      </button>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: "400px",
    margin: "0 auto",
    padding: "2rem",
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
    padding: "1.5rem",
    marginBottom: "1rem",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  avatar: {
    width: "72px",
    height: "72px",
    borderRadius: "50%",
    marginBottom: "0.5rem",
  },
  name: {
    fontWeight: "bold",
    fontSize: "1.1rem",
    color: "#333",
  },
  email: {
    color: "#888",
    fontSize: "0.9rem",
  },
  label: {
    fontSize: "1rem",
    color: "#555",
    marginBottom: "0.5rem",
    alignSelf: "flex-start",
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
  button: {
    width: "100%",
    padding: "0.7rem",
    backgroundColor: "#ff6b6b",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "1rem",
    cursor: "pointer",
  },
  signOutButton: {
    width: "100%",
    padding: "0.7rem",
    backgroundColor: "transparent",
    color: "#aaa",
    border: "1px solid #ddd",
    borderRadius: "8px",
    fontSize: "1rem",
    cursor: "pointer",
    marginTop: "1rem",
  },
  linkedLabel: {
    color: "#aaa",
    fontSize: "0.85rem",
    margin: "0 0 4px 0",
  },
  linkedName: {
    fontWeight: "bold",
    fontSize: "1.1rem",
    color: "#ff6b6b",
    margin: 0,
  },
  message: {
    fontSize: "0.85rem",
    marginTop: "0.5rem",
    textAlign: "center",
    color: "#555",
  },
  avatarWrapper: {
    position: "relative",
    display: "inline-block",
    marginBottom: "0.5rem",
  },
  editBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#ffffff",
    borderRadius: "50%",
    width: "20px",
    height: "20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.55rem",
    cursor: "pointer",
    boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
  },
  badgeTitle: {
    fontWeight: "bold",
    fontSize: "1rem",
    color: "#333",
    marginBottom: "1rem",
    margin: "0 0 1rem 0",
  },
  badgeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "0.8rem",
  },
  badgeItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
  },
  badgeEmoji: {
    width: "52px",
    height: "52px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.5rem",
    marginBottom: "0.3rem",
  },
  badgeName: {
    fontWeight: "bold",
    fontSize: "0.75rem",
    color: "#333",
    margin: "0 0 2px 0",
  },
  badgeDesc: {
    fontSize: "0.65rem",
    color: "#aaa",
    margin: 0,
    lineHeight: 1.3,
  },
  walletHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.5rem",
  },
  walletReset: {
    fontSize: "0.75rem",
    color: "#aaa",
    margin: 0,
  },
  walletBalance: {
    textAlign: "center",
    padding: "1rem 0",
  },
  walletAmount: {
    fontSize: "2.5rem",
    fontWeight: "bold",
    color: "#ff6b6b",
    margin: 0,
  },
  walletSub: {
    fontSize: "0.8rem",
    color: "#aaa",
    margin: "4px 0 0 0",
  },
  walletBreakdown: {
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
    backgroundColor: "#fffaf5",
    borderRadius: "10px",
    padding: "1rem 0.5rem",
    marginBottom: "1rem",
    margin: "0 -0.5rem 1rem -0.5rem",
  },
  walletItem: {
    flex: 1,
    textAlign: "center",
  },
  walletItemEmoji: {
    fontSize: "1rem",
    margin: "0 0 2px 0",
  },
  walletItemCount: {
    fontWeight: "bold",
    fontSize: "1.2rem",
    color: "#333",
    margin: 0,
  },
  walletItemLabel: {
    fontSize: "0.6rem",
    color: "#aaa",
    margin: "2px 0 0 0",
    whiteSpace: "nowrap",
  },
  walletDivider: {
    width: "1px",
    height: "40px",
    backgroundColor: "#eee",
    margin: "0 0.8rem",
  },
  resetButton: {
    width: "100%",
    padding: "0.6rem",
    backgroundColor: "transparent",
    color: "#aaa",
    border: "1px solid #eee",
    borderRadius: "8px",
    fontSize: "0.85rem",
    cursor: "pointer",
  },
  confirmRow: {
    textAlign: "center",
  },
  confirmText: {
    fontSize: "0.85rem",
    color: "#888",
    marginBottom: "0.5rem",
  },
  confirmButtons: {
    display: "flex",
    gap: "0.5rem",
  },
  confirmYes: {
    flex: 1,
    padding: "0.6rem",
    backgroundColor: "#ff4444",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "0.85rem",
    cursor: "pointer",
  },
  confirmNo: {
    flex: 1,
    padding: "0.6rem",
    backgroundColor: "transparent",
    color: "#aaa",
    border: "1px solid #eee",
    borderRadius: "8px",
    fontSize: "0.85rem",
    cursor: "pointer",
  },
  ruleCard: {
    display: "flex",
    gap: "1rem",
    backgroundColor: "#f0fff4",
    borderRadius: "12px",
    padding: "1rem",
    marginBottom: "0.8rem",
    alignItems: "flex-start",
  },
  ruleLeft: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    minWidth: "48px",
  },
  ruleAmount: {
    fontWeight: "bold",
    fontSize: "1.4rem",
    color: "#4caf50",
    margin: 0,
  },
  ruleTag: {
    fontSize: "0.65rem",
    color: "#aaa",
    margin: "2px 0 0 0",
    textAlign: "center",
  },
  ruleRight: {
    flex: 1,
  },
  ruleDesc: {
    fontSize: "0.85rem",
    color: "#555",
    margin: "0 0 0.5rem 0",
    fontWeight: "bold",
  },
  ruleTimes: {
    display: "flex",
    flexDirection: "column",
    gap: "0.2rem",
  },
  ruleTime: {
    fontSize: "0.78rem",
    color: "#888",
  },
  walletFlipContainer: {
    perspective: "1000px",
    marginBottom: "1rem",
  },
  walletFlipInner: {
    position: "relative",
    transformStyle: "preserve-3d",
    transition: "transform 0.6s ease",
  },
  walletFront: {
    backgroundColor: "white",
    borderRadius: "12px",
    padding: "1.2rem",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    backfaceVisibility: "hidden",
    cursor: "pointer",
  },
  walletBack: {
    backgroundColor: "white",
    borderRadius: "12px",
    padding: "1.2rem",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    backfaceVisibility: "hidden",
    transform: "rotateY(180deg)",
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    cursor: "pointer",
  },
  flipHint: {
    textAlign: "center",
    fontSize: "0.7rem",
    color: "#ddd",
    margin: "0.8rem 0 0 0",
  },
  backTitle: {
    fontWeight: "bold",
    fontSize: "1.1rem",
    color: "#333",
    margin: "0 0 0.2rem 0",
  },
  notifRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: "0.8rem",
    marginBottom: "0.8rem",
    borderBottom: "1px solid #f5f5f5",
  },
  notifLeft: {
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
  },
  notifEmoji: {
    fontSize: "1.1rem",
  },
  notifLabel: {
    fontSize: "0.9rem",
    color: "#333",
    margin: 0,
  },
  personalInfoSubtitle: {
    fontSize: "0.78rem",
    color: "#bbb",
    margin: "-0.3rem 0 1rem 0",
  },
  personalInfoRow: {
    display: "flex",
    flexDirection: "column",
    gap: "0.3rem",
    padding: "0.6rem",
    backgroundColor: "#fffaf5",
    borderRadius: "10px",
    minHeight: "60px",
    boxSizing: "border-box",
  },
  personalInfoLabel: {
    fontSize: "0.72rem",
    color: "#bbb",
    margin: 0,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    textAlign: "center",
  },
  personalInfoValueRow: {
    display: "flex",
    alignItems: "center",
    gap: "1.0rem",
    minWidth: "80px",
    justifyContent: "flex-end",
  },
  personalInfoValue: {
    fontSize: "0.9rem",
    color: "#888",
    margin: 0,
  },
  personalInfoEmpty: {
    color: "#ddd",
    fontStyle: "italic",
    fontSize: "0.85rem",
  },
  personalInfoEdit: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "0.72rem",
    color: "#ccc",
    padding: "0",
    textDecoration: "underline",
    textUnderlineOffset: "2px",
  },
  personalInfoEditRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
  },
  personalInfoInput: {
    width: "90px",
    padding: "0.4rem 0.5rem",
    fontSize: "0.9rem",
    borderRadius: "8px",
    border: "1px solid #eee",
    outline: "none",
    color: "#333",
  },
  personalInfoSave: {
    background: "#ff6b6b",
    color: "white",
    border: "none",
    borderRadius: "6px",
    padding: "0.3rem 0.5rem",
    fontSize: "0.85rem",
    cursor: "pointer",
  },
  personalInfoCancel: {
    background: "none",
    color: "#ccc",
    border: "none",
    fontSize: "0.85rem",
    cursor: "pointer",
    padding: "0.3rem",
  },
  personalInfoGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0.6rem",
  },
  weightFlipContainer: {
    perspective: "600px",
    cursor: "pointer",
    borderRadius: "10px",
  },
  weightFlipInner: {
    position: "relative",
    width: "100%",
    transformStyle: "preserve-3d",
    transition: "transform 0.5s cubic-bezier(0.34, 1.26, 0.64, 1)",
    minHeight: "60px",
  },
  weightFlipFront: {
    position: "absolute",
    width: "100%",
    height: "100%",
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
    backgroundColor: "#fffaf5",
    borderRadius: "10px",
    padding: "0.6rem",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: "0.3rem",
  },
  weightFlipBack: {
    position: "absolute",
    width: "100%",
    height: "100%",
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
    backgroundColor: "#fff0ee",
    borderRadius: "10px",
    padding: "0.6rem",
    transform: "rotateY(180deg)",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: "0.3rem",
  },
  completionBanner: {
    backgroundColor: "#fff8ee",
    border: "1px solid #ffe8cc",
    borderRadius: "12px",
    padding: "0.9rem 1rem",
    marginBottom: "1rem",
    animation: "slideUpFade 0.4s ease both",
  },
  completionBannerTitle: {
    fontSize: "0.88rem",
    fontWeight: "600",
    color: "#ffb347",
    margin: "0 0 3px 0",
  },
  completionBannerSub: {
    fontSize: "0.78rem",
    color: "#bbb",
    margin: 0,
    lineHeight: 1.4,
  },
  incomingRequestCard: {
    backgroundColor: "#fff5f5",
    border: "1px solid #ffdddd",
    borderRadius: "14px",
    padding: "1rem 1.2rem",
    marginBottom: "1rem",
    animation: "slideUpFade 0.4s ease both",
  },
  incomingRequestTitle: {
    fontSize: "0.78rem",
    fontWeight: "600",
    color: "#ff6b6b",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    margin: "0 0 6px 0",
  },
  incomingRequestText: {
    fontSize: "0.9rem",
    color: "#333",
    margin: "0 0 1rem 0",
    lineHeight: 1.4,
  },
  incomingRequestButtons: {
    display: "flex",
    gap: "0.6rem",
  },
  acceptButton: {
    flex: 1,
    padding: "0.6rem",
    backgroundColor: "#ff6b6b",
    color: "white",
    border: "none",
    borderRadius: "10px",
    fontSize: "0.88rem",
    fontWeight: "600",
    cursor: "pointer",
  },
  declineButton: {
    flex: 1,
    padding: "0.6rem",
    backgroundColor: "transparent",
    color: "#ccc",
    border: "1px solid #eee",
    borderRadius: "10px",
    fontSize: "0.88rem",
    cursor: "pointer",
  },
  pendingRequestCard: {
    backgroundColor: "#fffaf5",
    border: "1px solid #ffe8cc",
    borderRadius: "14px",
    padding: "0.9rem 1.2rem",
    marginBottom: "1rem",
  },
  pendingRequestText: {
    fontSize: "0.88rem",
    color: "#555",
    margin: "0 0 3px 0",
  },
  pendingRequestSub: {
    fontSize: "0.75rem",
    color: "#bbb",
    margin: 0,
  },
  inviteLinkCard: {
    backgroundColor: "#fafafa",
    border: "1px solid #eee",
    borderRadius: "10px",
    padding: "0.8rem 1rem",
    marginTop: "0.5rem",
  },
  inviteLinkText: {
    fontSize: "0.78rem",
    color: "#aaa",
    margin: "0 0 0.5rem 0",
  },
  inviteLinkRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
  },
  inviteLinkUrl: {
    fontSize: "0.82rem",
    color: "#555",
    fontWeight: "500",
    margin: 0,
  },
  copyLinkButton: {
    padding: "0.3rem 0.8rem",
    backgroundColor: "#ff6b6b",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "0.78rem",
    fontWeight: "600",
    cursor: "pointer",
  },
};

export default Profile;