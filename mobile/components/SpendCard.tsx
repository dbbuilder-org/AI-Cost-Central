import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "@/constants/colors";

interface SpendCardProps {
  label: string;
  value: string;
  subValue?: string;
  changePct?: number;
  highlight?: boolean;
}

export function SpendCard({ label, value, subValue, changePct, highlight }: SpendCardProps) {
  const changeColor =
    changePct === undefined
      ? Colors.text.secondary
      : changePct > 0
      ? Colors.negative
      : changePct < 0
      ? Colors.positive
      : Colors.text.secondary;

  return (
    <View style={[styles.card, highlight && styles.cardHighlight]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {subValue && <Text style={styles.subValue}>{subValue}</Text>}
      {changePct !== undefined && (
        <Text style={[styles.change, { color: changeColor }]}>
          {changePct > 0 ? "▲" : changePct < 0 ? "▼" : "–"}{" "}
          {Math.abs(changePct).toFixed(1)}% vs prior period
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bg.card,
    borderRadius: 12,
    padding: 16,
    flex: 1,
    minWidth: 140,
    borderWidth: 1,
    borderColor: Colors.bg.border,
  },
  cardHighlight: {
    borderColor: Colors.accent,
  },
  label: {
    color: Colors.text.muted,
    fontSize: 12,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  value: {
    color: Colors.text.primary,
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 2,
  },
  subValue: {
    color: Colors.text.secondary,
    fontSize: 13,
    marginBottom: 4,
  },
  change: {
    fontSize: 12,
    marginTop: 4,
  },
});
