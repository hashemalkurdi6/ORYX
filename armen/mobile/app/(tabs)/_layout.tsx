import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' }, // Single-tab app — hide the tab bar
        contentStyle: { backgroundColor: '#0A0A0F' },
      }}
    />
  );
}
