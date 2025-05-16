import Feather from "@expo/vector-icons/Feather";
import MaterialIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AlbumDetails from "./screens/AlbumDetails";
import ArtistDetails from "./screens/ArtistDetails";
import Home from "./screens/Home";
import Library from "./screens/Library";
import Profile from "./screens/Profile";
import Search from "./screens/Search";
import SongDetails from "./screens/SongDetails";
import Story from "./screens/Story";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const HomeStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();
const LibraryStack = createNativeStackNavigator();
const SearchStack = createNativeStackNavigator();

function HomeStackScreen() {
  return (
    <HomeStack.Navigator
      screenOptions={{
        contentStyle: { backgroundColor: "#000" },
        headerShown: false,
        animation: "default",
      }}
    >
      <HomeStack.Screen name="Home" component={Home} />
      <HomeStack.Screen name="AlbumDetails" component={AlbumDetails} />
      <HomeStack.Screen name="ArtistDetails" component={ArtistDetails} />
      <HomeStack.Screen name="SongDetails" component={SongDetails} />
      <HomeStack.Screen name="UserLibrary" component={Library} />
      <HomeStack.Screen name="UserProfile" component={Profile} />
      <HomeStack.Screen name="Story" component={Story} />
    </HomeStack.Navigator>
  );
}

function ProfileStackScreen() {
  return (
    <ProfileStack.Navigator
      screenOptions={{
        contentStyle: { backgroundColor: "#000" },
        headerShown: false,
        animation: "default",
      }}
    >
      <ProfileStack.Screen name="Profile" component={Profile} />
      <ProfileStack.Screen name="AlbumDetails" component={AlbumDetails} />
      <ProfileStack.Screen name="ArtistDetails" component={ArtistDetails} />
      <ProfileStack.Screen name="SongDetails" component={SongDetails} />
      <ProfileStack.Screen name="UserLibrary" component={Library} />
    </ProfileStack.Navigator>
  );
}

function LibraryStackScreen() {
  return (
    <LibraryStack.Navigator
      screenOptions={{
        contentStyle: { backgroundColor: "#000" },
        headerShown: false,
        animation: "default",
      }}
    >
      <LibraryStack.Screen name="Library" component={Library} />
      <LibraryStack.Screen name="AlbumDetails" component={AlbumDetails} />
      <LibraryStack.Screen name="ArtistDetails" component={ArtistDetails} />
      <LibraryStack.Screen name="SongDetails" component={SongDetails} />
    </LibraryStack.Navigator>
  );
}

function SearchStackScreen() {
  return (
    <SearchStack.Navigator
      screenOptions={{
        contentStyle: { backgroundColor: "#000" },
        headerShown: false,
        animation: "default",
      }}
    >
      <SearchStack.Screen name="Search" component={Search} />
      <SearchStack.Screen name="AlbumDetails" component={AlbumDetails} />
      <SearchStack.Screen name="ArtistDetails" component={ArtistDetails} />
      <SearchStack.Screen name="SongDetails" component={SongDetails} />
      <SearchStack.Screen name="UserLibrary" component={Library} />
      <SearchStack.Screen name="UserProfile" component={Profile} />
    </SearchStack.Navigator>
  );
}

function HomeTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: {
          backgroundColor: "#000",
        },
        tabBarStyle: {
          backgroundColor: "#000",
          borderTopWidth: 0,
          height: 80,
          paddingTop: 10,
        },
        tabBarShowLabel: false,
        tabBarActiveTintColor: "#fff",
        tabBarIcon: ({ focused, color }) => {
          let iconName: string = "";
          switch (route.name) {
            case "HomeTab":
              return (
                <MaterialIcons
                  name={"home-variant-outline"}
                  size={32}
                  color={color}
                />
              );
            case "SearchTab":
              iconName = focused ? "search" : "search";
              return (
                <Feather
                  name={iconName as any}
                  size={29}
                  color={color}
                  className="mt-[1px]"
                />
              );
            case "LibraryTab":
              iconName = focused
                ? "music-box-multiple-outline"
                : "music-box-multiple-outline";
              break;
            case "ProfileTab":
              iconName = focused ? "account-outline" : "account-outline";
              break;
            default:
              break;
          }
          return (
            <MaterialIcons name={iconName as any} size={32} color={color} />
          );
        },
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeStackScreen} />
      <Tab.Screen name="SearchTab" component={SearchStackScreen} />
      <Tab.Screen name="LibraryTab" component={LibraryStackScreen} />
      <Tab.Screen name="ProfileTab" component={ProfileStackScreen} />
    </Tab.Navigator>
  );
}

export function RootStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        contentStyle: { backgroundColor: "#000" },
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
  AlbumDetails: {
    uri: string;
  };
  ArtistDetails: {
    uri: string;
  };
  SongDetails: {
    uri: string;
  };
  Library: undefined;
  UserLibrary: {
    handle?: string;
  };
  Profile: undefined;
  UserProfile: {
    handle: string;
  };
  Story: {
    avatar: string;
    handle: string;
    title: string;
    artist: string;
    albumArt: string;
    albumUri: string;
    artistUri: string;
    trackUri: string;
    date: string;
  };
};
