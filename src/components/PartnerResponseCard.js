import React from "react";
import { motion } from "framer-motion";

export default function PartnerResponseCard({ comment, authorName }) {
  if (!comment) return null;

  return (
    <motion.div 
      style={styles.partnerResponseCard}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div style={styles.partnerResponseContent}>
        <p style={styles.partnerResponseComment}>"{comment}"</p>
        <p style={styles.partnerResponseName}>— {authorName}</p>
      </div>
    </motion.div>
  );
}

const styles = {
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
    color: "#777",
    margin: 0,
    textAlign: "right",
  },
};
