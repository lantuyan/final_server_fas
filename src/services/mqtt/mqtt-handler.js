import mqtt from 'mqtt';
import { config } from '../../config/config.js';
import { appwriteService } from '../database/appwrite.js';
import { firebaseNotificationService } from '../notification/firebase.js';
import { Status, AlarmStatus } from '../../constants/status.js';
import { sendDownlinksToSpeakers } from './downlink.js';

class MQTTHandler {
  constructor() {
    this.client = null;
  }

  async start() {
    this.client = mqtt.connect(config.mqtt.url);
    const topicName = `application/${config.chirpstack.applicationId}/device/+/event/up`;

    this.client.on('connect', () => {
      console.log('MQTT client connected successfully');
      appwriteService.logEvent('MQTT client connected successfully');
      
      this.client.subscribe(topicName, (err, granted) => {
        if (err) {
          console.error('Subscription error:', err);
          return;
        }
        console.log('Subscribed to topics:', granted);
      });
    });

    this.client.on('message', this.handleMessage.bind(this));
    
    this.client.on('error', (error) => {
      console.error('MQTT error:', error);
      appwriteService.logEvent(`MQTT error: ${error.message}`, 'ERROR');
    });

    this.client.on('close', () => {
      console.log('MQTT connection closed');
      appwriteService.logEvent('MQTT connection closed');
    });
  }

  async handleMessage(topic, message) {
    try {
      const data = JSON.parse(message);
      console.log('Received message:', data);

      if (data.deviceProfileID === config.deviceProfiles.smoke) {
        await this.handleSmokeMessage(data);
      } else if (data.deviceProfileID === config.deviceProfiles.button) {
        await this.handleButtonMessage(data);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      await appwriteService.logEvent(`Error processing MQTT message: ${error.message}`, 'ERROR');
    }
  }

  async handleSmokeMessage(data) {
    const { smoke_alarm, heat_alarm, batteryStatus, temperature } = data.object.data;
    const status = this.determineSmokeStatus(smoke_alarm, heat_alarm);
    const battery = batteryStatus === "Normal" ? 100 : 0;

    if (status === Status.FIRE) {
      console.log("Fire detected by smoke sensor");
      await firebaseNotificationService.sendFireAlertNotification(data.deviceName);
      await sendDownlinksToSpeakers();
    }

    await appwriteService.updateSensorData(data.devEUI, {
      name: data.deviceName,
      time: new Date(),
      battery,
      value: temperature,
      temperature,
      status,
      humidity: 0,
      smoke: 0
    });
  }

  async handleButtonMessage(data) {
    const { sos_event, anti_tamper_status } = data.object.data;
    const status = sos_event === AlarmStatus.DANGER ? Status.FIRE : Status.ON;

    if (status === Status.FIRE) {
      console.log("Emergency button pressed");
      await firebaseNotificationService.sendFireAlertNotification(data.deviceName);
      await sendDownlinksToSpeakers();
    }

    await appwriteService.updateSensorData(data.devEUI, {
      name: data.deviceName,
      time: new Date(),
      battery: 0,
      value: 0,
      temperature: 0,
      status,
      humidity: 0,
      smoke: 0
    });
  }

  determineSmokeStatus(smoke, heat) {
    if (smoke === AlarmStatus.DANGER || heat === AlarmStatus.DANGER) {
      return Status.FIRE;
    }
    return Status.ON;
  }
}

export const mqttHandler = new MQTTHandler(); 