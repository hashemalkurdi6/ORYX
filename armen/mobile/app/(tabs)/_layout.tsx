import { Animated, StyleSheet, View, Text, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRef, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

// Active tab gets a lime pill behind the icon; inactive icons stay muted.
// Size matches Claude Design v2 spec — 44×30 pill, radius 10, icon 20.
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
        width: 44,
        height: 30,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? theme.accent : 'transparent',
      }}
    >
      <Ionicons name={focused ? focusedName : name} size={20} color={iconColor} />
    </View>
  );
}

// Small mono label below each icon. Active → primary white, inactive → muted.
// Mono 9pt, letter-spacing 0.08em per design spec.
function TabLabel({ focused, children }: { focused: boolean; children: string }) {
  const { theme, type } = useTheme();
  return (
    <Text
      style={{
        fontSize: 9,
        letterSpacing: 0.7,
        fontFamily: type.mono.regular,
        color: focused ? theme.text.primary : theme.text.muted,
        marginTop: 4,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </Text>
  );
}

// Glassy floating chrome under the tabs. BlurView on top of a subtle wash.
function TabBarBackground() {
  const { theme, resolvedScheme } = useTheme();
  const isLight = resolvedScheme === 'light';
  return (
    <View
      style={[
        StyleSheet.absoluteFillObject,
        {
          borderRadius: 32,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: theme.glass.rim,
          backgroundColor: Platform.OS === 'android' || isLight ? theme.bg.elevated : 'transparent',
        },
      ]}
    >
      <BlurView
        intensity={isLight ? 24 : 36}
        tint={isLight ? 'systemChromeMaterialLight' : 'systemChromeMaterialDark'}
        style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.glass.chrome }]}
      />
      {/* rim sheen — subtle 1px line along the top edge */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: '15%',
          right: '15%',
          height: 1,
          backgroundColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.3)',
        }}
      />
    </View>
  );
}

export default function TabsLayout() {
  const { theme, radius, resolvedScheme } = useTheme();
  const isLight = resolvedScheme === 'light';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: theme.text.primary,
        tabBarInactiveTintColor: isLight ? theme.text.body : theme.text.muted,
        tabBarBackground: () => <TabBarBackground />,
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 20,
          height: 72,
          paddingTop: 10,
          paddingBottom: 12,
          borderTopWidth: 0,
          borderRadius: 32,
          backgroundColor: 'transparent',
          elevation: 0,
          shadowColor: '#000',
          shadowOpacity: isLight ? 0.06 : 0.5,
          shadowRadius: isLight ? 12 : 20,
          shadowOffset: { width: 0, height: isLight ? -2 : 8 },
        },
        tabBarItemStyle: {
          paddingTop: 0,
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
    </Tabs>
  );
}
