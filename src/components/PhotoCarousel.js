import React, { useState, useEffect } from "react";

// React.memo: prevents re-renders when the same photos/initialIndex are passed
export default React.memo(function PhotoCarousel({ photos, initialIndex = 0 }) {
  const [carouselIndex, setCarouselIndex] = useState(initialIndex);
  const [swipeStartX, setSwipeStartX] = useState(null);
  const [swipeDirection, setSwipeDirection] = useState(null);

  useEffect(() => {
    setCarouselIndex(initialIndex);
    setSwipeDirection(null);
  }, [initialIndex]);

  if (!photos || photos.length === 0) return null;

  if (photos.length === 1) {
    return (
      <div style={{ position: "relative", width: "100%" }}>
        <img src={photos[0]} alt="meal" style={styles.sheetPhoto} loading="lazy" />
      </div>
    );
  }

  return (
    <div style={styles.carouselWrapper}>
      <div
        style={styles.carouselPhotoWrapper}
        onTouchStart={(e) => setSwipeStartX(e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (swipeStartX === null) return;
          const diff = swipeStartX - e.changedTouches[0].clientX;
          if (Math.abs(diff) > 40) {
            if (diff > 0 && carouselIndex < photos.length - 1) {
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
          src={photos[carouselIndex]}
          alt="meal"
          loading="lazy"
          style={{
            ...styles.sheetPhoto,
            // Uses carousel-slide-* keyframes defined in index.css
            animation: `${swipeDirection === "left"
              ? "carousel-slide-in-right"
              : "carousel-slide-in-left"} 0.25s cubic-bezier(0.34, 1.2, 0.64, 1) both`,
          }}
        />
        {carouselIndex > 0 && (
          <button
            style={{ ...styles.carouselArrow, left: "8px" }}
            onClick={() => { setSwipeDirection("right"); setCarouselIndex((i) => i - 1); }}
          >‹</button>
        )}
        {carouselIndex < photos.length - 1 && (
          <button
            style={{ ...styles.carouselArrow, right: "8px" }}
            onClick={() => { setSwipeDirection("left"); setCarouselIndex((i) => i + 1); }}
          >›</button>
        )}
      </div>
      <div style={styles.carouselDots}>
        {photos.map((_, i) => (
          <div
            key={i}
            style={{
              ...styles.carouselDot,
              backgroundColor: i === carouselIndex ? "#ff6b6b" : "#e0e0e0",
              transform: i === carouselIndex ? "scale(1.3)" : "scale(1)",
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
});

const styles = {
  sheetPhoto: {
    width: "100%",
    borderRadius: "12px",
    objectFit: "cover",
    aspectRatio: "4/3",
  },
  carouselWrapper: {
    marginBottom: "0.5rem",
    width: "100%",
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
    transition: "transform 0.2s ease, background-color 0.2s ease",
  },
};
