import Feather from "@expo/vector-icons/Feather";
import MaterialIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { BottomTabBar, createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View } from "react-native";
import { colors } from "./theme";
import MiniPlayer from "./components/MiniPlayer";
import AlbumDetails from "./screens/AlbumDetails";
import ArtistDetails from "./screens/ArtistDetails";
import Charts from "./screens/Charts";
import Home from "./screens/Home";
import Profile from "./screens/Profile";
import Search from "./screens/Search";
import SongDetails from "./screens/SongDetails";
import Story from "./screens/Story";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const HomeStack = createNativeStackNavigator();
const ChartsStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();
const SearchStack = createNativeStackNavigator();

function HomeStackScreen() {
  return (
    <HomeStack.Navigator
      screenOptions={{
        contentStyle: { backgroundColor: colors.background },
        headerShown: false,
        animation: "default",
      }}
    >
      <HomeStack.Screen name="Home" component={Home} />
      <HomeStack.Screen name="AlbumDetails" component={AlbumDetails} />
      <HomeStack.Screen name="ArtistDetails" component={ArtistDetails} />
      <HomeStack.Screen name="SongDetails" component={SongDetails} />
      <HomeStack.Screen name="UserProfile" component={Profile} />
      <HomeStack.Screen name="Story" component={Story} />
    </HomeStack.Navigator>
  );
}

function ChartsStackScreen() {
  return (
    <ChartsStack.Navigator
      screenOptions={{
        contentStyle: { backgroundColor: colors.background },
        headerShown: false,
        animation: "default",
      }}
    >
      <ChartsStack.Screen name="Charts" component={Charts} />
      <ChartsStack.Screen name="AlbumDetails" component={AlbumDetails} />
      <ChartsStack.Screen name="ArtistDetails" component={ArtistDetails} />
      <ChartsStack.Screen name="SongDetails" component={SongDetails} />
      <ChartsStack.Screen name="UserProfile" component={Profile} />
    </ChartsStack.Navigator>
  );
}

function ProfileStackScreen() {
  return (
    <ProfileStack.Navigator
      screenOptions={{
        contentStyle: { backgroundColor: colors.background },
        headerShown: false,
        animation: "default",
      }}
    >
      <ProfileStack.Screen name="Profile" component={Profile} />
      <ProfileStack.Screen name="AlbumDetails" component={AlbumDetails} />
      <ProfileStack.Screen name="ArtistDetails" component={ArtistDetails} />
      <ProfileStack.Screen name="SongDetails" component={SongDetails} />
      <ProfileStack.Screen name="UserProfile" component={Profile} />
    </ProfileStack.Navigator>
  );
}

function SearchStackScreen() {
  return (
    <SearchStack.Navigator
      screenOptions={{
        contentStyle: { backgroundColor: colors.background },
        headerShown: false,
        animation: "default",
      }}
    >
      <SearchStack.Screen name="Search" component={Search} />
      <SearchStack.Screen name="AlbumDetails" component={AlbumDetails} />
      <SearchStack.Screen name="ArtistDetails" component={ArtistDetails} />
      <SearchStack.Screen name="SongDetails" component={SongDetails} />
      <SearchStack.Screen name="UserProfile" component={Profile} />
    </SearchStack.Navigator>
  );
}

function CustomTabBar(props: any) {
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
        tabBarIcon: ({ focused, color }) => {
          switch (route.name) {
            case "HomeTab":
              return <MaterialIcons name="home-variant-outline" size={24} color={color} />;
            case "ChartsTab":
              return <MaterialIcons name="chart-bar" size={24} color={color} />;
            case "SearchTab":
              return <Feather name="search" size={22} color={color} />;
            case "ProfileTab":
              return <MaterialIcons name="account-outline" size={24} color={color} />;
          }
        },
        tabBarLabel: ({ color }) => {
          const labels: Record<string, string> = {
            HomeTab: "Home",
            ChartsTab: "Charts",
            SearchTab: "Search",
            ProfileTab: "Profile",
          };
          return null; // Use default label from tabBarLabel below
        },
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeStackScreen} options={{ tabBarLabel: "Home" }} />
      <Tab.Screen name="ChartsTab" component={ChartsStackScreen} options={{ tabBarLabel: "Charts" }} />
      <Tab.Screen name="SearchTab" component={SearchStackScreen} options={{ tabBarLabel: "Search" }} />
      <Tab.Screen name="ProfileTab" component={ProfileStackScreen} options={{ tabBarLabel: "Profile" }} />
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
  AlbumDetails: { uri: string };
  ArtistDetails: { uri: string };
  SongDetails: { uri: string };
  Profile: { did?: string };
  UserProfile: { did: string };
  Story: { index: number };
  Search: undefined;
};
