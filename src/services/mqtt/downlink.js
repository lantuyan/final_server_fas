import fetch from 'node-fetch';
import { config } from '../../config/config.js';
import { appwriteService } from '../database/appwrite.js';

async function sendDownlinkToChirpstack(devEUI, data, fPort = 210, confirmed = true) {
  const url = `${config.chirpstack.apiUrl}/api/devices/${devEUI}/queue`;
  const headers = {
    'Accept': 'application/json',
    'Grpc-Metadata-Authorization': config.chirpstack.apiToken
  };
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        deviceQueueItem: {
          confirmed,
          data,
          fPort
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    console.log(`Downlink sent successfully to device: ${devEUI}`);
    return await response.json();
  } catch (error) {
    console.error(`Failed to send downlink to device ${devEUI}:`, error);
    throw error;
  }
}

export async function sendDownlinksToSpeakers() {
  try {
    console.log("Fetching Speaker devices...");
    const speakerDevices = await appwriteService.getSpeakerDevices();
    console.log("Speaker devices fetched:", speakerDevices);

    const downlinkPromises = speakerDevices.map(devEUI => 
      sendDownlinkToChirpstack(devEUI, config.chirpstack.downlinkSpeakerData)
    );

    await Promise.all(downlinkPromises);
    console.log('Downlinks sent successfully to all speakers');
    await appwriteService.logEvent('Downlinks sent to all speakers', 'DOWNLINK');
  } catch (error) {
    console.error('Failed to send downlinks:', error);
    await appwriteService.logEvent(`Failed to send downlinks: ${error.message}`, 'ERROR');
    throw error;
  }
} 