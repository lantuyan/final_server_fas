import { Client, Databases, ID, Query } from 'node-appwrite';
import { config } from '../../config/config.js';

class AppwriteService {
  constructor() {
    this.client = new Client();
    this.client
      .setEndpoint(config.appwrite.url)
      .setProject(config.appwrite.projectId)
      .setKey(config.appwrite.apiKey);

    this.databases = new Databases(this.client);
  }

  async updateSensorData(devEUI, data) {
    return await this.databases.updateDocument(
      config.appwrite.buildingDatabaseId,
      config.appwrite.sensorCollectionId,
      devEUI,
      data
    );
  }

  async logEvent(log, type = "MQTT_AppWrite") {
    return await this.databases.createDocument(
      config.appwrite.buildingDatabaseId,
      config.appwrite.logCollectionId,
      ID.unique(),
      {
        log,
        time: new Date().toISOString(),
        type
      }
    );
  }

  async getSpeakerDevices() {
    const response = await this.databases.listDocuments(
      config.appwrite.buildingDatabaseId,
      config.appwrite.sensorCollectionId,
      [
        Query.equal('type', 'Speaker'),
        Query.limit(100000),
        Query.offset(0)
      ]
    );
    return response.documents.map(sensor => sensor.$id);
  }
}

export const appwriteService = new AppwriteService(); 