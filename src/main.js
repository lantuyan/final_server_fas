import mqtt from "mqtt"
import { v4 as uuidv4 } from 'uuid';
import { AppwriteException, Client, Databases, ID, Query } from 'node-appwrite';
import { throwIfMissing } from './utils.js';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import fetch from 'node-fetch';

dotenv.config();

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
  'SENSOR_TIMEOUT_MINUTES',
  'SMOKE_SENSOR_TIMEOUT',
  'SPEAKER_SENSOR_TIMEOUT',
  'BUTTON_SENSOR_TIMEOUT'
]);

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FCM_PROJECT_ID,
    clientEmail: process.env.FCM_CLIENT_EMAIL,
    privateKey: process.env.FCM_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
  databaseURL: process.env.FCM_DATABASE_URL,
});

const client = new Client();
client.setEndpoint(process.env.APPWRITE_URL)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const buildingDatabaseID = process.env.BUILDING_DATABASE_ID;
const sensorCollectionID = process.env.SENSOR_COLLECTION_ID;
const logCollectionId = process.env.LOG_COLLECTION_ID;
const applicationChirpStackID = process.env.APPLICATION_CHIRPSTACK_ID;
const smokeProfileID = process.env.SMOKE_PROFILE_ID;
const tempHumProfileID = process.env.TEMP_HUM_PROFILE_ID;
const speakerProfileID = process.env.SPEAKER_PROFILE_ID;
const buttonProfileID = process.env.BUTTON_PROFILE_ID;
const userCollectionID = process.env.USERS_COLLECTION_ID;
const notificationCollectionID = process.env.NOTIFICATION_COLLECTION_ID;

const chirpstackToken =  process.env.CHIRPSTACK_API_TOKEN;
const chirpstackAPIURL = process.env.CHIRPSTACK_API_URL;
const chirpstackDownlinkSpeakerData = process.env.CHIRPSTACK_DOWNLINK_SPEAKER_DATA;

const mqtt_url = process.env.MQTT_URL;
const Status = {
  ON: 'on',
  OFF: 'off',
  WARNING: 'warning',
  FIRE: 'fire'
};

export const saveData = () => {
  // Start the sensor timeout checker
  const timeoutCheckInterval = setInterval(checkSensorTimeouts, 60000*parseInt(process.env.TIMEOUT_CHECK_INTERVAL)); // Check every 15 minutes

  var client_mqtt = mqtt.connect(mqtt_url)
  const topicName = `application/${applicationChirpStackID}/device/+/event/up`;

  client_mqtt.on("connect", function () {
    console.log("client connect successfully")
    logAppwrite("client connect successfully")
    client_mqtt.subscribe(topicName, (err, granted) => {
      if (err) {
        console.log(err, 'err');
      }
      console.log(granted, 'granted')
    })
  })

  var count = 0;

  client_mqtt.on('message', async (topic, message, packet) => {
    console.log('Count message:', count++);
    var currentDate = new Date();
    try {
      const temp = JSON.parse(message);
      console.log('Received message:', temp);

      // Extract device profile ID from deviceInfo
      const deviceProfileID = temp.deviceInfo?.deviceProfileId;

      if (deviceProfileID === smokeProfileID) {
        var status;
        let smoke = temp.object?.data?.smoke_alarm;
        let heat = temp.object?.data?.heat_alarm;
        let battery = temp.object?.data?.batteryStatus === "Normal" ? 100 : 0;
        let temperature = temp.object?.data?.temperature;
        
        if (smoke === "Danger" || heat === "Danger") {
          status = "fire";
        } else if (smoke === "Normal" || heat === "Normal") {
          status = "on";
        } else {
          status = "on";
        }
        
        // Retrieve the sensor document to get the buildingId
        let sensorData;
        try {
          sensorData = await databases.getDocument(
            buildingDatabaseID,
            sensorCollectionID,
            temp.deviceInfo.devEui
          );
        } catch (error) {
          console.log('Error retrieving sensor data:', error);
          sensorData = null;
        }
        
        if (status === "fire") {
          console.log("Fire detected by smoke sensor, sending notifications and downlinks");
          const message = 'Thiết bị ' + temp.deviceInfo.deviceName + ' đang ở mức độ cảnh báo cháy';
          
          // Get buildingId from sensor and send notification to users with that buildingId
          const buildingId = sensorData?.buildingId || null;
          await sendPushNotificationToUser(message, temp.deviceInfo.deviceName, buildingId);
          await triggerFireAlarmActions(buildingId);
        }
        console.log('Document updated successfully: ', temp.deviceInfo.devEui, status);

        await databases.updateDocument(
          buildingDatabaseID,
          sensorCollectionID,
          temp.deviceInfo.devEUI,
          {
            name: temp.deviceInfo.deviceName,
            time: currentDate,
            timeTurnOn: "",
            battery: battery,
            value: temperature,
            humidity: 0,
            smoke: 0,
            temperature: temperature,
            status: status,
            lastNotification: null
          }
        );
      }
      if (deviceProfileID === buttonProfileID) {
        var status;
        let event = temp.object?.data?.sos_event;
        if (event === "Danger") {
          status = "fire";
        } else if (event === "Safe") {
          status = "on";
        } else {
          status = "on";
        }
        
        // Retrieve the sensor document to get the buildingId
        let sensorData;
        try {
          sensorData = await databases.getDocument(
            buildingDatabaseID,
            sensorCollectionID,
            temp.deviceInfo.devEui
          );
        } catch (error) {
          console.log('Error retrieving sensor data:', error);
          sensorData = null;
        }
        
        if (status === "fire") {
          console.log("Fire detected by button sensor, sending notifications and downlinks");
          const message = 'Thiết bị ' + temp.deviceInfo.deviceName + ' đang ở mức độ cảnh báo cháy';
          
          // Get buildingId from sensor and send notification to users with that buildingId
          const buildingId = sensorData?.buildingId || null;
          await sendPushNotificationToUser(message, temp.deviceInfo.deviceName, buildingId);
          await triggerFireAlarmActions(buildingId);

          var caseTampered = temp.object?.data?.anti_tamper_status;
          if (caseTampered === "Not tampered") {
          } else if (caseTampered === "Tampered") {
          }
        }

        await databases.updateDocument(
          buildingDatabaseID,
          sensorCollectionID,
          temp.deviceInfo.devEui,
          {
            name: temp.deviceInfo.deviceName,
            time: currentDate,
            timeTurnOn: "",
            battery: 0,
            value: 0,
            humidity: 0,
            smoke: 0,
            temperature: 0,
            status: status
          }
        );
        console.log('Document updated successfully: ', temp.deviceInfo.devEui, status);
      }
      if (deviceProfileID === speakerProfileID) {
        var status = Status.ON;
        
        // Check if fPort is 220 and data exists
        if (temp.fPort === 220 && temp.data) {
          try {
            // Retrieve the sensor document to get activeMulticastKey
            const sensorData = await databases.getDocument(
              buildingDatabaseID,
              sensorCollectionID,
              temp.deviceInfo.devEui
            );
            let isValid = false;
            if (sensorData.activeMulticastKey) {
              // Decode the received base64 data
              const decodedData = Buffer.from(temp.data, 'base64');
              // Decode the activeMulticastKey from base64
              const multicastKeyBuffer = Buffer.from(sensorData.activeMulticastKey, 'base64');
              // Extract multicast address and keys from the decoded multicastKeyBuffer
              // Example: multicast address = bytes 3-6 (little endian), nwkSKey = bytes 7-22, appSKey = bytes 23-38
              // Adjust the offsets as per your actual key structure
              const multicastAddr = multicastKeyBuffer.subarray(3, 7).reverse().toString('hex');
              const nwkSKey = multicastKeyBuffer.subarray(7, 23).toString('hex');
              const appSKey = multicastKeyBuffer.subarray(23, 39).toString('hex');
              // Now, parse the decodedData to extract the same fields for comparison
              // Example: look for the multicast address in the decodedData
              // This is a simple check, you may need to adjust parsing based on your protocol
              const decodedStr = decodedData.toString('ascii');
              if (
                decodedStr.includes(multicastAddr) &&
                decodedStr.includes(nwkSKey.substring(0, 8)) && // partial match for demonstration
                decodedStr.includes(appSKey.substring(0, 8))
              ) {
                isValid = true;
              }
              if (!isValid) {
                console.error('Multicast check failed: Data does not match expected address or keys', {
                  devEui: temp.deviceInfo.devEui,
                  multicastAddr,
                  nwkSKey,
                  appSKey,
                  decodedStr
                });
                // Optionally, take further action here (e.g., alert, update DB, etc.)
              } else {
                console.log('Multicast check passed for device', temp.deviceInfo.devEui);
              }
            }
            // Update Appwrite document to set activeMulticastKey to null
            await databases.updateDocument(
              buildingDatabaseID,
              sensorCollectionID,
              temp.deviceInfo.devEui,
              {
                activeMulticastKey: null
              }
            );
            console.log(`Set activeMulticastKey to null for device ${temp.deviceInfo.devEui}`);
          } catch (error) {
            console.error('Error updating device document or checking multicast:', error);
          }
        } else if (temp.deviceInfo.tags.isActiveMulticast === "false") {
          try {
            // Query sensor data from Appwrite using devEui
            const sensorData = await databases.getDocument(
              buildingDatabaseID,
              sensorCollectionID,
              temp.deviceInfo.devEui
            );

            // If sensor has activeMulticastKey, send it to the queue
            if (sensorData.activeMulticastKey) {
              // Step1: Send activeMulticastKey to the queue
              await sendDownlinkToChirpstack(
                temp.deviceInfo.devEui,
                sensorData.activeMulticastKey,
                219,  // fPort 219 as specified
                false  // confirmed false as specified
              );
              console.log(`Sent activeMulticastKey to device ${temp.deviceInfo.devEui}`);

              // Step2: Send multicast check downlink after sending activeMulticastKey
              await sendDownlinkToChirpstack(
                temp.deviceInfo.devEui,
                "/0FUK01VTFRJQ0FTVDE9Pw==", // Check Multicast for port 220
                220,  // fPort 220 as specified
                true  // confirmed true as specified
              );
              console.log(`Sent multicast check downlink to device ${temp.deviceInfo.devEui}`);
            }
          } catch (error) {
            console.error('Error handling speaker multicast:', error);
          }
        }

        await databases.updateDocument(
          buildingDatabaseID,
          sensorCollectionID,
          temp.deviceInfo.devEui,
          {
            name: temp.deviceInfo.deviceName,
            time: currentDate,
            timeTurnOn: "",
            battery: 0,  
            value: 0,
            humidity: 0,
            smoke: 0,
            temperature: 0,
            status: status,
          }
        );
        console.log('Speaker Document updated successfully: ', temp.deviceInfo.devEui, status);
      }
    } catch (error) {
      console.log('Error processing message:', error);
    }
  })

  client_mqtt.on("packetsend", (packet) => {

  })

  client_mqtt.on("error", function (error) {
    console.log('err: ', error)
    // logAppwrite(`rr: ${error}`)
  })

  client_mqtt.on("close", function () {
    console.log("closed")
    // logAppwrite("closed")
  })
}

async function checkSensorTimeouts() {
  try {
    const currentTime = new Date();
    
    // Get timeout values from environment variables with defaults
    const smokeTimeout = parseInt(process.env.SMOKE_SENSOR_TIMEOUT);
    const speakerTimeout = parseInt(process.env.SPEAKER_SENSOR_TIMEOUT);
    const buttonTimeout = parseInt(process.env.BUTTON_SENSOR_TIMEOUT);
    
    // Get all sensors
    const sensors = await databases.listDocuments(
      buildingDatabaseID,
      sensorCollectionID,
      [Query.limit(100000)]
    );

    for (const sensor of sensors.documents) {
      const lastUpdateTime = new Date(sensor.time);
      // Calculate the time difference in minutes
      const timeDifferenceMinutes = (currentTime - lastUpdateTime) / (1000 * 60);
      
      // Determine timeout based on device profile
      let timeoutMinutes;
      if (sensor.deviceProfileID === smokeProfileID) {
        timeoutMinutes = smokeTimeout;
      } else if (sensor.deviceProfileID === speakerProfileID) {
        timeoutMinutes = speakerTimeout;
      } else if (sensor.deviceProfileID === buttonProfileID) {
        timeoutMinutes = buttonTimeout;
      } else {
        // Default timeout for unknown device types
        timeoutMinutes = parseInt(process.env.SENSOR_TIMEOUT_MINUTES);
      }

      // If sensor hasn't updated in the specified time, mark it as off
      if (timeDifferenceMinutes > timeoutMinutes && sensor.status !== Status.OFF) {
        console.log(`Sensor ${sensor.name} (${sensor.$id}) of type ${sensor.deviceProfileID} hasn't updated in ${timeDifferenceMinutes.toFixed(2)} minutes. Timeout limit: ${timeoutMinutes} minutes. Marking as offline.`);
        
        await databases.updateDocument(
          buildingDatabaseID,
          sensorCollectionID,
          sensor.$id,
          {
            status: Status.OFF,
            time: currentTime
          }
        );

        await logAppwrite(`Sensor ${sensor.name} marked as offline due to inactivity (Type: ${sensor.deviceProfileID}, Timeout: ${timeoutMinutes} minutes)`);
      }
    }
  } catch (error) {
    console.error('Error checking sensor timeouts:', error);
    await logAppwrite(`Error checking sensor timeouts: ${error.message}`);
  }
}

async function triggerFireAlarmActions(buildingId) {
  console.log("Sending multicast message for fire alarm...");
  try {
    const url = `${chirpstackAPIURL}/multicast-groups/${buildingId}/queue`;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Grpc-Metadata-Authorization': `Bearer ${chirpstackToken}`,
    };

    const body = {
      queueItem: {
        confirmed: true,
        fPort: 210,
        data: chirpstackDownlinkSpeakerData
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    console.log('Multicast message sent successfully');
  } catch (error) {
    console.error('Error sending multicast message:', error);
    throw error;
  }
}

async function sendDownlinks(devices, payload) {
  const downlinkPromises = devices.map(devEUI => {
    console.log(`Sending downlink to device: ${devEUI}`);
    return sendDownlinkToChirpstack(devEUI, payload);
  });

  try {
    await Promise.all(downlinkPromises);
    console.log('Downlinks sent successfully to all devices.');
  } catch (error) {
    console.error('Failed to send downlinks to one or more devices:', error);
  }
}

async function sendDownlinkToChirpstack(devEUI, data, fPort = 210, confirmed = true) {
  const url = `${chirpstackAPIURL}/devices/${devEUI}/queue`;
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Grpc-Metadata-Authorization': `Bearer ${chirpstackToken}`,
  };

  const body = {
    queueItem: {
      confirmed,
      data,
      fPort,
    },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    console.log('Downlink sent successfully');
  } catch (error) {
    console.error('Error sending downlink:', error);
    throw error; // Re-throw to allow caller to handle if needed
  }
}

async function sendPushNotificationToUser(message, name, buildingId = null) {
  try {
    let query = [Query.limit(100000), Query.offset(0)];
    
    // If buildingId is provided, filter users by buildingId
    if (buildingId) {
      query.push(Query.equal('buildingId', buildingId));
    }
    
    const users = await databases.listDocuments(
      buildingDatabaseID,
      userCollectionID,
      query
    );

    const deviceTokens = users.documents
      .map((document) => document.deviceToken)
      .filter((token) => token !== null && token.trim() !== '');

    console.log('deviceTokens size: ' + deviceTokens.length);

    const currentDate = new Date();
    console.log('currentDate: ' + currentDate);

    console.log('Send Push Notification');
    const title = 'Cảnh báo cháy';
    await sendPushNotification({
      data: {
        title: title,
        body: message,
        "$id": "",
        "name": String(name),
        "time": "",
        "timeTurnOn": "",
        "battery":"",
        "type": "",
        "value": "",
        "status": "",
      },
      tokens: deviceTokens,
    });

    console.log('Successfully sent message');
  } catch (e) {
    console.error('Error sending push notification:', e);
    throw e;
  }
}

async function sendPushNotification(payload) {
  return await admin.messaging().sendEachForMulticast(payload);
}

async function logAppwrite(log) {
  try {
    await databases.createDocument(buildingDatabaseID, logCollectionId, ID.unique(), {
      log: log,
      time: new Date().toISOString(),
      type: "MQTT_AppWrite"
    });
  } catch (error) {
    console.log('Error logging:', error);
  }
}

// Export the functions needed by api.js
export { sendPushNotificationToUser, triggerFireAlarmActions, logAppwrite };
