import React, { useState } from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { AlertRow } from "@/components/AlertRow";
import { useAlerts } from "@/hooks/useAlerts";
import type { AlertSeverity } from "@/types";

type Filter = "all" | AlertSeverity;

export default function AlertsScreen() {
  const { data: alerts, isLoading, isError, error, refetch } = useAlerts();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["alerts"] });
    await refetch();
    setRefreshing(false);
  };

  const filtered = alerts
    ? filter === "all"
      ? alerts
      : alerts.filter((a) => a.severity === filter)
    : [];

  const critical = alerts?.filter((a) => a.severity === "critical").length ?? 0;
  const warning = alerts?.filter((a) => a.severity === "warning").length ?? 0;
  const info = alerts?.filter((a) => a.severity === "info").length ?? 0;

  const FILTERS: { key: Filter; label: string; color: string; count: number }[] = [
    { key: "all", label: "All", color: Colors.text.secondary, count: alerts?.length ?? 0 },
    { key: "critical", label: "Critical", color: Colors.severity.critical, count: critical },
    { key: "warning", label: "Warning", color: Colors.severity.warning, count: warning },
    { key: "info", label: "Info", color: Colors.severity.info, count: info },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || isLoading}
            onRefresh={onRefresh}
            tintColor={Colors.accent}
          />
        }
      >
        {/* Summary chips */}
        <View style={styles.filterRow}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[
                styles.filterChip,
                filter === f.key && { borderColor: f.color, backgroundColor: f.color + "20" },
              ]}
            >
              <Text style={[styles.filterText, { color: f.color }]}>
                {f.label}
              </Text>
              {f.count > 0 && (
                <View style={[styles.badge, { backgroundColor: f.color }]}>
                  <Text style={styles.badgeText}>{f.count}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {isError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>
              {error instanceof Error ? error.message : "Failed to load alerts"}
            </Text>
          </View>
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>✅</Text>
            <Text style={styles.emptyTitle}>No Alerts</Text>
            <Text style={styles.emptyBody}>
              {filter === "all"
                ? "Everything looks normal. Pull to refresh."
                : `No ${filter} alerts found.`}
            </Text>
          </View>
        )}

        {filtered.map((alert) => (
          <AlertRow key={alert.id} alert={alert} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 8,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 4,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.bg.border,
    backgroundColor: Colors.bg.secondary,
  },
  filterText: {
    fontSize: 12,
    fontWeight: "500",
  },
  badge: {
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  errorBanner: {
    backgroundColor: Colors.severity.critical + "20",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.severity.critical + "50",
  },
  errorText: {
    color: Colors.severity.critical,
    fontSize: 13,
  },
  emptyState: {
    alignItems: "center",
    padding: 32,
    gap: 10,
  },
  emptyEmoji: {
    fontSize: 40,
  },
  emptyTitle: {
    color: Colors.text.primary,
    fontSize: 18,
    fontWeight: "600",
  },
  emptyBody: {
    color: Colors.text.secondary,
    fontSize: 13,
    textAlign: "center",
  },
});
