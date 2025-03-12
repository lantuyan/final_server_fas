import { Query } from 'node-appwrite';
import { config } from '../../config/config.js';
import { appwriteService } from './appwrite.js';
import { Status, DeviceTypes } from '../../constants/status.js';

class SensorStatusChecker {
  constructor() {
    this.timeouts = config.sensor.timeouts;
  }

  getTimeoutForDeviceType(deviceType) {
    switch (deviceType) {
      case DeviceTypes.SMOKE:
        return this.timeouts.smoke;
      case DeviceTypes.SPEAKER:
        return this.timeouts.speaker;
      case DeviceTypes.BUTTON:
        return this.timeouts.button;
      default:
        return this.timeouts.smoke; // Default to smoke sensor timeout
    }
  }

  async checkAndUpdateInactiveSensors() {
    try {
      console.log('Checking for inactive sensors...');
      
      // Get all active sensors of supported types
      const response = await appwriteService.databases.listDocuments(
        config.appwrite.buildingDatabaseId,
        config.appwrite.sensorCollectionId,
        [
          Query.notEqual('status', Status.OFF),
          Query.limit(100), // Process in batches
          Query.equal('type', [DeviceTypes.SMOKE, DeviceTypes.SPEAKER, DeviceTypes.BUTTON])
        ]
      );

      const currentTime = new Date();
      const inactiveSensors = response.documents.filter(sensor => {
        const sensorTime = new Date(sensor.time);
        const timeoutMinutes = this.getTimeoutForDeviceType(sensor.type);
        const diffInMinutes = (currentTime - sensorTime) / (1000 * 60);
        return diffInMinutes > timeoutMinutes;
      });

      console.log(`Found ${inactiveSensors.length} inactive sensors`);

      // Update each inactive sensor's status to OFF
      const updatePromises = inactiveSensors.map(sensor => {
        // Remove Appwrite internal fields before updating
        const { $id, $createdAt, $updatedAt, $permissions, $databaseId, $collectionId, ...sensorData } = sensor;
        console.log(`Marking ${sensor.type} sensor ${$id} as OFF (inactive for more than ${this.getTimeoutForDeviceType(sensor.type)} minutes)`);
        return appwriteService.updateSensorData($id, {
          ...sensorData,
          status: Status.OFF
        });
      });

      await Promise.all(updatePromises);
      
      if (inactiveSensors.length > 0) {
        const summary = inactiveSensors.reduce((acc, sensor) => {
          acc[sensor.type] = (acc[sensor.type] || 0) + 1;
          return acc;
        }, {});

        const summaryText = Object.entries(summary)
          .map(([type, count]) => `${type}: ${count}`)
          .join(', ');

        await appwriteService.logEvent(
          `Updated ${inactiveSensors.length} sensors to OFF status (${summaryText})`,
          'SENSOR_STATUS'
        );
      }

      return inactiveSensors.length;
    } catch (error) {
      console.error('Error checking inactive sensors:', error);
      await appwriteService.logEvent(
        `Error checking inactive sensors: ${error.message}`,
        'ERROR'
      );
      throw error;
    }
  }

  startPeriodicCheck(intervalMinutes = 1) {
    console.log(`Starting periodic sensor status check every ${intervalMinutes} minutes`);
    console.log('Timeout settings:', {
      'Smoke Sensor': `${this.timeouts.smoke} minutes`,
      'Speaker': `${this.timeouts.speaker} minutes`,
      'Button': `${this.timeouts.button} minutes`
    });
    
    // Run initial check
    this.checkAndUpdateInactiveSensors();

    // Set up periodic check
    setInterval(() => {
      this.checkAndUpdateInactiveSensors();
    }, intervalMinutes * 60 * 1000);
  }
}

export const sensorStatusChecker = new SensorStatusChecker(); 