import React from "react";

const SkeletonLoader = ({ width = "100%", height = "200px", borderRadius = "12px", style = {} }) => {
  return (
    <div
      style={{
        width,
        height,
        borderRadius,
        background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
        backgroundSize: "200% 100%",
        animation: "skeleton-shimmer 1.5s infinite",
        ...style,
      }}
    />
  );
};

export default SkeletonLoader;
