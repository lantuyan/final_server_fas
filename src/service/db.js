import mqtt from "mqtt"
import { AppwriteException, Client, Databases, ID } from 'node-appwrite';
import { throwIfMissing } from '../utils.js';
import dotenv from 'dotenv';

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
  'TEMP_HUM_PROFILE_ID'
]);


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


const mqtt_url = process.env.MQTT_URL;

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
        // if (status == "fire") {
        //   await databases.updateDocument(
        //     buildingDatabaseID,
        //     sensorCollectionID,
        //     temp.devEUI,
        //     {
        //       lastNotification: currentDate,
        //     }
        //   );
        // }
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