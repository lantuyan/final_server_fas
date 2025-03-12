import admin from 'firebase-admin';
import { config } from '../../config/config.js';
import { appwriteService } from '../database/appwrite.js';
import { Query } from 'node-appwrite';

class FirebaseNotificationService {
  constructor() {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.firebase.projectId,
        clientEmail: config.firebase.clientEmail,
        privateKey: config.firebase.privateKey,
      }),
      databaseURL: config.firebase.databaseUrl,
    });
  }

  async sendPushNotification(payload, tokens) {
    try {
      const responses = await Promise.all(tokens.map(token => 
        admin.messaging().send({
          token,
          notification: payload.notification,
          data: payload.data
        })
      ));
      console.log('Successfully sent notifications:', responses);
      return responses;
    } catch (error) {
      console.error('Error sending notifications:', error);
      throw error;
    }
  }

  async sendFireAlertNotification(deviceName) {
    const payload = {
      notification: {
        title: 'Cảnh báo cháy',
        body: `Thiết bị ${deviceName} đang ở mức độ cảnh báo cháy`,
      },
      data: {
        title: 'Cảnh báo cháy',
        body: `Thiết bị ${deviceName} đang ở mức độ cảnh báo cháy`,
        "$id": "",
        "name": String(deviceName),
        "time": "",
        "timeTurnOn": "",
        "battery": "",
        "type": "",
        "value": "",
        "status": "",
      }
    };
    
    try {
      // Retrieve user tokens from Appwrite
      const response = await appwriteService.databases.listDocuments(
        config.appwrite.buildingDatabaseId,
        config.appwrite.userCollectionId,
        [
          Query.limit(1000) // Adjust limit as needed
        ]
      );

      const tokens = response.documents.map(user => user.token); // Assuming 'token' is the field name

      if (tokens.length > 0) {
        await this.sendPushNotification(payload, tokens);
        await appwriteService.logEvent(`Fire alert notification sent for device: ${deviceName}`, 'NOTIFICATION');
      } else {
        console.log('No user tokens found to send notifications.');
      }
    } catch (error) {
      console.error('Failed to send fire alert notification:', error);
      await appwriteService.logEvent(`Failed to send fire alert notification: ${error.message}`, 'ERROR');
    }
  }
}

export const firebaseNotificationService = new FirebaseNotificationService(); 