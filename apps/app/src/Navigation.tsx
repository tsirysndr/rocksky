import Feather from "@expo/vector-icons/Feather";
import MaterialIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  BottomTabBar,
  type BottomTabBarProps,
  createBottomTabNavigator,
} from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { ComponentType } from "react";
import { View } from "react-native";
import MiniPlayer from "./components/MiniPlayer";
import { useUnreadCountQuery } from "./hooks/useNotifications";
import AlbumDetails from "./screens/AlbumDetails";
import ArtistDetails from "./screens/ArtistDetails";
import Charts from "./screens/Charts";
import Home from "./screens/Home";
import Notifications from "./screens/Notifications";
import Profile from "./screens/Profile";
import Search from "./screens/Search";
import ShoutEditor from "./screens/ShoutEditor";
import SongDetails from "./screens/SongDetails";
import Story from "./screens/Story";
import { colors } from "./theme";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const screenOptions = {
  contentStyle: { backgroundColor: colors.background },
  headerShown: false,
  animation: "default",
} as const;

// Each tab hosts its own stack so detail pages keep the tab bar + mini player.
// biome-ignore lint/suspicious/noExplicitAny: react-navigation screens have heterogeneous prop types
function makeTabStack(name: string, RootScreen: ComponentType<any>) {
  const TabStack = createNativeStackNavigator();
  return function TabStackScreen() {
    return (
      <TabStack.Navigator screenOptions={screenOptions}>
        <TabStack.Screen name={name} component={RootScreen} />
        <TabStack.Screen name="AlbumDetails" component={AlbumDetails} />
        <TabStack.Screen name="ArtistDetails" component={ArtistDetails} />
        <TabStack.Screen name="SongDetails" component={SongDetails} />
        <TabStack.Screen name="UserProfile" component={Profile} />
        <TabStack.Screen name="Story" component={Story} />
        <TabStack.Screen name="ShoutEditor" component={ShoutEditor} />
      </TabStack.Navigator>
    );
  };
}

const HomeStackScreen = makeTabStack("Home", Home);
const AlertsStackScreen = makeTabStack("Notifications", Notifications);
const ChartsStackScreen = makeTabStack("Charts", Charts);
const SearchStackScreen = makeTabStack("Search", Search);
const ProfileStackScreen = makeTabStack("Profile", Profile);

function CustomTabBar(props: BottomTabBarProps) {
  return (
    <View style={{ backgroundColor: colors.surface }}>
      <MiniPlayer
        onPressTrack={(uri) =>
          props.navigation.navigate("HomeTab", {
            screen: "SongDetails",
            params: { uri },
          })
        }
      />
      <BottomTabBar {...props} />
    </View>
  );
}

function HomeTabs() {
  const { data: unread } = useUnreadCountQuery();
  const unreadCount = unread?.count ?? 0;

  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 0,
          height: 80,
          paddingTop: 0,
        },
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "500",
          marginBottom: 4,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarBadgeStyle: {
          backgroundColor: "#e0245e",
          color: "#fff",
          fontSize: 10,
          fontWeight: "700",
        },
        tabBarIcon: ({ color }) => {
          switch (route.name) {
            case "HomeTab":
              return (
                <MaterialIcons
                  name="home-variant-outline"
                  size={24}
                  color={color}
                />
              );
            case "AlertsTab":
              return (
                <MaterialIcons name="bell-outline" size={24} color={color} />
              );
            case "ChartsTab":
              return <MaterialIcons name="chart-bar" size={24} color={color} />;
            case "SearchTab":
              return <Feather name="search" size={22} color={color} />;
            case "ProfileTab":
              return (
                <MaterialIcons name="account-outline" size={24} color={color} />
              );
          }
        },
      })}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStackScreen}
        options={{ tabBarLabel: "Home" }}
      />
      <Tab.Screen
        name="AlertsTab"
        component={AlertsStackScreen}
        options={{
          tabBarLabel: "Alerts",
          tabBarBadge:
            unreadCount > 0
              ? unreadCount > 99
                ? "99+"
                : unreadCount
              : undefined,
        }}
      />
      <Tab.Screen
        name="ChartsTab"
        component={ChartsStackScreen}
        options={{ tabBarLabel: "Charts" }}
      />
      <Tab.Screen
        name="SearchTab"
        component={SearchStackScreen}
        options={{ tabBarLabel: "Search" }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStackScreen}
        options={{ tabBarLabel: "Profile" }}
      />
    </Tab.Navigator>
  );
}

export function RootStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        contentStyle: { backgroundColor: colors.background },
        headerShown: false,
      }}
    >
      <Stack.Screen name="HomeTabs" component={HomeTabs} />
    </Stack.Navigator>
  );
}

export type RootStackParamList = {
  Home: undefined;
  HomeTabs: undefined;
  Charts: undefined;
  Notifications: undefined;
  AlbumDetails: { uri: string };
  ArtistDetails: { uri: string };
  SongDetails: { uri: string };
  Profile: { did?: string };
  UserProfile: { did?: string; handle?: string };
  Story: { index: number };
  Search: undefined;
  ShoutEditor: {
    uri: string;
    type: "song" | "album" | "artist" | "profile" | "scrobble";
    title?: string;
  };
};
