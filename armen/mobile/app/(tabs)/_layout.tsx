import { Animated, StyleSheet, View, Text, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRef, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

// Active tab gets a lime pill behind the icon; inactive icons stay muted.
function TabIcon({
  name,
  focusedName,
  focused,
  color,
}: {
  name: IoniconsName;
  focusedName: IoniconsName;
  focused: boolean;
  color: string;
}) {
  const { theme } = useTheme();
  const iconColor = focused ? theme.accentInk : color;

  return (
    <View
      style={{
        width: 36,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? theme.accent : 'transparent',
      }}
    >
      <Ionicons name={focused ? focusedName : name} size={18} color={iconColor} />
    </View>
  );
}

// Small mono label below each icon — tracks active/inactive tint.
function TabLabel({ focused, children }: { focused: boolean; children: string }) {
  const { theme, type } = useTheme();
  return (
    <Text
      style={{
        fontSize: 8,
        letterSpacing: 1.4,
        fontFamily: type.mono.regular,
        color: focused ? theme.text.body : theme.text.muted,
        marginTop: 2,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </Text>
  );
}

// Glassy floating chrome under the tabs. BlurView on top of a subtle wash.
function TabBarBackground() {
  const { theme, radius } = useTheme();
  return (
    <View
      style={[
        StyleSheet.absoluteFillObject,
        {
          borderRadius: radius.xxl,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: theme.glass.border,
          backgroundColor: Platform.OS === 'android' ? theme.bg.elevated : 'transparent',
        },
      ]}
    >
      <BlurView
        intensity={20}
        tint="systemChromeMaterialDark"
        style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.glass.chrome }]}
      />
    </View>
  );
}

export default function TabsLayout() {
  const { theme, radius } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: theme.text.primary,
        tabBarInactiveTintColor: theme.text.muted,
        tabBarBackground: () => <TabBarBackground />,
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 16,
          height: 60,
          paddingTop: 6,
          paddingBottom: 6,
          borderTopWidth: 0,
          borderRadius: radius.xxl,
          backgroundColor: 'transparent',
          elevation: 0,
          shadowColor: '#000',
          shadowOpacity: 0.35,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 8 },
        },
        tabBarItemStyle: {
          paddingTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="nutrition"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="restaurant-outline" focusedName="restaurant" focused={focused} color={color} />
          ),
          tabBarLabel: ({ focused }) => <TabLabel focused={focused}>Nutrition</TabLabel>,
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="people-outline" focusedName="people" focused={focused} color={color} />
          ),
          tabBarLabel: ({ focused }) => <TabLabel focused={focused}>Community</TabLabel>,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="home-outline" focusedName="home" focused={focused} color={color} />
          ),
          tabBarLabel: ({ focused }) => <TabLabel focused={focused}>Home</TabLabel>,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="pulse-outline" focusedName="pulse" focused={focused} color={color} />
          ),
          tabBarLabel: ({ focused }) => <TabLabel focused={focused}>Activity</TabLabel>,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="person-circle-outline" focusedName="person-circle" focused={focused} color={color} />
          ),
          tabBarLabel: ({ focused }) => <TabLabel focused={focused}>Profile</TabLabel>,
        }}
      />
      <Tabs.Screen name="wellness" options={{ href: null }} />
      <Tabs.Screen name="dashboard" options={{ href: null }} />
    </Tabs>
  );
}
