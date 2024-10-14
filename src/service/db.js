import mqtt from "mqtt"
import { AppwriteException, Client, Databases, ID , Query } from 'node-appwrite';
import { throwIfMissing, isMoreThan5MinutesAgo } from '../utils.js';
import dotenv from 'dotenv';
import admin from 'firebase-admin';

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
const buttonProfileID = process.env.BUTTON_PROFILE_ID;
const userCollectionID = process.env.USERS_COLLECTION_ID;
const notificationCollectionID = process.env.NOTIFICATION_COLLECTION_ID;


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
        var status = (temp.object.smoke_warning == 0) ? "on" : "fire";
        await databases.updateDocument(
          buildingDatabaseID,
          sensorCollectionID,
          temp.devEUI,
          {
            name: temp.deviceName.split('_')[0],
            time: currentDate,
            timeTurnOn: "",
            battery: temp.object.battery,
            type: temp.deviceProfileName,
            value: temp.object.temperature,
            humidity: 0,
            smoke: 0,
            temperature: temp.object.temperature,
            status: status,
            lastNotification: null
          }
        );
        if (status == "fire") {
          sendPushNotiWithUserData()
        }
        console.log('Document updated successfully: ', temp.devEUI, status);
      }

      if (temp.deviceProfileID == tempHumProfileID) {
        await databases.updateDocument(
          buildingDatabaseID,
          sensorCollectionID,
          temp.devEUI,
          {
            name: temp.deviceName.split('_')[0],
            time: currentDate,
            timeTurnOn: "",
            battery: temp.object.battery,
            type: temp.deviceProfileName,
            value: temp.object.temperature,
            humidity: temp.object.humidity,
            smoke: 0,
            temperature: temp.object.temperature,
            status: "on"
          }
        );
        console.log('Document updated successfully: ', temp.devEUI, "on");
      }

      if (temp.deviceProfileID == buttonProfileID) {
        var status = (temp.object.value == 0) ? "on" : "fire";
        await databases.updateDocument(
          buildingDatabaseID,
          sensorCollectionID,
          temp.devEUI,
          {
            name: temp.deviceName.split('_')[0],
            time: currentDate,
            timeTurnOn: "",
            battery: 0,
            type: temp.deviceProfileName,
            value: 0,
            humidity: 0,
            smoke: 0,
            temperature: 0,
            status: status
          }
        );
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

    log('deviceTokens size: ' + deviceTokens.length);
    
    const promise = await databases.listDocuments(
      buildingDatabaseID,
      sensorCollectionID,
      [Query.limit(100000), Query.offset(0)]
    );

    const currentDate = new Date();
    log('currentDate: ' + currentDate);
    
    promise.documents.forEach(async (item) => {
      const inputDate = new Date(item.lastNotification);
      const isValidTimeout = isMoreThan5MinutesAgo(item.lastNotification, currentDate);

      log('-------------- ' + item.name + ' --------------')
      log('lastNotification: ' + item.lastNotification);
      log('inputDate: ' + inputDate);
      log('isMoreThan5MinutesAgo: ' + isValidTimeout);

      if (item.status == Status.FIRE && isValidTimeout) {
        log('Send Push Notification');
        const body = 'Thiết bị ' +item.name +' đang ở mức độ cảnh báo cháy';
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

        log('Successfully sent message');

        await databases.createDocument(
          buildingDatabaseID,
          notificationCollectionID,
          ID.Unique(),
          {
            sensorID: item.$id,
            title: title,
            description: body,
            time: currentDate,
          }
        );
        
        log('Successfully create notification document');

      } else {
        log('Do nothing');
        return ;
      }
    });
  } catch (e) {
    error('Errors:' + e);
  }
}