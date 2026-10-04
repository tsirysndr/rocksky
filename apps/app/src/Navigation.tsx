import Feather from "@expo/vector-icons/Feather";
import MaterialIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  BottomTabBar,
  type BottomTabBarProps,
  createBottomTabNavigator,
} from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAtomValue } from "jotai";
import type { ComponentType } from "react";
import { View } from "react-native";
import { profileAtom } from "./atoms/profile";
import Bell from "./components/Icons/Bell";
import LibraryIcon from "./components/Icons/Library";
import MiniPlayer from "./components/MiniPlayer";
import UserAvatar from "./components/UserAvatar";
import { useUnreadCountQuery } from "./hooks/useNotifications";
import AlbumDetails from "./screens/AlbumDetails";
import ArtistDetails from "./screens/ArtistDetails";
import Charts from "./screens/Charts";
import Home from "./screens/Home";
import Library from "./screens/Library";
import Notifications from "./screens/Notifications";
import Player from "./screens/Player";
import Profile from "./screens/Profile";
import Search from "./screens/Search";
import ShoutEditor from "./screens/ShoutEditor";
import SignInScreen from "./screens/SignIn";
import SongDetails from "./screens/SongDetails";
import Story from "./screens/Story";
import { storage } from "./storage";
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
        <TabStack.Screen name="ShoutEditor" component={ShoutEditor} />
        <TabStack.Screen name="Charts" component={Charts} />
      </TabStack.Navigator>
    );
  };
}

const HomeStackScreen = makeTabStack("Home", Home);
const AlertsStackScreen = makeTabStack("Notifications", Notifications);
const LibraryStackScreen = makeTabStack("Library", Library);
const SearchStackScreen = makeTabStack("Search", Search);
const ProfileStackScreen = makeTabStack("Profile", Profile);

function CustomTabBar(props: BottomTabBarProps) {
  return (
    <View style={{ backgroundColor: colors.surface }}>
      <MiniPlayer
        onOpenPlayer={() =>
          props.navigation.getParent()?.navigate("Player" as never)
        }
      />
      <BottomTabBar {...props} />
    </View>
  );
}

function HomeTabs() {
  const { data: unread } = useUnreadCountQuery();
  const unreadCount = unread?.count ?? 0;
  const profile = useAtomValue(profileAtom);
  // Signed-in users get their avatar as the Profile tab icon, when usable.
  const tabAvatar =
    storage.getDid() && profile?.avatar && !profile.avatar.endsWith("/@jpeg")
      ? profile.avatar
      : undefined;

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
        tabBarShowLabel: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarBadgeStyle: {
          backgroundColor: "#e0245e",
          color: "#fff",
          fontSize: 10,
          fontWeight: "700",
        },
        tabBarIcon: ({ color, focused }) => {
          switch (route.name) {
            case "HomeTab":
              return (
                <MaterialIcons
                  name="home-variant-outline"
                  size={28}
                  color={color}
                />
              );
            case "AlertsTab":
              return <Bell size={28} color={color} />;
            case "LibraryTab":
              return <LibraryIcon size={28} color={color} />;
            case "SearchTab":
              return <Feather name="search" size={26} color={color} />;
            case "ProfileTab":
              if (tabAvatar) {
                return (
                  <View
                    style={{
                      borderRadius: 16,
                      borderWidth: 1.5,
                      borderColor: focused ? colors.primary : "transparent",
                      padding: 1,
                    }}
                  >
                    <UserAvatar uri={tabAvatar} size={28} />
                  </View>
                );
              }
              return (
                <MaterialIcons name="account-outline" size={28} color={color} />
              );
          }
        },
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeStackScreen} />
      <Tab.Screen
        name="AlertsTab"
        component={AlertsStackScreen}
        options={{
          tabBarBadge:
            unreadCount > 0
              ? unreadCount > 99
                ? "99+"
                : unreadCount
              : undefined,
        }}
      />
      <Tab.Screen name="LibraryTab" component={LibraryStackScreen} />
      <Tab.Screen name="SearchTab" component={SearchStackScreen} />
      <Tab.Screen name="ProfileTab" component={ProfileStackScreen} />
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
      <Stack.Screen
        name="Player"
        component={Player}
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="Story"
        component={Story}
        options={{ presentation: "fullScreenModal", animation: "fade" }}
      />
      <Stack.Screen
        name="SignIn"
        component={SignInScreen}
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
    </Stack.Navigator>
  );
}

export type RootStackParamList = {
  Home: undefined;
  HomeTabs: undefined;
  Player: undefined;
  SignIn: undefined;
  Charts: undefined;
  Library: undefined;
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
