import express from 'express';
import { config } from './src/config/config.js';
import { mqttHandler } from './src/services/mqtt/mqtt-handler.js';
import { sensorStatusChecker } from './src/services/database/sensor-status.js';
import { firebaseNotificationService } from './src/services/notification/firebase.js';

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Start MQTT handler
mqttHandler.start();

// Start sensor status checker
// Check every minute for sensors that haven't reported within the configured timeout
sensorStatusChecker.startPeriodicCheck(15);

// Start server
const port = process.env.PORT || 8888;
const server = app.listen(port, () => {
  console.log(`Server is running on port ${server.address().port}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

// // Add this function to your firebase.js or a separate test file
// import { sendDownlinksToSpeakers } from './src/services/mqtt/downlink.js';

// async function testFireAlert() {
//   const testDeviceName = "Test Device";
//   console.log(`Simulating fire alert for device: ${testDeviceName}`);
  
//   try {
//     await firebaseNotificationService.sendFireAlertNotification(testDeviceName);
//     await sendDownlinksToSpeakers();
//     console.log("Fire alert test completed.");
//   } catch (error) {
//     console.error("Error during fire alert test:", error);
//   }
// }

// // Call this function after starting the project
// testFireAlert();