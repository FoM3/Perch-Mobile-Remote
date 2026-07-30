import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#101418" },
          headerTintColor: "#e6e9ec",
          contentStyle: { backgroundColor: "#101418" },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Perch" }} />
        <Stack.Screen name="remote" options={{ headerShown: false, orientation: "default" }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
