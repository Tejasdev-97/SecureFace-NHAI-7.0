/**
 * SecureFace - NHAI Hackathon 7.0
 * React Native entry point — registers the App component.
 */
import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
