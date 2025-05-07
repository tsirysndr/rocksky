import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

// If you need to access navigation and route props
type HomeScreenProps = BottomTabScreenProps<any, "Home">;

const Home: React.FC<HomeScreenProps> = ({ navigation }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Home Screen</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5fcff",
  },
  text: {
    fontSize: 20,
    fontWeight: "bold",
  },
});

export default Home;
