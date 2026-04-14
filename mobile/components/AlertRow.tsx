import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
} from "react-native";
import { Colors } from "@/constants/colors";
import type { MobileAlert } from "@/types";

interface AlertRowProps {
  alert: MobileAlert;
}

const SEVERITY_COLOR = {
  critical: Colors.severity.critical,
  warning: Colors.severity.warning,
  info: Colors.severity.info,
};

const TYPE_LABEL: Record<string, string> = {
  cost_spike: "Cost Spike",
  cost_drop: "Cost Drop",
  volume_spike: "Volume Spike",
  new_model: "New Model",
  new_key: "New Key",
};

const PROVIDER_COLOR: Record<string, string> = {
  openai: Colors.provider.openai,
  anthropic: Colors.provider.anthropic,
  google: Colors.provider.google,
};

export function AlertRow({ alert }: AlertRowProps) {
  const [expanded, setExpanded] = useState(false);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  const severityColor = SEVERITY_COLOR[alert.severity] ?? Colors.text.secondary;
  const providerColor = PROVIDER_COLOR[alert.provider] ?? Colors.text.muted;

  return (
    <TouchableOpacity onPress={toggle} activeOpacity={0.8} style={styles.row}>
      <View style={styles.header}>
        {/* Severity dot */}
        <View style={[styles.dot, { backgroundColor: severityColor }]} />

        <View style={styles.info}>
          <View style={styles.badges}>
            <View style={[styles.badge, { borderColor: providerColor }]}>
              <Text style={[styles.badgeText, { color: providerColor }]}>
                {alert.provider.toUpperCase().slice(0, 3)}
              </Text>
            </View>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>
                {TYPE_LABEL[alert.type] ?? alert.type}
              </Text>
            </View>
          </View>
          <Text style={styles.message} numberOfLines={expanded ? undefined : 2}>
            {alert.message}
          </Text>
        </View>

        <Text style={styles.chevron}>{expanded ? "▲" : "▼"}</Text>
      </View>

      {expanded && (
        <View style={styles.detail}>
          {alert.detail ? (
            <Text style={styles.detailText}>{alert.detail}</Text>
          ) : null}
          {alert.investigateSteps && alert.investigateSteps.length > 0 && (
            <View style={styles.steps}>
              <Text style={styles.stepsLabel}>Investigate:</Text>
              {alert.investigateSteps.map((step, i) => (
                <Text key={i} style={styles.step}>
                  {i + 1}. {step}
                </Text>
              ))}
            </View>
          )}
          <Text style={styles.timestamp}>
            {new Date(alert.detectedAt).toLocaleString()}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: Colors.bg.card,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.bg.border,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
    flexShrink: 0,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  badges: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  badge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  typeBadge: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  typeBadgeText: {
    fontSize: 10,
    color: Colors.text.secondary,
  },
  message: {
    color: Colors.text.primary,
    fontSize: 13,
    lineHeight: 18,
  },
  chevron: {
    color: Colors.text.muted,
    fontSize: 10,
    marginTop: 4,
    flexShrink: 0,
  },
  detail: {
    padding: 12,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: Colors.bg.border,
    gap: 8,
  },
  detailText: {
    color: Colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
  },
  steps: {
    gap: 4,
  },
  stepsLabel: {
    color: Colors.text.muted,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  step: {
    color: Colors.text.secondary,
    fontSize: 12,
    lineHeight: 17,
  },
  timestamp: {
    color: Colors.text.muted,
    fontSize: 11,
    marginTop: 4,
  },
});
