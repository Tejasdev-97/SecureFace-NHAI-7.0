/**
 * SecureFace - NHAI Hackathon 7.0
 * Offline Facial Recognition & Liveness Detection
 *
 * App entry point - sets up navigation, theme, and global providers
 */

import React, {useEffect} from 'react';
import {StatusBar, LogBox} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {Provider as PaperProvider} from 'react-native-paper';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import AppNavigator from './src/navigation/AppNavigator';
import {theme} from './src/utils/theme';
import {DatabaseService} from './src/modules/DatabaseService';
import {SyncManager} from './src/modules/SyncManager';

// Suppress known non-critical warnings in hackathon prototype
LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
  'ViewPropTypes will be removed',
]);

const App = () => {
  useEffect(() => {
    // Initialize the SQLite database on app start
    DatabaseService.initialize()
      .then(() => {
        console.log('[App] Database initialized successfully');
        // Check for pending sync on startup if connected
        SyncManager.checkAndSync();
      })
      .catch(err => {
        console.error('[App] Database initialization failed:', err);
      });
  }, []);

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <NavigationContainer theme={theme.navigation}>
            <StatusBar
              barStyle="light-content"
              backgroundColor={theme.colors.primary}
            />
            <AppNavigator />
          </NavigationContainer>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

export default App;
