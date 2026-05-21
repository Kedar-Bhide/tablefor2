import React, { useEffect, useState } from "react";
import { auth, db, storage } from "../firebase";
import { signOut } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { calculateBadges } from "../utils/calculateBadges";
import { calculateWallet, WHITELISTED_WALLET_UIDS } from "../utils/calculateWallet";
import { getFunctions, httpsCallable } from "firebase/functions";
import { deleteField } from "firebase/firestore";
import Cropper from "react-easy-crop";
import { getCroppedImg } from "../utils/cropImage";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, HeartCrack, Info } from "lucide-react";

function Profile({ user, globalUserData, globalPartnerData }) {
  const [photoURL, setPhotoURL] = useState(globalUserData?.photoURL || user?.photoURL);

  const handleProfilePhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      setImageToCrop(reader.result);
    });
    reader.readAsDataURL(file);
  };

  const handleCropSave = async () => {
    if (!imageToCrop || !croppedAreaPixels) return;
    setSaving(true);
    try {
      const croppedBlob = await getCroppedImg(imageToCrop, croppedAreaPixels);
      const photoRef = ref(storage, `profiles/${user.uid}`);
      await uploadBytes(photoRef, croppedBlob);
      const url = await getDownloadURL(photoRef);
      await updateDoc(doc(db, "users", user.uid), { photoURL: url });
      setPhotoURL(url);
      setImageToCrop(null);
    } catch (e) {
      console.error("Crop save failed:", e);
    }
    setSaving(false);
  };

  // State
  const [partnerEmail, setPartnerEmail] = useState(""); // Input field for linking
  const [saving, setSaving] = useState(false);
  const [badges, setBadges] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  const [showRewardsModal, setShowRewardsModal] = useState(false);
  const [message, setMessage] = useState("");
  const [editingField, setEditingField] = useState(null);
  const [fieldDraft, setFieldDraft] = useState("");
  const [showInviteLink, setShowInviteLink] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [currency, setCurrency] = useState("USD");
  const [showMenu, setShowMenu] = useState(false);
  const [showPartnerProfile, setShowPartnerProfile] = useState(false);

  // Cropper states
  const [imageToCrop, setImageToCrop] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  // Derive from global props
  const partnerUid = globalUserData?.partnerUid || null;
  const partnerName = globalPartnerData?.name || null;
  const incomingRequest = globalUserData?.partnerRequest || null;
  const pendingRequest = globalUserData?.pendingPartnerRequest || null;
  const requestSent = !!pendingRequest;


  const profileFields = {
    age: globalUserData?.age || "",
    gender: globalUserData?.gender || "",
    height_cm: globalUserData?.height_cm || "",
    weight_kg: globalUserData?.weight_kg || "",
    target_weight_kg: globalUserData?.target_weight_kg || "",
  };

  const formatWalletValue = (value) => {
    if (currency === "INR") {
      return `₹${Math.round(value * 10)}`;
    }
    return `$${value.toFixed(2)}`;
  };

  // Calculate badges and wallets since they rely on calculations
  useEffect(() => {
    const fetchCalculations = async () => {
      // Run badge and wallet calculations in parallel — both fetch meals independently
      const [earnedBadges, walletData] = await Promise.all([
        calculateBadges(user.uid, partnerUid),
        calculateWallet(user.uid),
      ]);
      setBadges(earnedBadges);
      setWallet(walletData);
    };
    fetchCalculations();
  }, [user.uid, partnerUid]);

  // Click outside menu closer
  useEffect(() => {
    if (!showMenu) return;
    const close = () => setShowMenu(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [showMenu]);

  // Sync photoURL with globalUserData
  useEffect(() => {
    if (globalUserData?.photoURL) {
      setPhotoURL(globalUserData.photoURL);
    }
  }, [globalUserData?.photoURL]);

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

      // Partner already has a pending request from someone else
      if (partnerData.partnerRequest) {
        setMessage("❌ This person already has a pending request from someone else.");
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

      // Verify the sender is still unlinked
      const fromUserRef = doc(db, "users", fromUid);
      const fromUserSnap = await getDoc(fromUserRef);
      if (!fromUserSnap.exists() || fromUserSnap.data().partnerUid) {
        setMessage("❌ This person has already linked with someone else!");
        // Clean up our stale request
        await updateDoc(doc(db, "users", user.uid), {
          partnerRequest: deleteField(),
        });
        setSaving(false);
        return;
      }

      // Link both accounts
      const linkDate = new Date();
      await updateDoc(doc(db, "users", user.uid), {
        partnerUid: fromUid,
        partnerEmail: incomingRequest.fromEmail,
        partnerRequest: deleteField(),
        partnerLinkedAt: linkDate,
      });
      await updateDoc(doc(db, "users", fromUid), {
        partnerUid: user.uid,
        partnerEmail: user.email,
        pendingPartnerRequest: deleteField(),
        partnerLinkedAt: linkDate,
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

      setPartnerEmail("");
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
        partnerRequest: deleteField(),
      });
      // Remove pending from requester's document
      await updateDoc(doc(db, "users", incomingRequest.fromUid), {
        pendingPartnerRequest: deleteField(),
      });
      setMessage("Request declined.");
    } catch (e) {
      console.error("Decline request error:", e);
    }
  };

  const handleSignOut = () => {
    signOut(auth);
  };

  const handleUnlink = async () => {
    if (!partnerUid) return;

    setSaving(true);
    try {
      const prevPartnerUid = partnerUid;

      // Update own document
      await updateDoc(doc(db, "users", user.uid), {
        partnerUid: deleteField(),
        partnerEmail: deleteField()
      });

      // Update partner document
      await updateDoc(doc(db, "users", prevPartnerUid), {
        partnerUid: deleteField(),
        partnerEmail: deleteField(),
        pendingPartnerRequest: deleteField(),
        unlinkedNotification: true
      });

      setMessage("Successfully unlinked.");
      setShowUnlinkConfirm(false);
    } catch (e) {
      console.error("Unlink error:", e);
      setMessage("❌ Something went wrong while unlinking.");
      setShowUnlinkConfirm(false);
    }
    setSaving(false);
  };

  const handleWalletReset = async () => {
    const userRef = doc(db, "users", user.uid);
    await updateDoc(userRef, { walletResetAt: new Date() });
    const walletData = await calculateWallet(user.uid);
    setWallet(walletData);
    setShowResetConfirm(false);
  };


  const handleFieldSave = async (key) => {
    if (editingField !== key) return;
    const value = fieldDraft.trim();
    await updateDoc(doc(db, "users", user.uid), { [key]: value });
    setEditingField(null);
    setFieldDraft("");
  };

  const profileComplete = profileFields.age &&
    profileFields.gender &&
    profileFields.height_cm &&
    profileFields.weight_kg;

  const handleCopyLink = () => {
    navigator.clipboard.writeText("https://trytablefor2.web.app/");
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: "spring", bounce: 0.2 } }
  };

  return (
    <motion.div
      style={styles.container}
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {/* Profile completion banner */}
      {!profileComplete && (
        <motion.div variants={itemVariants} style={styles.completionBanner}>
          <p style={styles.completionBannerTitle}>Complete your profile ✨</p>
          <p style={styles.completionBannerSub}>
            Add your age, height and weight below for personalized nutrition insights
          </p>
        </motion.div>
      )}
      <div style={styles.headerRow}>
        <h2 style={styles.title}>My Profile</h2>
        <div style={styles.menuContainer}>
          <button
            style={styles.hamburgerButton}
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>

          {showMenu && (
            <div style={styles.dropdownMenu}>
              {partnerUid && (
                <button
                  style={styles.dropdownItem}
                  onClick={() => setShowUnlinkConfirm(true)}
                >
                  <HeartCrack size={16} /> Unlink Partner
                </button>
              )}
              <button
                style={{ ...styles.dropdownItem, borderBottom: "none" }}
                onClick={handleSignOut}
              >
                <LogOut size={16} /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Unlink Confirmation Popup (Global) */}
      {showUnlinkConfirm && (
        <div style={styles.overlay} onClick={() => setShowUnlinkConfirm(false)}>
          <div style={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
            <p style={styles.confirmModalTitle}>Unlink Partner?</p>
            <p style={styles.confirmModalText}>This will remove your shared connection. You can link again later if you want.</p>
            <div style={styles.confirmModalButtons}>
              <button style={styles.confirmYes} onClick={handleUnlink}>Yes, Unlink</button>
              <button style={styles.confirmNo} onClick={() => setShowUnlinkConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <motion.div variants={itemVariants} style={styles.card}>
        <div style={styles.avatarWrapper}>
          <img src={photoURL} alt="avatar" style={styles.avatar} referrerPolicy="no-referrer" />
          <div style={styles.editBadge} onClick={() => document.getElementById("profilePhotoInput").click()}>
            📸
          </div>
        </div>
        <input id="profilePhotoInput" type="file" accept="image/*" style={{ display: "none" }} onChange={handleProfilePhoto} />
        <p style={styles.name}>{user.displayName}</p>
        <p style={styles.email}>{user.email}</p>
      </motion.div>

      {/* Cropper Modal */}
      {imageToCrop && (
        <div style={styles.overlay}>
          <div style={styles.cropperContainer}>
            <div style={styles.cropperWrapper}>
              <Cropper
                image={imageToCrop}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                onCropChange={setCrop}
                onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
                onZoomChange={setZoom}
              />
            </div>
            <div style={styles.cropperControls}>
              <p style={styles.cropperHint}>Pinch or drag to adjust</p>
              <div style={styles.cropperButtons}>
                <button
                  style={styles.cropperCancel}
                  onClick={() => setImageToCrop(null)}
                >
                  Cancel
                </button>
                <button
                  style={styles.cropperSave}
                  onClick={handleCropSave}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Photo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <motion.div
        variants={itemVariants}
        style={partnerName ? { ...styles.card, cursor: "pointer" } : styles.card}
        onClick={() => partnerName && setShowPartnerProfile(true)}
        whileHover={partnerName ? { y: -2, boxShadow: "var(--shadow-md)" } : {}}
      >
        {partnerName ? (
          <div style={{ textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
            <div style={styles.partnerSmallAvatarWrapper}>
              <img src={globalPartnerData.photoURL} alt="p" style={styles.partnerSmallAvatar} />
            </div>
            <div style={{ textAlign: "left" }}>
              <p style={styles.linkedLabel}>Partnered with</p>
              <p style={styles.linkedName}>{partnerName} ↗</p>
            </div>
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
            {!partnerUid && requestSent && pendingRequest && (
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
                  <p style={styles.inviteLinkUrl}>trytablefor2.web.app</p>
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
      </motion.div>

      {/* Wallet Card - Only show for whitelisted users */}
      {WHITELISTED_WALLET_UIDS.includes(user.uid) && (
        <motion.div variants={itemVariants} style={styles.walletFront} onClick={() => setShowRewardsModal(true)}>
          <div style={styles.walletHeader}>
            <p style={styles.badgeTitle}>💰 My Wallet</p>
            <select
              value={currency}
              onChange={(e) => {
                e.stopPropagation();
                setCurrency(e.target.value);
              }}
              style={styles.currencySelect}
              onClick={(e) => e.stopPropagation()}
            >
              <option value="USD">USD ($)</option>
              <option value="INR">INR (₹)</option>
            </select>
          </div>
          {wallet?.resetAt && (
            <p style={styles.walletReset}>
              Since {wallet.resetAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </p>
          )}

          <div style={styles.walletBalance}>
            <p style={styles.walletAmount}>{formatWalletValue(wallet ? wallet.total : 0)}</p>
            <p style={styles.walletSub}>rewarded from meals</p>
          </div>

          <div style={styles.walletBreakdown}>
            <div style={styles.walletItem}>
              <p style={styles.walletItemEmoji}>🟢</p>
              <p style={styles.walletItemCount}>{wallet?.fullCount ?? 0}</p>
              <p style={styles.walletItemLabel}>{currency === "INR" ? "₹20" : "$2"} meals</p>
            </div>
            <div style={styles.walletDivider} />
            <div style={styles.walletItem}>
              <p style={styles.walletItemEmoji}>🟡</p>
              <p style={styles.walletItemCount}>{wallet?.halfCount ?? 0}</p>
              <p style={styles.walletItemLabel}>{currency === "INR" ? "₹10" : "$1"} meals</p>
            </div>
            <div style={styles.walletDivider} />
            <div style={styles.walletItem}>
              <p style={styles.walletItemEmoji}>🔴</p>
              <p style={styles.walletItemCount}>{wallet?.quarterCount ?? 0}</p>
              <p style={styles.walletItemLabel}>{currency === "INR" ? "₹5" : "$0.50"} meals</p>
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

          <p style={styles.flipHint}>Tap for rewards overview</p>
        </motion.div>
      )}

      {/* Rewards Modal */}
      {showRewardsModal && (
        <div style={styles.modalOverlay} onClick={() => setShowRewardsModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.walletHeader}>
              <p style={styles.backTitle}>💰 How Rewards Work</p>
              <select
                value={currency}
                onChange={(e) => {
                  e.stopPropagation();
                  setCurrency(e.target.value);
                }}
                style={styles.currencySelect}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="USD">USD ($)</option>
                <option value="INR">INR (₹)</option>
              </select>
            </div>

            <div style={{ ...styles.ruleCard, backgroundColor: "#f0fff4" }}>
              <div style={styles.ruleLeft}>
                <p style={{ ...styles.ruleAmount, color: "#4caf50" }}>
                  {currency === "INR" ? "₹20" : "$2"}
                </p>
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
                <p style={{ ...styles.ruleAmount, color: "#ffb347" }}>
                  {currency === "INR" ? "₹10" : "$1"}
                </p>
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
                <p style={{ ...styles.ruleAmount, color: "#ff6b6b" }}>
                  {currency === "INR" ? "₹5" : "$0.50"}
                </p>
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
      )}
      {/* Personal Info */}
      <motion.div variants={itemVariants} style={styles.card}>
        <p style={styles.personalInfoTitle}><Info size={18} /> Personal Info</p>
        <p style={styles.personalInfoSubtitle}>
          Used to personalize your nutrition insights.
        </p>
        <div style={styles.personalInfoGrid}>
          {/* Row 1: Age & Height */}
          <div style={styles.personalWeightRow}>
            {/* Age Segment */}
            <div style={styles.weightSegment}>
              <p style={styles.personalInfoLabel}>AGE</p>
              {editingField === "age" ? (
                <input
                  type="text"
                  inputMode="numeric"
                  value={fieldDraft}
                  onChange={(e) => setFieldDraft(e.target.value.replace(/[^0-9]/g, ""))}
                  onBlur={() => handleFieldSave("age")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleFieldSave("age");
                    if (e.key === "Escape") setEditingField(null);
                  }}
                  style={styles.personalInfoInputSmall}
                  autoFocus
                />
              ) : (
                <p
                  style={styles.personalInfoValue}
                  onClick={() => {
                    setEditingField("age");
                    setFieldDraft(profileFields.age || "");
                  }}
                >
                  {profileFields.age ? `${profileFields.age} yrs` : <span style={styles.personalInfoEmpty}>Add</span>}
                </p>
              )}
            </div>

            <div style={styles.weightDivider} />

            {/* Height Segment */}
            <div style={styles.weightSegment}>
              <p style={styles.personalInfoLabel}>HEIGHT (cm)</p>
              {editingField === "height_cm" ? (
                <input
                  type="text"
                  inputMode="numeric"
                  value={fieldDraft}
                  onChange={(e) => setFieldDraft(e.target.value.replace(/[^0-9]/g, ""))}
                  onBlur={() => handleFieldSave("height_cm")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleFieldSave("height_cm");
                    if (e.key === "Escape") setEditingField(null);
                  }}
                  style={styles.personalInfoInputSmall}
                  autoFocus
                />
              ) : (
                <p
                  style={styles.personalInfoValue}
                  onClick={() => {
                    setEditingField("height_cm");
                    setFieldDraft(profileFields.height_cm || "");
                  }}
                >
                  {profileFields.height_cm ? `${profileFields.height_cm} cm` : <span style={styles.personalInfoEmpty}>Add</span>}
                </p>
              )}
            </div>
          </div>

          {/* Row 2: Weights (Current & Target) */}
          <div style={styles.personalWeightRow}>
            {/* Current Weight */}
            <div style={styles.weightSegment}>
              <p style={styles.personalInfoLabel}>WEIGHT (kg)</p>
              {editingField === "weight_kg" ? (
                <input
                  type="text"
                  inputMode="decimal"
                  value={fieldDraft}
                  onChange={(e) => setFieldDraft(e.target.value.replace(/[^0-9.]/g, ""))}
                  onBlur={() => handleFieldSave("weight_kg")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleFieldSave("weight_kg");
                    if (e.key === "Escape") setEditingField(null);
                  }}
                  style={styles.personalInfoInputSmall}
                  autoFocus
                />
              ) : (
                <p
                  style={styles.personalInfoValue}
                  onClick={() => {
                    setEditingField("weight_kg");
                    setFieldDraft(profileFields.weight_kg || "");
                  }}
                >
                  {profileFields.weight_kg ? `${profileFields.weight_kg} kg` : <span style={styles.personalInfoEmpty}>Add</span>}
                </p>
              )}
            </div>

            <div style={styles.weightDivider} />

            {/* Target Weight */}
            <div style={styles.weightSegment}>
              <p style={styles.personalInfoLabel}>TARGET (kg)</p>
              {editingField === "target_weight_kg" ? (
                <input
                  type="text"
                  inputMode="decimal"
                  value={fieldDraft}
                  // placeholder="70"
                  onChange={(e) => setFieldDraft(e.target.value.replace(/[^0-9.]/g, ""))}
                  onBlur={() => handleFieldSave("target_weight_kg")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleFieldSave("target_weight_kg");
                    if (e.key === "Escape") setEditingField(null);
                  }}
                  style={styles.personalInfoInputSmall}
                  autoFocus
                />
              ) : (
                <p
                  style={styles.personalInfoValue}
                  onClick={() => {
                    setEditingField("target_weight_kg");
                    setFieldDraft(profileFields.target_weight_kg || "");
                  }}
                >
                  {profileFields.target_weight_kg ? `${profileFields.target_weight_kg} kg` : <span style={styles.personalInfoEmpty}>Add</span>}
                </p>
              )}
            </div>
          </div>

          {/* Optional: Gender Card (Conditional) */}
          {(!profileFields.gender || editingField === "gender") && (
            <div style={styles.personalInfoRow}>
              <p style={styles.personalInfoLabel}>GENDER</p>
              {editingField === "gender" ? (
                <input
                  type="text"
                  value={fieldDraft}
                  // placeholder="Male / Female"
                  onChange={(e) => setFieldDraft(e.target.value)}
                  onBlur={() => handleFieldSave("gender")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleFieldSave("gender");
                    if (e.key === "Escape") setEditingField(null);
                  }}
                  style={styles.personalInfoInput}
                  autoFocus
                />
              ) : (
                <p
                  style={profileFields.gender ? styles.personalInfoValueLocked : styles.personalInfoValue}
                  onClick={() => {
                    if (!profileFields.gender) {
                      setEditingField("gender");
                      setFieldDraft(profileFields.gender || "");
                    }
                  }}
                >
                  {profileFields.gender ? profileFields.gender : <span style={styles.personalInfoEmpty}>Add Gender</span>}
                </p>
              )}
            </div>
          )}
        </div>
      </motion.div>
      {/* Partner Profile Modal */}
      <AnimatePresence>
        {showPartnerProfile && globalPartnerData && (
          <motion.div
            style={styles.overlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setShowPartnerProfile(false)}
          >
            <motion.div
              style={styles.partnerModal}
              initial={{ y: "50px", opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: "50px", opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button style={styles.modalCloseButton} onClick={() => setShowPartnerProfile(false)}>✕</button>

              <div style={styles.partnerModalBody}>
                <div style={styles.partnerLargeAvatarWrapper}>
                  <img
                    src={globalPartnerData.photoURL}
                    alt={partnerName}
                    style={styles.partnerLargeAvatar}
                    referrerPolicy="no-referrer"
                  />
                </div>
                <h2 style={styles.partnerModalName}>{partnerName}</h2>
                <p style={styles.partnerModalEmail}>{globalPartnerData.email}</p>

                <div style={styles.partnerStatusTag}>
                  <span style={styles.partnerHeart}>💖</span> Partner Since {(() => {
                    const linkDate = globalUserData.partnerLinkedAt || globalUserData.createdAt || null;
                    const date = linkDate ? (linkDate.toDate ? linkDate.toDate() : new Date(linkDate)) : new Date();
                    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
                  })()}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Badges */}
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
    </motion.div>
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
    margin: 0,
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "1.5rem",
    position: "relative",
  },
  menuContainer: {
    position: "relative",
  },
  hamburgerButton: {
    background: "none",
    border: "none",
    padding: "8px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "8px",
    transition: "background-color 0.2s",
  },
  dropdownMenu: {
    position: "absolute",
    top: "100%",
    right: 0,
    backgroundColor: "white",
    borderRadius: "12px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
    padding: "0.5rem",
    minWidth: "160px",
    zIndex: 1000,
    marginTop: "8px",
    animation: "bloomOpen 0.25s ease-out",
  },
  dropdownItem: {
    width: "100%",
    padding: "0.8rem 1rem",
    textAlign: "left",
    background: "none",
    border: "none",
    borderBottom: "1px solid #f5f5f5",
    fontSize: "0.95rem",
    color: "#444",
    cursor: "pointer",
    borderRadius: "6px",
    transition: "background-color 0.2s",
    display: "block",
  },
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2000,
    backdropFilter: "blur(4px)",
  },
  confirmModal: {
    backgroundColor: "white",
    padding: "2rem",
    borderRadius: "24px",
    width: "90%",
    maxWidth: "340px",
    textAlign: "center",
    boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
    animation: "bloomOpen 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
  confirmModalTitle: {
    fontSize: "1.3rem",
    fontWeight: "700",
    color: "#333",
    margin: "0 0 0.8rem 0",
  },
  confirmModalText: {
    fontSize: "0.95rem",
    color: "#666",
    lineHeight: 1.5,
    margin: "0 0 1.8rem 0",
  },
  confirmModalButtons: {
    display: "flex",
    gap: "0.8rem",
  },
  cropperContainer: {
    backgroundColor: "white",
    width: "100%",
    maxWidth: "450px",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    zIndex: 2500,
  },
  cropperWrapper: {
    position: "relative",
    flex: 1,
    backgroundColor: "#111",
  },
  cropperControls: {
    padding: "1.5rem",
    backgroundColor: "white",
    textAlign: "center",
  },
  cropperHint: {
    fontSize: "0.85rem",
    color: "#888",
    marginBottom: "1.2rem",
  },
  cropperButtons: {
    display: "flex",
    gap: "1rem",
  },
  cropperCancel: {
    flex: 1,
    padding: "0.9rem",
    backgroundColor: "#f5f5f5",
    color: "#666",
    border: "none",
    borderRadius: "12px",
    fontSize: "0.95rem",
    fontWeight: "600",
    cursor: "pointer",
  },
  cropperSave: {
    flex: 2,
    padding: "0.9rem",
    backgroundColor: "#ff6b6b",
    color: "white",
    border: "none",
    borderRadius: "12px",
    fontSize: "0.95rem",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(255,107,107,0.3)",
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
    objectFit: "cover",
  },
  name: {
    fontWeight: "bold",
    fontSize: "1.1rem",
    color: "#333",
    margin: "0 0 2px 0",
  },
  email: {
    color: "#888",
    fontSize: "0.9rem",
    margin: 6,
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
    color: "#666",
    border: "1px solid #ddd",
    borderRadius: "8px",
    fontSize: "1rem",
    cursor: "pointer",
    marginTop: "1rem",
  },
  linkedLabel: {
    color: "#666",
    fontSize: "0.85rem",
    margin: "0 0 4px 0",
  },
  linkedName: {
    fontWeight: "bold",
    fontSize: "1.1rem",
    color: "#ff6b6b",
    margin: 0,
  },
  partnerSmallAvatarWrapper: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    overflow: "hidden",
    border: "2px solid #fff5f5",
    boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
  },
  partnerSmallAvatar: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  partnerModal: {
    backgroundColor: "white",
    padding: "2.5rem 2rem",
    borderRadius: "32px",
    width: "90%",
    maxWidth: "360px",
    textAlign: "center",
    position: "relative",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
  },
  modalCloseButton: {
    position: "absolute",
    top: "1.5rem",
    right: "1.5rem",
    background: "#f5f5f5",
    border: "none",
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    fontSize: "1rem",
    color: "#666",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background-color 0.2s",
  },
  partnerModalBody: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  partnerLargeAvatarWrapper: {
    width: "120px",
    height: "120px",
    borderRadius: "50%",
    overflow: "hidden",
    marginBottom: "1.5rem",
    border: "4px solid #fff5f5",
    boxShadow: "0 8px 20px rgba(255,107,107,0.2)",
  },
  partnerLargeAvatar: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  partnerModalName: {
    fontSize: "1.6rem",
    fontWeight: "800",
    color: "#333",
    margin: "0 0 0.5rem 0",
  },
  partnerModalEmail: {
    fontSize: "1rem",
    color: "#888",
    margin: "0 0 2rem 0",
  },
  partnerStatusTag: {
    backgroundColor: "#fff5f5",
    padding: "0.8rem 1.2rem",
    borderRadius: "20px",
    fontSize: "0.85rem",
    color: "#ff6b6b",
    fontWeight: "600",
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  partnerHeart: {
    fontSize: "1rem",
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
    width: "24px",
    height: "24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.85rem",
    cursor: "pointer",
    boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
  },
  personalInfoTitle: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    fontWeight: "bold",
    fontSize: "1rem",
    color: "#333",
    marginBottom: "1rem",
    margin: "0 0 1rem 0",
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
    color: "#666",
    margin: 0,
    lineHeight: 1.3,
  },
  walletHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.2rem",
  },
  walletReset: {
    fontSize: "0.75rem",
    color: "#666",
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
    color: "#666",
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
    color: "#666",
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
    color: "#666",
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
    color: "#666",
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
    color: "#666",
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
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    backdropFilter: "blur(5px)",
    WebkitBackdropFilter: "blur(5px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: "20px",
    width: "100%",
    maxWidth: "360px",
    padding: "1.5rem",
    boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
    animation: "slideUpFade 0.3s ease-out",
  },
  walletFront: {
    backgroundColor: "white",
    borderRadius: "12px",
    padding: "1.2rem",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    cursor: "pointer",
    marginBottom: "1rem",
  },
  flipHint: {
    textAlign: "center",
    fontSize: "0.7rem",
    color: "#666",
    margin: "0.8rem 0 0 0",
  },
  backTitle: {
    fontWeight: "bold",
    fontSize: "1.1rem",
    color: "#333",
    margin: "0 0 0.2rem 0",
  },
  currencySelect: {
    background: "#f8f8f8",
    border: "1px solid #eee",
    borderRadius: "6px",
    padding: "0.2rem 0.4rem",
    fontSize: "0.75rem",
    color: "#666",
    outline: "none",
    cursor: "pointer",
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
    color: "#777",
    margin: "-0.3rem 0 1rem 0",
  },
  personalInfoRow: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.3rem",
    padding: "0.8rem",
    backgroundColor: "#fffaf5",
    borderRadius: "12px",
    minHeight: "70px",
    boxSizing: "border-box",
    cursor: "pointer",
    transition: "background-color 0.2s ease",
  },
  personalWeightRow: {
    display: "flex",
    alignItems: "center",
    backgroundColor: "#fffaf5",
    borderRadius: "12px",
    minHeight: "70px",
    boxSizing: "border-box",
  },
  weightSegment: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.3rem",
    padding: "0.8rem",
    cursor: "pointer",
  },
  weightDivider: {
    width: "1px",
    height: "30px",
    backgroundColor: "#eee",
  },
  personalInfoLabel: {
    fontSize: "0.8rem",
    color: "#777",
    margin: 0,
    fontWeight: "600",
    // textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  personalInfoValue: {
    fontSize: "1.1rem",
    fontWeight: "700",
    color: "#444",
    margin: 0,
    textAlign: "center",
  },
  personalInfoValueLocked: {
    fontSize: "1.1rem",
    fontWeight: "700",
    color: "#777",
    margin: 0,
    textAlign: "center",
    cursor: "default",
  },
  personalInfoEmpty: {
    color: "#666",
    fontStyle: "italic",
    fontSize: "0.9rem",
    fontWeight: "500",
  },
  personalInfoEditRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.4rem",
  },
  personalInfoInput: {
    width: "120px",
    padding: "0.4rem 0.6rem",
    fontSize: "1rem",
    borderRadius: "8px",
    border: "1px solid #ffcccc",
    outline: "none",
    color: "#333",
    textAlign: "center",
    backgroundColor: "white",
  },
  personalInfoInputSmall: {
    width: "70px",
    padding: "0.4rem 0.5rem",
    fontSize: "0.95rem",
    borderRadius: "8px",
    border: "1px solid #ffcccc",
    outline: "none",
    color: "#333",
    textAlign: "center",
    backgroundColor: "white",
  },
  personalInfoSave: {
    background: "#ff6b6b",
    color: "white",
    border: "none",
    borderRadius: "8px",
    padding: "0.4rem 0.6rem",
    fontSize: "0.9rem",
    cursor: "pointer",
    fontWeight: "bold",
  },
  personalInfoCancel: {
    background: "none",
    color: "#888",
    border: "none",
    fontSize: "1.1rem",
    cursor: "pointer",
    padding: "0.2rem",
    lineHeight: 1,
  },
  personalInfoGrid: {
    display: "flex",
    flexDirection: "column",
    gap: "0.8rem",
    width: "100%",
  },
  completionBanner: {
    backgroundColor: "#fff8ee",
    border: "1px solid #ffe8cc",
    borderRadius: "12px",
    padding: "1rem",
    marginBottom: "1.2rem",
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
    color: "#777",
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
    color: "#888",
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
    color: "#777",
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
    color: "#666",
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
