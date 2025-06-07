import express from 'express';
import bodyParser from 'body-parser';
import { sendPushNotificationToUser, triggerFireAlarmActions, logAppwrite } from './main.js';
import { Client, Databases, Query } from 'node-appwrite';

const router = express.Router();

// Initialize Appwrite client
const client = new Client();
client.setEndpoint(process.env.APPWRITE_URL)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);

// Fire alarm trigger endpoint
router.post('/trigger-fire-alarm', async (req, res) => {
  try {
    const { name, buildingId } = req.body;
    
    if (!name || !buildingId) {
      return res.status(400).json({ error: 'Name and buildingId are required in request body' });
    }

    // 1. Send push notification with custom message to users with matching buildingId
    const customMessage = `Người dùng ${name} đang cảnh báo cháy trong toà nhà`;
    await sendPushNotificationToUser(customMessage, name, buildingId);

    // 2. Trigger fire alarm actions
    await triggerFireAlarmActions(buildingId);

    // Log the manual trigger
    await logAppwrite(`Manual fire alarm trigger by user: ${name} in building: ${buildingId}`);

    res.status(200).json({ message: 'Fire alarm triggered successfully' });
  } catch (error) {
    console.error('Error triggering fire alarm:', error);
    res.status(500).json({ error: 'Failed to trigger fire alarm' });
  }
});

// Reset system endpoint - sets all sensor statuses to offline
router.post('/reset-system', async (req, res) => {
  try {
    // Get all sensors
    const sensors = await databases.listDocuments(
      process.env.BUILDING_DATABASE_ID,
      process.env.SENSOR_COLLECTION_ID,
      [Query.limit(100000)]
    );

    // Update each sensor's status to 'off'
    const updatePromises = sensors.documents.map(sensor => 
      databases.updateDocument(
        process.env.BUILDING_DATABASE_ID,
        process.env.SENSOR_COLLECTION_ID,
        sensor.$id,
        {
          status: 'off',
          time: new Date()
        }
      )
    );

    await Promise.all(updatePromises);

    // Log the system reset
    await logAppwrite('System reset: All sensors set to offline status');

    res.status(200).json({ 
      message: 'System reset successful', 
      sensorsUpdated: sensors.documents.length 
    });
  } catch (error) {
    console.error('Error resetting system:', error);
    res.status(500).json({ error: 'Failed to reset system' });
  }
});

export default router;