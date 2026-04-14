import React, { useState, useEffect } from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TextInput,
  Switch,
  TouchableOpacity,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { useSettings } from "@/hooks/useSettings";
import {
  enablePushNotifications,
  disablePushNotifications,
  requestPushPermissions,
} from "@/lib/notifications";
import { useQueryClient } from "@tanstack/react-query";
import type { DateRange } from "@/types";

const DATE_RANGES: DateRange[] = ["7d", "14d", "28d"];

export default function SettingsScreen() {
  const { settings, updateSettings } = useSettings();
  const queryClient = useQueryClient();
  const [apiUrl, setApiUrl] = useState(settings.apiBaseUrl);
  const [urlSaved, setUrlSaved] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  useEffect(() => {
    setApiUrl(settings.apiBaseUrl);
  }, [settings.apiBaseUrl]);

  const saveApiUrl = async () => {
    const trimmed = apiUrl.trim().replace(/\/$/, "");
    await updateSettings({ apiBaseUrl: trimmed });
    await queryClient.invalidateQueries();
    setUrlSaved(true);
    setTimeout(() => setUrlSaved(false), 2000);
  };

  const togglePush = async (enabled: boolean) => {
    setPushLoading(true);
    try {
      if (enabled) {
        const hasPermission = await requestPushPermissions();
        if (!hasPermission) {
          Alert.alert(
            "Notifications Disabled",
            "Please enable notifications for this app in your device Settings.",
            [{ text: "OK" }]
          );
          setPushLoading(false);
          return;
        }
        const token = await enablePushNotifications();
        if (!token) {
          Alert.alert("Error", "Could not register for push notifications. Check your API URL.");
          setPushLoading(false);
          return;
        }
        await updateSettings({ pushEnabled: true, pushToken: token });
      } else {
        if (settings.pushToken) {
          await disablePushNotifications(settings.pushToken);
        }
        await updateSettings({ pushEnabled: false, pushToken: null });
      }
    } finally {
      setPushLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

        {/* API URL */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Backend URL</Text>
          <Text style={styles.sectionDesc}>
            Enter your AICostCentral deployment URL (e.g. https://aicostcentral.vercel.app)
          </Text>
          <TextInput
            style={styles.input}
            value={apiUrl}
            onChangeText={setApiUrl}
            placeholder="https://your-app.vercel.app"
            placeholderTextColor={Colors.text.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="done"
            onSubmitEditing={saveApiUrl}
          />
          <TouchableOpacity
            onPress={saveApiUrl}
            style={[styles.saveBtn, urlSaved && styles.saveBtnSuccess]}
          >
            <Text style={styles.saveBtnText}>{urlSaved ? "✓ Saved" : "Save URL"}</Text>
          </TouchableOpacity>
        </View>

        {/* Date range */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Default Date Range</Text>
          <View style={styles.rangeRow}>
            {DATE_RANGES.map((r) => (
              <TouchableOpacity
                key={r}
                onPress={() => updateSettings({ dateRange: r })}
                style={[
                  styles.rangeBtn,
                  settings.dateRange === r && styles.rangeBtnActive,
                ]}
              >
                <Text
                  style={[
                    styles.rangeBtnText,
                    settings.dateRange === r && styles.rangeBtnTextActive,
                  ]}
                >
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Push notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Push Notifications</Text>
          <Text style={styles.sectionDesc}>
            Receive push alerts when anomalies are detected by the daily cron.
          </Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Enable Push Alerts</Text>
            <Switch
              value={settings.pushEnabled}
              onValueChange={togglePush}
              disabled={pushLoading || !settings.apiBaseUrl}
              trackColor={{ false: Colors.bg.border, true: Colors.accent }}
              thumbColor={Platform.OS === "android" ? Colors.text.primary : undefined}
            />
          </View>

          {settings.pushEnabled && (
            <>
              <RowSwitch
                label="Critical Alerts"
                value={settings.notifyOnCritical}
                onChange={(v) => updateSettings({ notifyOnCritical: v })}
              />
              <RowSwitch
                label="Warnings"
                value={settings.notifyOnWarning}
                onChange={(v) => updateSettings({ notifyOnWarning: v })}
              />
              <RowSwitch
                label="Info Alerts"
                value={settings.notifyOnInfo}
                onChange={(v) => updateSettings({ notifyOnInfo: v })}
              />
            </>
          )}

          {settings.pushToken && (
            <Text style={styles.tokenHint}>
              Token: …{settings.pushToken.slice(-12)}
            </Text>
          )}
        </View>

        {/* App info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.about}>
            AI Cost Central v1.0.0{"\n"}
            Monitor OpenAI, Anthropic, and Google AI spending{"\n"}
            across all your API keys.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function RowSwitch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: Colors.bg.border, true: Colors.accent }}
      />
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  label: {
    color: Colors.text.secondary,
    fontSize: 14,
  },
});

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
    paddingBottom: 40,
    gap: 24,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: Colors.text.primary,
    fontSize: 16,
    fontWeight: "600",
  },
  sectionDesc: {
    color: Colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text.primary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.bg.border,
  },
  saveBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  saveBtnSuccess: {
    backgroundColor: Colors.positive,
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  rangeRow: {
    flexDirection: "row",
    gap: 8,
  },
  rangeBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
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
    fontSize: 14,
    fontWeight: "500",
  },
  rangeBtnTextActive: {
    color: "#fff",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLabel: {
    color: Colors.text.primary,
    fontSize: 15,
  },
  tokenHint: {
    color: Colors.text.muted,
    fontSize: 11,
    fontFamily: "monospace",
  },
  about: {
    color: Colors.text.secondary,
    fontSize: 13,
    lineHeight: 20,
  },
});
