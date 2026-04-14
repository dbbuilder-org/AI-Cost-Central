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
import { SpendCard } from "@/components/SpendCard";
import { TrendChart } from "@/components/TrendChart";
import { useSpendSummary } from "@/hooks/useSpendSummary";
import { useSettings } from "@/hooks/useSettings";
import type { DateRange } from "@/types";

const DATE_RANGES: DateRange[] = ["7d", "14d", "28d"];

export default function DashboardScreen() {
  const { settings } = useSettings();
  const [dateRange, setDateRange] = useState<DateRange>(settings.dateRange ?? "28d");
  const { data, isLoading, isError, error, refetch } = useSpendSummary(dateRange);
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["summary"] });
    await refetch();
    setRefreshing(false);
  };

  if (!settings.apiBaseUrl) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>⚙️</Text>
          <Text style={styles.emptyTitle}>Set Your API URL</Text>
          <Text style={styles.emptyBody}>
            Go to Settings and enter your AICostCentral deployment URL to get started.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

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
        {/* Date range selector */}
        <View style={styles.rangeRow}>
          {DATE_RANGES.map((r) => (
            <TouchableOpacity
              key={r}
              onPress={() => setDateRange(r)}
              style={[styles.rangeBtn, dateRange === r && styles.rangeBtnActive]}
            >
              <Text style={[styles.rangeBtnText, dateRange === r && styles.rangeBtnTextActive]}>
                {r}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {isError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>
              {error instanceof Error ? error.message : "Failed to load data"}
            </Text>
          </View>
        )}

        {/* Spend cards */}
        <View style={styles.cards}>
          <SpendCard
            label="Total Spend"
            value={data ? `$${data.totalCostUSD.toFixed(2)}` : "—"}
            changePct={data?.changePct}
            highlight
          />
          <SpendCard
            label="Requests"
            value={data ? data.totalRequests.toLocaleString() : "—"}
            subValue={dateRange}
          />
        </View>

        {/* Trend chart */}
        {data && data.byDay.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Daily Spend Trend</Text>
            <TrendChart data={data.byDay} color={Colors.accent} />
          </View>
        )}

        {/* Top models */}
        {data && data.byModel.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top Models</Text>
            {data.byModel.slice(0, 8).map((m) => (
              <View key={`${m.provider}-${m.model}`} style={styles.modelRow}>
                <View style={styles.modelLeft}>
                  <View
                    style={[
                      styles.providerDot,
                      {
                        backgroundColor:
                          m.provider === "openai"
                            ? Colors.provider.openai
                            : m.provider === "anthropic"
                            ? Colors.provider.anthropic
                            : Colors.provider.google,
                      },
                    ]}
                  />
                  <Text style={styles.modelName} numberOfLines={1}>
                    {m.model}
                  </Text>
                </View>
                <Text style={styles.modelCost}>${m.costUSD.toFixed(2)}</Text>
              </View>
            ))}
          </View>
        )}

        {data && (
          <Text style={styles.fetchedAt}>
            Updated {new Date(data.fetchedAt).toLocaleTimeString()}
          </Text>
        )}
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
    gap: 16,
    paddingBottom: 32,
  },
  rangeRow: {
    flexDirection: "row",
    gap: 8,
  },
  rangeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.bg.border,
  },
  rangeBtnActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  rangeBtnText: {
    color: Colors.text.secondary,
    fontSize: 13,
    fontWeight: "500",
  },
  rangeBtnTextActive: {
    color: "#fff",
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
  cards: {
    flexDirection: "row",
    gap: 10,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    color: Colors.text.secondary,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  modelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.bg.border,
  },
  modelLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  providerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  modelName: {
    color: Colors.text.primary,
    fontSize: 13,
    flex: 1,
  },
  modelCost: {
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  emptyEmoji: {
    fontSize: 48,
  },
  emptyTitle: {
    color: Colors.text.primary,
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
  },
  emptyBody: {
    color: Colors.text.secondary,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
  },
  fetchedAt: {
    color: Colors.text.muted,
    fontSize: 11,
    textAlign: "center",
  },
});
