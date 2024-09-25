import express from "express";
import { dBService } from "./src/service/index.js";


const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
// deleteDup()
dBService.saveData()
const port = process.env.PORT || 8888
const listening = app.listen(port, () => {
    console.log(`Server is running on port ${listening.address().port}`)
})