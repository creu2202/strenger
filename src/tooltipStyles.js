import { defaultStyles } from "@visx/tooltip";

export const tooltipStyles = {
  ...defaultStyles,
  backgroundColor: "rgba(255, 255, 255, 1)",
  color: "#1a1a1a",
  fontSize: "13px",
  lineHeight: "1.5",
  padding: "10px 14px",
  borderRadius: "8px",
  border: "1px solid #e2e8f0",
  boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
  fontWeight: "500",
  zIndex: 1000,
};

export const tooltipHeaderStyle = {
  fontWeight: "bold",
  fontSize: "14px",
  marginBottom: "6px",
  display: "block",
  borderBottom: "1px solid #edf2f7",
  paddingBottom: "4px",
};
