import React, { useState } from "react";
import { PieChart, Pie, Cell, Sector } from "recharts";

const RADIAN = Math.PI / 180;

const renderActiveShape = (props) => {
  const { cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const sx = cx + (outerRadius + 10) * cos;
  const sy = cy + (outerRadius + 10) * sin;
  const mx = cx + (outerRadius + 30) * cos;
  const my = cy + (outerRadius + 30) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 22;
  const ey = my;
  const textAnchor = cos >= 0 ? "start" : "end";

  return (
    <g>
      <text x={cx} y={cy - 8} textAnchor="middle" fill="#333" fontSize="18" fontWeight="bold">
        {payload.name}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill="#888" fontSize="12">
        {`${value} meals`}
      </text>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={outerRadius + 8}
        outerRadius={outerRadius + 12}
        fill={fill}
      />
    </g>
  );
};

function DonutChart({ data, size = 160, centerLabel, centerSubLabel }) {
  const [activeIndex, setActiveIndex] = useState(null);
  const radius = size / 2;
  const innerRadius = radius * 0.55;
  const outerRadius = radius * 0.85;
  const cx = size / 2;
  const cy = size / 2;

  if (!data || data.length === 0) {
    return (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#999", fontSize: "0.85rem" }}>No data</span>
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <PieChart width={size} height={size}>
          <Pie
            activeIndex={activeIndex !== null ? activeIndex : undefined}
            activeShape={renderActiveShape}
            data={data}
            cx={cx}
            cy={cy}
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            dataKey="value"
            onMouseEnter={(_, index) => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
            animationBegin={0}
            animationDuration={800}
            animationEasing="ease-out"
          >
            {data.map((entry, index) => (
              <Cell 
                key={index} 
                fill={entry.color}
                stroke="white"
                strokeWidth={2}
              />
            ))}
          </Pie>
        </PieChart>
        {/* Center label when nothing is hovered */}
        {activeIndex === null && centerLabel && (
          <div style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center",
            pointerEvents: "none",
          }}>
            <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#333" }}>
              {centerLabel}
            </div>
            {centerSubLabel && (
              <div style={{ fontSize: "0.7rem", color: "#888", marginTop: "2px" }}>
                {centerSubLabel}
              </div>
            )}
          </div>
        )}
      </div>
      {/* Legend */}
      <div style={{ 
        display: "flex", 
        flexWrap: "wrap", 
        justifyContent: "center", 
        gap: "0.6rem",
        marginTop: "0.5rem",
        maxWidth: size + 40,
      }}>
        {data.map((entry) => {
          const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0;
          return (
            <div key={entry.name} style={{
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.25rem 0.5rem",
              borderRadius: "20px",
              backgroundColor: activeIndex !== null && data[activeIndex]?.name === entry.name 
                ? entry.color + "20" 
                : "transparent",
              transition: "background-color 0.2s",
            }}>
              <div style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                backgroundColor: entry.color,
                boxShadow: `0 0 0 2px white, 0 0 0 3px ${entry.color}40`,
              }} />
              <span style={{ fontSize: "0.72rem", color: "#555", fontWeight: "500" }}>
                {entry.name}
              </span>
              <span style={{ fontSize: "0.65rem", color: "#999" }}>
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default DonutChart;
