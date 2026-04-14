import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "@/constants/colors";
import type { ApiKey } from "@/types";

interface KeyRowProps {
  apiKey: ApiKey;
}

const PROVIDER_COLOR: Record<string, string> = {
  openai: Colors.provider.openai,
  anthropic: Colors.provider.anthropic,
  google: Colors.provider.google,
};

const PROVIDER_LABEL: Record<string, string> = {
  openai: "OAI",
  anthropic: "ANT",
  google: "GGL",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function KeyRow({ apiKey }: KeyRowProps) {
  const color = PROVIDER_COLOR[apiKey.provider] ?? Colors.text.muted;
  const label = PROVIDER_LABEL[apiKey.provider] ?? apiKey.provider.toUpperCase().slice(0, 3);

  return (
    <View style={[styles.row, apiKey.isNew && styles.rowNew]}>
      <View style={styles.left}>
        <View style={[styles.badge, { borderColor: color }]}>
          <Text style={[styles.badgeText, { color }]}>{label}</Text>
        </View>
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{apiKey.name}</Text>
            {apiKey.isNew && (
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>NEW</Text>
              </View>
            )}
          </View>
          {apiKey.hint && (
            <Text style={styles.hint}>···{apiKey.hint}</Text>
          )}
          <Text style={styles.created}>Created {formatDate(apiKey.createdAt)}</Text>
        </View>
      </View>

      <View style={styles.right}>
        {apiKey.spend7d !== undefined && (
          <Text style={styles.spend}>${apiKey.spend7d.toFixed(2)}</Text>
        )}
        {apiKey.spend7d !== undefined && (
          <Text style={styles.spendLabel}>7d spend</Text>
        )}
        <View style={[styles.status, { backgroundColor: apiKey.status === "active" ? Colors.positive + "30" : Colors.text.muted + "30" }]}>
          <Text style={[styles.statusText, { color: apiKey.status === "active" ? Colors.positive : Colors.text.muted }]}>
            {apiKey.status}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: Colors.bg.card,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.bg.border,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rowNew: {
    borderColor: Colors.accent,
  },
  left: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginTop: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  info: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  name: {
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: "500",
    flexShrink: 1,
  },
  newBadge: {
    backgroundColor: Colors.accent + "30",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  newBadgeText: {
    color: Colors.accentLight,
    fontSize: 10,
    fontWeight: "700",
  },
  hint: {
    color: Colors.text.muted,
    fontSize: 12,
    fontFamily: "monospace",
  },
  created: {
    color: Colors.text.muted,
    fontSize: 11,
  },
  right: {
    alignItems: "flex-end",
    gap: 2,
  },
  spend: {
    color: Colors.text.primary,
    fontSize: 15,
    fontWeight: "600",
  },
  spendLabel: {
    color: Colors.text.muted,
    fontSize: 10,
  },
  status: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
  },
});
