import React, { useState } from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { KeyRow } from "@/components/KeyRow";
import { useKeys } from "@/hooks/useKeys";
import type { Provider } from "@/types";

type ProviderFilter = "all" | Provider;

export default function KeysScreen() {
  const { data: keys, isLoading, isError, error, refetch } = useKeys();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["keys"] });
    await refetch();
    setRefreshing(false);
  };

  const filtered = (keys ?? []).filter((k) => {
    const matchesProvider = providerFilter === "all" || k.provider === providerFilter;
    const matchesSearch = !search || k.name.toLowerCase().includes(search.toLowerCase());
    return matchesProvider && matchesSearch;
  });

  const newKeys = filtered.filter((k) => k.isNew);
  const existingKeys = filtered.filter((k) => !k.isNew);

  const PROVIDERS: { key: ProviderFilter; label: string; color: string }[] = [
    { key: "all", label: "All", color: Colors.text.secondary },
    { key: "openai", label: "OpenAI", color: Colors.provider.openai },
    { key: "anthropic", label: "Anthropic", color: Colors.provider.anthropic },
    { key: "google", label: "Google", color: Colors.provider.google },
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
        {/* Search */}
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search keys…"
            placeholderTextColor={Colors.text.muted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Provider filter */}
        <View style={styles.filterRow}>
          {PROVIDERS.map((p) => (
            <TouchableOpacity
              key={p.key}
              onPress={() => setProviderFilter(p.key)}
              style={[
                styles.filterChip,
                providerFilter === p.key && {
                  borderColor: p.color,
                  backgroundColor: p.color + "20",
                },
              ]}
            >
              <Text style={[styles.filterText, { color: p.color }]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {isError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>
              {error instanceof Error ? error.message : "Failed to load keys"}
            </Text>
          </View>
        )}

        {newKeys.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>New Keys</Text>
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>{newKeys.length}</Text>
              </View>
            </View>
            {newKeys.map((k) => (
              <KeyRow key={k.id} apiKey={k} />
            ))}
          </View>
        )}

        {existingKeys.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {newKeys.length > 0 ? "Existing Keys" : "All Keys"}{" "}
              <Text style={styles.count}>({existingKeys.length})</Text>
            </Text>
            {existingKeys.map((k) => (
              <KeyRow key={k.id} apiKey={k} />
            ))}
          </View>
        )}

        {!isLoading && filtered.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🔑</Text>
            <Text style={styles.emptyTitle}>No Keys Found</Text>
            <Text style={styles.emptyBody}>
              {search ? "Try a different search term." : "No API keys available."}
            </Text>
          </View>
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
    paddingBottom: 32,
    gap: 12,
  },
  searchRow: {
    flexDirection: "row",
  },
  searchInput: {
    flex: 1,
    backgroundColor: Colors.bg.secondary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: Colors.text.primary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.bg.border,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  filterChip: {
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
  section: {
    gap: 4,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    color: Colors.text.secondary,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  count: {
    color: Colors.text.muted,
    fontWeight: "400",
    textTransform: "none",
    letterSpacing: 0,
  },
  newBadge: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  newBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
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
