import dayjs from "dayjs";
import { useId, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { Text } from "../../components/Text";
import { colors } from "../../theme";
import type { Point } from "./data";

export const palette = ["#fb3d80", "#24bfd3", "#a77aff", "#f0b852"];
const muted = "#b4a4c5";
export function Trend({ points, unit }: { points: Point[]; unit: string }) {
  const [width, setWidth] = useState(300);
  const [index, setIndex] = useState<number | null>(null);
  const id = useId().replace(/:/g, "");
  const h = 170,
    left = 36,
    right = 12,
    top = 14;
  const max = Math.max(1, ...points.map((p) => p.count));
  const x = (i: number) =>
    left +
    (points.length === 1 ? 0.5 : i / (points.length - 1)) *
      (width - left - right);
  const y = (count: number) => top + (1 - count / max) * (h - top);
  const line = points
    .map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.count)}`)
    .join(" ");
  const activeIndex = Math.max(
    0,
    Math.min(index ?? points.length - 1, points.length - 1),
  );
  const active = points[activeIndex];
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.readout}>
        <Text style={styles.value}>
          {active?.count.toLocaleString() ?? 0}{" "}
          <Text style={styles.small}>scrobbles</Text>
        </Text>
        <Text style={styles.small}>{active?.label ?? "No listens"}</Text>
      </View>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`${unit} listening trend. ${active?.label}: ${active?.count ?? 0} scrobbles.`}
        accessibilityActions={[
          { name: "increment", label: "Next period" },
          { name: "decrement", label: "Previous period" },
        ]}
        onAccessibilityAction={(e) =>
          setIndex(
            Math.max(
              0,
              Math.min(
                points.length - 1,
                activeIndex +
                  (e.nativeEvent.actionName === "increment" ? 1 : -1),
              ),
            ),
          )
        }
        onTouchEnd={(e) =>
          setIndex(
            Math.round(
              Math.max(
                0,
                Math.min(
                  1,
                  (e.nativeEvent.locationX - left) / (width - left - right),
                ),
              ) *
                (points.length - 1),
            ),
          )
        }
      >
        <Svg width={width} height={206}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={palette[0]} stopOpacity={0.42} />
              <Stop offset="1" stopColor={palette[0]} stopOpacity={0.01} />
            </LinearGradient>
          </Defs>
          {[0, 0.5, 1].map((f) => (
            <Line
              key={f}
              x1={left}
              y1={y(max * f)}
              x2={width - right}
              y2={y(max * f)}
              stroke="#ffffff12"
              strokeDasharray="3 5"
            />
          ))}
          {[0, 0.5, 1].map((f) => (
            <SvgText
              key={f}
              x={left - 8}
              y={y(max * f) + 4}
              fill={muted}
              fontSize={10}
              textAnchor="end"
            >
              {Math.round(max * f).toLocaleString()}
            </SvgText>
          ))}
          {points.length > 0 && (
            <>
              <Path
                d={`${line} L${x(points.length - 1)},${h} L${x(0)},${h} Z`}
                fill={`url(#${id})`}
              />
              <Path
                d={line}
                stroke={palette[0]}
                strokeWidth={2.5}
                strokeLinejoin="round"
                fill="none"
              />
            </>
          )}
          {active && (
            <>
              <Line
                x1={x(activeIndex)}
                y1={top}
                x2={x(activeIndex)}
                y2={h}
                stroke={palette[0]}
                strokeOpacity={0.4}
                strokeDasharray="3 4"
              />
              <Circle
                cx={x(activeIndex)}
                cy={y(active.count)}
                r={5}
                fill={palette[0]}
                stroke={colors.surface}
                strokeWidth={2}
              />
            </>
          )}
          {[0, Math.floor((points.length - 1) / 2), points.length - 1]
            .filter((i, n, a) => i >= 0 && a.indexOf(i) === n)
            .map((i) => (
              <SvgText
                key={i}
                x={x(i)}
                y={195}
                fill={muted}
                fontSize={10}
                textAnchor={
                  i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"
                }
              >
                {dayjs(points[i].key).format("D MMM")}
              </SvgText>
            ))}
        </Svg>
      </View>
      <Text style={styles.hint}>
        Tap the chart to explore · {unit.toLowerCase()} totals
      </Text>
    </View>
  );
}

export function Bars({
  points,
  color = palette[1],
}: {
  points: Point[];
  color?: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const max = Math.max(1, ...points.map((p) => p.count));
  const active = points.find((p) => p.key === selected);
  return (
    <View>
      <Text style={styles.hint}>
        {active
          ? `${active.label} · ${active.count.toLocaleString()} scrobbles`
          : "Tap a bar for its play count"}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingTop: 16 }}
      >
        {points.map((p) => (
          <Pressable
            key={p.key}
            accessibilityRole="button"
            accessibilityLabel={`${p.label}: ${p.count} scrobbles`}
            onPress={() => setSelected(p.key)}
            style={{
              flex: 1,
              minWidth: 35,
              alignItems: "center",
              paddingHorizontal: 4,
            }}
          >
            <Text style={{ color: muted, fontSize: 9, height: 18 }}>
              {p.count > 999 ? `${(p.count / 1000).toFixed(1)}k` : p.count}
            </Text>
            <View
              style={{
                height: 110,
                justifyContent: "flex-end",
                width: "100%",
                maxWidth: 38,
              }}
            >
              <View
                style={{
                  height: p.count ? Math.max(3, (110 * p.count) / max) : 0,
                  borderTopLeftRadius: 6,
                  borderTopRightRadius: 6,
                  backgroundColor: color,
                  opacity: selected && selected !== p.key ? 0.35 : 0.9,
                }}
              />
            </View>
            <Text style={{ color: muted, fontSize: 10, marginTop: 9 }}>
              {p.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export function ListeningCalendar({ points }: { points: Point[] }) {
  const [selected, setSelected] = useState<Point | null>(null);
  const shown = points.slice(-364);
  const max = Math.max(1, ...shown.map((p) => p.count));
  const padding = shown.length ? (dayjs(shown[0].key).day() + 6) % 7 : 0;
  const cells: (Point | null)[] = [
    ...Array.from({ length: padding }, () => null),
    ...shown,
  ];
  const weeks = Array.from({ length: Math.ceil(cells.length / 7) }, (_, i) =>
    cells.slice(i * 7, i * 7 + 7),
  );
  const shades = ["#2a1a40", "#702046", "#ab285d", "#dd3273", "#ff5c98"];
  return (
    <View>
      <Text style={styles.hint}>
        {selected
          ? `${selected.label} · ${selected.count} scrobbles`
          : `Your last ${shown.length} days in this range · tap a day`}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 4, paddingVertical: 14 }}
      >
        {weeks.map((week, weekIndex) => (
          <View
            key={week.find(Boolean)?.key ?? `pad-${weekIndex}`}
            style={{ gap: 4 }}
          >
            {week.map((p, dayIndex) => (
              <Pressable
                key={p?.key ?? `pad-${dayIndex}`}
                disabled={!p}
                accessibilityRole="button"
                accessibilityLabel={
                  p ? `${p.label}: ${p.count} scrobbles` : undefined
                }
                onPress={() => setSelected(p)}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  backgroundColor: p
                    ? shades[
                        p.count
                          ? Math.max(1, Math.ceil((4 * p.count) / max))
                          : 0
                      ]
                    : "transparent",
                  borderWidth: selected?.key === p?.key && p ? 1 : 0,
                  borderColor: "white",
                }}
              />
            ))}
          </View>
        ))}
      </ScrollView>
      <View
        style={{
          flexDirection: "row",
          gap: 4,
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        <Text style={styles.small}>Less </Text>
        {shades.map((color) => (
          <View
            key={color}
            style={{
              width: 12,
              height: 12,
              borderRadius: 3,
              backgroundColor: color,
            }}
          />
        ))}
        <Text style={styles.small}> More</Text>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  readout: { gap: 4, paddingBottom: 12 },
  value: { fontSize: 24, fontWeight: "700", fontVariant: ["tabular-nums"] },
  small: { color: muted, fontSize: 11, fontWeight: "400" },
  hint: { color: muted, fontSize: 11, marginTop: 8 },
});
