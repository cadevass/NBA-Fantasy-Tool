// Pick value chart — asymmetric valuation
// giving = face value, receiving = discounted for intel

export const PICK_VALUES = {
  giving: {
    "2026 1st early": 95,   // 1.01-1.03
    "2026 1st mid": 80,     // 1.04-1.06
    "2026 1st late": 68,    // 1.07-1.10
    "2026 2nd early": 45,   // 2.01-2.05
    "2026 2nd late": 35,    // 2.06-2.10
    "2026 3rd": 18,
    "2027 1st": 62,
    "2027 2nd": 38,
    "2027 3rd": 15,
    "2028 1st": 52,
    "2028 2nd": 28,
    "2028 3rd": 12,
  },
  receiving: {
    "2026 1st early": 95,
    "2026 1st mid": 80,
    "2026 1st late": 68,
    "2026 2nd early": 45,
    "2026 2nd late": 35,
    "2026 3rd": 18,
    "2027 1st": 48,   // discounted — weak class
    "2027 2nd": 28,
    "2027 3rd": 10,
    "2028 1st": 55,   // slight premium — decent class
    "2028 2nd": 30,
    "2028 3rd": 13,
  },
};

export const MY_PICKS = {
  "1.08": { label: "2026 1st (1.08)", givingValue: 68, receivingValue: 68 },
  "2.08": { label: "2026 2nd (2.08)", givingValue: 35, receivingValue: 35 },
  "3.08": { label: "2026 3rd (3.08)", givingValue: 18, receivingValue: 18 },
  "2027 1st": { label: "2027 1st", givingValue: 62, receivingValue: 48 },
  "2027 2nd": { label: "2027 2nd", givingValue: 38, receivingValue: 28 },
  "2027 3rd": { label: "2027 3rd", givingValue: 15, receivingValue: 10 },
  "2028 1st": { label: "2028 1st", givingValue: 52, receivingValue: 55 },
  "2028 2nd": { label: "2028 2nd", givingValue: 28, receivingValue: 30 },
  "2028 3rd": { label: "2028 3rd", givingValue: 12, receivingValue: 13 },
};

export function getPickValue(pickLabel, side) {
  // Find closest match in the chart
  const key = Object.keys(PICK_VALUES[side]).find(k =>
    pickLabel.toLowerCase().includes(k.toLowerCase().split(" ")[0]) &&
    pickLabel.toLowerCase().includes(k.toLowerCase().split(" ")[1])
  );
  return key ? PICK_VALUES[side][key] : 30; // default fallback
}

// Dynasty age curve multipliers
export function getAgeCurveMultiplier(age) {
  const a = parseInt(age) || 25;
  if (a <= 20) return 1.35;
  if (a <= 22) return 1.20;
  if (a <= 24) return 1.10;
  if (a <= 27) return 1.00;
  if (a <= 29) return 0.88;
  if (a <= 31) return 0.72;
  return 0.55;
}

// Window alignment — how well does this player fit a 2-3 year opening window
export function getWindowAlignment(age) {
  const a = parseInt(age) || 25;
  // Peak years 2028-2030, so ideal age now is 21-24
  if (a >= 21 && a <= 24) return "Perfect";
  if (a >= 19 && a <= 26) return "Good";
  if (a >= 27 && a <= 29) return "Short";
  if (a <= 18) return "Too Early";
  return "Declining";
}
