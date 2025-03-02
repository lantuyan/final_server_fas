import mqtt from "mqtt"
import { v4 as uuidv4 } from 'uuid';
import { AppwriteException, Client, Databases, ID, Query } from 'node-appwrite';
import { throwIfMissing } from '../utils.js';
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
  'CHIRPSTACK_DOWNLINK_SPEAKER_DATA'
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
  var client_mqtt = mqtt.connect(mqtt_url)
  // let topicName = `application/90/device/+/event/up`
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

      if (temp.deviceProfileID == smokeProfileID) {
        var status;
        let smoke = temp.object.data.smoke_alarm
        let heat = temp.object.data.heat_alarm
        let battery = temp.object.data.batteryStatus == "Normal" ? 100 : 0
        let temperature = temp.object.data.temperature 
        if (smoke == "Danger" || heat == "Danger") {
          status = "fire";
        } else if (smoke == "Normal" || heat == "Normal") {
          status = "on";
        } else {
          status = "on";
        }
        if (status == "fire") {
          console.log("Fire detected by smoke sensor, sending notifications and downlinks");
          await sendPushNotificationToUser(temp.deviceName);
          await triggerFireAlarmActions();
        }
        console.log('Document updated successfully: ', temp.devEUI, status);

        await databases.updateDocument(
          buildingDatabaseID,
          sensorCollectionID,
          temp.devEUI,
          {
            name: temp.deviceName,
            time: currentDate,
            timeTurnOn: "",
            battery: battery,
            // type: temp.deviceProfileName,
            value: temperature,
            humidity: 0,
            smoke: 0,
            temperature: temperature,
            status: status,
            lastNotification: null
          }
        );
      }
      if (temp.deviceProfileID == buttonProfileID) {
        var status;
        let event = temp.object.data.sos_event
        if (event == "Danger") {
          status = "fire";
        } else if (event == "Safe") {
          status = "on";
        } else {
          status = "on";
        }
        if (status == "fire") {
          console.log("Fire detected by smoke sensor, sending notifications and downlinks");
          await sendPushNotificationToUser(temp.deviceName);
          await triggerFireAlarmActions();

          var caseTampered = temp.object.data.anti_tamper_status
          if (caseTampered == "Not tampered") {
          } else if (caseTampered == "Tampered") {
          }
        }

        await databases.updateDocument(
          buildingDatabaseID,
          sensorCollectionID,
          temp.devEUI,
          {
            name: temp.deviceName,
            time: currentDate,
            timeTurnOn: "",
            battery: 0,
            // type: "Bell-Button",
            value: 0,
            humidity: 0,
            smoke: 0,
            temperature: 0,
            status: status
          }
        );
        console.log('Document updated successfully: ', temp.devEUI, status);
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


 async function triggerFireAlarmActions() {
  console.log("Fetching Speaker devices from Appwrite...");
  let speakerDevices = [];
  try {
    const sensors = await databases.listDocuments(
      buildingDatabaseID,
      sensorCollectionID,
      [
        Query.equal('type', 'Speaker'),
        Query.limit(100000),
        Query.offset(0)
      ]
    );

    speakerDevices = sensors.documents.map(sensor => sensor.$id); // Assuming $id is devEUI
    console.log("Speaker devices fetched successfully:", speakerDevices);

  } catch (error) {
    console.error("Failed to fetch Speaker devices from Appwrite:", error);
    return; // Stop execution if devices cannot be fetched
  }


  console.log("Sending push notification to user and triggering downlinks...");
  // await sendPushNotiWithUserData();
  try {
    const payload = process.env.CHIRPSTACK_DOWNLINK_SPEAKER_DATA;
    // const devices = ['ffffff100004d057', 'ffffff100004d058', 'ffffff100004d059']; // Removed hardcoded devices
    await sendDownlinks(speakerDevices, payload); 
    // await sendDownlinksSequentially(speakerDevices, payload);
  } catch (downlinkError) {
    console.error('Failed to send downlinks:', downlinkError);
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

async function sendDownlinksSequentially(devices, payload) { // Renamed function to indicate sequential execution
  for (const devEUI of devices) {
    try {
      console.log(`Sending downlink to device: ${devEUI}`);
      await sendDownlinkToChirpstack(devEUI, payload);
      console.log(`Downlink sent successfully to device: ${devEUI}`); // Log success for each device
    } catch (error) {
      console.error(`Failed to send downlink to device: ${devEUI}`, error); // Log specific device failure
      // Decide on error handling: continue to next device or stop?
      // For now, continue to the next device and log errors.
    }
  }
  console.log('Downlinks sending process completed sequentially for all devices.'); // Indicate completion of the sequential process
}

async function sendDownlinkToChirpstack(devEUI, data, fPort = 210, confirmed = true) {
  const url = `${chirpstackAPIURL}/devices/${devEUI}/queue`;
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Grpc-Metadata-Authorization': `Bearer ${chirpstackToken}`,
  };

  const body = {
    deviceQueueItem: {
      confirmed,
      data,
      devEUI,
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

async function sendPushNotificationToUser(deviceName) {
  try {
    const users = await databases.listDocuments(
      buildingDatabaseID,
      userCollectionID,
      [Query.limit(100000), Query.offset(0)]
    );

    const deviceTokens = users.documents
      .map((document) => document.deviceToken)
      .filter((token) => token !== null && token.trim() !== '');

    console.log('deviceTokens size: ' + deviceTokens.length);

    const currentDate = new Date();
    console.log('currentDate: ' + currentDate);

    console.log('Send Push Notification');
    const body = 'Thiết bị ' + deviceName + ' đang ở mức độ cảnh báo cháy';
    const title = 'Cảnh báo cháy';
    await sendPushNotification({
      data: {
        title: title,
        body: body,
        "$id": "",
        "name": String(deviceName),
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
    // const uniqueID = uuidv4();

    // await databases.createDocument(
    //   buildingDatabaseID,
    //   notificationCollectionID,
    //   uniqueID,
    //   {
    //     sensorID: item.$id,
    //     title: title,
    //     description: body,
    //     time: currentDate,
    //     sensor: item.$id
    //   }
    // );
  } catch (e) {
    // error('Errors:' + e);
  }
}

async function sendPushNotiWithUserData() {
  try {
    const users = await databases.listDocuments(
      buildingDatabaseID,
      userCollectionID,
      [Query.limit(100000), Query.offset(0)]
    );

    const deviceTokens = users.documents
      .map((document) => document.deviceToken)
      .filter((token) => token !== null && token.trim() !== '');

    console.log('deviceTokens size: ' + deviceTokens.length);

    const promise = await databases.listDocuments(
      buildingDatabaseID,
      sensorCollectionID,
      [Query.limit(100000), Query.offset(0)]
    );

    const currentDate = new Date();
    console.log('currentDate: ' + currentDate);

    promise.documents.forEach(async (item) => {
      const inputDate = new Date(item.lastNotification);
      // const isValidTimeout = isMoreThan5MinutesAgo(item.lastNotification, currentDate);
      const isValidTimeout = true;


      console.log('-------------- ' + item.name + ' --------------')
      console.log('lastNotification: ' + item.lastNotification);
      console.log('inputDate: ' + inputDate);
      console.log('isMoreThan5MinutesAgo: ' + isValidTimeout);

      if (item.status == Status.FIRE && isValidTimeout) {
        console.log('Send Push Notification');
        const body = 'Thiết bị ' + item.name + ' đang ở mức độ cảnh báo cháy';
        const title = 'Cảnh báo cháy';
        await sendPushNotification({
          data: {
            title: title,
            body: body,
            "$id": String(item.$id),
            "name": String(item.name),
            "time": String(item.time),
            "timeTurnOn": String(item.timeTurnOn),
            "battery": String(item.battery),
            "type": String(item.type),
            "value": String(item.value),
            "status": String(item.status),
          },
          tokens: deviceTokens,
        });

        console.log('Successfully sent message');
        const uniqueID = uuidv4();

        await databases.createDocument(
          buildingDatabaseID,
          notificationCollectionID,
          uniqueID,
          {
            sensorID: item.$id,
            title: title,
            description: body,
            time: currentDate,
            sensor: item.$id
          }
        );

        console.log('Successfully create notification document');

      } else {
        console.log('Do nothing');
        return;
      }
    });
  } catch (e) {
    // error('Errors:' + e);
  }
}


async function sendPushNotification(payload) {
  return await admin.messaging().sendEachForMulticast(payload);
}

function isMoreThan5MinutesAgo(dateString, currentDate) {
  if (!dateString) {
    return true;
  }

  const inputDate = new Date(dateString);

  const timeDifference = currentDate - inputDate;
  const fiveMinutesInMilliseconds = 5 * 60 * 1000;

  // So sánh sự chênh lệch với 5 phút
  return timeDifference > fiveMinutesInMilliseconds;
}