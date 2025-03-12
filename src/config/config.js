import dotenv from 'dotenv';
import { throwIfMissing } from '../utils/validation.js';

dotenv.config();

// Validate required environment variables
throwIfMissing(process.env, [
  'APPWRITE_URL',
  'APPWRITE_PROJECT_ID',
  'APPWRITE_API_KEY',
  'BUILDING_DATABASE_ID',
  'SENSOR_COLLECTION_ID',
  'LOG_COLLECTION_ID',
  'APPLICATION_CHIRPSTACK_ID',
  'MQTT_URL',
  'SMOKE_PROFILE_ID',
  'TEMP_HUM_PROFILE_ID',
  'USERS_COLLECTION_ID',
  'NOTIFICATION_COLLECTION_ID',
  'CHIRPSTACK_API_TOKEN',
  'CHIRPSTACK_API_URL',
  'CHIRPSTACK_DOWNLINK_SPEAKER_DATA',
  'SMOKE_SENSOR_TIMEOUT',
  'SPEAKER_SENSOR_TIMEOUT',
  'BUTTON_SENSOR_TIMEOUT'
]);

export const config = {
  appwrite: {
    url: process.env.APPWRITE_URL,
    projectId: process.env.APPWRITE_PROJECT_ID,
    apiKey: process.env.APPWRITE_API_KEY,
    buildingDatabaseId: process.env.BUILDING_DATABASE_ID,
    sensorCollectionId: process.env.SENSOR_COLLECTION_ID,
    logCollectionId: process.env.LOG_COLLECTION_ID,
    userCollectionId: process.env.USERS_COLLECTION_ID,
    notificationCollectionId: process.env.NOTIFICATION_COLLECTION_ID
  },
  mqtt: {
    url: process.env.MQTT_URL
  },
  chirpstack: {
    applicationId: process.env.APPLICATION_CHIRPSTACK_ID,
    apiToken: process.env.CHIRPSTACK_API_TOKEN,
    apiUrl: process.env.CHIRPSTACK_API_URL,
    downlinkSpeakerData: process.env.CHIRPSTACK_DOWNLINK_SPEAKER_DATA
  },
  deviceProfiles: {
    smoke: process.env.SMOKE_PROFILE_ID,
    tempHum: process.env.TEMP_HUM_PROFILE_ID,
    speaker: process.env.SPEAKER_PROFILE_ID,
    button: process.env.BUTTON_PROFILE_ID
  },
  firebase: {
    projectId: process.env.FCM_PROJECT_ID,
    clientEmail: process.env.FCM_CLIENT_EMAIL,
    privateKey: process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    databaseUrl: process.env.FCM_DATABASE_URL
  },
  sensor: {
    timeouts: {
      smoke: parseInt(process.env.SMOKE_SENSOR_TIMEOUT, 10),
      speaker: parseInt(process.env.SPEAKER_SENSOR_TIMEOUT, 10),
      button: parseInt(process.env.BUTTON_SENSOR_TIMEOUT, 10)
    }
  }
}; 