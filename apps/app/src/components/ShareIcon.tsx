import Ionicons from "@expo/vector-icons/Ionicons";

export default function ShareIcon({ size = 20, color }: { size?: number; color: string }) {
  return <Ionicons name="arrow-redo-outline" size={size} color={color} />;
}
