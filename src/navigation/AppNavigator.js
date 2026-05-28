/**
 * AppNavigator.js
 * Main navigation structure:
 * - Bottom Tab Navigator for main screens
 * - Stack Navigator for Camera flows (Enrollment / Attendance)
 */

import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createStackNavigator} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import HomeScreen from '../screens/HomeScreen';
import EnrollScreen from '../screens/EnrollScreen';
import CameraEnrollScreen from '../screens/CameraEnrollScreen';
import AttendanceScreen from '../screens/AttendanceScreen';
import CameraAttendanceScreen from '../screens/CameraAttendanceScreen';
import LogsScreen from '../screens/LogsScreen';
import SettingsScreen from '../screens/SettingsScreen';

import {COLORS} from '../utils/theme';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// ---------- Enroll Stack ----------
const EnrollStack = () => (
  <Stack.Navigator
    screenOptions={{
      headerStyle: {backgroundColor: COLORS.primary},
      headerTintColor: '#fff',
      headerTitleStyle: {fontWeight: 'bold'},
    }}>
    <Stack.Screen
      name="EnrollForm"
      component={EnrollScreen}
      options={{title: 'Enroll Personnel'}}
    />
    <Stack.Screen
      name="CameraEnroll"
      component={CameraEnrollScreen}
      options={{title: 'Capture Face', headerBackTitle: 'Back'}}
    />
  </Stack.Navigator>
);

// ---------- Attendance Stack ----------
const AttendanceStack = () => (
  <Stack.Navigator
    screenOptions={{
      headerStyle: {backgroundColor: COLORS.primary},
      headerTintColor: '#fff',
      headerTitleStyle: {fontWeight: 'bold'},
    }}>
    <Stack.Screen
      name="AttendanceHome"
      component={AttendanceScreen}
      options={{title: 'Mark Attendance'}}
    />
    <Stack.Screen
      name="CameraAttendance"
      component={CameraAttendanceScreen}
      options={{title: 'Face Verification', headerBackTitle: 'Back'}}
    />
  </Stack.Navigator>
);

// ---------- Bottom Tabs ----------
const AppNavigator = () => (
  <Tab.Navigator
    screenOptions={({route}) => ({
      headerStyle: {backgroundColor: COLORS.primary},
      headerTintColor: '#fff',
      headerTitleStyle: {fontWeight: 'bold'},
      tabBarStyle: {
        backgroundColor: COLORS.surface,
        borderTopColor: COLORS.border,
        height: 60,
        paddingBottom: 8,
      },
      tabBarActiveTintColor: COLORS.primary,
      tabBarInactiveTintColor: COLORS.textSecondary,
      tabBarIcon: ({color, size}) => {
        const icons = {
          Home: 'view-dashboard',
          Enroll: 'account-plus',
          Attendance: 'face-recognition',
          Logs: 'clipboard-list',
          Settings: 'cog',
        };
        return (
          <Icon name={icons[route.name] || 'circle'} size={size} color={color} />
        );
      },
    })}>
    <Tab.Screen
      name="Home"
      component={HomeScreen}
      options={{title: 'Dashboard'}}
    />
    <Tab.Screen
      name="Enroll"
      component={EnrollStack}
      options={{headerShown: false, title: 'Enroll'}}
    />
    <Tab.Screen
      name="Attendance"
      component={AttendanceStack}
      options={{headerShown: false, title: 'Attendance'}}
    />
    <Tab.Screen
      name="Logs"
      component={LogsScreen}
      options={{title: 'Logs'}}
    />
    <Tab.Screen
      name="Settings"
      component={SettingsScreen}
      options={{title: 'Settings'}}
    />
  </Tab.Navigator>
);

export default AppNavigator;
