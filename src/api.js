import express from 'express';
import bodyParser from 'body-parser';
import { sendPushNotificationToUser, triggerFireAlarmActions, logAppwrite } from './main.js';

const router = express.Router();

// Fire alarm trigger endpoint
router.post('/trigger-fire-alarm', async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required in request body' });
    }

    // 1. Send push notification with custom message
    const customMessage = `Người dùng ${name} đang cảnh báo cháy trong toà nhà`;
    await sendPushNotificationToUser(customMessage, name);

    // 2. Trigger fire alarm actions
    await triggerFireAlarmActions();

    // Log the manual trigger
    await logAppwrite(`Manual fire alarm trigger by user: ${name}`);

    res.status(200).json({ message: 'Fire alarm triggered successfully' });
  } catch (error) {
    console.error('Error triggering fire alarm:', error);
    res.status(500).json({ error: 'Failed to trigger fire alarm' });
  }
});

export default router; 