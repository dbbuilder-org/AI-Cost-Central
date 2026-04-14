/**
 * Simple 7-day trend sparkline using react-native-svg.
 * No native dependencies beyond react-native-svg (included with Expo).
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Polyline, Line, Text as SvgText, Circle } from "react-native-svg";
import { Colors } from "@/constants/colors";
import type { DaySpend } from "@/types";

interface TrendChartProps {
  data: DaySpend[];
  height?: number;
  color?: string;
}

export function TrendChart({ data, height = 120, color = Colors.accent }: TrendChartProps) {
  if (!data || data.length < 2) {
    return (
      <View style={[styles.container, { height }]}>
        <Text style={styles.empty}>Not enough data</Text>
      </View>
    );
  }

  const chartData = data.slice(-14); // last 14 days
  const width = 340;
  const padX = 8;
  const padY = 16;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  const maxVal = Math.max(...chartData.map((d) => d.costUSD), 0.01);
  const minVal = Math.min(...chartData.map((d) => d.costUSD), 0);

  const xStep = chartW / Math.max(chartData.length - 1, 1);

  const points = chartData.map((d, i) => {
    const x = padX + i * xStep;
    const normalized = (d.costUSD - minVal) / (maxVal - minVal || 1);
    const y = padY + chartH - normalized * chartH;
    return `${x},${y}`;
  });

  const lastPoint = chartData[chartData.length - 1];
  const lastX = padX + (chartData.length - 1) * xStep;
  const lastNorm = (lastPoint.costUSD - minVal) / (maxVal - minVal || 1);
  const lastY = padY + chartH - lastNorm * chartH;

  // Format label
  const formatDate = (d: string) => {
    const dt = new Date(d + "T00:00:00Z");
    return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`;
  };

  const firstLabel = formatDate(chartData[0].date);
  const lastLabel = formatDate(chartData[chartData.length - 1].date);

  return (
    <View style={styles.container}>
      <Svg width={width} height={height + 20}>
        {/* Zero line */}
        <Line
          x1={padX}
          y1={padY + chartH}
          x2={padX + chartW}
          y2={padY + chartH}
          stroke={Colors.bg.border}
          strokeWidth={1}
        />
        {/* Trend line */}
        <Polyline
          points={points.join(" ")}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Latest point dot */}
        <Circle cx={lastX} cy={lastY} r={4} fill={color} />
        {/* Date labels */}
        <SvgText x={padX} y={height + 14} fontSize={10} fill={Colors.text.muted}>
          {firstLabel}
        </SvgText>
        <SvgText
          x={padX + chartW}
          y={height + 14}
          fontSize={10}
          fill={Colors.text.muted}
          textAnchor="end"
        >
          {lastLabel}
        </SvgText>
        {/* Latest value label */}
        <SvgText
          x={lastX}
          y={lastY - 8}
          fontSize={10}
          fill={color}
          textAnchor="middle"
        >
          ${lastPoint.costUSD.toFixed(2)}
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    alignItems: "center",
  },
  empty: {
    color: Colors.text.muted,
    fontSize: 13,
    textAlign: "center",
  },
});
