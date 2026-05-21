export function getDisplayValue(value) {
  return value === null || value === undefined || value === "" ? "No disponible" : value;
}

export function getRankInitials(rankName) {
  if (!rankName) {
    return "UR";
  }

  return rankName
    .split(" ")
    .map((part) => part.at(0))
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

export function formatRelativeDate(dateValue) {
  if (!dateValue) {
    return "Fecha no disponible";
  }

  const date =
    typeof dateValue === "number" ? new Date(dateValue * 1000) : new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "Fecha no disponible";
  }

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const divisions = [
    { amount: 60, unit: "second" },
    { amount: 60, unit: "minute" },
    { amount: 24, unit: "hour" },
    { amount: 7, unit: "day" },
    { amount: 4.345, unit: "week" },
    { amount: 12, unit: "month" },
    { amount: Number.POSITIVE_INFINITY, unit: "year" }
  ];

  let duration = seconds;

  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
        Math.round(duration),
        division.unit
      );
    }

    duration /= division.amount;
  }

  return "Fecha no disponible";
}
