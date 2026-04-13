import { Animated, StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRef, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

// Animated tab icon with scale on focus
function TabIcon({
  name,
  focusedName,
  focused,
  color,
  size = 24,
}: {
  name: IoniconsName;
  focusedName: IoniconsName;
  focused: boolean;
  color: string;
  size?: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: focused ? 1.12 : 1,
      useNativeDriver: true,
      speed: 28,
      bounciness: 6,
    }).start();
  }, [focused]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Ionicons name={focused ? focusedName : name} size={focused ? size + 1 : size} color={color} />
    </Animated.View>
  );
}

export default function TabsLayout() {
  const { theme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: theme.text.primary,
        tabBarInactiveTintColor: theme.text.muted,
        tabBarStyle: {
          backgroundColor: theme.bg.primary,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.border,
          paddingBottom: 10,
          height: 64,
        },
      }}
    >
      <Tabs.Screen
        name="nutrition"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="restaurant-outline" focusedName="restaurant" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="people-outline" focusedName="people" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="home-outline" focusedName="home" focused={focused} color={color} size={focused ? 26 : 24} />
          ),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="pulse-outline" focusedName="pulse" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="person-circle-outline" focusedName="person-circle" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="wellness" options={{ href: null }} />
      <Tabs.Screen name="dashboard" options={{ href: null }} />
    </Tabs>
  );
}
