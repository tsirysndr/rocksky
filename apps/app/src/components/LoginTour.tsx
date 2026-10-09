import Feather from "@expo/vector-icons/Feather";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect } from "react-native-svg";
import { colors } from "@/src/theme";
import { Text } from "./Text";

const slides = [
  {
    label: "YOUR LISTENING STORY",
    title: "Every listen tells a story",
    description:
      "Track your listening and explore the artists, albums, and songs you return to most.",
  },
  {
    label: "YOUR MUSIC, TOGETHER",
    title: "Make room for your music",
    description:
      "Play your own music, build playlists, and connect the music services you love.",
  },
  {
    label: "BETTER WITH FRIENDS",
    title: "Find your kind of music people",
    description:
      "Follow friends, discover what they’re listening to, and share your favorites.",
  },
  {
    label: "FROM HEADPHONES TO LIVE",
    title: "Be there for the next show",
    description:
      "Explore upcoming concerts from your favorite artists. Mark yourself going or interested.",
  },
];

// Flat, opaque palettes keep the illustrations legible independently of the app theme.
const palettes = [
  {
    background: "#F4EBDD",
    ink: "#233E38",
    card: "#FFFBF3",
    raised: "#E0E8D9",
    accent: "#D95232",
    secondary: "#50755C",
    highlight: "#DCA83D",
    muted: "#839484",
    border: "#C2CEB9",
  },
  {
    background: "#DEEBF5",
    ink: "#203A58",
    card: "#F7FBFF",
    raised: "#C7DCF0",
    accent: "#275EC7",
    secondary: "#507EB8",
    highlight: "#F4BA55",
    muted: "#829DB8",
    border: "#AEC5DE",
  },
  {
    background: "#E1EEDC",
    ink: "#26473D",
    card: "#FAFBEF",
    raised: "#CBDDC4",
    accent: "#B94732",
    secondary: "#467365",
    highlight: "#EAC363",
    muted: "#829B7C",
    border: "#B1C9AB",
  },
  {
    background: "#F7E2D9",
    ink: "#542F36",
    card: "#FFF7EA",
    raised: "#EACBC4",
    accent: "#B73E51",
    secondary: "#9B666C",
    highlight: "#E4AA43",
    muted: "#B18C89",
    border: "#D5AAA5",
  },
];
function Illustration({ page }: { page: number }) {
  const paint = palettes[page];
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.illustration, { backgroundColor: paint.background }]}
    >
      <Svg width="100%" height="100%" viewBox="0 0 320 180">
        <Circle cx={160} cy={90} r={78} fill={paint.secondary} opacity={0.1} />
        <Circle
          cx={160}
          cy={90}
          r={63}
          fill="none"
          stroke={paint.secondary}
          strokeOpacity={0.25}
        />
        <Circle cx={44} cy={54} r={4} fill={paint.accent} />
        <Circle cx={279} cy={131} r={3} fill={paint.highlight} />
        <Path
          d="M270 32v12m-6-6h12M42 133v10m-5-5h10"
          stroke={paint.accent}
          strokeWidth={2}
          strokeLinecap="round"
        />
        {page === 0 && (
          <>
            <G rotation={-8} origin="112,88">
              <Rect
                x={56}
                y={25}
                width={116}
                height={128}
                rx={14}
                fill={paint.card}
                stroke={paint.border}
              />
              <Circle cx={114} cy={77} r={34} fill={paint.secondary} />
              <Circle
                cx={114}
                cy={77}
                r={23}
                fill="none"
                stroke={paint.ink}
                strokeOpacity={0.22}
              />
              <Circle cx={114} cy={77} r={12} fill={paint.ink} />
              <Circle cx={114} cy={77} r={4} fill={paint.accent} />
              <Rect
                x={73}
                y={122}
                width={63}
                height={5}
                rx={2.5}
                fill={paint.ink}
              />
              <Rect
                x={73}
                y={133}
                width={42}
                height={4}
                rx={2}
                fill={paint.muted}
              />
            </G>
            <Rect
              x={157}
              y={64}
              width={113}
              height={97}
              rx={12}
              fill={paint.raised}
              stroke={paint.secondary}
              strokeOpacity={0.4}
            />
            <Path
              d="M174 86h35"
              stroke={paint.ink}
              strokeWidth={5}
              strokeLinecap="round"
            />
            {[20, 33, 26, 46, 38, 56].map((height, index) => (
              <Rect
                key={height}
                x={174 + index * 13}
                y={145 - height}
                width={8}
                height={height}
                rx={3}
                fill={height === 56 ? paint.highlight : paint.accent}
              />
            ))}
            <Circle cx={235} cy={40} r={18} fill={paint.accent} />
            <Path
              d="m227 40 6 6 11-12"
              stroke="white"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </>
        )}
        {page === 1 && (
          <>
            <G rotation={-12} origin="104,92">
              <Rect
                x={55}
                y={39}
                width={94}
                height={112}
                rx={12}
                fill={paint.secondary}
              />
              <Path
                d="M55 125 96 55l53 96H55"
                fill={paint.accent}
                opacity={0.75}
              />
              <Circle cx={119} cy={64} r={14} fill={paint.highlight} />
            </G>
            <G rotation={9} origin="214,91">
              <Rect
                x={174}
                y={32}
                width={85}
                height={112}
                rx={12}
                fill={paint.raised}
                stroke={paint.border}
              />
              <Circle cx={215} cy={80} r={28} fill={paint.accent} />
              <Circle cx={215} cy={80} r={12} fill={paint.raised} />
              <Path
                d="M190 121h43"
                stroke={paint.ink}
                strokeWidth={4}
                strokeLinecap="round"
              />
            </G>
            <Rect
              x={111}
              y={21}
              width={98}
              height={143}
              rx={15}
              fill={paint.card}
              stroke={paint.secondary}
            />
            <Rect
              x={124}
              y={34}
              width={72}
              height={71}
              rx={8}
              fill={paint.secondary}
            />
            <Path
              d="M133 84V61m9 34V47m9 44V57m9 38V43m9 44V54m9 28V61m9 18V67"
              stroke={paint.ink}
              strokeWidth={4}
              strokeLinecap="round"
            />
            <Path
              d="M125 118h70"
              stroke={paint.border}
              strokeWidth={3}
              strokeLinecap="round"
            />
            <Path
              d="M125 118h40"
              stroke={paint.accent}
              strokeWidth={3}
              strokeLinecap="round"
            />
            <Circle cx={160} cy={140} r={14} fill={paint.accent} />
            <Path d="m157 134 8 6-8 6Z" fill="white" />
            <Path
              d="m132 137-5 3 5 3m55-6 5 3-5 3"
              stroke={paint.ink}
              strokeWidth={2}
              fill="none"
            />
          </>
        )}
        {page === 2 && (
          <>
            <Path
              d="m90 57 66 40 79-41M90 57l-9 74 75-34 83 41-4-82"
              stroke={paint.secondary}
              strokeWidth={2}
              strokeDasharray="5 6"
              fill="none"
            />
            {[
              { x: 83, y: 48, color: paint.secondary },
              { x: 239, y: 52, color: paint.accent },
              { x: 79, y: 135, color: paint.accent },
              { x: 244, y: 135, color: paint.secondary },
            ].map(({ x, y, color }) => (
              <G key={x}>
                <Circle
                  cx={x}
                  cy={y}
                  r={25}
                  fill={paint.card}
                  stroke={color}
                  strokeWidth={2}
                />
                <Circle cx={x} cy={y - 6} r={8} fill={color} />
                <Path
                  d={`M${x - 14} ${y + 15}q0-17 14-17t14 17`}
                  fill={color}
                />
              </G>
            ))}
            <Rect
              x={119}
              y={52}
              width={83}
              height={88}
              rx={18}
              fill={paint.raised}
              stroke={paint.secondary}
            />
            <Path
              d="M139 99V79l40-7v20m-40-9 40-7"
              stroke={paint.ink}
              strokeWidth={3}
              strokeLinejoin="round"
              fill="none"
            />
            <Circle cx={133} cy={100} r={7} fill={paint.ink} />
            <Circle cx={173} cy={94} r={7} fill={paint.ink} />
            <Path
              d="M148 114c-8-10-19 4 0 15 19-11 8-25 0-15"
              fill={paint.accent}
            />
            <Rect
              x={183}
              y={24}
              width={35}
              height={25}
              rx={8}
              fill={paint.highlight}
            />
            <Path d="m188 47-1 9 11-8" fill={paint.highlight} />
            <Circle cx={194} cy={36} r={2} fill={paint.ink} />
            <Circle cx={207} cy={36} r={2} fill={paint.ink} />
          </>
        )}
        {page === 3 && (
          <>
            <Path
              d="m123 23-53 124h106Zm78 0-40 124h101Z"
              fill={paint.secondary}
              opacity={0.2}
            />
            <G rotation={-8} origin="146,90">
              <Rect
                x={76}
                y={39}
                width={149}
                height={106}
                rx={12}
                fill={paint.card}
                stroke={paint.secondary}
              />
              <Path d="M77 70h147" stroke={paint.secondary} />
              <Path
                d="M104 31v17m92-17v17"
                stroke={paint.accent}
                strokeWidth={6}
                strokeLinecap="round"
              />
              {[96, 123, 150, 177, 204].map((x) => (
                <G key={x}>
                  <Rect
                    x={x - 5}
                    y={84}
                    width={10}
                    height={10}
                    rx={3}
                    fill={paint.muted}
                    opacity={0.5}
                  />
                  <Rect
                    x={x - 5}
                    y={110}
                    width={10}
                    height={10}
                    rx={3}
                    fill={paint.muted}
                    opacity={0.5}
                  />
                </G>
              ))}
              <Rect
                x={138}
                y={103}
                width={25}
                height={25}
                rx={6}
                fill={paint.accent}
              />
              <Path
                d="m144 115 4 4 8-9"
                stroke="white"
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
              />
            </G>
            <G rotation={12} origin="234,113">
              <Rect
                x={199}
                y={71}
                width={58}
                height={86}
                rx={8}
                fill={paint.accent}
              />
              <Line
                x1={203}
                y1={133}
                x2={253}
                y2={133}
                stroke="white"
                strokeOpacity={0.6}
                strokeDasharray="3 4"
              />
              <Path
                d="m227 84 4 8 9 1-7 7 2 9-8-5-8 5 2-9-7-7 9-1Z"
                fill="white"
              />
              <Path
                d="M216 144h24"
                stroke="white"
                strokeWidth={3}
                strokeLinecap="round"
              />
            </G>
          </>
        )}
      </Svg>
    </View>
  );
}

export default function LoginTour() {
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const currentPage = useRef(0);

  // Preserve the selected slide when rotating or resizing the screen.
  useEffect(() => {
    if (width)
      scroll.current?.scrollTo({
        x: currentPage.current * width,
        animated: false,
      });
  }, [width]);

  const goTo = (index: number) => {
    currentPage.current = index;
    setPage(index);
    scroll.current?.scrollTo({ x: index * width, animated: false });
  };

  return (
    <View
      style={styles.container}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width > 0 && (
        <ScrollView
          ref={scroll}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          directionalLockEnabled
          onMomentumScrollEnd={(event) => {
            const index = Math.max(
              0,
              Math.min(
                slides.length - 1,
                Math.round(event.nativeEvent.contentOffset.x / width),
              ),
            );
            currentPage.current = index;
            setPage(index);
          }}
        >
          {slides.map((slide, index) => (
            <View
              key={slide.label}
              style={{ width, paddingHorizontal: 4 }}
              accessibilityElementsHidden={index !== page}
              importantForAccessibility={
                index === page ? "auto" : "no-hide-descendants"
              }
            >
              <Illustration page={index} />
              <Text style={styles.eyebrow}>{slide.label}</Text>
              <Text accessibilityRole="header" style={styles.title}>
                {slide.title}
              </Text>
              <Text style={styles.description}>{slide.description}</Text>
            </View>
          ))}
        </ScrollView>
      )}
      <View style={styles.navigation}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Previous feature"
          accessibilityState={{ disabled: page === 0 }}
          disabled={page === 0}
          onPress={() => goTo(page - 1)}
          style={[styles.arrow, { opacity: page === 0 ? 0.25 : 1 }]}
        >
          <Feather name="chevron-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.dots}>
          {slides.map((slide, index) => (
            <TouchableOpacity
              key={slide.label}
              accessibilityRole="button"
              accessibilityLabel={`Feature ${index + 1} of ${slides.length}: ${slide.title}`}
              accessibilityState={{ selected: index === page }}
              onPress={() => goTo(index)}
              style={styles.dotTarget}
            >
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      index === page ? colors.primary : colors.textMuted,
                    width: index === page ? 20 : 6,
                  },
                ]}
              />
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Next feature"
          accessibilityState={{ disabled: page === slides.length - 1 }}
          disabled={page === slides.length - 1}
          onPress={() => goTo(page + 1)}
          style={[
            styles.arrow,
            { opacity: page === slides.length - 1 ? 0.25 : 1 },
          ]}
        >
          <Feather name="chevron-right" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 20 },
  illustration: {
    height: 180,
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 8,
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    textAlign: "center",
    marginTop: 8,
  },
  title: {
    color: colors.text,
    fontSize: 23,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 8,
  },
  description: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    maxWidth: 340,
    alignSelf: "center",
  },
  navigation: {
    width: "100%",
    maxWidth: 264,
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  arrow: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  dots: { flex: 1, flexDirection: "row", alignItems: "center" },
  dotTarget: {
    flex: 1,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: { height: 6, borderRadius: 3 },
});
